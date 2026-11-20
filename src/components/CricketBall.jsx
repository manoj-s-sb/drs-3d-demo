import React, { forwardRef, useMemo, useEffect } from "react";
import * as THREE from "three";
import { getConfig } from "../drs/drsConfig";

// Ultra-realistic leather cricket ball (procedural — no external assets).
// Supports the three real match balls, switchable from Settings ("Ball type"):
//   • red   — Test / first-class    (off-white thread seam)
//   • white — ODI / T20             (black or dark-green thread seam)
//   • pink  — Day-night Test        (black thread, extra lacquer → glossier)
// All three are the SAME size (radius prop); only colour, seam colour and the
// material finish change. A leather grain + a 6-row stitched seam + a gold
// embossed maker's logo are drawn once onto a canvas, so it works offline and
// needs no image files.
//
// Forwards its ref to the mesh so callers (e.g. BowlingTrajectory) can move it by
// setting ref.current.position each frame — a drop-in for the old sphere.

const TEX = 2048; // canvas texture resolution (2K; bump at same size)

// ── Per-type look-and-feel ───────────────────────────────────────────────────
// base   leather body colour
// grain  base tint used for the fine speckle (kept close to `base`)
// logo   embossed maker's-mark colour
// mat    MeshPhysicalMaterial finish (roughness / clearcoat / lacquer)
// emissiveBoost  tiny self-lit floor so the ball still reads when lights dim
const BALL_PRESETS = {
  red: {
    base: "#9B1B1B",
    seam: "#F2F0E6", // off-white thread
    logo: "#C9A227", // gold
    mat: { roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.2 },
    emissiveBoost: 0.05,
  },
  white: {
    base: "#F5F5F0",
    seam: "#1A1A1A", // black thread (Settings can switch to dark green)
    logo: "#C9A227",
    mat: { roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.25 },
    emissiveBoost: 0.12, // brightest floor — keep the white ball crisp
  },
  pink: {
    base: "#E75480",
    seam: "#111111", // black thread
    logo: "#D9D9D9", // silver reads better on pink than gold
    mat: { roughness: 0.3, clearcoat: 1.0, clearcoatRoughness: 0.18 }, // extra lacquer
    emissiveBoost: 0.06,
  },
};

const WHITE_SEAM_GREEN = "#1F3D2B"; // optional dark-green thread for the white ball

