// Overlay2D.jsx
// Trimmed to the DRS-era build: the live sensor-session UI (SessionCard,
// sensor/details cards, test-ball, pause/resume, runs, radar countdown,
// session start/end overlays, global timer) was removed. Only the overlays
// used by DRS / No-Ball / Bowling Analysis remain: the missing-trajectory /
// missing-video error screens, the batting-display black overlay, and the DRS
// decision panels.
import { useSelector } from "react-redux";
import { useEffect, useState } from "react";
import NoTrajectoryErrorOverlay from "./NoTrajectoryErrorOverlay";
import BlackOverlay from "./BlackOverlay";
import NoVideoErrorOverlay from "./NoVideoErrorOverlay";
import DrsDecisionOverlay from "./DrsDecisionOverlay";
import SwingLegend from "./SwingLegend";
import NoBallHeightOverlay from "./NoBallHeightOverlay";

// Grace period before the spinner appears. The big screen loads the video in its own
// context, but it's almost always already in the browser cache (the operator just
// fetched it), so that load is fast. Deferring the spinner means a cached load
// finishes first and NO spinner flashes — it only shows for a genuinely slow load.
const LOADER_GRACE_MS = 450;

const Overlay2D = () => {
  const { animationType } = useSelector((state) => state.session);
  const {
    active: drsActive,
    noBall: drsNoBall,
    phase: drsPhase,
    videoStarted: drsVideoStarted,
  } = useSelector((s) => s.drs);

  // Want the loader from Start until the delivery video's first frame is ready, so
  // nothing partial flashes before playback — then reveal the video + overlay.
  const wantLoader =
    drsActive &&
    !drsVideoStarted &&
    (drsPhase === "loading" ||
      drsPhase === "operatorInput" ||
      drsPhase === "video");

  // Only actually SHOW it once loading has run past the grace period (so a fast /
  // cached load never flashes the spinner).
  const [showLoader, setShowLoader] = useState(false);
  useEffect(() => {
    if (!wantLoader) {
      setShowLoader(false);
      return;
    }
    const t = setTimeout(() => setShowLoader(true), LOADER_GRACE_MS);
    return () => clearTimeout(t);
  }, [wantLoader]);

  // While a DRS replay is still loading its assets (e.g. switching camera, or a
  // re-run), the media pipeline is briefly reset to "NoTrajectory" before the
  // new video/trajectory is ready. Don't flash the missing-data error screens
  // during that window — a genuine load failure instead ends DRS (phase → idle),
  // so these overlays still show for real errors once the replay is playing.
  const drsSettingUp =
    drsActive && (drsPhase === "loading" || drsPhase === "operatorInput");

  return (
    <div className="absolute top-0 left-0 w-full h-full z-[999999] pointer-events-none [&>*]:pointer-events-auto">
      {/* Missing-data error screens — can fire during a DRS / bowling replay. */}
      {animationType == "NoTrajectory" && !drsSettingUp && <NoTrajectoryErrorOverlay />}
      {animationType == "NoVideo" && !drsSettingUp && <NoVideoErrorOverlay />}
      {/* Black overlay for the batting display during bowling sessions. */}
      <BlackOverlay />
      {/* Decision panels show for a real DRS review, not for a no-ball check. */}
      {drsActive && !drsNoBall && <DrsDecisionOverlay />}
      {/* No-ball HEIGHT check: ball-height-at-crease vs batsman waist/shoulder/head. */}
      {drsActive && drsNoBall && <NoBallHeightOverlay />}
      {/* Swing analysis legend (Actual / Intended / Deviation). */}
      <SwingLegend />
      {/* (6-Highlights distance/height lines are drawn in 3D by SixLabels now — no 2D
          overlay, so they can never misalign with the trajectory.) */}
      {/* Loader until the delivery video is ready (no partial flash on Start). */}
      {showLoader && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black">
          <div className="w-12 h-12 rounded-full border-4 border-white/20 border-t-sky-400 animate-spin" />
          <span className="text-[13px] font-semibold tracking-wide text-white/80">
            Loading review…
          </span>
        </div>
      )}
    </div>
  );
};

export default Overlay2D;
