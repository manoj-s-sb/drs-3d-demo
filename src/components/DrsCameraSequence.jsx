import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useSelector, useDispatch } from "react-redux";
import * as THREE from "three";
import { buildTween, applyTween } from "./drs/cameraAngles";
import {
  setDrsViewAngle,
  setDrsPendingViewAngle,
  setDrsReviewInteractive,
} from "../store/slices/drsSlice";

// How long to hold on the review before the AUTO camera glides to its view (ms) —
// lets the ball-tracking trajectory settle first.
const AUTO_VIEW_DELAY_MS = 2500;


// Hold the 3D camera STILL on the calibrated hand-off pose while the video crossfades
// to the 3D (DrsVideoLayer FADE_MS), THEN start the review camera move. Nothing moves
// during the fade → the video→3D swap is seamless. Keep ≥ FADE_MS (650).
const HANDOFF_HOLD_MS = 750;

function applyVirtualCamera(camera, vc) {
  camera.position.set(vc.position.x, vc.position.y, vc.position.z);
  camera.up.set(vc.up.x, vc.up.y, vc.up.z);
  camera.lookAt(
    vc.position.x + vc.forward.x,
    vc.position.y + vc.forward.y,
    vc.position.z + vc.forward.z,
  );
  camera.fov = vc.fovY;
  if (vc.aspect) camera.aspect = vc.aspect;
  camera.updateProjectionMatrix();
}

