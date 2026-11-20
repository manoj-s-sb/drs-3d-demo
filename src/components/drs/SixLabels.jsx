import { useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { sixFlight } from "./sixFlight";
import { sixDistance } from "./sixDistance";

// ── Six trajectory labels ────────────────────────────────────────────────────
// Four metric labels (Launch angle, Exit speed, Max height, Distance) with 3D guide
// lines + camera-facing pill labels, each triggered at its moment in the flight and
// animated (arc grow, count-up, line draw, pulses). Metrics come from the ball's
// ball_analytics.json → bat_hit; the flight (start/apex/land/dir/t/tApex/T/live/
// landed) comes from sixFlight. Resets on a new shot. See the prompt spec.

const COL = { angle: "#7dff9b", speed: "#ff6b9a", height: "#39d5ff", dist: "#ffc83d" };
const DEG = Math.PI / 180;

// Position each label at its true projected 3D point, only clamping just enough to
// keep the whole pill on screen (small px margin). A tight 80% box was yanking labels
// away from their anchor points (apex / landing / launch) and making them look
// detached from the tube — so keep the margin minimal and let them follow the tube.
const _v = new THREE.Vector3();
function safeCalc(el, camera, size) {
  _v.setFromMatrixPosition(el.matrixWorld).project(camera);
  const x = (_v.x * 0.5 + 0.5) * size.width;
  const y = (-_v.y * 0.5 + 0.5) * size.height;
  const padX = 100; // just keep the whole pill on-screen
  const padY = 44;
  return [
    Math.min(size.width - padX, Math.max(padX, x)),
    Math.min(size.height - padY, Math.max(padY, y)),
  ];
}

const UP = new THREE.Vector3(0, 1, 0);
// Thin white 3D line thickness + arrow size (world metres).
// Launch-angle label 3D offset from the launch point. Offset ALONG the shot direction
// (dir) + UP → always lands INSIDE the rising arc, for ANY shot direction (leg/off side),
// because the arc always rises along dir from the launch. No screen-right term (that goes
// outside the arc on an opposite-side six).
const ANG_UP = 3;
const ANG_FWD = 13; // metres along the shot dir (into the arc). Bigger = further inside /
// visually further "in" toward the apex. This is the ONLY robust way to stay inside the
// arc for BOTH shot directions — a fixed screen-left/right offset goes outside on the
// opposite-side six, so there is no ANG_RIGHT term.
// Point on the rendered six arc at a given HORIZONTAL distance `h` (metres) from the launch
// point `start`, measured along the flat shot direction `dir`. Interpolates between arc
// samples. Used to bound the launch-angle wedge's UPPER edge by the real tube so the fill
// always sits UNDER the trajectory (never above it). Returns null if the arc isn't ready.
const _arcScratch = new THREE.Vector3();
function arcPointAtHoriz(arc, start, dir, h) {
  if (!arc || arc.length < 2) return null;
  let prevH = 0;
  for (let i = 1; i < arc.length; i++) {
    const horiz =
      (arc[i].x - start.x) * dir.x + (arc[i].z - start.z) * dir.z;
    if (horiz >= h) {
      const span = horiz - prevH || 1;
      const t = (h - prevH) / span;
      return _arcScratch.copy(arc[i - 1]).lerp(arc[i], t).clone();
    }
    prevH = horiz;
  }
  return arc[arc.length - 1].clone();
}

const LINE_R = 0.14; // tube radius (thicker so the line reads from the broadcast camera)
const ARROW_R = 0.45; // arrowhead base radius
const ARROW_H = 1.1; // arrowhead length
// Scratch vectors for orienting the line tubes/cones between two world points.
const _ta = new THREE.Vector3();
const _tdir = new THREE.Vector3();
const _tq = new THREE.Quaternion();
const _la = new THREE.Vector3();
const _lb = new THREE.Vector3();
const _ldir = new THREE.Vector3();
// Place a unit cylinder (radius 1, height 1, +Y) spanning a→b at the given radius.
function placeTube(mesh, a, b, radius) {
  if (!mesh) return;
  _tdir.subVectors(b, a);
  const len = _tdir.length() || 1e-4;
  mesh.position.copy(a).addScaledVector(_tdir, 0.5);
  _tdir.normalize();
  mesh.quaternion.setFromUnitVectors(UP, _tdir);
  mesh.scale.set(radius, len, radius);
  mesh.visible = true;
}
// Place a unit cone (tip +Y) with its TIP at `tip`, pointing along `dir` (unit).
function placeCone(mesh, tip, dir) {
  if (!mesh) return;
  _tq.setFromUnitVectors(UP, _ta.copy(dir).normalize());
  mesh.quaternion.copy(_tq);
  // Cone centre sits half a height back from the tip, along −dir.
  mesh.position.copy(tip).addScaledVector(_ta, -ARROW_H / 2);
  mesh.visible = true;
}
// Reused each frame to hold the camera's horizontal screen-right axis, so label
// nudges are "right on screen" regardless of which side the camera views the six from.
const _right = new THREE.Vector3();
const _gp = new THREE.Vector3(); // scratch for the launch-angle wedge ground point
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);

