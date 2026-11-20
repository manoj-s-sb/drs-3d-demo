// Review-camera animation config (keys 1–5).
//
// One entry per review angle. Edit these to change how each camera move behaves —
// buildTween() in components/drs/cameraAngles.js reads this. Angles NOT listed
// here fall back to the built-in cinematic 3-waypoint path.
//
// Fields:
//   mode      "direct"   → straight glide from the current pose to `target`
//                          (smooth ease-in-out, no swoop/waypoints).
//             (omit / other → uses the legacy cinematic arc in cameraAngles.js)
//   target    { x, y, z } final camera position in metres. Any axis may be the
//             string "ball" → use the ball's coordinate on that axis.
//   path      [{x,y,z}, ...] choreographed fly-through: the camera passes smoothly
//             through each waypoint in order (axis may be "ball") while keeping the
//             ball framed. Constant fov → no zoom-out. Overrides from/fromCurrent.
//   fromCurrent true → begin EXACTLY at the camera's current pose (where it stopped
//             after the video / 3D) and SLERP orientation to the target. No teleport
//             and no rotation snap — one continuous pan/dolly. Overrides from/*.
//   from      { x, y, z } explicit START position (metres, axis may be "ball"). If
//             set, the glide begins here — e.g. the bowler's end — instead of the
//             capped broadcast-camera start. Overrides maxTravel/fromAbove.
//   look      { x, y, z } point the camera aims at (axis may be "ball"; default =
//             the ball). Use to centre on something other than the ball, e.g. the
//             pitch centreline x=0. Any axis of `look`/`target` may also be a
//             handedness object { right, left } → buildTween picks by the batsman's
//             hand (e.g. look.x { right: 0.3, left: -0.4 } for the outside-leg centre).
//   up        [x,y,z] camera up-vector at the END of the move (default [0,1,0]).
//   fromUp    [x,y,z] up-vector at the START (default = `up`). Eases up→up so the
//             camera can pitch down without rolling.
//   fov       final field-of-view (zoom); held constant → no zoom-out swoop.
//   duration  seconds for the move.
//   maxTravel metres — the glide starts at most this far out along the line to
//             the target, so the review's far broadcast-camera start never turns
//             into a long fly-in "swoop" (default 6).
//   fromAbove metres — if set, the move is PURE VERTICAL: the camera cuts to this
//             many metres directly above `target` and descends straight down, so
//             the view never rotates. Overrides maxTravel.

// Shared transition tuning (NOT per-angle) — used by buildTween for the between-key
// camera switches. Tune the switch behaviour globally here.
export const REVIEW_TRANSITION = {
  // A move is "behind-involved" (needs the sideways `arc` to swing AROUND the stumps)
  // when the destination is behind OR the camera CAME from behind — i.e. its z is below
  // this. Top/front sit near z≈0..+, behind sits far −z, so −8 cleanly splits them.
  // Raise toward 0 to treat more start positions as "from behind"; lower to treat fewer.
  behindZThreshold: -8,
  // If the camera is already within this many metres of the target (e.g. pressing the
  // SAME key again), skip the arc so it doesn't swing out and back — no visible move.
  sameViewDistance: 1,
};

