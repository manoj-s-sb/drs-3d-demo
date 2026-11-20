import React, { Suspense, useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Loader, useProgress } from "@react-three/drei";
import FixedScene from "./FixedScene";
import BattingTrajectory from "./BattingTrajectory";
import BowlingTrajectory from "./BowlingTrajectory";
import AccumulatedTrajectories from "./AccumulatedTrajectories";
import MultiBowlingTrajectory from "./drs/MultiBowlingTrajectory";
import MultiCameraAngles from "./drs/MultiCameraAngles";
import MultiPitchMap from "./drs/MultiPitchMap";
import SwingAnalysis from "./drs/SwingAnalysis";
import SixHighlightCamera from "./drs/SixHighlightCamera";
import SixLabels from "./drs/SixLabels";
import SixFireEffect from "./drs/SixFireEffect";
import StumpMap from "./drs/StumpMap";
import MultiInterception from "./drs/MultiInterception";
import MultiWagonWheel from "./drs/MultiWagonWheel";
import MultiAutoAdvance from "./drs/MultiAutoAdvance";
import DrsCameraSequence from "./DrsCameraSequence";
import DrsMarkers from "./DrsMarkers";

// Keep the ACTIVE camera's aspect matched to the viewport every frame. R3F only
// updates its DEFAULT camera on resize, but several drivers swap in their own camera
// (GroundCameraAnimation, UserBoardCameraAnimation) whose aspect then goes stale when
// the window resizes — making the 3D look stretched in a portrait PiP window. This
// corrects whichever camera is live, cheaply (only when it actually drifts).
function CameraAspectSync() {
  const { camera, size } = useThree();
  useFrame(() => {
    if (!camera?.isPerspectiveCamera || !size.height) return;
    const want = size.width / size.height;
    if (Math.abs(camera.aspect - want) > 0.001) {
      camera.aspect = want;
      camera.updateProjectionMatrix();
    }
  });
  return null;
}

// Drei's <Loader> paints a dark full-screen overlay whenever ANYTHING loads through
// three's loaders — including the first time a module fetches the KTX2 cricket-ball GLB
// on a view switch. That overlay (plus the suspended scene behind it) was the ~1s BLACK
// seen when switching idle→pitch-map / any module. We only want the loader for the very
// FIRST app load; after that, every asset is cached/warmed, so any transient load must
// NOT blank the screen. This renders <Loader> until the first load batch completes, then
// unmounts it for the rest of the session.
function InitialLoader() {
  const { active, progress } = useProgress();
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!active && progress >= 100) setDone(true);
  }, [active, progress]);
  if (done) return null;
  return <Loader />;
}

