import React, { useEffect, useMemo, useRef, Suspense } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Text, Billboard, ContactShadows } from "@react-three/drei";
import { useSelector, useDispatch } from "react-redux";
import { setPitchMapInteractive, selectPitchMapPoints } from "../../store/slices/sessionSlice";
import { stopAnimation } from "../../store/slices/animationSlice";
// Camera animation config + easing live in their own file (like reviewAnimations.js).
import { PITCH_MAP_CAMERA, easeInOut } from "../../drs/pitchMapAnimations";
import { ballColorHex, ballCategory } from "./ballColors";
import GlbBall from "../GlbBall";
import {
  pitchZones,
  PITCH_ZONE_ANCHOR_X,
  PITCH_MARKER_ANCHOR_X,
  markersFor,
} from "./pitchZones";
import { PITCH_ZONE_SETS } from "../../drs/pitchZoneSets";

// Scratch vector for projecting the zone-chip anchors to screen space each frame.
const _proj = new THREE.Vector3();

// Pitch-map dot diameters (world metres) — separate sizes for the two modes:
//   BALL_DIAMETER_BALL → the "By ball" 3D coloured sphere
//   BALL_DIAMETER_RUNS → the "With runs" billboarded numbered disc
// Real Law size is 0.072 m (7.2 cm) — accurate, but only ~17 px in the Hawk-Eye long
// lens and ~5 px in the top view, so it reads as a dot. Use 2× real (the broadcast
// reference's "2×" option) so the ball is clearly visible on the big screen.
const BALL_DIAMETER_BALL = 0.10; // By-ball 3D sphere (2× real 7.2 cm, for visibility)
const BALL_DIAMETER_RUNS = 0.12; // With-runs / bowling numbered dot
// SEPARATE sizes for the PiP (compact broadcast window) — a little bigger so the dots read
// in the small window. Full screen uses the values above; only the PiP uses these.
const BALL_DIAMETER_BALL_PIP = 0.14; // By-ball 3D sphere (PiP)
const BALL_DIAMETER_RUNS_PIP = 0.17; // numbered dot (PiP)

// Zone bands + labels are now rendered by PitchMapZones (code-generated from the bowler-type
// zone sets). MultiPitchMap only draws the balls/dots and publishes the chip anchors.
const LABEL_FONT = "/fonts/DejaVuSans-Bold.ttf"; // bold DejaVu for the dot run numbers (offline-safe)

const {
  bowlerEnd: BE,
  top: TOPV,
  pip: PIP,
  moveDuration: MOVE_DUR,
  entryDuration: ENTRY_DUR,
} = PITCH_MAP_CAMERA;

const DEG = Math.PI / 180;
// The PiP (broadcast compact window) uses its OWN complete set of camera values
// (PITCH_MAP_CAMERA.pip); every other view uses bowlerEnd/top unchanged. Gated on the
// session `compact` flag (set by BroadcastApp for the small PiP) — NOT on aspect, so the
// full-screen operator preview is never affected.

// Crane-over orbit pose at t (0 = View 1 Hawk-Eye / bowler's end, 1 = View 2 Top).
// Every term — aim point, height, elevation, distance AND field of view — interpolates
// linearly between the two broadcast poses, so the move is a smooth rise + swing + lens
// change (10.5° → 24°). The camera orbits in the Y-Z plane (x stays 0 → never swings
// left/right). Matches the Hawk-Eye reference exactly at t=0 and t=1.
// Crane pose at t (0 = bowler'sfovPip end, 1 = top). `pip` picks the PiP config set (its own fov /
// elevation / distance / aim), else the full-screen set. Both interpolate the same way.
function orbitPose(t, pip = false) {
  const be = pip ? PIP.bowlerEnd : BE;
  const tv = pip ? PIP.top : TOPV;
  const lookZ = be.lookZ + (tv.lookZ - be.lookZ) * t;
  const lookY = be.lookHeight + (tv.lookHeight - be.lookHeight) * t;
  const phi = (be.elevationDeg + (tv.tiltDeg - be.elevationDeg) * t) * DEG;
  const r = be.radius + (tv.radius - be.radius) * t;
  const fov = be.fov + (tv.fov - be.fov) * t;
  const pos = new THREE.Vector3(0, lookY + r * Math.sin(phi), lookZ + r * Math.cos(phi));
  const look = new THREE.Vector3(0, lookY, lookZ);
  // Up stays +Y in BOTH views: the top view uses an 89.6° tilt (not a degenerate
  // straight-down), so +Y still puts the batter's end at the top AND keeps a normal
  // +Y pole so OrbitControls behaves after the move settles.
  const up = new THREE.Vector3(0, 1, 0);
  return { pos, look, up, fov };
}

