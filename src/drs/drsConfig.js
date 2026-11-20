// Tunable constants for DRS replay mode.
//
// Every value here is a DEFAULT. Operators can override any of them at runtime
// from the Settings panel — overrides are stored in localStorage and read live
// via getConfig(key). Nothing here writes source files; the running app simply
// prefers the saved override over the default. resetConfig() clears overrides.

// ── Defaults ────────────────────────────────────────────────────────────────
export const CONFIG_DEFAULTS = {
  // Replay speeds — SEPARATE for the video and the 3D trajectory (1 = native,
  // 0.5 = half speed, 2 = double, …).
  VIDEO_REPLAY_SPEED: 0.5, // delivery mp4 playbackRate
  TRAJECTORY_REPLAY_SPEED: 0.5, // 3D ball-trajectory animation

  // Frame rate of the original video used to map pixel frame numbers
  // (pitching_frame, impact_frame) to media time. MUST match the mp4's real fps.
  VIDEO_FPS: 120,

  // Pause the video this many frames after impact_frame, then hand off to 3D.
  STOP_AFTER_IMPACT_FRAMES: 0,
  // Outside-leg: seconds to hold on the frozen pitch frame before the 3D.
  OUTSIDE_LEG_HOLD_SEC: 1,

  // Decision overlay timings.
  DECISION_REVEAL_INTERVAL_MS: 500, // stagger between post-trajectory panels
  DECISION_FADE_MS: 900, // panel fade-in duration

  // Review camera (top view).
  TOP_MOVE_DURATION: 1.0, // seconds for the top-view move
  TOP_FOV_OUTSIDE_LEG: 30, // zoom (fov) for outside-leg top view
  TOP_FOV_FULLTOSS: 42, // zoom (fov) for full-toss top view

  // Ball / marker.
  BALL_TYPE: "red", // red (Test) | white (ODI/T20) | pink (day-night Test)
  WHITE_SEAM: "black", // white-ball seam thread: black | green
  BALL_SIZE: 0.0361, // real ball radius (m) — 7.22 cm dia / 22.68 cm circ (mid-spec)
  MARKER_SCALE: 0.0355, // pitch/impact MARKER ball radius (m) — sized independently

  // LBW strip opacity.
  STRIP_OPACITY_VIDEO: 0.3, // over the mp4 (AR)
  STRIP_OPACITY_REVIEW: 0.15, // in the 3D DRS review (LBW strip)
  STRIP_OPACITY_PITCHMAP: 0.45, // pitch-mapping only — tune independently of DRS

  // Default auto-play review camera (index string).
  DEFAULT_REPLAY_CAMERA: "3",

  // Boundary rope radius (m). The visible rope's NATIVE size is treated as 65, so 65 =
  // no change (current look); a smaller value (e.g. 53) shrinks the rope, larger grows it.
  // The rope stays centred on the ground. Applied live (operator + big screen).
  BOUNDARY_RADIUS: 63.24, // = the 63m day3 GLB's modelled rope radius → shows as in Blender
};

