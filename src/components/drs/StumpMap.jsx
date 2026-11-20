import { useRef, useMemo, Suspense } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useSelector, useDispatch } from "react-redux";
import { setStumpMapInteractive } from "../../store/slices/sessionSlice";
import { stopAnimation } from "../../store/slices/animationSlice";
import { ballColorHex, ballCategory } from "./ballColors";
import GlbBall from "../GlbBall";

// ── Stump Map (beehive) — Hawk-Eye telephoto ───────────────────────────────────
// Front-on beehive: plots where each ball PASSED the stumps (x = line, y = height), as a
// 3D ball on a flat plane JUST in front of the stumps (z = 0.3 m, bowler's side) so the
// stumps never hide a ball. Viewed straight down the pitch from the bowler's end on a very
// long 6° telephoto lens — flat, broadcast look (balls near/far read the same size).

const STUMP_Z = 0.1; // ball plane — just IN FRONT of the stumps (toward the bowler/camera):
// enough to clear the thin poles so balls never clip them, but close enough that there's no
// visible gap from the stumps.

// Beehive camera: straight down the pitch, just above stump height, 6° lens. The pose is
// the reference's 1920×1080 auto-fit result (16.9 m back, framing x ±1.3 m, y 0–1.7 m).
const CAM = {
  pos: new THREE.Vector3(0, 2.7, 33), // lifted up + pulled further back so the beehive sits higher and clears the bottom ticker
  // ~5° so the far boundary ads clear the top of frame (clear of the UI); still in front of the
  // bowler's stumps (z=20.12) and above stump height, so the wicket never blocks the view
  look: new THREE.Vector3(0, 0.8, STUMP_Z), // 0.8 m up at the stump plane
  fov: 5, // very long telephoto → flat beehive look; zoomed in a little (was 6, full screen)
  fovPip: 12, // PiP (compact window) → wider lens so the spread beehive isn't cut at the sides
};

// Ball sizes (world metres). Full screen is a touch smaller; the PiP (which already zooms out)
// keeps its own slightly larger sizes so the dots still read in the small window.
const BALL_DIAMETER_BALL = 0.09; // by-ball 3D sphere (full screen)
const BALL_DIAMETER_RUNS = 0.095; // with-runs numbered disc (full screen)
const BALL_DIAMETER_BALL_PIP = 0.13; // by-ball 3D sphere (PiP)
const BALL_DIAMETER_RUNS_PIP = 0.12; // with-runs numbered disc (PiP)


