import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useSelector, useDispatch } from "react-redux";
import { setSwingInteractive, setSwingTurnDeg, setSwingSwingDeg } from "../../store/slices/sessionSlice";
import { stopAnimation } from "../../store/slices/animationSlice";
import {
  setMeshPts,
  parseBallTrajectory,
  parseTrajectoryArray,
  smoothstep,
} from "./trajectoryGeometry";
import { buildTween, applyTween } from "./cameraAngles";
import { REVIEW_ANIMATIONS } from "../../drs/reviewAnimations";
import { loadTrajectory } from "../../trajectoryCache";
import { resolveDeliveryFolder, cacheBust } from "../../dataSource";
import { useKTX2GLTF } from "../../useKTX2GLTF";
import ballWhiteModel from "../../assets/models/ball_white_2026-10-24.glb";
import { getConfig } from "../../drs/drsConfig";
import { SWING_ANALYSIS as SWING } from "../../drs/swingAnalysisAnimations";

// ── Swing Analysis ─────────────────────────────────────────────────────────
// Single ball. Draws its trajectory RELEASE → IMPACT (the swing/movement through
// the air, stopping at impact) on a fixed camera BEHIND the bowler looking down
// the pitch. Camera + timing config lives in src/drs/swingAnalysisAnimations.js
// (so a UI speed control can drive flightDur later). Reads the selection from
// session.swingSel; loads the ball's trajectory lazily (cached). ──────────────

const SCALE = 0.01; // cm → metres (same as the other trajectory views)
const TUBE_RADIUS = 0.0355;

// No useGLTF.preload — ball_white.glb is KTX2; preload would load it without the
// KTX2Loader and poison the cache. useKTX2GLTF below is the only loader.

// 3D white-ball GLB sized to `radius` (same model as the other views).
const Ball = React.forwardRef(function Ball({ radius = 0.036 }, ref) {
  const { scene } = useKTX2GLTF(ballWhiteModel);
  const obj = useMemo(() => {
    const c = scene.clone(true);
    const box = new THREE.Box3().setFromObject(c, true);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const s = (radius * 2) / (Math.max(size.x, size.y, size.z) || 1);
    c.scale.setScalar(s);
    c.position.set(-center.x * s, -center.y * s, -center.z * s);
    return c;
  }, [scene, radius]);
  return (
    <group ref={ref}>
      <primitive object={obj} />
    </group>
  );
});