export const REVIEW_ANIMATIONS = {
  // fromCurrent transitions (keys 1-3): the 3D stops on a REAL calibrated broadcast
  // camera — far away with an extreme telephoto fov (~3°). Pressing the key BEGINS at
  // that stopped pose (no jump) and smoothly dollies to the view. The FOV is HELD at
  // the stopped value → NO zoom (in or out). `target` gives the DIRECTION + eye height;
  // the stop distance is computed from `frameFill` so the subject is framed
  // consistently. `look` = what it aims at. (Batsman's wicket at the world origin.)

  // 1 — Side-on: HAND-AWARE. Shows the side OPPOSITE the batter's hand — a
  // right-hander is viewed from the LEFT (−X), a left-hander from the RIGHT (+X).
  side: {
    mode: "direct",
    fromCurrent: true,
    target: { x: { right: -2.5, left: 2.5 }, y: 2.4, z: 0 }, // RHB → left side, LHB → right side; eye height 2.4 (matches bowling-analysis — clear, not top-down)
    look: { x: 0, y: 0.35, z: 0 }, // the stump centre
    // No per-key dist → uses the shared reviewDist (6) like bowling-analysis.
    up: [0, 1, 0],
    duration: 1.5,
  },

  // 2 — Top-down: straight above the pitch centre, looking down. up eases to the
  // pitch axis so it never gimbal-rolls overhead.
  top: {
    mode: "direct",
    fromCurrent: true,
    overhead: true,
    // Same arc as `behind` so 3→2 mirrors the 2→3 move (swing out + up to overhead)
    // instead of a straight rise — matches the transition feel you approved for 2→3.
    arc: { side: 30, up: 8 },
    target: { x: 0, y: 4.2, z: "ball" }, // (overhead — height from dist)
    look: { x: 0, y: "ball", z: "ball" }, // look straight down at the pitch centreline
    dist: 4, // matches bowling-analysis (closer → zoomed in)
    up: [0, 0, 1],
    duration: 1.7,
  },

  // 3 — Behind: SAME start-from-stopped, HELD-fov (no zoom) transition as key 1,
  // settling BEHIND the stumps (−Z), looking down the pitch. `arc` swings the camera
  // AROUND the stumps instead of driving straight through them (the stopped broadcast
  // cam is on the far side), so it doesn't flip 180° as it passes — smooth, gradual
  // rotation, still NO zoom. arc.side = sideways bulge; arc.up = how high it lifts.
  behind: {
    mode: "direct",
    fromCurrent: true,
    arc: { side: 30, up: 8 },
    target: { x: 0, y: 1.4, z: -1 }, // direction: behind (−Z); eye height 1.4 (matches bowling-analysis)
    look: { x: 0, y: 0.35, z: 0 }, // the stump centre (same as key 1)
    dist: 5, // matches bowling-analysis (closer → zoomed in a little)
    up: [0, 1, 0],
    duration: 1.8,
  },

  // 4 — Front: SAME start-from-stopped, HELD-fov (no zoom) transition as key 1,
  // settling at the FRONT / bowler's end (+Z), looking back down the pitch at the
  // stumps. The stopped broadcast cam is already on the +Z side, so a straight dolly
  // doesn't cross the stumps → no arc needed. Higher eye (y=1.6) so it comes down from
  // the far cam and settles a little UP looking down at the stumps.
  front: {
    mode: "direct",
    fromCurrent: true,
    // Straight dolly (Option B feel) for every start EXCEPT 3→4: buildTween applies
    // the sideways swing ONLY when the move involves "behind", so a from-behind press
    // swings AROUND the stumps (no flip/collapse) while all other presses stay a
    // perfectly straight line. up: 0 → no vertical hump either way.
    arc: { side: 30, up: 8 }, // matches bowling-analysis (swing-around; was up:0)
    target: { x: -0.03 , y: 4, z: 1 }, // direction: front/bowler's end (+Z); eye height 4 (matches bowling-analysis)
    look: { x: 0, y: 0.35, z: 0 }, // the stump centre (same as key 1)
    dist: 15, // matches bowling-analysis (pushed back a little)
    fov: 13, // key 4 only: tighter lens (reduced from the shared 30) → zoomed in
    up: [0, 1, 0],
    duration: 1.5,
  },

  // 5 — Tour: straight glide to an elevated 3/4 broadcast hero angle over the ball.
  // No zoom-out, fast. maxTravel caps the fly-in.
  tour: {
    mode: "direct",
    target: { x: 3, y: 2.2, z: 3.5 },
    up: [0, 1, 0],
    fov: 42,
    duration: 1.2,
    maxTravel: 8,
  },

  // OUTSIDE LEG — the auto "zoom to the bounce" beat (not a number key; triggered when
  // the ball pitches outside leg). Same start-from-stopped, HELD-fov (no zoom) style as
  // key 2, but CENTRED on the ball (bounce point) and tighter. overhead → straight above
  // the ball, looking down; height from frameFill so it's framed consistently. up eases
  // to the pitch axis so the strip stays vertical and never rolls.
  topDirectClose: {
    mode: "direct",
    fromCurrent: true,
    overhead: true,
    target: { x: "ball", y: 2, z: "ball" }, // overhead — height comes from frameFill
    // Centre offset is handedness-dynamic: RHB ball comes right → +0.3; LHB ball comes
    // left → −0.4. buildTween picks by the batsman's hand (operatorInput.isRightHanded).
    look: { x: { right: 0.3, left: -0.4 }, y: 0, z: "ball" },
    frameSubject: 2, // tight — just the bounce area (m)
    frameFill: 2, // higher = closer/bigger bounce
    up: [0, 0, -1],
    duration: 1.3,
  },
};
