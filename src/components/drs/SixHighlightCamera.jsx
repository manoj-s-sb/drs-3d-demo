import { useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useSelector, useDispatch } from "react-redux";
import { stopAnimation } from "../../store/slices/animationSlice";
import { sixFlight } from "./sixFlight";

// ── Broadcast six camera ─────────────────────────────────────────────────────
// Side-on broadcast shot for a six in ANY direction. Reads the flight (start, land,
// H, T, live ball, t) from sixFlight (published by BattingTrajectory) and drives the
// camera through: hold opening → ease to side-on → follow in flight → push-in on
// landing → slow orbit. Always eases, never cuts. See the prompt spec. Distances in
// metres; +Z points to the bowler; y is up.

const UP = new THREE.Vector3(0, 1, 0);
const GROUND_CENTRE = new THREE.Vector3(0, 0, 10.06); // ~middle of the pitch
const BOWLER_Z = 20.12; // bowler's stumps down the pitch
// Keep the camera INSIDE the ground. The new stadium's boundary rope is ≈ 56 m from the
// centre, with the stands rising just beyond it — so sitting too far back puts the camera
// outside the rope, INSIDE the stands, and the seats/roof beams block the arc (see the
// in-stadium shot). Clamp the camera well inside the boundary and WIDEN the fov instead so
// the whole arc still frames without the stands occluding it.
const MAX_DIST = 48;
// Camera style — now chosen at runtime (session.sixViewAngle): "hero" = the main broadcast
// down-the-ground push (behind the batter), "side" = the side-on shot. DEFAULT (auto): play
// on the main cam during the flight, then switch to the SIDE angle once the ball lands.
// Operator keys: 1 = side, 2 = main.
const BASE_FOV = 48; // vertical fov — wider so the arc sits more zoomed out
// Hero shot: how far the camera sits to the LEFT of the straight down-the-ground line, so
// the arc leans to one side and the labels/text have open space (not dead-centre).
const HERO_LATERAL = 18;
// Which side the camera leans for EVERY six (consistent framing): +1 = left, −1 = right.
const FIXED_SIDE = 1;
const DEG = Math.PI / 180;
const LAND_HOLD = 0.2; // seconds to hold on the landing before revealing (short → zoom out quickly)
const FULL_REVEAL = 1.6; // seconds to ease from the landing zoom out to the full arc (smooth settle)
const ZOOM = 0.55; // landing-shot fov multiplier (smaller = punched in on the landing)
// Camera smoothing rate (exponential follow): LOWER = smoother / gentler glide. The whole
// move (follow → push → zoom-out) eases at this rate so nothing snaps.
const SMOOTH = 2.2;
const smoothstep = (x) => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};

