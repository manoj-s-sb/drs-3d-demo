import * as THREE from "three";
import { getConfig } from "../../drs/drsConfig";
import { REVIEW_ANIMATIONS, REVIEW_TRANSITION } from "../../drs/reviewAnimations";

// Shared review-angle camera tween math, used by both the DRS review
// (DrsCameraSequence) and the multi-ball review (MultiCameraAngles). Pure
// functions only — no React/redux — so both consumers animate identically.

// ── 3-phase cinematic transition (keys 1-5) ─────────────────────────────────
// Every review-angle key runs the same shot: zoom out → swing to the right →
// slow close-in on the stumps, with each phase SLOWER than the last.
export const CINE_DUR = 8; // total seconds for the whole move (slower overall)
export const FINAL_FOV = 45; // framing FOV the shot settles on
export const WIDE_FOV = 30; // FOV while zoomed out (phase 1) — gentler zoom-out
export const ZOOM_UP = -0.6; // height change at the zoom-out waypoint (negative = dips DOWN, no rise)
export const ZOOM_BACK = 1.0; // extra pull-back distance at the zoom-out waypoint
export const SIDE_X = 3.0; // rightward (off-side, +X) offset of the side waypoint
export const SIDE_Y = 1.2; // height of the side waypoint — kept low so the camera doesn't climb

export const smoothstep = (t) => t * t * (3 - 2 * t);

// Piecewise-linear SPEED profile along the path → progress `u` over normalized
// time `t`. Three phases, each slower than the one before:
//   phase 1 [0 .. t1]   steady speed  → the "normal" zoom-out
//   phase 2 [t1 .. t2]  gradually slower → the swing to the right
//   phase 3 [t2 .. 1]   slowest, easing to a near-stop → the close-in
// Speeds are relative; the profile is normalized so the camera arrives exactly
// at the target (u = 1) at t = 1. Velocity is continuous at every junction, so
// there are no jerks or pauses between phases.
export const PH = {
  t1: 0.28, // end of phase 1 (fraction of total time)
  t2: 0.60, // end of phase 2 — phase 3 now gets the biggest time window
  v0: 1.0, // phase-1 speed (steady)
  vm: 0.28, // slower side swing (phase 2) into the phase-3 boundary
  ve: 0.015, // very slow final settle at the stumps (near-freeze)
};

// Path fraction covered by the end of each phase (before normalization).
const _a1 = PH.v0 * PH.t1;
const _a2 = _a1 + ((PH.v0 + PH.vm) / 2) * (PH.t2 - PH.t1);
const _a3 = _a2 + ((PH.vm + PH.ve) / 2) * (1 - PH.t2);

export function phasedEase(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  let u;
  if (t < PH.t1) {
    u = PH.v0 * t;
  } else if (t < PH.t2) {
    const s = t - PH.t1;
    const v = PH.v0 + (PH.vm - PH.v0) * (s / (PH.t2 - PH.t1)); // ramp v0 → vm
    u = _a1 + ((PH.v0 + v) / 2) * s; // area under a linear speed segment
  } else {
    const s = t - PH.t2;
    const v = PH.vm + (PH.ve - PH.vm) * (s / (1 - PH.t2)); // ramp vm → ve
    u = _a2 + ((PH.vm + v) / 2) * s;
  }
  return u / _a3;
}

// Two cubic Hermite segments glued at `t1` with non-zero junction velocity
// `vMid`. Kept for any legacy caller that still asks for "doubleEase".
export function doubleEase(t, t1, uSide, vMid) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  if (t < t1) {
    const s = t / t1;
    const s2 = s * s;
    const s3 = s2 * s;
    const m1 = vMid * t1;
    return uSide * (3 * s2 - 2 * s3) + m1 * (s3 - s2);
  }
  const s = (t - t1) / (1 - t1);
  const s2 = s * s;
  const s3 = s2 * s;
  const m0 = vMid * (1 - t1);
  return (
    uSide * (2 * s3 - 3 * s2 + 1) +
    m0 * (s3 - 2 * s2 + s) +
    (-2 * s3 + 3 * s2)
  );
}

