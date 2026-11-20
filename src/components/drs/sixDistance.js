// Screen-space data for the 6-Highlights DISTANCE graphic. SixLabels (inside the Canvas)
// projects the ground line's two endpoints to screen pixels and publishes them here each
// frame; SixDistanceOverlay (a 2D overlay outside the Canvas) reads this via a rAF loop
// and draws the broken white line + the centred "DISTANCE 92 m" label in ONE coordinate
// space, so the gap lines up with the text exactly. Plain module (no Redux) → free writes.
export const sixDistance = {
  visible: false,
  ax: 0, // launch point → screen px
  ay: 0,
  bx: 0, // landing point → screen px
  by: 0,
  value: 0, // metres (counts up to the real distance)
  // Max-height vertical line (apex → ground below it) in screen px. Drawn as a crisp 2px
  // white SVG line (same as the distance line) so it never thins out / disappears.
  hVisible: false,
  hx1: 0,
  hy1: 0, // apex (top)
  hx2: 0,
  hy2: 0, // ground below apex (bottom)
  // Launch-angle label anchor = the SCREEN centroid of the wedge fan's triangle, so the
  // label always sits inside the visible white fan for every ball.
  angVisible: false,
  angx: 0,
  angy: 0,
};

// Reset all six-distance screen graphics (distance line, height line, launch-angle anchor)
// — call when leaving/entering a module so stale lines never carry across a switch.
export function resetSixDistance() {
  sixDistance.visible = false;
  sixDistance.hVisible = false;
  sixDistance.angVisible = false;
  sixDistance.value = 0;
}
