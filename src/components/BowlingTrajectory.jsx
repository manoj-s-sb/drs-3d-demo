import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useSelector, useDispatch } from "react-redux";
import {
  setTrajectoryDetails,
  setTrajectoryOverlay,
  setTrajectoryError,
  setTrajectoryComplete,
} from "../store/slices/sessionSlice";
import {
  setDrsLastBallPos,
  setDrsPhase,
  setDrsCreasePos,
  setDrsMarkerVisibility,
} from "../store/slices/drsSlice";
import { getConfig } from "../drs/drsConfig";
import { cacheBust, loadReleaseSpeed } from "../dataSource";
import GlbBall from "./GlbBall";
import {
  setMeshPts,
  parseTrajectoryArray,
  smoothstep,
  CAMERA_POST_DELAY,
  TOP_MOVE_DURATION,
  DEFAULT_CAM_POS,
  DEFAULT_CAM_LOOK,
  TOP_CAM_POS,
  TOP_CAM_LOOK,
} from "./drs/trajectoryGeometry";

const CAPTURE_FPS = 600;
const PLAYBACK_SPEED = 0.2;
const EPS = 1e-6;
// VIDEO-OFF DRS only: a FIXED front/bowler's-end camera pose for the 3D-only trajectory,
// INSIDE the boundary (the calibrated broadcast pose is ~90 m out, behind the new stands →
// occluded/black). Looks back down the pitch at the stumps so the whole release→stumps path
// is framed. Tune here. (stumps at z≈0, bowler's end at +z, y up.)
const VIDEO_OFF_TRAJ_CAM = {
  pos: new THREE.Vector3(0, 3.2, 24),
  look: new THREE.Vector3(0, 0.9, 2),
  fov: 17, // zoomed in a little more while the trajectory plays (was 34; smaller = tighter)
};

