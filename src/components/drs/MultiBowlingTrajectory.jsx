import React, { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useSelector, useDispatch } from "react-redux";
import {
  setMultiTrajectoryComplete,
  setMultiInteractive,
  setMultiManualCam,
  setMultiSeqActive,
} from "../../store/slices/sessionSlice";
import { setMeshPts } from "./trajectoryGeometry";
import { BALL_COLORS } from "./ballColors";
import { MULTI_PLAY } from "./viewConfig";
// Camera angles / timeline / zoom (the animation) live in their own file, like
// reviewAnimations.js and pitchMapAnimations.js.
import { BOWLING_ANALYSIS } from "../../drs/bowlingAnalysisAnimations";
import ballWhiteModel from "../../assets/models/ball_white_2026-10-24.glb";
import { getConfig } from "../../drs/drsConfig";
import { useKTX2GLTF } from "../../useKTX2GLTF";

// No useGLTF.preload — ball_white.glb is KTX2; preload would load it without the
// KTX2Loader and poison the cache. useKTX2GLTF below is the only loader.

// A 3D white-ball GLB sized to `radius`, wrapped in a group whose ref drawBall
// moves/reveals each frame. Replaces the old procedural CricketBall here.
const GlbBall = React.forwardRef(function GlbBall(
  { radius = 0.036, visible = false },
  ref,
) {
  const { scene } = useKTX2GLTF(ballWhiteModel);
  const obj = useMemo(() => {
    const c = scene.clone(true);
    const box = new THREE.Box3().setFromObject(c, true);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const s = (radius * 2) / maxDim;
    c.scale.setScalar(s);
    c.position.set(-center.x * s, -center.y * s, -center.z * s);
    c.traverse((o) => {
      if (o.isMesh && o.material) {
        o.material = o.material.clone();
        o.material.transparent = false;
        o.material.depthWrite = true;
      }
    });
    return c;
  }, [scene, radius]);
  return (
    <group ref={ref} visible={visible}>
      <primitive object={obj} />
    </group>
  );
});

// Visual-only sizes stay in viewConfig.js (MULTI_PLAY.tube).
const {
  radius: TUBE_RADIUS,
  opacity: TUBE_OPACITY,
  pitchMarkerRadius: PITCH_MARKER_RADIUS,
} = MULTI_PLAY.tube;

// Everything below is the camera/timeline animation — unpacked to the names used
// throughout this file so the animation code is unchanged (edit the values in
// bowlingAnalysisAnimations.js).

// Timeline: release -> pitch (PHASE1) | freeze + camera move (PAUSE) | pitch -> stumps (PHASE2)
const {
  phase1Dur: PHASE1_DUR,
  pauseDur: PAUSE_DUR,
  phase2Dur: PHASE2_DUR,
} = BOWLING_ANALYSIS.timeline;

// Intro: play each delivery one-by-one while the camera orbits the pitch.
const { ballDur: SEQ_BALL_DUR, orbitSpeed: SEQ_ORBIT_SPEED } =
  BOWLING_ANALYSIS.seq;

// Auto-fit top-down view (distance derived from the bounding sphere).
const { fov: OVERVIEW_FOV, fitMargin: FIT_MARGIN } = BOWLING_ANALYSIS.overview;

// Bowler's-end view: behind the release point, elevated, looking down-pitch.
const {
  fov: BOWLER_FOV,
  back: BOWLER_BACK,
  height: BOWLER_HEIGHT,
  side: BOWLER_SIDE = 0,
  lookHeight: BOWLER_LOOK_HEIGHT,
} = BOWLING_ANALYSIS.bowler;

// Cinematic (camera View 1): right-side bounce view before the centre stump view.
const {
  rightSide: CINE_RIGHT_SIDE,
  rightHeight: CINE_RIGHT_HEIGHT,
  rightLookHeight: CINE_RIGHT_LOOK_HEIGHT,
  centreDist: CINE_CENTRE_DIST,
  centreHeight: CINE_CENTRE_HEIGHT,
  centreLookHeight: CINE_CENTRE_LOOK_HEIGHT,
  frontDist: CINE_FRONT_DIST,
  frontHeight: CINE_FRONT_HEIGHT,
  frontSide: CINE_FRONT_SIDE,
  frontLookHeight: CINE_FRONT_LOOK_HEIGHT,
} = BOWLING_ANALYSIS.cinematic;

// Pitch view: camera moves straight in to the bounce area, then holds during play.
const {
  back: PITCH_BACK,
  height: PITCH_HEIGHT,
  side: PITCH_SIDE = 0,
  forward: PITCH_FORWARD = 0,
  fov: PITCH_FOV,
  lookHeight: PITCH_LOOK_HEIGHT,
  moveFrac: PITCH_MOVE_FRAC = 1,
} = BOWLING_ANALYSIS.pitch;