export default function SixHighlightCamera() {
  const { camera, size } = useThree();
  const sizeRef = useRef({ w: 16, h: 9 });
  sizeRef.current = { w: size.width, h: size.height };
  const dispatch = useDispatch();
  const groundPlaying = useSelector((s) => s.animation.groundCamera.isPlaying);
  const sixPaused = useSelector((s) => s.session.sixPaused);
  const sixViewAngle = useSelector((s) => s.session.sixViewAngle); // "side" | "main" | null (auto)
  const shot = useRef({ id: null });
  const lookRef = useRef(new THREE.Vector3());
  const fovRef = useRef(BASE_FOV);
  const landClockRef = useRef(null);
  const initRef = useRef(false);

  useFrame((state, dt) => {
    const S = sixFlight;
    if (!S.active) {
      shot.current.id = null;
      initRef.current = false;
      landClockRef.current = null;
      return;
    }
    // PAUSED (Space): hold the camera exactly where it is. The ball/trajectory are frozen
    // via sixFlight (BattingTrajectory pins its clock), and we keep the landing-reveal
    // clock from advancing so resume continues smoothly instead of jumping ahead.
    if (sixPaused) {
      if (landClockRef.current != null) landClockRef.current += dt;
      return;
    }

    // Belt-and-suspenders: a six owns the camera. If the idle ground-camera GLB
    // fly-around is somehow still playing, its mixer sweeps the camera every frame and
    // fights us → shake. Kill it the moment a six is active (idempotent).
    if (groundPlaying) dispatch(stopAnimation("groundCamera"));

    // ── Recompute the per-shot geometry + chosen side ONCE per shot ────────────
    if (shot.current.id !== S.shotId) {
      const dx = S.land.x - S.start.x;
      const dz = S.land.z - S.start.z;
      const R = Math.hypot(dx, dz) || 1;
      const dir = new THREE.Vector3(dx / R, 0, dz / R);
      const perp = new THREE.Vector3(-dir.z, 0, dir.x);
      const mid = new THREE.Vector3(
        (S.start.x + S.land.x) / 2,
        0,
        (S.start.z + S.land.z) / 2,
      );
      const theta = Math.acos(THREE.MathUtils.clamp(dir.z, -1, 1)) / DEG;

      // Side: ALWAYS lean to the same (left) side so EVERY six is framed consistently.
      // (Previously this was chosen per shot by which side was nearer the ground centre,
      // which made the first/different-direction balls frame differently — the operator
      // wants one consistent left-side shift for all trajectories.)
      const sideSign = FIXED_SIDE;

      // Opening camera.
      const open = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
      if (theta < 100) {
        // Behind the batter, looking down the shot line.
        open.pos.copy(S.start).addScaledVector(dir, -14);
        open.pos.y += 3.5;
        open.look.copy(S.start).addScaledVector(dir, 30);
        open.look.y += 6;
      } else {
        // Fine leg / third man / ramp → from the bowler's end, looking at the batter.
        open.pos.set(0, 12, BOWLER_Z + 25);
        open.look.set(0, 1.5, 0);
      }

      shot.current = { id: S.shotId, R, dir, perp, mid, theta, sideSign, open };
      landClockRef.current = null;
      initRef.current = false;
    }

    const sh = shot.current;

    const dir = sh.dir; // flat start→land direction
    // Flight progress 0→1 (contact→land); before contact → 0, after landing → 1.
    const prog = S.landed
      ? 1
      : S.T > 0
        ? THREE.MathUtils.clamp(S.t / S.T, 0, 1)
        : 0;

    // ── Camera POSE + framing look, by mode. The look choreography (flight follow → land
    // punch → reveal) is shared below; only the camera POSITION + arc-overview look differ.
    // Pick the view: explicit operator key (side/main), else AUTO = main cam during the
    // flight, SIDE angle once the ball has landed.
    const mode =
      sixViewAngle === "side"
        ? "side"
        : sixViewAngle === "main"
          ? "hero"
          : S.landed
            ? "side"
            : "hero";

    let camPos;
    let fov = BASE_FOV;
    let arcLook;
    if (mode === "side") {
      // ── PREVIOUS side-on shot (kept as a fallback) ──────────────────────────
      const vFov = BASE_FOV * DEG;
      const aspect = (sizeRef.current.w || 16) / (sizeRef.current.h || 9);
      const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
      const D = Math.max(
        (sh.R * 0.72) / Math.tan(hFov / 2),
        (S.H * 0.85) / Math.tan(vFov / 2),
        45,
      );
      camPos = sh.mid.clone().addScaledVector(sh.perp, sh.sideSign * D);
      const flat = camPos.clone();
      flat.y = GROUND_CENTRE.y;
      const distC = flat.distanceTo(GROUND_CENTRE);
      if (distC > MAX_DIST) {
        const s = MAX_DIST / distC;
        camPos.sub(GROUND_CENTRE).multiplyScalar(s).add(GROUND_CENTRE);
        fov = Math.min(90, BASE_FOV / s);
      }
      camPos.y = Math.max(S.H * 0.35, 13);
      arcLook = sh.mid.clone();
      arcLook.y = S.H * 0.4;
    } else {
      // ── DOWN-THE-GROUND "hero" pose: BEHIND the batter, low, looking down the shot
      // line. Pushes FORWARD + rises slightly as the ball flies; offset LEFT so the arc
      // leans aside and the labels have open space. Settles framing the whole arc.
      const BACK = Math.max(sh.R * 0.34, 18); // a bit further back → zoomed out
      const HCAM = Math.max(S.H * 0.55, 9);
      const pushBack = 12 * (1 - prog); // extra pull-back at the start → forward push
      camPos = S.start
        .clone()
        .addScaledVector(dir, -(BACK + pushBack))
        .addScaledVector(sh.perp, sh.sideSign * HERO_LATERAL); // lateral so text is visible
      camPos.y = HCAM - 1.5 * (1 - prog);
      const flat = camPos.clone();
      flat.y = GROUND_CENTRE.y;
      const distC = flat.distanceTo(GROUND_CENTRE);
      if (distC > MAX_DIST) {
        const s = MAX_DIST / distC;
        camPos.sub(GROUND_CENTRE).multiplyScalar(s).add(GROUND_CENTRE);
        fov = Math.min(90, BASE_FOV / s);
      }
      arcLook = S.start.clone().addScaledVector(dir, sh.R * 0.55);
      arcLook.y = S.H * 0.4;
    }

    // Look choreography (same beats for both modes):
    //   1) flight  → follow the live ball
    //   2) landed  → punch in on the LANDING, hold a beat
    //   3) reveal  → ease out to the whole arc (full summary + labels)
    const landLook = S.land.clone();
    landLook.y = 2;

    let targetLook;
    let targetFov = fov;
    if (!S.landed) {
      targetLook = S.live.clone();
    } else {
      if (landClockRef.current == null)
        landClockRef.current = state.clock.getElapsedTime();
      const since = state.clock.getElapsedTime() - landClockRef.current;
      if (since < LAND_HOLD) {
        targetLook = landLook;
        targetFov = fov * ZOOM;
      } else {
        const u = smoothstep((since - LAND_HOLD) / FULL_REVEAL);
        targetLook = landLook.clone().lerp(arcLook, u);
        targetFov = fov * ZOOM + (fov - fov * ZOOM) * u;
      }
    }
    const targetPos = camPos;

    // ── Apply (always eased; smooth follow 1 − e^(−3.5·dt)) ────────────────────
    const k = 1 - Math.exp(-SMOOTH * dt);
    if (!initRef.current) {
      camera.position.copy(targetPos);
      lookRef.current.copy(targetLook);
      fovRef.current = targetFov;
      initRef.current = true;
    } else {
      camera.position.lerp(targetPos, k);
      lookRef.current.lerp(targetLook, k);
      fovRef.current += (targetFov - fovRef.current) * k;
    }
    camera.up.copy(UP);
    if (Math.abs(fovRef.current - camera.fov) > 0.01) {
      camera.fov = fovRef.current;
      camera.updateProjectionMatrix();
    }
    camera.lookAt(lookRef.current);
  });

  return null;
}
