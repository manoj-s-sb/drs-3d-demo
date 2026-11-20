import yaml from "js-yaml";
import { store } from "../store/store";
import {
  startDrs,
  setDrsVirtualCamera,
  setDrsPhase,
  setDrsVideoFrames,
  setDrsMarkerPositions,
  setDrsDecisions,
  setDrsOperatorInput,
  setDrsSelectedDecision,
  setDrsNoBall,
  setDrsWithVideo,
  setDrsPendingViewAngle,
  setDrsCamera,
  setDrsCameras,
  setDrsReviewPlan,
  endDrs,
} from "../store/slices/drsSlice";
import { stopAnimation } from "../store/slices/animationSlice";
import { gateFromDecision, resolveReviewPlan } from "./reviewRules";
import {
  setSessionType,
  setVideoUrl,
  setTrajectoryUrl,
  setUpdateSession,
  resetDrsMedia,
} from "../store/slices/sessionSlice";
import { DELIVERY_FILE, cacheBust } from "../dataSource";
import { setCurrentShow } from "../store/slices/broadcastSlice";
import {
  parseProjectionMatrix,
  decomposeProjection,
  buildVirtualCamera,
  composeTransforms,
} from "../utils/calibration";
import { STOP_AFTER_IMPACT_FRAMES } from "./drsConfig";

function normalizeBaseUrl(p) {
  if (!p) return "/";
  let s = String(p).trim();
  if (!s.endsWith("/")) s += "/";
  return s;
}

// The physical camera the operator picks is a numeric INDEX. Because the data
// is index-keyed, that index selects everything directly: video "<i>.mp4",
// calibration "<i>_camera_calibration.yaml" / "P_<i>.npy", and the
// "<i>_transform" entry in ball_coords.json.

// Same cm→m scale the trajectory renderer uses (BowlingTrajectory's `scale`
// prop defaults to 0.01).
const TRAJ_SCALE = 0.01;

function parseTrajPoint(raw) {
  let arr = raw;
  if (typeof raw === "string") {
    arr = raw
      .replace("[", "")
      .replace("]", "")
      .split(",")
      .map(Number);
  }
  if (!Array.isArray(arr) || arr.length < 4) return null;
  return {
    frame: arr[0] | 0,
    x: arr[1] * TRAJ_SCALE,
    y: arr[2] * TRAJ_SCALE,
    z: arr[3] * TRAJ_SCALE,
  };
}

function computeMarkerPositions(trajectoryData) {
  const b = trajectoryData?.balls?.[0];
  if (!b) return { pitching: null, impact: null };
  const pitchRaw = b.pitchingCoordinates?.[0];
  const pitch = pitchRaw ? parseTrajPoint(pitchRaw) : null;
  let impact = null;
  if (Array.isArray(b.trajectory) && b.impactFrame != null) {
    for (const raw of b.trajectory) {
      const pt = parseTrajPoint(raw);
      if (pt && pt.frame === b.impactFrame) {
        impact = pt;
        break;
      }
    }
    // Fallback: last pre-impact trajectory point.
    if (!impact) {
      for (let i = b.trajectory.length - 1; i >= 0; i--) {
        const pt = parseTrajPoint(b.trajectory[i]);
        if (pt && pt.frame <= b.impactFrame) {
          impact = pt;
          break;
        }
      }
    }
  }
  const toPos = (p) => (p ? { x: p.x, y: p.y, z: p.z } : null);
  return { pitching: toPos(pitch), impact: toPos(impact) };
}

// Vite's dev server returns index.html (200 OK) for unknown paths, so a raw
// HTTP status check isn't enough — sniff the Content-Type and treat HTML as a
// miss when we're fetching yaml/npy/json.
async function fetchOrFallback(primary, fallback) {
  try {
    const r = await fetch(primary);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const ct = (r.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("text/html")) {
      throw new Error("got HTML (likely SPA fallback miss)");
    }
    return r;
  } catch (err) {
    if (!fallback) throw err;
    const r = await fetch(fallback);
    if (!r.ok) throw new Error(`HTTP ${r.status} (fallback)`);
    const ct = (r.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("text/html")) {
      throw new Error("fallback also returned HTML");
    }
    return r;
  }
}

