// Bowler-type pitch-length zone sets for the pitch map. ONE source of truth that drives the
// coloured pitch bands, their labels, the length-distribution % buckets AND the right-side
// chips — so switching bowler type re-colours/re-labels/re-buckets everything consistently.
//
// Distances are METRES from the BATTER'S stumps (scene z = 0; +z toward the bowler). A full
// toss / yorker pitches NEAREST the batter (small z); short / bouncer pitch further out.
// `to` of the last zone is the pitch far cap (~20.26 m = the GLB pitch length).
//
// Add more sets here (e.g. red-ball) — the UI selector + renderer pick them up automatically.

const PITCH_FAR = 20.26; // far end of the pitch strip (m from the batter's stumps)

export const PITCH_ZONE_SETS = {
  // Per-zone label position + size (all OPTIONAL — defaults: labelX −1.0, labelZ = band
  // middle, labelSize 0.2):
  //   labelX    → label X across the pitch (− = left of centre, + = right)
  //   labelZ    → label position DOWN the pitch (m from the batter's stumps)
  //   labelSize → label font size (m)
  seamers: {
    label: "Seamers",
    zones: [
      {
        name: "FULL TOSS",
        from: 0.0,
        to: 0.9,
        color: "#00FF00",
        opacity: 0.4,
        textColor: "#0a5a00",
        labelX: -1.25,
        labelZ: 0.75,
        labelSize: 0.18,
      },
      {
        name: "YORKER",
        from: 0.9,
        to: 2.8,
        color: "#f7f755",
        opacity: 0.8,
        textColor: "#8a7a00",
        labelX: -1.2,
        labelZ: 2,
        labelSize: 0.18,
      },
      {
        name: "THE SLOT",
        from: 2.8,
        to: 5.9,
        color: "#FFA500",
        opacity: 0.45,
        textColor: "#8a5a00",
        labelX: -1.25,
        labelZ: 4.65,
        labelSize: 0.18,
      },
      {
        name: "LENGTH",
        from: 5.9,
        to: 8.0,
        color: "#FF4500",
        opacity: 0.45,
        textColor: "#8a2400",
        labelX: -1.2,
        labelZ: 6.95,
        labelSize: 0.18,
      },
      {
        name: "SHORT",
        from: 8.0,
        to: 10.0,
        color: "#800080",
        opacity: 0.35,
        textColor: "#4d004d",
        labelX: -1.25,
        labelZ: 9.0,
        labelSize: 0.18,
      },
      {
        name: "BOUNCER",
        from: 10.0,
        to: PITCH_FAR,
        color: "#9E9E9E",
        opacity: 0.45,
        textColor: "#444444",
        labelX: -1.12,
        labelZ: 11.0,
        labelSize: 0.18,
        chipZ: 10.7, // pin the % up to the label depth (not the far mid-point z~15)
      },
    ],
  },
  spinners: {
    label: "Spinners",
    zones: [
      {
        name: "FULL",
        from: 0.9,
        to: 2.8,
        color: "#00FF00",
        opacity: 0.4,
        textColor: "#0a5a00",
        labelX: -1.25,
        labelZ: 2.1,
        labelSize: 0.18,
      },
      {
        name: "OVER PITCHED",
        from: 2.8,
        to: 4.4,
        color: "#FFFF00",
        opacity: 0.4,
        textColor: "#8a7a00",
        labelX: -1.1,
        labelZ: 3.8,
        labelSize: 0.18,
      },
      {
        name: "GOOD LENGTH",
        from: 4.4,
        to: 6.2,
        color: "#FFA500",
        opacity: 0.45,
        textColor: "#8a5a00",
        labelX: -1.1,
        labelZ: 5.45,
        labelSize: 0.18,
      },
      {
        name: "SHORT",
        from: 6.2,
        to: PITCH_FAR,
        color: "#800080",
        opacity: 0.45,
        textColor: "#4d004d",
        labelX: -1.19,
        labelZ: 8.0,
        labelSize: 0.18,
        chipZ: 7.5, // pin the % up to the label depth (not the far mid-point z~13)
      },
    ],
  },
};

export const DEFAULT_BOWLER_TYPE = "seamers";

// Classify a bounce distance (m from the batter's stumps) into a zone INDEX of the given set.
export function zoneIndexFor(setKey, z) {
  const zones = (PITCH_ZONE_SETS[setKey] || PITCH_ZONE_SETS[DEFAULT_BOWLER_TYPE]).zones;
  for (let i = 0; i < zones.length; i++) {
    if (z < zones[i].to) return i;
  }
  return zones.length - 1;
}
