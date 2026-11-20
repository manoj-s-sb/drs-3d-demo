import React, { useMemo, Suspense } from "react";
import { useSelector } from "react-redux";
import Stadium from "./Stadium";
import Ground from "./Ground";
import PitchMapZones from "./PitchMapZones";
import Circle_30 from "./Circle_30";
import WhiteLine from "./WhiteLine";
import Wicket from "./Wicket";
import NightDome from "./NightDome";
import GlbBall from "./GlbBall";
import DynamicLights from "./DynamicLights";
import GroundCameraAnimation from "./GroundCameraAnimation";
import UserBoardCameraAnimation from "./UserBoardCameraAnimation";
import { Environment, OrbitControls } from "@react-three/drei";
import CameraHandler from "./CameraHandler";
import { isBroadcast } from "../viewMode";

// While the DRS video is showing, the video itself is the backdrop — the CG
// stadium/ground/stumps + pitch lines are hidden so only the ball and its
// trajectory render on top of the video (see the phase checks below).

// Image-based lighting HDRI. We SELF-HOST the "city" preset's file
// (potsdamer_platz_1k.hdr → public/hdri/) and load it via `files=` so NOTHING is
// fetched from a CDN — the app works fully offline with identical lighting.
// (preset="city" used to fetch this from raw.githack.com/pmndrs/drei-assets.)
// The boundary below still guards against any load failure so it never white-
// screens — it just skips image-based lighting and renders from the other lights.
const ENV_HDRI = "/hdri/potsdamer_platz_1k.hdr";
class EnvBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err) {
    console.warn("[FixedScene] Environment lighting unavailable (offline?):", err?.message);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

const FixedScene = React.memo(() => {
  const debugMode = useMemo(() => {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(window.location.search);
    return params.get("debug") === "true";
  }, []);
  const {
    active: drsActive,
    phase: drsPhase,
    reviewPaused: drsReviewPaused,
    reviewInteractive: drsReviewInteractive,
    withVideo: drsWithVideo,
  } = useSelector((s) => s.drs);
  const multiTrajectoryPlay = useSelector((s) => s.session.multiTrajectoryPlay);
  const multiPaused = useSelector((s) => s.session.multiPaused);
  const multiInteractive = useSelector((s) => s.session.multiInteractive);
  const multiManualCam = useSelector((s) => s.session.multiManualCam);
  const pitchMapActive = useSelector((s) => s.session.pitchMapActive);
  const stumpMapActive = useSelector((s) => s.session.stumpMapActive);
  const stumpMapInteractive = useSelector((s) => s.session.stumpMapInteractive);
  const wagonActive = useSelector((s) => s.session.wagonActive);
  const wagonInteractive = useSelector((s) => s.session.wagonInteractive);
  const interceptActive = useSelector((s) => s.session.interceptActive);
  const interceptInteractive = useSelector((s) => s.session.interceptInteractive);
  const swingActive = useSelector((s) => s.session.swingActive);
  const swingInteractive = useSelector((s) => s.session.swingInteractive);
  const swingPaused = useSelector((s) => s.session.swingPaused);
  // PiP/compact: there's no video layer behind the 3D, so the CG pitch must stay
  // visible for the WHOLE DRS (don't blank it during the video phase like the full
  // big screen does). See docs/PIP_PICTURE_IN_PICTURE.md.
  const compact = useSelector((s) => s.session.compact);
  // Day/Night: night dims the HDRI and adds the night-sky dome + glb floodlights.
  const night = useSelector((s) => s.session.scene) === "night";
  // 6 Highlights: the broadcast SixHighlightCamera owns the camera → no OrbitControls.
  // Flag-based (not URL) so it works in machine mode too.
  const sixActive = useSelector((s) => s.session.sixHighlight);
  // A SINGLE-ball trajectory (BowlingTrajectory / BattingTrajectory) drives the camera
  // itself → OrbitControls must stay off so they don't fight. (trajectoryUrl is set
  // only for single plays; the multi/pitch views use accumulated data, not this.)
  const singleTrajActive = useSelector(
    (s) => !!s.session.trajectoryUrl && s.session.animationType === "TrajectoryView",
  );
  // Pitch map hands the camera to OrbitControls once its move settles.
  const pitchMapInteractive = useSelector((s) => s.session.pitchMapInteractive);
  // DRS is still fetching assets (before the video) → show nothing but the loader.
  const drsPreparing =
    drsActive && (drsPhase === "loading" || drsPhase === "operatorInput");
  // The LBW strip is COMMON to every ball: it sits over the mp4 (AR) during the
  // video/paused/trajectory phases — the rule only affects the post-video 3D, not
  // this overlay. Full pitch lines show in review / non-DRS. With the video overlay OFF
  // there's no mp4 to strip over → show the full pitch lines from the start (on the CG
  // ground), same as the review.
  const drsAROverlay =
    drsActive &&
    drsWithVideo &&
    (drsPhase === "video" || drsPhase === "paused" || drsPhase === "trajectory");
  // Hide the CG pitch for the whole DRS until the review phase — ONLY because the video is
  // the backdrop during video/trajectory. When there's no video backdrop (compact/PiP, OR
  // the operator turned the video overlay OFF), keep the stadium visible the whole time so
  // the 3D DRS shows on the ground from the start (no black screen before review).
  // 6 Highlights now plays ON THE STADIUM like every other show (no green chroma).
  const hideStadium =
    compact || !drsWithVideo ? false : drsActive && drsPhase !== "review";

  return (
    <>
      {/* Keep the CG pitch MOUNTED and just toggle visibility, so it doesn't
          re-mount (pop in) when the DRS video hands off to the 3D review. */}
      <group visible={!hideStadium}>
        <Stadium />
        <Ground />
        <PitchMapZones />
        <Circle_30 />
        {!debugMode && <Wicket />}
      </group>
      {/* WARM the KTX2 cricket-ball GLB at app startup. ball_white.glb is KTX2 and can't be
          useGLTF.preload()'d (that uses the default loader and poisons the cache), so without
          this it was fetched lazily the FIRST time any module (pitch map / bowling / stump /
          DRS markers) showed a ball — suspending the scene and causing the ~1s black on the
          first view switch. Mounting one hidden instance here loads it once, during the
          initial app load, so every later module reuses the cache and never suspends. */}
      <GlbBall visible={false} />
      {/* Strip-only over the mp4 during the DRS AR phases; full pitch LINES + the LBW
          strip in every other view (bowling analysis, swing, pitch map, DRS review). */}
      {!debugMode && !drsPreparing && (
        <WhiteLine stripOnly={drsAROverlay} />
      )}
      {!debugMode && <GroundCameraAnimation />}
      {!hideStadium && <UserBoardCameraAnimation />}
      {!debugMode && (
        <EnvBoundary>
          <Suspense fallback={null}>
            <Environment files={ENV_HDRI} environmentIntensity={night ? 0.1 : 1} />
          </Suspense>
        </EnvBoundary>
      )}

      {/* Night: the stadium floodlights (lights only — never cover the mp4). */}
      {!debugMode && night && (
        <Suspense fallback={null}>
          <DynamicLights />
        </Suspense>
      )}
      {/* Night-sky dome — only when the CG stadium is visible, so it never renders in
          front of the DRS mp4 video (which is the backdrop while the stadium is hidden). */}
      {!debugMode && night && !hideStadium && (
        <Suspense fallback={null}>
          <NightDome />
        </Suspense>
      )}

      <OrbitControls
        makeDefault
        enabled={
          !isBroadcast &&
          // Idle: free orbit. Pitch map: only once its camera move has settled.
          // DRS: while PAUSED (Space) OR once a camera move has SETTLED → zoom/pan
          // on that view. A new key re-takes control (clears reviewInteractive).
          ((!drsActive &&
            !multiTrajectoryPlay &&
            !pitchMapActive &&
            !stumpMapActive &&
            !wagonActive &&
            !interceptActive &&
            !swingActive &&
            !sixActive &&
            !singleTrajActive) ||
            (pitchMapActive && pitchMapInteractive) ||
            // Stump map: orbit once its camera entry has settled.
            (stumpMapActive && stumpMapInteractive) ||
            // Wagon wheel: orbit once its camera entry has settled.
            (wagonActive && wagonInteractive) ||
            // Interception map: orbit once its camera entry has settled.
            (interceptActive && interceptInteractive) ||
            // Swing analysis: orbit once the flight has settled OR while paused.
            (swingActive && (swingInteractive || swingPaused)) ||
            // DRS: ONLY in the review phase (never during the mp4 video / ball
            // animation) AND once paused OR the review camera has settled.
            (drsActive &&
              drsPhase === "review" &&
              (drsReviewPaused || drsReviewInteractive)) ||
            // Bowling analysis: zoom/pan/tilt while PAUSED (Space), once a move has
            // SETTLED (multiInteractive), OR after the operator grabbed the camera
            // (multiManualCam → stays manual through resume, Option B).
            (multiTrajectoryPlay &&
              (multiPaused || multiInteractive || multiManualCam)))
        }
        enableDamping
        dampingFactor={0.05}
        maxPolarAngle={Math.PI / 2}
      />
      {!debugMode && <CameraHandler />}
    </>
  );
});

export default FixedScene;