export async function drsReplay(
  folderUrl,
  { noBall = false, viewAngle = null, camera = 0, withVideo = true } = {},
) {
  const { drs: drsState } = store.getState();
  // Stop the idle ground-camera. The idle now HOLDS the camera at a fixed pose every frame
  // while it's "playing" — if it isn't stopped it overrides the DRS calibrated camera each
  // frame, leaving the trajectory/review viewed from the idle pose (black/stadium). Every
  // DRS entry (operator, big screen, socket) goes through drsReplay, so stopping it here
  // covers all paths.
  store.dispatch(stopAnimation("groundCamera"));
  // Any in-flight replay is torn down so a new call restarts from scratch.
  if (drsState.active) {
    store.dispatch(endDrs());
  }
  // Clear the video↔trajectory media pipeline so a re-run (e.g. the "0" reset
  // pressed mid-trajectory) starts clean. endDrs() only resets the drs slice;
  // without this the session slice keeps stale URLs + completion flags that
  // leave the old trajectory tube running with no video (black screen). The
  // network awaits below guarantee a render happens before drsSubmitOperatorInput
  // sets the URLs again, so the same-URL values still re-trigger the effects.
  store.dispatch(resetDrsMedia());

  const base = normalizeBaseUrl(folderUrl);
  // Physical camera feed as a numeric INDEX (0, 1, …): drives which video
  // (index.mp4), calibration, projection matrix and ball transform are used.
  // Guard against stale/legacy values (e.g. a persisted "left") → default 0.
  const camNum = Number(camera);
  const camIndex = String(Number.isInteger(camNum) && camNum >= 0 ? camNum : 0);

  console.log("[drs] replay →", {
    folder: base,
    camera: camIndex,
    noBall,
    viewAngle,
  });

  // videoReplay drives the media pipeline: true → play the video then hand to the 3D;
  // false (operator turned the overlay off) → skip the video, the 3D trajectory activates
  // immediately (setVideoUrl marks it complete → setTrajectoryUrl plays at once).
  store.dispatch(setUpdateSession({ videoReplay: withVideo }));
  store.dispatch(setSessionType("BOWLING_SESSION"));
  store.dispatch(startDrs(base));
  // No-ball check reuses this replay but hides the OUT/NOT-OUT panels.
  store.dispatch(setDrsNoBall(noBall));
  // Video overlay on/off (operator toggle) — sync it on THIS store so the operator preview
  // AND the big screen (which replays the same command) honour the same choice.
  store.dispatch(setDrsWithVideo(withVideo));
  // Operator-selected camera angle, applied when the replay reaches review.
  store.dispatch(setDrsPendingViewAngle(viewAngle));
  // Remember the chosen feed so drsSubmitOperatorInput loads the matching video.
  store.dispatch(setDrsCamera(camIndex));

  try {
    // ball_coords first — it names the cameras (left, right, …) that map to the
    // numeric video indices, so the calibration for the picked index loads next.
    const coordsRes = await fetch(cacheBust(base + "ball_coords.json"));
    if (!coordsRes.ok) {
      throw new Error(`ball_coords.json: HTTP ${coordsRes.status}`);
    }
    const ballCoords = await coordsRes.json();
    // Keys are index-based ("<index>_transform" / "<index>_camera_calibration"),
    // so the camera name IS the selected video index — correct for any index,
    // sequential or not (0.mp4 + 2.mp4, only 1.mp4, …).
    const name = camIndex;

    // Publish the available cameras (from ball_coords) so number-key switching
    // is bounded to what this ball actually ships.
    const availableCameras = Object.keys(ballCoords)
      .filter((k) => k.endsWith("_transform"))
      .map((k) => k.slice(0, -"_transform".length));
    store.dispatch(setDrsCameras(availableCameras));

    // Calibration is ALWAYS loaded from the app's single bundled source
    // `public/camera_config/<cam>_camera_calibration.yaml` + `P_<cam>.npy`, selected by the
    // chosen camera index — for BOTH sample (local) AND machine (server) modes. The machine's
    // per-ball camera_config on the IP is intentionally NOT used; the public folder is the one
    // source of truth. Drop in more files (e.g. 4_/5_/6_ + P_4/5/6) to support more cameras —
    // the path is index-driven, so no code change is needed.
    const yamlUrl = `/camera_config/${name}_camera_calibration.yaml`;
    const npyUrl = `/camera_config/P_${name}.npy`;
    console.log("[drs] camera", name, "→ fetching (public)", { yamlUrl, npyUrl });

    const yamlRes = await fetchOrFallback(cacheBust(yamlUrl));
    const npyRes = await fetchOrFallback(cacheBust(npyUrl));
    console.log("[drs] calibration loaded from", {
      calibration: yamlRes.url,
      projection: npyRes.url,
    });

    const trajRes = await fetch(cacheBust(base + DELIVERY_FILE));
    if (!trajRes.ok) {
      throw new Error(`${DELIVERY_FILE}: HTTP ${trajRes.status}`);
    }

    const [yamlText, npyBuf, trajData] = await Promise.all([
      yamlRes.text(),
      npyRes.arrayBuffer(),
      trajRes.json(),
    ]);

    const yamlData = yaml.load(yamlText);
    const K = yamlData.camera_matrix;
    const imageSize = yamlData.image_size;
    console.log("[drs] intrinsics", { imageSize, cameraMatrix: K });
    const P = parseProjectionMatrix(npyBuf);
    const { C, R } = decomposeProjection(P, K);
    const transform = ballCoords[`${name}_transform`];
    console.log("[drs] transform", name, transform);
    if (!transform) {
      console.warn(
        `[drs] no "${name}_transform" in ball_coords.json — the ${name} ` +
          `camera overlay will be misaligned`,
      );
    }
    // The video hands off to the 3D scene at impact + STOP_AFTER_IMPACT_FRAMES.
    // Fold that frame's camera-shake correction (cameras.<i>.transforms, the
    // same per-frame data the triangulator removes) into the calib offset so
    // the overlay matches the frame actually on screen.
    const shakeByFrame = ballCoords.cameras?.[name]?.transforms;
    const handoffFrame =
      ballCoords.impact_frame != null
        ? ballCoords.impact_frame + (STOP_AFTER_IMPACT_FRAMES ?? 0)
        : null;
    const shake = nearestFrameTransform(shakeByFrame, handoffFrame);
    const cam = buildVirtualCamera(
      C,
      R,
      K,
      imageSize,
      composeTransforms(transform, shake),
    );
    store.dispatch(setDrsVirtualCamera(cam));
    // Video source + start frame:
    //   1) PREFER the per-camera TRIMMED clip (cameras.<name>.trimmedClip.file, e.g.
    //      "1_trimmed.mp4"). The clip is ALREADY cut to the delivery, so it plays
    //      from frame 0 — NO release/bowling offset. pitching/impact are re-based to
    //      the clip timeline (−fromFrame) so the freeze/stop still lands correctly.
    //   2) FALLBACK (no trimmed clip): the full "<index>.mp4", starting at
    //      bowling_frame (null → frame 0). Original frame numbers.
    const trimmed = ballCoords.cameras?.[name]?.trimmedClip;
    let videoFile = `${name}.mp4`;
    let startFrame = ballCoords.bowling_frame ?? null;
    let pitchFrame = ballCoords.pitching_frame ?? null;
    let impactFrame = ballCoords.impact_frame ?? null;
    if (trimmed?.file) {
      const from = trimmed.fromFrame ?? 0;
      videoFile = trimmed.file;
      startFrame = 0; // trimmed clip plays from its start — no offset
      pitchFrame = pitchFrame != null ? pitchFrame - from : null;
      impactFrame = impactFrame != null ? impactFrame - from : null;
    }
    const videoFrames = {
      pitching: pitchFrame,
      impact: impactFrame,
      start: startFrame,
      file: videoFile, // resolved video filename (trimmed or full) — used by play
    };
    console.log("[drs] video frames", { ...videoFrames, trimmed: !!trimmed?.file });
    store.dispatch(setDrsVideoFrames(videoFrames));
    const markerPositions = computeMarkerPositions(trajData);
    console.log("[drs] marker positions", markerPositions);
    // ── PITCH ALIGNMENT DEBUG ──────────────────────────────────────────────
    // Compare the two independent "pitch" sources so we can see if they agree:
    //   • video freeze  = ball_coords.json → pitching_frame
    //   • white marker  = trajectory_data.json → pitchingCoordinates[0] (+ its frame)
    // If the two frames differ, the frozen video ball and the 3D dot won't line up.
    {
      const b0 = trajData?.balls?.[0];
      const allPitchCoords = (b0?.pitchingCoordinates ?? []).map((raw) => {
        const p = parseTrajPoint(raw);
        return p ? { frame: p.frame, x: p.x, y: p.y, z: p.z } : raw;
      });
      const chosen = allPitchCoords[0] ?? null;
      console.log("[drs] PITCH-ALIGN", {
        videoFreeze_pitching_frame: ballCoords.pitching_frame ?? null, // ball_coords
        marker_pitchingCoordinates_0: chosen, // trajectory_data [0]
        marker_frame: chosen?.frame ?? null,
        frames_match:
          ballCoords.pitching_frame != null &&
          chosen?.frame != null &&
          ballCoords.pitching_frame === chosen.frame,
        all_pitchingCoordinates: allPitchCoords, // every candidate (frames may be unsorted)
      });
    }
    store.dispatch(setDrsMarkerPositions(markerPositions));

    const decisions = trajData?.balls?.[0]?.ballMeta?.decisions ?? null;
    console.log("[drs] decisions", decisions);
    store.dispatch(setDrsDecisions(decisions));

    // Pause the replay here — the operator picks the three booleans in the
    // DrsOperatorInputDialog and submit triggers drsSubmitOperatorInput, which
    // advances the phase to "video" and dispatches the media URLs.
    console.log("[drs] assets ready → phase 'operatorInput'");
    store.dispatch(setDrsPhase("operatorInput"));
  } catch (err) {
    console.error("[drs] failed to load replay assets:", { folder: base, camera: camIndex, error: err });
    store.dispatch(endDrs());
  }
}

