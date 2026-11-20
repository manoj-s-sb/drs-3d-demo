import { useSelector } from "react-redux";
import { BALL_COLORS } from "./ballColors";
import { MT_STYLE, hex } from "./tickerStyle";
import { isBroadcast } from "../../viewMode";

// ─────────────────────────────────────────────────────────────────────────────
// DATA SOURCES (kept deliberately explicit):
//   • SPEED (per ball)      → trajectory JSON → ball.speedAvg (km/h)
//   • ball number / colour  → trajectory + BALL_COLORS (matches the 3D tube)
//   • bowler / hand / over  → score API → s.score.bowling (loadBowlingAnalysis)
// ─────────────────────────────────────────────────────────────────────────────

export default function MultiTicker() {
  const balls = useSelector((s) => s.session.accumulatedTrajectories);
  const playing = useSelector((s) => s.session.multiTrajectoryPlay);
  // false = loaded/armed at the start frame; true = actually animating. Only show
  // the ticker once the trajectory is really playing (not while armed/cued).
  const started = useSelector((s) => s.session.multiPlayStarted);
  const bowling = useSelector((s) => s.score?.bowling); // API data (optional)
  const byBall = useSelector((s) => s.score?.bowling?.byBall); // per-ball runs
  // Which metric to show under each ball: "speed" (km/h) | "runs" | "both".
  const metric = useSelector((s) => s.session.bowlingTickerMetric);
  const hideTicker = useSelector((s) => s.session.hideTicker);
  // Operator "Name only": just the blue bowler-name header, no over/speed card.
  const nameOnly = useSelector((s) => s.session.bowlerNameOnly);
  // How many ball chips to reveal — synced to the trajectory playback. In SEQUENTIAL
  // mode the renderer bumps this 0→1→…→5 as each ball flies in; in Combined it jumps
  // straight to all. -1 = none revealed yet.
  const seqActive = useSelector((s) => s.session.multiSeqActive);

  if (hideTicker) return null; // operator hid the ticker
  if (!playing || !started || !balls?.length) return null;

  // Reveal chips up to the active ball (sequential one-by-one); all when seqActive is
  // at the last ball (Combined / after the intro).
  const revealCount = Math.max(0, Math.min(balls.length, seqActive + 1));

  // Header = INNINGS name (not the bowler/hand): team label from the score API, else the
  // innings number as an ordinal from the plotted balls.
  const innNum = balls.find((b) => b?.innings != null)?.innings;
  const ordinal = (n) => {
    const s = ["TH", "ST", "ND", "RD"];
    const v = n % 100;
    return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
  };
  const inningsName =
    bowling?.inningsName ||
    bowling?.battingTeam ||
    (innNum != null ? `${ordinal(innNum)} INNINGS` : "INNINGS");
  // Header shows the BOWLER's name (from the score API) when available; otherwise a neutral
  // "BOWLER" fallback (NOT the innings name). `inningsName` is kept computed for reference.
  void inningsName;
  const headerLabel = bowling?.bowler || "BOWLER";
  const overNo = bowling?.over != null ? `Over ${bowling.over}` : "Over";
  // What each ball shows + the unit label under "Over":
  //   speed → km/h values, "SPEED(KPH)"
  //   runs  → run values,   "RUNS"
  //   both  → speed + runs stacked, "SPEED(KPH)" (speed label only)
  //   none  → NOTHING under the ball AND no unit label under "Over"
  const showSpeed = metric === "speed" || metric === "both";
  const showRuns = metric === "runs" || metric === "both";
  // One label per value row, in the SAME order as the ball columns (runs on top, speed below),
  // so "Over / RUNS / SPEED(KPH)" lines up row-for-row with circle / runs / speed. None → none.
  const rowLabels = [];
  if (showRuns) rowLabels.push("RUNS");
  if (showSpeed) rowLabels.push("SPEED(KPH)");

  return (
    <div className={`mt-wrap${isBroadcast ? " mt-broadcast" : " mt-operator"}`}>
      <style>{MT_STYLE}</style>
      <div className="mt-stack">
        {/* Blue header bar: bowler name (or innings name), centred. Pokes above the card. */}
        <div className={`mt-head mt-head-solo${nameOnly ? " mt-head-only" : ""}`}>
          <span className="mt-bowler">{headerLabel}</span>
        </div>

        {/* White card: over label + the per-ball coloured circles with speed. */}
        {!nameOnly && (
          <div className="mt-card">
            <div className="mt-row">
              {/* Over label + the speed UNIT (the per-ball values below the circles are km/h —
                  the professional broadcast / Hawk-Eye style). */}
              <span className="mt-over-wrap">
                {/* Head box matches the ball circle's height so "Over" sits on the circle row;
                    then one unit label per value row, aligned to runs / speed below. */}
                <span className="mt-over-head">
                  <span className="mt-over">{overNo}</span>
                </span>
                {rowLabels.map((lbl, i) => (
                  <span key={i} className="mt-over-unit">{lbl}</span>
                ))}
              </span>
              <div className="mt-balls">
                {/* Render a fixed-width SLOT for every ball in the over (so the card is sized
                    to the real ball count → no trailing space and no width jump during the
                    reveal). The circle+speed mount only when the ball is REVEALED, so each
                    still animates in when it appears. */}
                {balls.map((ball, idx) => {
                  const revealed = idx < revealCount;
                  const color = hex(BALL_COLORS[idx % BALL_COLORS.length]);
                  const ballNo = ball?.ballNo ?? idx + 1;
                  const speed =
                    ball?.speedAvg != null ? ball.speedAvg.toFixed(1) : "--";
                  // Runs from the score API (byBall) keyed by ball number, else the ball's own.
                  const runs = byBall?.[String(ballNo)]?.runs ?? ball?.runs ?? 0;
                  return (
                    <div key={idx} className="mt-ball">
                      {revealed && (
                        <div className="mt-ball-in">
                          <span className="mt-circle" style={{ background: color }}>
                            {ballNo}
                          </span>
                          {/* RUNS on top, SPEED (km/h) below — so in "both" the SPEED(KPH)
                              label under "Over" reads against the lower (speed) row. */}
                          {showRuns && <span className="mt-runs">{runs}</span>}
                          {showSpeed && <span className="mt-speed">{speed}</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
