// Broadcast-tab receiver. A pushed show is CUED (the big screen stays idle)
// until the operator presses Play; "reset" returns to idle but keeps the cue;
// "action" messages mirror live camera-angle changes.
import { getChannel } from "./broadcastChannel";
import {
  cueShow,
  playShow,
  goIdle,
  switchDrsCamera,
  executeCommand,
  pitchMapFromAccumulated,
} from "./components/drs/showCommands";
import {
  setMultiViewAngle,
  setSwingViewAngle,
  setSixViewAngle,
  setPitchMapView,
  beginMultiPlayback,
  toggleMultiPaused,
  toggleSwingPaused,
  toggleSixPaused,
  setMultiTubesOff,
  setHideTicker,
  setHideLengthDist,
  setHideBowler,
  setBowlerNameOnly,
  setBowlingTickerMetric,
  setPitchFigures,
  setPitchBowlerType,
  setPitchBowlerName,
  setPitchNameKeepCase,
  setSwingBowlerType,
  setPitchFakeBalls,
  setBowlingPitchHideNumber,
  setStumpBowlerName,
  setBallCategories,
  setPitchGlow,
  setStumpGlow,
  setWagonStyle,
  setWagonSweep,
  setWagonReveal,
  setWagonDuration,
  setWagonBatterName,
  setWagonNameKeepCase,
  setWagonOutcomes,
  setWagonHideCard,
  setWagonHideName,
  setWagonBatHand,
  setInterceptName,
  setInterceptNameKeepCase,
  setSixRotateStadium,
  setSixRotateDeg,
  setSixShowAngle,
  setSixShowSpeed,
  setPitchTickerText,
  setScene,
} from "./store/slices/sessionSlice";
import { setDrsViewAngle } from "./store/slices/drsSlice";
import { setSnapshot, setBowlingAnalysis } from "./score-api";

// Number key → review-angle name (matches DrsKeyBindings VIEW_KEYS).
const VIEW_KEYS = { 1: "side", 2: "top", 3: "behind", 4: "front" };
// In No-Ball mode the number keys switch the physical camera by INDEX: key "1"
// → camera 0, "2" → camera 1, … (matches DrsKeyBindings).
const cameraIndexForKey = (key) => {
  const n = Number(key);
  return Number.isInteger(n) && n >= 1 ? String(n - 1) : null;
};

// Apply a camera-angle key against the BIG SCREEN's own current show. (0 =
// reset is handled separately via the "reset" message, not here.)
function applyKey(store, key) {
  const s = store.getState();
  // No-Ball: number keys switch the physical camera (video + 3D overlay),
  // bounded to the cameras this ball ships (a key past the count is a no-op).
  if (s.drs.active && s.drs.noBall) {
    const idx = cameraIndexForKey(key);
    if (idx != null) {
      if (Number(idx) < (s.drs.cameras?.length ?? 0)) {
        switchDrsCamera(store.dispatch, s.broadcast.currentShow, idx);
      }
      return;
    }
  }
  if (s.session.pitchMapActive) {
    // Pitch camera: 1 = top-down, 2 = overview, 3 = broadcast ¾, 4 = spidercam.
    if (key === "1") store.dispatch(setPitchMapView("top"));
    else if (key === "2") store.dispatch(setPitchMapView("overview"));
    else if (key === "3") store.dispatch(setPitchMapView("broadcast"));
    else if (key === "4") store.dispatch(setPitchMapView("spider"));
    return;
  }
  if (s.session.sixHighlight) {
    // 6 Highlights: 1 = side view, 2 = main (broadcast) cam.
    if (key === "1") store.dispatch(setSixViewAngle("side"));
    else if (key === "2") store.dispatch(setSixViewAngle("main"));
    return;
  }
  const view = VIEW_KEYS[key];
  if (!view) return;
  if (s.drs.active && s.drs.phase === "review") {
    store.dispatch(setDrsViewAngle(view));
  } else if (s.session.multiTrajectoryPlay && s.session.multiTrajectoryComplete) {
    store.dispatch(setMultiViewAngle(view));
  } else if (s.session.swingActive) {
    // Swing analysis: keys 1-4 glide to the DRS review angles (same as the operator).
    store.dispatch(setSwingViewAngle(view));
  }
}

