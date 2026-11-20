import { useEffect } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { readLampTransforms } from "../readLampTransforms";
import dynamicLightModel from "../assets/models/dynamic_light_2026-11-01.glb";

// Night floodlights, straight from dynamic_light.glb. Mounted only in NIGHT mode; the
// lamps use the FILE'S OWN colour / intensity / cone / baked aim (nothing computed).
// We build them imperatively because three.js shares one cached light across the glb's
// nodes (see readLampTransforms). They're added to the scene on mount and removed on
// unmount (i.e. when switching back to day).
// The dynamic_light.glb ships a raw Blender intensity (~1.1e7) that, under three.js
// physical lighting + ACES tone mapping, blows the whole field out to pure white. Scale
// every lamp down by this factor. 0.001 was dialled in via public/stadium-demo.html's
// flood-intensity slider (field lit, not blown out).
const FLOOD_INTENSITY_SCALE = 0.001;

export default function DynamicLights() {
  const { scene } = useThree();

  useEffect(() => {
    let disposed = false;
    const added = [];

    readLampTransforms(dynamicLightModel)
      .then((lamps) => {
        if (disposed) return;
        lamps.forEach(({ pos, fwd, def }) => {
          const color = def.color
            ? new THREE.Color(def.color[0], def.color[1], def.color[2])
            : new THREE.Color(0xffffff);
          const outer = def.spot ? def.spot.outerConeAngle : 0.62;
          const inner = def.spot ? def.spot.innerConeAngle : 0.22;
          const penumbra = outer > 0 ? 1 - inner / outer : 0.5;

          const light = new THREE.SpotLight(
            color,
            (def.intensity || 0) * FLOOD_INTENSITY_SCALE,
            def.range || 0,
            outer,
            penumbra,
            2, // decay (physical)
          );
          light.position.copy(pos);
          const target = new THREE.Object3D();
          target.position.copy(pos).addScaledVector(fwd, 50); // file's own baked aim
          scene.add(light);
          scene.add(target);
          light.target = target;
          added.push(light, target);
        });
      })
      .catch((e) => console.warn("[DynamicLights] failed to load:", e?.message));

    return () => {
      disposed = true;
      added.forEach((o) => scene.remove(o));
    };
  }, [scene]);

  return null;
}
