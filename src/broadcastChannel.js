// Low-level cross-tab channel between the operator app and the big-screen
// broadcast tab. All operator→big-screen messaging is explicit (no Redux
// middleware): show commands, play/reset, and targeted camera actions.

const CHANNEL_NAME = "drs-broadcast";

let channel = null;
export function getChannel() {
  if (!channel && typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel(CHANNEL_NAME);
  }
  return channel;
}

// Push (cue) a show on the big screen. It shows the initial scene and waits for
// Play. "idle" clears it.
export function sendShow(cmd) {
  if (!cmd) return;
  getChannel()?.postMessage({ type: "show", cmd });
}

// Play the cued show on the big screen (Play button / Space).
export function sendPlay() {
  getChannel()?.postMessage({ type: "play" });
}

// Reset the big screen back to its initial scene, keeping the cued show.
export function sendReset() {
  getChannel()?.postMessage({ type: "reset" });
}

// Send the Space transport intent to the big screen. The big screen decides what
// it means against ITS OWN state: start if armed, otherwise pause/resume the
// running multi-ball playback in place.
export function sendSpace() {
  getChannel()?.postMessage({ type: "space" });
}

// Send a number-key intent (e.g. "3") to the big screen ONLY. The big screen
// interprets it against ITS OWN current show (over / DRS / pitch), so it works
// regardless of what the operator tool is currently previewing.
export function sendBroadcastKey(key) {
  getChannel()?.postMessage({ type: "key", key });
}

// Push a score snapshot to the big screen so its ticker shows the same score.
export function sendSnapshot(snapshot) {
  getChannel()?.postMessage({ type: "snapshot", snapshot });
}

// Push the aggregated bowling analysis (bowler + per-ball score) so the big
// screen's multi-ball ticker shows the same API-driven data.
export function sendBowlingAnalysis(bowling) {
  getChannel()?.postMessage({ type: "bowling", bowling });
}

// Mirror the "Hide ticker" checkbox to the big screen so its broadcast ticker
// shows/hides in step with the operator's toggle.
export function sendLengthDist(hide) {
  getChannel()?.postMessage({ type: "lengthDist", hide: !!hide });
}

// Mirror the "Hide bowler container" checkbox (pitch map + stump map) to the big screen.
export function sendHideBowler(hide) {
  getChannel()?.postMessage({ type: "hideBowler", hide: !!hide });
}

// Mirror the "Name only" checkbox (bowling analysis ticker) to the big screen.
export function sendBowlerNameOnly(on) {
  getChannel()?.postMessage({ type: "bowlerNameOnly", on: !!on });
}
// Bowling-analysis ticker metric: "speed" | "runs" | "both".
export function sendBowlingTickerMetric(metric) {
  getChannel()?.postMessage({ type: "bowlingTickerMetric", metric });
}

// Mirror the pitch-map figures config ({ hidden, custom }) to the big screen.
export function sendPitchFigures(config) {
  getChannel()?.postMessage({ type: "pitchFigures", config });
}

// Mirror the pitch-map bowler TYPE (seamers | spinners) to the big screen.
export function sendPitchBowlerType(bt) {
  getChannel()?.postMessage({ type: "pitchBowlerType", bowlerType: bt });
}