const ThreeScene = ({ fill = false } = {}) => {
  const { sessionType, trajectoryUrl, multiTrajectoryPlay } = useSelector(
    (state) => state.session,
  );
  const {
    active: drsActive,
    phase: drsPhase,
    virtualCamera,
    withVideo: drsWithVideo,
  } = useSelector((s) => s.drs);

  // Render the 3D canvas in a fixed box for the WHOLE DRS session (video AND
  // review), so the canvas never resizes at the video→review boundary — that
  // resize was the cause of the jerk. Use the CALIBRATION's aspect (DRS feeds
  // are 1920x1088, not exactly 16:9) so the cover box crops exactly like the
  // video's object-cover and the overlay aligns. Non-DRS → full size.
  const VIDEO_AR = virtualCamera?.aspect || 16 / 9;
  const containerRef = useRef(null);
  const [box, setBox] = useState(null); // {width,height} px, or null = fill

  // Cross-dissolve the 3D layer IN at the video→review handoff: the CG scene fades up
  // UNDERNEATH the still-opaque video, so by the time the video starts to fade out (after
  // DrsVideoLayer's FADE_HOLD_MS = 520) the 3D is already fully up → the video dissolves to
  // reveal a solid 3D, never black. Keep this SHORTER than that hold.
  const CROSSFADE_MS = 500;
  const prevPhaseRef = useRef(drsPhase);
  const [fadeOpacity, setFadeOpacity] = useState(1);
  const [fadeAnimating, setFadeAnimating] = useState(false);

  useEffect(() => {
    const was = prevPhaseRef.current;
    prevPhaseRef.current = drsPhase;
    // Only cross-dissolve the 3D in over the video. With the video overlay OFF there's
    // nothing to dissolve from, so skip it (keeps the 3D fully visible — no flash).
    if (drsWithVideo && drsActive && was !== "review" && drsPhase === "review") {
      // Start hidden (no transition), then animate to full on the next frame.
      setFadeAnimating(false);
      setFadeOpacity(0);
      const id = requestAnimationFrame(() => {
        setFadeAnimating(true);
        setFadeOpacity(1);
      });
      return () => cancelAnimationFrame(id);
    }
    if (!drsActive) {
      setFadeAnimating(false);
      setFadeOpacity(1);
    }
  }, [drsActive, drsPhase, drsWithVideo]);

  useEffect(() => {
    const el = containerRef.current;
    // `fill` (PiP/compact) → no cover box; the 3D fills the whole small window so it
    // never crops to black. Otherwise the DRS cover-box keeps the overlay aligned.
    if (fill || !drsActive || !el) {
      setBox(null);
      return;
    }
    const compute = () => {
      const rect = el.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      if (!w || !h) return;
      // COVER: the 16:9 box fills the whole container (no gaps on any side); the
      // overflowing dimension is clipped. Matches the <video>'s object-cover, so
      // the overlay stays aligned to the video in every case.
      let bw;
      let bh;
      if (w / h > VIDEO_AR) {
        bw = w; // container wider than 16:9 → fill width, overflow height
        bh = w / VIDEO_AR;
      } else {
        bh = h; // container taller than 16:9 → fill height, overflow width
        bw = h * VIDEO_AR;
      }
      setBox({ width: bw, height: bh });
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [drsActive, VIDEO_AR, fill]);

  return (
    <div
      ref={containerRef}
      className={`w-full h-full relative ${
        drsActive ? "overflow-hidden" : "bg-black"
      }`}
      style={{ zIndex: 1 }}
    >
      <div
        style={
          box
            ? {
                // COVER, centered on both axes (same as the video's object-cover)
                // via absolute positioning so flexbox can't shrink it.
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: "translate(-50%, -50%)",
                width: box.width,
                height: box.height,
                // Cross-dissolve the 3D in at the review handoff.
                opacity: fadeOpacity,
                transition: fadeAnimating
                  ? `opacity ${CROSSFADE_MS}ms ease-in-out`
                  : "none",
              }
            : { width: "100%", height: "100%" }
        }
      >
      <Canvas
        shadows
        camera={{
          position: [30.48, 92.76, 111.19],
          fov: 45,
          far: 10000,
          near: 0.1,
        }}
        // toneMappingExposure < 1 darkens the whole tone-mapped scene (default 1).
        gl={{ antialias: true, physicallyCorrectLights: true, alpha: true, toneMappingExposure: 0.8 }}
        style={{ background: "transparent" }}
      >
        {/* FixedScene (stadium/ground/pitch) is in its OWN Suspense boundary so a
            module first-loading an asset (e.g. the KTX2 ball) can NEVER unmount the
            stadium → no full-screen black during view switches. */}
        <Suspense fallback={null}>
          <CameraAspectSync />
          <FixedScene />
        </Suspense>

        {/* All the switchable modules share a SEPARATE boundary. If one ever suspends
            on a fresh asset, only this layer blanks (it's invisible until it has data
            anyway) while the stadium stays fully rendered behind it. */}
        <Suspense fallback={null}>
          {/* Static accumulated trajectories — hidden while the animated
              "Select All" playback is running so the two don't double-draw. */}
          {!multiTrajectoryPlay && <AccumulatedTrajectories />}
          <MultiBowlingTrajectory />
          <MultiCameraAngles />
          <MultiPitchMap />
          <StumpMap />
          <MultiInterception />
          <MultiWagonWheel />
          <SwingAnalysis />
          <SixHighlightCamera />
          <SixLabels />
          <SixFireEffect />
          <MultiAutoAdvance />

          {sessionType === "BATTING_SESSION" && trajectoryUrl && (
            <BattingTrajectory color={0xff0000} time={7} />
          )}

          {sessionType === "BOWLING_SESSION" && trajectoryUrl && (
            // DRS review → 90% opacity tube (clear ball-tracking); plain bowling stays faint.
            <BowlingTrajectory
              color={0xff0000}
              time={7}
              opacity={drsActive ? 0.9 : 0.3}
            />
          )}

          <DrsCameraSequence />
          <DrsMarkers />
        </Suspense>
      </Canvas>
      </div>

      <InitialLoader />
    </div>
  );
};

export default ThreeScene;
