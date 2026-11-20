// Swing Analysis camera + timing config (single ball, trajectory release→impact).
//
// Self-contained like bowlingAnalysisAnimations.js / pitchMapAnimations.js so the
// Swing view is easy to tune and debug. SwingAnalysis.jsx reads this. Distances are
// in scene metres; the pitch runs along ±Z with the batter's stumps near the origin
// and the bowler's release at +Z.
//
// `flightDur` is exposed so a future UI speed control can raise/lower playback speed
// (smaller = faster). Keep this the single source of truth for those tweaks.

export const SWING_ANALYSIS = {
  // Camera: BEHIND the bowler's release (+toBowler), elevated, looking down the
  // pitch toward the stumps — the ball travels away from the camera.
  behindDist: 3, // metres behind the bowler's release
  height: 2.5, // camera height
  // Metres toward the batter's OFF side from the middle-stump line (flipped for a LHB).
  // Stump centres are ~0.095 m apart, so the Nth stump out is ≈ (N − 2) × 0.095:
  // 0.19 ≈ the 4th stump line.
  sideOffset: 0.19,
  lookFwd: 9, // aim this far down the pitch toward the stumps
  lookHeight: 0.5, // aim height
  fov: 26, // field of view — tighter (zoomed in)

  // Review-key (1-4) framing FOV. The DRS review frames its angles through the real
  // broadcast camera's EXTREME telephoto (~3°), which puts the side/behind/front cameras
  // far back for a flat, compressed, proper side-on of the stumps. The swing scene has no
  // calibrated camera, so we replicate that telephoto look with this value. Smaller =
  // further back / flatter (more DRS-like); larger = closer / steeper. Passed as
  // `reviewFov` to buildTween (NOT reviewDist, so per-angle framing + arcs stay DRS-style).
  reviewFov: 5,

  // Per-key eye-height overrides for the swing review angles (the DRS config lifts these
  // high — e.g. side sits at y=16; lower = camera moves DOWN / more horizontal side-on).
  sideEyeHeight: 10, // key 1 (side) camera height — lowered from the DRS default (16)
  // Key 3 (behind the stumps) distance from the stumps, metres. Larger = further back.
  // The DRS default (5) sits too close for the swing view.
  behindStumpsDist: 20,
  // Key 3 camera eye height, metres (DRS default 1.4). Lower = closer to the ground.
  behindStumpsHeight: 0.6,
  // Key 3: raise the camera AND its aim point (stump centre, y 0.35) by this much, so
  // the view slides up with the SAME tilt — trims dead space without re-angling.
  behindStumpsLift: 0.4,

  // Timing — the ball's flight from release to impact (seconds). Smaller = faster.
  // This is the value a UI speed slider would drive.
  flightDur: 1.4,
};
