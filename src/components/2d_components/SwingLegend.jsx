import { useSelector } from "react-redux";

// Swing-analysis legend (bottom-left): Actual Delivery (white dot) · Without Deviation (red
// dot) · Turn |turn_deg|° (spinners) or Swing |swing_deg|° (seamers), per the operator's
// Spin/Seam option. Blue pills, scaled to the frame via cqw so the exact px spec hits at
// 1920. turn_deg / swing_deg come from ball_analytics.json (session.swingTurnDeg/SwingDeg).

// Fixed full-screen overlay → scale to the viewport width (vw), hitting the exact px
// spec at 1920. (cqw would need a container-type ancestor; vw is correct for a fixed overlay.)
const ref = (n) => `${((n / 1920) * 100).toFixed(4)}vw`;
const FONT = '"DejaVu Sans", sans-serif';
// Font clamps between a px floor/ceiling, scaling with the frame in between — big screen
// 16→24, compact PiP 12→14 (same pattern as the DRS overlay / tickers).
const clampFont = (min, max) => `clamp(${min}px, ${ref(max)}, ${max}px)`;

export default function SwingLegend() {
  const active = useSelector((s) => s.session.swingActive);
  const turn = useSelector((s) => s.session.swingTurnDeg);
  const swing = useSelector((s) => s.session.swingSwingDeg);
  const seam = useSelector((s) => s.session.swingBowlerType) === "seam";
  const hideTicker = useSelector((s) => s.session.hideTicker);
  const compact = useSelector((s) => s.session.compact);
  if (!active || hideTicker) return null;

  // Seamers → Swing (swing_deg); spinners → Turn (turn_deg). Magnitude only (no +/− sign).
  const deg = seam ? swing : turn;
  const dev = deg == null ? "—" : `${Math.abs(deg).toFixed(1)}°`;

  return (
    <div className={`sl-wrap${compact ? " sl-compact" : ""}`}>
      <style>{STYLE}</style>
      <div className="sl-pill">
        <span>Actual Delivery</span>
        <span className="sl-dot sl-white" />
      </div>
      <div className="sl-pill">
        <span>Without Deviation</span>
        <span className="sl-dot sl-red" />
      </div>
      <div className="sl-pill">
        <span>{seam ? "Seam Movement" : "Turn"}</span>
        <span>{dev}</span>
      </div>
    </div>
  );
}

const STYLE = `
.sl-wrap{position:fixed;left:${ref(48)};bottom:${ref(60)};z-index:9999991;
  display:flex;flex-direction:column;gap:${ref(12)};
  font-family:${FONT};pointer-events:none}
.sl-pill{min-width:${ref(259)};min-height:${ref(55)};
  display:flex;align-items:center;justify-content:space-between;gap:${ref(16)};
  padding:${ref(12)} ${ref(16)};border-radius:${ref(8)};
  background:#0866B2;color:#FFF;
  font-size:${clampFont(16, 24)};font-weight:700;letter-spacing:${ref(0.24)};line-height:1;
  white-space:nowrap}
/* Compact PiP: fixed small px (NOT vw) so the pills size to their text and never
   overflow/break in the narrow PiP window. */
.sl-compact{left:12px;bottom:14px;gap:6px}
.sl-compact .sl-pill{width:auto;min-width:120px;min-height:0;padding:6px 10px;
  gap:8px;border-radius:6px;font-size:12px;white-space:nowrap}
.sl-compact .sl-dot{width:12px;height:12px}
.sl-dot{width:${ref(24)};height:${ref(24)};border-radius:50%;flex-shrink:0;
  box-shadow:0 ${ref(-3)} ${ref(1)} 0 rgba(0,0,0,0.25) inset}
.sl-red{background:#FF0000;border:${ref(0.5)} solid #FFF}
.sl-white{background:#FFF}
`;
