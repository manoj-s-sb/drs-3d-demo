import { useRef, useMemo, useEffect, Suspense } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useSelector, useDispatch } from "react-redux";
import { setInterceptInteractive } from "../../store/slices/sessionSlice";
import { stopAnimation } from "../../store/slices/animationSlice";
import { ballColorHex, ballCategory } from "./ballColors";
import GlbBall from "../GlbBall";

// ── Interception Map ────────────────────────────────────────────────────────────
// A beehive of BAT-IMPACT points (where the ball met the bat: x = line, y = height), plotted on
// a plane near the crease and viewed from a DRS-style SIDE angle (like the review "key 1" view).
// Mirrors the stump beehive, but the point is the bat contact, not the stumps crossing.

const IMPACT_Z = 2.0; // ball plane (m down the pitch) — near where contact happens

// Side (DRS key-1-style) camera: off to the side + high, looking at the impact cluster. Tunable
// live by pressing "3" in this view (prints the pose to the console).
const CAM = {
  pos: new THREE.Vector3(14, 4.5, IMPACT_Z + 10),
  look: new THREE.Vector3(0, 1.1, IMPACT_Z),
  fov: 14,
  fovPip: 24,
};

const BALL_DIAMETER_BALL = 0.09;
const BALL_DIAMETER_RUNS = 0.095;
const BALL_DIAMETER_BALL_PIP = 0.13;
const BALL_DIAMETER_RUNS_PIP = 0.12;

export default function MultiInterception() {
  const { camera, controls } = useThree();
  const dispatch = useDispatch();
  const active = useSelector((s) => s.session.interceptActive);
  const points = useSelector((s) => s.session.interceptPoints);
  const session = useSelector((s) => s.session.interceptSession);
  const interactive = useSelector((s) => s.session.interceptInteractive);
  const groundPlaying = useSelector((s) => s.animation.groundCamera.isPlaying);
  const style = useSelector((s) => s.session.interceptStyle);
  const compact = useSelector((s) => s.session.compact);
  const camFov = compact ? CAM.fovPip : CAM.fov;
  const byBall = useSelector((s) => s.score?.bowling?.byBall);
  const ballCategories = useSelector((s) => s.session.ballCategories);

  const outcomes = useMemo(
    () =>
      (points ?? []).map((p) => {
        if (p.outcome != null) return { runs: p.runs ?? 0, isWicket: !!p.isWicket };
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

  function settleControls() {
    if (controls?.target) {
      controls.target.copy(CAM.look);
      controls.update?.();
    }
  }

  // DEV: press "3" to print the current camera pose → paste into CAM.
  useEffect(() => {
    if (!active) return;
    const onKey = (e) => {
      if (e.key !== "3") return;
      const p = camera.position;
      const t = controls?.target || CAM.look;
      console.log(
        "[Interception camera]",
        `pos: new THREE.Vector3(${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}),`,
        `look: new THREE.Vector3(${t.x.toFixed(1)}, ${t.y.toFixed(1)}, ${t.z.toFixed(1)}),`,
        `fov: ${camera.fov.toFixed(1)}`,
      );
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, camera, controls]);

  useFrame((state) => {
    if (!active) return;
    if (groundPlaying) dispatch(stopAnimation("groundCamera"));

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
        if (!interactive) dispatch(setInterceptInteractive(true));
      } else {
        startPosRef.current = camera.position.clone();
        startFovRef.current = camera.fov;
        t0Ref.current = state.clock.getElapsedTime();
        settledRef.current = false;
      }
    }

    if (interactive || settledRef.current) return;

    const t = Math.min((state.clock.getElapsedTime() - t0Ref.current) / 1.2, 1);
    const e = t * t * (3 - 2 * t);
    camera.position.lerpVectors(startPosRef.current || camera.position, CAM.pos, e);
    camera.up.set(0, 1, 0);
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
      dispatch(setInterceptInteractive(true));
    }
  });

  if (!active) return null;

  const ballMode = style === "ball";
  const diaBall = compact ? BALL_DIAMETER_BALL_PIP : BALL_DIAMETER_BALL;
  const diaRuns = compact ? BALL_DIAMETER_RUNS_PIP : BALL_DIAMETER_RUNS;
  const R = (ballMode ? diaBall : diaRuns) / 2;

  return (
    <group>
      {points.map((p, idx) => {
        const y = Math.max(p.y, R);
        // Ball STOPPED at its real 3D impact point (x line, y height, z down-the-pitch). Fall
        // back to the IMPACT_Z plane only for legacy points that carry no z.
        const z = p.z != null ? p.z : IMPACT_Z;
        const o = outcomes[idx] ?? { runs: p.runs ?? 0, isWicket: !!p.isWicket };
        if (ballCategories[ballCategory(o.runs, o.isWicket)] === false) return null;
        const tint = ballColorHex(o.runs, o.isWicket);
        return (
          <Suspense key={idx} fallback={null}>
            <GlbBall position={[p.x, y, z]} radius={R} tint={tint} />
          </Suspense>
        );
      })}
    </group>
  );
}
