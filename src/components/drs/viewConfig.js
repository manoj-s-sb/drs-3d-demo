import * as THREE from "three";

// ─────────────────────────────────────────────────────────────────────────────
// Central tuning for the DRS multi-ball + pitch-map views. Every "magic number"
// for camera angle / distance / height / zoom / duration lives here, grouped by
// the view it drives. Components unpack these into the local names they use, so
// tweaking a view = editing one value in this file.
// ─────────────────────────────────────────────────────────────────────────────

// MultiCameraAngles — post-"Select All" review angles. Keys 1-4
// (side/top/behind/front) now reuse the DRS review animation directly
// (src/drs/reviewAnimations.js via buildTween), so their poses are NOT configured
// here — only the shared look target and key 5's continuous orbit live below.
// Stumps sit at the world origin; +Z points toward the bowler.
export const MULTI_REVIEW = {
  lookAt: new THREE.Vector3(0, 0, 0),

  // Keys 1-4 (side/top/behind/front) and their framing (fov/distance) now live in
  // src/drs/bowlingAnalysisAnimations.js (reviewAngles + review) so they can be
  // tuned without touching the DRS review. Only key 5's orbit remains here.

  // Key 5 — orbit: continuously circle the trajectories.
  orbit: {
    radius: 6, // circle radius around the center
    height: 3, // camera height while orbiting
    speed: 0.5, // radians per second
    ramp: 1.2, // seconds to ease radius/height into the orbit
    fov: 45,
    lookHeight: 0.6, // height of the orbit's look target
  },
};

// MultiPitchMap — bounce-dot pitch map (bowler's-end view slowly zooming out).
export const PITCH_MAP = {
  dotRadius: 0.1, // every ball is the same size; outcome shown by color only
  // Camera animation (overview + top views, durations, easing) moved to
  // src/drs/pitchMapAnimations.js — edit the angle/transition there.
};

// MultiBowlingTrajectory — all-balls playback. Only the VISUAL sizes live here;
// the camera angles / timeline / zoom (the animation) moved to their own file,
// src/drs/bowlingAnalysisAnimations.js (BOWLING_ANALYSIS) — edit the movement
// there, like reviewAnimations.js / pitchMapAnimations.js.
export const MULTI_PLAY = {
  tube: {
    radius: 0.0355, // match BowlingTrajectory's thick tube
    opacity: 0.6, // tubes — match the DRS single-ball tube opacity
    pitchMarkerRadius: 0.11, // flat disc on the pitch where the ball bounced
  },
};
