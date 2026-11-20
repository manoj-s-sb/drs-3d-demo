import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useSelector, useDispatch } from "react-redux";
import {
  setTrajectoryDetails,
  setTrajectoryError,
  setCurrentShotFourRuns,
  setCurrentShotSixRuns,
  setTrajectoryComplete,
  addAccumulatedTrajectory,
} from "../store/slices/sessionSlice";
import { sixFlight, resetSixFlight } from "./drs/sixFlight";

// Fire comet — a CONTINUOUS camera-facing ribbon that trails the ball and tapers to nothing,
// fading white-hot → yellow → orange → red → out. Drawn with ADDITIVE blending (so it glows and
// the tail fades as its vertex colour goes to black). No texture/asset needed.
const FIRE_TRAIL = 22; // trail sample count (shorter → a neat moderate comet, not a long blaze)
// Warm gradient the flame fades through from the hot tip to the cooler tail.
const FIRE_COLORS = [
  new THREE.Color(0xffffff),
  new THREE.Color(0xffe08a),
  new THREE.Color(0xff8a1e),
  new THREE.Color(0xff2a00),
];
function fireColorAt(a, out) {
  // a in [0,1] → blend across FIRE_COLORS (0 = hot white tip, 1 = red tail).
  const seg = a * (FIRE_COLORS.length - 1);
  const i = Math.min(FIRE_COLORS.length - 2, Math.floor(seg));
  return out.copy(FIRE_COLORS[i]).lerp(FIRE_COLORS[i + 1], seg - i);
}
const _fireCol = new THREE.Color();
const _tan = new THREE.Vector3();
const _view = new THREE.Vector3();
const _perp = new THREE.Vector3();

/* ---------------- Cinematic Timing ---------------- */
const CAPTURE_FPS = 600; // Trajectory data captured at 600fps
const PLAYBACK_SPEED = 1; // Play back at 10x speed for 60fps display
const SIX_SPEEDUP = 2.2; // 6 Highlights plays this much faster than normal (bigger = faster)
const EPS = 1e-6;

/* Camera freeze/transition trigger — at this normalized time (95%) we start the final move */
const CAMERA_FREEZE_PERCENT = 0.95;

/* ---------------- Camera Tuning ---------------- */
/* Follow cams (RED lerp is unused; camera frozen in red) */
const CAMERA_LERP_GREEN = 0.1; // smooth tracking during green

/* Broadcast side-angle during GREEN (right-hand batsman OFF-side view) */
const GREEN_SIDE_OFFSET = 8; // meters towards OFF-side
const GREEN_FOLLOW_DISTANCE = 24; // behind ball during green
const GREEN_HEIGHT = 8; // higher like TV cam

/* Final strong broadcast angle (FOLLOW direction) */
const FINAL_CAM_HEIGHT = 40; // how high above the final area
const FINAL_CAM_BACK = 24; // pull back along the ball's forward direction
const FINAL_CAM_SIDE = 4; // small off-side offset for asymmetry
const FINAL_EASE = (t) => t * t * (3 - 2 * t); // smoothstep

/* --------- Fixed RED camera (user-provided) --------- */
const RED_CAM_POS = new THREE.Vector3(
  -4.655427110429939,
  12.974616617965138,
  45.6017459918846,
);
const RED_CAM_LOOK = new THREE.Vector3(
  -4.557705348565277,
  12.702267300630647,
  44.64452276472935,
);

const RED_CAM_FOV = 8;
const GREEN_CAM_FOV = 45;

const UP = new THREE.Vector3(0, 1, 0);
function getPlanarDir(v) {
  const d = new THREE.Vector3(v.x, 0, v.z);
  if (d.lengthSq() < 1e-8) return new THREE.Vector3(0, 0, 1);
  return d.normalize();
}

// Check for debug mode via URL parameter (?debug=true)
const isDebugMode = () => {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("debug") === "true";
};

