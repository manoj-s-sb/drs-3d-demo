import * as THREE from "three";

/**
 * Per-zone config for the pitchmap1 meshes (inside the ground GLB).
 *   color / opacity  → the semi-transparent colour band.
 *   text             → a 3D label drawn by MultiPitchMap (NOT the GLB's baked
 *                      text, which is hidden). Fully editable:
 *     name     the words shown
 *     color    text colour (darker shade of the band so it reads on it)
 *     opacity  0..1
 *     x, z     position on the pitch (metres; stumps at origin, +Z toward the
 *              bowler; small negative X = just left of centre, ON the band)
 *     size     font size (metres)
 */
// ICC 3-zone scheme: the 7 colour BANDS are kept exactly as-is (colours unchanged);
// only the LABELS are merged into three, positioned at the centre of each group:
//   FULL  (≤ 6 m)  → full toss + yorker + half volley + full
//   GOOD  (6–8 m)  → length
//   SHORT (> 8 m)  → back of length + short
// (Zones with no `text` just render their colour band — no label.)
// Broadcast length-band scheme (matches the reference HTML):
//   Yorker 0–2 m  → yellow #f2c230 @ 34%
//   Full   2–6 m  → green  #43a047 @ 34%
//   Good   6–8 m  → red    #e05a4f @ 34%
//   Short  8 m +  → purple #6b4fd6 @ 28%
// The GLB ships finer zones; they're grouped onto those four bands by length.
export const PITCHMAP_CONFIG = {
  outside_inline1: { color: "", opacity: 0.34 }, // Yorker
  full_toss1: { color: "#f2c230", opacity: 0.34 }, // Yorker
  yorker1: { color: "#f2c230", opacity: 0.34 }, // Yorker
  half_volley1: {
    color: "#43a047", // Full
    opacity: 0.34,
    // FULL label — centred over the full group (2–6 m).
    text: { name: "FULL", color: "#1f6e24", opacity: 0.95, x: -1.02, z: 3.9, size: 0.27 },
  },
  full1: { color: "#43a047", opacity: 0.34 }, // Full
  length1: {
    color: "#e05a4f", // Good
    opacity: 0.34,
    // GOOD label — the length band (6–8 m).
    text: { name: "GOOD", color: "#b33b32", opacity: 0.95, x: -0.87, z: 7.1, size: 0.27 },
  },
  back_of_length1: { color: "#6b4fd6", opacity: 0.28 }, // Short
  short1: {
    color: "#6b4fd6", // Short
    opacity: 0.28,
    // SHORT label — centred over the short group (> 8 m).
    text: { name: "SHORT", color: "#3d2fb0", opacity: 0.95, x: -0.75, z: 9.5, size: 0.27 },
  },
};

// Baked GLB text meshes (the model's own FULL TOSS / 2M / 4M … white labels) —
// hidden so only the config-driven labels above show.
const HIDDEN_MESHES = ["pitch _map_text1", "text1"];

/**
 * Configures material properties for child meshes in pitchmap1 (by exact name).
 * @param {THREE.Object3D} pitchmap1Object - The pitchmap1 object
 */
export const configurePitchmapMaterials = (pitchmap1Object) => {
  if (!pitchmap1Object) {
    console.warn("pitchmap1Object is not provided");
    return;
  }

  pitchmap1Object.traverse((child) => {
    if (!child.isMesh || !child.name) return;

    // Hide the baked white text labels (replaced by the config labels).
    if (HIDDEN_MESHES.includes(child.name)) {
      child.visible = false;
      return;
    }

    const cfg = PITCHMAP_CONFIG[child.name];
    if (!cfg) return;

    child.visible = true;
    // Local X half-extent of this band (for the edge fade) — computed from its geometry.
    child.geometry.computeBoundingBox();
    const bb = child.geometry.boundingBox;
    const halfX = Math.max((bb.max.x - bb.min.x) / 2, 1e-4);
    const midX = (bb.max.x + bb.min.x) / 2;
    const mats = Array.isArray(child.material)
      ? child.material
      : [child.material];
    const newMats = mats.map((m) => {
      if (!m) return m;
      // Clone so each band gets its OWN material (its own edge-fade uniforms + colour).
      const mat = m.clone();
      if (cfg.color !== undefined) mat.color = new THREE.Color(cfg.color);
      mat.opacity = cfg.opacity !== undefined ? cfg.opacity : mat.opacity;
      mat.transparent = true; // always transparent (the edge fade needs alpha)
      // Zone bands lie FLUSH on the pitch (coplanar) → z-fight/flicker as the camera moves.
      // Pull them toward the camera in the depth buffer + don't write depth, so they never
      // fight the pitch (same fix as the 30-yd circle and white lines).
      mat.polygonOffset = true;
      mat.polygonOffsetFactor = -2;
      mat.polygonOffsetUnits = -2;
      mat.depthWrite = false;
      // EDGE FADE: fade the band's alpha to 0 toward its LEFT/RIGHT X edges so it doesn't end
      // in a hard rectangle. `uFadeStart` = where the fade begins (fraction of the half-width);
      // 0.72 → solid in the middle 72%, fading out over the outer 28% on each side.
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uHalfX = { value: halfX };
        shader.uniforms.uMidX = { value: midX };
        shader.uniforms.uFadeStart = { value: 0.6 };
        shader.vertexShader =
          "varying float vBandX;\n" +
          shader.vertexShader.replace(
            "#include <begin_vertex>",
            "#include <begin_vertex>\n  vBandX = position.x;",
          );
        shader.fragmentShader =
          "varying float vBandX;\nuniform float uHalfX;\nuniform float uMidX;\nuniform float uFadeStart;\n" +
          shader.fragmentShader.replace(
            "#include <dithering_fragment>",
            "float _e = 1.0 - smoothstep(uFadeStart, 1.0, abs((vBandX - uMidX) / uHalfX));\n  gl_FragColor.a *= _e;\n  #include <dithering_fragment>",
          );
      };
      mat.needsUpdate = true;
      return mat;
    });
    child.material = Array.isArray(child.material) ? newMats : newMats[0];
    child.renderOrder = 3;
  });
};

export default configurePitchmapMaterials;