// Front-of-trajectory view (in front of the stumps, looking back up the arcs).
const {
  back: FRONT_BACK,
  side: FRONT_SIDE,
  height: FRONT_HEIGHT,
  lookFwd: FRONT_LOOK_FWD,
  lookHeight: FRONT_LOOK_HEIGHT,
} = BOWLING_ANALYSIS.front;

// Sequence view: end-on fill-the-pitch shot for the one-by-one intro.
const {
  back: SEQ_BACK,
  height: SEQ_HEIGHT,
  side: SEQ_SIDE,
  lookFwd: SEQ_LOOK_FWD,
  lookHeight: SEQ_LOOK_HEIGHT,
  fov: SEQ_FOV,
} = BOWLING_ANALYSIS.sequence;

// On resume, settle into the behind-the-stumps review view (matches key 1).
const {
  dist: BEHIND_DIST,
  side: BEHIND_SIDE,
  height: BEHIND_HEIGHT,
  lookAhead: BEHIND_LOOK_AHEAD,
  lookHeight: BEHIND_LOOK_HEIGHT,
} = BOWLING_ANALYSIS.behind;

// Post-play pose (frames the trajectories once the play completes).
const {
  rightShift: POST_RIGHT_SHIFT,
  zoomOut: POST_ZOOM_OUT,
  rise: POST_RISE,
} = BOWLING_ANALYSIS.post;

// Broadcast ¾ camera (the fixed play view) + the "play over" 6-ball timeline.
const {
  fov: BROADCAST_FOV,
  pos: BROADCAST_POS_ARR,
  look: BROADCAST_LOOK_ARR,
  easeIn: BROADCAST_EASE,
} = BOWLING_ANALYSIS.broadcast;
const BROADCAST_POS = new THREE.Vector3(...BROADCAST_POS_ARR);
const BROADCAST_LOOK = new THREE.Vector3(...BROADCAST_LOOK_ARR);
const {
  endFov: BROADCAST_END_FOV,
  endZoomScale: BROADCAST_END_ZOOM,
} = BOWLING_ANALYSIS.broadcast;
// Zoomed-in eye at the end of the push-in (dollied from the wide pos toward the look point).
const BROADCAST_ZOOM_POS = new THREE.Vector3().lerpVectors(
  BROADCAST_LOOK,
  BROADCAST_POS,
  BROADCAST_END_ZOOM,
);
const {
  drawDur: DRAW_DUR,
  ballSlot: BALL_SLOT,
  fadeDur: FADE_DUR,
  allTogetherDur: ALL_TOGETHER_DUR,
  opacityCur: OPACITY_CUR,
  opacityPrev: OPACITY_PREV,
} = BOWLING_ANALYSIS.playOver;
// On completion the trajectories are shown off: tubes brighten and the camera zooms in.
const OPACITY_CUR_DONE = 1; // newest tube, after all 6 are drawn
const OPACITY_PREV_DONE = 0.5; // earlier tubes, after all 6 are drawn (was 0.22)

const clamp01 = (v) => Math.min(Math.max(v, 0), 1);
const easeOutCubic = (t) => 1 - Math.pow(1 - clamp01(t), 3);
// Slow-start/slow-end ease for the broadcast push-in zoom (no fast initial lunge).
const easeInOutCubic = (t) => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
// Hold the WIDE broadcast view this long after Play before the push-in zoom begins (s).
const ZOOM_START_DELAY = 0.8;
// Stretch the push-in zoom to this multiple of the ball-play duration so it moves SLOWLY
// (the extra time plays out gently after the balls finish; the camera keeps gliding in and
// only hands to OrbitControls once it's fully zoomed). >1 = slower. 1 = finish with the balls.
const ZOOM_SLOW = 1.8;

// The broadcast FOV is tuned for 16:9. In a NARROW (portrait) window — the broadcast PiP —
// that vertical FOV shows too little WIDTH, cutting the pitch edges off. Widen it to fit the
// design width when the frame is narrower than 16:9; landscape (the normal view) is unchanged.
const DESIGN_ASPECT = 16 / 9;
const DEG_BA = Math.PI / 180;
function widenFovForAspect(baseFov, aspect) {
  if (!aspect || aspect >= DESIGN_ASPECT) return baseFov;
  const tanV = Math.tan((baseFov * DEG_BA) / 2) * (DESIGN_ASPECT / aspect);
  return Math.min(80, (2 * Math.atan(tanV)) / DEG_BA);
}