export default function BattingTrajectory({
  // visuals
  color = 0xff0000,
  opacity = 0.8,
  scale = 0.01,
  showTrajectory = true,
  time = 5,
  // followDistance = 10, // kept for API compat (unused in green follow)
  // followHeight = 5, // kept for API compat (unused in green follow)
  // NEW: global tube radius control
  tubeRadius = 0.0355,
}) {
  const debugMode = isDebugMode();
  // 6 Highlights: when the trajectory is a highlight file, the broadcast
  // SixHighlightCamera owns the camera — this renderer only animates the ball +
  // tubes and PUBLISHES the flight to sixFlight (it stops driving the camera).
  const sixShotRef = useRef(null);
  const { trajectoryUrl, animationType } = useSelector(
    (state) => state.session,
  );
  const sixPaused = useSelector((state) => state.session.sixPaused);
  // 6 Highlights flag (set at play time) — works in sample AND machine mode, unlike the
  // old "/highlights/" URL check.
  const highlightMode = useSelector((state) => state.session.sixHighlight);
  const { cameras } = useSelector((state) => state.camera);
  // Stand the six broadcast camera down whenever this isn't a highlight shot.
  useEffect(() => {
    if (!highlightMode) {
      resetSixFlight();
      sixShotRef.current = null;
    }
  }, [highlightMode]);
  // Also reset on UNMOUNT — switching to DRS flips sessionType to BOWLING_SESSION, which
  // unmounts this component; without this the six labels/camera (driven by sixFlight,
  // mounted elsewhere) would linger over the next show.
  useEffect(() => () => resetSixFlight(), []);
  const [ballData, setBallData] = useState(null);

  const dispatch = useDispatch();

  // Use ref for pendingRuns so useFrame can access current value (useState causes stale closure)
  const pendingRunsRef = useRef(null);

  const ballRef = useRef();
  const redMeshRef = useRef();
  const greenMeshRef = useRef();
  // Fire comet (6 Highlights): a ribbon mesh + a short history of ball positions.
  const ribbonRef = useRef();
  const trailRef = useRef([]); // recent ball world positions, newest first
  const fireShotRef = useRef(null); // which shot the current trail belongs to (reset on change)
  // Pre-allocated ribbon geometries: an inner hot CORE flame + a wider soft GLOW behind it
  // (both additive → they bloom together like real fire). 2 verts per trail sample.
  const ribbonGlowRef = useRef();
  const makeRibbon = () => {
    const M = FIRE_TRAIL;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(2 * M * 3), 3));
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(2 * M * 3), 3));
    const idx = [];
    for (let i = 0; i < M - 1; i++) {
      const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
      idx.push(a, b, c, b, d, c);
    }
    g.setIndex(idx);
    g.setDrawRange(0, 0);
    return g;
  };
  const fireGeom = useMemo(makeRibbon, []);
  const fireGlowGeom = useMemo(makeRibbon, []);
  useEffect(() => () => { fireGeom.dispose(); fireGlowGeom.dispose(); }, [fireGeom, fireGlowGeom]);

  const { camera, clock } = useThree();
  const baseTimeRef = useRef(0);
  const pausedElapsedRef = useRef(null); // 6 Highlights: frozen elapsed while paused

  const lastBallPosRef = useRef(new THREE.Vector3());
  const lastDirRef = useRef(new THREE.Vector3(1, 0, 0));

  const endPhaseStartedRef = useRef(false);
  const endFrozenRef = useRef(false);
  const endStartCamPosRef = useRef(new THREE.Vector3());
  const endFinalCamPosRef = useRef(new THREE.Vector3());
  const endLookAtRef = useRef(new THREE.Vector3());

  // New flags to manage camera states
  const redCameraSetRef = useRef(false);
  const fovSnappedToGreenRef = useRef(false);
  const noAfterImpactCameraSetRef = useRef(false);

  // Track trajectory completion
  const trajectoryCompletedRef = useRef(false);

  // Track if runs overlay was already shown for this trajectory
  const runsShownRef = useRef(false);

  // Boundary constants (in world units - positions are already scaled from cm to meters)
  // Trajectory data is in cm, scaled by 0.01 to get meters, so these are in meters
  const BOUNDARY_RADIUS = 55; // 55m radius
  const BOUNDARY_CENTER_Z_OFFSET = 10; // Center shifted 10m towards batsman (positive Z)

  useEffect(() => {
    if (!trajectoryUrl) return;

    // Reset runs tracking for new trajectory
    runsShownRef.current = false;
    pendingRunsRef.current = null;

    fetch(trajectoryUrl)
      .then((res) => res.json())
      .then((data) => {
        if (data?.balls?.length) {
          const b = data.balls[0];
          setBallData(b);
          // Store runs to show when ball crosses boundary (don't dispatch immediately)
          if (b.runs == 4 || b.runs == 6) {
            pendingRunsRef.current = b.runs;
          }
          dispatch(
            setTrajectoryDetails({
              speed: b.afterImpactSpeed,
              angle: b.afterImpactAngle,
              distance: b.distance,
            }),
          );
        } else {
          console.warn("No balls found in trajectory data");
        }
      })
      .catch((err) => {
        console.error("Failed to load trajectory JSON:", err);
        dispatch(setTrajectoryError());
      });
  }, [trajectoryUrl, dispatch]);

  useEffect(() => {
    clock.start();
    baseTimeRef.current = clock.getElapsedTime();

    // Reset cinematic flags on (re)start
    endPhaseStartedRef.current = false;
    endFrozenRef.current = false;
    redCameraSetRef.current = false;
    fovSnappedToGreenRef.current = false;
    trajectoryCompletedRef.current = false;
  }, [trajectoryUrl, animationType, clock]);

  const points = useMemo(() => {
    if (!ballData?.trajectory) return [];
    const impactFrame = ballData.impactFrame ?? 0;
    const isBatsmanMode = ballData.batting ?? true;

    let processed = ballData.trajectory;
    if (isBatsmanMode && ballData.afterImpact?.length && impactFrame > 0) {
      const preImpact = ballData.trajectory.filter((p) => {
        const frameNum = JSON.parse(p)[0];
        return frameNum < impactFrame;
      });
      processed = [...preImpact, ...ballData.afterImpact];
    }
    /*if(ballData.afterImpact?.length==0||!ballData.afterImpact)
    {
       
    } */
    return processed.map((p) => {
      const pts = p.replace("[", "").replace("]", "").split(",");
      return {
        frame: parseInt(pts[0]),
        pos: new THREE.Vector3(
          parseFloat(pts[1]) * scale,
          parseFloat(pts[2]) * scale,
          parseFloat(pts[3]) * scale,
        ),
      };
    });
  }, [ballData, scale]);

  const positions = useMemo(() => points.map((p) => p.pos), [points]);

  const impactIndex = useMemo(() => {
    if (!points.length) return 0;
    const target = ballData?.impactFrame ?? 0;
    if (!target) return points.length;
    const idx = points.findIndex((p) => p.frame >= target);
    return idx === -1 ? positions.length : idx;
  }, [points, positions.length, ballData?.impactFrame]);

  // 6 Highlights skip the bowler→bat delivery (no red tube there, just a wait): the
  // animation STARTS at the bat-hit, so the ball + arc tube begin immediately.
  const startIndex = highlightMode ? impactIndex : 0;

  // Animation duration — only the PLAYED frames (post-impact for a highlight).
  // 6 Highlights plays a bit FASTER (SIX_SPEEDUP) for a snappier replay; normal bowling
  // keeps PLAYBACK_SPEED. Bigger SIX_SPEEDUP = faster six.
  const animationDuration = useMemo(() => {
    if (!points.length) return time; // fallback to prop
    const played = Math.max(1, points.length - 1 - startIndex);
    const speed = PLAYBACK_SPEED * (highlightMode ? SIX_SPEEDUP : 1);
    return played / CAPTURE_FPS / speed;
  }, [points.length, time, startIndex, highlightMode]);

  // Tube builder (uses global tubeRadius prop)
  const buildTubeGeometry = (pts, radius) => {
    if (!pts || pts.length < 2) return null;
    const curve = new THREE.CatmullRomCurve3(pts);
    const segments = Math.max(16, Math.min(240, Math.floor(pts.length * 12)));
    return new THREE.TubeGeometry(curve, segments, radius, 12, false);
  };

  const setMeshPts = (meshRef, pts, radius) => {
    const mesh = meshRef?.current;
    if (!mesh) return;
    if (!pts || pts.length < 2) {
      mesh.visible = false;
      if (mesh.geometry) {
        mesh.geometry.dispose();
        mesh.geometry = undefined;
      }
      return;
    }
    const geom = buildTubeGeometry(pts, radius);
    mesh.visible = true;
    if (mesh.geometry) mesh.geometry.dispose();
    mesh.geometry = geom;
  };

  useFrame(() => {
    if (animationType !== "TrajectoryView") return;
    if (!positions.length || !ballRef.current) return;

    const tNow = clock.getElapsedTime();
    // 6 Highlights PAUSE (Space): pin the elapsed time so the ball/trajectory freeze in
    // place; on resume the animation continues from exactly here.
    if (sixPaused) {
      if (pausedElapsedRef.current == null) {
        pausedElapsedRef.current = tNow - baseTimeRef.current;
      }
      baseTimeRef.current = tNow - pausedElapsedRef.current;
    } else {
      pausedElapsedRef.current = null;
    }
    const elapsed = Math.max(0, tNow - baseTimeRef.current);
    const tNorm = Math.min(elapsed / animationDuration, 1);

    const hasGreenPath = impactIndex < positions.length - 1 && impactIndex > 0;

    // Calculate current frame index based on elapsed time. Highlights begin at the
    // bat-hit (startIndex = impactIndex) so there's no pre-impact wait before the tube.
    const totalFrames = positions.length - 1;
    const playFrames = totalFrames - startIndex;
    const currentFrameIndex = startIndex + tNorm * playFrames;
    const currentIndex = Math.floor(currentFrameIndex);
    const nextIndex = Math.min(currentIndex + 1, totalFrames);
    const frameFrac = currentFrameIndex - currentIndex;

    // Interpolate position between current and next frame
    let currentPos = new THREE.Vector3().lerpVectors(
      positions[currentIndex],
      positions[nextIndex],
      frameFrac,
    );

    // ── 6 Highlights: publish the flight for the broadcast camera ──────────────
    const isHighlight = highlightMode;
    // A six carries 80–100m, so the camera frames the whole arc from ~100m back — a
    // ball-sized tube would be an invisible thread. Scale the tube to the CARRY so it
    // always reads on the big screen (≈0.5% of carry, clamped to a sensible range).
    let tubeR = tubeRadius;
    if (isHighlight) {
      const last = positions.length - 1;
      const s = positions[Math.min(impactIndex, last)];
      const e = positions[last];
      const carry = s && e ? Math.hypot(e.x - s.x, e.z - s.z) : 0;
      tubeR = Math.min(0.7, Math.max(0.35, carry * 0.005));
    }
    if (isHighlight) {
      // Compute the shot geometry ONCE per shot (start/land/H/T).
      if (sixShotRef.current !== trajectoryUrl) {
        sixShotRef.current = trajectoryUrl;
        const last = positions.length - 1;
        sixFlight.start.copy(positions[Math.min(impactIndex, last)]);
        sixFlight.land.copy(positions[last]);
        let maxY = -Infinity;
        let apexIdx = impactIndex;
        for (let i = impactIndex; i <= last; i++)
          if (positions[i].y > maxY) {
            maxY = positions[i].y;
            apexIdx = i;
          }
        sixFlight.H = maxY;
        sixFlight.apex.copy(positions[apexIdx]);
        // Publish the post-impact arc points (impact→land) so SixLabels can build the
        // shaded fill under the arc + the black arc outline.
        sixFlight.arc = positions
          .slice(Math.min(impactIndex, last), last + 1)
          .map((p) => p.clone());
        // Timeline runs over the PLAYED frames [startIndex..last]. Hang time + apex are
        // measured from the bat-hit along that played span.
        const played = Math.max(1, totalFrames - startIndex);
        sixFlight.T = animationDuration * ((last - impactIndex) / played);
        sixFlight.tApex = animationDuration * ((apexIdx - impactIndex) / played);
        // Flat shot direction (x,z).
        sixFlight.dir
          .set(
            sixFlight.land.x - sixFlight.start.x,
            0,
            sixFlight.land.z - sixFlight.start.z,
          )
          .normalize();
        sixFlight.shotId = trajectoryUrl;
        sixFlight.landed = false;
      }
      sixFlight.live.copy(currentPos);
      // seconds since bat contact. Highlights start AT impact (startIndex=impactIndex),
      // so impact is at elapsed 0; otherwise it's the pre-impact fraction of the play.
      const impactElapsed =
        animationDuration *
        ((impactIndex - startIndex) / Math.max(1, totalFrames - startIndex));
      sixFlight.t = elapsed - impactElapsed;
      sixFlight.landed = tNorm >= 0.999;
      sixFlight.active = true;
    }

    // Check if ball crossed boundary and show runs overlay
    // Boundary is a circle with 55m radius, center shifted 10m towards batsman (positive Z)
    if (pendingRunsRef.current && !runsShownRef.current) {
      const dx = currentPos.x;
      const dz = currentPos.z - BOUNDARY_CENTER_Z_OFFSET;
      const distanceFromCenter = Math.sqrt(dx * dx + dz * dz);

      if (distanceFromCenter >= BOUNDARY_RADIUS) {
        runsShownRef.current = true;
        if (pendingRunsRef.current === 4) {
          dispatch(setCurrentShotFourRuns());
        } else if (pendingRunsRef.current === 6) {
          dispatch(setCurrentShotSixRuns());
        }
      }
    }

    // Determine phase based on current frame index
    const isRedPhase = currentIndex < impactIndex;
    const isGreenPhase = !isRedPhase && hasGreenPath;

    // ---- Phase handling & tube rendering ----
    if (isRedPhase) {
      // RED Phase
      // Set and FREEZE camera to user-provided red view ONCE (skip in debug mode)
      if (!debugMode && !isHighlight && !redCameraSetRef.current) {
        camera.position.copy(RED_CAM_POS);
        camera.fov = RED_CAM_FOV;
        camera.updateProjectionMatrix();
        camera.lookAt(RED_CAM_LOOK);
        redCameraSetRef.current = true;
      }
      // No further camera updates during RED (frozen).

      if (showTrajectory) {
        // 6 Highlights: show ONLY the batsman-hit (post-impact) tube — no red
        // bowler→bat delivery tube. So before the hit, draw nothing.
        if (isHighlight) {
          if (redMeshRef.current) redMeshRef.current.visible = false;
          if (greenMeshRef.current) greenMeshRef.current.visible = false;
        } else {
          const redPts = positions.slice(0, Math.max(1, currentIndex + 1));
          redPts.push(currentPos.clone()); // leading end stays at the ball (front)
          setMeshPts(redMeshRef, redPts, tubeR);
          if (greenMeshRef.current) greenMeshRef.current.visible = false;
        }
      }
    } else if (isGreenPhase) {
      // GREEN Phase
      // On the very first frame of GREEN: snap FOV to 45 instantly (skip in debug mode)
      if (!debugMode && !isHighlight && !fovSnappedToGreenRef.current) {
        camera.fov = GREEN_CAM_FOV; // SNAP
        camera.updateProjectionMatrix();
        fovSnappedToGreenRef.current = true;
      }

      if (showTrajectory) {
        // Grow the trail to the ball's EXACT position (currentPos), so the fire's leading end
        // stays AT the ball (front of the arc) instead of lagging a frame behind in the middle.
        const greenPts = positions.slice(impactIndex, currentIndex + 1);
        greenPts.push(currentPos.clone());
        setMeshPts(greenMeshRef, greenPts, tubeR);
        // Six: keep the red (pre-impact) tube hidden — only the batsman-hit arc shows.
        if (redMeshRef.current) redMeshRef.current.visible = !isHighlight;
      }
    } else {
      // No green path - stay in red phase till end
      if (showTrajectory) {
        if (isHighlight) {
          if (redMeshRef.current) redMeshRef.current.visible = false;
        } else {
          const redPts = positions.slice(0, currentIndex + 1);
          redPts.push(currentPos.clone()); // leading end stays at the ball (front)
          setMeshPts(redMeshRef, redPts, tubeR);
          if (greenMeshRef.current) greenMeshRef.current.visible = false;
        }
      }
    }

    // Move the ball — a small bright white-hot CORE at the leading tip.
    ballRef.current.position.copy(currentPos);
    const coreR = isHighlight ? Math.max(tubeR * 1.2, 0.5) : tubeRadius;
    ballRef.current.scale.setScalar(coreR);

    // ── Fire comet (6 Highlights): a continuous tapering flame ribbon trailing the ball ──
    if (isHighlight && ribbonRef.current) {
      // Reset the trail when a new shot begins.
      if (fireShotRef.current !== trajectoryUrl) {
        fireShotRef.current = trajectoryUrl;
        trailRef.current = [];
      }
      // Record the ball's position each frame (newest first).
      trailRef.current.unshift(currentPos.clone());
      if (trailRef.current.length > FIRE_TRAIL) trailRef.current.length = FIRE_TRAIL;

      const trail = trailRef.current;
      const M = trail.length;
      const cPos = fireGeom.attributes.position.array;
      const cCol = fireGeom.attributes.color.array;
      const gPos = fireGlowGeom.attributes.position.array;
      const gCol = fireGlowGeom.attributes.color.array;
      const tipW = Math.max(tubeR * 1.7, 0.8); // CORE flame half-width (moderate, not a big blaze)
      for (let i = 0; i < M; i++) {
        const p = trail[i];
        const a = trail[Math.max(0, i - 1)];
        const b = trail[Math.min(M - 1, i + 1)];
        _tan.subVectors(b, a);
        if (_tan.lengthSq() < 1e-8) _tan.copy(lastDirRef.current);
        _tan.normalize();
        _view.subVectors(camera.position, p).normalize();
        _perp.crossVectors(_tan, _view); // ribbon lies across the camera view → always faces it
        if (_perp.lengthSq() < 1e-8) _perp.set(1, 0, 0);
        _perp.normalize();
        const t = i / (FIRE_TRAIL - 1); // 0 = hot tip (ball), 1 = cool tail
        // Gentle flicker (subtle, professional — not a roaring fire).
        const flick = 0.9 + 0.08 * Math.sin(tNow * 20 + i * 0.8) + 0.03 * Math.sin(tNow * 37 + i * 1.9);
        // Taper so it's a tidy comet that eases to a point.
        const bodyT = Math.pow(1 - t, 0.8);
        const o = i * 6;

        // CORE (bright, hot gradient).
        const w = tipW * bodyT * flick;
        cPos[o] = p.x + _perp.x * w; cPos[o + 1] = p.y + _perp.y * w; cPos[o + 2] = p.z + _perp.z * w;
        cPos[o + 3] = p.x - _perp.x * w; cPos[o + 4] = p.y - _perp.y * w; cPos[o + 5] = p.z - _perp.z * w;
        fireColorAt(t, _fireCol);
        const f = Math.pow(1 - t, 0.8) * (0.7 + 0.3 * flick); // stays hot longer, dims at the tail
        let r = _fireCol.r * f, gg = _fireCol.g * f, bl = _fireCol.b * f;
        cCol[o] = r; cCol[o + 1] = gg; cCol[o + 2] = bl;
        cCol[o + 3] = r; cCol[o + 4] = gg; cCol[o + 5] = bl;

        // GLOW (slightly wider, soft warm halo behind the core — subtle).
        const wg = w * 1.7;
        gPos[o] = p.x + _perp.x * wg; gPos[o + 1] = p.y + _perp.y * wg; gPos[o + 2] = p.z + _perp.z * wg;
        gPos[o + 3] = p.x - _perp.x * wg; gPos[o + 4] = p.y - _perp.y * wg; gPos[o + 5] = p.z - _perp.z * wg;
        const fg = bodyT * 0.18; // faint bloom, not a solid band
        r = _fireCol.r * fg; gg = _fireCol.g * fg * 0.8; bl = _fireCol.b * fg * 0.5; // warmer (less blue)
        gCol[o] = r; gCol[o + 1] = gg; gCol[o + 2] = bl;
        gCol[o + 3] = r; gCol[o + 4] = gg; gCol[o + 5] = bl;
      }
      const range = Math.max(0, (M - 1) * 6);
      fireGeom.setDrawRange(0, range);
      fireGeom.attributes.position.needsUpdate = true;
      fireGeom.attributes.color.needsUpdate = true;
      fireGlowGeom.setDrawRange(0, range);
      fireGlowGeom.attributes.position.needsUpdate = true;
      fireGlowGeom.attributes.color.needsUpdate = true;
      ribbonRef.current.visible = M >= 2;
      if (ribbonGlowRef.current) ribbonGlowRef.current.visible = M >= 2;
    } else {
      if (ribbonRef.current) ribbonRef.current.visible = false;
      if (ribbonGlowRef.current) ribbonGlowRef.current.visible = false;
    }

    // ----- Final cinematic move (near end of timeline) -----
    if (tNorm >= CAMERA_FREEZE_PERCENT) {
      const hasAfterImpact = ballData?.afterImpact?.length > 0;

      // Skip camera manipulation in debug mode OR when the six broadcast camera owns it
      if (!debugMode && !isHighlight) {
        // Check if no afterImpact and we have the camera config
        if (
          !hasAfterImpact &&
          cameras?.no_afterImpact_camera &&
          !noAfterImpactCameraSetRef.current
        ) {
          // Use no_afterImpact_camera for balls with no afterImpact
          const noImpactCam = cameras.no_afterImpact_camera;
          camera.position.set(
            noImpactCam.position.x,
            noImpactCam.position.y,
            noImpactCam.position.z,
          );
          const lookAt = new THREE.Vector3(
            noImpactCam.lookAt.x,
            noImpactCam.lookAt.y,
            noImpactCam.lookAt.z,
          );
          camera.lookAt(lookAt);
          camera.fov = noImpactCam.fov || RED_CAM_FOV;
          camera.updateProjectionMatrix();
          noAfterImpactCameraSetRef.current = true;
        } else if (hasAfterImpact) {
          // Original final cinematic move for balls with afterImpact
          const endSpan = Math.max(EPS, 1 - CAMERA_FREEZE_PERCENT);
          const raw = THREE.MathUtils.clamp(
            (tNorm - CAMERA_FREEZE_PERCENT) / endSpan,
            0,
            1,
          );
          const u = FINAL_EASE(raw);

          if (!endPhaseStartedRef.current) {
            endPhaseStartedRef.current = true;

            endStartCamPosRef.current.copy(camera.position);

            let forward = new THREE.Vector3().subVectors(
              currentPos,
              lastBallPosRef.current,
            );
            if (forward.lengthSq() < 1e-8) forward.copy(lastDirRef.current);
            forward = getPlanarDir(forward);
            const right = new THREE.Vector3()
              .crossVectors(UP, forward)
              .normalize();

            const finalPos = new THREE.Vector3()
              .copy(currentPos)
              .addScaledVector(UP, FINAL_CAM_HEIGHT)
              .addScaledVector(forward, -FINAL_CAM_BACK)
              .addScaledVector(right, FINAL_CAM_SIDE);

            endFinalCamPosRef.current.copy(finalPos);
            endLookAtRef.current.copy(currentPos);
          }

          if (!endFrozenRef.current) {
            const camPos = new THREE.Vector3().lerpVectors(
              endStartCamPosRef.current,
              endFinalCamPosRef.current,
              u,
            );
            camera.position.copy(camPos);
            camera.lookAt(endLookAtRef.current);

            if (raw >= 1 - EPS) {
              endFrozenRef.current = true;
            }
          }
        }
      }

      // Check if trajectory animation is complete
      if (tNorm >= 1 && !trajectoryCompletedRef.current) {
        trajectoryCompletedRef.current = true;

        // Save completed trajectory for persistent display
        if (positions.length >= 2) {
          const serializedPositions = positions.map((p) => ({
            x: p.x,
            y: p.y,
            z: p.z,
          }));
          dispatch(
            addAccumulatedTrajectory({
              positions: serializedPositions,
              impactIndex: impactIndex,
            })
          );
        }

        // Mark trajectory as complete - this will trigger pending video activation if needed
        dispatch(setTrajectoryComplete());
      }

      lastBallPosRef.current.copy(currentPos);
      return;
    }
    // ----- Live follow logic -----
    // We ONLY move/aim the camera during GREEN (not during RED).
    // Keep direction vector updated for smooth follow
    // ✅ Only update camera/dir in GREEN mode (skip in debug mode)
    if (!debugMode && isGreenPhase && !endPhaseStartedRef.current) {
      const moveVec = new THREE.Vector3().subVectors(
        currentPos,
        lastBallPosRef.current,
      );
      if (moveVec.lengthSq() > 1e-8) {
        moveVec.normalize();
        lastDirRef.current.copy(moveVec);
      }

      const forward = getPlanarDir(lastDirRef.current);
      const right = new THREE.Vector3().crossVectors(UP, forward).normalize();

      const desired = new THREE.Vector3()
        .copy(currentPos)
        .addScaledVector(forward, -GREEN_FOLLOW_DISTANCE)
        .addScaledVector(right, +GREEN_SIDE_OFFSET)
        .addScaledVector(UP, +GREEN_HEIGHT);

      camera.position.lerp(desired, CAMERA_LERP_GREEN);
      camera.lookAt(currentPos);
    }

    // else: during RED, camera is frozen at provided pose.

    lastBallPosRef.current.copy(currentPos);
  });

  if (positions.length < 2) return null;
  if (animationType !== "TrajectoryView") return null;

  return (
    <group>
      { showTrajectory && (
        <>
          {/* The fire trail renders ON FRONT too (just under the ball) so the whole trail is
              visible with the ball instead of being hidden behind the ground/stadium. */}
          <mesh ref={ redMeshRef } visible={ false } renderOrder={ 998 }>
            <meshStandardMaterial
              color={ 0xff0000 }
              transparent
              opacity={ opacity }
              roughness={ 1 }
              metalness={ 0 }
              side={ THREE.DoubleSide }
              depthTest={ false }
              depthWrite={ false }
              toneMapped={ false }
            />
          </mesh>

          <mesh ref={ greenMeshRef } visible={ false } renderOrder={ 998 }>
            <meshStandardMaterial
              color={ highlightMode ? 0xff0004 : 0x0000ff }
              transparent
              opacity={ highlightMode ? 0.6 : opacity }
              roughness={ 1 }
              metalness={ 0 }
              side={ THREE.DoubleSide }
              depthTest={ false }
              depthWrite={ false }
              toneMapped={ false }
            />
          </mesh>
        </>
      ) }

      {/* Fire comet (6 Highlights only): a continuous tapering flame ribbon trailing the ball,
          rebuilt each frame in useFrame. Additive + on front so it glows like real fire. */}
      { highlightMode && (
        <>
          {/* Soft outer glow (wider, dimmer) — drawn first, behind the core. */}
          <mesh ref={ ribbonGlowRef } geometry={ fireGlowGeom } visible={ false } renderOrder={ 996 } frustumCulled={ false }>
            <meshBasicMaterial
              vertexColors
              transparent
              depthTest={ false }
              depthWrite={ false }
              toneMapped={ false }
              side={ THREE.DoubleSide }
              blending={ THREE.AdditiveBlending }
            />
          </mesh>
          {/* Hot core flame. */}
          <mesh ref={ ribbonRef } geometry={ fireGeom } visible={ false } renderOrder={ 997 } frustumCulled={ false }>
            <meshBasicMaterial
              vertexColors
              transparent
              depthTest={ false }
              depthWrite={ false }
              toneMapped={ false }
              side={ THREE.DoubleSide }
              blending={ THREE.AdditiveBlending }
            />
          </mesh>
        </>
      ) }

      {/* Ball = the white-hot CORE at the leading tip of the fire. */ }
      <mesh ref={ ballRef } scale={ [0.0355, 0.0355, 0.0355] } renderOrder={ 999 }>
        <sphereGeometry args={ [1, 16, 16] } />
        <meshStandardMaterial
          color={ new THREE.Color(highlightMode ? 0xfff4d0 : 0x000000) }
          emissive={ new THREE.Color(highlightMode ? 0xffd060 : color) }
          emissiveIntensity={ highlightMode ? 2.4 : 1.2 }
          depthTest={ false }
          depthWrite={ false }
          toneMapped={ false }
        />
      </mesh>
    </group>
  );
}
