import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { drsReplay } from "../drs/drsController";
import { isLocal } from "../dataSource";
import {
  sendShow,
  sendReset,
  sendSpace,
  sendBroadcastKey,
} from "../broadcastChannel";
import {
  goIdle,
  cueShow,
  playShow,
  playDrs,
  switchDrsCamera,
  executeCommand,
  pitchMapFromAccumulated,
} from "./drs/showCommands";
import {
  setDrsViewAngle,
  setTrajectoryPickerOpen,
  toggleTrajectoryPicker,
  toggleDrsReviewPaused,
  setDrsReviewPaused,
} from "../store/slices/drsSlice";
import {
  setMultiViewAngle,
  setSwingViewAngle,
  setSixViewAngle,
  setPitchMapView,
  beginMultiPlayback,
  toggleMultiPaused,
  setMultiTubesOff,
  replayMultiTrajectory,
  toggleSwingPaused,
  toggleSixPaused,
} from "../store/slices/sessionSlice";

// Default DRS test delivery. DRS deliveries live in the dataset (innings 1);
// the "T" shortcut replays the first ball (in-1/1/1) on camera 0.
const TEST_FOLDER = "/data/in-1/1/1/";

// Number keys to review-angle mapping. Only accepted once DRS is in the
// `review` phase (i.e. after the ball trajectory finishes).
const VIEW_KEYS = {
  "1": "side",
  "2": "top",
  "3": "behind",
  "4": "front",
};

// In No-Ball mode the number keys switch the PHYSICAL camera feed by INDEX
// instead of orbiting (1 → camera 0, 2 → camera 1, …).
const cameraIndexForKey = (key) => {
  const n = Number(key);
  return Number.isInteger(n) && n >= 1 ? String(n - 1) : null;
};