// Metadata for the Settings UI: label, group, type, and numeric bounds/step.
export const CONFIG_SCHEMA = [
  { group: "Replay speed", key: "VIDEO_REPLAY_SPEED", label: "Video replay speed", type: "number", min: 0.1, max: 3, step: 0.1 },
  { group: "Replay speed", key: "TRAJECTORY_REPLAY_SPEED", label: "Trajectory replay speed", type: "number", min: 0.1, max: 8, step: 0.1 },

  { group: "Video / frames", key: "VIDEO_FPS", label: "Video FPS", type: "number", min: 24, max: 600, step: 1 },
  { group: "Video / frames", key: "STOP_AFTER_IMPACT_FRAMES", label: "Stop after impact (frames)", type: "number", min: 0, max: 120, step: 1 },
  { group: "Video / frames", key: "OUTSIDE_LEG_HOLD_SEC", label: "Outside-leg hold (sec)", type: "number", min: 0, max: 5, step: 0.5 },

  { group: "Decision overlay", key: "DECISION_REVEAL_INTERVAL_MS", label: "Panel reveal interval (ms)", type: "number", min: 0, max: 2000, step: 50 },
  { group: "Decision overlay", key: "DECISION_FADE_MS", label: "Panel fade (ms)", type: "number", min: 0, max: 2000, step: 50 },

  { group: "Review camera", key: "TOP_MOVE_DURATION", label: "Top move duration (sec)", type: "number", min: 0.3, max: 4, step: 0.1 },
  { group: "Review camera", key: "TOP_FOV_OUTSIDE_LEG", label: "Outside-leg zoom (fov)", type: "number", min: 15, max: 60, step: 1 },
  { group: "Review camera", key: "TOP_FOV_FULLTOSS", label: "Full-toss zoom (fov)", type: "number", min: 15, max: 60, step: 1 },

  { group: "Ball & strip", key: "BALL_TYPE", label: "Ball type", type: "select", options: [
    { value: "red", label: "Red – Test" },
    { value: "white", label: "White – ODI/T20" },
    { value: "pink", label: "Pink – Day-night" },
  ] },
  { group: "Ball & strip", key: "WHITE_SEAM", label: "White-ball seam", type: "select", options: [
    { value: "black", label: "Black" },
    { value: "green", label: "Dark green" },
  ] },
  { group: "Ball & strip", key: "BALL_SIZE", label: "Ball size (m radius)", type: "number", min: 0.01, max: 0.08, step: 0.0001 },
  { group: "Ball & strip", key: "MARKER_SCALE", label: "Marker size (m radius)", type: "number", min: 0.01, max: 0.08, step: 0.001 },
  { group: "Ball & strip", key: "STRIP_OPACITY_VIDEO", label: "Strip opacity (video)", type: "number", min: 0, max: 1, step: 0.05 },
  { group: "Ball & strip", key: "STRIP_OPACITY_REVIEW", label: "Strip opacity (3D review)", type: "number", min: 0, max: 1, step: 0.05 },

  { group: "Default camera", key: "DEFAULT_REPLAY_CAMERA", label: "Default replay camera", type: "text" },

  { group: "Boundary", key: "BOUNDARY_RADIUS", label: "Boundary radius (m)", type: "number", min: 30, max: 90, step: 0.1 },
];

const LS_KEY = "drs.config.overrides";

function readOverrides() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// Live read: saved override (if any) else the default. Numbers are coerced.
export function getConfig(key) {
  const overrides = readOverrides();
  const val = key in overrides ? overrides[key] : CONFIG_DEFAULTS[key];
  const def = CONFIG_DEFAULTS[key];
  if (typeof def === "number") {
    const n = Number(val);
    return Number.isFinite(n) ? n : def;
  }
  return val ?? def;
}

// All effective values (defaults + overrides) — for populating the Settings form.
export function getAllConfig() {
  const overrides = readOverrides();
  const out = {};
  for (const key of Object.keys(CONFIG_DEFAULTS)) {
    out[key] = key in overrides ? overrides[key] : CONFIG_DEFAULTS[key];
  }
  return out;
}

// Save one override. Notifies listeners so open components can re-read live.
export function setConfig(key, value) {
  const overrides = readOverrides();
  overrides[key] = value;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(overrides));
  } catch {
    /* ignore quota */
  }
  window.dispatchEvent(new Event("drs-config-changed"));
}

// Clear all overrides → back to CONFIG_DEFAULTS.
export function resetConfig() {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event("drs-config-changed"));
}

// ── Back-compat named exports (defaults) ─────────────────────────────────────
// Existing imports still resolve; live code should prefer getConfig(...) so it
// picks up operator overrides.
export const VIDEO_REPLAY_SPEED = CONFIG_DEFAULTS.VIDEO_REPLAY_SPEED;
export const TRAJECTORY_REPLAY_SPEED = CONFIG_DEFAULTS.TRAJECTORY_REPLAY_SPEED;
export const REPLAY_SPEED = CONFIG_DEFAULTS.VIDEO_REPLAY_SPEED;
export const VIDEO_FPS = CONFIG_DEFAULTS.VIDEO_FPS;
export const MARKER_SCALE = CONFIG_DEFAULTS.MARKER_SCALE;
export const STOP_AFTER_IMPACT_FRAMES = CONFIG_DEFAULTS.STOP_AFTER_IMPACT_FRAMES;
export const DECISION_REVEAL_INTERVAL_MS =
  CONFIG_DEFAULTS.DECISION_REVEAL_INTERVAL_MS;
export const DECISION_FADE_MS = CONFIG_DEFAULTS.DECISION_FADE_MS;
