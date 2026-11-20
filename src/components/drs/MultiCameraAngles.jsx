import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useSelector, useDispatch } from "react-redux";
import * as THREE from "three";
import { setMultiInteractive } from "../../store/slices/sessionSlice";
import { buildTween, applyTween } from "./cameraAngles";
import { smoothstep } from "./trajectoryGeometry";
import { MULTI_REVIEW } from "./viewConfig";
// Bowling-analysis review keys (1-4) have their OWN angle + framing config, split
// out like reviewAnimations.js — edit the cameras there, not the DRS config.
import { BOWLING_ANALYSIS } from "../../drs/bowlingAnalysisAnimations";

// After the multi-ball "Select All" playback finishes, keys 1-5 set
// session.multiViewAngle (via DrsKeyBindings). Keys 1-4 (side/top/behind/front)
// run the EXACT same review-camera animation as the DRS review view — buildTween
// reads REVIEW_ANIMATIONS (src/drs/reviewAnimations.js) — only framed on the
// stumps (world origin) instead of the ball. Key 5 ("tour") is a continuous
// orbit. Orbit tuning lives in viewConfig.js (MULTI_REVIEW.orbit).
const LOOK_AT = MULTI_REVIEW.lookAt;

const {
  radius: ORBIT_RADIUS,
  height: ORBIT_HEIGHT,
  speed: ORBIT_SPEED,
  ramp: ORBIT_RAMP,
  fov: ORBIT_FOV,
  lookHeight: ORBIT_LOOK_HEIGHT,
} = MULTI_REVIEW.orbit;

