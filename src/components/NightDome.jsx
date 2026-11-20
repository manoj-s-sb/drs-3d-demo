import { useMemo } from "react";
import * as THREE from "three";
import { useKTX2GLTF } from "../useKTX2GLTF";
import nightDomeModel from "../assets/models/dome_withoutblack_2026-10-26.glb";

// Night-sky backdrop dome (dome_2026-10-24.glb) — wraps the stadium with the night sky.
// Mounted only in NIGHT mode. KTX2-compressed textures → use the KTX2-aware loader.
//
// The glb ships the dome with STANDARD (lit) materials and the sky sphere is single-sided
// with OUTWARD normals. Two problems from inside the dome:
//   1) the floodlights blast the lit material white, and
//   2) the sky sphere's back faces get culled → the sky never renders.
// Fix: convert every dome material to an UNLIT, DOUBLE-SIDED, opaque MeshBasicMaterial so
// it shows the baked sky texture at a fixed brightness, immune to scene lights. (Verified
// in public/stadium-demo.html before porting here.)
export default function NightDome(props) {
  const { scene } = useKTX2GLTF(nightDomeModel);

  const dome = useMemo(() => {
    const root = scene.clone(true);
    const toUnlit = (m) =>
      new THREE.MeshBasicMaterial({
        map: m.map || null,
        color: 0xffffff,
        side: THREE.DoubleSide, // render from inside the dome
        transparent: false,
        opacity: 1,
        depthWrite: true,
        toneMapped: false, // show the sky texture as authored, not tone-mapped down
      });
    root.traverse((o) => {
      if (!o.isMesh) return;
      // The dome ships TWO meshes: the SKY "sphere" and a flat horizon "plan" plane
      // (330m wide, at y≈-0.29 — just BELOW the field, so it fills the far horizon with
      // no black while the field covers it near the centre). Keep + unlit BOTH when they
      // carry a texture. Only HIDE an UNtextured mesh — on the old dome the plan had no
      // map and unlit-whiting it made a solid WHITE band across the sky.
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const hasMap = mats.some((m) => m && m.map);
      if (!hasMap) {
        o.visible = false;
        return;
      }
      o.material = Array.isArray(o.material)
        ? o.material.map(toUnlit)
        : toUnlit(o.material);
    });
    return root;
  }, [scene]);

  return (
    <group {...props} dispose={null}>
      <primitive object={dome} />
    </group>
  );
}
