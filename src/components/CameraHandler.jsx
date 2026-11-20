import { useFrame, useThree } from "@react-three/fiber";
import { useSelector } from "react-redux";
import { useEffect, useRef } from "react";
import * as THREE from "three";

const isDebugMode = () => {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("debug") === "true";
};

export default function CameraHandler() {
  const { camera } = useThree();
  const { activeCamera, cameras } = useSelector((state) => state.camera);
  const { groundCamera, userBoardCamera } = useSelector(
    (state) => state.animation,
  );
  const { animationType } = useSelector((state) => state.session);
  const drsActive = useSelector((state) => state.drs.active);

  const targetPosition = useRef(new THREE.Vector3());
  const targetLookAt = useRef(new THREE.Vector3());
  const currentLookAt = useRef(new THREE.Vector3());
  const targetFov = useRef(camera.fov);

  // Update targets when activeCamera changes
  useEffect(() => {
    if (isDebugMode()) return; // Skip in debug mode
    if (drsActive) return;
    if (
      groundCamera.isPlaying ||
      userBoardCamera.isPlaying ||
      animationType === "TrajectoryView" ||
      animationType === "SlotEnd"
    ) {
      return;
    }

    const camData = cameras[activeCamera];
    if (camData) {
      targetPosition.current.set(
        camData.position.x,
        camData.position.y,
        camData.position.z,
      );

      targetLookAt.current.set(
        camData.lookAt.x,
        camData.lookAt.y,
        camData.lookAt.z,
      );

      targetFov.current = camData.fov || camera.fov;
    }
  }, [
    activeCamera,
    cameras,
    groundCamera.isPlaying,
    userBoardCamera.isPlaying,
    animationType,
  ]);

  // Apply camera instantly when triggers fire
  useEffect(() => {
    if (isDebugMode()) return; // Skip in debug mode
    if (drsActive) return;
    if (
      groundCamera.isPlaying ||
      userBoardCamera.isPlaying ||
      animationType === "TrajectoryView" ||
      animationType === "SlotEnd"
    ) {
      return;
    }

    camera.position.copy(targetPosition.current);
    currentLookAt.current.copy(targetLookAt.current);

    camera.lookAt(currentLookAt.current);
    camera.fov = targetFov.current;
    camera.updateProjectionMatrix();
  }, [
    activeCamera,
    groundCamera.isPlaying,
    groundCamera.triggerId,
    userBoardCamera.isPlaying,
    userBoardCamera.triggerId,
    animationType,
  ]);

  // Handle NoTrajectory animation type - set specific camera position
  useEffect(() => {
    if (isDebugMode()) return; // Skip in debug mode
    if (drsActive) return;
    if (animationType !== "NoTrajectory" && animationType !== "NoVideo") {
      return;
    }

    const noTrajectoryCam = cameras.no_trajectory_camera;
    if (noTrajectoryCam) {
      camera.position.set(
        noTrajectoryCam.position.x,
        noTrajectoryCam.position.y,
        noTrajectoryCam.position.z,
      );

      const lookAtVec = new THREE.Vector3(
        noTrajectoryCam.lookAt.x,
        noTrajectoryCam.lookAt.y,
        noTrajectoryCam.lookAt.z,
      );
      camera.lookAt(lookAtVec);

      camera.fov = noTrajectoryCam.fov || camera.fov;
      camera.updateProjectionMatrix();
    }
  }, [animationType, cameras, camera]);

  return null;
}