export default function SwingAnalysis() {
  const active = useSelector((s) => s.session.swingActive);
  const armed = useSelector((s) => s.session.swingArmed);
  const paused = useSelector((s) => s.session.swingPaused);
  const sel = useSelector((s) => s.session.swingSel);
  const token = useSelector((s) => s.session.swingToken);
  const interactive = useSelector((s) => s.session.swingInteractive);
  const viewAngle = useSelector((s) => s.session.swingViewAngle);
  const viewToken = useSelector((s) => s.session.swingViewToken);
  const groundPlaying = useSelector((s) => s.animation.groundCamera.isPlaying);
  const rightHanded = useSelector(
    (s) => s.drs.operatorInput?.isRightHanded ?? true,
  );
  const { camera, clock, controls } = useThree();
  const dispatch = useDispatch();
  const tweenRef = useRef(null);
  const tweenSettledRef = useRef(false);

  const ballRef = useRef();
  const refBallRef = useRef(); // ball at the leading end of the red reference tube
  const tubeRef = useRef(); // actual tube, WHITE before the pitch
  const postTubeRef = useRef(); // actual tube, WHITE after the pitch (actual delivery)
  const refTubeRef = useRef(); // the "no-swing" straight reference path (red)
  const t0Ref = useRef(0);
  const startedRef = useRef(false);
  const pausedElapsedRef = useRef(null); // frozen flight elapsed while paused
  const pauseHandedRef = useRef(false); // camera handed to OrbitControls on pause
  const [data, setData] = useState(null); // { positions:[{x,y,z}], impactIndex }

  // Load the selected ball's trajectory on each (re)activation (cached).
  useEffect(() => {
    if (!active || !sel) {
      setData(null);
      return;
    }
    let alive = true;
    startedRef.current = false;
    // Load the trajectory AND ball_analytics.json (for release/impact points + the
    // swing_deg / turn_deg used to draw the straight no-swing reference). Both resolved to
    // the machine that has this ball (split overs): loadTrajectory is machine-aware, and the
    // analytics is fetched from the SAME resolved folder.
    Promise.all([
      loadTrajectory(sel.innings, sel.over, sel.ball),
      resolveDeliveryFolder(sel.innings, sel.over, sel.ball)
        .then((folder) => fetch(cacheBust(`${folder}ball_analytics.json`)))
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ])
      .then(([traj, analytics]) => {
        if (!alive) return;
        const b = traj?.balls?.[0];
        const parsed = b ? parseBallTrajectory(b, SCALE) : null;
        if (!parsed?.positions?.length) return setData(null);
        // noDeviation = the post-pitch "no turn" reference path (starts at the pitch
        // frame). Parse it the same way as the trajectory → the red reference tube.
        const noDev =
          Array.isArray(b.noDeviation) && b.noDeviation.length
            ? parseTrajectoryArray(b.noDeviation, SCALE).map(
                (p) => new THREE.Vector3(p.pos.x, p.pos.y, p.pos.z),
              )
            : null;
        setData({
          ...parsed,
          positions: parsed.positions.map(
            (p) => new THREE.Vector3(p.x, p.y, p.z),
          ),
          noDev,
          analytics, // { release_point, pitch_point, impact_point, swing_deg, turn_deg }
        });
        // Publish turn (spinners) + swing (seamers) for the legend's readout; the
        // operator's Spin/Seam option picks which one shows.
        dispatch(setSwingTurnDeg(analytics?.turn_deg ?? null));
        dispatch(setSwingSwingDeg(analytics?.swing_deg ?? null));
      })
      .catch(() => alive && setData(null));
    return () => {
      alive = false;
    };
  }, [active, sel, token]);

  // Fixed camera pose (behind the stumps, down the pitch) + the impact index.
  const poses = useMemo(() => {
    if (!data?.positions?.length) return null;
    const p = data.positions;
    const lastIdx = p.length - 1;
    const impactIdx =
      data.impactIndex == null ? lastIdx : Math.min(data.impactIndex, lastIdx);
    const release = new THREE.Vector3(p[0].x, p[0].y, p[0].z);
    const impact = new THREE.Vector3(
      p[impactIdx].x,
      p[impactIdx].y,
      p[impactIdx].z,
    );
    // FIXED camera anchored to the PITCH (same for every ball) — NOT to this ball's
    // release/impact, so the framing never shifts ball-to-ball; only the tube changes.
    // Pitch runs along +Z: batter stumps at z≈0, bowler's release at RELEASE_Z. The
    // camera sits behind the release, aiming straight down the pitch (−Z).
    const RELEASE_Z = 19; // typical bowler release depth (m)
    const camPos = new THREE.Vector3(
      (SWING.sideOffset || 0) * (rightHanded ? 1 : -1), // off side (+X for a RHB)
      SWING.height,
      RELEASE_Z + SWING.behindDist, // behind the bowler
    );
    const look = new THREE.Vector3(0, SWING.lookHeight, SWING.lookFwd);

    const pitchIdx =
      data.pitchIndex == null ? Math.floor(impactIdx * 0.8) : data.pitchIndex;
    const pitchPt = p[Math.min(pitchIdx, p.length - 1)].clone();

    // RED reference = the "no deviation" line that STARTS AT THE PITCH and continues
    // without the seam turn. Prefer the trajectory JSON's `noDeviation` path (it already
    // starts at the pitch frame); otherwise fall back to a dead-straight line from the
    // PITCH point to impact. Either way it NEVER starts at the bowler's release.
    let refPositions = data.noDev;
    if (!refPositions || refPositions.length < 2) {
      const a = data.analytics;
      const impA = a?.impact_point
        ? new THREE.Vector3(a.impact_point.x, a.impact_point.y, a.impact_point.z).multiplyScalar(SCALE)
        : impact.clone();
      const steps = Math.max(2, impactIdx - pitchIdx);
      refPositions = [];
      for (let idx = 0; idx <= steps; idx++) {
        refPositions.push(pitchPt.clone().lerp(impA, idx / steps));
      }
    }
    // The swing tube/ball animate to the FULL trajectory end (the stumps), not just to
    // the bat-impact frame — so the actual path runs all the way down the pitch.
    // `subject` = the ball's RESTING position (trajectory end) — the exact analog of the
    // DRS review's `lastBallWorldPos`, used as the camera pivot for keys 1-4 so the swing
    // camera frames/pivots like the DRS review.
    const subject = new THREE.Vector3(p[lastIdx].x, p[lastIdx].y, p[lastIdx].z);
    return { camPos, look, impactIdx, endIdx: lastIdx, pitchIdx, release, refPositions, impact, subject };
  }, [data, rightHanded]);

  // Build a DRS-style review tween when a view key (1-4) is pressed (swingViewAngle).
  // EXACTLY matches the DRS review: same REVIEW_ANIMATIONS config, same per-angle framing
  // distances, constant FOV (no zoom), same absolute arcs — achieved by passing NEITHER
  // reviewFov NOR reviewDist (those switch buildTween into the bowling "proportional" mode
  // which flattens distances + zooms). Subject = the ball's resting position, like the DRS
  // review's lastBallWorldPos.
  useEffect(() => {
    if (!active || !viewAngle || !poses) {
      tweenRef.current = null;
      return;
    }
    // DRS angle config with swing-specific eye-height overrides (e.g. a lower side view).
    const swingAngles = {
      ...REVIEW_ANIMATIONS,
      side: {
        ...REVIEW_ANIMATIONS.side,
        target: { ...REVIEW_ANIMATIONS.side.target, y: SWING.sideEyeHeight },
      },
      behind: {
        ...REVIEW_ANIMATIONS.behind,
        dist: SWING.behindStumpsDist,
        target: {
          ...REVIEW_ANIMATIONS.behind.target,
          y: SWING.behindStumpsHeight + SWING.behindStumpsLift,
        },
        look: {
          ...REVIEW_ANIMATIONS.behind.look,
          y: REVIEW_ANIMATIONS.behind.look.y + SWING.behindStumpsLift,
        },
      },
    };
    const tw = buildTween(viewAngle, camera, poses.subject.clone(), {
      rightHanded,
      // Telephoto framing fov (NOT reviewDist) → DRS-style flat side-on, per-angle
      // frameFill distances + absolute arcs preserved.
      reviewFov: SWING.reviewFov,
      angles: swingAngles,
    });
    if (!tw) return;
    tw.t0 = clock.getElapsedTime();
    tweenRef.current = tw;
    tweenSettledRef.current = false;
    // `poses` included so the tween (re)builds if the trajectory data arrives AFTER a key
    // press (otherwise the guard above would have no-op'd and the key would do nothing).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewAngle, viewToken, active, poses]);

  // Point OrbitControls at what the camera is ACTUALLY looking at (its own forward),
  // so it takes over without snapping. Targeting a different point (e.g. the impact)
  // makes OrbitControls reposition to orbit that point → the camera drifts back to
  // centre. This is the same approach DrsCameraSequence uses.
  const handToOrbit = () => {
    if (!controls?.target) return;
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    // Distance to the SUBJECT (ball resting pos), floored at 0.5 — identical to the DRS
    // review's handToOrbit, so the post-settle orbit pivots around the same kind of point.
    const subject = poses?.subject || new THREE.Vector3(0, 0.4, 0);
    const d = Math.max(camera.position.distanceTo(subject), 0.5);
    controls.target.copy(camera.position).add(fwd.multiplyScalar(d));
    controls.update?.();
  };

  useFrame(() => {
    if (!active || !poses || !data) return;
    const { camPos, look, endIdx, pitchIdx, refPositions } = poses;
    const p = data.positions;

    // Stop the idle ground-camera fly-around — otherwise once we stop driving the camera
    // (after the flight settles) its mixer grabs it and shows the idle view.
    if (groundPlaying) dispatch(stopAnimation("groundCamera"));

    // Camera control priority:
    //   1) a view-key tween running (keys 1-4) → drive it, settle → OrbitControls.
    //   2) not yet interactive → hold the fixed swing pose.
    //   3) interactive → OrbitControls own it (don't touch).
    const tw = tweenRef.current;
    if (tw && !tweenSettledRef.current) {
      const tt = Math.min((clock.getElapsedTime() - tw.t0) / tw.duration, 1);
      applyTween(camera, tw, tt);
      if (tt >= 1) {
        tweenSettledRef.current = true;
        tweenRef.current = null;
        handToOrbit(); // aim at the camera's own forward → no snap-back to centre
        dispatch(setSwingInteractive(true));
      }
    } else if (!interactive && !paused) {
      camera.up.set(0, 1, 0);
      camera.fov = SWING.fov;
      camera.position.copy(camPos);
      camera.lookAt(look);
      camera.updateProjectionMatrix();
      // Prime OrbitControls' target at the camera forward so a pause hands over with no
      // camera-angle jump (same trick as the bowling analysis).
      if (controls?.target) {
        const fwd = new THREE.Vector3();
        camera.getWorldDirection(fwd);
        const d = Math.max(camera.position.distanceTo(look), 0.5);
        controls.target.copy(camera.position).add(fwd.multiplyScalar(d));
      }
    }

    // PAUSED (Space): freeze the flight exactly in place and hand the camera to
    // OrbitControls (zoom/pan/tilt). On resume the flight continues from here and the
    // fixed swing pose re-applies.
    if (paused) {
      if (pausedElapsedRef.current == null) {
        pausedElapsedRef.current = clock.getElapsedTime() - t0Ref.current;
      }
      t0Ref.current = clock.getElapsedTime() - pausedElapsedRef.current;
      if (!pauseHandedRef.current) {
        pauseHandedRef.current = true;
        handToOrbit();
      }
      return; // OrbitControls own the camera; flight frozen
    } else {
      pausedElapsedRef.current = null;
      pauseHandedRef.current = false;
    }

    // ARMED (cued on the big screen): hold the setup — ball at release, no tubes — until
    // Play releases it. Keep startedRef reset so the flight starts fresh when unarmed.
    if (armed) {
      startedRef.current = false;
      if (ballRef.current) ballRef.current.position.set(p[0].x, p[0].y, p[0].z);
      if (refBallRef.current) refBallRef.current.visible = false;
      setMeshPts(tubeRef, [], TUBE_RADIUS);
      setMeshPts(postTubeRef, [], TUBE_RADIUS);
      setMeshPts(refTubeRef, [], TUBE_RADIUS);
      return;
    }

    // Animate the ball release → impact and grow the tube behind it.
    if (!startedRef.current) {
      t0Ref.current = clock.getElapsedTime();
      startedRef.current = true;
    }
    const t = smoothstep(
      Math.min((clock.getElapsedTime() - t0Ref.current) / SWING.flightDur, 1),
    );
    const fIdx = t * endIdx;
    const i = Math.min(Math.floor(fIdx), endIdx);
    const frac = fIdx - i;
    const j = Math.min(i + 1, endIdx);
    const cur =
      i >= endIdx
        ? p[endIdx]
        : {
            x: p[i].x + (p[j].x - p[i].x) * frac,
            y: p[i].y + (p[j].y - p[i].y) * frac,
            z: p[i].z + (p[j].z - p[i].z) * frac,
          };
    if (ballRef.current) ballRef.current.position.set(cur.x, cur.y, cur.z);
    // Actual (swung) tube — WHITE both before and after the pitch. Split the
    // grown path at the pitch index. Grows all the way to the trajectory END (stumps).
    const count = Math.min(i + 2, endIdx + 1);
    const splitAt = Math.min(pitchIdx + 1, count); // white covers release → pitch
    setMeshPts(tubeRef, p.slice(0, splitAt), TUBE_RADIUS);
    if (count > pitchIdx + 1) {
      setMeshPts(postTubeRef, p.slice(pitchIdx, count), TUBE_RADIUS); // post-pitch
    } else {
      setMeshPts(postTubeRef, [], TUBE_RADIUS);
    }
    // Red reference (noDeviation) tube — grows SMOOTHLY in sync with the actual: nothing
    // before the pitch, then eases from 0 → full as the animation runs pitch→end, so by
    // the end the whole no-deviation line (pitch → stumps) is drawn.
    const pitchFrac = endIdx > 0 ? pitchIdx / endIdx : 0;
    if (t <= pitchFrac) {
      setMeshPts(refTubeRef, [], TUBE_RADIUS);
      if (refBallRef.current) refBallRef.current.visible = false;
    } else {
      const g = Math.min((t - pitchFrac) / Math.max(1e-4, 1 - pitchFrac), 1);
      const refCount = Math.max(2, Math.ceil(g * refPositions.length));
      setMeshPts(refTubeRef, refPositions.slice(0, refCount), TUBE_RADIUS);
      // Ball rides the leading end of the red reference tube (same as the actual ball).
      const tip = refPositions[Math.min(refCount - 1, refPositions.length - 1)];
      if (refBallRef.current && tip) {
        refBallRef.current.visible = true;
        refBallRef.current.position.set(tip.x, tip.y, tip.z);
      }
    }

    // Flight done (and NO key-view tween running) → hand to OrbitControls (zoom/pan/tilt).
    // Aim the controls at the look point first so it doesn't snap when it takes over.
    if (t >= 1 && !interactive && !tweenRef.current) {
      handToOrbit();
      dispatch(setSwingInteractive(true));
    }
  });

  if (!active || !poses) return null;
  return (
    <group>
      {/* No-deviation reference (post-pitch) — red (matches the legend dot). */}
      <mesh ref={refTubeRef}>
        <meshStandardMaterial
          color={0xff0000}
          transparent
          opacity={0.9}
          roughness={1}
          metalness={0}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Actual trajectory — WHITE before the pitch. */}
      <mesh ref={tubeRef}>
        <meshStandardMaterial
          color={0xc8b4a0}
          transparent
          opacity={0.9}
          roughness={1}
          metalness={0}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Actual delivery — WHITE after the pitch (matches the legend dot). */}
      <mesh ref={postTubeRef}>
        <meshStandardMaterial
          color={0xc8b4a0}
          transparent
          opacity={0.9}
          roughness={1}
          metalness={0}
          side={THREE.DoubleSide}
        />
      </mesh>
      <Ball ref={ballRef} radius={getConfig("BALL_SIZE")} />
      {/* Ball on the red reference (intended) path. */}
      <Ball ref={refBallRef} radius={getConfig("BALL_SIZE")} />
    </group>
  );
}
