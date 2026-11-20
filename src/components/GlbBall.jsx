import React, { forwardRef, useMemo } from "react";
import * as THREE from "three";
import { useKTX2GLTF } from "../useKTX2GLTF";
import ballWhiteModel from "../assets/models/ball_white_2026-10-24.glb";

// The real 3D ball GLB (ball_white_2026-10-24.glb) — the SAME model the bowling-analysis
// and swing views use. Drop-in replacement for the old procedural CricketBall: forwards
// its ref to a group so callers can move it each frame (ref.current.position), and takes
// the same `radius` / `position` / `rotation` / `visible` props.
//
// The GLB is auto-scaled so its largest dimension == radius*2 and re-centred on its own
// origin, so `radius` behaves exactly like the sphere it replaces.
const GlbBall = forwardRef(function GlbBall(
  { radius = 0.036, tint, ...props },
  ref,
) {
  const { scene } = useKTX2GLTF(ballWhiteModel);
  const obj = useMemo(() => {
    const c = scene.clone(true);
    const box = new THREE.Box3().setFromObject(c, true);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const s = (radius * 2) / (Math.max(size.x, size.y, size.z) || 1);
    c.scale.setScalar(s);
    c.position.set(-center.x * s, -center.y * s, -center.z * s);
    // Optional outcome tint (pitch map): keep the GLB's OWN leather material (so its KTX2
    // texture binding stays intact), just recolour it — set the base colour to the tint and
    // add matching emissive so the ball shows in that colour AND stays visible in night
    // mode (a lit-only material goes dark there). Clone so other instances aren't affected.
    if (tint) {
      const col = new THREE.Color(tint);
      c.traverse((o) => {
        if (!o.isMesh || !o.material) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        const tinted = mats.map((m) => {
          const cl = m.clone();
          if (cl.color) cl.color.copy(col);
          if ("emissive" in cl) {
            cl.emissive = col.clone();
            cl.emissiveIntensity = 0.6;
          }
          cl.toneMapped = false;
          cl.needsUpdate = true;
          return cl;
        });
        o.material = Array.isArray(o.material) ? tinted : tinted[0];
      });
    }
    return c;
  }, [scene, radius, tint]);

  return (
    <group ref={ref} {...props}>
      <primitive object={obj} />
    </group>
  );
});

export default GlbBall;