export default function Bowling_Trajectory({
  opacity = 0.6,
  scale = 0.01,
  showTrajectory = true,
  time = 5,
  tubeRadius = 0.0355,
}) {
  const { trajectoryUrl, animationType } = useSelector(
    (state) => state.session,
  );
  const {
    active: drsActive,
    virtualCamera: drsCamera,
    noBall: drsNoBall,
    reviewPlan,
    reviewPaused,
    withVideo: drsWithVideo,
    paused: drsCued,
  } = useSelector((state) => state.drs);
  // Trajectory draw mode from the rule config (default "full"). No-ball always
  // shows the full path (the LBW review plan doesn't apply to no-ball checks).
  const trajectoryMode =
    drsActive && !drsNoBall && reviewPlan?.trajectory
      ? reviewPlan.trajectory
      : "full";
  const dispatch = useDispatch();

  const [ballData, setBallData] = useState(null);
  const [animationDone, setAnimationDone] = useState(false); // ✅ Track animation completion

  // Pre-impact tube colour follows Settings → Ball type: WHITE for a white ball (a red
  // tube reads as the wrong ball), else the usual DRS red. Live: same-tab
  // "drs-config-changed" + cross-tab "storage" (so the big screen follows the operator).
  const [ballType, setBallType] = useState(() => getConfig("BALL_TYPE"));
  useEffect(() => {
    const apply = () => setBallType(getConfig("BALL_TYPE"));
    const onStorage = (e) => {
      if (!e || e.key === "drs.config.overrides") apply();
    };
    window.addEventListener("drs-config-changed", apply);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("drs-config-changed", apply);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  const preImpactColor = ballType === "white" ? 0xc8b4a0 : 0xff0000;

  const ballRef = useRef();
  const redMeshRef = useRef();
  const blueMeshRef = useRef();
  const pulseBallRef = useRef();
  const pulseStartTime = useRef(0);
  const pulseBallVisible = useRef(false);
  const pausedElapsedRef = useRef(null); // pins elapsed while reviewPaused

  const { camera, clock } = useThree();

  const baseTimeRef = useRef(0);
  const cameraBootstrappedRef = useRef(false);
  const outsideLegHoldRef = useRef(null); // clock time the pitch-frame hold began
  const reviewCamTriggeredRef = useRef(false); // review camera move started at impact
  // When the video overlay is OFF, the 3D trajectory (not the video) must reveal the
  // pitching + impact markers as the ball crosses those points (normally DrsVideoLayer
  // does this off the video frames). Fired once each.
  const pitchMarkShownRef = useRef(false);
  const impactMarkShownRef = useRef(false);
  const topCamTriggeredRef = useRef(false);
  const topCamTRef = useRef(0);

  // Track trajectory completion
  const trajectoryCompletedRef = useRef(false);

  useEffect(() => {
    let url = trajectoryUrl;
    // let url = "/trajectory_data (6).json";
    let alive = true;

    Promise.all([
      fetch(cacheBust(url)).then((res) => res.json()),
      loadReleaseSpeed(url), // authoritative bowling speed (null → trajectory fallback)
    ])
      .then(([data, releaseSpeed]) => {
        if (!alive) return;
        if (data?.balls?.length) {
          const b = data.balls[0];
          setBallData(b);

          dispatch(
            setTrajectoryDetails({
              speed: b.afterImpactSpeed,
              angle: b.afterImpactAngle,
              distance: b.distance,
              bowlingSpeed: releaseSpeed ?? b.speed?.beforePitch ?? null,
              bowlingAngle: b.angle.turn,
            }),
          );
        } else {
          setBallData(null);
        }
      })
      .catch((err) => {
        console.error("Failed to load trajectory JSON:", err);
        dispatch(setTrajectoryError());
      });

    return () => (alive = false);
  }, [trajectoryUrl, dispatch]);

  useEffect(() => {
    clock.start();
    baseTimeRef.current = clock.getElapsedTime();
    cameraBootstrappedRef.current = false;
    outsideLegHoldRef.current = null;
    reviewCamTriggeredRef.current = false;
    topCamTriggeredRef.current = false;
    topCamTRef.current = 0;
    pulseStartTime.current = clock.getElapsedTime();
    pulseBallVisible.current = false;
    setAnimationDone(false); // reset completion flag
    trajectoryCompletedRef.current = false;
    pitchMarkShownRef.current = false;
    impactMarkShownRef.current = false;
  }, [trajectoryUrl, animationType, clock]);

  /** ✅ Full trajectory always */
  const allPoints = useMemo(() => {
    if (!ballData?.trajectory) return [];
    return parseTrajectoryArray(ballData.trajectory, scale);
  }, [ballData, scale]);

  // NO-BALL height check: stop the trajectory at the popping crease — the first
  // point where z ≤ 120 cm (= 1.2 scene units). The ball's height (y, metres)
  // there is the "ball height at crease" shown in the height overlay. For every
  // other review the full trajectory is used.
  const CREASE_Z = 120 * scale; // 120 cm → scene units
  const { points, creasePos } = useMemo(() => {
    if (!drsNoBall || !allPoints.length) {
      return { points: allPoints, creasePos: null };
    }
    const idx = allPoints.findIndex((p) => p.pos.z <= CREASE_Z);
    if (idx === -1) return { points: allPoints, creasePos: null };
    const cut = allPoints.slice(0, idx + 1); // include the crease-crossing point
    const p = cut[cut.length - 1].pos;
    return { points: cut, creasePos: { x: p.x, y: p.y, z: p.z } };
  }, [allPoints, drsNoBall, CREASE_Z]);

  // Publish the crease ball position so the no-ball height overlays can read it.
  useEffect(() => {
    dispatch(setDrsCreasePos(creasePos));
  }, [creasePos, dispatch]);

  const positions = useMemo(() => points.map((p) => p.pos), [points]);

  /** ✅ Impact frame index for color split */
  const impactFrame = ballData?.impactFrame ?? Infinity;

  const impactIndex = useMemo(() => {
    if (!points.length) return positions.length;
    const idx = points.findIndex((p) => p.frame >= impactFrame);
    return idx === -1 ? positions.length : idx;
  }, [points, positions.length, impactFrame]);

  /** ✅ Parse all pitchingCoordinates */
  const pitchingPositions = useMemo(() => {
    if (!ballData?.pitchingCoordinates?.length) return [];
    return ballData.pitchingCoordinates.map((raw) => {
      let arr = [];
      if (typeof raw === "string") {
        arr = raw.replace("[", "").replace("]", "").split(",").map(Number);
      } else {
        arr = raw;
      }
      const x = arr[1] * scale;
      const y = arr[2] * scale;
      const z = arr[3] * scale;
      return new THREE.Vector3(x, y, z);
    });
  }, [ballData, scale]);

  const mainPitchingPosition = pitchingPositions[0] ?? new THREE.Vector3();

  const drsSpeedFactor = drsActive ? getConfig("TRAJECTORY_REPLAY_SPEED") : 1;
  const animationDuration = useMemo(() => {
    if (!points.length) return time;
    const totalFrames = points.length;
    const realDuration = totalFrames / CAPTURE_FPS;
    return Math.max(
      EPS,
      ((realDuration / PLAYBACK_SPEED) * 0.5) / drsSpeedFactor,
    );
  }, [points.length, time, drsSpeedFactor]);

  useFrame(() => {
    if (animationType !== "TrajectoryView") return;

    // Paused (operator pressed Space): pin `elapsed` by holding baseTimeRef at
    // (now − frozenElapsed) every frame, so the trajectory freezes exactly where it
    // was. OrbitControls own the camera meanwhile (FixedScene enables them).
    if (reviewPaused) {
      if (pausedElapsedRef.current == null) {
        pausedElapsedRef.current = Math.max(
          0,
          clock.getElapsedTime() - baseTimeRef.current,
        );
      }
      baseTimeRef.current = clock.getElapsedTime() - pausedElapsedRef.current;
      return; // skip advancing the trajectory + camera-trigger logic
    }
    if (pausedElapsedRef.current != null) {
      // Just resumed: re-anchor baseTimeRef so elapsed continues from the freeze.
      baseTimeRef.current = clock.getElapsedTime() - pausedElapsedRef.current;
      pausedElapsedRef.current = null;
    }

    const outsideLeg = trajectoryMode === "none" && drsActive && !drsNoBall;

    if (!cameraBootstrappedRef.current) {
      if (drsActive && drsCamera) {
        camera.position.set(
          drsCamera.position.x,
          drsCamera.position.y,
          drsCamera.position.z,
        );
        camera.up.set(drsCamera.up.x, drsCamera.up.y, drsCamera.up.z);
        const fwd = new THREE.Vector3(
          drsCamera.forward.x,
          drsCamera.forward.y,
          drsCamera.forward.z,
        ).normalize();
        camera.lookAt(
          camera.position.x + fwd.x,
          camera.position.y + fwd.y,
          camera.position.z + fwd.z,
        );
        camera.fov = drsCamera.fovY;
        if (drsCamera.aspect) camera.aspect = drsCamera.aspect;
        camera.updateProjectionMatrix();
        // VIDEO OFF (3D-only): the calibrated pose is a REAL broadcast position ~90 m out —
        // now BEHIND the new stadium's stands (boundary ≈ 56 m), so the stands OCCLUDE the
        // pitch and the trajectory plays on a black screen. There's no mp4 to stay aligned
        // to, so just use a FIXED front/bowler's-end pose inside the boundary (matches the
        // working review "front" view) — the whole release→stumps path is clearly framed.
        // With video ON the pose is left exactly as calibrated so the overlay aligns.
        if (!drsWithVideo) {
          camera.up.set(0, 1, 0);
          camera.position.copy(VIDEO_OFF_TRAJ_CAM.pos);
          camera.fov = VIDEO_OFF_TRAJ_CAM.fov;
          camera.lookAt(VIDEO_OFF_TRAJ_CAM.look);
          camera.updateProjectionMatrix();
        }
        // Outside leg goes straight to review (shortcut below) at this same angle;
        // don't advance to trajectory. Normal balls play the trajectory here.
        if (!outsideLeg) dispatch(setDrsPhase("trajectory"));
      } else {
        camera.position.copy(DEFAULT_CAM_POS);
        camera.fov = 8;
        camera.lookAt(DEFAULT_CAM_LOOK);
        camera.updateProjectionMatrix();
      }
      cameraBootstrappedRef.current = true;
    }

    // CUED with the video OFF: there's no video to hold on the first frame, so HOLD the 3D
    // trajectory at the start too (camera is already framed above) until the operator presses
    // Play. Pin baseTime to now each frame so, on Play (cued→false), it starts from the
    // beginning. (With video ON the video layer does the holding, so this never runs.)
    if (drsActive && !drsWithVideo && drsCued && !trajectoryCompletedRef.current) {
      baseTimeRef.current = clock.getElapsedTime();
      if (ballRef.current && positions[0]) {
        ballRef.current.position.copy(positions[0]); // ball waits at release
      }
      setMeshPts(redMeshRef, [], tubeRadius);
      setMeshPts(blueMeshRef, [], tubeRadius);
      return; // frozen at the start; Play clears drsCued and playback begins
    }

    // Outside-leg (trajectory "none"): no visible ball/tube to animate. Hold on
    // the frozen pitch frame for 1 s, THEN hand off to the 3D review. Wait until
    // the bounce data has loaded first, otherwise the look target defaults to the
    // origin (stumps) and the camera frames the stumps instead of the pitch.
    if (outsideLeg && !trajectoryCompletedRef.current) {
      const focus = pitchingPositions[0] || positions[0];
      if (!focus) return; // data not ready yet → keep waiting (next frame)
      const now = clock.getElapsedTime();
      if (outsideLegHoldRef.current == null) {
        outsideLegHoldRef.current = now; // start the 1 s hold on the frozen video
        return;
      }
      if (now - outsideLegHoldRef.current < getConfig("OUTSIDE_LEG_HOLD_SEC"))
        return; // keep holding
      trajectoryCompletedRef.current = true;
      dispatch(setTrajectoryComplete());
      dispatch(setDrsLastBallPos({ x: focus.x, y: focus.y, z: focus.z }));
      dispatch(setDrsPhase("review"));
      return;
    }

    const tNow = clock.getElapsedTime();
    const elapsed = Math.max(0, tNow - baseTimeRef.current);
    const tNorm = Math.min(elapsed / animationDuration, 1);

    const total = positions.length - 1;
    const fIdx = tNorm * total;
    const i = Math.min(Math.max(Math.floor(fIdx), 0), total);
    const j = Math.min(i + 1, total);
    const frac = Math.min(Math.max(fIdx - i, 0), 1);

    let currentPos;

    if (!positions[i] || !positions[j] || i === j) {
      currentPos = positions[total];
    } else {
      currentPos = new THREE.Vector3().lerpVectors(
        positions[i],
        positions[j],
        frac,
      );
    }

    /** ✅ Move ball */
    if (ballRef.current) {
      ballRef.current.position.copy(currentPos);
    }

    /** ✅ Reveal the pitching + impact markers from the 3D ball when the VIDEO is OFF.
     * (With video on, DrsVideoLayer reveals them off the video frames; with video off that
     * never runs, so drive them here as the ball reaches each point.) */
    if (drsActive && !drsWithVideo) {
      // Pitch marker: when the ball reaches its bounce point (proximity, same test the pulse
      // uses). Impact marker: when the ball reaches the impact index.
      if (
        !pitchMarkShownRef.current &&
        currentPos?.distanceTo?.(mainPitchingPosition) < 0.4
      ) {
        pitchMarkShownRef.current = true;
        dispatch(setDrsMarkerVisibility({ pitching: true }));
      }
      if (!impactMarkShownRef.current && i >= impactIndex) {
        impactMarkShownRef.current = true;
        dispatch(setDrsMarkerVisibility({ impact: true }));
      }
    }

    /** ✅ Draw trajectory — mode from the rule-driven review plan:
     *   "none"     → draw nothing (pitch-only, e.g. pitched outside leg)
     *   "toImpact" → red tube up to impact only, no post-impact projection
     *   "full"/other → full red (pre-impact) + blue (post-impact) tube
     */
    if (showTrajectory && trajectoryMode !== "none") {
      const endIndex = Math.min(i + 2, positions.length);
      // Red runs THROUGH the impact point (inclusive) so it shares that point with the
      // blue tube, which starts there → the two meet seamlessly with no gap.
      const redPts = positions.slice(0, Math.min(endIndex, impactIndex + 1));
      setMeshPts(redMeshRef, redPts, tubeRadius);
      if (trajectoryMode === "toImpact") {
        setMeshPts(blueMeshRef, [], tubeRadius); // no path beyond the pad
      } else {
        const bluePts = positions.slice(Math.max(impactIndex, 0), endIndex);
        setMeshPts(blueMeshRef, bluePts, tubeRadius);
      }
    } else if (trajectoryMode === "none") {
      setMeshPts(redMeshRef, [], tubeRadius);
      setMeshPts(blueMeshRef, [], tubeRadius);
    }

    /** ✅ Pulse near pitch point */
    const distToPitch =
      currentPos?.distanceTo?.(mainPitchingPosition) ?? Infinity;
    if (!pulseBallVisible.current && distToPitch < 0.4) {
      pulseBallVisible.current = true;
      pulseStartTime.current = clock.getElapsedTime();
    }

    // if (pulseBallRef.current) {
    //   pulseBallRef.current.visible = pulseBallVisible.current;
    //   if (pulseBallVisible.current) {
    //     const t = clock.getElapsedTime() - pulseStartTime.current;
    //     const s = 1 + 0.35 * Math.sin(t * 6);
    //     pulseBallRef.current.scale.set(s, s, s);
    //   }
    // }

    /** ✅ Start the review camera move AT IMPACT (not at the trajectory end) for
     * balls that have an auto camera move (e.g. full toss → topDown). The camera
     * stays fixed while the ball travels to impact, then moves as the post-impact
     * projection draws. Normal balls (camera "auto") keep their end-of-trajectory
     * behaviour. */
    if (
      drsActive &&
      !drsNoBall &&
      trajectoryMode !== "none" &&
      reviewPlan?.camera &&
      reviewPlan.camera !== "auto" &&
      !reviewCamTriggeredRef.current &&
      i >= impactIndex
    ) {
      reviewCamTriggeredRef.current = true;
      const focus = positions[total] || currentPos;
      if (focus) {
        dispatch(setDrsLastBallPos({ x: focus.x, y: focus.y, z: focus.z }));
      }
      dispatch(setDrsPhase("review"));
    }

    /** ✅ Animation completion check */
    if (!animationDone && tNorm >= 1) {
      setAnimationDone(true);
    }

    // Check if trajectory animation is complete
    if (tNorm >= 1 && !trajectoryCompletedRef.current) {
      trajectoryCompletedRef.current = true;

      // Mark trajectory as complete - this will trigger pending video activation if needed
      dispatch(setTrajectoryComplete());

      // Skip if the review camera move already started at impact (above) — don't
      // re-target the camera at the end.
      if (drsActive && currentPos && !reviewCamTriggeredRef.current) {
        // Outside-leg (trajectory "none", not no-ball): frame the BOUNCE point so
        // the review camera can move top-down and zoom onto where it pitched.
        // Everything else frames the ball's resting position.
        const outsideLeg = trajectoryMode === "none" && !drsNoBall;
        const focus =
          outsideLeg && mainPitchingPosition ? mainPitchingPosition : currentPos;
        dispatch(
          setDrsLastBallPos({ x: focus.x, y: focus.y, z: focus.z }),
        );
        // No-ball stays on the VIDEO (AR composite). Outside-leg now advances to
        // "review" so the camera can do the top-down zoom to the bounce (no tube,
        // no 3D ball — both hidden for trajectory "none"). Everything else → review.
        const stayOnVideo = drsNoBall;
        dispatch(setDrsPhase(stayOnVideo ? "trajectory" : "review"));
      }
    }

    // DRS owns the post-trajectory camera sequence; skip default top-down
    // transition when DRS is active.
    if (!drsActive) {
      if (!topCamTriggeredRef.current && elapsed >= CAMERA_POST_DELAY) {
        topCamTriggeredRef.current = true;
        topCamTRef.current = 0;
        dispatch(setTrajectoryOverlay(true));
      }

      if (topCamTriggeredRef.current && topCamTRef.current < 1) {
        const dt = 1 / (60 * TOP_MOVE_DURATION);
        topCamTRef.current = Math.min(1, topCamTRef.current + dt);

        const u = smoothstep(topCamTRef.current);
        const camPos = new THREE.Vector3().lerpVectors(
          DEFAULT_CAM_POS,
          TOP_CAM_POS,
          u,
        );
        const camLook = new THREE.Vector3().lerpVectors(
          DEFAULT_CAM_LOOK,
          TOP_CAM_LOOK,
          u,
        );

        camera.position.copy(camPos);
        camera.lookAt(camLook);
        camera.updateProjectionMatrix();
      }
    }
  });

  if (positions.length < 2 || animationType !== "TrajectoryView") return null;

  return (
    <group>
      {/* ✅ Pre-impact trajectory — red (white for a white ball) */}
      {showTrajectory && (
        <mesh ref={redMeshRef} visible={false}>
          <meshStandardMaterial
            color={preImpactColor}
            transparent
            opacity={opacity}
            roughness={1}
            metalness={0}
            // Self-illuminate the tube so its underside/far side isn't left unlit
            // (that was the black line hugging the bottom of the arc). Emissive +
            // toneMapped:false makes it a clean, uniform solid colour from any angle.
            emissive={new THREE.Color(preImpactColor)}
            emissiveIntensity={1}
            toneMapped={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* ✅ Post-impact blue trajectory */}
      {showTrajectory && (
        <mesh ref={blueMeshRef} visible={false}>
          <meshStandardMaterial
            color={0x000bdc}
            transparent
            opacity={opacity}
            roughness={1}
            metalness={0}
            // Same self-illumination so the blue tube has no dark underside either.
            emissive={new THREE.Color(0x000bdc)}
            emissiveIntensity={1}
            toneMapped={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* ✅ Moving ball — the real 3D ball GLB (ball_white) at true MCC/ICC spec
          (BALL_SIZE, 3.61 cm radius). Sized independently of the markers. */}
      <GlbBall
        ref={ballRef}
        radius={getConfig("BALL_SIZE")}
        visible={trajectoryMode !== "none"}
      />

      {/* ✅ Pulsing ball at first pitching point */}
      <mesh ref={pulseBallRef} position={mainPitchingPosition} visible={false}>
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshStandardMaterial
          emissive={new THREE.Color(0xff0000)}
          emissiveIntensity={2}
          transparent
          opacity={0.9}
        />
      </mesh>

      {/* ✅ Static pitching markers appear after animation ends */}
      {/* {animationDone &&
        pitchingPositions.map((pos, idx) => (
          <mesh key={idx} position={pos}>
            <sphereGeometry args={[0.08, 16, 16]} />
            <meshStandardMaterial
              emissive={new THREE.Color(0xff0000)}
              emissiveIntensity={1}
              transparent
              opacity={0.7}
            />
          </mesh>
        ))} */}
    </group>
  );
}
