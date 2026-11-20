// Reusable "show" play logic shared by the operator's TrajectoryPicker and the
// broadcast big-screen receiver. A show is described by a small command object
// (see executeCommand) so it can be replayed in another tab by re-running the
// same dispatch sequence against the same public JSON.
import {
  setSessionType,
  setTrajectoryUrl,
  resetTrajectoryUrl,
  addAccumulatedTrajectory,
  clearAccumulatedTrajectories,
  startMultiTrajectoryPlay,
  beginMultiPlayback,
  setMultiPausable,
  startPitchMap,
  addPitchMapPoints,
  setPitchMapDrop,
  setPitchMapStandalone,
  setPitchDotStyle,
  setPitchMapView,
  setMultiPlaybackOpts,
  clearPitchMap,
  clearStumpMap,
  clearWagon,
  clearSwing,
  startStumpMap,
  addStumpMapPoints,
  setStumpMapDrop,
  setStumpMapStyle,
  startIntercept,
  setInterceptStyle,
  clearIntercept,
  startWagon,
  addWagonLines,
  startSwing,
  setSwingArmed,
  setSixHighlight,
  resetAllSessionStates,
} from "../../store/slices/sessionSlice";
import { endDrs, setDrsPaused } from "../../store/slices/drsSlice";
import { setCurrentShow } from "../../store/slices/broadcastSlice";
import { store } from "../../store/store";
import { playAnimation, stopAnimation } from "../../store/slices/animationSlice";
import { setActiveCamera } from "../../store/slices/cameraSlice";
import { drsReplay, drsSubmitOperatorInput } from "../../drs/drsController";
import {
  parseBallTrajectory,
  parseBallPitching,
  parseTrajectoryArray,
  pitchLengthLabel,
} from "./trajectoryGeometry";
import { cacheBust, loadReleaseSpeed } from "../../dataSource";
import { buildPoint, buildStumpPoint, buildImpactPoint, buildWagonLine } from "../pitchmap/pitchMapData";
import { clearSnapshot, clearBowlingAnalysis } from "../../score-api";
import { resetSixFlight } from "./sixFlight";
import { resetSixDistance } from "./sixDistance";

// Must match BowlingTrajectory's default scale so the animated tubes line up
// with the pitch geometry.
const SCALE = 0.01;