// ── BROADCAST ¾ view (key 3) — the main-TV camera: off to the side, high, looking at the
// batter's half. A FIXED pose (not on the top↔overview crane arc), so moving to/from it is a
// straight pose-to-pose glide (handoff), not an orbit.
const BROADCAST_VIEW = {
  pos: [11, 14, 36],
  look: [0, 0, 6.6],
  fov: 13,
};
// ── SPIDERCAM view (key 4) — hangs high over the pitch just behind the bowler, looking
// steeply down (~54°), between Hawk-Eye and Top. Also a FIXED pose (pose-to-pose glide).
const SPIDER_VIEW = {
  pos: [0, 26, 25],
  look: [0, 0, 6.6],
  fov: 20,
};
// Fixed (off-the-crane-arc) views → a concrete pose from their constant.
const FIXED_VIEWS = {
  broadcast: BROADCAST_VIEW,
  spider: SPIDER_VIEW,
};
const isFixedView = (v) => v === "broadcast" || v === "spider";
function fixedPose(view) {
  const c = FIXED_VIEWS[view];
  return {
    pos: new THREE.Vector3(...c.pos),
    look: new THREE.Vector3(...c.look),
    up: new THREE.Vector3(0, 1, 0),
    fov: c.fov,
  };
}
// Resolve any pitchMapView string → a concrete pose. Fixed views (broadcast / spider) use
// their own pose; otherwise the crane endpoints (top = t1, overview/null = t0).
function viewPose(view, pip = false) {
  if (isFixedView(view)) return fixedPose(view);
  return orbitPose(view === "top" ? 1 : 0, pip);
}


// Heartbeat 0..1 — a soft bloom on each beat. `double` (wicket) gives two quick
// beats per cycle for a dramatic double-pulse. Smooth gaussian so there's no flash.
function heartbeat(t, period, double) {
  const x = (t % period) / period; // phase 0..1
  const g = (c, w) => Math.exp(-Math.pow((x - c) * w, 2));
  return double ? Math.min(1, g(0.12, 9) + g(0.34, 9)) : g(0.25, 6);
}

// Bounce-out ease (same curve as the broadcast reference): a ball dropping and settling
// with a couple of quick bounces. t 0..1 → height factor 0..1 (1 = fully landed).
function bounceOut(t) {
  const n = 7.5625;
  const d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
}

