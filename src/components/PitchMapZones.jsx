import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import { useSelector } from "react-redux";
import { PITCH_ZONE_SETS } from "../drs/pitchZoneSets";

// Coloured length-zone bands for the pitch map, GENERATED IN CODE from the bowler-type zone
// sets (drs/pitchZoneSets.js) — NOT from the GLB's fixed meshes — so Seamers (6 zones) and
// Spinners (4 zones) use their exact metre boundaries. Both sets are mounted; switching
// bowler type CROSSFADES one set out and the other in (no snap). Bands lie flat on the pitch.

const PITCH_WIDTH = 3.66; // pitch width (m) — bands span the full width (edge-fade softens ends)
const LABEL_X = -1.0; // fixed X for EVERY zone label → a straight left-side column (text centred)
const BAND_Y = 0.004; // just above the pitch surface (flush); polygonOffset stops z-fighting
const LABEL_FONT = "/fonts/DejaVuSans-Bold.ttf";
const FADE_RATE = 3.2; // crossfade speed (higher = quicker)

// Edge-fade shader patch: fade a band's alpha to 0 toward its left/right X edges so it doesn't
// end in a hard rectangle. `uFadeStart` = where the fade begins (fraction of the half-width).
function addEdgeFade(mat, halfX) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uHalfX = { value: halfX };
    shader.uniforms.uFadeStart = { value: 0.6 };
    shader.vertexShader =
      "varying float vBandX;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\n  vBandX = position.x;",
      );
    shader.fragmentShader =
      "varying float vBandX;\nuniform float uHalfX;\nuniform float uFadeStart;\n" +
      shader.fragmentShader.replace(
        "#include <dithering_fragment>",
        "float _e = 1.0 - smoothstep(uFadeStart, 1.0, abs(vBandX / uHalfX));\n  gl_FragColor.a *= _e;\n  #include <dithering_fragment>",
      );
  };
}

// Multi-word zone names show on TWO lines (first word / rest), e.g. "FULL\nTOSS".
const twoLine = (name) => {
  const i = name.indexOf(" ");
  return i === -1 ? name : `${name.slice(0, i)}\n${name.slice(i + 1)}`;
};

// One bowler-type layer: all its bands + labels. Opacity is driven externally (crossfade).
function ZoneLayer({ setKey }) {
  const zones = PITCH_ZONE_SETS[setKey].zones;
  const bandMats = useRef([]);
  const labelRefs = useRef([]);

  const bands = useMemo(
    () =>
      zones.map((z) => {
        const midZ = (z.from + z.to) / 2;
        return {
          ...z,
          opacity: z.opacity ?? 0.4,
          midZ,
          length: Math.max(z.to - z.from, 0.01),
          // Per-zone label tuning (optional in the config; sensible defaults otherwise):
          //   labelX    → across the pitch (−left / +right), default LABEL_X
          //   labelZ    → down the pitch (m from batter stumps), default the band's middle
          //   labelSize → font size (m), default 0.2
          labelX: z.labelX ?? LABEL_X,
          labelZ: z.labelZ ?? midZ,
          labelSize: z.labelSize ?? 0.2,
        };
      }),
    [zones],
  );

  return (
    <group>
      {bands.map((b, i) => (
        <group key={`${setKey}-${i}`}>
          {/* Coloured band — a flat plane lying on the pitch (rotated to the ground plane). */}
          <mesh
            position={[0, BAND_Y, b.midZ]}
            rotation={[-Math.PI / 2, 0, 0]}
            renderOrder={3}
          >
            <planeGeometry args={[PITCH_WIDTH, b.length]} />
            <meshBasicMaterial
              ref={(m) => {
                if (m && bandMats.current[i] !== m) {
                  bandMats.current[i] = m;
                  m.userData.baseOpacity = b.opacity;
                  addEdgeFade(m, PITCH_WIDTH / 2);
                  m.needsUpdate = true;
                }
              }}
              color={b.color}
              transparent
              opacity={b.opacity}
              depthWrite={false}
              polygonOffset
              polygonOffsetFactor={-2}
              polygonOffsetUnits={-2}
            />
          </mesh>
          {/* Zone label — flat on the pitch, left of centre, at the band's mid-length.
              Two-word names wrap to two lines; smaller font than before. */}
          <Text
            ref={(el) => (labelRefs.current[i] = el)}
            position={[b.labelX, 0.06, b.labelZ]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={b.labelSize}
            lineHeight={1.05}
            color={b.textColor}
            anchorX="center"
            anchorY="middle"
            textAlign="center"
            font={LABEL_FONT}
            renderOrder={4}
          >
            {twoLine(b.name)}
          </Text>
        </group>
      ))}
      <LayerFade setKey={setKey} bandMats={bandMats} labelRefs={labelRefs} />
    </group>
  );
}

// Drives this layer's opacity toward 1 when it's the ACTIVE set, else 0 (smooth crossfade).
function LayerFade({ setKey, bandMats, labelRefs }) {
  const activeType = useSelector((s) => s.session.pitchBowlerType);
  const mixRef = useRef(setKey === activeType ? 1 : 0);
  useFrame((_, dt) => {
    const target = setKey === activeType ? 1 : 0;
    const m = mixRef.current + (target - mixRef.current) * Math.min(1, FADE_RATE * dt);
    mixRef.current = Math.abs(m - target) < 0.002 ? target : m;
    for (const mat of bandMats.current) {
      if (mat) mat.opacity = (mat.userData.baseOpacity ?? 0.34) * mixRef.current;
    }
    for (const lbl of labelRefs.current) {
      if (lbl) {
        lbl.fillOpacity = mixRef.current;
        lbl.visible = mixRef.current > 0.02;
      }
    }
  });
  return null;
}

export default function PitchMapZones(props) {
  const showTrajectoryPitchmap = useSelector(
    (s) => s.session.showTrajectoryPitchmap,
  );
  return (
    <group {...props} visible={showTrajectoryPitchmap} dispose={null}>
      {Object.keys(PITCH_ZONE_SETS).map((setKey) => (
        <ZoneLayer key={setKey} setKey={setKey} />
      ))}
    </group>
  );
}