// Fetch one trajectory file → { positions, impactIndex } for the 3D view, plus
// the broadcast ticker details (over, speed, length, runs).
export async function loadBall(url) {
  const [res, releaseSpeed] = await Promise.all([fetch(cacheBust(url)), loadReleaseSpeed(url)]);
  const data = await res.json();
  const ball = data?.balls?.[0];
  const parsed = parseBallTrajectory(ball, SCALE);
  if (!parsed) return null;
  const inn = url.match(/\/in-(\d+)\//); // innings from the URL path (for the ticker name)
  return {
    ...parsed,
    over: ball.over,
    ballNo: ball.ball,
    innings: inn ? Number(inn[1]) : undefined,
    // Ticker shows the release speed: ball_analytics.json release_speed_kmph, falling
    // back to the trajectory's pre-pitch speed if the analytics file is missing.
    speedAvg: releaseSpeed ?? ball.speed?.beforePitch ?? null,
    // Length classified from where the ball actually pitched (the data's own
    // ballDescription is a constant "Full length" and can't be trusted).
    description: pitchLengthLabel(ball, SCALE),
    runs: ball.runs ?? 0,
    isWicket: (ball.ballMeta?.wicketsFrame ?? 0) > 0,
  };
}

// Fetch one trajectory file → just its bounce point for the pitch map.
export async function loadPitching(url) {
  const res = await fetch(cacheBust(url));
  const data = await res.json();
  return parseBallPitching(data?.balls?.[0], SCALE);
}

// Single ball: switch session type (which picks the renderer — BATTING_SESSION →
// BattingTrajectory, BOWLING_SESSION → BowlingTrajectory) and load that
// trajectory JSON. Defaults to bowling so existing callers are unchanged.
export function playSingle(
  dispatch,
  url,
  sessionType = "BOWLING_SESSION",
  six = false,
) {
  // Clear any active DRS so its decision panels don't linger over this view.
  dispatch(endDrs());
  // Stop the idle ground-camera GLB fly-around. Its mixer keeps animating the active
  // camera every frame; a single-ball replay (bowling tube / 6-Highlights camera) takes
  // camera control, so leaving it running makes the two fight → the camera SHAKES.
  dispatch(stopAnimation("groundCamera"));
  dispatch(setSessionType(sessionType));
  dispatch(clearAccumulatedTrajectories());
  // Clear any previous module's visuals (pitch/stump dots, swing) so a single/six replay
  // never shows alongside leftover graphics from the last show.
  dispatch(clearPitchMap());
  dispatch(clearStumpMap());
  dispatch(clearWagon());
  dispatch(clearIntercept());
  dispatch(clearSwing());
  // Reset the 6-Highlights module-global graphics (flight + screen-space lines) so a six
  // never inherits a previous shot's/module's stale arc, camera side, or distance/height
  // lines when switched into without a page refresh.
  resetSixFlight();
  resetSixDistance();
  // Reset first (its own render) so reselecting the same ball still re-triggers
  // the fetch/replay effect in BowlingTrajectory.
  dispatch(resetTrajectoryUrl());
  // Flag whether this is a 6-Highlights six — drives the six camera/labels regardless of
  // the URL (so it works in both sample and machine mode). resetTrajectoryUrl cleared it.
  dispatch(setSixHighlight(six));
  setTimeout(() => dispatch(setTrajectoryUrl(url)), 0);
}

// Load one over (up to 6 balls) into the ARMED state: the scene shows the
// bowler's-end stump view with the balls hidden, waiting for playback.
export async function loadOver(dispatch, urls, overNo, playMode, pausable = true, opts = {}) {
  // Clear any active DRS so its decision panels don't linger over this view.
  dispatch(endDrs());
  dispatch(setSessionType("BOWLING_SESSION"));
  dispatch(clearAccumulatedTrajectories());
  // Playback mode: whether Space can pause/resume this over (operator's choice).
  dispatch(setMultiPausable(pausable !== false));
  // Carry the playback opts (trajectory length, combine→pitch-map, Automatic) onto
  // THIS app's store — so the big screen behaves identically to the operator.
  dispatch(
    setMultiPlaybackOpts({
      trajLen: opts.trajLen,
      combinePitchMap: !!opts.combinePitchMap,
      autoPlay: !!opts.autoPlay,
    }),
  );
  dispatch(startMultiTrajectoryPlay(playMode)); // armed (not started)
  const results = await Promise.all(
    urls.map((u) => loadBall(u).catch(() => null)),
  );
  results.filter(Boolean).forEach((traj) => {
    dispatch(addAccumulatedTrajectory({ ...traj, pickedOver: overNo ?? null }));
  });
}

// Load + play an over immediately (operator preview).
export async function playOver(dispatch, urls, overNo, playMode, pausable = true, opts = {}) {
  await loadOver(dispatch, urls, overNo, playMode, pausable, opts);
  dispatch(beginMultiPlayback());
}

// Guards an in-flight one-by-one reveal: a newer playPitchMap bumps this so the
// older loop stops adding stale dots.
let pitchRevealToken = 0;

// Pitch map: every ball's bounce point as dots over the length zones, no tubes.
// reveal = "together" (all dots at once) | "onebyone" (dots appear in order).
export async function playPitchMap(
  dispatch,
  urls,
  reveal = "together",
  style = "runs",
  meta = null, // per-URL ball meta from the operator (same index the preview uses)
) {
  // Clear any active DRS so its decision panels don't linger over this view.
  dispatch(endDrs());
  dispatch(setSessionType("BOWLING_SESSION"));
  dispatch(setPitchDotStyle(style)); // "runs" | "ball" dot label (colour by outcome)
  // "All together" → dots DROP from the top; "one by one" → quick pop.
  dispatch(setPitchMapDrop(reveal !== "onebyone"));
  const myToken = ++pitchRevealToken;
  // Standalone pitch map (big screen): top-view flat run-value dots.
  dispatch(startPitchMap([]));
  dispatch(setPitchMapStandalone(true));
  dispatch(setPitchMapView("overview")); // main view = key-2 (bowler's-end angled), not top
  // Hold the dots until the camera has craned over, so the move comes first and the
  // dots animate in only once we're looking down at the pitch (parity with the operator).
  const CAMERA_SETTLE_MS = 1000;
  // Pre-load the bounce points WHILE the camera moves — the settle timer and the fetch run in
  // PARALLEL, so the total delay before the dots is ~max(fetch, CAMERA_SETTLE_MS) ≈ 1 s (not
  // fetch + 1 s). Tag each dot with the innings parsed from its URL for the ticker name.
  const fetchPts = Promise.all(
    urls.map((u, i) =>
      meta?.[i]
        ? // Operator sent this ball's meta → build the dot EXACTLY like the preview
          // (buildPoint: LHB flip + runs/outcome/over/ball from the per-ball index).
          fetch(cacheBust(u))
            .then((r) => r.json())
            .then((json) => buildPoint(meta[i], json))
            .catch(() => null)
        : loadPitching(u)
            .then((p) => {
              if (!p) return null;
              const m = u.match(/\/in-(\d+)\//);
              return m ? { ...p, innings: Number(m[1]) } : p;
            })
            .catch(() => null),
    ),
  );
  const settle = new Promise((r) => setTimeout(r, CAMERA_SETTLE_MS));
  const [rawPts] = await Promise.all([fetchPts, settle]); // both run together → ~1 s total
  const pts = rawPts.filter(Boolean);
  if (myToken !== pitchRevealToken) return;
  if (reveal === "onebyone") {
    for (const pt of pts) {
      if (myToken !== pitchRevealToken) return; // superseded → stop
      dispatch(addPitchMapPoints([pt]));
      await new Promise((r) => setTimeout(r, 350));
    }
    return;
  }
  dispatch(addPitchMapPoints(pts)); // all drop in at once
}

// Stump map: where each ball crosses the stumps plane (z≈1.22m) as flat dots on the
// front-on stumps view. Mirrors playPitchMap.
const STUMP_Z = 1.22;
let stumpRevealToken = 0;
export async function loadStump(url) {
  const res = await fetch(cacheBust(url));
  const data = await res.json();
  const b = data?.balls?.[0];
  const pts = b ? parseTrajectoryArray(b.trajectory, SCALE) : null;
  if (!pts || pts.length < 2) return null;
  // innings/over/ball come from the URL path (…/in-<innings>/<over>/<ball>/…) — the
  // trajectory JSON's own `over` is unreliable and it has no innings. Without these the
  // big-screen/PiP ticker figures (Overs/Maidens) don't match the operator's.
  const m = url.match(/\/in-(\d+)\/(\d+)\/(\d+)\//);
  const meta = m
    ? { innings: Number(m[1]), over: Number(m[2]), ballNo: Number(m[3]) }
    : {};
  const isWicket = (b.ballMeta?.wicketsFrame ?? 0) > 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1].pos;
    const c = pts[i].pos;
    if ((a.z - STUMP_Z) * (c.z - STUMP_Z) <= 0 && a.z !== c.z) {
      const t = (STUMP_Z - a.z) / (c.z - a.z);
      return {
        x: a.x + (c.x - a.x) * t,
        y: a.y + (c.y - a.y) * t,
        ...meta,
        runs: 0, // runs come from the score API (server mode); sample has none → dot
        isWicket,
      };
    }
  }
  return null;
}
// Operator sent this ball's meta → build the dot EXACTLY like the preview (buildStumpPoint:
// LHB flip + runs/outcome from the per-ball index). Else fall back to the URL-only loadStump.
function loadStumpPoint(u, m) {
  if (!m) return loadStump(u).catch(() => null);
  return fetch(cacheBust(u))
    .then((r) => r.json())
    .then((json) => {
      const pt = buildStumpPoint(m, json);
      return pt ? { ...pt, innings: m.innings } : null; // innings for the ticker figures
    })
    .catch(() => null);
}

export async function playStumpMap(
  dispatch,
  urls,
  reveal = "together",
  style = "runs",
  meta = null, // per-URL ball meta from the operator (same index the preview uses)
) {
  dispatch(endDrs());
  dispatch(setSessionType("BOWLING_SESSION"));
  dispatch(setStumpMapStyle(style));
  dispatch(setStumpMapDrop(reveal !== "onebyone"));
  const myToken = ++stumpRevealToken;
  if (reveal === "onebyone") {
    dispatch(startStumpMap([]));
    for (let i = 0; i < urls.length; i++) {
      if (myToken !== stumpRevealToken) return;
      const pt = await loadStumpPoint(urls[i], meta?.[i]);
      if (myToken !== stumpRevealToken) return;
      if (pt) dispatch(addStumpMapPoints([pt]));
      await new Promise((r) => setTimeout(r, 350));
    }
    return;
  }
  const pts = (
    await Promise.all(urls.map((u, i) => loadStumpPoint(u, meta?.[i])))
  ).filter(Boolean);
  if (myToken !== stumpRevealToken) return;
  dispatch(startStumpMap(pts));
}

// Interception beehive on the big screen — bat-impact points. Mirrors playStumpMap but uses
// buildImpactPoint (afterImpact[0]).
export async function playIntercept(dispatch, urls, style = "ball", meta = null) {
  dispatch(endDrs());
  dispatch(setSessionType("BOWLING_SESSION"));
  dispatch(setInterceptStyle(style));
  const pts = (
    await Promise.all(
      (urls || []).map((u, i) =>
        fetch(cacheBust(u))
          .then((r) => r.json())
          .then((json) => (meta?.[i] ? buildImpactPoint(meta[i], json) : null))
          .catch(() => null),
      ),
    )
  ).filter(Boolean);
  dispatch(startIntercept(pts));
}

// Wagon wheel on the big screen — one line per scoring shot. Mirrors the operator's Start:
// fetch each trajectory, build its wagon line, dispatch them.
export async function playWagon(dispatch, urls, meta = null) {
  dispatch(endDrs());
  dispatch(setSessionType("BATTING_SESSION"));
  dispatch(startWagon([]));
  const lines = (
    await Promise.all(
      (urls || []).map((u, i) =>
        fetch(cacheBust(u))
          .then((r) => r.json())
          .then((json) => (meta?.[i] ? buildWagonLine(meta[i], json) : null))
          .catch(() => null),
      ),
    )
  ).filter(Boolean);
  if (lines.length) dispatch(addWagonLines(lines));
}

// Morph the JUST-PLAYED bowling-analysis over into the pitch map WITHOUT any
// re-fetch: each delivery's full trajectory is already in accumulatedTrajectories,
// so we take its bounce point (positions[pitchIndex]) as the pitch-map dot. Used
// by the Space flow after the tubes are cleared.
export function pitchMapFromAccumulated(dispatch) {
  const acc = store.getState().session.accumulatedTrajectories || [];
  const pts = acc
    .map((t) => {
      const p = t.positions || [];
      if (!p.length) return null;
      const idx =
        t.pitchIndex != null
          ? Math.min(Math.max(t.pitchIndex, 0), p.length - 1)
          : Math.floor((p.length - 1) * 0.45);
      const b = p[idx];
      if (!b) return null;
      return {
        x: b.x,
        y: b.y,
        z: b.z,
        ballNo: t.ballNo ?? null,
        over: t.over ?? null,
        runs: t.runs ?? 0,
        isWicket: !!t.isWicket,
      };
    })
    .filter(Boolean);
  dispatch(endDrs());
  dispatch(setSessionType("BOWLING_SESSION"));
  dispatch(setPitchMapDrop(false)); // morph-from-over → pop (not the drop reveal)
  dispatch(startPitchMap(pts));
  // Bowling pitch map: keep standalone FALSE so the dots use the ball colours (1→6) +
  // ball numbers (match the tubes/ticker). But use the SAME camera entry as the standalone
  // pitch map — the Hawk-Eye bowler's-end view ("overview"), not top-down.
  dispatch(setPitchMapView("overview"));
}

// DRS replay (plays immediately). drsReplay loads the assets and parks the
// phase at "operatorInput"; submitting the operatorInput advances to "video"
// and plays the decision WITHOUT showing the operator input dialog.
// Clear any PREVIOUS module's graphics (pitch/stump dots, swing, accumulated tubes, six
// carryover) so a DRS show never renders on top of leftover dots from the last show on the
// big screen. drsReplay only resets the DRS slice, not these session visuals.
function clearNonDrsVisuals(dispatch) {
  dispatch(clearAccumulatedTrajectories());
  dispatch(clearPitchMap());
  dispatch(clearStumpMap());
  dispatch(clearWagon());
  dispatch(clearIntercept());
  dispatch(clearSwing());
  resetSixFlight();
  resetSixDistance();
}

export async function playDrs(
  dispatch,
  folderUrl,
  operatorInput,
  noBall = false,
  viewAngle = null,
  camera = 0,
  withVideo = true,
) {
  if (dispatch) clearNonDrsVisuals(dispatch);
  await drsReplay(folderUrl, { noBall, viewAngle, camera, withVideo });
  if (dispatch) dispatch(setDrsPaused(false));
  if (operatorInput) drsSubmitOperatorInput(operatorInput);
}

// Switch the physical camera of the currently-running DRS / No-Ball show: it
// re-runs the replay from the other feed so BOTH the video (orig_<side>.mp4)
// and the 3D overlay (that camera's calibration) change. Updates currentShow so
// a later Push / reset keeps the chosen camera.
export function switchDrsCamera(dispatch, cmd, side) {
  if (!cmd || cmd.kind !== "drs") return;
  dispatch(setCurrentShow({ ...cmd, camera: side }));
  playDrs(dispatch, cmd.folderUrl, cmd.operatorInput, cmd.noBall, null, side, cmd.withVideo);
}

// Cue DRS: load it but hold the video on the first frame until Play.
export async function cueDrs(
  dispatch,
  folderUrl,
  operatorInput,
  noBall = false,
  viewAngle = null,
  camera = 0,
  withVideo = true,
) {
  if (dispatch) clearNonDrsVisuals(dispatch);
  await drsReplay(folderUrl, { noBall, viewAngle, camera, withVideo });
  dispatch(setDrsPaused(true));
  if (operatorInput) drsSubmitOperatorInput(operatorInput);
}

// Return the big screen to the same idle it shows on a fresh load: stop any
// DRS / multi-ball / pitch-map view, reset the session to its initial state,
// and replay the ground-camera idle fly-around (the "idle animation"). Used
// when the operator presses R.
export function goIdle(dispatch) {
  dispatch(endDrs());
  dispatch(clearAccumulatedTrajectories());
  dispatch(clearPitchMap());
  dispatch(clearStumpMap());
  dispatch(clearWagon());
  dispatch(clearIntercept());
  dispatch(clearSwing());
  resetSixFlight(); // clear any six arc/camera carryover
  resetSixDistance(); // clear any six distance/height screen lines
  dispatch(resetAllSessionStates());
  dispatch(setSessionType("BATTING_SESSION"));
  // Hide the score / bowling tickers — idle has no delivery, so no scores.
  dispatch(clearSnapshot());
  dispatch(clearBowlingAnalysis());
  // Re-trigger the ground-camera fly-around the same way it auto-plays at
  // startup; without this the camera is left on the stump view from the
  // multi/DRS angle.
  dispatch(playAnimation("groundCamera"));
}

// A static "ready" pose: stadium with the camera parked at the bowler's-end
// view (no idle fly-around), used as the initial screen while a show is cued.
export function goReady(dispatch) {
  dispatch(endDrs());
  dispatch(clearAccumulatedTrajectories());
  dispatch(clearPitchMap());
  dispatch(clearStumpMap());
  dispatch(clearWagon());
  dispatch(clearIntercept());
  dispatch(clearSwing());
  dispatch(resetAllSessionStates());
  dispatch(setSessionType("BOWLING_SESSION"));
  dispatch(stopAnimation("groundCamera")); // stop the idle fly-around
  dispatch(setActiveCamera("bowling_camera")); // static bowler's-end view
}

// Swing Analysis: single ball → draw its trajectory release→impact (SwingAnalysis
// renderer reads session.swingSel). Clears any active DRS first so panels don't linger.
export function playSwing(dispatch, { innings, over, ball }, armed = false) {
  dispatch(endDrs());
  // armed → show the swing setup (camera + ball at release) and HOLD the flight until
  // Play (big-screen cue). Not armed → play the flight immediately (operator preview).
  dispatch(startSwing({ innings, over, ball, armed }));
}

// Run a show command immediately (operator preview / convenience).
export function executeCommand(dispatch, cmd) {
  if (!cmd || !cmd.kind) return;
  switch (cmd.kind) {
    case "single":
      return playSingle(dispatch, cmd.url, cmd.session, cmd.six);
    case "over":
      return playOver(dispatch, cmd.urls, cmd.overNo, cmd.playMode, cmd.pausable, cmd);
    case "pitch":
      return playPitchMap(dispatch, cmd.urls, cmd.reveal, cmd.style, cmd.meta);
    case "stump":
      return playStumpMap(dispatch, cmd.urls, cmd.reveal, cmd.style, cmd.meta);
    case "intercept":
      return playIntercept(dispatch, cmd.urls, cmd.style, cmd.meta);
    case "wagon":
      return playWagon(dispatch, cmd.urls, cmd.meta);
    case "swing":
      return playSwing(dispatch, cmd);
    case "drs":
      return playDrs(
        dispatch,
        cmd.folderUrl,
        cmd.operatorInput,
        cmd.noBall,
        cmd.viewAngle,
        cmd.camera,
        cmd.withVideo,
      );
    case "idle":
      return goIdle(dispatch);
    default:
      console.warn("[broadcast] unknown command kind:", cmd.kind);
  }
}

// CUE a show on the big screen: load it and show the INITIAL scene, without
// animating. Play (playShow) then starts it.
export function cueShow(dispatch, cmd) {
  if (!cmd || !cmd.kind) return;
  switch (cmd.kind) {
    case "over":
      // Armed: stump view from the bowler, balls hidden.
      return loadOver(dispatch, cmd.urls, cmd.overNo, cmd.playMode, cmd.pausable, cmd);
    case "pitch":
      // Clear any active DRS (panels + markers) first, then show the empty
      // pitch length zones (no bounce dots yet).
      dispatch(endDrs());
      return dispatch(startPitchMap([]));
    case "stump":
      dispatch(endDrs());
      return dispatch(startStumpMap([]));
    case "intercept":
      dispatch(endDrs());
      return dispatch(startIntercept([]));
    case "wagon":
      dispatch(endDrs());
      return dispatch(startWagon([]));
    case "single":
      // Static bowler's-end view until Play.
      return goReady(dispatch);
    case "swing":
      // Cue the swing ARMED: show the setup (camera + ball at release), hold the flight
      // until Play.
      return playSwing(dispatch, cmd, true);
    case "drs":
      // Load the DRS video and hold it on the first frame until Play.
      return cueDrs(
        dispatch,
        cmd.folderUrl,
        cmd.operatorInput,
        cmd.noBall,
        cmd.viewAngle,
        cmd.camera,
        cmd.withVideo,
      );
    case "idle":
      return goIdle(dispatch);
    default:
      console.warn("[broadcast] unknown cue kind:", cmd.kind);
  }
}

// PLAY the cued show on the big screen.
export function playShow(dispatch, cmd) {
  if (!cmd || !cmd.kind) return;
  switch (cmd.kind) {
    case "over":
      return dispatch(beginMultiPlayback());
    case "pitch":
      return playPitchMap(dispatch, cmd.urls, cmd.reveal, cmd.style, cmd.meta);
    case "stump":
      return playStumpMap(dispatch, cmd.urls, cmd.reveal, cmd.style, cmd.meta);
    case "intercept":
      return playIntercept(dispatch, cmd.urls, cmd.style, cmd.meta);
    case "wagon":
      return playWagon(dispatch, cmd.urls, cmd.meta);
    case "single":
      return playSingle(dispatch, cmd.url, cmd.session, cmd.six);
    case "swing":
      // Release a cued (armed) swing so the flight runs; if it wasn't cued, start it.
      if (store.getState().session.swingActive)
        return dispatch(setSwingArmed(false));
      return playSwing(dispatch, cmd, false);
    case "drs": {
      // First play after a cue: just resume the held video. Otherwise (already
      // played / not paused) re-run the whole DRS so Play replays it.
      const drs = store.getState().drs;
      if (drs.active && drs.paused) return dispatch(setDrsPaused(false));
      return playDrs(
        dispatch,
        cmd.folderUrl,
        cmd.operatorInput,
        cmd.noBall,
        cmd.viewAngle,
        cmd.camera,
      );
    }
    case "idle":
      return goIdle(dispatch);
    default:
      console.warn("[broadcast] unknown play kind:", cmd.kind);
  }
}
