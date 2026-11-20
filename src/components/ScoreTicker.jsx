// Modern broadcast score ticker (lower-third). Render-only: the snapshot is
// loaded on demand by the dashboard (Start / camera select) and pushed to the
// big screen over the cross-tab channel. Batsmen are an aligned table (R/B/SR),
// batting team on the left, bowler on the right, stats + DRS reviews below.
import { useSelector } from "react-redux";

// Temporarily hidden — set back to false to bring the single-ball score card
// (the lower-third score/DRS-reviews strip) back on screen.
const HIDE_SCORE_TICKER = true;

export default function ScoreTicker() {
  const snapshot = useSelector((s) => s.score?.snapshot);
  const status = useSelector((s) => s.score?.status);
  const score = snapshot?.score;

  if (HIDE_SCORE_TICKER) return null;

  if (!score) {
    return status === "loading" ? (
      <div className="st-wrap">
        <style>{ST_STYLE}</style>
        <div className="st-tk st-loading">Loading score…</div>
      </div>
    ) : null;
  }

  const code = (t) => (t || "").slice(0, 3).toUpperCase();
  const projected =
    score.target == null && score.crr
      ? Math.round(score.crr * (score.maxOvers || 0))
      : null;

  const rev = score.reviews || {};
  const batLeft = (rev.batting?.totalReviews ?? 0) - (rev.batting?.reviewsUsed ?? 0);
  const batTotal = rev.batting?.totalReviews ?? 0;
  const bowlLeft = (rev.bowling?.totalReviews ?? 0) - (rev.bowling?.reviewsUsed ?? 0);
  const bowlTotal = rev.bowling?.totalReviews ?? 0;

  const Dots = ({ left, total }) => (
    <span className="st-dots">
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} className={`st-rdot${i < left ? " on" : ""}`} />
      ))}
    </span>
  );

  const Batter = ({ b, striker }) =>
    b ? (
      <div className={`st-row${striker ? " on" : ""}`}>
        <span className="st-name">
          <span className="st-strike" />
          {b.name}
        </span>
        <span className="st-r">{b.runs}</span>
        <span className="st-b">({b.balls})</span>
        <span className="st-sr">{b.sr}</span>
      </div>
    ) : null;

  return (
    <div className="st-wrap">
      <style>{ST_STYLE}</style>
      <div className="st-tk">
        <div className="st-top">
          {/* batting score */}
          <div className="st-score-zone">
            <span className="st-chip st-chip-bat">{code(score.battingTeam)}</span>
            <span className="st-score">
              {score.runs}-{score.wickets}
            </span>
            <span className="st-ovs">
              {score.overs}
              <i>OVERS</i>
            </span>
          </div>

          <span className="st-div" />

          {/* batters (aligned table) */}
          <div className="st-bat-zone">
            <div className="st-row st-head">
              <span>Batter</span>
              <span className="st-r">R</span>
              <span className="st-b">B</span>
              <span className="st-sr">SR</span>
            </div>
            <Batter b={score.striker} striker />
            <Batter b={score.nonStriker} />
          </div>

          <span className="st-div" />

          {/* bowler */}
          <div className="st-bowl-zone">
            <span className="st-chip st-chip-bowl">{code(score.bowlingTeam)}</span>
            <div>
              <div className="st-bowl-name">{score.bowler?.name}</div>
              <div className="st-bowl-fig">
                {score.bowler?.wickets}-{score.bowler?.runs}
                <span className="st-bowl-ov">({score.bowler?.overs})</span>
                <span className="st-eco">ECO {score.bowler?.econ}</span>
              </div>
            </div>
          </div>
        </div>

        {/* stats + reviews */}
        <div className="st-bot">
          <div className="st-stats">
            <span className="st-stat"><i>CRR</i><b>{score.crr ?? "—"}</b></span>
            {score.target != null ? (
              <span className="st-stat"><i>Target</i><b>{score.target}</b></span>
            ) : (
              projected != null && (
                <span className="st-stat"><i>Proj</i><b>{projected}</b></span>
              )
            )}
            {score.rrr != null && (
              <span className="st-stat"><i>RRR</i><b>{score.rrr}</b></span>
            )}
            <span className="st-stat"><i>P'ship</i><b>{score.partnership?.runs ?? 0}</b></span>
          </div>
          <div className="st-rev">
            <span className="st-rev-lbl">Reviews</span>
            <span className="st-rev-grp">Bat <Dots left={batLeft} total={batTotal} /></span>
            <span className="st-rev-grp">Bowl <Dots left={bowlLeft} total={bowlTotal} /></span>
          </div>
        </div>
      </div>
    </div>
  );
}

