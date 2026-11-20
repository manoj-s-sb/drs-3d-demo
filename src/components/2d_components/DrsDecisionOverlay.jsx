import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { getConfig } from "../../drs/drsConfig";

// Design palette (from the Figma handoff).
const BLUE = "#0866B2"; // title bar
const GREEN = "#2CBD00"; // positive / good-for-batsman value
const RED = "#FF0004"; // negative / bad-for-batsman value
const YELLOW = "#E6B800"; // umpire's call (any panel)
const NEUTRAL = "#4A5568"; // only when there is no value yet

// Values that turn the value bar RED (bad for the batsman). Everything else with a
// real value goes GREEN, except UMPIRES_CALL which is YELLOW in every panel:
//   Pitching / Impact: IN LINE → red, else green (Pitching OUTSIDE OFF → red too)
//   Wickets:           HITTING → red (MISSING → green)
//   Original / Final / Player Review: OUT / UNSUCCESSFUL → red (NOT OUT / SUCCESSFUL → green)
const RED_VALUES = new Set(["IN_LINE", "HITTING", "OUT", "UNSUCCESSFUL"]);
// Per-panel extras: pitching outside off doesn't save the batsman, so it's red there
// (impact outside off stays green).
const RED_VALUES_BY_FIELD = { pitching: new Set(["OUTSIDE_OFF"]) };

// Display text for raw values that need more than "_" → " ".
const VALUE_TEXT = { UMPIRES_CALL: "UMPIRE'S CALL" };

const LABELS = {
  pitching: "Pitching",
  impact: "Impact",
  wickets: "Wickets",
  height: "Height",
  originalDecision: "Original Decision",
  finalDecision: "Final Decision",
  playerReview: "Player Review",
};

// Player Review renders as a SINGLE blue status pill (no title bar). Its raw value
// maps to the broadcast term shown on the pill.
const REVIEW_STATUS_TEXT = {
  UNSUCCESSFUL: "Review Lost",
  SUCCESSFUL: "Review Retained",
};

// Order in which the post-trajectory boxes reveal, each
// DECISION_REVEAL_INTERVAL_MS apart (index 0 = t=0 when phase→review).
const POST_TRAJECTORY_ORDER = ["wickets", "finalDecision", "playerReview"];

function colorFor(value, fieldKey) {
  if (value == null || value === "") return NEUTRAL; // no value yet
  const v = String(value).toUpperCase().replace(/\s+/g, "_");
  if (v === "UMPIRES_CALL") return YELLOW;
  const red = RED_VALUES.has(v) || RED_VALUES_BY_FIELD[fieldKey]?.has(v);
  return red ? RED : GREEN; // red if bad, else green
}

function formatValue(value) {
  if (value == null) return "—";
  const v = String(value);
  return VALUE_TEXT[v.toUpperCase().replace(/\s+/g, "_")] ?? v.replace(/_/g, " ");
}

const FONT = '"DejaVu Sans", sans-serif';

// Every dimension is AUTHORED at the 1920×1080 reference frame, then expressed in
// `cqw` so the WHOLE overlay scales WITH the frame. 1cqw = 1% of the frame width
// (the overlay root sets `container-type: size`), so at 1920 these resolve to the
// EXACT spec px (24px text, 240px card, …); in the smaller operator preview they
// scale down proportionally instead of looking oversized. See the root <div> below.
const ref = (n) => `${((n / 1920) * 100).toFixed(4)}cqw`;

// Font size that scales with the frame (cqw) but is CLAMPED between a px floor and a
// px ceiling: clamp(min, preferred@1920, max). The preferred resolves to `max` at the
// 1920 reference, so the frame can only scale it DOWN to `min` on a squeezed screen
// and never past `max` on a bigger one.
//   title/header: 12 → 16 · value: 16 → 20
const clampFont = (min, max) => `clamp(${min}px, ${ref(max)}, ${max}px)`;

