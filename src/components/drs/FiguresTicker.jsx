import { ref, FONT, clampFont } from "./tickerStyle";
import { isBroadcast } from "../../viewMode";

// Pitch-map lower-third: a CENTRED blue bowler-name header with an optional white card
// below it holding a free TEXT line. If `text` is empty, only the blue header shows.
// (`stats`/`nameOnly` are the legacy figures API, kept for back-compat but unused by the
// pitch ticker now.) Pure presentational.
export default function FiguresTicker({
  name = "Bowler",
  hand = "RHB",
  stats = [],
  text = "",
  legend = null,
  hideHeader = false,
  nameOnly = false,
  keepCase = false,
}) {
  const hasText = !!(text && String(text).trim());
  const hasLegend = !!(legend && legend.length);
  // Show the white card for: a colour legend (by-ball), a text line, or legacy stats columns.
  const showCard = hasLegend || hasText || (!nameOnly && stats.length > 0);
  return (
    <div className={`ft-wrap${isBroadcast ? " ft-broadcast" : ""}`}>
      <style>{STYLE}</style>
      <div className={`ft-stack${showCard ? "" : " ft-stack-nocard"}`}>
        {!hideHeader && (
          <div className={`ft-head${showCard ? "" : " ft-head-only"}`}>
            <span className={`ft-name${keepCase ? " ft-name-keepcase" : ""}`}>{name}</span>
            {hand && <span className="ft-hand">{hand}</span>}
          </div>
        )}
        {showCard && (
          <div className={`ft-card${hasLegend ? " ft-card-legend" : ""}`}>
            {hasLegend ? (
              legend.map((l) => (
                <div key={l.label} className="ft-leg-item">
                  <span className="ft-leg-ball" style={{ background: l.color }} />
                  <span className="ft-leg-label">{l.label}</span>
                </div>
              ))
            ) : hasText ? (
              <span className="ft-text">{text}</span>
            ) : (
              stats.map((s, i) => (
                <div key={i} className="ft-col">
                  <span className="ft-big">{s.big}</span>
                  <span className="ft-small">{s.small}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const STYLE = `
.ft-wrap{position:fixed;left:0;bottom:0;width:100%;z-index:9999990;
  display:flex;justify-content:center;pointer-events:none;container-type:inline-size;
  font-family:${FONT}}
.ft-stack{position:relative;pointer-events:auto;margin-bottom:${ref(80)};
  display:flex;flex-direction:column;align-items:center;
  animation:ftIn .6s cubic-bezier(.16,1,.3,1) both;
  filter:drop-shadow(0 ${ref(10)} ${ref(34)} rgba(0,0,0,.45))}
@keyframes ftIn{from{transform:translateY(16%);opacity:0}to{transform:translateY(0);opacity:1}}

/* Blue bowler header — CENTRED over the white card (pokes above it). */
.ft-head{position:absolute;top:${ref(-40)};left:50%;transform:translateX(-50%);
  min-width:${ref(300)};height:${ref(75)};
  display:flex;align-items:center;justify-content:center;gap:${ref(40)};
  padding:0 ${ref(44)};border-radius:${ref(15)};
  background:#0866B2;
  border-left:${ref(7)} solid #002F7F;border-right:${ref(7)} solid #002F7F;
  box-shadow:0 ${ref(6)} ${ref(18)} rgba(0,0,0,.4);white-space:nowrap}
/* No white card → the header sits on its own, in normal flow, centred. */
.ft-head-only{position:relative;top:auto;left:auto;transform:none}
.ft-name{color:#fff;font-weight:700;font-size:${clampFont(21, 27)};
  letter-spacing:${ref(0.28)};text-transform:uppercase;white-space:nowrap;line-height:1}
/* Operator option: show the name exactly as typed (no forced uppercase). */
.ft-name-keepcase{text-transform:none}
.ft-hand{color:#fff;font-weight:700;font-size:${clampFont(20, 23)};
  letter-spacing:${ref(0.22)};text-transform:uppercase;line-height:1}

/* White card — holds the free text line (centred). Sits just under the blue header so the
   two TOUCH (the header pokes up with top:-52 and overlaps the card's top edge). */
.ft-card{display:flex;align-items:center;justify-content:center;
  margin-top:${ref(18)};min-width:${ref(360)};
  padding:${ref(26)} ${ref(48)} ${ref(22)};border-radius:${ref(15)};background:#FFF}
.ft-text{color:#092C49;font-weight:700;font-size:${clampFont(18, 24)};line-height:1.15;
  letter-spacing:${ref(0.2)};text-align:center;white-space:nowrap}

/* By-ball colour legend inside the white card (DOTS / RUNS / FOURS / SIXES / WICKETS). */
.ft-card-legend{gap:${ref(34)};padding:${ref(22)} ${ref(40)} ${ref(18)}}
.ft-leg-item{display:flex;flex-direction:column;align-items:center;gap:${ref(8)}}
/* Glossy 3D ball: top highlight + bottom shade (inset) + a soft drop shadow, like the
   bowling-analysis ball chips. */
.ft-leg-ball{width:${ref(34)};height:${ref(34)};border-radius:50%;
  box-shadow:inset 0 ${ref(4)} ${ref(6)} rgba(255,255,255,.55),
    inset 0 ${ref(-5)} ${ref(8)} rgba(0,0,0,.4),
    0 ${ref(3)} ${ref(6)} rgba(0,0,0,.4)}
.ft-leg-label{color:#223;font-weight:700;font-size:${clampFont(12, 15)};
  letter-spacing:${ref(0.2)};line-height:1;white-space:nowrap}

/* Legacy figures columns (unused by the pitch ticker now; kept for back-compat). */
.ft-col{flex:0 0 ${ref(100)};width:${ref(100)};
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:${ref(6)};text-align:center}
.ft-big{color:#092C49;font-weight:700;font-size:${clampFont(24, 31)};line-height:1;white-space:nowrap}
.ft-small{color:#5b6b82;font-weight:600;font-size:${clampFont(13, 16)};
  letter-spacing:${ref(0.2)};line-height:1;white-space:nowrap}

/* Broadcast big screen: shrink + move down (same as the stump ticker). */
.ft-broadcast .ft-stack{transform:scale(0.78);transform-origin:bottom center;
  margin-bottom:${ref(24)}}
/* Blue container on the BIG SCREEN: KEEP the thick left/right accents (from the base .ft-head)
   and ADD matching top/bottom borders so it's bordered on all four sides, plus 3px extra space. */
.ft-broadcast .ft-head{min-width:${ref(240)};height:auto;top:${ref(-60)};
  padding:${ref(22)} ${ref(44)};
  border-top:${ref(3)} solid #002F7F;border-bottom:${ref(3)} solid #002F7F}
/* Name font on the big screen (slightly reduced). */
.ft-broadcast .ft-name{font-size:${clampFont(16, 26)}}
.ft-broadcast .ft-head-only{top:auto}
/* White container on the BIG SCREEN: tighter padding. */
.ft-broadcast .ft-card{padding:${ref(12)} ${ref(40)} ${ref(10)}}
.ft-broadcast .ft-card-legend{padding:${ref(10)} ${ref(34)} ${ref(8)}}
`;