const ST_STYLE = `
.st-wrap{position:absolute;left:50%;bottom:20px;transform:translateX(-50%);z-index:20;
  font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  pointer-events:none;width:max-content;min-width:940px;max-width:96%}
.st-tk{border-radius:16px;overflow:hidden;color:#EEF2F8;
  background:linear-gradient(180deg,rgba(22,27,37,.97),rgba(11,15,22,.97));
  border:1px solid rgba(255,255,255,.10);
  box-shadow:0 24px 60px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.06)}
.st-loading{padding:12px 18px;font-size:13px;color:#8B95A7;min-width:auto}
.st-top{display:flex;align-items:stretch}
.st-div{width:1px;background:rgba(255,255,255,.09);margin:6px 0}

.st-score-zone{display:flex;align-items:center;gap:15px;padding:0 24px}
.st-chip{font-size:12px;font-weight:900;letter-spacing:.08em;padding:7px 11px;border-radius:8px;color:#06101f}
.st-chip-bat{background:linear-gradient(180deg,#5aa4ff,#2f6fe0);box-shadow:0 3px 12px rgba(59,130,246,.4)}
.st-chip-bowl{background:linear-gradient(180deg,#f7b64a,#e59a28);color:#231604;box-shadow:0 3px 12px rgba(245,158,11,.4)}
.st-score{font-size:24px;font-weight:900;font-variant-numeric:tabular-nums;letter-spacing:.5px;line-height:1}
.st-ovs{display:flex;flex-direction:column;line-height:1;color:#AEB7C6;font-size:16px;font-weight:800;font-variant-numeric:tabular-nums}
.st-ovs i{font-style:normal;font-size:9px;letter-spacing:.18em;color:#5A6478;margin-top:3px}

.st-bat-zone{flex:1;min-width:360px;padding:5px 24px;display:flex;flex-direction:column;gap:0;justify-content:center}
.st-row{display:grid;grid-template-columns:1fr 40px 46px 60px;align-items:center;column-gap:14px;
  padding:2px 0;font-variant-numeric:tabular-nums}
.st-head{font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:#5A6478;font-weight:800;padding:0 0 2px}
.st-head .st-r,.st-head .st-b,.st-head .st-sr{text-align:right}
.st-name{display:flex;align-items:center;gap:9px;text-transform:uppercase;letter-spacing:.02em;
  font-size:15px;font-weight:700;color:#C5CCD8}
.st-row.on .st-name{color:#fff}
.st-strike{width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.16);flex:none}
.st-row.on .st-strike{background:#4c9dff;box-shadow:0 0 8px #4c9dff}
.st-r{text-align:right;font-size:17px;font-weight:900;color:#fff}
.st-b{text-align:right;font-size:13px;color:#8B95A7;font-weight:600}
.st-sr{text-align:right;font-size:13px;color:#8fb3ff;font-weight:800}

.st-bowl-zone{display:flex;align-items:center;gap:14px;padding:0 24px;min-width:250px}
.st-bowl-name{font-size:15px;font-weight:800;text-transform:uppercase;letter-spacing:.02em}
.st-bowl-fig{font-size:13px;font-weight:800;font-variant-numeric:tabular-nums;color:#C5CCD8;
  display:flex;align-items:baseline;gap:8px;margin-top:3px}
.st-bowl-ov{color:#8B95A7;font-weight:600}
.st-eco{color:#f7b64a;font-weight:800}

.st-bot{display:flex;align-items:center;justify-content:space-between;gap:20px;
  padding:4px 24px;border-top:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.02)}
.st-stats{display:flex;align-items:center;gap:28px}
.st-stat{display:flex;align-items:baseline;gap:8px}
.st-stat i{font-style:normal;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#7C8698;font-weight:800}
.st-stat b{font-size:15px;font-weight:900;font-variant-numeric:tabular-nums;color:#EEF2F8}
.st-rev{display:flex;align-items:center;gap:16px}
.st-rev-lbl{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#7C8698;font-weight:800}
.st-rev-grp{display:flex;align-items:center;gap:8px;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#AEB7C6;font-weight:800}
.st-dots{display:inline-flex;gap:4px}
.st-rdot{width:10px;height:10px;border-radius:50%;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.2)}
.st-rdot.on{background:#22C55E;border-color:#16a34a;box-shadow:0 0 6px rgba(34,197,94,.55)}
`;