// Straight line for a 2-point path; centripetal Catmull-Rom for 3+ so the
// curve passes smoothly through every waypoint without a corner.
export function buildCurve(points) {
  if (points.length === 2) {
    return new THREE.LineCurve3(points[0], points[1]);
  }
  return new THREE.CatmullRomCurve3(points, false, "centripetal", 0.5);
}

// Waypoint positions. Stumps are at the world origin with +Z toward the
// bowler, so "behind" is behind the batsman's stumps and "front" is the
// bowler's end.
export const POS_SIDE = new THREE.Vector3(2, 0.75, 0);
export const POS_BEHIND = new THREE.Vector3(0, 0.75, -2);
export const POS_FRONT = new THREE.Vector3(0, 0.75, 4);

// Build a tween descriptor from the current camera pose to the chosen review
// angle, framing `ballPos` (DRS: the ball's resting spot; multi: the stumps).
// Every angle uses the same 3-phase cinematic path.
export function buildTween(angle, camera, ballPos, opts = {}) {
  const startPos = camera.position.clone();
  const startUp = camera.up.clone();
  const startFov = camera.fov;
  const rightHanded = opts.rightHanded ?? true; // batsman handedness (default RHB)
  // Resolve a config value that may be handedness-specific: { right, left } → pick by
  // the batsman's hand. Anything else passes through unchanged. Lets look/target shift
  // for LHB vs RHB (e.g. the outside-leg centre offset).
  const hand = (v) =>
    v && typeof v === "object" && ("right" in v || "left" in v)
      ? rightHanded
        ? v.right
        : v.left
      : v;

  // Config-driven DIRECT moves (see src/drs/reviewAnimations.js). A clean, short,
  // smoothly-eased glide straight to the configured target — NO swoop-back and NO
  // zoom-out. Two things kill the "swoop":
  //   1) CAP the travel: the review starts at the far broadcast camera (tens of
  //      metres away); flying that whole distance looks like a swoop. So we start
  //      the glide from a point at most `maxTravel` m out along the line to the
  //      target — the visible move is always short.
  //   2) HOLD the FOV constant at the target zoom (no widening → no zoom-out).
  // opts.angles lets a view supply its OWN per-angle config (same shape as
  // REVIEW_ANIMATIONS). The Bowling Analysis passes BOWLING_ANALYSIS.reviewAngles so
  // its keys can be tuned without touching the DRS review. DRS omits it → DRS config.
  const cfg = (opts.angles ?? REVIEW_ANIMATIONS)[angle];
  if (cfg && cfg.mode === "direct") {
    // Resolve an axis value: "ball" → the ball's coord; a { right, left } object → the
    // handedness pick; otherwise the literal number.
    const axis = (v, ballV) => {
      const hv = hand(v);
      return hv === "ball" ? ballV : hv;
    };
    const targetPos = new THREE.Vector3(
      axis(cfg.target.x, ballPos.x),
      axis(cfg.target.y, ballPos.y),
      axis(cfg.target.z, ballPos.z),
    );
    const fov = cfg.fov ?? FINAL_FOV;
    const endUp = cfg.up || [0, 1, 0];
    // What the camera looks at. Defaults to the ball; `look` can override any axis
    // (e.g. top view looks at the pitch centreline x=0 so the stumps sit centred).
    const lookAt = cfg.look
      ? new THREE.Vector3(
          axis(cfg.look.x, ballPos.x),
          axis(cfg.look.y, ballPos.y),
          axis(cfg.look.z, ballPos.z),
        )
      : ballPos.clone();

    // ── path: choreographed multi-waypoint fly-through ────────────────────────
    // The camera passes smoothly through each waypoint in order (centripetal
    // Catmull-Rom → no corners), keeping the ball framed. Constant FOV → no zoom-out.
    // When `fromCurrent` is set, the ONLY difference is the path BEGINS at the
    // camera's current pose (where it stopped after the video / 3D) instead of a
    // fixed first waypoint — the rest of the move is identical.
    if (cfg.path) {
      const pts = cfg.path.map(
        (p) =>
          new THREE.Vector3(
            axis(p.x, ballPos.x),
            axis(p.y, ballPos.y),
            axis(p.z, ballPos.z),
          ),
      );
      if (cfg.fromCurrent) pts.unshift(startPos.clone()); // begin where it stopped
      return {
        cinematic: false, // smoothstep ease over the whole path
        curve: new THREE.CatmullRomCurve3(pts, false, "centripetal", 0.5),
        startUp: new THREE.Vector3(...endUp),
        targetUp: new THREE.Vector3(...endUp),
        // Hold the framing fov CONSTANT for the whole move (no gradual zoom-out; the
        // 3D stops on a narrow telephoto fov, so easing to it would over-zoom).
        startFov: fov,
        targetFov: fov,
        duration: cfg.duration ?? 2,
        ballPos: lookAt,
      };
    }

    // ── fromCurrent: CONTINUOUS transition from wherever the camera stopped ────
    // Start EXACTLY at the camera's current pose (after the video / 3D) and glide to
    // the target, interpolating BOTH position AND the lookAt point:
    //   • position: current pose → target (straight line, smooth ease)
    //   • lookAt:   whatever the camera is currently aiming at → `lookAt` (the stump)
    // FOV is HELD at the STOPPED value (the calibrated telephoto). This is the ONLY
    // way to fully kill the zoom-out: the broadcast camera is physically far with a
    // narrow fov, so setting a wide fov (45) at that far spot makes everything look
    // tiny = zoom-out. Holding the stopped fov means frame 0 looks identical to the
    // stopped view — pure dolly/pan, no zoom. The stop DISTANCE is computed from that
    // fov so the stump is framed consistently (not over-zoomed) however telephoto the
    // stopped camera was. `frameFill` = fraction of the vertical view the stump fills.
    if (cfg.fromCurrent) {
      // Begin at the stopped pose and dolly/pan to the view. FOV is HELD at the
      // stopped value → NO zoom (in or out) at all. The stop DISTANCE is computed from
      // that fov so the subject is framed consistently no matter how telephoto the
      // stopped camera was. `frameFill` = fraction of the vertical view it fills.
      //
      // opts.reviewFov: the DRS review OMITS this → settleFov == the stopped
      // telephoto fov → identical behaviour (no zoom). Views that DON'T start on a
      // telephoto camera (e.g. the Bowling Analysis multi view, which plays at a wide
      // ~50° fov) pass a telephoto reviewFov so the shot eases to the SAME broadcast
      // look as DRS instead of staying wide (which reads as "zoomed out"). After the
      // first move the camera already sits at reviewFov, so later keys hold it → no
      // further zoom, exactly like DRS.
      const settleFov = cfg.fov ?? opts.reviewFov ?? startFov; // per-key fov wins, else shared reviewFov
      const holdFov = settleFov; // distance is framed for the settle fov
      const subj = cfg.frameSubject ?? cfg.stumpHeight ?? 0.71;
      const fill = cfg.frameFill ?? 0.5;
      // opts.reviewDist: FIXED distance for EVERY angle (used by the multi view).
      // DRS omits it → each angle frames by its own frameFill, so switching angles
      // re-zooms (top fills the frame, side frames a small stump). That per-angle
      // zoom is exactly the "zoom out" on a key switch. A single fixed distance +
      // fov means every key sits the same distance from the subject → switching
      // only changes the viewpoint, never the zoom.
      // cfg.dist = per-angle distance override (e.g. push key 4 a little back)
      // without changing the others; else the view's shared reviewDist; else the
      // DRS per-angle frameFill distance.
      const d =
        cfg.dist != null
          ? cfg.dist
          : opts.reviewDist != null
            ? opts.reviewDist
            : subj / fill / (2 * Math.tan((holdFov * Math.PI) / 180 / 2));

      let endPos;
      if (cfg.overhead) {
        // TOP: straight above the look point.
        endPos = new THREE.Vector3(lookAt.x, lookAt.y + d, lookAt.z);
      } else {
        // SIDE / BEHIND: horizontal offset toward the configured target direction;
        // eye height fixed at target.y so the view stays level.
        const hDir = new THREE.Vector3(
          targetPos.x - lookAt.x,
          0,
          targetPos.z - lookAt.z,
        );
        if (hDir.lengthSq() < 1e-6) hDir.set(1, 0, 0);
        hDir.normalize();
        endPos = new THREE.Vector3(
          lookAt.x + hDir.x * d,
          targetPos.y,
          lookAt.z + hDir.z * d,
        );
      }

      // Path: straight dolly by default. But if the straight line would pass THROUGH
      // the look point (e.g. behind-the-stumps, when the stopped camera is on the far
      // side), the camera would flip ~180° as it crosses the subject. `arc` avoids that
      // by swinging AROUND: a curved path that bulges out to the side + up, so the
      // rotation onto the subject is gradual — no zoom, just curved so it never crosses
      // the look point.
      let curve;
      // Already essentially at the target (e.g. pressing the SAME key again)? Don't
      // arc — the arc's mid bulge would swing the camera out and back even though it's
      // not moving. A straight (near-zero) line = no visible movement.
      const alreadyThere =
        startPos.distanceTo(endPos) < REVIEW_TRANSITION.sameViewDistance;
      if (cfg.arc && !alreadyThere) {
        const mid = startPos.clone().add(endPos).multiplyScalar(0.5);
        const flat = new THREE.Vector3(
          endPos.x - startPos.x,
          0,
          endPos.z - startPos.z,
        );
        let perp = new THREE.Vector3(-flat.z, 0, flat.x);
        if (perp.lengthSq() < 1e-6) perp.set(1, 0, 0);
        perp.normalize();
        if (perp.x < 0) perp.multiplyScalar(-1); // always swing to the off side (+X)
        const span = startPos.distanceTo(endPos);
        // The multi view (reviewDist set) runs at small distances, so the DRS
        // ABSOLUTE arc (side 30 m, up 8 m) would be a giant hop. Use bulges
        // proportional to the move span there; DRS keeps its tuned absolutes.
        const proportional = opts.reviewDist != null;
        // The sideways swing is ONLY needed when the BEHIND view (−Z, key 3) is part of
        // the move — going to/from behind crosses the stumps, so it must swing around
        // (else the camera drives straight THROUGH the stumps and flips 180° — the
        // 3↔4 flip). Top↔front never cross the stumps → zero the side so there's no
        // right drift. (angle = destination; startPos.z −Z = came FROM behind.) The
        // "came from behind" threshold is scaled for the multi view — its behind pose
        // sits only ~reviewDist out, far short of the DRS −8 m broadcast distance.
        const behindThresh = proportional
          ? -Math.max(opts.reviewDist * 0.5, 0.5)
          : REVIEW_TRANSITION.behindZThreshold;
        const behindInvolved = angle === "behind" || startPos.z < behindThresh;
        const sideAmt = behindInvolved
          ? proportional
            ? span * 0.3
            : cfg.arc.side ?? span * 0.35
          : 0;
        mid.add(perp.multiplyScalar(sideAmt));
        mid.y += proportional ? span * 0.12 : cfg.arc.up ?? 3;
        curve = new THREE.CatmullRomCurve3(
          [startPos, mid, endPos],
          false,
          "centripetal",
          0.5,
        );
      } else {
        curve = new THREE.LineCurve3(startPos, endPos);
      }

      const fwd = new THREE.Vector3();
      camera.getWorldDirection(fwd); // the camera's CURRENT aim direction
      const dist = Math.max(startPos.distanceTo(lookAt), 0.001);
      const lookFrom = startPos.clone().add(fwd.multiplyScalar(dist));
      return {
        cinematic: false,
        curve,
        interpLook: true,
        lookFrom, // current aim point
        lookTo: lookAt.clone(), // the subject (stump / pitch centre)
        startUp: startUp.clone(), // current up → target up (no roll snap)
        targetUp: new THREE.Vector3(...endUp),
        // Ease fov current → settle. DRS: settleFov == startFov → constant (no zoom).
        // Multi: wide playback fov → telephoto reviewFov once, then held on later keys.
        startFov,
        targetFov: settleFov,
        duration: cfg.duration ?? 1.6,
        ballPos: lookAt,
      };
    }

    let fromPos;
    if (cfg.from) {
      // EXPLICIT start point (e.g. the bowler's end). Any axis may be "ball".
      fromPos = new THREE.Vector3(
        axis(cfg.from.x, ballPos.x),
        axis(cfg.from.y, ballPos.y),
        axis(cfg.from.z, ballPos.z),
      );
    } else if (cfg.fromAbove != null) {
      // PURE VERTICAL move: start directly above the target and descend straight
      // down. The camera stays above the look point the whole time, so the view
      // does NOT rotate/swing — it just lifts to top-and-centre.
      fromPos = new THREE.Vector3(
        targetPos.x,
        targetPos.y + cfg.fromAbove,
        targetPos.z,
      );
    } else {
      // CAP the fly-in: start at most `maxTravel` m out along the line to target.
      const maxTravel = cfg.maxTravel ?? 6;
      const fromDir = startPos.clone().sub(targetPos);
      fromPos =
        fromDir.length() > maxTravel
          ? targetPos.clone().add(fromDir.setLength(maxTravel))
          : startPos.clone();
    }
    // Up-vector: eases from `fromUp` (start) to `up` (end). For the top move this
    // rotates within the travel plane (world-up → pitch-axis) so the camera pitches
    // straight down WITHOUT any roll as it rises over the ball.
    const begUp = cfg.fromUp || endUp;
    return {
      cinematic: false, // smoothstep ease-in-out (see applyTween) → smooth
      curve: new THREE.LineCurve3(fromPos, targetPos),
      startUp: new THREE.Vector3(...begUp),
      targetUp: new THREE.Vector3(...endUp),
      startFov: fov, // constant FOV → no zoom-out swoop
      targetFov: fov,
      duration: cfg.duration ?? 1.3,
      ballPos: lookAt,
    };
  }

  // Direct top move (no cinematic swing): a straight line from wherever the
  // camera is (e.g. the bowler view) to a HIGH, slightly-angled view over
  // `ballPos`, zooming in. Used for the outside-leg "zoom to the bounce" beat.
  // NOTE: it is intentionally NOT perfectly vertical and keeps world-up (0,1,0):
  // a straight-down lookAt makes the up-vector degenerate and the camera rolls/
  // flips. A small back-offset keeps the horizon level → smooth, no rotation.
  if (angle === "topDirect" || angle === "topDirectClose") {
    // topDirectClose = OUTSIDE LEG (tighter zoom onto the bounce); topDirect =
    // full toss (wider, more of the pitch in frame).
    const close = angle === "topDirectClose";
    const HEIGHT = close ? 2.0 : 3.2; // lower = more zoomed in
    const look = new THREE.Vector3(ballPos.x * 0.3, ballPos.y, ballPos.z);

    const dur = getConfig("TOP_MOVE_DURATION");

    if (close) {
      // OUTSIDE LEG ONLY: camera straight above the look point, up aligned to the
      // pitch axis (Z) at BOTH ends → the strip is perfectly VERTICAL and the
      // camera does NOT roll during the move (Z-up start = Z-up end).
      const fov = getConfig("TOP_FOV_OUTSIDE_LEG");
      const targetPos = new THREE.Vector3(look.x, look.y + HEIGHT, look.z);
      // Kill the zoom-out swoop: (1) CAP the fly-in so it doesn't travel all the
      // way from the far broadcast camera, and (2) HOLD the FOV constant (no
      // widen → no zoom-out). Short, smooth descent straight down onto the bounce.
      const maxTravel = 6;
      const fromDir = startPos.clone().sub(targetPos);
      const fromPos =
        fromDir.length() > maxTravel
          ? targetPos.clone().add(fromDir.setLength(maxTravel))
          : startPos.clone();
      return {
        cinematic: false,
        curve: new THREE.LineCurve3(fromPos, targetPos),
        startUp: new THREE.Vector3(0, 0, -1),
        targetUp: new THREE.Vector3(0, 0, -1),
        startFov: fov, // constant FOV → no zoom-out swoop
        targetFov: fov,
        duration: dur,
        ballPos: look,
      };
    }

    // FULL TOSS (unchanged): slight depth tilt, world-up.
    const BACK = 0.6;
    const zSide = startPos.z >= look.z ? 1 : -1;
    const targetPos = new THREE.Vector3(
      look.x,
      look.y + HEIGHT,
      look.z + BACK * zSide,
    );
    return {
      cinematic: false,
      curve: new THREE.LineCurve3(startPos, targetPos),
      startUp,
      targetUp: new THREE.Vector3(0, 1, 0),
      startFov,
      targetFov: getConfig("TOP_FOV_FULLTOSS"),
      duration: dur,
      ballPos: look,
    };
  }

  // All review keys (1-5: side, top, behind, front, tour) are now config-driven
  // direct moves handled above (see src/drs/reviewAnimations.js). Anything else is
  // unknown.
  return null;
}