// Draw one ball at normalized progress tNorm in [0,1] along its trajectory:
// move the ball mesh and grow the red (pre-impact) / blue (post-impact) tubes.
function drawBall(ball, r, tNorm, trajLen = "full") {
  const positions = ball.positions;
  if (!r || !positions || positions.length < 2) return;
  const lastIdx = positions.length - 1;
  const impactIndex =
    ball.impactIndex == null ? lastIdx : Math.min(ball.impactIndex, lastIdx);
  // "After impact" stops the ball AT the impact point; "full" runs the whole path.
  const total = trajLen === "full" ? lastIdx : impactIndex;
  const fIdx = tNorm * total;
  const i = Math.min(Math.max(Math.floor(fIdx), 0), total);
  const j = Math.min(i + 1, total);
  const frac = Math.min(Math.max(fIdx - i, 0), 1);
  let currentPos;
  if (!positions[i] || !positions[j] || i === j) {
    currentPos = positions[total];
  } else {
    currentPos = new THREE.Vector3().lerpVectors(
      positions[i],
      positions[j],
      frac,
    );
  }
  if (r.ball.current) r.ball.current.position.copy(currentPos);
  const endIndex = Math.min(i + 2, total + 1);
  const redPts = positions.slice(0, Math.min(endIndex, impactIndex + 1));
  // Post-impact (blue) tube only in "full"; "after impact" ends at the impact point.
  const bluePts =
    trajLen === "full"
      ? positions.slice(Math.max(impactIndex, 0), endIndex)
      : [];
  setMeshPts(r.red, redPts, TUBE_RADIUS);
  setMeshPts(r.blue, bluePts, TUBE_RADIUS);

  // Two static balls per delivery: one at IMPACT (where it meets bat/pad/stumps)
  // and one at the END (tip of the path). Each is revealed as the moving ball
  // reaches it; the moving ball hands off to the end ball when the delivery
  // completes, so the settled view shows exactly an impact ball + an end ball.
  const hasImpact = ball.impactIndex != null && ball.impactIndex < total;
  if (r.impactBall.current) {
    const iIdx = hasImpact ? ball.impactIndex : total;
    r.impactBall.current.position.copy(positions[iIdx]);
    r.impactBall.current.visible = hasImpact && tNorm >= iIdx / total;
  }
  const done = tNorm >= 0.999;
  if (r.endBall.current) {
    r.endBall.current.position.copy(positions[total]);
    r.endBall.current.visible = done;
  }
  // Moving ball flies until it lands on the end ball, then hands off (no overlap).
  if (r.ball.current) r.ball.current.visible = !done;
}

// Hide a ball's tubes + moving sphere (used for the inactive balls during the
// one-by-one intro).
function hideBall(r) {
  if (!r) return;
  if (r.ball.current) r.ball.current.visible = false;
  if (r.impactBall.current) r.impactBall.current.visible = false;
  if (r.endBall.current) r.endBall.current.visible = false;
  setMeshPts(r.red, null, TUBE_RADIUS);
  setMeshPts(r.blue, null, TUBE_RADIUS);
}

