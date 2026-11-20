import React, { useEffect } from "react";
import { useGLTF } from "@react-three/drei";
import wicketModel from "../assets/models/wicket_2026-10-29.glb";

const Wicket = (props) => {
  const { scene } = useGLTF(wicketModel);
  // scene.getObjectByName("cricket_pitch").scale.set(1.5,1.5,1.5)

  useEffect(() => {
    scene.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }, [scene]);

  return (
    <group {...props} dispose={null}>
      <primitive object={scene} scale={1} />
    </group>
  );
};

useGLTF.preload(wicketModel);

export default Wicket;