// ---- draw the leather diffuse texture for a given preset --------------------
function drawDiffuse(preset, seamColor) {
  const c = document.createElement("canvas");
  c.width = c.height = TEX;
  const ctx = c.getContext("2d");

  // Base leather.
  ctx.fillStyle = preset.base;
  ctx.fillRect(0, 0, TEX, TEX);

  // Subtle leather grain — light + dark specks over the base (colour-agnostic).
  for (let i = 0; i < 45000; i++) {
    const x = Math.random() * TEX;
    const y = Math.random() * TEX;
    const dark = Math.random() < 0.5;
    ctx.fillStyle = dark ? "rgba(0,0,0,0.035)" : "rgba(255,255,255,0.035)";
    ctx.fillRect(x, y, 2, 2);
  }

  // ---- Seam: 6 rows of stitches (two banks of 3) around the equator (v=0.5).
  const cy = TEX * 0.5;
  const stitchGap = TEX * (4 / 226); // ~4 mm on a 226 mm circumference
  const rows = [-3, -2, -1, 1, 2, 3].map((k) => cy + k * (TEX * 0.012));
  ctx.strokeStyle = seamColor;
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(3, TEX * 0.004);
  for (const ry of rows) {
    for (let x = 0; x < TEX; x += stitchGap) {
      // short angled stitch (diagonal, like hand stitching)
      ctx.beginPath();
      ctx.moveTo(x, ry - TEX * 0.006);
      ctx.lineTo(x + stitchGap * 0.55, ry + TEX * 0.006);
      ctx.stroke();
    }
  }
  // faint seam channel between the two banks
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = Math.max(2, TEX * 0.002);
  ctx.beginPath();
  ctx.moveTo(0, cy);
  ctx.lineTo(TEX, cy);
  ctx.stroke();

  // ---- Gold/silver embossed logo on each hemisphere (v ≈ 0.25 and 0.75).
  const drawLogo = (cyy) => {
    ctx.save();
    ctx.translate(TEX * 0.5, cyy);
    ctx.textAlign = "center";
    ctx.fillStyle = preset.logo;
    ctx.font = `900 ${Math.round(TEX * 0.05)}px Arial, sans-serif`;
    ctx.fillText("SUPER CLUB", 0, -TEX * 0.02);
    ctx.font = `700 ${Math.round(TEX * 0.022)}px Arial, sans-serif`;
    ctx.fillText("WATER PROOF", 0, TEX * 0.02);
    ctx.fillText("GRADE A", 0, TEX * 0.045);
    ctx.fillText("GENUINE ALUM", 0, TEX * 0.07);
    // circular ring around the logo
    ctx.strokeStyle = preset.logo;
    ctx.lineWidth = TEX * 0.004;
    ctx.beginPath();
    ctx.arc(0, TEX * 0.025, TEX * 0.11, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  };
  drawLogo(TEX * 0.25);
  drawLogo(TEX * 0.75);

  return c;
}

// ---- draw the bump map (raised seam) — identical for every ball -------------
function drawBump() {
  const c = document.createElement("canvas");
  c.width = c.height = TEX;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#808080"; // neutral height
  ctx.fillRect(0, 0, TEX, TEX);

  const cy = TEX * 0.5;
  const stitchGap = TEX * (4 / 226);
  const rows = [-3, -2, -1, 1, 2, 3].map((k) => cy + k * (TEX * 0.012));
  ctx.strokeStyle = "#ffffff"; // raised
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(3, TEX * 0.005);
  for (const ry of rows) {
    for (let x = 0; x < TEX; x += stitchGap) {
      ctx.beginPath();
      ctx.moveTo(x, ry - TEX * 0.006);
      ctx.lineTo(x + stitchGap * 0.55, ry + TEX * 0.006);
      ctx.stroke();
    }
  }
  return c;
}

// Build + cache textures. Diffuse is cached per (type + seam colour); the bump is
// identical for every ball, so it's built once and shared across all instances.
const DIFFUSE_CACHE = new Map();
let SHARED_BUMP = null;
function textures(typeKey, preset, seamColor) {
  const cacheKey = `${typeKey}:${seamColor}`;
  let map = DIFFUSE_CACHE.get(cacheKey);
  if (!map) {
    map = new THREE.CanvasTexture(drawDiffuse(preset, seamColor));
    map.anisotropy = 8;
    map.colorSpace = THREE.SRGBColorSpace;
    DIFFUSE_CACHE.set(cacheKey, map);
  }
  if (!SHARED_BUMP) SHARED_BUMP = new THREE.CanvasTexture(drawBump());
  return { map, bumpMap: SHARED_BUMP };
}

const CricketBall = forwardRef(function CricketBall(
  { radius = 0.036, visible = true, type, ...props },
  ref,
) {
  // Resolve which ball to draw: explicit `type` prop wins, else the live Settings
  // value ("Ball type"), else red.
  const ballType = type || getConfig("BALL_TYPE") || "red";
  // White ball's seam thread is switchable (black ↔ dark green) from Settings.
  const whiteSeam = getConfig("WHITE_SEAM") === "green" ? WHITE_SEAM_GREEN : null;

  // One material per instance, referencing the (cached) per-type textures.
  const material = useMemo(() => {
    const preset = BALL_PRESETS[ballType] || BALL_PRESETS.red;
    const seamColor =
      ballType === "white" && whiteSeam ? whiteSeam : preset.seam;
    const { map, bumpMap } = textures(ballType, preset, seamColor);
    // Emissive floor uses the body colour (not white) so red/pink don't wash out
    // to white when scene lights are dim / IBL is offline.
    const emissive =
      ballType === "white"
        ? new THREE.Color(0xffffff)
        : new THREE.Color(preset.base);
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(preset.base),
      map,
      bumpMap,
      bumpScale: 0.0015,
      metalness: 0,
      roughness: preset.mat.roughness,
      clearcoat: preset.mat.clearcoat,
      clearcoatRoughness: preset.mat.clearcoatRoughness,
      emissive,
      emissiveIntensity: preset.emissiveBoost,
    });
  }, [ballType, whiteSeam]);

  // Dispose only the material on unmount — the cached textures are kept.
  useEffect(() => {
    return () => material.dispose();
  }, [material]);

  return (
    <mesh ref={ref} visible={visible} material={material} {...props}>
      <sphereGeometry args={[radius, 128, 128]} />
    </mesh>
  );
});

export default CricketBall;