export default function DrsCameraSequence() {
  const { camera, clock, controls } = useThree();
  const dispatch = useDispatch();
  const {
    active,
    phase,
    virtualCamera,
    lastBallWorldPos,
    viewAngle,
    viewAngleToken,
    pendingViewAngle,
    reviewPlan,
    operatorInput,
    reviewPaused,
    withVideo,
  } = useSelector((s) => s.drs);

  const tweenRef = useRef(null);
  const pausedTweenElapsedRef = useRef(null); // pins the tween progress while paused

  // Hand the camera to OrbitControls cleanly: point its target at what the camera is
  // looking at (so tilt/rotate pivot there, no snap) and update. Used both when the
  // operator pauses AND when a camera move settles.
  const handToOrbit = () => {
    if (!controls?.target) return;
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    const subject = lastBallWorldPos
      ? new THREE.Vector3(lastBallWorldPos.x, lastBallWorldPos.y, lastBallWorldPos.z)
      : new THREE.Vector3(0, 0.4, 0);
    const d = Math.max(camera.position.distanceTo(subject), 0.5);
    controls.target.copy(camera.position).add(fwd.multiplyScalar(d));
    controls.update();
  };

  // On pause: freeze the scripted loops and give the pivot to OrbitControls.
  useEffect(() => {
    if (!active || !reviewPaused) return;
    handToOrbit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewPaused, active]);

  // Apply a review camera angle once the replay reaches the review phase:
  //   1) the operator's pre-selected angle (pendingViewAngle) wins, else
  //   2) the rule config's camera when it's not "auto" (e.g. full toss → topDown).
  // "auto" means no automatic move (normal balls stay on the calibrated pose;
  // the operator can still change with keys 1-5).
  useEffect(() => {
    if (!active || phase !== "review") return;
    if (pendingViewAngle) {
      // Hold the matched pose through the crossfade, THEN glide to the chosen angle.
      const id = setTimeout(() => {
        dispatch(setDrsViewAngle(pendingViewAngle));
        dispatch(setDrsPendingViewAngle(null));
      }, HANDOFF_HOLD_MS);
      return () => clearTimeout(id);
    }
    // VIDEO ON: do NOT auto-move the camera after the trajectory. Keep the MAIN (calibrated
    // video) view it ended on and just hand control to OrbitControls — the operator moves
    // with keys 1-4 on demand. (Pre-selected angles above and scripted rule moves below
    // still apply; only the automatic "jump to front/side" is suppressed for video-on.)
    if (withVideo) {
      const id = setTimeout(() => {
        handToOrbit();
        dispatch(setDrsReviewInteractive(true));
      }, HANDOFF_HOLD_MS);
      return () => clearTimeout(id);
    }
    // AUTO animation (video OFF): the operator chose Auto → after a short hold (let the review
    // trajectory settle), glide to the chosen view. "front" = key 4 (Default),
    // "side" = key 1 (Hand; buildTween mirrors it by the batter's hand).
    if (operatorInput?.autoAngle) {
      const id = setTimeout(
        () => dispatch(setDrsViewAngle(operatorInput.autoAngle)),
        AUTO_VIEW_DELAY_MS,
      );
      return () => clearTimeout(id);
    }
    const planCam = reviewPlan?.camera;
    if (!planCam || planCam === "auto") {
      // No scripted camera move → KEEP the MAIN cam (the pose the trajectory ended on, an
      // inside-the-boundary front view) and hand to OrbitControls. Keys 1-4 override.
      const id = setTimeout(() => {
        handToOrbit();
        dispatch(setDrsReviewInteractive(true));
      }, HANDOFF_HOLD_MS);
      return () => clearTimeout(id);
    }
    if (planCam === "topPitch") {
      // Outside leg: the green 3D scene first appears at the SAME (video) angle;
      // hold it a beat so it reads continuously, THEN auto-glide to the top/centre
      // view (topDirect — smooth, world-up, no flip).
      // topDirectClose = the direct top move with a TIGHTER zoom (outside leg).
      const id = setTimeout(
        () => dispatch(setDrsViewAngle("topDirectClose")),
        HANDOFF_HOLD_MS,
      );
      return () => clearTimeout(id);
    }
    // topDown (full toss) → the DIRECT top flight. Held through the crossfade first
    // so the video→3D swap stays seamless, then it moves.
    const angle = planCam === "topDown" ? "topDirect" : planCam;
    const id = setTimeout(() => dispatch(setDrsViewAngle(angle)), HANDOFF_HOLD_MS);
    return () => clearTimeout(id);
  }, [active, phase, pendingViewAngle, reviewPlan, operatorInput, dispatch]);

  // Snap to the calibrated DRS pose during the phases that share the video overlay's frame —
  // ONLY when the video overlay is ON (the calibrated pose exists purely to align the 3D to
  // the mp4). With video OFF there's no mp4 to align to, and the calibrated pose is ~90 m out
  // behind the new stadium's stands → it would OVERRIDE BowlingTrajectory's inside-the-
  // boundary pose and black out the trajectory. So skip it entirely when video is off.
  useEffect(() => {
    if (!active || !virtualCamera || !withVideo) return;
    if (phase === "video" || phase === "paused" || phase === "trajectory") {
      applyVirtualCamera(camera, virtualCamera);
    }
  }, [active, phase, virtualCamera, camera, withVideo]);

  useEffect(() => {
    if (!active || !viewAngle) {
      tweenRef.current = null;
      return;
    }
    const ballPos = lastBallWorldPos
      ? new THREE.Vector3(
        lastBallWorldPos.x,
        lastBallWorldPos.y,
        lastBallWorldPos.z,
      )
      : new THREE.Vector3();
    const tw = buildTween(viewAngle, camera, ballPos, {
      rightHanded: operatorInput?.isRightHanded ?? true,
      // Match the BOWLING-ANALYSIS review framing exactly (the keys were copied from there):
      // a 30° fov at a fixed distance per angle → close, clear views (not the far telephoto
      // the DRS calibrated pose would otherwise hold). Per-key `dist` overrides this default.
      reviewFov: 30,
      reviewDist: 6,
    });
    if (!tw) return;
    tw.t0 = clock.getElapsedTime();
    tweenRef.current = tw;
  }, [
    viewAngle,
    viewAngleToken,
    active,
    lastBallWorldPos,
    camera,
    clock,
    operatorInput,
  ]);

  useFrame(() => {
    if (!active) return;
    const tw = tweenRef.current;
    if (!tw) return;
    // Paused: don't drive the camera — OrbitControls own it. Pin the tween's
    // progress so it resumes from the exact same point.
    if (reviewPaused) {
      if (pausedTweenElapsedRef.current == null)
        pausedTweenElapsedRef.current = clock.getElapsedTime() - tw.t0;
      tw.t0 = clock.getElapsedTime() - pausedTweenElapsedRef.current;
      return;
    }
    if (pausedTweenElapsedRef.current != null) {
      tw.t0 = clock.getElapsedTime() - pausedTweenElapsedRef.current;
      pausedTweenElapsedRef.current = null;
    }
    const t = Math.min((clock.getElapsedTime() - tw.t0) / tw.duration, 1);
    applyTween(camera, tw, t);
    // Move SETTLED → stop driving the camera and hand to OrbitControls so the
    // operator can zoom / pan / tilt on this view (for EVERY key, no pause needed).
    if (t >= 1) {
      tweenRef.current = null;
      handToOrbit();
      dispatch(setDrsReviewInteractive(true));
    }
  });

  return null;
}
