// The big-screen broadcast view. Same 3D scene + show overlays as the operator
// app, but WITHOUT any operator control tools (no TrajectoryPicker, no
// DrsKeyBindings, no operator dialogs — those are gated out in Overlay2D).
// Driven entirely by show commands from the operator tab (see crossTabSync).
// Boots into the idle default scene.
//
// PiP / COMPACT: when this window is small (≤400×600) it shows ONLY the 3D (video
// hidden, panels hidden), fills the box, keeps the stadium, and disables auto-
// fullscreen. One global flag `session.compact` drives it. See
// docs/PIP_PICTURE_IN_PICTURE.md.
import React, { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import ThreeScene from "./components/ThreeScene";
import Overlay2D from "./components/2d_components/Overlay2D";
import DrsVideoLayer from "./components/DrsVideoLayer";
import MultiTicker from "./components/drs/MultiTicker";
import MultiPitchTicker from "./components/drs/MultiPitchTicker";
import PitchMapOverlay from "./components/2d_components/PitchMapOverlay";
import StumpTicker from "./components/drs/StumpTicker";
import WagonTicker from "./components/drs/WagonTicker";
import InterceptionTicker from "./components/drs/InterceptionTicker";
import ScoreTicker from "./components/ScoreTicker";
import { setCompact } from "./store/slices/sessionSlice";

// PiP triggers when the window is small in EITHER dimension (tunable).
const COMPACT_MAX_W = 400;
const COMPACT_MAX_H = 600;

function BroadcastApp() {
  const dispatch = useDispatch();
  const compact = useSelector((s) => s.session.compact);

  // Measure OUR OWN window → set the global compact flag, on mount and on resize, so
  // dragging / operator-resizing the window flips the profile live.
  useEffect(() => {
    const apply = () =>
      dispatch(
        setCompact(
          window.innerWidth <= COMPACT_MAX_W || window.innerHeight <= COMPACT_MAX_H,
        ),
      );
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [dispatch]);

  // Auto-fullscreen — ONLY when NOT compact. A small PiP window must stay small, so
  // all fullscreen behaviour (open, click-to-full, F-key) is disabled while compact.
  useEffect(() => {
    if (compact) return; // PiP: never go fullscreen (no banner, stays small)
    const go = () => {
      const el = document.documentElement;
      if (el.requestFullscreen && !document.fullscreenElement) {
        el.requestFullscreen().catch(() => {});
      }
    };
    go(); // best-effort on (re)entering full mode
    const onFirst = () => {
      go();
      window.removeEventListener("pointerdown", onFirst);
      window.removeEventListener("keydown", onFirst);
    };
    window.addEventListener("pointerdown", onFirst);
    window.addEventListener("keydown", onFirst);
    const onKey = (e) => {
      if ((e.key === "f" || e.key === "F") && !document.fullscreenElement) go();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onFirst);
      window.removeEventListener("keydown", onFirst);
      window.removeEventListener("keydown", onKey);
    };
  }, [compact]);

  return (
    <div
      className="relative w-screen h-screen bg-black"
      style={{ isolation: "isolate", cursor: "none" }}
    >
      {/* Hide the mouse cursor everywhere on the big screen (including the
          canvas and any child that sets its own cursor). */}
      <style>{`* { cursor: none !important; }`}</style>

      {/* DrsVideoLayer stays MOUNTED even in compact — it drives the DRS phase
          progression + marker timing. In compact it's just VISUALLY hidden
          (opacity 0) so you see only the 3D, while DRS still works end to end. */}
      <div style={compact ? { opacity: 0, pointerEvents: "none" } : undefined}>
        <DrsVideoLayer />
      </div>

      {/* The 3D — fills the box in compact so it never crops to black. */}
      <ThreeScene fill={compact} />

      {/* 2D overlays. The DRS decision panels show in BOTH modes — in compact they use
          a corner layout (see DrsDecisionOverlay). Other overlays are mode-gated inside. */}
      <Overlay2D />

      {/* Tickers — full window only. In the compact PiP it's 3D only (no tickers). */}
      {!compact && <MultiTicker />}
      {/* Pitch mapping: the broadcast overlay (distance markers + LENGTH DISTRIBUTION %
          + batsman + legend). MultiPitchTicker now only adds the multi-over bowler
          figures bar (single-over returns null — the overlay covers it). */}
      {!compact && <PitchMapOverlay />}
      {!compact && <MultiPitchTicker />}
      {/* Stump ticker shows in PiP too (it self-scales to the small window). */}
      <StumpTicker />
      <WagonTicker />
      <InterceptionTicker />
      {/* Score ticker — fed by snapshots pushed from the operator (crossTabSync). */}
      {!compact && <ScoreTicker />}
    </div>
  );
}

export default BroadcastApp;