// Dark pill label — big, high-contrast, readable on the big screen. `narrow`
// scales it down on small screens. `offsetY` nudges it up/down (px) so labels that
// share a spot (launch angle ↕ exit speed) don't stack.
// Metric pill (Figma): translucent blue card, white 1.5px border, 12px radius. Title
// 16px, the NUMBER 48px, and the UNIT 32px bottom-aligned next to it. `numRef` gets
// just the number each frame; `unit` is the static suffix (° / km/h / m).
const FONT = '"DejaVu Sans", sans-serif';
// Clamp each font between a px floor and ceiling, scaling with the viewport width in
// between (these labels are drei <Html>, not inside a cqw container → use vw). The vw
// term is set so it hits the MAX at ~1920px wide.
//   title 6–11 · number 26–36 · unit 16–24 (another 2px off each min & max)
const TITLE_FS = "clamp(6px, 0.57vw, 11px)";
const NUM_FS = "clamp(26px, 1.88vw, 36px)";
const UNIT_FS = "clamp(16px, 1.25vw, 24px)";
// PiP (compact big screen) — small fixed sizes: number 18px, title/unit scaled to match.
const TITLE_FS_PIP = "6px";
const NUM_FS_PIP = "18px";
const UNIT_FS_PIP = "12px";
function Pill({ title, numRef, unit, narrow, bare = false, scale = 1, stackTitle = false, compact = false }) {
  const s = (narrow ? 0.8 : 1) * scale;
  // `bare` → no pill background: TITLE on top, NUMBER below (stacked, centred) — the same
  // style for every bare label (Ball Speed / Launch Angle / Max Height / Distance).
  // Non-bare → the blue pill with the title at the left of the number.
  return (
    <div
      style={{
        // NOTE: no translate(-50%,-50%) — the parent <Html center> already centres the
        // element on its anchor; adding it here double-shifts the label up & left (which
        // pushed the launch-angle label outside its fan).
        display: "flex",
        flexDirection: bare ? "column" : "row",
        alignItems: "center",
        gap: bare ? 4 * s : 12 * s,
        padding: `${12 * s}px ${24 * s}px`,
        borderRadius: 12 * s,
        border: bare ? "none" : `${1.5 * s}px solid #FFF`,
        background: bare ? "transparent" : "rgba(8, 102, 178, 0.80)",
        whiteSpace: "nowrap",
        pointerEvents: "none",
        fontFamily: FONT,
        // White text over the bright, lit stadium washes out — give the bare labels a tight
        // dark OUTLINE (plus a soft drop) so the number/title stay readable on any background.
        // (Colour stays white; position unchanged — only the shadow is stronger.)
        textShadow: bare
          ? "0 0 2px rgba(0,0,0,.95), 0 0 5px rgba(0,0,0,.85), 0 2px 8px rgba(0,0,0,.65)"
          : "none",
        boxShadow: bare ? "none" : "0 6px 20px rgba(0,0,0,.45)",
      }}
    >
      <div
        style={{
          color: "#FFF",
          fontSize: compact ? TITLE_FS_PIP : `calc(${TITLE_FS} * ${scale})`,
          fontWeight: 700,
          letterSpacing: `${0.16 * s}px`,
          textTransform: "uppercase",
          lineHeight: 1.1,
          textAlign: bare ? "center" : "left",
        }}
      >
        {stackTitle
          ? title.split(" ").map((w, i) => <div key={i}>{w}</div>)
          : bare
            ? title
            : title.split(" ").map((w, i) => <div key={i}>{w}</div>)}
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4 * s }}>
        <span
          ref={numRef}
          style={{
            color: "#FFF",
            fontSize: compact ? NUM_FS_PIP : `calc(${NUM_FS} * ${scale})`,
            fontWeight: 700,
            letterSpacing: `${0.48 * s}px`,
            lineHeight: 1,
          }}
        >
          —
        </span>
        {unit && (
          <span
            style={{
              color: "#FFF",
              fontSize: compact ? UNIT_FS_PIP : `calc(${UNIT_FS} * ${scale})`,
              fontWeight: 700,
              letterSpacing: `${0.32 * s}px`,
              lineHeight: 1,
              // The degree sign sits at the TOP (superscript); other units stay on the baseline.
              alignSelf: unit === "°" ? "flex-start" : "flex-end",
              paddingTop: unit === "°" ? 2 * s : 0,
              paddingBottom: unit === "°" ? 0 : 2 * s,
            }}
          >
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}


export default function SixLabels() {
  const { camera } = useThree();
  const compact = useSelector((s) => s.session.compact); // PiP → smaller label fonts
  // Height + Distance are ALWAYS shown; Launch angle & Ball speed are operator-optional.
  const showAngle = useSelector((s) => s.session.sixShowAngle);
  const showSpeed = useSelector((s) => s.session.sixShowSpeed);
  const [narrow, setNarrow] = useState(
    typeof window !== "undefined" && window.innerWidth < 640,
  );
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 640);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Gold line from launch → landing (distance reveal).
  // The DISTANCE graphic (broken white line + centred label) is drawn by the 2D overlay
  // SixDistanceOverlay. Here we only project the ground line's endpoints to screen px and
  // publish them to sixDistance each frame.

  // Launch-angle WEDGE — a filled yellow fan rgba(255,208,0,0.60) from the launch
  // point, spanning the ground line → launch direction (grows with the angle reveal).
  const WEDGE_SEGS = 40;
  const WEDGE_H = 14; // metres of HORIZONTAL extent the fan covers (fits the label inside)
  const wedgeRef = useRef();
  const wedge = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      "position",
      // Filled between the ground line and the arc → 2 triangles (a quad) per segment.
      new THREE.BufferAttribute(new Float32Array(WEDGE_SEGS * 6 * 3), 3),
    );
    g.setDrawRange(0, 0);
    const m = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
      depthTest: false,
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.renderOrder = 3;
    mesh.frustumCulled = false;
    return mesh;
  }, []);

  // ── Arc graphics (built once per shot from sixFlight.arc) ──────────────────
  // FILL — a shaded dome rgba(0,0,0,0.20) between the arc and the ground.
  const arcFill = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), m);
    mesh.renderOrder = 2;
    mesh.frustumCulled = false;
    mesh.visible = false;
    return mesh;
  }, []);
  // OUTLINE — a TUBE tracing the trajectory with a RED→YELLOW gradient at 60% opacity
  // (per the Figma: rgba(255,0,4) → rgba(255,247,89)). Vertex colours along the path.
  const arcOutline = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), m);
    mesh.renderOrder = 5;
    mesh.frustumCulled = false;
    mesh.visible = false;
    return mesh;
  }, []);
  // The max-height vertical line is drawn by SixDistanceOverlay as a crisp 2px screen-space
  // line (so it never thins out). Here we just publish apex→ground screen coords.
  const arcBuiltRef = useRef(null); // shotId the arc graphics were built for
  const landedAtRef = useRef(null); // clock time the ball landed (for the label delay)

  // Groups that carry each Html label (moved in useFrame; no re-render).
  const gAngle = useRef();
  const gSpeed = useRef();
  const gHeight = useRef();
  const gDist = useRef(); // distance label (3D-anchored at the ground-line midpoint)
  const ring = useRef(); // gold landing ring

  // Value <div> refs (text set directly each frame → no React churn).
  const vAngle = useRef();
  const vSpeed = useRef();
  const vHeight = useRef();
  const vDist = useRef();

  // 3D distance + height lines (world space → ALWAYS aligned with the arc, no 2D overlay).
  const distTube = useRef(); // ground line launch→land
  const distConeA = useRef(); // arrowhead at launch end
  const distConeB = useRef(); // arrowhead at landing end
  const hTube = useRef(); // vertical line apex→ground
  const hConeT = useRef(); // arrowhead at apex (top)
  const hConeB = useRef(); // arrowhead at ground (bottom)

  // Per-shot metrics from ball_analytics.json.
  const metricsRef = useRef(null); // { elevDeg, kmh, distance, maxH }
  const loadedShotRef = useRef(null);

  // drei <Html> ignores object.visible, so the pills must be MOUNTED conditionally.
  // Drive a coarse show-state, only setState when a flag actually flips (no churn).
  const [show, setShow] = useState({
    angle: false,
    speed: false,
    dist: false,
    height: false,
  });
  const showRef = useRef(show);
  const applyShow = (a, s, d, h) => {
    const cur = showRef.current;
    if (cur.angle !== a || cur.speed !== s || cur.dist !== d || cur.height !== h) {
      const next = { angle: a, speed: s, dist: d, height: h };
      showRef.current = next;
      setShow(next);
    }
  };

  // Hide everything (used on reset / when inactive).
  const hideAll = () => {
    sixDistance.visible = false;
    sixDistance.hVisible = false;
    sixDistance.angVisible = false;
    wedge.geometry.setDrawRange(0, 0);
    arcFill.visible = false;
    arcOutline.visible = false;
    arcBuiltRef.current = null;
    [gAngle, gSpeed, gHeight, gDist].forEach((g) => {
      if (g.current) g.current.visible = false;
    });
    // Hide the 3D distance + height lines/arrows.
    [distTube, distConeA, distConeB, hTube, hConeT, hConeB].forEach((r) => {
      if (r.current) r.current.visible = false;
    });
    if (ring.current) ring.current.visible = false;
  };

  // Build the arc fill + black outline + apex height line ONCE per shot from the arc.
  const buildArcGraphics = (S) => {
    const arc = S.arc;
    if (!arc || arc.length < 2) return;
    // FILL: a shaded dome between the arc and the ground — a triangle strip from each
    // arc point down to its ground projection (y=0).
    const fp = [];
    for (let i = 0; i < arc.length - 1; i++) {
      const a = arc[i];
      const b = arc[i + 1];
      fp.push(a.x, a.y, a.z, a.x, 0, a.z, b.x, b.y, b.z);
      fp.push(b.x, b.y, b.z, a.x, 0, a.z, b.x, 0, b.z);
    }
    arcFill.geometry.dispose();
    arcFill.geometry = new THREE.BufferGeometry();
    arcFill.geometry.setAttribute("position", new THREE.Float32BufferAttribute(fp, 3));
    arcFill.visible = true;

    // OUTLINE: a tube along the trajectory with a RED→YELLOW gradient down its length.
    arcOutline.geometry.dispose();
    const curve = new THREE.CatmullRomCurve3(arc);
    const radial = 10;
    const segs = Math.max(24, Math.min(240, arc.length));
    const tube = new THREE.TubeGeometry(curve, segs, 0.55, radial, false);
    // Paint vertex colours: the tube has (segs+1) rings of (radial+1) verts each, ordered
    // along the path → lerp red (start) → yellow (end) by the ring index.
    const red = new THREE.Color(1, 0, 4 / 255);
    const yellow = new THREE.Color(1, 247 / 255, 89 / 255);
    const vcount = tube.attributes.position.count;
    const ringVerts = radial + 1;
    const colors = new Float32Array(vcount * 3);
    const c = new THREE.Color();
    for (let i = 0; i < vcount; i++) {
      const ring = Math.floor(i / ringVerts);
      const f = segs > 0 ? ring / segs : 0;
      c.copy(red).lerp(yellow, f);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    tube.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    arcOutline.geometry = tube;
    arcOutline.visible = true;
  };

  useFrame((state) => {
    const clockEl = () => state.clock.getElapsedTime();
    const S = sixFlight;
    if (!S.active) {
      if (loadedShotRef.current !== null) {
        hideAll();
        loadedShotRef.current = null;
        metricsRef.current = null;
      }
      applyShow(false, false, false, false); // no highlight → no labels
      return;
    }

    // New shot → fetch analytics + reset.
    if (loadedShotRef.current !== S.shotId) {
      loadedShotRef.current = S.shotId;
      metricsRef.current = null;
      hideAll();
      const url = S.shotId.replace(/trajectory_data\.json.*$/, "ball_analytics.json");
      fetch(url)
        .then((r) => r.json())
        .then((a) => {
          const h = a?.bat_hit || {};
          metricsRef.current = {
            elevDeg: h.hit_angle_deg ?? 0,
            kmh: h.hit_speed_kmph ?? 0,
            distance: (h.distance_travelled_cm ?? 0) / 100,
            maxH: (h.max_height_cm ?? S.H * 100) / 100,
          };
        })
        .catch(() => {
          metricsRef.current = { elevDeg: 0, kmh: 0, distance: S.H, maxH: S.H };
        });
    }
    const m = metricsRef.current;
    if (!m) return;

    // Build the arc fill / black outline / height line once the arc is published for
    // this shot (and rebuild if a new shot's arc arrives).
    if (arcBuiltRef.current !== S.shotId && S.arc && S.arc.length >= 2) {
      arcBuiltRef.current = S.shotId;
      buildArcGraphics(S);
    }

    const t = S.t;
    // Labels appear ONLY after the ball lands AND the camera has zoomed out to the full
    // view (SixHighlightCamera holds on the landing then reveals the whole arc ~2.8s).
    // Before that — during the flight — no labels show; then all four appear together.
    const LABEL_DELAY = 1.3; // s after landing (≈ camera LAND_HOLD + FULL_REVEAL) → labels appear as it zooms out
    if (S.landed) {
      if (landedAtRef.current == null) landedAtRef.current = clockEl();
    } else {
      landedAtRef.current = null;
    }
    const labelsOn =
      landedAtRef.current != null && clockEl() - landedAtRef.current >= LABEL_DELAY;
    // Height + Distance always on with the reveal; angle/speed gated by the operator toggles.
    applyShow(labelsOn && showAngle, labelsOn && showSpeed, labelsOn, labelsOn);

    const start = S.start;
    const dir = S.dir;
    // Camera's horizontal screen-right axis (world space). Label left/right nudges use
    // THIS instead of `dir`, so "right" is always right ON SCREEN — regardless of the
    // six's direction or which side SixHighlightCamera chose to view it from.
    _right.setFromMatrixColumn(camera.matrixWorld, 0);
    _right.y = 0;
    _right.normalize();

    // ── 1) Launch angle (trigger t ≥ 0) — only when the operator enabled the Launch-angle
    // label; otherwise the white wedge + angle number stay hidden. ──────────────────────────
    if (t >= 0 && showAngle) {
      const u = easeOut(t / 0.4);
      // Filled region between the GROUND line and the ACTUAL ARC, from the launch point out
      // to WEDGE_H metres (grows with the reveal). The upper edge IS the real trajectory, so
      // the fan always sits UNDER the tube and never shoots above it (the old straight tangent
      // edge rose above the curving tube). The arc's own horizontal extent caps WEDGE_H so it
      // never runs past the landing.
      let maxH = WEDGE_H;
      if (S.arc && S.arc.length > 1) {
        const lastH =
          (S.land.x - start.x) * dir.x + (S.land.z - start.z) * dir.z;
        if (lastH > 1) maxH = Math.min(WEDGE_H, lastH * 0.9);
      }
      const L = maxH * u; // horizontal extent revealed so far
      const arr = wedge.geometry.attributes.position.array;
      let o = 0;
      // Ground point + arc point at a horizontal distance h (y clamped to ≥ ground).
      const groundAt = (h) =>
        _gp.copy(start).addScaledVector(dir, h); // stays at launch height (the ground ray)
      for (let i = 0; i < WEDGE_SEGS; i++) {
        const h0 = (L * i) / WEDGE_SEGS;
        const h1 = (L * (i + 1)) / WEDGE_SEGS;
        const g0 = groundAt(h0).clone();
        const g1 = groundAt(h1).clone();
        const a0 = arcPointAtHoriz(S.arc, start, dir, h0) || g0;
        const a1 = arcPointAtHoriz(S.arc, start, dir, h1) || g1;
        // Quad [g0, g1, a1, a0] → two triangles.
        arr[o++] = g0.x; arr[o++] = g0.y; arr[o++] = g0.z;
        arr[o++] = g1.x; arr[o++] = g1.y; arr[o++] = g1.z;
        arr[o++] = a1.x; arr[o++] = a1.y; arr[o++] = a1.z;
        arr[o++] = g0.x; arr[o++] = g0.y; arr[o++] = g0.z;
        arr[o++] = a1.x; arr[o++] = a1.y; arr[o++] = a1.z;
        arr[o++] = a0.x; arr[o++] = a0.y; arr[o++] = a0.z;
      }
      wedge.geometry.attributes.position.needsUpdate = true;
      wedge.geometry.setDrawRange(0, WEDGE_SEGS * 6);
      wedge.geometry.computeBoundingSphere();
      // LAUNCH ANGLE — placed by SCREEN-SPACE BARYCENTRIC blend of the fan triangle's
      // three projected corners: apex (launch point), ground corner (dir), top corner
      // (dTop, along the launch angle). The red arc runs along the apex→top edge, so we
      // weight toward the apex + GROUND corner (the open lower edge) and give the top
      // corner little weight → the label lands in the clear lower part of the fan, inside
      // it for ANY ball direction / camera side (barycentric with positive weights that
      // sum to 1 is always inside the triangle).
      // Anchor the label at a fixed 3D point relative to the LAUNCH: a few metres UP and a
      // little ALONG the shot direction (into the rising arc). Pure 3D (projected by
      // safeCalc like the other labels) → it sits at the same spot on every shot/play and
      // never jumps or "snaps back" on Start. Tune ANG_UP / ANG_FWD below.
      if (gAngle.current) {
        gAngle.current.visible = true;
        gAngle.current.position
          .copy(start)
          .addScaledVector(UP, ANG_UP)
          .addScaledVector(dir, ANG_FWD); // along the shot → inside the arc, any direction
      }
      if (vAngle.current)
        vAngle.current.textContent = `${Math.round(m.elevDeg * u)}`;
    } else {
      // Launch angle off (or not started) → hide the white wedge + the angle label.
      wedge.geometry.setDrawRange(0, 0);
      if (gAngle.current) gAngle.current.visible = false;
    }

    // ── 2) Ball speed off the bat ("Ball Speed Off Bat") — above the launch, moved a bit
    // DOWN and NEARER the rising trajectory.
    if (t >= 0) {
      const u = easeOut(t / 0.4);
      if (gSpeed.current) {
        gSpeed.current.visible = true;
        gSpeed.current.position
          .set(start.x, 0, start.z)
          .addScaledVector(dir, 5) // nearer the trajectory (along the shot dir)
          // Big screen: slightly right (+2). PiP: shifted LEFT so it sits off the tube.
          .addScaledVector(_right, compact ? 12 : 2)
          // Big screen: UP 10. PiP: lifted higher so the label clears the (smaller-framed)
          // rising tube instead of colliding with it.
          .addScaledVector(UP, compact ? 18 : 10);
      }
      if (vSpeed.current)
        vSpeed.current.textContent = `${Math.round(m.kmh * u)}`;
    }

    // ── Distance (trigger t ≥ T / landed) ─────────────────────────────────────
    // Solid white line along the GROUND from the launch point to the landing point.
    const groundLaunch = new THREE.Vector3(start.x, 0, start.z);
    const groundBelowLand = new THREE.Vector3(S.land.x, 0, S.land.z);
    if (S.landed || t >= S.T) {
      const u = easeOut(Math.min(1, (t - S.T) / 0.6 + (S.landed ? 1 : 0)));
      const end = groundLaunch.clone().lerp(groundBelowLand, u);
      // 3D ground line (launch → current end) + arrowheads at both ends. Drawn in WORLD
      // space so it's always aligned with the arc (no 2D overlay / projection mismatch).
      _la.copy(groundLaunch).setY(0.05);
      _lb.copy(end).setY(0.05);
      placeTube(distTube.current, _la, _lb, LINE_R);
      // Arrow ONLY at the landing end (the batsman-side/launch arrow is removed).
      _ldir.subVectors(_lb, _la).normalize();
      placeCone(distConeB.current, _lb, _ldir);
      if (distConeA.current) distConeA.current.visible = false;
      // Distance label at the ground-line midpoint.
      if (gDist.current) {
        gDist.current.visible = true;
        gDist.current.position.copy(_la).addScaledVector(_lb.clone().sub(_la), 0.5);
      }
      if (vDist.current) vDist.current.textContent = `${Math.round(m.distance * u)}`;
      // Gold ring at the landing point, pulsing out every 1.5s.
      if (ring.current) {
        ring.current.visible = true;
        ring.current.position.set(S.land.x, 0.05, S.land.z);
        const ph = (((t - S.T) % 1.5) + 1.5) % 1.5;
        const rp = ph / 1.5;
        ring.current.scale.setScalar(1 + rp * 6);
        ring.current.material.opacity = 0.8 * (1 - rp);
      }
    } else {
      if (distTube.current) distTube.current.visible = false;
      if (distConeA.current) distConeA.current.visible = false;
      if (distConeB.current) distConeB.current.visible = false;
      if (gDist.current) gDist.current.visible = false;
    }

    // ── Max height (trigger t ≥ apex) ─────────────────────────────────────────
    if (t >= S.tApex) {
      // Draw the line to the EXACT tracked max height (bat_hit.max_height_cm → m.maxH metres),
      // straight up from the ground at the apex's horizontal position — not the rendered arc
      // peak. So the line length == the reported number.
      const topY = m.maxH;
      // Label sits just above the line top.
      if (gHeight.current) {
        gHeight.current.visible = true;
        gHeight.current.position.set(S.apex.x, topY, S.apex.z).addScaledVector(UP, 4);
      }
      if (vHeight.current) vHeight.current.textContent = `${Math.round(m.maxH)}`;
      // 3D vertical line: ground → exact max height (world space, always aligned).
      _la.set(S.apex.x, topY, S.apex.z);
      _lb.set(S.apex.x, 0, S.apex.z);
      placeTube(hTube.current, _la, _lb, LINE_R);
      placeCone(hConeT.current, _la, UP); // top arrow points up
      if (hConeB.current) hConeB.current.visible = false; // bottom arrow removed
    } else {
      if (hTube.current) hTube.current.visible = false;
      if (hConeT.current) hConeT.current.visible = false;
      if (hConeB.current) hConeB.current.visible = false;
    }
  });

  return (
    <group>
      <primitive object={wedge} ref={wedgeRef} />
      <primitive object={arcFill} />
      {/* The outline tube (arcOutline) is NOT rendered — only the real projected
          trajectory tube (from BattingTrajectory) shows, no duplicate overlay tube. */}

      {/* gold landing ring (flat on the ground) */}
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} visible={false} renderOrder={5}>
        <ringGeometry args={[0.9, 1.1, 48]} />
        <meshBasicMaterial color={COL.dist} transparent opacity={0.8} depthTest={false} />
      </mesh>

      {/* 3D distance line (ground) + arrowheads — world space, always aligned to the arc.
          Unit cylinder (r1,h1,+Y) + unit cones; placed/scaled each frame in useFrame. */}
      <mesh ref={distTube} visible={false} renderOrder={6}>
        <cylinderGeometry args={[1, 1, 1, 12]} />
        <meshBasicMaterial color="#FFF" depthTest={false} toneMapped={false} />
      </mesh>
      <mesh ref={distConeA} visible={false} renderOrder={6}>
        <coneGeometry args={[ARROW_R, ARROW_H, 16]} />
        <meshBasicMaterial color="#FFF" depthTest={false} toneMapped={false} />
      </mesh>
      <mesh ref={distConeB} visible={false} renderOrder={6}>
        <coneGeometry args={[ARROW_R, ARROW_H, 16]} />
        <meshBasicMaterial color="#FFF" depthTest={false} toneMapped={false} />
      </mesh>
      {/* 3D max-height line (vertical) + arrowheads — white. */}
      <mesh ref={hTube} visible={false} renderOrder={6}>
        <cylinderGeometry args={[1, 1, 1, 12]} />
        <meshBasicMaterial color="#FFF" depthTest={false} toneMapped={false} />
      </mesh>
      <mesh ref={hConeT} visible={false} renderOrder={6}>
        <coneGeometry args={[ARROW_R, ARROW_H, 16]} />
        <meshBasicMaterial color="#FFF" depthTest={false} toneMapped={false} />
      </mesh>
      <mesh ref={hConeB} visible={false} renderOrder={6}>
        <coneGeometry args={[ARROW_R, ARROW_H, 16]} />
        <meshBasicMaterial color="#FFF" depthTest={false} toneMapped={false} />
      </mesh>

      <group ref={gAngle}>
        {show.angle && (
          <Html center zIndexRange={[200, 0]} pointerEvents="none" calculatePosition={safeCalc}>
            <Pill title="Launch angle" numRef={vAngle} unit="°" narrow={narrow} bare compact={compact} />
          </Html>
        )}
      </group>
      <group ref={gSpeed}>
        {show.speed && (
          <Html center zIndexRange={[200, 0]} pointerEvents="none" calculatePosition={safeCalc}>
            <Pill title="Ball Speed Off Bat" numRef={vSpeed} unit="KPH" narrow={narrow} bare compact={compact} />
          </Html>
        )}
      </group>
      {/* DISTANCE label — 3D-anchored at the ground-line midpoint (canvas-aligned). */}
      <group ref={gDist}>
        {show.dist && (
          <Html center zIndexRange={[200, 0]} pointerEvents="none" calculatePosition={safeCalc}>
            <Pill title="Distance" numRef={vDist} unit="m" narrow={narrow} bare compact={compact} />
          </Html>
        )}
      </group>
      <group ref={gHeight}>
        {show.height && (
          <Html center zIndexRange={[200, 0]} pointerEvents="none" calculatePosition={safeCalc}>
            <Pill title="Apex Height" numRef={vHeight} unit="m" narrow={narrow} bare compact={compact} />
          </Html>
        )}
      </group>
    </group>
  );
}
