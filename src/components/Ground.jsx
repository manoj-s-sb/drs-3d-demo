import React, { useEffect } from "react";
import ground_model from "../assets/models/ground_2026-10-29.glb";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useSelector } from "react-redux";
import { useKTX2GLTF } from "../useKTX2GLTF";
import configurePitchmapMaterials from "./PitchmapConfig";
const Ground = (props) => {
  // ground.glb uses KTX2-compressed textures → load via the KTX2-aware helper.
  const { scene } = useKTX2GLTF(ground_model);
  const { camera } = useThree();
  const { showTrajectoryPitchmap } = useSelector((state) => state.session);

  useEffect(() => {
    // Null-safe: the new ground.glb (2026-10-24) has no pitchmap nodes.
    const pm2 = scene.getObjectByName("pitchmap2");
    if (pm2) pm2.visible = false;
    // Hide the baked dark pitch outline. `pitch_out_line` is a near-black (0.047 grey),
    // 34%-opaque rectangle a hair wider than the pitch (3.77 m vs 3.66 m) — it shows as an
    // unwanted dark BORDER wrapping the pitch in every view (DRS, pitch map, etc.). Not from
    // code; it's a mesh in the GLB. Hide it so the pitch meets the grass cleanly.
    const outline = scene.getObjectByName("pitch_out_line");
    if (outline) outline.visible = false;
    scene.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }, [scene]);

  useEffect(() => {
    const pitchmap = scene.getObjectByName("pitchmap1");
    if (!pitchmap) return; // this ground has no pitch-map length zones
    pitchmap.visible = showTrajectoryPitchmap;
    configurePitchmapMaterials(pitchmap);
  }, [showTrajectoryPitchmap, scene]);

  function getCameraLoc() {
    var cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);
    cameraDirection.add(camera.position);
    console.info(
      JSON.stringify({
        lookAt: {
          x: cameraDirection.x,
          y: cameraDirection.y,
          z: cameraDirection.z,
        },
        position: {
          x: camera.position.x,
          y: camera.position.y,
          z: camera.position.z,
        },
        up: { x: camera.up.x, y: camera.up.y, z: camera.up.z },
        fov: camera.fov,
      }),
    );
  }

  window.getCameraLoc = getCameraLoc;

  return (
    <group {...props} dispose={null}>
      <primitive object={scene} scale={1} />
    </group>
  );
};

// No useGLTF.preload — ground.glb is KTX2 and preload would load it without the
// KTX2Loader (poisoning the cache). useKTX2GLTF above is the only loader.
export default Ground;