export function startBroadcastReceiver(store) {
  const ch = getChannel();
  if (!ch) return () => {};

  // The show waiting to be played, and the one currently animating (for replay
  // on tab re-show).
  let pendingCmd = null;
  let executedCmd = null;
  // Big-screen ONLY: a bowling-analysis over holds on its armed start frame for this long
  // after Play before the trajectory begins (gives the broadcast a beat). Operator preview is
  // unaffected (it never runs this receiver). Tracked so a new cue/reset/play cancels it.
  const OVER_PLAY_DELAY_MS = 1000;
  let overPlayTimer = null;
  const clearOverPlayTimer = () => {
    if (overPlayTimer) {
      clearTimeout(overPlayTimer);
      overPlayTimer = null;
    }
  };

  const onMessage = (e) => {
    const msg = e.data;
    if (!msg) return;

    if (msg.type === "show") {
      clearOverPlayTimer();
      if (msg.cmd?.kind === "idle") {
        pendingCmd = null;
        executedCmd = null;
        goIdle(store.dispatch);
      } else {
        // Cue it: show the show's initial scene, hold until Play.
        pendingCmd = msg.cmd;
        executedCmd = null;
        cueShow(store.dispatch, msg.cmd);
      }
    } else if (msg.type === "play") {
      if (pendingCmd) {
        const cmd = pendingCmd;
        executedCmd = cmd;
        clearOverPlayTimer();
        if (cmd.kind === "over") {
          // Bowling analysis on the big screen: hold the armed over on its start frame for 3s,
          // THEN start the trajectory. Re-check it's still the active show when the timer fires
          // (a new cue/play/reset in between cancels it).
          overPlayTimer = setTimeout(() => {
            overPlayTimer = null;
            if (executedCmd === cmd) playShow(store.dispatch, cmd);
          }, OVER_PLAY_DELAY_MS);
        } else {
          playShow(store.dispatch, cmd);
        }
      }
    } else if (msg.type === "space") {
      // Operator Space, routed to the big screen. Decide against OUR own state:
      // if a multi-ball over is already playing → pause/resume in place; if it's
      // armed → start it; otherwise play the cued show.
      const s = store.getState().session;
      if (s.pitchMapActive && executedCmd?.kind === "over") {
        // Pitch map (morphed from the over) → Space replays the whole over.
        executeCommand(store.dispatch, executedCmd);
      } else if (s.multiTrajectoryPlay && s.multiTrajectoryComplete) {
        // Over finished: Space 1 → hide tubes (balls stay); Space 2 → advance to the
        // pitch map ONLY when combine (Bowling + Pitch mapping) is selected — else
        // replay. Mirrors the operator (DrsKeyBindings), so both behave the same.
        if (!s.multiTubesOff) store.dispatch(setMultiTubesOff(true));
        else if (s.multiCombinePitchMap) pitchMapFromAccumulated(store.dispatch);
        else store.dispatch(beginMultiPlayback());
      } else if (s.multiTrajectoryPlay && s.multiPlayStarted) {
        // Pause/Resume mode → toggle; Play Straight → restart from the top.
        if (s.multiPausable) store.dispatch(toggleMultiPaused());
        else store.dispatch(beginMultiPlayback());
      } else if (s.multiTrajectoryPlay) {
        store.dispatch(beginMultiPlayback());
      } else if (s.swingActive && !s.swingArmed) {
        // Swing already playing/settled → Space pauses/resumes the flight in place.
        store.dispatch(toggleSwingPaused());
      } else if (s.sixHighlight) {
        // 6 Highlights playing → Space pauses/resumes the batting trajectory + camera.
        store.dispatch(toggleSixPaused());
      } else if (pendingCmd) {
        executedCmd = pendingCmd;
        playShow(store.dispatch, pendingCmd);
      }
    } else if (msg.type === "reset") {
      clearOverPlayTimer();
      executedCmd = null;
      if (pendingCmd) cueShow(store.dispatch, pendingCmd); // back to initial
      else goIdle(store.dispatch);
    } else if (msg.type === "key") {
      // A camera/number key targeted at the big screen — interpret against the
      // big screen's own current show.
      applyKey(store, msg.key);
    } else if (msg.type === "snapshot") {
      // Operator pushed a score snapshot — show it on the big-screen ticker.
      store.dispatch(setSnapshot(msg.snapshot));
    } else if (msg.type === "bowling") {
      // Operator pushed the aggregated bowling analysis — feed the multi ticker.
      store.dispatch(setBowlingAnalysis(msg.bowling));
    } else if (msg.type === "ticker") {
      // Operator toggled the "Hide ticker" checkbox — mirror it on the big screen.
      store.dispatch(setHideTicker(!!msg.hide));
    } else if (msg.type === "lengthDist") {
      // Operator toggled the "Length distribution" checkbox — mirror on the big screen.
      store.dispatch(setHideLengthDist(!!msg.hide));
    } else if (msg.type === "hideBowler") {
      // Operator toggled the "Hide bowler container" checkbox — mirror on the big screen.
      store.dispatch(setHideBowler(!!msg.hide));
    } else if (msg.type === "bowlerNameOnly") {
      // Operator toggled the bowling ticker's "Name only" checkbox — mirror on the big screen.
      store.dispatch(setBowlerNameOnly(!!msg.on));
    } else if (msg.type === "bowlingTickerMetric") {
      store.dispatch(setBowlingTickerMetric(msg.metric));
    } else if (msg.type === "pitchFigures") {
      // Operator edited the pitch-map figures columns — mirror on the big screen.
      store.dispatch(setPitchFigures(msg.config));
    } else if (msg.type === "pitchBowlerType") {
      store.dispatch(setPitchBowlerType(msg.bowlerType));
    } else if (msg.type === "pitchBowlerName") {
      store.dispatch(setPitchBowlerName(msg.name ?? ""));
    } else if (msg.type === "bowlingPitchHideNumber") {
      store.dispatch(setBowlingPitchHideNumber(!!msg.on));
    } else if (msg.type === "pitchFakeBalls") {
      store.dispatch(setPitchFakeBalls(msg.list || []));
    } else if (msg.type === "swingBowlerType") {
      store.dispatch(setSwingBowlerType(msg.bowlerType));
    } else if (msg.type === "pitchNameKeepCase") {
      store.dispatch(setPitchNameKeepCase(!!msg.on));
    } else if (msg.type === "pitchTickerText") {
      store.dispatch(setPitchTickerText(msg.text ?? ""));
    } else if (msg.type === "stumpBowlerName") {
      store.dispatch(setStumpBowlerName(msg.name ?? ""));
    } else if (msg.type === "ballCategories") {
      store.dispatch(setBallCategories(msg.cats || {}));
    } else if (msg.type === "pitchGlow") {
      store.dispatch(setPitchGlow(msg.glow || {}));
    } else if (msg.type === "stumpGlow") {
      store.dispatch(setStumpGlow(msg.glow || {}));
    } else if (msg.type === "wagonOptions") {
      const o = msg.opts || {};
      if (o.style !== undefined) store.dispatch(setWagonStyle(o.style));
      if (o.sweep !== undefined) store.dispatch(setWagonSweep(o.sweep));
      if (o.reveal !== undefined) store.dispatch(setWagonReveal(o.reveal));
      if (o.duration !== undefined) store.dispatch(setWagonDuration(o.duration));
      if (o.batterName !== undefined) store.dispatch(setWagonBatterName(o.batterName));
      if (o.nameKeepCase !== undefined) store.dispatch(setWagonNameKeepCase(o.nameKeepCase));
      if (o.fours !== undefined || o.sixes !== undefined)
        store.dispatch(setWagonOutcomes({ fours: o.fours, sixes: o.sixes }));
      if (o.hideCard !== undefined) store.dispatch(setWagonHideCard(o.hideCard));
      if (o.hideName !== undefined) store.dispatch(setWagonHideName(o.hideName));
      if (o.batHand !== undefined) store.dispatch(setWagonBatHand(o.batHand));
    } else if (msg.type === "interceptOptions") {
      const o = msg.opts || {};
      if (o.name !== undefined) store.dispatch(setInterceptName(o.name));
      if (o.nameKeepCase !== undefined) store.dispatch(setInterceptNameKeepCase(o.nameKeepCase));
    } else if (msg.type === "sixShowAngle") {
      store.dispatch(setSixShowAngle(!!msg.on));
    } else if (msg.type === "sixShowSpeed") {
      store.dispatch(setSixShowSpeed(!!msg.on));
    } else if (msg.type === "sixRotateStadium") {
      store.dispatch(setSixRotateStadium(!!msg.on));
    } else if (msg.type === "sixRotateDeg") {
      store.dispatch(setSixRotateDeg(msg.deg));
    } else if (msg.type === "scene") {
      // Operator toggled Day/Night — mirror it on the big screen.
      store.dispatch(setScene(msg.mode));
    } else if (msg.type === "pip") {
      // Operator toggled PiP ⟷ Full. The big screen resizes ITSELF — exit fullscreen
      // first (a fullscreen window ignores resizeTo), then size the window. Its own
      // resize listener flips session.compact → 3D-only / full layout.
      try {
        if (msg.on) {
          if (document.fullscreenElement) {
            document.exitFullscreen?.().catch(() => {});
          }
          // Resize after the fullscreen exit settles.
          setTimeout(() => {
            try {
              window.resizeTo(400, 600);
            } catch {
              /* resizeTo blocked in rare setups — ignore */
            }
          }, 80);
        } else {
          const w = window.screen?.availWidth || 1920;
          const h = window.screen?.availHeight || 1080;
          window.moveTo(0, 0);
          window.resizeTo(w, h);
        }
      } catch {
        /* ignore */
      }
    } else if (msg.type === "close") {
      // Operator pressed Stop without a window handle — close ourselves.
      try {
        window.close();
      } catch {
        /* ignore */
      }
    } else if (msg.type === "ping") {
      // Operator is asking if a big screen is alive — answer it.
      ch.postMessage({ type: "pong" });
    }
  };

  // While hidden the browser throttles rAF, so a running animation's clock
  // jumps. On becoming visible again, replay whatever is currently on screen.
  const onVisibility = () => {
    if (document.visibilityState === "visible" && executedCmd) {
      playShow(store.dispatch, executedCmd);
    }
  };

  ch.addEventListener("message", onMessage);
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    ch.removeEventListener("message", onMessage);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