export default function MultiCameraAngles() {
  const { camera, clock, controls } = useThree();
  const dispatch = useDispatch();
  const settledRef = useRef(false);
  const multiPlay = useSelector((s) => s.session.multiTrajectoryPlay);
  const viewAngle = useSelector((s) => s.session.multiViewAngle);
  const viewToken = useSelector((s) => s.session.multiViewToken);
  const accumulated = useSelector((s) => s.session.accumulatedTrajectories);
  const trajLen = useSelector((s) => s.session.multiTrajLen);
  // Handedness for parity with the DRS review's buildTween call (the 1-4 angles
  // don't use it, but we pass it so the call is identical). Defaults RHB.
  const rightHanded = useSelector(
    (s) => s.drs.operatorInput?.isRightHanded ?? true,
  );

  // Average release (first points) and impact/stumps (last points) ends.
  const ends = useMemo(() => {
    const releaseC = new THREE.Vector3();
    const impactC = new THREE.Vector3();
    let n = 0;
    (accumulated ?? []).forEach((t) => {
      const p = t.positions;
      if (!p || !p.length) return;
      releaseC.add(new THREE.Vector3(p[0].x, p[0].y, p[0].z));
      const last = p[p.length - 1];
      impactC.add(new THREE.Vector3(last.x, last.y, last.z));
      n += 1;
    });
    if (n > 0) {
      releaseC.multiplyScalar(1 / n);
      impactC.multiplyScalar(1 / n);
    }
    return { releaseC, impactC };
  }, [accumulated]);

  const tweenRef = useRef(null);
  const orbitInitRef = useRef(false);
  const orbitT0Ref = useRef(0);
  const orbitAngleRef = useRef(0);
  const orbitRadius0Ref = useRef(ORBIT_RADIUS);
  const orbitHeight0Ref = useRef(ORBIT_HEIGHT);

  useEffect(() => {
    if (!multiPlay || !viewAngle) {
      tweenRef.current = null;
      return;
    }

    // Orbit is continuous (driven in useFrame), not a one-shot tween.
    if (viewAngle === "tour") {
      tweenRef.current = null;
      orbitInitRef.current = false;
      return;
    }

    // Keys 1-4 (side/top/behind/front): run the EXACT same review-camera animation
    // as the DRS review view. buildTween reads REVIEW_ANIMATIONS and
    // glides/arcs/holds-fov identically; the only difference is the subject it
    // frames — here the stumps the deliveries converge on (impact centroid)
    // instead of the single DRS ball. Same call shape as DrsCameraSequence.
    const subject =
      ends.impactC.lengthSq() > 1e-6 ? ends.impactC.clone() : LOOK_AT.clone();
    // Use the Bowling Analysis's OWN angle config + framing (not the DRS review).
    // Every angle frames at the same distance + fov so switching keys never
    // re-zooms; reviewFov eases in once from the wide playback fov, then holds.
    //
    // Key-1 SIDE pan depends on the trajectory mode: "After impact" pans the camera
    // left (z = 0.8) so the post-impact section is clearly in frame; "Full" centres
    // on the stumps (z = 0). Clone the angles so only the side view's z changes.
    let angles = BOWLING_ANALYSIS.reviewAngles;
    if (viewAngle === "side") {
      const panZ = trajLen === "full" ? 0 : 0.8;
      const base = BOWLING_ANALYSIS.reviewAngles.side;
      angles = {
        ...BOWLING_ANALYSIS.reviewAngles,
        side: {
          ...base,
          target: { ...base.target, z: panZ },
          look: { ...base.look, z: panZ },
        },
      };
    }
    const tw = buildTween(viewAngle, camera, subject, {
      rightHanded,
      angles,
      reviewFov: BOWLING_ANALYSIS.review.fov,
      reviewDist: BOWLING_ANALYSIS.review.dist,
    });

    if (!tw) return;
    tw.t0 = clock.getElapsedTime();
    tweenRef.current = tw;
    settledRef.current = false; // new move → drive the camera again until it settles
  }, [multiPlay, viewAngle, viewToken, ends, rightHanded, trajLen, camera, clock]);

  useFrame(() => {
    if (!multiPlay) return;

    // Key 5: continuous orbit around the trajectories.
    if (viewAngle === "tour") {
      const { releaseC, impactC } = ends;
      const cx = (releaseC.x + impactC.x) / 2;
      const cz = (releaseC.z + impactC.z) / 2;
      if (!orbitInitRef.current) {
        orbitT0Ref.current = clock.getElapsedTime();
        const dx = camera.position.x - cx;
        const dz = camera.position.z - cz;
        orbitAngleRef.current = Math.atan2(dz, dx);
        orbitRadius0Ref.current = Math.hypot(dx, dz) || ORBIT_RADIUS;
        orbitHeight0Ref.current = camera.position.y;
        orbitInitRef.current = true;
      }
      const t = clock.getElapsedTime() - orbitT0Ref.current;
      const ramp = smoothstep(Math.min(t / ORBIT_RAMP, 1));
      const radius = THREE.MathUtils.lerp(
        orbitRadius0Ref.current,
        ORBIT_RADIUS,
        ramp,
      );
      const height = THREE.MathUtils.lerp(
        orbitHeight0Ref.current,
        ORBIT_HEIGHT,
        ramp,
      );
      const angle = orbitAngleRef.current + ORBIT_SPEED * t;
      camera.position.set(
        cx + Math.cos(angle) * radius,
        height,
        cz + Math.sin(angle) * radius,
      );
      camera.up.set(0, 1, 0);
      camera.fov = ORBIT_FOV;
      camera.lookAt(cx, ORBIT_LOOK_HEIGHT, cz);
      camera.updateProjectionMatrix();
      return;
    }

    const tw = tweenRef.current;
    if (!tw) return;
    if (settledRef.current) return; // settled → OrbitControls own the camera
    const t = Math.min((clock.getElapsedTime() - tw.t0) / tw.duration, 1);
    applyTween(camera, tw, t);
    // Move settled → hand the camera to OrbitControls so zoom/pan/tilt works on this
    // key view too. A new key (setMultiViewAngle) rebuilds the tween → settledRef
    // resets below and control is reclaimed.
    if (t >= 1) {
      settledRef.current = true;
      if (controls?.target) {
        const fwd = new THREE.Vector3();
        camera.getWorldDirection(fwd);
        const d = Math.max(camera.position.length(), 0.5);
        controls.target.copy(camera.position).add(fwd.multiplyScalar(d));
        controls.update();
      }
      dispatch(setMultiInteractive(true));
    }
  });

  return null;
}
