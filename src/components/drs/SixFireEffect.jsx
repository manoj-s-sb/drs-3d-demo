import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { sixFlight } from "./sixFlight";

// ── 6-Highlights fire TRAIL ──────────────────────────────────────────────────
// The ball is "on fire": from the moment it's hit, embers are emitted at the live ball
// position and trail BEHIND it along the whole flight, flickering white→yellow→orange→red
// and fading. So the fire travels WITH the ball from the bat to the landing.
// A fixed-size particle pool recycled as a ring buffer. Pure GPU points (additive, no
// texture) → offline-safe and cheap.

const COUNT = 900; // particle pool size (denser → smoother flame)
const EMIT_PER_FRAME = 16; // embers spawned at the ball each frame while flying
const PARTICLE_LIFE = 0.9; // seconds each ember lives after it's shed from the ball
const SPREAD = 1.6; // random ember speed off the ball (m/s)
const GRAV = 2.0; // slight downward pull so the trail drifts down (m/s²)
const BUOY = 1.4; // upward buoyancy (hot air rises) — gives a living flame flicker

// Soft round ember sprite — a radial gradient on a canvas (generated at runtime, no file
// → offline-safe). Makes each ember a soft glowing blob instead of a hard square, so the
// trail reads as smooth realistic fire.
function makeEmberTexture() {
  const s = 64;
  const cv =
    typeof document !== "undefined" ? document.createElement("canvas") : null;
  if (!cv) return null;
  cv.width = cv.height = s;
  const ctx = cv.getContext("2d");
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.85)");
  g.addColorStop(0.7, "rgba(255,255,255,0.25)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export default function SixFireEffect() {
  const pointsRef = useRef();
  const shotRef = useRef(null); // shotId we're trailing

  // Fixed particle pool: live state kept in plain arrays (not per-frame GC).
  const pool = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    const pos = new Float32Array(COUNT * 3);
    const col = new Float32Array(COUNT * 3);
    geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geom.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      size: 1.6, // soft sprite → can be larger without looking blocky
      map: makeEmberTexture(),
      alphaTest: 0.01,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    // Per-particle sim state.
    const age = new Float32Array(COUNT).fill(PARTICLE_LIFE + 1); // start all "dead"
    const vel = new Float32Array(COUNT * 3);
    return { geom, mat, pos, col, age, vel, cursor: 0 };
  }, []);

  const resetPool = () => {
    pool.age.fill(PARTICLE_LIFE + 1);
    pool.cursor = 0;
  };

  useFrame((state, dt) => {
    const S = sixFlight;
    const pts = pointsRef.current;
    if (!pts) return;
    const d = Math.min(dt, 0.05); // clamp big frame gaps

    if (!S.active) {
      if (shotRef.current !== null) {
        resetPool();
        shotRef.current = null;
      }
      pts.visible = false;
      return;
    }
    // New shot → clear the trail.
    if (shotRef.current !== S.shotId) {
      shotRef.current = S.shotId;
      resetPool();
    }

    const { pos, col, age, vel } = pool;

    // EMIT at the live ball while it's flying (hit → landing). The ball is S.live; we shed
    // embers there so the trail follows the ball from the bat.
    const flying = S.t >= 0 && !S.landed;
    if (flying) {
      for (let e = 0; e < EMIT_PER_FRAME; e++) {
        const i = pool.cursor;
        pool.cursor = (pool.cursor + 1) % COUNT;
        age[i] = 0;
        pos[i * 3] = S.live.x;
        pos[i * 3 + 1] = S.live.y;
        pos[i * 3 + 2] = S.live.z;
        // Small random velocity so embers puff off the ball (not a rigid line).
        vel[i * 3] = (Math.random() - 0.5) * SPREAD;
        vel[i * 3 + 1] = (Math.random() - 0.5) * SPREAD + 0.6;
        vel[i * 3 + 2] = (Math.random() - 0.5) * SPREAD;
      }
    }

    // Integrate + colour every particle; dead ones get zero colour (invisible, additive).
    let anyAlive = false;
    for (let i = 0; i < COUNT; i++) {
      const a = age[i];
      if (a > PARTICLE_LIFE) {
        col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0;
        continue;
      }
      anyAlive = true;
      age[i] = a + d;
      // Buoyancy (hot air rises) minus gravity + tiny turbulence → a living flame flicker.
      vel[i * 3 + 1] += (BUOY - GRAV) * d;
      vel[i * 3] += (Math.random() - 0.5) * 1.2 * d;
      vel[i * 3 + 2] += (Math.random() - 0.5) * 1.2 * d;
      pos[i * 3] += vel[i * 3] * d;
      pos[i * 3 + 1] = Math.max(pos[i * 3 + 1] + vel[i * 3 + 1] * d, 0.05);
      pos[i * 3 + 2] += vel[i * 3 + 2] * d;
      // Flame ramp over the ember's life: white → yellow → orange → red, dimming out.
      const f = a / PARTICLE_LIFE;
      let r, g, b;
      if (f < 0.3) {
        const u = f / 0.3;
        r = 1; g = 1; b = 1 - u; // white → yellow
      } else {
        const u = (f - 0.3) / 0.7;
        r = 1; g = 1 - 0.85 * u; b = 0; // yellow → orange → red
      }
      const dim = 1 - f;
      col[i * 3] = r * dim;
      col[i * 3 + 1] = g * dim;
      col[i * 3 + 2] = b * dim;
    }

    pts.visible = anyAlive;
    pool.geom.getAttribute("position").needsUpdate = true;
    pool.geom.getAttribute("color").needsUpdate = true;
  });

  return (
    <points ref={pointsRef} geometry={pool.geom} material={pool.mat} frustumCulled={false} />
  );
}
