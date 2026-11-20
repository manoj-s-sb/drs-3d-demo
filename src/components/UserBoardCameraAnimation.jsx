import React, { useEffect, useRef } from "react";
import { useGLTF, useAnimations } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useSelector, useDispatch } from "react-redux";
import { stopAnimation } from "../store/slices/animationSlice";
import userBoardCameraAnimation from "../assets/models/stancebeam_screen2_camera.glb";

const isDebugMode = () => {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("debug") === "true";
};

export default function UserBoardCameraAnimation(props) {
  const group = useRef();
  const { scene, animations, cameras } = useGLTF(userBoardCameraAnimation);
  const { actions } = useAnimations(animations, group);
  const { set, camera: mainCamera, controls } = useThree();
  const dispatch = useDispatch();
  const { userBoardCamera } = useSelector((state) => state.animation);

  useEffect(() => {
    if (isDebugMode()) return; // Skip camera swap in debug mode
    if (!cameras || cameras.length === 0) return;
    const animatedCamera = cameras[0];

    animatedCamera.aspect = mainCamera.aspect;
    animatedCamera.updateProjectionMatrix();

    // Only re-enable OrbitControls if WE disabled them. FixedScene's `enabled` prop
    // owns them otherwise — force-enabling here on unmount (e.g. when DRS hides the
    // stadium) left them running during the DRS video, and their update() re-aims
    // the camera at the orbit target, throwing off the calibrated overlay.
    let disabledHere = false;
    if (userBoardCamera.isPlaying) {
      set({ camera: animatedCamera });
      if (controls?.enabled) {
        controls.enabled = false;
        disabledHere = true;
      }
      animatedCamera.fov = 61.9;
      animatedCamera.updateProjectionMatrix();
    }

    return () => {
      set({ camera: mainCamera });
      if (disabledHere) controls.enabled = true;
    };
  }, [userBoardCamera.isPlaying]);

  useEffect(() => {
    if (!actions || Object.keys(actions).length === 0) return;

    if (userBoardCamera.isPlaying) {
      Object.values(actions).forEach((action) => {
        console.log(userBoardCamera.isPlaying);
        action.reset().fadeIn(0.3).play();

        // const duration = action.getClip().duration * 1000;
        // setTimeout(() => {
        //   dispatch(stopAnimation("userBoardCamera"));
        // }, duration);
      });
    } else {
      Object.values(actions).forEach((action) => {
        action.fadeOut(0.3).stop();
      });
    }
  }, [userBoardCamera.isPlaying, userBoardCamera.triggerId]);

  return <primitive ref={group} object={scene} {...props} />;
}

useGLTF.preload(userBoardCameraAnimation);