// Card side padding @1920. The card width is NOT fixed — it HUGS its content
// (widest of the title / value line) plus this padding, so short panels stay compact
// and long ones (e.g. ORIGINAL DECISION) grow to stay on one line. Same rule for ALL
// cards. 12px vertical / 56px horizontal, scaled with the frame via ref().
const PAD_Y = 12;
const PAD_X = 56;

// Flat rounded card: a blue title bar stacked directly on a red/green value bar.
// Each bar carries its OWN radius (top on the title, bottom on the value) instead of
// clipping via the parent — so the blue stroke follows the rounded corners at full
// thickness (no thinning at the curve). Width = content + padding (adapts).
function Box({ fieldKey, value, visible, compact = false }) {
  // Smaller fonts in the PiP window (title 10–12, value 12–14) vs the big screen.
  const titleFont = compact ? clampFont(10, 12) : clampFont(12, 16);
  const valueFont = compact ? clampFont(12, 14) : clampFont(16, 20);
  const color = colorFor(value, fieldKey);
  return (
    <div
      style={{
        // Fill the column's width (the column is sized to its widest card and stretches
        // every card to match), so all cards in a column share identical edges.
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        opacity: visible ? 1 : 0,
        transition: `opacity ${getConfig("DECISION_FADE_MS")}ms ease-out`,
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      {/* Title bar — blue, 20px @1920 (rounded top corners) */}
      <div
        style={{
          width: "100%",
          background: BLUE,
          padding: `${ref(PAD_Y)} ${ref(PAD_X)}`,
          borderTopLeftRadius: ref(12),
          borderTopRightRadius: ref(12),
        }}
      >
        <p
          style={{
            margin: 0,
            color: "#FFF",
            textAlign: "center",
            fontFamily: FONT,
            fontSize: titleFont, // big screen 12–16 · PiP 10–12
            fontWeight: 700,
            letterSpacing: ref(0.2),
            textTransform: "uppercase",
          }}
        >
          {LABELS[fieldKey] ?? fieldKey}
        </p>
      </div>
      {/* Value bar — red/green, 24px @1920. Blue stroke wraps ONLY this bar (left /
          right / bottom); no top border so it blends into the blue title above. */}
      <div
        style={{
          width: "100%",
          background: color,
          padding: `${ref(PAD_Y)} ${ref(PAD_X)}`,
          borderLeft: `${ref(3)} solid ${BLUE}`,
          borderRight: `${ref(3)} solid ${BLUE}`,
          borderBottom: `${ref(3)} solid ${BLUE}`,
          borderBottomLeftRadius: ref(12),
          borderBottomRightRadius: ref(12),
        }}
      >
        <p
          style={{
            margin: 0,
            color: "#FFF",
            textAlign: "center",
            fontFamily: FONT,
            fontSize: valueFont, // big screen 16–20 · PiP 12–14
            fontWeight: 700,
            letterSpacing: ref(0.24),
            textTransform: "uppercase",
          }}
        >
          {formatValue(value)}
        </p>
      </div>
    </div>
  );
}

// Single blue status pill (no title bar) — used for Player Review ("REVIEW LOST" /
// "REVIEW RETAINED"). Same 240px/radius/24px card shape, one bar only.
function StatusBar({ value, visible, compact = false }) {
  const v = String(value ?? "").toUpperCase();
  const text = REVIEW_STATUS_TEXT[v] ?? formatValue(value);
  return (
    <div
      style={{
        width: "100%",
        background: BLUE,
        borderRadius: ref(12),
        padding: `${ref(PAD_Y)} ${ref(PAD_X)}`,
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        opacity: visible ? 1 : 0,
        transition: `opacity ${getConfig("DECISION_FADE_MS")}ms ease-out`,
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      <p
        style={{
          margin: 0,
          color: "#FFF",
          textAlign: "center",
          fontFamily: FONT,
          fontSize: compact ? clampFont(12, 14) : clampFont(16, 20), // PiP 12–14
          fontWeight: 700,
          letterSpacing: ref(0.24),
          textTransform: "uppercase",
        }}
      >
        {text}
      </p>
    </div>
  );
}

// Default columns if a ball has no reviewPlan (safety net).
const DEFAULT_LEFT = ["pitching", "impact", "wickets"];
const DEFAULT_RIGHT = ["originalDecision", "finalDecision", "playerReview"];

// Panels rendered as a single blue status pill (StatusBar) instead of a title+value card.
const STATUS_PANELS = new Set(["playerReview"]);

// FIXED home for every panel: grid column (1 = left, 3 = right) + row (1 = top …
// 3 = bottom). The grid ALWAYS reserves all six slots, so a removed/absent panel
// leaves its place EMPTY and nothing else moves. Rows are SHARED across the two
// columns → guaranteed row alignment:
//   row1  WICKETS ↔ ORIGINAL DECISION
//   row2  IMPACT  ↔ FINAL DECISION
//   row3  PITCHING ↔ PLAYER REVIEW
// (Left reveals bottom-up with the trajectory: pitching=row3 first, then impact, then
// wickets — the fixed rows keep each in place as it fades in.)
const SLOTS = [
  { key: "wickets", col: 1, row: 1 },
  { key: "impact", col: 1, row: 2 },
  { key: "pitching", col: 1, row: 3 },
  { key: "originalDecision", col: 3, row: 1 },
  { key: "finalDecision", col: 3, row: 2 },
  { key: "playerReview", col: 3, row: 3 },
];

export default function DrsDecisionOverlay() {
  const { active, phase, selectedDecision, markers, reviewPlan } = useSelector(
    (s) => s.drs,
  );
  // Small PiP window → a compact corner layout (see the compact branch below).
  const compact = useSelector((s) => s.session.compact);

  // Stagger flags for the post-trajectory boxes. When phase becomes "review"
  // we schedule them at index * DECISION_REVEAL_INTERVAL_MS.
  const [postRevealed, setPostRevealed] = useState({
    wickets: false,
    finalDecision: false,
    playerReview: false,
  });

  useEffect(() => {
    if (phase !== "review") {
      setPostRevealed({
        wickets: false,
        finalDecision: false,
        playerReview: false,
      });
      return;
    }
    const timers = POST_TRAJECTORY_ORDER.map((key, i) =>
      setTimeout(() => {
        setPostRevealed((prev) => ({ ...prev, [key]: true }));
      }, i * getConfig("DECISION_REVEAL_INTERVAL_MS")),
    );
    return () => timers.forEach(clearTimeout);
  }, [phase]);

  // Mount as soon as the operator has submitted so the first fade-in actually
  // transitions from opacity 0 → 1.
  if (!active || !selectedDecision) return null;

  // Which panels this ball shows (union of the plan's two sides). A panel NOT in this
  // set still keeps its fixed slot — it's just reserved empty (never moves the rest).
  const present = new Set([
    ...(reviewPlan?.panelsLeft ?? DEFAULT_LEFT),
    ...(reviewPlan?.panelsRight ?? DEFAULT_RIGHT),
  ]);
  // Outside-leg (no trajectory): the Pitching panel appears with the top-down
  // camera move (review), not during the video.
  const pitchAtReview = reviewPlan?.trajectory === "none";

  // The value each panel shows.
  const valueFor = (k) => selectedDecision[k];

  // When each panel becomes visible.
  const visibleFor = (k) => {
    switch (k) {
      case "originalDecision":
        return true; // on-field call, from the start
      case "pitching":
        return pitchAtReview ? phase === "review" : !!markers?.pitching;
      case "impact":
        return !!markers?.impact;
      case "wickets":
      case "height":
        return postRevealed.wickets;
      case "finalDecision":
        return postRevealed.finalDecision;
      case "playerReview":
        return postRevealed.playerReview;
      default:
        return true;
    }
  };

  const renderPanel = (k, show) =>
    STATUS_PANELS.has(k) ? (
      <StatusBar key={k} value={valueFor(k)} visible={show} compact={compact} />
    ) : (
      <Box key={k} fieldKey={k} value={valueFor(k)} visible={show} compact={compact} />
    );
  const vis = (k) => present.has(k) && visibleFor(k);

  // ── COMPACT / PiP layout ─────────────────────────────────────────────────────
  // Small portrait window: REVIEW LOST top-right · WICKETS/IMPACT/PITCHING bottom-left
  // (bottom-up) · ORIGINAL (+ FINAL) bottom-right. Panels keep their normal look (cqw-
  // sized → small here); only the arrangement changes. Absent panels just don't render.
  if (compact) {
    const GAP = ref(44); // gap between stacked panels
    const EDGE = "4%"; // margin from the window edges
    return (
      <div
        className="absolute inset-0 !pointer-events-none"
        style={{ containerType: "size" }}
      >
        {/* REVIEW LOST / RETAINED — top-right. Shown whenever this ball HAS a review
            value (independent of the plan's panelsRight, which some plans omit), once
            the review is on screen. */}
        {valueFor("playerReview") != null && (
          <div style={{ position: "absolute", top: EDGE, right: EDGE }}>
            {renderPanel("playerReview", phase === "review")}
          </div>
        )}
        {/* WICKETS / IMPACT / PITCHING — bottom-left, built bottom-up */}
        <div
          style={{
            position: "absolute",
            left: EDGE,
            bottom: EDGE,
            display: "flex",
            flexDirection: "column-reverse",
            alignItems: "flex-start",
            gap: GAP,
          }}
        >
          {renderPanel("pitching", vis("pitching"))}
          {renderPanel("impact", vis("impact"))}
          {renderPanel("wickets", vis("wickets"))}
        </div>
        {/* ORIGINAL (+ FINAL) DECISION — bottom-right, built bottom-up */}
        <div
          style={{
            position: "absolute",
            right: EDGE,
            bottom: EDGE,
            display: "flex",
            flexDirection: "column-reverse",
            alignItems: "flex-end",
            gap: GAP,
          }}
        >
          {renderPanel("originalDecision", vis("originalDecision"))}
          {vis("finalDecision") && renderPanel("finalDecision", true)}
        </div>
      </div>
    );
  }

  // Align to the 80% broadcast SAFE ZONE: 10% margin on every side (192px L/R,
  // 108px T/B at 1920×1080). Percentage insets → scales to ANY monitor/resolution,
  // so the panels can never be clipped by overscan. top/bottom % are relative to the
  // frame height, left/right % to its width → exactly the (192,108)→(1728,972) box.
  return (
    // Full-frame wrapper = the SIZE CONTAINER: `container-type: size` makes 1cqw =
    // 1% of the frame width, so every ref()'d dimension inside scales with the frame
    // (exact spec px at 1920, proportionally smaller in the preview).
    <div
      className="absolute inset-0 !pointer-events-none"
      style={{ containerType: "size" }}
    >
      {/* FIXED 3-row grid. Columns: left panels | spacer | right panels. Rows are
          SHARED so paired panels sit on the same line, and every slot is always
          present → removing a panel leaves its place empty, nothing else moves.
          alignContent:center keeps the block vertically centred in the safe zone. */}
      <div
        className="absolute"
        style={{
          top: "10%",
          bottom: "10%",
          left: "10%",
          right: "10%",
          display: "grid",
          gridTemplateColumns: "max-content 1fr max-content",
          gridTemplateRows: "repeat(3, auto)",
          rowGap: ref(100),
          alignContent: "center",
          // Don't stretch cells to the row height — each panel keeps its NATURAL height
          // (so the single-bar Review Lost pill isn't blown up to match the taller
          // two-bar card beside it). Pairs align at the top of their shared row.
          alignItems: "start",
        }}
      >
        {SLOTS.map(({ key, col, row }) => {
          const show = present.has(key) && visibleFor(key);
          return (
            <div key={key} style={{ gridColumn: col, gridRow: row, display: "flex" }}>
              {STATUS_PANELS.has(key) ? (
                <StatusBar value={valueFor(key)} visible={show} />
              ) : (
                <Box fieldKey={key} value={valueFor(key)} visible={show} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
