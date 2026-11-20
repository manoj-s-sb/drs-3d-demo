import React, { useEffect, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import circle_30_model from "../assets/models/ground_30_yards_2026-10-29.glb";
import { useSelector } from "react-redux";

const Circle_30 = (props) => {
  const { circle_30_visibility } = useSelector((state) => state.session);
  const { scene } = useGLTF(circle_30_model);
  useEffect(() => {
    scene.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
      // The 30-yard circle is a flat decal lying FLUSH on the ground (both at y≈0). Coplanar
      // surfaces z-fight → the shimmer/flicker seen as the idle camera sweeps around. Pull the
      // circle slightly toward the camera in the depth buffer (polygonOffset) and give it a
      // renderOrder so it ALWAYS wins over the grass — no fighting, no flicker. (Same fix the
      // white pitch lines already use.)
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((m) => {
        if (!m) return;
        m.polygonOffset = true;
        m.polygonOffsetFactor = -2;
        m.polygonOffsetUnits = -2;
        m.needsUpdate = true;
      });
      child.renderOrder = 2;
    });
  }, [scene]);

  // Hooks must run unconditionally (rules of hooks) → gate the render, not the hooks.
  if (!circle_30_visibility) return null;

  return (
    <group {...props} dispose={null}>
      <primitive object={scene} scale={1} />
    </group>
  );
};

useGLTF.preload(circle_30_model);

export default Circle_30;
