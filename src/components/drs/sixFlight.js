import * as THREE from "three";

// Shared live state for the 6-Highlights broadcast camera. BattingTrajectory
// (the six renderer) publishes the shot geometry + the live ball each frame;
// SixHighlightCamera reads it and drives the camera. A plain mutable module (not
// Redux) so the per-frame updates are free. `shotId` = the trajectory URL, so the
// camera recomputes (and re-chooses its side) only when a NEW shot loads.
export const sixFlight = {
  active: false, // true while a six highlight is playing
  shotId: null, // trajectory URL of the current shot
  start: new THREE.Vector3(), // bat-contact point (impact)
  land: new THREE.Vector3(), // landing point
  H: 0, // max height of the arc (m)
  T: 0, // hang time, contact → land (s)
  live: new THREE.Vector3(), // current ball world position
  t: -1, // seconds since bat contact (−1 before contact)
  landed: false, // true once the ball has landed
  apex: new THREE.Vector3(), // highest point of the arc
  tApex: 0, // seconds from contact to the apex
  dir: new THREE.Vector3(0, 0, 1), // flat unit direction of the shot
  arc: [], // post-impact arc points (Vector3[], start→land) for the fill + black outline
};

export function resetSixFlight() {
  sixFlight.active = false;
  sixFlight.shotId = null;
  sixFlight.t = -1;
  sixFlight.landed = false;
}
