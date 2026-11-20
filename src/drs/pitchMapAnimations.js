// Pitch-map camera config + the crane-over transition between its two views.
//
// ONE camera moves between two poses (no camera switching → no hard cut). Both
// views keep the SAME orientation: the batter's end is always at the TOP of the
// screen, the bowler's end at the bottom. MultiPitchMap.jsx reads this.
//
// Scene: batter's stumps at the world origin (z = 0); +Z points toward the bowler,
// so the bowler's stumps are at z = pitchLen. Distances are scene metres.
//
// These numbers match the broadcast Hawk-Eye reference exactly (long-lens PERSPECTIVE,
// NOT orthographic): a tight FOV from far back flattens the perspective so near and far
// balls read nearly the same size, as on TV. Radii are the auto-fit distances the
// reference lands on at 1920×1080.

export const PITCH_MAP_CAMERA = {
  // ── VIEW 1 — HAWK-EYE (bowler's end) ─────────────────────────────────────────
  // High behind the bowler on a long lens, looking down the pitch at the batter's
  // landing zone. Target (0, 0, 5.4), 13.96° elevation, 24.8 m back → pos (0, 5.99,
  // 29.49), FOV 10.5° — the exact broadcast pose.
  bowlerEnd: {
    fov: 9.5, // long lens → flat, TV perspective (reduced by 2)
    lookZ: 9, // aim point down the pitch (m from batter stumps)
    lookHeight: 0, // aim at the pitch surface
    elevationDeg: 13.96, // gentle downward angle
    radius: 27, // camera distance — moved a little further back
  },

  // ── VIEW 2 — TOP ─────────────────────────────────────────────────────────────
  // Almost straight down over the batter's half (centre z = 6.6, framing z −0.6 →
  // 13.8). 89.6° (not 90°) leaves a hair of tilt so the orientation can't gimbal-flip.
  // Target (0, 0, 6.6), 33.8 m up → pos (0, 33.77, 6.83), FOV 24°.
  top: {
    fov: 24,
    lookZ: 6.6, // centre of the batter's half
    lookHeight: 0,
    tiltDeg: 89.6, // elevation angle (90 = dead overhead)
    radius: 33.8, // camera distance (fit at 1920×1080)
  },

  moveDuration: 2.0, // seconds for the crane-over orbit (ease in/out)
  entryDuration: 1.6, // seconds to ease from the hand-off pose into View 1 on entry

  // ── PiP (broadcast portrait window) — SEPARATE camera values ─────────────────
  // The full-screen values above are tuned for 16:9. The PiP is a narrow/portrait window,
  // so it gets its OWN complete set of camera settings (fov / elevation / distance / aim),
  // edited independently here. Used ONLY when the frame is narrower than 16:9; the
  // full-screen view never reads these. Tune these freely for the PiP.
  pip: {
    bowlerEnd: {
      fov: 14, // PiP lens — reduced (tighter) vs the auto-widened default
      lookZ: 5,
      lookHeight: 0,
      elevationDeg: 23.96,
      radius: 25, // closer to the pitch (moved forward) for the narrow window
    },
    top: {
      // Same overhead ANGLE as full screen (tilt 89.6, aim z 6.6), just pulled back + a hair
      // wider so the SHORT band stays in the narrow PiP frame.
      fov: 26,
      lookZ: 6.6,
      lookHeight: 0,
      tiltDeg: 89.6,
      radius: 36,
    },
  },
};

// Smooth ease for every pitch-map move. easeInOutCubic — calm, premium feel: slow
// start, quicker middle, soft landing (no snap).
export const easeInOut = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
