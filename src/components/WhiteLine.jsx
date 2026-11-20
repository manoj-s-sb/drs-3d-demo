import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { useSelector } from "react-redux";
import whiteLineModel from "../assets/models/pitch_line_2026-10-29.glb";
import { getConfig } from "../drs/drsConfig";

// Pitch-map "centre line" colour (operator-supplied) — purple. Used ONLY on the pitch map;
// the DRS/review strip keeps its native (neutral) colour.
const PITCHMAP_STRIP_COLOR = new THREE.Color("#8000FF");

// `stripOnly` (used for the DRS video overlay): render ONLY the semi-transparent
// centre strip and hide every other pitch line, so the strip composites cleanly
// over the mp4 — aligned by the camera's calibration yaml, same as the ball.
const WhiteLine = ({ stripOnly = false, ...props }) => {
  const { scene } = useGLTF(whiteLineModel);
  const { pitchMapActive } = useSelector((state) => state.session);

  const midLineRef = useRef(null);
  const baseYRef = useRef(0);
  const baseColorRef = useRef(null);

  // Cache the strip mesh + mark it transparent once.
  useEffect(() => {
    const mesh = scene.getObjectByName("pitch_mid_line");
    if (mesh?.isMesh) {
      mesh.material.transparent = true;
      baseYRef.current = mesh.position.y; // remember its resting height
      baseColorRef.current = mesh.material.color.clone(); // remember its native colour
      midLineRef.current = mesh;
    }
  }, [scene]);

  // Toggle mesh visibility + opacity for the current mode (cheap — no re-mount).
  useEffect(() => {
    const strip = midLineRef.current;
    if (stripOnly) {
      // DRS video (AR): strip only, opacity from config.
      if (strip) strip.material.opacity = getConfig("STRIP_OPACITY_VIDEO");
      scene.traverse((o) => {
        if (o.isMesh) o.visible = o === strip;
      });
    } else {
      // Normal 3D view: all lines visible. Pitch mapping uses its OWN strip opacity
      // (STRIP_OPACITY_PITCHMAP) so it can be tuned independently of the DRS review.
      if (strip) {
        strip.material.opacity = pitchMapActive
          ? getConfig("STRIP_OPACITY_PITCHMAP")
          : getConfig("STRIP_OPACITY_REVIEW");
        // Pitch map → purple centre line; DRS/review → the strip's native colour.
        if (pitchMapActive) {
          strip.material.color.copy(PITCHMAP_STRIP_COLOR);
        } else if (baseColorRef.current) {
          strip.material.color.copy(baseColorRef.current);
        }
      }
      scene.traverse((o) => {
        if (o.isMesh) o.visible = true;
      });
      if (strip) {
        // The LBW strip stays visible in EVERY 3D view (bowling analysis, swing, pitch map,
        // DRS review) alongside the full pitch lines.
        strip.visible = true;
        // Lay it FLUSH ON THE PITCH SURFACE (y ≈ 0). The GLB's own resting height (baseY) sat
        // the strip a few cm ABOVE the pitch, so at low/angled views it looked like it was
        // floating. Pin it to the pitch plane; polygonOffset (below) stops it z-fighting the
        // pitch/colour zones; depthWrite off + renderOrder so pitch → strip → ball read right.
        strip.position.y = 0.002;
        strip.renderOrder = 1;
        strip.material.depthWrite = false;
        strip.material.polygonOffset = true;
        strip.material.polygonOffsetFactor = -1;
        strip.material.polygonOffsetUnits = -1;
      }
    }
  }, [scene, stripOnly, pitchMapActive]);

  return (
    <group {...props} dispose={null}>
      <primitive object={scene} scale={1} />
    </group>
  );
};

useGLTF.preload(whiteLineModel);

export default WhiteLine;