// Mirror the pitch-map ticker bowler name + white-card text to the big screen.
export function sendPitchBowlerName(name) {
  getChannel()?.postMessage({ type: "pitchBowlerName", name: name ?? "" });
}
// Mirror the Bowling-tab "hide ball number on the pitch map" option to the big screen.
export function sendBowlingPitchHideNumber(on) {
  getChannel()?.postMessage({ type: "bowlingPitchHideNumber", on: !!on });
}
// Mirror the pitch-map operator FAKE balls (full list) to the big screen.
export function sendPitchFakeBalls(list) {
  getChannel()?.postMessage({ type: "pitchFakeBalls", list: list || [] });
}
// Mirror the swing-analysis Spin/Seam option ("spin" → Turn, "seam" → Swing) to the big screen.
export function sendSwingBowlerType(type) {
  getChannel()?.postMessage({ type: "swingBowlerType", bowlerType: type });
}
// Mirror the pitch-map "keep name case as typed" option (off = uppercase) to the big screen.
export function sendPitchNameKeepCase(on) {
  getChannel()?.postMessage({ type: "pitchNameKeepCase", on: !!on });
}
export function sendPitchTickerText(text) {
  getChannel()?.postMessage({ type: "pitchTickerText", text: text ?? "" });
}
// Mirror the stump-map ticker bowler name to the big screen.
export function sendStumpBowlerName(name) {
  getChannel()?.postMessage({ type: "stumpBowlerName", name: name ?? "" });
}
// Mirror the outcome-category toggles (which balls/legend swatches show) to the big screen.
export function sendBallCategories(cats) {
  getChannel()?.postMessage({ type: "ballCategories", cats: cats || {} });
}
// Mirror the per-outcome heartbeat PULSE toggles (pitch map) to the big screen.
export function sendPitchGlow(glow) {
  getChannel()?.postMessage({ type: "pitchGlow", glow: glow || {} });
}
// Mirror the per-outcome heartbeat PULSE toggles (stump map) to the big screen.
export function sendStumpGlow(glow) {
  getChannel()?.postMessage({ type: "stumpGlow", glow: glow || {} });
}
// Mirror the 6-Highlights label toggles (launch angle / ball speed) to the big screen.
export function sendSixShowAngle(on) {
  getChannel()?.postMessage({ type: "sixShowAngle", on: !!on });
}
export function sendSixShowSpeed(on) {
  getChannel()?.postMessage({ type: "sixShowSpeed", on: !!on });
}
// Mirror the 6-Highlights "rotate stadium" option (on/off) to the big screen.
export function sendSixRotateStadium(on) {
  getChannel()?.postMessage({ type: "sixRotateStadium", on: !!on });
}
// Mirror the 6-Highlights rotate-degrees value to the big screen.
export function sendSixRotateDeg(deg) {
  getChannel()?.postMessage({ type: "sixRotateDeg", deg });
}

export function sendTicker(hide) {
  getChannel()?.postMessage({ type: "ticker", hide: !!hide });
}

// Mirror the Wagon-wheel display options (style/sweep/reveal/duration + ticker fields) so the
// big screen draws the SAME wheel as the operator preview.
export function sendWagonOptions(opts) {
  getChannel()?.postMessage({ type: "wagonOptions", opts: opts || {} });
}

// Mirror the Interception ticker options (name + keep-case) to the big screen.
export function sendInterceptOptions(opts) {
  getChannel()?.postMessage({ type: "interceptOptions", opts: opts || {} });
}

// Mirror the Day/Night toggle to the big screen.
export function sendScene(mode) {
  getChannel()?.postMessage({ type: "scene", mode: mode === "night" ? "night" : "day" });
}

// Tell the big screen to go PiP (small, 3D only) or back to Full. The big screen
// resizes ITSELF (exiting fullscreen first) — a window can resize itself reliably,
// and only it can exit its own fullscreen. See docs/PIP_PICTURE_IN_PICTURE.md.
export function sendPipMode(on) {
  getChannel()?.postMessage({ type: "pip", on: !!on });
}

// Ask the big-screen window to close itself. Used by Stop when the operator
// tool has no window handle (e.g. after an operator-tab reload).
export function sendClose() {
  getChannel()?.postMessage({ type: "close" });
}

// One-shot liveness check: operator asks "is a big screen open?" on load. The
// big screen replies with a "pong" (see crossTabSync). No periodic timer.
export function sendPing() {
  getChannel()?.postMessage({ type: "ping" });
}

// Big screen -> operator: report live playback progress (video time / state) so
// the operator's broadcast monitor can show what's on air. One-way, best-effort.
export function sendProgress(payload) {
  getChannel()?.postMessage({ type: "progress", ...payload });
}
