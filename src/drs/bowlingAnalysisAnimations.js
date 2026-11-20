// Bowling-analysis (all-balls) camera + timeline animation config.
//
// All the camera/timeline tuning for the Bowling Analysis view lives here — edit
// these to change how the deliveries play and how the camera frames them. This
// mirrors how reviewAnimations.js drives the DRS review cameras and
// pitchMapAnimations.js drives the pitch map. MultiBowlingTrajectory.jsx reads
// this. Visual-only sizes (tube radius, opacity, pitch-marker disc) stay in
// viewConfig.js (MULTI_PLAY.tube). Distances are in scene metres; the pitch runs
// along ±Z with the stumps near the world origin.

export const BOWLING_ANALYSIS = {
  // ── BROADCAST CAMERA (the play view) ──────────────────────────────────────
  // The UMPIRE's view: CENTRED on the pitch line (x=0) at the bowler's end, looking straight
  // down the pitch toward the batter — only a slight downward tilt (not an angled ¾ from the
  // side). The play eases INTO this view and holds it for the whole over.
  // (Stumps at the world origin, +Z = bowler; bowler stumps ≈ z 20.)
  broadcast: {
    fov: 13, // long lens
    pos: [0, 3, 40], // CENTRED (x=0), low (umpire height ≈ straight), behind the bowler's end
    look: [0, 0.8, 9.6], // aim straight down the pitch (centred)
    easeIn: 0.9, // seconds to ease into the view (ease-out-cubic)
    // Slow push-in: the view starts wide and zooms in across the WHOLE over, arriving at
    // this close framing as the final ball completes (so the balls are well-framed while
    // playing — no snap-zoom at the end).
    endFov: 11, // tighter lens at the end of the push-in
    endZoomScale: 0.68, // zoomed-in eye = 68% of the way from the look point to the wide pos
  },

  // ── "PLAY OVER" 6-BALL ANIMATION ──────────────────────────────────────────
  // Each tube grows from the release at a constant speed (drawDur), a ball rides the
  // tip, then it holds. The next ball starts every ballSlot seconds; when it does, the
  // previous tube fades from opacityCur → opacityPrev over fadeDur. All tubes stay.
  playOver: {
    drawDur: 0.85, // seconds to draw one tube (0 → 1) — faster
    holdDur: 0.45, // seconds the finished tube stays bright before the next starts
    ballSlot: 1.3, // seconds between ball starts (drawDur + holdDur)
    fadeDur: 0.3, // seconds a previous tube takes to fade back
    // After the one-by-one pass, ALL 6 tubes re-draw together once (a synchronized sweep)
    // before settling.
    allTogetherDur: 1.6, // seconds for the all-together replay
    opacityCur: 0.9, // the current (newest) tube
    opacityPrev: 0.22, // earlier tubes
  },

  // ── REVIEW KEYS 1-4 (post-playback camera) ───────────────────────────────
  // Where each number key sends the camera after the over has played. Same shape
  // as the DRS review angles (src/drs/reviewAnimations.js) — buildTween reads this
  // instead of the DRS config, so editing here affects ONLY the Bowling Analysis,
  // never the DRS review. Stumps are at the world origin; +Z points to the bowler.
  //
  // NOTE: every key is framed at the SAME distance + fov (review.dist / review.fov
  // below) so switching keys never re-zooms — `target` here sets the DIRECTION and
  // the eye HEIGHT (target.y), `look` the aim point, `arc` the swing-around path.
  //
  //   key 1 = side   key 2 = top   key 3 = behind   key 4 = front
  reviewAngles: {
    // 1 — side-on: to the right (+X) of the stumps, LIFTED + pulled BACK, looking at
    // the stumps. dist pushes the camera further back so the full width of the
    // trajectory tubes stays in frame (they're not cut off on the left).
    side: {
      mode: "direct",
      fromCurrent: true,
      // Pan the camera LEFT without turning: shift BOTH the eye and the look-point by
      // the same amount along +Z (screen-left in this side view). Equal z on target
      // and look keeps the aim direction (+X) unchanged → pure translation, no rotate.
      target: { x: 2.5, y: 2.4, z: 0.8 }, // direction (+X); eye height 2.4; panned +Z
      look: { x: 0, y: 0.35, z: 0.8 }, // same +Z → camera trucks left, no turn
      up: [0, 1, 0],
      duration: 1.5,
    },
    // 2 — top-down: straight above, looking down. up = −Z so length reads upright AND the
    // camera tilts FORWARD into overhead (natural head-down), not rolling over backwards —
    // that backward roll (from up = +Z) was the "rotation". Restored to the known-good config.
    top: {
      mode: "direct",
      fromCurrent: true,
      overhead: true,
      arc: { side: 30, up: 8 }, // scaled to the move in the multi view
      target: { x: 0, y: 4.2, z: "ball" }, // overhead (height from dist)
      look: { x: 0, y: "ball", z: "ball" }, // look straight down at the stumps
      dist: 8, // a little further out than the shared review.dist (6) → zoomed out a bit
      up: [0, 0, -1],
      duration: 1.7,
    },
    // 3 — behind: behind the stumps (−Z), LIFTED, looking down the pitch to the bowler.
    behind: {
      mode: "direct",
      fromCurrent: true,
      arc: { side: 30, up: 8 }, // swing around so it doesn't cross the stumps
      target: { x: 0, y: 1.4, z: -1 }, // direction (−Z); eye height LIFTED (was 2.4) → looks down more
      look: { x: 0, y: 0.35, z: 0 }, // stump centre
      dist: 5, // closer than the shared review.dist (6) → zoomed in a little
      up: [0, 1, 0],
      duration: 1.8,
    },
    // 4 — front: bowler's end (+Z), elevated, looking back at the stumps.
    // ↓↓ THIS is the 4th camera for the Bowling Analysis — tune it here. ↓↓
    front: {
      mode: "direct",
      fromCurrent: true,
      arc: { side: 30, up: 8 }, // swing around (don't flip through the stumps)
      target: { x: -0.03, y: 4, z: 1 }, // direction (+Z); eye height 5 (lifted)
      look: { x: 0, y: 0.35, z: 0 }, // stump centre
      dist: 15, // pushed back a little (others use review.dist = 6)
      up: [0, 1, 0],
      duration: 1.5,
    },
  },

  // Shared framing for keys 1-4: same distance + fov for every angle → switching
  // keys only changes the viewpoint, never the zoom. The first key eases the wide
  // playback fov to review.fov; later keys hold it.
  review: {
    fov: 30, // constant field of view (smaller = tighter)
    dist: 6, // metres from the stumps for all four angles (bigger = further)
  },

  // ── TIMELINE ─────────────────────────────────────────────────────────────
  // All balls on one timeline, freezing at the pitch:
  //   release -> pitch (phase1) | freeze + camera move (pause) | pitch -> stumps (phase2)
  timeline: {
    phase1Dur: 2.2, // seconds, release down to the pitch
    pauseDur: 0.5, // seconds frozen at the pitch (shorter wait after the bounce)
    phase2Dur: 2.2, // seconds, pitch through to the stumps
  },

  // ── INTRO SEQUENCE ───────────────────────────────────────────────────────
  // Play each delivery one-by-one while the camera orbits the pitch.
  seq: {
    ballDur: 2.5, // seconds per ball in the one-by-one intro (slower)
    orbitSpeed: 0.22, // radians/sec — slow continuous rotation
  },

  // ── AUTO-FIT TOP-DOWN ────────────────────────────────────────────────────
  // Top-down framing of ALL trajectories via their bounding sphere.
  overview: {
    fov: 35, // top-down view fov (used when top view is re-enabled)
    fitMargin: 1.4, // padding around the bounding sphere
  },

  // ── BOWLER'S-END VIEW ────────────────────────────────────────────────────
  // Behind the release point, elevated, looking down-pitch.
  bowler: {
    fov: 50, // wider = more of the pitch + stadium
    back: 5, // metres behind the bowler's release point
    height: 2.5, // elevated camera height
    side: 2, // sideways shift: + = LEFT, − = right (metres)
    lookHeight: 1, // aim near the stumps at ground height
  },

  // ── CINEMATIC (camera View 1) ────────────────────────────────────────────
  // Playback choreography: as the ball travels to the pitch the camera swings to
  // the RIGHT to show the bounce, holds briefly (timeline.pauseDur), then moves to
  // the centre stump view as the ball carries on to the stumps.
  cinematic: {
    rightSide: 4.5, // how far RIGHT of the bounce the camera sits (metres)
    rightHeight: 1.8, // camera height for the right-side bounce view
    rightLookHeight: 0.2, // aim at the bounce, near the ground
    // Phase B: right → CENTRE (same height, no height change) → ZOOM IN to FRONT.
    // Centre and front are both in front of the stumps (bowler side) facing them;
    // the SAME height keeps it flat — only the distance changes (centre → zoom in).
    centreDist: 9, // CENTRE view: metres in front of the stumps (farther = wider)
    centreHeight: 1.8, // SAME as rightHeight — no height change on the right→centre move
    centreLookHeight: 0.4, // centre beat: aim at the stumps
    frontDist: 4.5, // FRONT view: a bit further BACK from the stumps
    frontHeight: 2.2, // raised (lifted up) — this is the settled bowling-analysis view
    frontSide: 2.5, // sideways shift: + = LEFT of the pitch centre (metres)
    frontLookHeight: 0.5, // front view: aim at the stumps / batsman
  },

  // ── PITCH VIEW (playback) ────────────────────────────────────────────────
  // The camera moves STRAIGHT in to the pitch (bounce) area at the start, then
  // holds there while the trajectory plays. No sideways / right swing.
  pitch: {
    back: 2.5, // metres toward the bowler from the bounce point
    height: 1.0, // camera height over the pitch
    side: 0, // sideways shift: + = left, − = right (metres)
    forward: 1.5, // nudge the camera toward the stumps (bigger = more front/closer)
    fov: 40, // field of view (smaller = more zoomed in, less left/right side space)
    lookHeight: 0.4, // aim height at the STUMPS (so they're clearly in view)
    moveFrac: 1.0, // how much of phase-1 the move-in takes (1 = all of it)
  },

  // ── SEQUENCE VIEW (one-by-one fill-the-pitch) ─────────────────────────────
  // Fixed shot that FILLS the frame with just the pitch (crops the left / right /
  // back grass). Camera sits BEHIND the bowler's release end, pulled back + raised,
  // looking down the pitch toward the stumps — so the bowler's end is covered, the
  // trajectory is seen from its start, and the pitch strip fills the frame. Tune:
  //   back  ↑ = camera further behind the bowler (covers more of that end)
  //   height↑ = higher / more top-down          fov ↓ = tighter, less side grass
  sequence: {
    back: 11, // metres behind the bowler's release — moved a little FORWARD (was 14)
    height: 5, // camera height (lifted up)
    side: -2.5, // sideways shift: + = LEFT, − = RIGHT of the pitch centre (metres)
    lookFwd: 4, // aim a little up the pitch from the stumps
    lookHeight: 0.4, // aim height
    fov: 18, // TELEPHOTO (narrow) — like the DRS review: background compresses to
    // nothing (no stadium), the pitch + trajectories fill the frame. Smaller = tighter.
  },

  // ── FRONT-OF-TRAJECTORY VIEW ─────────────────────────────────────────────
  // In front of the stumps, looking back up the arcs.
  front: {
    back: 1.5, // in front of the stumps (keeper side)
    side: 1.2, // sideways offset
    height: 0.7, // low, near ground
    lookFwd: 4, // look this far up the pitch (toward the bowler)
    lookHeight: 1.6, // aim up at the rising trajectories
  },

  // ── BEHIND-THE-STUMPS (resume) ───────────────────────────────────────────
  // On resume, settle into the behind-the-stumps review view (matches key 1).
  behind: {
    dist: 5, // behind the stumps (keeper side)
    side: 0, // sideways offset (0 = exactly behind the stumps)
    height: 1.8, // camera height
    lookAhead: 2, // aim this far up the pitch (toward the bowler)
    lookHeight: 0.5, // aim height
  },

  // ── POST-PLAY POSE ───────────────────────────────────────────────────────
  // Frames the trajectories once the play completes.
  post: {
    rightShift: 2.5, // sideways (right) offset
    zoomOut: 3, // pull back behind the bowler (zoom out)
    rise: 1.5, // raise the camera a bit
  },
};