export default function StumpMap() {
  const { camera, controls } = useThree();
  const dispatch = useDispatch();
  const active = useSelector((s) => s.session.stumpMapActive);
  const points = useSelector((s) => s.session.stumpMapPoints);
  const session = useSelector((s) => s.session.stumpMapSession);
  const interactive = useSelector((s) => s.session.stumpMapInteractive);
  const groundPlaying = useSelector((s) => s.animation.groundCamera.isPlaying);
  const style = useSelector((s) => s.session.stumpMapStyle);
  // PiP (compact broadcast window) → wider lens so the beehive isn't cut at the sides.
  const compact = useSelector((s) => s.session.compact);
  const camFov = compact ? CAM.fovPip : CAM.fov;
  // Per-ball runs/wickets from the score API (ballLog), keyed by ball number — SAME source
  // as the pitch map. The broadcast loadStump() can't carry runs (the command only has URLs),
  // so the dot colour + run number come from here; fall back to the point's own values.
  const byBall = useSelector((s) => s.score?.bowling?.byBall);
  const ballCategories = useSelector((s) => s.session.ballCategories);
  // Operator-toggled heartbeat pulse per outcome category (dot/runs/four/six/wicket).
  const stumpGlow = useSelector((s) => s.session.stumpGlow);
  const ballRefs = useRef([]); // ball groups, for the heartbeat scale pulse
  // Operator points (buildStumpPoint, from the full per-ball index) carry their OWN accurate
  // runs/isWicket/outcome — trust those. ONLY broadcast points (URL-only, no `outcome`) fall
  // back to the score API `byBall`. (byBall is keyed by ball number for a SINGLE over, so a
  // multi-over Filters view would otherwise mis-match a later over's wicket to an earlier ball.)
  const outcomes = useMemo(
    () =>
      (points ?? []).map((p) => {
        if (p.outcome != null) {
          return { runs: p.runs ?? 0, isWicket: !!p.isWicket };
        }
        const api = byBall?.[String(p.ballNo)];
        return {
          runs: api?.runs != null ? api.runs : p.runs ?? 0,
          isWicket: api?.isWicket != null ? api.isWicket : !!p.isWicket,
        };
      }),
    [points, byBall],
  );

  const startPosRef = useRef(null);
  const startFovRef = useRef(45);
  const t0Ref = useRef(0);
  const settledRef = useRef(false);
  const lastSessionRef = useRef(-1);

  // Aim OrbitControls at the stumps BEFORE it takes over, so it doesn't snap the camera to
  // orbit a stale target (which caused a whole-view flicker on hand-off).
  function settleControls() {
    if (controls?.target) {
      controls.target.copy(CAM.look);
      controls.update?.();
    }
  }

  useFrame((state) => {
    if (!active) return;

    // Stop the idle ground-camera fly-around — its mixer owns the camera and would override
    // our framing (so the stump view never appears). Idempotent.
    if (groundPlaying) dispatch(stopAnimation("groundCamera"));

    // Heartbeat pulse: balls whose outcome category the operator toggled ON scale up/down.
    // Runs every active frame (before the camera early-returns) so it keeps beating once settled.
    const pt = state.clock.getElapsedTime();
    for (let i = 0; i < (points?.length || 0); i++) {
      const el = ballRefs.current[i];
      if (!el) continue;
      const o = outcomes[i] ?? { runs: points[i].runs ?? 0, isWicket: !!points[i].isWicket };
      const on = !!stumpGlow?.[ballCategory(o.runs, o.isWicket)];
      el.scale?.setScalar(on ? 1 + 0.3 * (0.5 + 0.5 * Math.sin(pt * 6)) : 1);
    }

    // New Start (session bump): decide ONCE how to (re)enter. Already at the pose → just
    // hold it (no re-glide → no flicker). Coming from far → glide in (position + lens).
    if (lastSessionRef.current !== session) {
      lastSessionRef.current = session;
      const near = camera.position.distanceTo(CAM.pos) < 0.5;
      if (near) {
        camera.position.copy(CAM.pos);
        camera.up.set(0, 1, 0);
        camera.fov = camFov;
        camera.updateProjectionMatrix();
        camera.lookAt(CAM.look);
        settleControls();
        settledRef.current = true;
        if (!interactive) dispatch(setStumpMapInteractive(true));
      } else {
        startPosRef.current = camera.position.clone();
        startFovRef.current = camera.fov;
        t0Ref.current = state.clock.getElapsedTime();
        settledRef.current = false;
      }
    }

    if (interactive || settledRef.current) return; // OrbitControls own it once settled

    const t = Math.min((state.clock.getElapsedTime() - t0Ref.current) / 1.2, 1);
    const e = t * t * (3 - 2 * t); // smoothstep

    camera.position.lerpVectors(startPosRef.current || camera.position, CAM.pos, e);
    camera.up.set(0, 1, 0);
    // Ease the lens down to the long 6° telephoto (smooth zoom-in with the dolly).
    camera.fov = startFovRef.current + (camFov - startFovRef.current) * e;
    camera.updateProjectionMatrix();
    camera.lookAt(CAM.look);

    if (t >= 1) {
      camera.position.copy(CAM.pos);
      camera.fov = camFov;
      camera.updateProjectionMatrix();
      camera.lookAt(CAM.look);
      settleControls();
      settledRef.current = true;
      dispatch(setStumpMapInteractive(true));
    }
  });

  if (!active) return null;

  const ballMode = style === "ball";
  // PiP uses its own (slightly bigger) sizes; full screen uses the smaller base sizes.
  const diaBall = compact ? BALL_DIAMETER_BALL_PIP : BALL_DIAMETER_BALL;
  const diaRuns = compact ? BALL_DIAMETER_RUNS_PIP : BALL_DIAMETER_RUNS;
  const R = (ballMode ? diaBall : diaRuns) / 2;

  return (
    <group>
      {/* (The "hitting the stumps" frame — yellow outline + fill — was removed; not wanted.) */}

      {/* One ball per delivery, at (line, height) on the stump plane. */}
      {points.map((p, idx) => {
        const y = Math.max(p.y, R); // never sink below the ground
        // Outcome from the score API (byBall), falling back to the point's own values.
        const o = outcomes[idx] ?? { runs: p.runs ?? 0, isWicket: !!p.isWicket };
        // Operator category toggle: hide this ball if its outcome category is unchecked.
        if (ballCategories[ballCategory(o.runs, o.isWicket)] === false) return null;
        if (ballMode) {
          // BY BALL — real 3D ball tinted by outcome (same scheme as the pitch map).
          const tint = ballColorHex(o.runs, o.isWicket);
          return (
            <Suspense key={idx} fallback={null}>
              <GlbBall ref={(el) => (ballRefs.current[idx] = el)} position={[p.x, y, STUMP_Z]} radius={R} tint={tint} />
            </Suspense>
          );
        }
        // WITH RUNS — the REAL 3D GLB cricket ball (proper leather + stitching), TINTED by
        // outcome using the SAME broadcast scheme as the pitch map / legend:
        // dot grey · 1-3 green · four blue · six red · wicket yellow. No run number.
        const ballCol = ballColorHex(o.runs, o.isWicket);
        return (
          <Suspense key={idx} fallback={null}>
            <GlbBall ref={(el) => (ballRefs.current[idx] = el)} position={[p.x, y, STUMP_Z]} radius={R} tint={ballCol} />
          </Suspense>
        );
      })}
    </group>
  );
}
