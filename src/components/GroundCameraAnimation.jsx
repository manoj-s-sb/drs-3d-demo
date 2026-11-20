import { useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useSelector, useDispatch } from "react-redux";
import { playAnimation } from "../store/slices/animationSlice";

const isDebugMode = () => {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("debug") === "true";
};

// FIXED idle view — a STATIC overhead shot of the stadium (no fly-around). Captured from
// the live scene via getCameraLoc(). While idle is active we simply HOLD the scene's own
// DEFAULT camera at this pose — we do NOT swap in the GLB's nested camera (that nested
// camera's parent transform broke DRS/module poses → black 3D). No camera swap = no bug.
const IDLE_POSE = {
  pos: [-0.676, 112.17, 88.053],
  look: [-0.67, 111.3, 87.509],
  fov: 45,
};

export default function GroundCameraAnimation() {
  const { camera, controls } = useThree();
  const dispatch = useDispatch();
  const { groundCamera } = useSelector((state) => state.animation);

  // Auto-start idle on first mount (once).
  useEffect(() => {
    if (isDebugMode()) return;
    if (!groundCamera.isPlaying) dispatch(playAnimation("groundCamera"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  // While idle is active, HOLD the default camera at the fixed overhead pose. No camera swap,
  // no GLB camera, no mixer — so modules (DRS/pitch/stump/bowling) always drive this same
  // clean default camera and never inherit a nested/stale pose (which caused the black 3D).
  useFrame(() => {
    if (isDebugMode()) return;
    if (!groundCamera.isPlaying) return; // idle stopped → a module owns the camera now
    // Keep OrbitControls from fighting the fixed idle pose (re-asserted every frame so a
    // FixedScene re-render during idle can't re-enable it). When idle STOPS, FixedScene's
    // `enabled` prop reclaims the controls for the active module on the next render.
    if (controls?.enabled) controls.enabled = false;
    camera.up.set(0, 1, 0);
    camera.position.set(...IDLE_POSE.pos);
    if (camera.fov !== IDLE_POSE.fov) {
      camera.fov = IDLE_POSE.fov;
      camera.updateProjectionMatrix();
    }
    camera.lookAt(...IDLE_POSE.look);
  });

  return null;
}