// Per-frame shake map keyed by frame number (as strings); returns the entry at
// `frame`, else the nearest earlier one, else null.
function nearestFrameTransform(byFrame, frame) {
  if (!byFrame || frame == null) return null;
  if (byFrame[frame]) return byFrame[frame];
  let best = null;
  let bestFrame = -Infinity;
  for (const k of Object.keys(byFrame)) {
    const f = Number(k);
    if (f <= frame && f > bestFrame) {
      bestFrame = f;
      best = byFrame[k];
    }
  }
  return best;
}

// Decision table keys are a 3-char binary string:
//   [0] = softSignal         (0 = false, 1 = true)
//   [1] = originalDecision   (0 = NOT_OUT, 1 = OUT)
//   [2] = isRightHanded      (0 = false, 1 = true)
function decisionKey({ originalDecision, isRightHanded, softSignal }) {
  const s = softSignal ? "1" : "0";
  const o = originalDecision === "OUT" ? "1" : "0";
  const h = isRightHanded ? "1" : "0";
  return s + o + h;
}

export function drsSubmitOperatorInput(input) {
  const { drs } = store.getState();
  if (!drs.active || drs.phase !== "operatorInput") return;

  const key = decisionKey(input);
  const decision = drs.decisions?.[key] ?? null;
  console.log("[drs] operator input", input, "→ key", key, "→ decision", decision);
  if (!decision) {
    console.warn(`[drs] no decision row found for key ${key}`);
  }

  store.dispatch(setDrsOperatorInput(input));

  // Full toss: the operator can override the Final Decision (height is the
  // umpire's call), so patch it onto the selected decision row for the panel.
  let selectedDecision = decision;
  if (input.finalDecision) {
    selectedDecision = { ...(decision || {}), finalDecision: input.finalDecision };
  }
  store.dispatch(setDrsSelectedDecision(selectedDecision));

  // Resolve the rule-driven review plan (trajectory / camera / markers / panels)
  // from the ball's gate values. Full toss = no pitching value on the decision.
  // No-ball checks don't run the LBW overlay, so skip the plan there.
  if ((decision || input.panels) && !drs.noBall) {
    // Full toss = no pitching point: null / "NA" / a dash ("-", "–", "—").
    const pv = decision?.pitching;
    const fullToss = !pv || pv === "NA" || /^[\s\-–—]+$/.test(String(pv));
    const gate = gateFromDecision(decision || {}, { fullToss });
    let plan = resolveReviewPlan(gate);
    // Operator override (full toss): show only the panels the operator ticked,
    // placed into the standard left/right buckets.
    if (Array.isArray(input.panels)) {
      const LEFT = ["pitching", "impact", "wickets", "height"];
      const RIGHT = ["originalDecision", "finalDecision", "playerReview"];
      const sel = new Set(input.panels);
      plan = {
        ...plan,
        panelsLeft: LEFT.filter((p) => sel.has(p)),
        panelsRight: RIGHT.filter((p) => sel.has(p)),
      };
    }
    console.log("[drs] review plan", gate, "→", plan.ruleId, plan);
    store.dispatch(setDrsReviewPlan(plan));
  } else {
    store.dispatch(setDrsReviewPlan(null));
  }

  const base = drs.folderUrl;
  const camIndex = String(drs.camera ?? 0);
  // Record this DRS as the current show so "Send to Big Screen" can replay it
  // (with the operator's decision + camera baked in, no input dialog there).
  store.dispatch(
    setCurrentShow({
      kind: "drs",
      folderUrl: base,
      operatorInput: input,
      noBall: drs.noBall,
      camera: camIndex,
    }),
  );
  // Move phase to "video" BEFORE dispatching the video URL so that the
  // DrsVideoLayer renders its <video> element on its first mount (otherwise
  // its mount-effect attaches to a null ref and never re-fires).
  store.dispatch(setDrsPhase("video"));
  // Per-camera video: the resolved file from the assets loader — the TRIMMED clip
  // (e.g. "1_trimmed.mp4") when present, else the full "<index>.mp4".
  const videoFile = drs.videoFrames?.file || `${camIndex}.mp4`;
  const videoUrl = base + videoFile;
  const trajectoryUrl = base + DELIVERY_FILE;
  console.log("[drs] play → phase 'video'", { videoUrl, trajectoryUrl, camera: camIndex });
  store.dispatch(setVideoUrl(videoUrl));
  store.dispatch(setTrajectoryUrl(trajectoryUrl));
}
