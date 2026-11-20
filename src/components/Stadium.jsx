import React, { useEffect } from "react";
import * as THREE from "three";
import { useSelector } from "react-redux";
import { useKTX2GLTF } from "../useKTX2GLTF";
import stadium_model from "../assets/models/stadium_2026-10-29_blender_63m_boundary_day3.glb";
import ScreenText from "./ScreenText";
import { getConfig } from "../drs/drsConfig";

// The visible rope's NATIVE (as-modelled) radius in the current stadium GLB, measured from
// the pitch middle to the rope's centreline. The 63m day3 model's "boundary_65" rope is
// 63.24 m (inner edge 63.0 m). BOUNDARY_RADIUS defaults to this, so by default the rope
// shows EXACTLY as in Blender (scale 1). The operator can set any radius in Settings → the
// rope is scaled by value/63.24 about its own centre. Re-measure + update this when the
// stadium GLB changes.
const BOUNDARY_NATIVE_M = 63.24;

// Ground centre (pitch middle) — the stadium is rotated about THIS so it stays concentric.
const GROUND_CENTRE_Z = 10.06;

const Stadium = (props) => {
  // stadium.glb uses KTX2-compressed textures → load via the KTX2-aware helper.
  const { scene } = useKTX2GLTF(stadium_model);
  const { animationType } = useSelector((state) => state.session);
  // 6 Highlights: spin the stadium 180° while a six highlight plays (operator option), so the
  // view faces the nicer stand. Only when BOTH a six is active AND the operator enabled the
  // rotate option. Nothing else changes (camera etc. untouched); restores otherwise.
  const sixHighlight = useSelector((state) => state.session.sixHighlight);
  const sixRotateStadium = useSelector((state) => state.session.sixRotateStadium);
  const sixRotateDeg = useSelector((state) => state.session.sixRotateDeg);
  // Rotation applied during a six (operator-set degrees), else 0.
  const rotateY =
    sixHighlight && sixRotateStadium ? (sixRotateDeg || 0) * (Math.PI / 180) : 0;

  useEffect(() => {
    scene.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    // Show ONLY the 65 m boundary rope for now; hide the 55 m one.
    // (Null-safe in case a glb lacks one.)
    const b55 = scene.getObjectByName("boundary_55");
    const b65 = scene.getObjectByName("boundary_65");
    if (b65) b65.visible = true;
    if (b55) b55.visible = false;
  }, [scene]);

  // Resize the visible boundary rope to the operator's configured radius (Settings →
  // Boundary radius). Scales about the rope's own centre so it stays concentric. Live:
  // re-applies on the same-tab "drs-config-changed" event and the cross-tab "storage"
  // event (so the big screen follows the operator). Default 65 → unchanged.
  useEffect(() => {
    const rope = scene.getObjectByName("boundary_65");
    if (!rope) return;
    // Capture the rope's ORIGINAL scale/position/centre as the anchor — the GLB node may
    // have a non-identity native scale, so we multiply RELATIVE to it (never force 1,1,1,
    // which would break the rope). target 65 → factor 1 → exactly the native look.
    const origScale = rope.scale.clone();
    const origPos = rope.position.clone();
    rope.updateWorldMatrix(true, false);
    const nativeCenter = new THREE.Box3()
      .setFromObject(rope)
      .getCenter(new THREE.Vector3());

    const apply = () => {
      const target = getConfig("BOUNDARY_RADIUS") || BOUNDARY_NATIVE_M;
      const k = target / BOUNDARY_NATIVE_M;
      rope.scale.set(origScale.x * k, origScale.y, origScale.z * k);
      // Scaling is about the rope's local origin, which may not be its centre → reposition
      // so the (possibly off-origin) centre stays exactly where the native centre was.
      rope.position.copy(origPos);
      rope.updateWorldMatrix(true, false);
      const c = new THREE.Box3().setFromObject(rope).getCenter(new THREE.Vector3());
      rope.position.x += nativeCenter.x - c.x;
      rope.position.z += nativeCenter.z - c.z;
    };
    apply();

    // Same-tab (operator) config edits + cross-tab (big screen) localStorage changes.
    const onStorage = (e) => {
      if (!e || e.key === "drs.config.overrides") apply();
    };
    window.addEventListener("drs-config-changed", apply);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("drs-config-changed", apply);
      window.removeEventListener("storage", onStorage);
    };
  }, [scene]);

  useEffect(() => {
    const isTrajectory = animationType === "TrajectoryView";

    const baseLogos = ["ground_century_logo", "ground_stancebeam_logo"];
    const trajectoryLogos = [
      "ground_century_logo_trajectory",
      "ground_stancebeam_logo_trajectory",
    ];

    (isTrajectory ? trajectoryLogos : baseLogos).forEach((name) => {
      const obj = scene.getObjectByName(name);
      if (obj) obj.visible = true;
    });
    (isTrajectory ? baseLogos : trajectoryLogos).forEach((name) => {
      const obj = scene.getObjectByName(name);
      if (obj) obj.visible = false;
    });
  }, [animationType]);

  return (
    <group { ...props } dispose={ null }>
      {/* Rotate the stadium about the ground centre during a six highlight (operator-set
          degrees; concentric so the pitch stays centred). Pivot = translate to centre →
          rotate → translate back. */}
      <group
        position={ [0, 0, GROUND_CENTRE_Z] }
        rotation={ [0, rotateY, 0] }
      >
        <group position={ [0, 0, -GROUND_CENTRE_Z] }>
          <primitive object={ scene } scale={ 1 } />
        </group>
      </group>

      <ScreenText
        parentScene={ scene }
        offset={ 5 }
        lineSpacing={ 3 }
        curvature={ 100 }
        rotation={ { x: 0, y: 0.9, z: 0 } }
        positionOffset={ { x: 2, y: 1, z: -4 } }
      />
    </group>
  );
};

// NOTE: no useGLTF.preload here — preload runs at module load with the DEFAULT loader
// (no KTX2Loader, and no WebGL renderer yet for detectSupport), which fails for this
// KTX2-compressed glb and poisons the cache. The in-component useGLTF above loads it
// correctly with the KTX2Loader wired in.
export default Stadium;
