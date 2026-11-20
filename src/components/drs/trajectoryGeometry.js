import * as THREE from "three";

// Shared, ball-agnostic helpers + camera constants used by both the single-ball
// player (BowlingTrajectory) and the all-balls player (MultiBowlingTrajectory),
// plus the static AccumulatedTrajectories view. Keep behavior identical here so
// the single and multi views cannot drift apart.

export const CAMERA_POST_DELAY = 2;
export const TOP_MOVE_DURATION = 1.5;

export const smoothstep = (t) => t * t * (3 - 2 * t);

export const DEFAULT_CAM_POS = new THREE.Vector3(
  -4.655427110429939,
  12.974616617965138,
  45.6017459918846,
);
export const DEFAULT_CAM_LOOK = new THREE.Vector3(
  -4.557705348565277,
  12.702267300630647,
  44.64452276472935,
);

export const TOP_CAM_POS = new THREE.Vector3(
  -0.21239809348733912,
  81.56762548405102,
  32.87464532042358,
);
export const TOP_CAM_LOOK = new THREE.Vector3(
  -0.20983360204649903,
  80.62048146238433,
  32.5538469014675,
);

export function buildTubeGeometry(pts, radius) {
  if (!pts || pts.length < 2) return null;
  const curve = new THREE.CatmullRomCurve3(pts);
  const segments = Math.max(16, Math.min(240, Math.floor(pts.length * 12)));
  return new THREE.TubeGeometry(curve, segments, radius, 12, false);
}

export function setMeshPts(meshRef, pts, radius) {
  const mesh = meshRef?.current;
  if (!mesh) return;

  if (!pts || pts.length < 2) {
    mesh.visible = false;
    if (mesh.geometry) mesh.geometry.dispose();
    mesh.geometry = undefined;
    return;
  }

  const geom = buildTubeGeometry(pts, radius);
  mesh.visible = true;
  if (mesh.geometry) mesh.geometry.dispose();
  mesh.geometry = geom;
}

// Parse a raw trajectory array (string "[frame,x,y,z]" or [frame,x,y,z]) into
// { frame, pos: THREE.Vector3 }, scaled into scene units.
export function parseTrajectoryArray(arr, scale) {
  return arr.map((p) => {
    if (typeof p === "string") {
      const s = p.replace("[", "").replace("]", "").split(",");
      return {
        frame: parseInt(s[0]),
        pos: new THREE.Vector3(
          parseFloat(s[1]) * scale,
          parseFloat(s[2]) * scale,
          parseFloat(s[3]) * scale,
        ),
      };
    }
    return {
      frame: p[0] | 0,
      pos: new THREE.Vector3(p[1] * scale, p[2] * scale, p[3] * scale),
    };
  });
}

// Reduce one ball JSON object to the plain, redux-serializable shape the
// accumulated/multi views consume: { positions, impactIndex, pitchIndex }.
export function parseBallTrajectory(ball, scale) {
  if (!ball?.trajectory?.length) return null;
  const pts = parseTrajectoryArray(ball.trajectory, scale);
  const positions = pts.map((p) => ({ x: p.pos.x, y: p.pos.y, z: p.pos.z }));
  const impactFrame = ball.impactFrame ?? Infinity;
  const found = pts.findIndex((p) => p.frame >= impactFrame);
  const impactIndex = found === -1 ? positions.length : found;
  // Index where the ball pitches (bounces), for the freeze-at-pitch animation.
  const pitchFrame = ball.pitchingFrame ?? null;
  const pf = pitchFrame == null ? -1 : pts.findIndex((p) => p.frame >= pitchFrame);
  const pitchIndex = pf === -1 ? null : pf;
  return { positions, impactIndex, pitchIndex };
}

// Length zones by how far down the pitch the ball bounced — distance in METRES
// from the batsman's stumps (world origin, +Z toward the bowler). The data's
// own `ballMeta.ballDescription` is unreliable ("Full length" for every ball),
// so we classify from the actual bounce point instead. Tune these bounds if the
// labels read wrong for your pitch coordinate system.
export const LENGTH_ZONES = [
  { max: 1.0, label: "Yorker" },
  { max: 3.0, label: "Full" },
  { max: 6.0, label: "Good Length" },
  { max: 8.0, label: "Back of Length" },
  { max: Infinity, label: "Short" },
];

// Human length label for one ball, from where it actually pitched. Returns
// "Full Toss" when the ball never bounced (no pitching coordinate).
export function pitchLengthLabel(ball, scale) {
  const p = parseBallPitching(ball, scale);
  if (!p) return "Full Toss";
  const distM = Math.abs(p.z);
  const zone = LENGTH_ZONES.find((z) => distM <= z.max);
  return zone ? zone.label : LENGTH_ZONES[LENGTH_ZONES.length - 1].label;
}

// Reduce one ball JSON to its pitching (bounce) point + length description, for
// the pitch-map view: { x, y, z, description }.
export function parseBallPitching(ball, scale) {
  const raw = ball?.pitchingCoordinates?.[0];
  if (!raw) return null;
  const arr =
    typeof raw === "string"
      ? raw.replace("[", "").replace("]", "").split(",").map(Number)
      : raw;
  return {
    x: arr[1] * scale,
    y: arr[2] * scale,
    z: arr[3] * scale,
    description: ball?.ballMeta?.ballDescription ?? null,
    // ballNo/over let the pitch map match this dot to the score API's per-ball
    // outcome (ballLog) so dot/runs/boundary/wicket colours come from the API.
    ballNo: ball?.ball ?? null,
    over: ball?.over ?? null,
    runs: ball?.runs ?? 0, // fallback when the API is unavailable
    isWicket: (ball?.ballMeta?.wicketsFrame ?? 0) > 0, // fallback
  };
}
