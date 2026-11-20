// Distinct per-ball tube colors (multi view only). Each delivery gets one solid
// color across its whole trajectory; cycles if there are more balls. Shared by
// the 3D tubes (MultiBowlingTrajectory) and the ticker swatch (MultiTicker) so
// they stay in sync.
export const BALL_COLORS = [
  0xfd3c3c, // ball 1 — red
  0x4265ff, // ball 2 — blue
  0xd042ff, // ball 3 — purple
  0x089800, // ball 4 — green
  0x9a3e00, // ball 5 — brown
  0xbc9600, // ball 6 — gold
];

// StanceBeam brand gold (logo accent).
export const STANCEBEAM_GOLD = 0xf5a623;

// Pitch-map dot colors by delivery outcome (Dot / Runs / Boundary / Wicket).
// ONE source of truth — the 3D dots, the glow, the ticker chips, the legend and
// the operator's glow toggles all use this broadcast scheme, so they always agree.
export const PITCH_OUTCOME = {
  dot: 0x38bdf8, // blue  — dot ball (0 runs)
  runs: 0x22c55e, // green — 1-3 runs
  boundary: 0xfbbf24, // gold  — four / six
  wicket: 0xf43f5e, // red   — wicket
};

// Map a delivery's runs/wicket to its pitch-map dot color.
export function outcomeColor(runs, isWicket) {
  if (isWicket) return PITCH_OUTCOME.wicket;
  if (!runs) return PITCH_OUTCOME.dot; // 0 or missing → dot ball
  if (runs >= 4) return PITCH_OUTCOME.boundary; // four / six
  return PITCH_OUTCOME.runs; // 1-3 (and 5)
}

// Stump/pitch-map SOLID-BALL scheme (hex) — the broadcast legend colours:
//   dot 0 → grey · 1-3 → green · four → blue · six → red · wicket → yellow.
// One source of truth for the StumpMap balls, the pitch-map dots and the
// PitchMapOverlay legend, so they always agree.
export function ballColorHex(runs, isWicket) {
  if (isWicket) return "#FFD000";
  const r = Number(runs) || 0;
  if (r >= 6) return "#FF0004";
  if (r >= 4) return "#0866B2";
  if (r >= 1) return "#089800";
  return "#B9B9B9";
}

// Legend rows for the pitch-map ticker.
export const PITCH_LEGEND = [
  { color: PITCH_OUTCOME.dot, label: "Dot Balls" },
  { color: PITCH_OUTCOME.runs, label: "Runs" },
  { color: PITCH_OUTCOME.boundary, label: "Boundaries" },
  { color: PITCH_OUTCOME.wicket, label: "Wicket" },
];

// Outcome CATEGORY of a delivery — matches the ballColorHex thresholds exactly. Used to
// (a) filter which balls plot + which legend swatches show, via the operator's category
// checkboxes, and (b) key the shared OUTCOME_LEGEND below.
export function ballCategory(runs, isWicket) {
  if (isWicket) return "wicket";
  const r = Number(runs) || 0;
  if (r >= 6) return "six";
  if (r >= 4) return "four";
  if (r >= 1) return "runs";
  return "dot";
}

// ONE legend (key + label + colour) shared by the pitch by-ball ticker, the stump ticker and
// the operator's category checkboxes, so the swatches, the balls and the toggles all agree.
export const OUTCOME_LEGEND = [
  { key: "dot", label: "DOTS", color: "#B9B9B9" },
  { key: "runs", label: "RUNS", color: "#089800" },
  { key: "four", label: "FOURS", color: "#0866B2" },
  { key: "six", label: "SIXES", color: "#FF0004" },
  { key: "wicket", label: "WICKETS", color: "#FFD000" },
];
