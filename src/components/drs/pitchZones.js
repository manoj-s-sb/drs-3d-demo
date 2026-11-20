// Screen-space anchors (px) for the LENGTH-DISTRIBUTION chips, published every frame by
// MultiPitchMap (inside the Canvas, where the camera lives) and read by PitchMapOverlay
// (a 2D overlay outside the Canvas) via a rAF loop. Each chip rides its band's RIGHT edge at
// the band's mid-length, in ANY camera view. Now DYNAMIC: one entry per zone of the active
// bowler-type set (drs/pitchZoneSets.js), so 6 (seamers) or 4 (spinners) chips are supported.
export const pitchZones = {
  visible: false,
  anchors: [], // [{ x, y }] one per active zone, index-aligned to the set's zones
  distAnchors: [], // [{ x, y }] one per DIST_MARKERS entry (left-edge metre markers)
};

// World X of the chip anchor — just outside the right edge of the pitch so chips hug it.
export const PITCH_ZONE_ANCHOR_X = 2;
// World X for the LEFT-edge metre markers (just outside the pitch's left edge).
export const PITCH_MARKER_ANCHOR_X = -2;

// Distance markers down the left edge — metres from the batter's stumps (z). STUMPS = z 0.
export const DIST_MARKERS = [
  { label: "STUMPS", z: 0 },
  { label: "2M", z: 2 },
  { label: "4M", z: 4 },
  { label: "6M", z: 6 },
  { label: "8M", z: 8 },
  { label: "10M", z: 10 },
];

// Markers for the active bowler type. Spinners pitch shorter, so drop the 10M marker (not
// needed) — seamers keep the full set. Both MultiPitchMap (publishing the anchors) and
// PitchMapOverlay (rendering) must call this so the lists stay index-aligned.
export function markersFor(bowlerType) {
  return bowlerType === "spinners"
    ? DIST_MARKERS.filter((m) => m.label !== "10M")
    : DIST_MARKERS;
}
