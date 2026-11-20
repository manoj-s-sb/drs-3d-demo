import { useSelector } from "react-redux";
import { FONT } from "./tickerStyle";
import { isBroadcast } from "../../viewMode";
import { OUTCOME_LEGEND } from "./ballColors";

// ─────────────────────────────────────────────────────────────────────────────
// Stump-map lower-third:
//   • Blue header → bowler name (from the score API; "BOWLER" fallback)
//   • White card  → OUTCOME COLOUR LEGEND (Dots · Runs · Fours · Sixes · Wickets),
//                   matching the beehive ball colours. (Overs/Maidens/Runs/Economy
//                   figures were removed — the legend explains the colours instead.)
// ─────────────────────────────────────────────────────────────────────────────

// Legend = the shared OUTCOME_LEGEND (dot grey · runs green · four blue · six red · wicket
// yellow), filtered to the categories the operator enabled (ballCategories).

export default function StumpTicker() {
  const active = useSelector((s) => s.session.stumpMapActive);
  const points = useSelector((s) => s.session.stumpMapPoints);
  const hideTicker = useSelector((s) => s.session.hideTicker);
  const hideBowler = useSelector((s) => s.session.hideBowler);
  const compact = useSelector((s) => s.session.compact); // PiP → small fixed fonts
  // Operator/filter-driven bowler name (blue header). Empty → keep it EMPTY (no API fallback,
  // no "BOWLER" placeholder) → the header is hidden, only the legend card shows.
  const stumpBowlerName = useSelector((s) => s.session.stumpBowlerName);
  const ballCategories = useSelector((s) => s.session.ballCategories);

  if (hideTicker) return null;
  if (!active || !points?.length) return null;

  // Only the operator-enabled categories appear in the legend.
  const legend = OUTCOME_LEGEND.filter((l) => ballCategories[l.key] !== false);

  // Header = ONLY the operator/filter bowler name; empty → no header (kept empty).
  const headerLabel = (stumpBowlerName || "").trim();

  return (
    <div
      className={`st-wrap${compact ? " st-compact" : ""}${
        isBroadcast && !compact ? " st-broadcast" : ""
      }`}
    >
      <style>{STYLE}</style>
      <div className="st-stack">
        {/* Blue header: bowler name (centred) — hidden by the "Hide bowler container" toggle,
            and also when there's no name (kept empty). */}
        {!hideBowler && headerLabel && (
          <div className="st-head">
            <span className="st-name">{headerLabel}</span>
          </div>
        )}
        {/* White card: outcome colour legend */}
        <div className="st-card">
          {legend.map((l) => (
            <div key={l.label} className="st-leg">
              <span className="st-swatch" style={{ background: l.color }} />
              <span className="st-leg-label">{l.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Styled to MATCH the pitch-map by-ball legend (PitchMapOverlay): same gap, font sizes,
// the inset "ball" shadow on the swatches, and the blue bowler pill. Bottom-left placement.
const STYLE = `
.st-wrap{position:fixed;left:0;bottom:0;width:100%;z-index:9999990;
  display:flex;justify-content:flex-start;align-items:flex-end;
  padding:0 0 4% 8%;  /* bottom 4% / left 8% → moved down a little more */
  pointer-events:none;font-family:${FONT}}
.st-stack{position:relative;pointer-events:auto;
  animation:stIn .6s cubic-bezier(.16,1,.3,1) both}
@keyframes stIn{from{transform:translateY(16%);opacity:0}to{transform:translateY(0);opacity:1}}

/* Blue bowler container — SAME style as the bowling-analysis ticker (solid #0866B2 with
   dark side borders), sits just above the legend card. */
.st-head{position:absolute;bottom:calc(100% - 0.5em);left:0.2em;
  background:#0866B2;
  border-left:0.28em solid #002F7F;border-right:0.28em solid #002F7F;
  padding:0.5em 1.4em;border-radius:0.55em;
  box-shadow:0 6px 18px rgba(0,0,0,0.4);white-space:nowrap}
/* Bowler name — reduced further. */
.st-name{color:#fff;font-weight:700;font-size:clamp(12px,0.85vw,17px);
  letter-spacing:0.04em;text-transform:uppercase;line-height:1}

/* Legend card — identical to the pitch-map legend. */
.st-card{display:flex;gap:clamp(10px,1vw,20px);
  background:#fff;border-radius:0.7em;
  padding:1.05em 1.5em 0.9em;box-shadow:0 3px 14px rgba(0,0,0,0.4)}
.st-leg{display:flex;flex-direction:column;align-items:center;gap:0.35em}
.st-swatch{width:clamp(18px,1.5vw,30px);height:clamp(18px,1.5vw,30px);
  border-radius:50%;box-shadow:inset 0 -2px 4px rgba(0,0,0,0.25);
  border:1px solid rgba(0,0,0,0.15)}  /* ring so the white DOTS swatch is visible on the card */
.st-leg-label{color:#223;font-weight:700;font-size:clamp(8px,0.6vw,12px);
  letter-spacing:0.03em;line-height:1;white-space:nowrap}

/* Compact PiP: smaller + tighter so it fits the narrow window. */
.st-compact{padding:0 0 6% 5%}
.st-compact .st-name{font-size:11px}
.st-compact .st-head{padding:4px 10px;border-radius:6px}
.st-compact .st-card{gap:10px;padding:9px 12px 7px;border-radius:7px}
.st-compact .st-swatch{width:14px;height:14px}
.st-compact .st-leg-label{font-size:8px}
`;