export default function DrsKeyBindings() {
  const dispatch = useDispatch();
  const { active, phase, noBall, cameras, reviewPaused } = useSelector(
    (s) => s.drs,
  );
  const {
    multiTrajectoryPlay,
    multiPlayStarted,
    multiPausable,
    multiTubesOff,
    multiTrajectoryComplete,
    multiCombinePitchMap,
    pitchMapActive,
    swingActive,
    swingArmed,
    sixHighlight,
  } = useSelector((s) => s.session);
  // 6 Highlights (flag-based so it also applies in machine mode).
  const sixActive = sixHighlight;
  // Where the camera-angle keys go: "operator" (this tool) or "broadcast".
  const cameraTarget = useSelector((s) => s.broadcast.cameraTarget);
  const currentShow = useSelector((s) => s.broadcast.currentShow);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.drsReplay = drsReplay;
    }
    const onKey = (e) => {
      if (e.repeat) return;
      const target = e.target;
      const tag = target && target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) {
        return;
      }
      if (e.key === "t" || e.key === "T") {
        // Dev test replay from the LOCAL sample folder. Gated to local/sample mode ONLY so it
        // can NEVER load hardcoded dummy data while connected to a machine (mission).
        if (isLocal()) {
          playDrs(dispatch, TEST_FOLDER, {
            originalDecision: "NOT_OUT",
            isRightHanded: true,
            softSignal: false,
          });
        }
        return;
      }
      // Return to the idle default scene — on whichever screen the tab targets.
      if (e.key === "r" || e.key === "R") {
        if (cameraTarget === "broadcast") sendShow({ kind: "idle" });
        else goIdle(dispatch);
        return;
      }
      // Toggle the bowling-trajectory picker popup.
      if (e.key === "a" || e.key === "A") {
        dispatch(toggleTrajectoryPicker());
        return;
      }
      if (e.key === "Escape") {
        dispatch(setTrajectoryPickerOpen(false));
        return;
      }
      // Transport keys respect the target. Space = play, 0 = reset to the
      // initial state — for ANY show type (over / pitch / single / DRS).
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        // DRS ACTIVELY PLAYING (video / trajectory): Space pauses / resumes in place
        // on the OPERATOR tool only (video + 3D + camera freeze; OrbitControls take
        // over while paused). NOT the settled "review" phase — there Space REPLAYS
        // (falls through below), and zoom/pan already works via reviewInteractive.
        // Not the cued "paused" phase either (pre-play → fall through to start).
        if (active && (phase === "video" || phase === "trajectory")) {
          dispatch(toggleDrsReviewPaused());
        }
        // Broadcast target: let the big screen decide (start vs pause/resume).
        else if (cameraTarget === "broadcast") sendSpace();
        // Swing analysis: Space pauses / resumes the flight in place (operator tool).
        else if (swingActive && !swingArmed) {
          dispatch(toggleSwingPaused());
        }
        // 6 Highlights: Space pauses / resumes the batting trajectory in place.
        else if (sixActive) {
          dispatch(toggleSixPaused());
        }
        // Pitch map (morphed from the over): Space replays the whole over.
        else if (pitchMapActive && currentShow?.kind === "over") {
          executeCommand(dispatch, currentShow);
        }
        // Over FINISHED.
        else if (multiTrajectoryPlay && multiTrajectoryComplete) {
          // Combine ("Pitch mapping" also selected): Space goes STRAIGHT to the pitch map
          // of this same over — NO intermediate "tubes off / ball on the stumps" step; the
          // camera glides smoothly into the pitch-map view.
          if (multiCombinePitchMap) pitchMapFromAccumulated(dispatch);
          // Bowling-only: Space 1 → hide tubes (balls stay); Space 2 → replay the over.
          else if (!multiTubesOff) dispatch(setMultiTubesOff(true));
          else dispatch(beginMultiPlayback());
        }
        // Still playing: "Pause / Resume" mode pauses/resumes in place; "Play
        // Straight" mode restarts from the top.
        else if (multiTrajectoryPlay && multiPlayStarted) {
          if (multiPausable) dispatch(toggleMultiPaused());
          else dispatch(beginMultiPlayback());
        }
        // Multi-ball armed → Space starts it.
        else if (multiTrajectoryPlay) dispatch(beginMultiPlayback());
        else if (currentShow) playShow(dispatch, currentShow);
        return;
      }
      if (e.key === "0") {
        if (cameraTarget === "broadcast") sendReset();
        else if (multiTrajectoryPlay) dispatch(replayMultiTrajectory());
        else if (currentShow) cueShow(dispatch, currentShow);
        return;
      }

      // No-Ball: number keys switch the physical camera (video + 3D overlay
      // both change to that feed). Bounded to the cameras this ball ships, so a
      // key past the count (e.g. "4" with 3 cameras) is a no-op. Routed
      // tab-aware like the angle keys.
      if (active && noBall) {
        const idx = cameraIndexForKey(e.key);
        if (idx != null) {
          if (Number(idx) < cameras.length) {
            if (cameraTarget === "broadcast") sendBroadcastKey(e.key);
            else switchDrsCamera(dispatch, currentShow, idx);
          }
          return; // consume the number key either way
        }
      }

      // Camera-angle keys (1-5) route to the selected target.
      const view = VIEW_KEYS[e.key];
      if (!view) return;

      if (cameraTarget === "broadcast") {
        // The big screen interprets the key against its own current show.
        sendBroadcastKey(e.key);
        return;
      }

      // Operator target: apply to this tool's current show.
      if (pitchMapActive) {
        if (e.key === "1") dispatch(setPitchMapView("top"));
        else if (e.key === "2") dispatch(setPitchMapView("overview"));
        else if (e.key === "3") dispatch(setPitchMapView("broadcast")); // broadcast ¾ TV angle
        else if (e.key === "4") dispatch(setPitchMapView("spider")); // spidercam (high, steep)
        return;
      }
      // 6 Highlights: key 1 = side view, key 2 = main (broadcast) cam.
      if (sixActive) {
        if (e.key === "1") dispatch(setSixViewAngle("side"));
        else if (e.key === "2") dispatch(setSixViewAngle("main"));
        return;
      }
      if (active && phase === "review") {
        // A camera key takes control back from a manual orbit/zoom: resume (so the
        // scripted move runs instead of OrbitControls) and glide to the view. The
        // tween starts from the current camera pose (fromCurrent) → no snap.
        if (reviewPaused) dispatch(setDrsReviewPaused(false));
        dispatch(setDrsViewAngle(view));
      } else if (multiTrajectoryPlay && multiTrajectoryComplete) {
        dispatch(setMultiViewAngle(view));
      } else if (swingActive) {
        // Swing analysis: keys 1-4 glide to the DRS-style review angles.
        dispatch(setSwingViewAngle(view));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    active,
    phase,
    reviewPaused,
    noBall,
    cameras,
    multiTrajectoryPlay,
    multiPlayStarted,
    multiPausable,
    multiTubesOff,
    multiTrajectoryComplete,
    multiCombinePitchMap,
    pitchMapActive,
    swingActive,
    swingArmed,
    sixActive,
    cameraTarget,
    currentShow,
    dispatch,
  ]);
  return null;
}
