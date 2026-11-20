import { useRef, useMemo, useEffect } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import { useSelector, useDispatch } from "react-redux";
import { setWagonInteractive } from "../../store/slices/sessionSlice";
import { stopAnimation } from "../../store/slices/animationSlice";
import { ballColorHex } from "./ballColors";

// ── Wagon Wheel / Six Beam Tracker ────────────────────────────────────────────
// One animated BEAM per scoring shot, following the ball's real flight (its `afterImpact`
// path: bat → apex → landing) so it reads as a trajectory, not a flat line. Beams draw one
// after another; older ones dim so the newest pops, then all return to full once the last
// has landed. Viewed from high over the ground (near top-down), the whole field in frame.

const GROUND_CENTRE_Z = 10.06; // ground centre (pitch middle) — the view is framed on this.

// High, slightly-tilted overhead camera (lifted a little so the arcs read as flight). Glides in
// once per Start, then hands to OrbitControls so the operator can zoom/pan/tilt.
const CAM = {
  // Operator-chosen angle (press "3" in the wagon view to re-capture).
  pos: new THREE.Vector3(-50.8, 76.2, 129.2),
  look: new THREE.Vector3(1.2, -6.5, 20.9),
  fov: 52,
  fovPip: 60,
};

// Per-beam timeline. The one-by-one pass is fitted to the operator's TOTAL duration
// (wagonDuration): each of N shots gets an equal STEP = duration / N, drawn over that whole
// slot (continuous, no gap) so all N finish exactly at `duration`. A per-ball floor keeps it
// watchable when the total is tiny.
const MIN_DRAW = 0.12; // floor for one beam's draw time (keeps fast totals watchable)
const OVERLAP = 0.5; // sequential: next beam starts when the previous is 50% drawn
const PAN_SWING = 0.3; // total azimuth swing of the slow left→right camera drift (radians ≈ 17°)
const BUILD_PER_FRAME = 3; // tube geometries to construct per frame (spread the cost → no hitch)
const _panOff = new THREE.Vector3(); // scratch for the panned camera offset
const UP_AXIS = new THREE.Vector3(0, 1, 0);
const POP = 0.28; // land dot / ring pop duration
const BEAM_RADIUS = 0.42; // beam thickness (m) — a touch thicker so the tubes read clearly
const WAGON_BOUNDARY_R = 65; // boundary radius (m) — four lines in LINE mode clamp to this
const easeOut = (p) => 1 - Math.pow(1 - p, 3);