// Advance a tween to normalized time t (0..1) and write the pose to `camera`.
export function applyTween(camera, tw, t) {
  let u;
  if (tw.cinematic) {
    u = phasedEase(t); // 3-phase progressively-slower speed
  } else if (tw.easing === "doubleEase") {
    u = doubleEase(t, tw.t1, tw.uSide, tw.vMid);
  } else {
    u = smoothstep(t);
  }

  const clamped = Math.max(0, Math.min(1, u));
  const pos = tw.curve.getPointAt(clamped);
  const o = smoothstep(t);

  let fov;
  if (tw.cinematic) {
    // Widen while zooming out (phase 1), then ease back to the framing FOV.
    fov =
      t < PH.t1
        ? tw.startFov + (tw.wideFov - tw.startFov) * smoothstep(t / PH.t1)
        : tw.wideFov +
          (tw.targetFov - tw.wideFov) * smoothstep((t - PH.t1) / (1 - PH.t1));
  } else {
    fov = tw.startFov + (tw.targetFov - tw.startFov) * u;
  }

  // Orientation eases smoothly across the whole move (independent of the
  // along-path speed profile) so the framing settles gently.
  const up = new THREE.Vector3().lerpVectors(tw.startUp, tw.targetUp, o);
  if (up.lengthSq() < 1e-8) up.set(0, 1, 0);
  up.normalize();

  camera.position.copy(pos);
  camera.up.copy(up);

  // interpLook (fromCurrent): interpolate the AIM POINT too — from whatever the
  // camera was looking at, smoothly onto the target (the stump) — so both position
  // and lookAt ease together and the stump ends up centred, with no snap or jitter.
  if (tw.interpLook) {
    const lookPt = new THREE.Vector3().lerpVectors(tw.lookFrom, tw.lookTo, o);
    camera.lookAt(lookPt);
  } else {
    camera.lookAt(tw.ballPos);
  }

  camera.fov = fov;
  camera.updateProjectionMatrix();
}