// Animates every accumulated trajectory at once: thick, semi-transparent tubes
// in a distinct color per delivery (Hawk-Eye style), a moving ball per
// trajectory, the intro -> top-down camera move, and the on-pitch text zones
// (via setTrajectoryOverlay). No details card: this never sets animationType to
// "TrajectoryView". The single-ball view (BowlingTrajectory) is unchanged.
export default function MultiBowlingTrajectory() {
  const accumulated = useSelector((s) => s.session.accumulatedTrajectories);
  // Pitch map and bowling are mutually exclusive — if the pitch map has taken over (e.g. the
  // combined bowling→pitch-map flow), never render a bowling ball/tube, so none can linger
  // into the pitch map (guards a cross-tab sync gap on the broadcast PiP).
  const pitchMapActive = useSelector((s) => s.session.pitchMapActive);
  const playing =
    useSelector((s) => s.session.multiTrajectoryPlay) && !pitchMapActive;
  // false = loaded/armed at the start frame; true = actually animating.
  const started = useSelector((s) => s.session.multiPlayStarted);
  // Frozen mid-flight (Space toggles). Holds the timeline in place; resumes where left.
  const paused = useSelector((s) => s.session.multiPaused);
  // Post-play: Space hides the tubes and leaves only the balls resting in place.
  const tubesOff = useSelector((s) => s.session.multiTubesOff);
  const trajLen = useSelector((s) => s.session.multiTrajLen);
  const manualCam = useSelector((s) => s.session.multiManualCam);
  // "chronological" = one-by-one intro then all together; "simultaneous" = all
  // six together with no intro.
  const playMode = useSelector((s) => s.session.multiPlayMode);
  // When a review angle (keys 1-5) is chosen, MultiCameraAngles owns the camera.
  const multiViewAngle = useSelector((s) => s.session.multiViewAngle);
  // Bumped by key 0 to replay the animation from the start.
  const replayToken = useSelector((s) => s.session.multiReplayToken);
  const dispatch = useDispatch();
  const { camera, clock, controls } = useThree();
  const pauseHandedRef = useRef(false); // true once the camera is handed to OrbitControls

  // Option B: when the operator grabs the camera (drag/zoom) during bowling play,
  // mark it manual so the scripted camera doesn't reclaim it on resume. 'start'
  // fires only on real pointer/wheel/touch input.
  useEffect(() => {
    if (!controls) return;
    const onStart = () => {
      if (playing) dispatch(setMultiManualCam(true));
    };
    controls.addEventListener("start", onStart);
    return () => controls.removeEventListener("start", onStart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controls, playing]);

  // Convert the redux-serializable {x,y,z} points back to THREE.Vector3 once.
  const balls = useMemo(() => {
    return (accumulated ?? []).map((t) => ({
      positions: (t.positions ?? []).map(
        (p) => new THREE.Vector3(p.x, p.y, p.z),
      ),
      impactIndex: t.impactIndex,
      pitchIndex: t.pitchIndex,
    }));
  }, [accumulated]);

  // Camera poses derived from the data so they're correct regardless of pitch
  // orientation. The release end (first points) is the bowler's end; the impact
  // end (last points) is the stumps the balls converge on.
  const camPoses = useMemo(() => {
    const box = new THREE.Box3();
    const releaseC = new THREE.Vector3();
    const impactC = new THREE.Vector3();
    let n = 0;
    balls.forEach((b) => {
      const p = b.positions;
      if (!p.length) return;
      p.forEach((v) => box.expandByPoint(v));
      releaseC.add(p[0]);
      impactC.add(p[p.length - 1]);
      n += 1;
    });

    const center = new THREE.Vector3(0, 0.5, 0);
    let radius = 3;
    if (n > 0) {
      box.getCenter(center);
      const sphere = new THREE.Sphere();
      box.getBoundingSphere(sphere);
      radius = Math.max(sphere.radius, 0.5);
      releaseC.multiplyScalar(1 / n);
      impactC.multiplyScalar(1 / n);
    }

    // Direction along the pitch, from the stumps toward the bowler.
    const toBowler = releaseC.clone().sub(impactC);
    toBowler.y = 0; // keep the bowler view level along the ground plane
    if (toBowler.lengthSq() < 1e-6) toBowler.set(0, 0, 1);
    toBowler.normalize();
    // Sideways (left/right) direction for the bowler view. From behind looking down
    // the pitch, cross(toBowler, up) points LEFT, so +BOWLER_SIDE shifts left.
    const bowlerSideDir = new THREE.Vector3()
      .crossVectors(toBowler, new THREE.Vector3(0, 1, 0))
      .normalize();

    // Bowler's-end view: behind the release point, elevated, looking down the
    // pitch at the (distant) stumps — balls travel away from the camera.
    const bowlerPos = releaseC
      .clone()
      .add(toBowler.clone().multiplyScalar(BOWLER_BACK))
      .add(bowlerSideDir.clone().multiplyScalar(BOWLER_SIDE));
    bowlerPos.y = BOWLER_HEIGHT;

    // Pitch view: look at the bounce (pitch) area. Bounce centroid = the average
    // pitchIndex point across the deliveries (fallback ~45% along the path).
    const bounceC = new THREE.Vector3();
    let bn = 0;
    balls.forEach((b) => {
      const p = b.positions;
      if (!p.length) return;
      const idx =
        b.pitchIndex != null
          ? Math.min(Math.max(b.pitchIndex, 0), p.length - 1)
          : Math.floor((p.length - 1) * 0.45);
      bounceC.add(p[idx]);
      bn += 1;
    });
    if (bn > 0) bounceC.multiplyScalar(1 / bn);
    else bounceC.copy(center);
    // Straight in toward the bowler side + raised, looking down at the bounce.
    const pitchPos = bounceC
      .clone()
      .add(toBowler.clone().multiplyScalar(PITCH_BACK))
      .add(bowlerSideDir.clone().multiplyScalar(PITCH_SIDE));
    pitchPos.y = PITCH_HEIGHT;
    // Face the STUMPS clearly (not the bounce) — camera sits at the pitch looking
    // down toward the stumps as the ball carries on to them.
    const pitchLook = impactC.clone();
    pitchLook.y = PITCH_LOOK_HEIGHT;

    // Cinematic right-side bounce view: square of the pitch to the RIGHT of the
    // bounce (−bowlerSideDir, since +bowlerSideDir is left), looking at the bounce.
    const rightBouncePos = bounceC
      .clone()
      .add(bowlerSideDir.clone().multiplyScalar(-CINE_RIGHT_SIDE));
    rightBouncePos.y = CINE_RIGHT_HEIGHT;
    const rightBounceLook = bounceC.clone();
    rightBounceLook.y = CINE_RIGHT_LOOK_HEIGHT;

    // Cinematic centre beat: centred in FRONT of the stumps (bowler side), facing
    // them, at the SAME height as the right view (no height change on right→centre).
    const cineCentrePos = impactC
      .clone()
      .add(toBowler.clone().multiplyScalar(CINE_CENTRE_DIST));
    cineCentrePos.y = CINE_CENTRE_HEIGHT;
    const cineCentreLook = impactC.clone();
    cineCentreLook.y = CINE_CENTRE_LOOK_HEIGHT;
    // Cinematic FRONT (batsman-facing): in front of the stumps on the bowler side,
    // looking back at the stumps / batsman.
    const cineFrontPos = impactC
      .clone()
      .add(toBowler.clone().multiplyScalar(CINE_FRONT_DIST))
      // Shift LEFT of the pitch centre (bowlerSideDir points left for +value).
      .add(bowlerSideDir.clone().multiplyScalar(CINE_FRONT_SIDE || 0));
    cineFrontPos.y = CINE_FRONT_HEIGHT;
    const cineFrontLook = impactC.clone();
    cineFrontLook.y = CINE_FRONT_LOOK_HEIGHT;
    // Nudge the camera toward the stumps (horizontally) — moves it more "front".
    const pitchFwd = pitchLook.clone().sub(pitchPos);
    pitchFwd.y = 0;
    if (pitchFwd.lengthSq() > 1e-6) {
      pitchPos.add(pitchFwd.normalize().multiplyScalar(PITCH_FORWARD));
    }
    // Aim at the stumps (impact end), near ground height.
    const bowlerLook = impactC.clone();
    bowlerLook.y = BOWLER_LOOK_HEIGHT;

    // Post-play pose: same look target, nudged to the right and dollied a
    // little toward the stumps. "right" is perpendicular to the look direction
    // in the horizontal plane.
    const viewDir = bowlerLook.clone().sub(bowlerPos);
    viewDir.y = 0;
    if (viewDir.lengthSq() < 1e-6) viewDir.set(0, 0, -1);
    viewDir.normalize();
    const rightDir = new THREE.Vector3()
      .crossVectors(viewDir, new THREE.Vector3(0, 1, 0))
      .normalize();
    // Front-of-trajectory view: in front of the stumps, low, looking back up
    // the pitch at the rising arcs.
    const frontPos = impactC
      .clone()
      .add(toBowler.clone().multiplyScalar(-FRONT_BACK))
      .add(rightDir.clone().multiplyScalar(FRONT_SIDE));
    frontPos.y = FRONT_HEIGHT;
    const frontLook = impactC
      .clone()
      .add(toBowler.clone().multiplyScalar(FRONT_LOOK_FWD));
    frontLook.y = FRONT_LOOK_HEIGHT;
    // On resume: settle into the behind-the-stumps review view (matches the
    // key-1 angle in MultiCameraAngles).
    const rightB = new THREE.Vector3()
      .crossVectors(toBowler, new THREE.Vector3(0, 1, 0))
      .normalize();
    const behindPos = impactC
      .clone()
      .add(toBowler.clone().multiplyScalar(-BEHIND_DIST))
      .add(rightB.clone().multiplyScalar(BEHIND_SIDE));
    behindPos.y = BEHIND_HEIGHT;
    const behindLook = impactC
      .clone()
      .add(toBowler.clone().multiplyScalar(BEHIND_LOOK_AHEAD));
    behindLook.y = BEHIND_LOOK_HEIGHT;

    // Sequence view: BEHIND the bowler's release (+toBowler, past the release point),
    // elevated, looking down the pitch toward the stumps → the bowler's end is
    // covered, the trajectory is seen from its start, and the pitch fills the frame.
    const seqPos = releaseC
      .clone()
      .add(toBowler.clone().multiplyScalar(SEQ_BACK))
      // Shift LEFT of the pitch centre (bowlerSideDir points left for +value).
      .add(bowlerSideDir.clone().multiplyScalar(SEQ_SIDE || 0));
    seqPos.y = SEQ_HEIGHT;
    const seqLook = impactC
      .clone()
      .add(toBowler.clone().multiplyScalar(SEQ_LOOK_FWD));
    seqLook.y = SEQ_LOOK_HEIGHT;

    // Post-play: right + pulled back + raised overview, framing the trajectories.
    const postPos = bowlerPos
      .clone()
      .add(rightDir.clone().multiplyScalar(POST_RIGHT_SHIFT))
      .add(toBowler.clone().multiplyScalar(POST_ZOOM_OUT));
    postPos.y = BOWLER_HEIGHT + POST_RISE;
    const postLook = center.clone();
    postLook.y = BOWLER_LOOK_HEIGHT;

    // Top-down view (for when the top view is re-enabled). Tiny Z offset avoids
    // a gimbal singularity when looking straight down.
    const dist =
      (radius / Math.sin(THREE.MathUtils.degToRad(OVERVIEW_FOV) / 2)) *
      FIT_MARGIN;
    const topPos = center.clone().add(new THREE.Vector3(0, dist, 0.0001));

    return {
      bowlerPos,
      bowlerLook,
      pitchPos,
      pitchLook,
      rightBouncePos,
      rightBounceLook,
      cineCentrePos,
      cineCentreLook,
      cineFrontPos,
      cineFrontLook,
      frontPos,
      frontLook,
      behindPos,
      behindLook,
      seqPos,
      seqLook,
      postPos,
      postLook,
      topPos,
      look: center,
    };
  }, [balls]);

  // Stable per-ball mesh refs across renders.
  const refs = useRef([]);
  if (refs.current.length !== balls.length) {
    refs.current = Array.from({ length: balls.length }, () => ({
      red: { current: null },
      blue: { current: null },
      ball: { current: null },
      impactBall: { current: null }, // static ball at impact
      endBall: { current: null }, // static ball at the end of the path
      pitchMarker: { current: null },
    }));
  }

  // Per-ball pitch marker world position + the progress fraction at which it
  // becomes visible (revealed as the ball reaches its bounce point).
  const markerInfo = useMemo(
    () =>
      balls.map((b) => {
        const total = Math.max(b.positions.length - 1, 1);
        const hasPitch = b.pitchIndex != null && b.positions[b.pitchIndex];
        return {
          pitchPos: hasPitch ? b.positions[b.pitchIndex] : null,
          pitchFrac: hasPitch ? b.pitchIndex / total : null,
        };
      }),
    [balls],
  );

  // Reveal/hide one ball's pitch marker given how far it has progressed (0..1).
  const updatePitchMarker = (idx, progress, show) => {
    const r = refs.current[idx];
    const info = markerInfo[idx];
    if (!r || !r.pitchMarker.current || !info) return;
    r.pitchMarker.current.visible =
      show && info.pitchFrac != null && progress >= info.pitchFrac;
  };

  const baseTimeRef = useRef(0);
  const seqActiveRef = useRef(-1); // last ticker chip index dispatched (sequential sync)
  const pausedElapsedRef = useRef(null); // frozen elapsed while paused (null = running)
  const cameraBootstrappedRef = useRef(false);
  const topCamTriggeredRef = useRef(false);
  const topCamTRef = useRef(0);
  const completedRef = useRef(false);
  const completeTimeRef = useRef(0);
  const leftMoveTriggeredRef = useRef(false);
  const leftMoveTRef = useRef(0);
  const interactiveHandedRef = useRef(false); // true once handed to OrbitControls (complete)
  // Broadcast-view ease: captured start pose + time, so the camera glides INTO the fixed
  // broadcast ¾ view over BROADCAST_EASE seconds (reset to null whenever we stop driving it).
  const bcT0Ref = useRef(null);
  const bcFromPos = useRef(new THREE.Vector3());
  const bcFromLook = useRef(new THREE.Vector3());
  const bcFromFov = useRef(BROADCAST_FOV);

  // Reset the timeline whenever a new play starts or the ball set changes.
  useEffect(() => {
    if (!playing) return;
    clock.start();
    baseTimeRef.current = clock.getElapsedTime();
    cameraBootstrappedRef.current = false;
    topCamTriggeredRef.current = false;
    topCamTRef.current = 0;
    completedRef.current = false;
    completeTimeRef.current = 0;
    leftMoveTriggeredRef.current = false;
    leftMoveTRef.current = 0;
    interactiveHandedRef.current = false;
    seqActiveRef.current = -1;
    bcT0Ref.current = null;
  }, [playing, balls, clock, replayToken, started]);

  useFrame(() => {
    if (!playing || balls.length === 0) return;

    // Paused (Space while playing): PIN `elapsed` to the exact value captured at
    // the moment of pause, every frame, so there's zero drift — the balls, tubes
    // AND camera freeze precisely in place. On resume we clear the pin and shift
    // baseTime so playback continues seamlessly from where it stopped.
    if (paused) {
      if (pausedElapsedRef.current == null) {
        pausedElapsedRef.current = clock.getElapsedTime() - baseTimeRef.current;
      }
      baseTimeRef.current = clock.getElapsedTime() - pausedElapsedRef.current;
      // Hand the camera to OrbitControls ONCE (point its target at what the camera
      // is looking at, no snap), then STOP writing the camera so the operator can
      // zoom / pan / tilt. The balls/tubes stay frozen at their paused positions.
      if (!pauseHandedRef.current) {
        pauseHandedRef.current = true;
        if (controls?.target) {
          const fwd = new THREE.Vector3();
          camera.getWorldDirection(fwd);
          const look = camPoses?.look || new THREE.Vector3(0, 0.4, 0);
          const d = Math.max(camera.position.distanceTo(look), 0.5);
          controls.target.copy(camera.position).add(fwd.multiplyScalar(d));
          controls.update();
        }
        // Option B: pausing hands the camera to the operator — keep it manual so the
        // scripted camera does NOT reclaim it on resume (deterministic, no snap).
        if (!manualCam) dispatch(setMultiManualCam(true));
      }
      return; // OrbitControls own the camera while paused
    } else {
      // Resuming from a pause: give the camera BACK to the scripted broadcast view so it
      // continues (it was handed to OrbitControls on pause via setMultiManualCam(true)).
      if (pauseHandedRef.current && manualCam) {
        dispatch(setMultiManualCam(false));
        bcT0Ref.current = null; // re-ease smoothly back to the broadcast view
      }
      pausedElapsedRef.current = null;
      pauseHandedRef.current = false;
    }

    // Armed but not started: hold the fixed broadcast ¾ view, hide every ball + marker,
    // and wait for Play/Space. (Play then eases in from here — already in place → no jump.)
    if (!started) {
      camera.up.set(0, 1, 0);
      camera.fov = widenFovForAspect(BROADCAST_FOV, camera.aspect);
      camera.position.copy(BROADCAST_POS);
      camera.lookAt(BROADCAST_LOOK);
      camera.updateProjectionMatrix();
      balls.forEach((_, idx) => {
        hideBall(refs.current[idx]);
        updatePitchMarker(idx, 0, false);
      });
      bcT0Ref.current = null; // ease in cleanly once play starts
      return;
    }

    const now = clock.getElapsedTime();
    const elapsed = Math.max(0, now - baseTimeRef.current);
    // Timeline: [one-by-one pass] → [all-together replay]. Sequential plays each ball in
    // turn, THEN re-draws all 6 together once. "Combined" (simultaneous) skips the one-by-one
    // pass and only plays the all-together sweep.
    const simultaneous = playMode === "simultaneous";
    const nBalls = balls.length;
    const seqTotal = simultaneous ? 0 : nBalls * BALL_SLOT; // end of the one-by-one pass
    const inAllTogether = elapsed >= seqTotal; // the final all-6-together replay
    const allT = clamp01((elapsed - seqTotal) / ALL_TOGETHER_DUR); // 0..1 during the replay
    const playDur = seqTotal + ALL_TOGETHER_DUR; // whole play (both phases)
    const activeBall = inAllTogether
      ? nBalls - 1
      : Math.min(Math.floor(elapsed / BALL_SLOT), nBalls - 1);

    // Reveal the ticker chip in sync with the active ball.
    if (seqActiveRef.current !== activeBall) {
      seqActiveRef.current = activeBall;
      dispatch(setMultiSeqActive(activeBall));
    }

    // ---- TUBES: the "play over" draw / hold / fade timeline (always run) ----
    // Ball n grows over DRAW_DUR with a ball riding the tip, holds, then fades from
    // OPACITY_CUR → OPACITY_PREV when the next ball starts. All tubes stay visible.
    balls.forEach((ball, idx) => {
      const positions = ball.positions;
      const r = refs.current[idx];
      if (!r || !positions || positions.length < 2) return;

      // Tubes off (Space after the over finished): drop the tubes, keep only the impact ball.
      if (tubesOff) {
        setMeshPts(r.red, null, TUBE_RADIUS);
        setMeshPts(r.blue, null, TUBE_RADIUS);
        if (r.ball.current) r.ball.current.visible = false;
        if (r.endBall.current) r.endBall.current.visible = false;
        if (r.impactBall.current) {
          const total = positions.length - 1;
          const hasImpact = ball.impactIndex != null && ball.impactIndex < total;
          const iIdx = hasImpact ? ball.impactIndex : total;
          r.impactBall.current.position.copy(positions[iIdx]);
          r.impactBall.current.visible = true;
        }
        return;
      }

      const done = completedRef.current;
      let p; // draw progress 0..1
      let opacity;
      if (done) {
        // Settled: all tubes full; brighten the set (newest brightest, rest raised).
        p = 1;
        opacity = idx === nBalls - 1 ? OPACITY_CUR_DONE : OPACITY_PREV_DONE;
      } else if (inAllTogether) {
        // ALL-TOGETHER replay: every tube re-draws together from 0→1, all bright.
        p = allT;
        opacity = OPACITY_CUR;
      } else if (idx > activeBall) {
        hideBall(r); // not played yet
        return;
      } else if (idx === activeBall) {
        p = clamp01((elapsed - idx * BALL_SLOT) / DRAW_DUR); // growing in at the tip
        opacity = OPACITY_CUR;
      } else {
        // Earlier ball: fully drawn, fading back once the NEXT ball started.
        p = 1;
        const fp = clamp01((elapsed - (idx + 1) * BALL_SLOT) / FADE_DUR);
        opacity = OPACITY_CUR + (OPACITY_PREV - OPACITY_CUR) * fp;
      }
      drawBall(ball, r, p, trajLen);
      // (drawBall reveals each ball at the END of its tube once fully drawn — so when all 6
      // come together, every trajectory keeps a ball resting at its tip.)
      if (r.red.current?.material) r.red.current.material.opacity = opacity;
      if (r.blue.current?.material) r.blue.current.material.opacity = opacity;
      updatePitchMarker(idx, p, true);
    });

    // ---- COMPLETE: one-by-one pass + all-together replay both done ----
    if (elapsed >= playDur && !completedRef.current) {
      completedRef.current = true;
      completeTimeRef.current = now;
      dispatch(setMultiTrajectoryComplete(true));
    }

    // Slow push-in zoom progress 0 → 1 over ZOOM_SLOW× the ball play (so it moves slowly and
    // keeps gliding gently after the balls finish). Held wide for ZOOM_START_DELAY first, then
    // ease-in-out (no fast initial lunge).
    const zoomDur = Math.max(0.1, playDur * ZOOM_SLOW);
    const zp = easeInOutCubic(
      clamp01((elapsed - ZOOM_START_DELAY) / Math.max(0.1, zoomDur - ZOOM_START_DELAY)),
    );
    const zoomDone = zp >= 0.999;

    // ---- CAMERA ----
    // A review key (keys 1-4) → MultiCameraAngles owns the camera; don't touch it.
    if (multiViewAngle) {
      interactiveHandedRef.current = false;
      bcT0Ref.current = null;
      return;
    }
    // Operator grabbed the camera (drag/zoom) → leave it to OrbitControls.
    if (manualCam) {
      bcT0Ref.current = null;
      return;
    }
    // Complete AND the slow zoom has fully arrived → snap to the close framing and hand to
    // OrbitControls ONCE. If the balls finished but the zoom is STILL gliding in, fall through
    // to the push-in below so it keeps zooming slowly (no snap) until it's done.
    if (completedRef.current && zoomDone) {
      if (!interactiveHandedRef.current) {
        interactiveHandedRef.current = true;
        camera.up.set(0, 1, 0);
        camera.position.copy(BROADCAST_ZOOM_POS);
        camera.fov = widenFovForAspect(BROADCAST_END_FOV, camera.aspect);
        camera.lookAt(BROADCAST_LOOK);
        camera.updateProjectionMatrix();
        if (controls?.target) {
          controls.target.copy(BROADCAST_LOOK);
          controls.update?.();
        }
        dispatch(setMultiInteractive(true));
      }
      return; // OrbitControls own the camera now
    }

    // SLOW PUSH-IN broadcast camera: the view starts WIDE and zooms in slowly. A 0.9 s ease-in
    // blends from the idle pose into the (moving) target so there's no jump on entry.
    if (bcT0Ref.current == null) {
      bcT0Ref.current = now;
      bcFromPos.current.copy(camera.position);
      const fwd0 = new THREE.Vector3();
      camera.getWorldDirection(fwd0);
      bcFromLook.current.copy(camera.position).add(fwd0.multiplyScalar(8));
      bcFromFov.current = camera.fov;
    }
    const targetPos = new THREE.Vector3().lerpVectors(BROADCAST_POS, BROADCAST_ZOOM_POS, zp);
    const targetFov = widenFovForAspect(
      BROADCAST_FOV + (BROADCAST_END_FOV - BROADCAST_FOV) * zp,
      camera.aspect,
    ); // PiP (portrait) → fit width
    // Entry ease-in blend (idle → the moving target) over the first 0.9 s.
    const u = easeOutCubic((now - bcT0Ref.current) / BROADCAST_EASE);
    camera.up.set(0, 1, 0);
    camera.position.lerpVectors(bcFromPos.current, targetPos, u);
    camera.fov = bcFromFov.current + (targetFov - bcFromFov.current) * u;
    const lookNow = new THREE.Vector3().lerpVectors(bcFromLook.current, BROADCAST_LOOK, u);
    camera.lookAt(lookNow);
    camera.updateProjectionMatrix();
    // Prime OrbitControls' target so a pause hands over without a camera-angle jump.
    if (controls?.target) controls.target.copy(lookNow);
  });

  if (!playing || balls.length === 0) return null;

  return (
    <group>
      {balls.map((_, idx) => {
        const r = refs.current[idx];
        // One distinct, semi-transparent color per delivery across its whole
        // trajectory (both pre- and post-impact segments use the same color).
        const color = BALL_COLORS[idx % BALL_COLORS.length];
        return (
          <group key={idx}>
            <mesh ref={r.red} visible={false}>
              <meshStandardMaterial
                color={color}
                transparent
                opacity={TUBE_OPACITY}
                roughness={1}
                metalness={0}
                side={THREE.DoubleSide}
              />
            </mesh>
            <mesh ref={r.blue} visible={false}>
              <meshStandardMaterial
                color={color}
                transparent
                opacity={TUBE_OPACITY}
                roughness={1}
                metalness={0}
                side={THREE.DoubleSide}
              />
            </mesh>
            {/* 3D white-ball GLB model (not a sprite/image). drawBall moves it via
                r.ball each frame. */}
            <GlbBall ref={r.ball} radius={getConfig("BALL_SIZE")} visible={false} />
            {/* Static balls: one at impact, one at the end — drawBall positions +
                reveals them. Same size as the moving ball (real ball size). */}
            <GlbBall ref={r.impactBall} radius={getConfig("BALL_SIZE")} visible={false} />
            <GlbBall ref={r.endBall} radius={getConfig("BALL_SIZE")} visible={false} />
            {/* Pitch bounce markers removed — no coloured discs on the pitch. */}
          </group>
        );
      })}
    </group>
  );
}