// Over pitch-map: a 3D cricket ball per delivery at its pitching location, with
// NO trajectory tubes. Balls appear at their spots; the camera starts zoomed in
// on the pitch and slowly zooms out to show all. Color/size encode the outcome.
export default function MultiPitchMap() {
  const active = useSelector((s) => s.session.pitchMapActive);
  const points = useSelector(selectPitchMapPoints); // real balls + operator fake balls
  // Standalone Pitch mode → flat numbered dots (no 3D ball). Bowling stays 3D ball.
  const standalone = useSelector((s) => s.session.pitchMapStandalone);
  // Bowling-tab option: hide the ball number on the combine pitch-map dots.
  const pitchDotStyle = useSelector((s) => s.session.pitchDotStyle);
  const pitchMapView = useSelector((s) => s.session.pitchMapView);
  const pitchMapSession = useSelector((s) => s.session.pitchMapSession);
  const pitchGlow = useSelector((s) => s.session.pitchGlow);
  // PiP (compact broadcast window) → use the separate pip camera config. Set by BroadcastApp.
  const compact = useSelector((s) => s.session.compact);
  // Dot diameters — the PiP uses its own (bigger) sizes so the dots read in the small window.
  const DIA_BALL = compact ? BALL_DIAMETER_BALL_PIP : BALL_DIAMETER_BALL;
  const DIA_RUNS = compact ? BALL_DIAMETER_RUNS_PIP : BALL_DIAMETER_RUNS;
  // Per-ball runs/wickets from the score API (ballLog), keyed by ball number.
  const byBall = useSelector((s) => s.score?.bowling?.byBall);
  const bowlerType = useSelector((s) => s.session.pitchBowlerType);
  const ballCategories = useSelector((s) => s.session.ballCategories);
  const { camera, clock, controls, size } = useThree();
  const dispatch = useDispatch();

  // Resolve each dot's outcome. Operator points (buildPoint, from the full per-ball index)
  // carry their OWN accurate runs/isWicket/outcome — trust those. ONLY broadcast points
  // (URL-only, no `outcome`) fall back to the score API `byBall`. This avoids a multi-over
  // bug: `byBall` is keyed by ball number (1–6) for a SINGLE over, so in a Filters view that
  // spans many overs a wicket in a later over was wrongly matched to an earlier over's same-
  // numbered ball and shown as a non-wicket.
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
  // Outcome event per ball (dot/runs/four/six/wicket) → glow colour + pulse.
  const events = useMemo(
    () => outcomes.map((o) => ballCategory(o.runs, o.isWicket)),
    [outcomes],
  );
  // De-overlap the dots for READABILITY: when two balls pitched at (nearly) the same spot
  // their dots stack and the numbers become unreadable. Nudge any dot that's within one dot
  // diameter of an earlier one just far enough apart (a small outward push), keeping it as
  // close to the true pitch spot as possible. Returns [{x, z}] render positions aligned to
  // `points`. (The true data in `points` is unchanged — only the drawn position shifts.)
  const renderPts = useMemo(() => {
    const sep = DIA_RUNS * 1.05; // min centre-to-centre gap (≈ one dot diameter)
    const out = (points ?? []).map((p) => ({ x: p.x, z: p.z }));
    for (let i = 0; i < out.length; i++) {
      for (let k = 0; k < i; k++) {
        let dx = out[i].x - out[k].x;
        let dz = out[i].z - out[k].z;
        let d = Math.hypot(dx, dz);
        if (d < sep) {
          if (d < 1e-4) {
            // Exactly coincident → deterministic direction from the index so it's stable.
            const a = (i * 2.399963); // golden-angle spread
            dx = Math.cos(a);
            dz = Math.sin(a);
            d = 1;
          }
          const push = (sep - d) + 0.001;
          out[i].x += (dx / d) * push;
          out[i].z += (dz / d) * push;
        }
      }
    }
    return out;
  }, [points, DIA_RUNS]);

  const ballRefs = useRef([]); // ball groups (heartbeat scale pulse)
  const matRefs = useRef([]); // per-ball arrays of the GLB materials (emissive glow)

  // (Pitch-map dots are now flat numbered pills — the 3D white-ball model is no longer
  // used; see the flat-dot render below. Kept useGLTF.preload for compatibility.)


  // ── Camera: ONE camera, two views, crane-over orbit — then hand to OrbitControls.
  // State machine:
  //   anim "handoff" — ease from the current pose to a target view (entry, or
  //                    re-take control after the operator orbited). Straight eased
  //                    blend so there's never a snap.
  //   anim "crane"   — orbit between View 1 (t=0) and View 2 (t=1): the nice arc.
  //   settled        — stop writing the camera; OrbitControls own it (zoom/pan/tilt).
  const modeRef = useRef("anim"); // "anim" | "settled"
  const kindRef = useRef("handoff"); // "handoff" | "crane"
  const animT0Ref = useRef(0);
  const animDurRef = useRef(ENTRY_DUR);
  const tCurRef = useRef(0); // current orbit param (0=View1, 1=View2)
  const craneFromRef = useRef(0);
  const craneToRef = useRef(0);
  const hoFromPos = useRef(new THREE.Vector3());
  const hoFromLook = useRef(new THREE.Vector3());
  const hoFromUp = useRef(new THREE.Vector3());
  const hoFromFov = useRef(BE.fov);
  const toViewRef = useRef("overview"); // handoff TARGET ("top"|"overview"|"broadcast"|"spider")
  const curViewRef = useRef("overview"); // view the camera currently rests on
  const lastViewRef = useRef("overview"); // last pitchMapView value seen (string)
  const entryPendingRef = useRef(true); // capture the hand-off pose on first frame
  const userMovedRef = useRef(false); // operator dragged OrbitControls while settled

  // Reset on each fresh Start (session bump) → entry hand-off into View 1. NOT on
  // `points` — those grow as dots stream in and must not restart the camera.
  useEffect(() => {
    modeRef.current = "anim";
    kindRef.current = "handoff";
    entryPendingRef.current = true;
    tCurRef.current = 0;
    lastViewRef.current = "overview";
    curViewRef.current = "overview";
    userMovedRef.current = false;
  }, [pitchMapSession]);

  // Note a manual OrbitControls interaction while settled, so a later view switch
  // eases from the moved pose (no snap) instead of craning from a stale orbit param.
  // 'start' fires only on real pointer/wheel/touch input (not from damping).
  useEffect(() => {
    if (!controls) return;
    const onStart = () => {
      if (modeRef.current === "settled") userMovedRef.current = true;
    };
    controls.addEventListener("start", onStart);
    return () => controls.removeEventListener("start", onStart);
  }, [controls]);

  const captureFrom = () => {
    hoFromPos.current.copy(camera.position);
    hoFromUp.current.copy(camera.up);
    hoFromFov.current = camera.fov;
    // Capture the camera's ACTUAL aim point (OrbitControls' target) as the start look, so the
    // handoff blends aim → target aim directly. Views 3/4 share the same aim [0,0,6.6], so the
    // aim stays fixed and the camera travels straight across — no dip/swing. (A point "8 m
    // ahead" used to be used, which sat high and made the aim sweep down mid-move.) Fall back
    // to the forward ray only if there's no controls target yet.
    if (controls?.target) {
      hoFromLook.current.copy(controls.target);
    } else {
      const fwd = new THREE.Vector3();
      camera.getWorldDirection(fwd);
      hoFromLook.current.copy(camera.position).add(fwd.multiplyScalar(8));
    }
  };

  const beginTransition = (targetView, now) => {
    // Fixed views (broadcast / spider) aren't on the crane arc, so any move TO or FROM one must
    // be a straight pose-to-pose glide (handoff). Same for an operator-moved camera. Otherwise
    // top↔overview uses the nice orbit crane.
    const involvesFixed =
      isFixedView(targetView) || isFixedView(curViewRef.current);
    if (
      involvesFixed ||
      (modeRef.current === "settled" && userMovedRef.current)
    ) {
      kindRef.current = "handoff";
      captureFrom();
      toViewRef.current = targetView;
    } else {
      kindRef.current = "crane";
      craneFromRef.current = tCurRef.current;
      craneToRef.current = targetView === "top" ? 1 : 0;
    }
    curViewRef.current = targetView;
    animT0Ref.current = now;
    animDurRef.current = MOVE_DUR;
    modeRef.current = "anim";
    userMovedRef.current = false;
    dispatch(setPitchMapInteractive(false));
  };

  const settle = () => {
    modeRef.current = "settled";
    // Point OrbitControls at what the camera is looking at → no lookAt snap on
    // hand-over; +Y up means normal orbit behaviour.
    const look = viewPose(curViewRef.current, compact).look;
    if (controls && controls.target) {
      controls.target.copy(look);
      controls.update();
    }
    userMovedRef.current = false; // ignore the 'change' our own update() just fired
    dispatch(setPitchMapInteractive(true));
  };

  useFrame(() => {
    // Run whenever the pitch map is active — the camera glides to the pitch view FIRST,
    // before any dots exist (standalone reveals dots only after the move settles). Gating
    // on points.length would wrongly hold the camera until the dots arrived.
    if (!active) return;
    const now = clock.getElapsedTime();

    // First frame after activation: capture the hand-off pose and glide DIRECTLY to the
    // current target view in ONE move (no intermediate overview → no double zoom).
    if (entryPendingRef.current) {
      entryPendingRef.current = false;
      dispatch(stopAnimation("groundCamera")); // kill the idle fly-around → no start jump
      captureFrom();
      const v = pitchMapView || "overview";
      kindRef.current = "handoff";
      toViewRef.current = v;
      curViewRef.current = v;
      lastViewRef.current = v; // prevent a second transition to the same view
      animT0Ref.current = now;
      animDurRef.current = ENTRY_DUR;
      modeRef.current = "anim";
    }

    // Operator toggled the view (key 1 top / 2 overview / 3 side) → begin a new transition.
    const targetView = pitchMapView || "overview";
    if (targetView !== lastViewRef.current) {
      lastViewRef.current = targetView;
      beginTransition(targetView, now);
    }

    // Settled → OrbitControls own the camera; don't touch it.
    if (modeRef.current === "settled") return;

    const prog = easeInOut(
      Math.min((now - animT0Ref.current) / animDurRef.current, 1),
    );

    if (kindRef.current === "crane") {
      tCurRef.current =
        craneFromRef.current +
        (craneToRef.current - craneFromRef.current) * prog;
      const pip = compact;
      const pose = orbitPose(tCurRef.current, pip);
      camera.position.copy(pose.pos);
      camera.up.copy(pose.up);
      camera.fov = pose.fov; // PiP uses its own fov from the pip config
      camera.lookAt(pose.look);
    } else {
      // Hand-off: eased blend from the captured pose → the target view pose (any view,
      // including the fixed BROADCAST ¾ pose).
      const to = viewPose(toViewRef.current, compact);
      camera.position.lerpVectors(hoFromPos.current, to.pos, prog);
      camera.up.copy(
        new THREE.Vector3().lerpVectors(hoFromUp.current, to.up, prog).normalize(),
      );
      camera.fov = hoFromFov.current + (to.fov - hoFromFov.current) * prog;
      camera.lookAt(
        new THREE.Vector3().lerpVectors(hoFromLook.current, to.look, prog),
      );
      // Keep the crane param sane for the next top↔overview crane (side leaves it at 0).
      if (prog >= 1) tCurRef.current = toViewRef.current === "top" ? 1 : 0;
    }
    camera.updateProjectionMatrix();

    if (prog >= 1) settle();
  });

  // Per-ball "appear" timestamp: set the first frame a ball exists, so dots that
  // stream in (one over at a time) POP in with a quick scale-up instead of blinking.
  const appearRef = useRef([]);
  // Every ball DROPS in from above and settles with a bounce (like the broadcast
  // reference). The stagger comes for free from each ball's own appear time.
  const DROP_DUR = 0.6; // seconds for a ball to fall + bounce to rest
  const DROP_HEIGHT = 1.4; // metres the ball starts above its resting spot

  // Heartbeat on the BALL itself: every ball scales up/down like a pulse, and —
  // for events the operator enabled — the ball glows its event colour (emissive
  // bloom) on each beat. Wicket double-pulses. Smooth gaussian, no flicker.
  useFrame(() => {
    // Publish each chip's screen anchor (pitch right edge at the band's mid-length,
    // projected to px) so the overlay chips ride their band in ANY view. Standalone only.
    if (standalone) {
      const W = size.width || 1;
      const H = size.height || 1;
      const zones = PITCH_ZONE_SETS[bowlerType]?.zones || [];
      const anchors = [];
      for (const z of zones) {
        // Chip rides the band mid-point by default; `chipZ` lets a zone pin its % to a
        // specific depth (e.g. BOUNCER aligns its % with the label, not the far mid-point).
        const chipZ = z.chipZ ?? (z.from + z.to) / 2;
        _proj.set(PITCH_ZONE_ANCHOR_X, 0, chipZ).project(camera);
        anchors.push({
          x: (_proj.x * 0.5 + 0.5) * W,
          y: (-_proj.y * 0.5 + 0.5) * H,
        });
      }
      pitchZones.anchors = anchors;
      // Left-edge metre markers (STUMPS / 2M / …) — project each at the pitch's left edge.
      // Spinners drop the 10M marker (markersFor) → index-aligned with the overlay's render.
      const dist = [];
      for (const mk of markersFor(bowlerType)) {
        _proj.set(PITCH_MARKER_ANCHOR_X, 0, mk.z).project(camera);
        dist.push({
          x: (_proj.x * 0.5 + 0.5) * W,
          y: (-_proj.y * 0.5 + 0.5) * H,
        });
      }
      pitchZones.distAnchors = dist;
      pitchZones.visible = true;
    } else {
      pitchZones.visible = false;
    }

    const t = clock.getElapsedTime();
    // Resting height depends on the ball mode (3D sphere vs billboarded disc).
    const isBallMode = standalone && pitchDotStyle === "ball";
    const R = (isBallMode ? DIA_BALL : DIA_RUNS) / 2;
    const restingY = R + 0.02;
    for (let i = 0; i < points.length; i++) {
      // Drop-in: the first frame a ball exists, stamp its appear time; then it falls from
      // DROP_HEIGHT above the pitch and settles onto its spot with a bounce.
      if (appearRef.current[i] == null) appearRef.current[i] = t;
      const p = Math.min((t - appearRef.current[i]) / DROP_DUR, 1);
      const dropY = restingY + DROP_HEIGHT * (1 - bounceOut(p));

      const ev = events[i];
      const on = !!pitchGlow?.[ev]; // only checked events pulse
      const double = ev === "wicket";
      const b = heartbeat(t, double ? 0.9 : 1.4, double);
      const grp = ballRefs.current[i];
      if (grp) {
        grp.position.y = dropY;
        grp.scale.setScalar(on ? 1 + 0.3 * b : 1); // heartbeat pulse once landed (30%)
      }
      const mats = matRefs.current[i];
      if (mats) {
        const intensity = on ? 0.15 + 1.3 * b : 0; // single-colour (white) glow
        for (const m of mats) m.emissiveIntensity = intensity;
      }
    }
  });

  // Clear appear timestamps on a fresh Start so the next set pops in cleanly.
  useEffect(() => {
    appearRef.current = [];
  }, [pitchMapSession]);

  if (!active || !points.length) return null;

  return (
    <group>
      {/* Soft contact shadow under every ball (like the broadcast reference). Uses a
          ground-projected shadow pass — NO extra scene light — so it works the same in
          day and night and never changes the pitch lighting. Covers the batter's half. */}
      <ContactShadows
        position={[0, 0.02, 6.6]}
        scale={[7, 16]}
        resolution={1024}
        blur={2.6}
        opacity={0.55}
        far={1.2}
        color="#000000"
        frames={Infinity}
      />

      {/* Zone bands + labels are drawn by PitchMapZones (bowler-type driven). */}

      {/* One mark per delivery. Bowling-analysis AND the standalone "By ball" style both show a
          real 3D leather ball tinted by OUTCOME (grey dot / green 1-3 / blue four / red six /
          yellow wicket) — matching the ticker legend. The standalone "With runs" style instead
          shows a billboarded white disc with the run value. */}
      {points.map((p, idx) => {
        const o = outcomes[idx] || {};
        // Operator category toggle: hide this ball if its outcome category is unchecked
        // (only applies to the STANDALONE pitch map, which carries real outcomes).
        if (standalone && ballCategories[ballCategory(o.runs, o.isWicket)] === false)
          return null;
        let bg;
        let fg;
        let label;
        // BY BALL = real 3D ball coloured by OUTCOME. Used by the standalone pitch map's
        // "By ball" style AND ALWAYS by the Bowling-analysis pitch map (so its dots match
        // the ticker's outcome legend). WITH RUNS = the standalone white run-value disc.
        const ballMode = !standalone || pitchDotStyle === "ball";
        if (ballMode) {
          // SOLID ball coloured by OUTCOME (dot grey / 1-3 green / four blue / six red /
          // wicket yellow). Colour only, no number.
          bg = ballColorHex(o.runs, o.isWicket);
          fg = "transparent";
          label = "";
        } else {
          // WITH RUNS (standalone default) — a plain WHITE dot showing the run value inside
          // (W for wicket). No outcome colour, no overlay furniture.
          bg = "#FFFFFF";
          fg = "#092C49";
          label = o.isWicket ? "W" : String(Number(o.runs) || 0);
        }
        // BY BALL → the real 3D leather-ball GLB, tinted by the outcome colour (keeps the
        // leather TEXTURE, reads in the outcome colour), no number. WITH RUNS → a
        // billboarded disc + run number facing the camera.
        if (ballMode) {
          const R = DIA_BALL / 2;
          // Real 3D leather-ball GLB, recoloured to the outcome colour (keeps the leather
          // texture, shows in the colour, emissive-tinted so it stays visible in night).
          const rp = renderPts[idx] || p;
          return (
            <Suspense key={idx} fallback={null}>
              <GlbBall
                ref={(el) => (ballRefs.current[idx] = el)}
                position={[rp.x, R + 0.02 + DROP_HEIGHT, rp.z]}
                radius={R}
                tint={bg}
              />
            </Suspense>
          );
        }
        // WITH RUNS → BILLBOARDED disc + run number, always FACING the camera so the run is
        // readable from any angle (Hawk-Eye top view AND low broadcast angles).
        const R = DIA_RUNS / 2;
        return (
          <Billboard
            key={idx}
            ref={(el) => (ballRefs.current[idx] = el)}
            position={[p.x, R + 0.02 + DROP_HEIGHT, p.z]}
          >
            {/* thin white rim */}
            <mesh position={[0, 0, -0.002]}>
              <circleGeometry args={[R * 1.08, 40]} />
              <meshBasicMaterial color="#FFFFFF" transparent opacity={0.95} />
            </mesh>
            {/* coloured disc */}
            <mesh position={[0, 0, -0.001]}>
              <circleGeometry args={[R, 40]} />
              <meshBasicMaterial color={bg} />
            </mesh>
            {label && (
              <Text
                position={[0, -R * 0.12, 0]}
                fontSize={R * 1.1}
                color={fg}
                anchorX="center"
                anchorY="middle"
                font={LABEL_FONT}
              >
                {label}
              </Text>
            )}
          </Billboard>
        );
      })}
    </group>
  );
}