export default function MultiWagonWheel() {
  const { camera, controls } = useThree();
  const dispatch = useDispatch();
  const active = useSelector((s) => s.session.wagonActive);
  const lines = useSelector((s) => s.session.wagonLines);
  const session = useSelector((s) => s.session.wagonSession);
  const interactive = useSelector((s) => s.session.wagonInteractive);
  const reveal = useSelector((s) => s.session.wagonReveal); // "sequential" | "together"
  const duration = useSelector((s) => s.session.wagonDuration); // total seconds for all shots
  const sweep = useSelector((s) => s.session.wagonSweep); // "cw" | "ccw" — round-the-ground order
  const style = useSelector((s) => s.session.wagonStyle); // "actual" (flight arc) | "line" (straight)
  const groundPlaying = useSelector((s) => s.animation.groundCamera.isPlaying);
  const compact = useSelector((s) => s.session.compact);
  const camFov = compact ? CAM.fovPip : CAM.fov;

  // ── camera entry (zoom-out to the overhead view) ──
  const startPosRef = useRef(null);
  const startFovRef = useRef(45);
  const t0Ref = useRef(0);
  const settledRef = useRef(false);
  const lastSessionRef = useRef(-1);
  const animStartRef = useRef(0); // clock time the beam sequence began (per session)
  const panT0Ref = useRef(0); // clock time the slow left→right pan began
  const panOffRef = useRef(null); // camera offset (pos − look) captured at settle, for the orbit

  function settleControls() {
    if (controls?.target) {
      controls.target.copy(CAM.look);
      controls.update?.();
    }
  }

  // Build a tube geometry + landing point per shot from its flight path. Fixed per data change;
  // the animation only grows the draw-range + fades opacity, so this is cheap at runtime.
  // LIGHTWEIGHT specs only (points / colour / radius / land) — NO geometry here. Building the
  // tube geometries is deferred to useFrame (a few per frame) so Start doesn't hitch when all
  // the shots arrive at once.
  const shots = useMemo(() => {
    const specs = (lines ?? [])
      .map((l) => {
        if (!l.path || l.path.length < 2) return null;
        // "Line trajectory" applies ONLY to FOURS → a straight bat→landing line flat on the
        // ground, with the landing CLAMPED to the boundary circle so it stops at the rope.
        // Everything else (sixes, etc.) ALWAYS uses the real flight arc.
        const lineFour = style === "line" && l.outcome === "four";
        let lx = l.lx;
        let lz = l.lz;
        if (lineFour) {
          const dx = lx;
          const dz = lz - GROUND_CENTRE_Z;
          const dist = Math.hypot(dx, dz);
          if (dist > WAGON_BOUNDARY_R) {
            const k = WAGON_BOUNDARY_R / dist;
            lx = dx * k;
            lz = GROUND_CENTRE_Z + dz * k;
          }
        }
        let pts;
        if (lineFour) {
          // Straight bat→landing line. Sample MANY points along it (not just 2) so the tube has
          // enough segments to grow smoothly in the reveal — a 2-point tube steps/"breaks".
          const a = new THREE.Vector3(l.sx, 0.3, l.sz);
          const b = new THREE.Vector3(lx, 0.3, lz);
          const SEG = 48;
          pts = [];
          for (let k = 0; k <= SEG; k++) pts.push(a.clone().lerp(b, k / SEG));
        } else {
          pts = l.path.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
        }
        const radius =
          l.outcome === "six" ? BEAM_RADIUS : l.outcome === "four" ? BEAM_RADIUS * 0.7 : BEAM_RADIUS * 0.5;
        const land = pts[pts.length - 1];
        return { pts, radius, color: ballColorHex(l.runs, l.isWicket), land };
      })
      .filter(Boolean);

    // ROUND THE GROUND: order the one-by-one draw to sweep from the LEG SIDE around the field,
    // either clockwise or anticlockwise. Order by each landing's SCREEN position (projected
    // through the fixed wagon camera) so "top of the stadium" is literally the top of the frame.
    //   CLOCKWISE  → starts at the TOP (12 o'clock), sweeps 12→3→6→9.
    //   ANTICLOCKWISE → ALSO starts at the TOP (12 o'clock), sweeps 12→9→6→3.
    const TAU = Math.PI * 2;
    const projCam = new THREE.PerspectiveCamera(CAM.fov, 16 / 9, 0.1, 10000);
    projCam.position.copy(CAM.pos);
    projCam.up.set(0, 1, 0);
    projCam.lookAt(CAM.look);
    projCam.updateMatrixWorld();
    projCam.updateProjectionMatrix();
    const _c = new THREE.Vector3(CAM.look.x, 0.3, CAM.look.z).project(projCam); // wheel centre on screen
    const TOP = Math.PI / 2; // 12 o'clock in screen-angle (atan2, y up)
    const _v = new THREE.Vector3();
    const keyOf = (s) => {
      _v.copy(s.land).project(projCam);
      const ang = Math.atan2(_v.y - _c.y, _v.x - _c.x); // screen angle, CCW positive
      // CW key: distance clockwise from the TOP (known-good). CCW is the EXACT MIRROR — same
      // top start, reversed direction (12→11→10) — so it's guaranteed opposite to CW.
      let d = (((TOP - ang) % TAU) + TAU) % TAU;
      if (sweep === "ccw" && d > 0) d = TAU - d;
      return d;
    };
    specs.sort((a, b) => keyOf(a) - keyOf(b));
    return specs;
  }, [lines, sweep, style]);

  // Batsman handedness for the OFF/LEG ground labels — driven by the filter's Batsman-style pick.
  const batHand = useSelector((s) => s.session.wagonBatHand);

  // Deferred geometry store: geomRef.current[i] = { geom, indexCount } once built. builtRef is
  // how many have been built so far; useFrame builds a few more each frame.
  const geomRef = useRef([]);
  const builtRef = useRef(0);
  useEffect(() => {
    // New shot set → dispose old geometries and reset the incremental build. Also re-arm the
    // animation clock (0) so the beams + pan start when THIS set begins drawing — on broadcast
    // that's when the lines arrive (Play), not when the camera settled (Send).
    geomRef.current.forEach((g) => g?.geom?.dispose());
    geomRef.current = [];
    builtRef.current = 0;
    animStartRef.current = 0;
    panT0Ref.current = 0;
  }, [shots]);

  // Dispose on unmount.
  useEffect(() => {
    return () => geomRef.current.forEach((g) => g?.geom?.dispose());
  }, []);

  // DEV helper: while the wagon wheel is active, press "3" to print the CURRENT camera pose
  // (orbit to the angle you want, then press 3) — copy the logged pos/look/fov to CAM here.
  useEffect(() => {
    if (!active) return;
    const onKey = (e) => {
      if (e.key !== "3") return;
      const p = camera.position;
      const t = controls?.target || CAM.look;
      console.log(
        "[WagonWheel camera]",
        `pos: new THREE.Vector3(${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}),`,
        `look: new THREE.Vector3(${t.x.toFixed(1)}, ${t.y.toFixed(1)}, ${t.z.toFixed(1)}),`,
        `fov: ${camera.fov.toFixed(1)}`,
      );
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, camera, controls]);

  const meshRefs = useRef([]);
  const matRefs = useRef([]);
  const dotRefs = useRef([]);
  const ringRefs = useRef([]);

  useFrame((state) => {
    if (!active) return;
    if (groundPlaying) dispatch(stopAnimation("groundCamera"));

    // On a new Start: begin a smooth ZOOM-OUT from the current camera to the overhead wagon
    // view. The wagon wheel + the left→right drift only begin AFTER the zoom-out finishes.
    if (lastSessionRef.current !== session) {
      lastSessionRef.current = session;
      startPosRef.current = camera.position.clone();
      startFovRef.current = camera.fov;
      t0Ref.current = state.clock.getElapsedTime();
      settledRef.current = false;
      animStartRef.current = 0; // beams wait until the zoom-out completes
    }

    // ZOOM-OUT in progress → ease the camera to the overhead pose, then settle and kick off the
    // wagon animation + the drift.
    if (!interactive && !settledRef.current) {
      const t = Math.min((state.clock.getElapsedTime() - t0Ref.current) / 1.2, 1);
      const e = t * t * (3 - 2 * t); // smoothstep
      camera.position.lerpVectors(startPosRef.current || CAM.pos, CAM.pos, e);
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
        panOffRef.current = CAM.pos.clone().sub(CAM.look);
        // NOTE: do NOT stamp animStart here. On broadcast the camera settles on SEND but the
        // lines only arrive on PLAY — so the beam+pan clock starts when the SHOTS appear (below).
      }
    }

    // ── beam sequence (starts when the SHOTS arrive, after the camera has settled) ──
    const n = shots.length;
    if (!n) return;

    // Stamp the animation/pan start the first frame shots exist AND the camera is settled. This
    // is "Play" on broadcast (lines arrive then) and right-after-settle in the operator preview.
    if (settledRef.current && !animStartRef.current) {
      animStartRef.current = state.clock.getElapsedTime();
      panT0Ref.current = state.clock.getElapsedTime();
    }

    // Slow LEFT→RIGHT camera drift — runs TOGETHER with the trajectory play (from the same
    // start), easing to one side, then hands to OrbitControls.
    if (settledRef.current && !interactive && panOffRef.current && animStartRef.current) {
      const panTime = duration + 10; // drift across the play + a hold after
      const pt = Math.min((state.clock.getElapsedTime() - panT0Ref.current) / panTime, 1);
      const angle = pt * PAN_SWING; // start at the settled pose (no jump) → drift
      _panOff.copy(panOffRef.current).applyAxisAngle(UP_AXIS, angle);
      camera.position.copy(CAM.look).add(_panOff);
      camera.up.set(0, 1, 0);
      camera.lookAt(CAM.look);
      if (pt >= 1) {
        settleControls();
        dispatch(setWagonInteractive(true)); // pan done → operator can orbit
      }
    }

    // Build a few tube geometries per frame (deferred from Start) so the whole set doesn't
    // construct in one frame and hitch. Runs during the camera glide, so they're ready by the
    // time beams need to draw.
    let buildsThisFrame = 0;
    while (builtRef.current < n && buildsThisFrame < BUILD_PER_FRAME) {
      const i = builtRef.current;
      const s = shots[i];
      const curve = new THREE.CatmullRomCurve3(s.pts);
      const seg = Math.max(16, Math.min(120, s.pts.length * 2));
      const geom = new THREE.TubeGeometry(curve, seg, s.radius, 8, false);
      geom.setDrawRange(0, 0);
      geomRef.current[i] = { geom, indexCount: geom.index ? geom.index.count : 0 };
      if (meshRefs.current[i]) meshRefs.current[i].geometry = geom;
      builtRef.current++;
      buildsThisFrame++;
    }

    if (!animStartRef.current) {
      // Camera still gliding in — keep every beam hidden until it settles.
      for (let i = 0; i < n; i++) {
        if (meshRefs.current[i]) meshRefs.current[i].visible = false;
        if (dotRefs.current[i]) dotRefs.current[i].visible = false;
        if (ringRefs.current[i]) ringRefs.current[i].visible = false;
      }
      return;
    }
    const elapsed = state.clock.getElapsedTime() - animStartRef.current;
    // TOGETHER → every beam starts at 0 and draws at once (one shot). SEQUENTIAL → each next beam
    // starts when the previous is HALFWAY (50% overlap). No dimming (all solid), no recap.
    const together = reveal === "together";
    // Fit the whole one-by-one pass to the operator's total duration, accounting for the overlap:
    //   total = (n-1)*STEP + DRAW, with STEP = DRAW*OVERLAP  →  DRAW = duration / ((n-1)*OVERLAP + 1)
    const DRAW = together
      ? Math.min(duration, 1.5)
      : Math.max(MIN_DRAW, duration / ((n - 1) * OVERLAP + 1));
    const STEP = together ? 0 : DRAW * OVERLAP;
    const startOf = (i) => i * STEP;

    for (let i = 0; i < n; i++) {
      const mesh = meshRefs.current[i];
      const mat = matRefs.current[i];
      const dot = dotRefs.current[i];
      const ring = ringRefs.current[i];
      if (!mesh || !mat) continue;

      const built = geomRef.current[i];
      const startT = startOf(i);
      const drawEnd = startT + DRAW;

      // Geometry not built yet (still spreading the build) or not started → keep hidden.
      if (!built || elapsed < startT) {
        mesh.visible = false;
        if (dot) dot.visible = false;
        if (ring) ring.visible = false;
        continue;
      }
      mesh.visible = true;
      const progress = Math.min((elapsed - startT) / DRAW, 1);
      const grown = Math.floor(built.indexCount * easeOut(progress));
      built.geom.setDrawRange(0, grown);

      // Always SOLID — no transparency/dimming at any point.
      mat.opacity = 1;

      // Land FX: dot pops + ring spreads once the beam reaches the landing.
      const landed = progress >= 1;
      if (dot) {
        dot.visible = landed;
        if (landed) {
          const k = Math.min((elapsed - drawEnd) / POP, 1);
          dot.scale.setScalar(0.2 + 1.0 * easeOut(k));
          dot.material.opacity = 1;
        }
      }
      if (ring) {
        const k = landed ? Math.min((elapsed - drawEnd) / (POP * 1.8), 1) : 0;
        ring.visible = landed && k < 1;
        if (ring.visible) {
          ring.scale.setScalar(0.3 + 3.2 * k);
          ring.material.opacity = (1 - k) * 0.8;
        }
      }
    }
  });

  if (!active) return null;

  return (
    // Lift the whole wagon a little off the turf so the Super Cola logo / pitch-line DECALS
    // (which sit on the ground surface) can't draw over the beams — while depth testing stays ON
    // so the roof/stands still correctly hide balls behind them. ~0.6 m is invisible at this scale.
    <group position={[0, 0.6, 0]}>
      {/* OFF-SIDE / LEG-SIDE text laid FLAT on the ground, sides by batsman hand.
          RHB → off side on −x, leg side on +x; LHB → swapped. (Rotated to lie on the turf.) */}
      {(() => {
        const rhb = batHand !== "L";
        const DIST = 45; // metres out from centre → sits in the ring between the 30-yd circle (~27m) and the rope (~60m)
        const LABEL_Z = GROUND_CENTRE_Z + 2;
        const offX = rhb ? -DIST : DIST;
        const legX = rhb ? DIST : -DIST;
        const common = {
          rotation: [-Math.PI / 2, 0, 0], // lie flat on the ground
          fontSize: 7,
          color: "#ffffff",
          anchorX: "center",
          anchorY: "middle",
          fontWeight: "bold",
          outlineWidth: 0.2, // thicker stroke so the letters read bold
          outlineColor: "#0a2a12",
          renderOrder: 5,
        };
        return (
          <>
            <Text {...common} position={[offX, 0.05, LABEL_Z]}>OFF-SIDE</Text>
            <Text {...common} position={[legX, 0.05, LABEL_Z]}>LEG-SIDE</Text>
          </>
        );
      })()}
      {shots.map((s, i) => (
        <group key={i}>
          {/* The trajectory beam — OPAQUE + writes depth, so it OCCLUDES the ground logo / pitch
              lines (which are transparent decals that were painting over it) while depth testing
              still lets the ROOF/STANDS hide balls behind them. polygonOffset avoids z-fighting. */}
          <mesh ref={(el) => (meshRefs.current[i] = el)} visible={false} frustumCulled={false}>
            <meshBasicMaterial
              ref={(m) => (matRefs.current[i] = m)}
              color={s.color}
              polygonOffset
              polygonOffsetFactor={-8}
              polygonOffsetUnits={-8}
            />
          </mesh>
          {/* Landing dot (pops on land). */}
          <mesh
            ref={(el) => (dotRefs.current[i] = el)}
            position={[s.land.x, 0.3, s.land.z]}
            visible={false}
          >
            <sphereGeometry args={[0.55, 20, 20]} />
            <meshBasicMaterial
              color={s.color}
              polygonOffset
              polygonOffsetFactor={-8}
              polygonOffsetUnits={-8}
            />
          </mesh>
          {/* Landing ring (spreads out on land). */}
          <mesh
            ref={(el) => (ringRefs.current[i] = el)}
            position={[s.land.x, 0.3, s.land.z]}
            rotation={[-Math.PI / 2, 0, 0]}
            visible={false}
          >
            <ringGeometry args={[0.7, 0.95, 40]} />
            <meshBasicMaterial
              color={s.color}
              transparent
              opacity={0.8}
              depthWrite={false}
              side={THREE.DoubleSide}
              polygonOffset
              polygonOffsetFactor={-8}
              polygonOffsetUnits={-8}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}
