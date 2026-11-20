import React, { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { loadPitchMapData, buildPoint, dismissalTag } from "./pitchMapData";
import { loadTrajectory } from "../../trajectoryCache";
import { runPool } from "../../pool";
import {
  startPitchMap,
  addPitchMapPoints,
  setPitchMapDrop,
} from "../../store/slices/sessionSlice";

// DRS-style Pitch Mapping selector: innings / over / ball tiles with the run shown
// inside each ball box (same small-tag style as the DRS ball selector), plus
// Single/Multiple over selection and One-by-one / All-together reveal. Rendered
// alongside the existing filter UI (PitchMapControls) — switched by the operator.
const CONCURRENCY = 6;
const ONE_BY_ONE_GAP_MS = 350; // delay between overs in "one by one" reveal

// Short run/outcome tag for a ball-index record (matches the DRS ball tags).
function runTag(d) {
  if (d.is_wicket) return dismissalTag(d.dismissal); // LBW / C / B / RO … (not plain "W")
  if (d.outcome === "four") return "4";
  if (d.outcome === "six") return "6";
  if (!d.is_legal) return "•"; // wide / no-ball
  return String(d.runs ?? 0);
}

export default function PitchMapDrsControls({
  runToken = 0,
  accent = "#A78BFA",
  onSelection,
}) {
  const dispatch = useDispatch();
  const [data, setData] = useState({ balls: [], meta: {}, status: "loading" });
  const [selMode, setSelMode] = useState("single"); // single | multiple
  const [reveal, setReveal] = useState("together"); // together | onebyone
  const [innings, setInnings] = useState(1);
  const [over, setOver] = useState(null); // single: chosen over (single-select)
  const [ballSel, setBallSel] = useState([]); // single: chosen balls (MULTI-select)
  const [overs, setOvers] = useState([]); // multiple: chosen overs
  const abortRef = useRef(null);
  const selRef = useRef([]); // resolved selection, read at Start

  useEffect(() => {
    let alive = true;
    loadPitchMapData()
      .then(({ balls, meta }) => {
        if (!alive) return;
        setData({ balls: balls || [], meta: meta || {}, status: balls?.length ? "ready" : "empty" });
      })
      .catch((e) => {
        if (alive) setData({ balls: [], meta: {}, status: "error", error: e.message });
      });
    return () => {
      alive = false;
    };
  }, []);

  const deliveries = data.balls;

  const inningsList = useMemo(() => {
    const s = new Set(deliveries.map((d) => d.innings));
    return Array.from(s).sort((a, b) => a - b);
  }, [deliveries]);

  const overList = useMemo(() => {
    const s = new Set(
      deliveries.filter((d) => d.innings === innings).map((d) => d.over),
    );
    return Array.from(s).sort((a, b) => a - b);
  }, [deliveries, innings]);

  const ballsOfOver = (inn, ov) =>
    deliveries
      .filter((d) => d.innings === inn && d.over === ov)
      .sort((a, b) => a.ball - b.ball);

  const ballList = useMemo(
    () => (over == null ? [] : ballsOfOver(innings, over)),
    [deliveries, innings, over], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Default the over when data/innings changes; default to all balls of that over.
  useEffect(() => {
    setOver(overList[0] ?? null);
    setOvers(overList.length ? [overList[0]] : []);
  }, [overList]);
  useEffect(() => {
    setBallSel(ballList.map((d) => d.ball)); // all balls of the over selected by default
  }, [ballList]);

  const changeInnings = (inn) => {
    setInnings(inn);
    setOver(null);
    setBallSel([]);
    setOvers([]);
  };
  const toggleOver = (ov) =>
    setOvers((cur) =>
      cur.includes(ov) ? cur.filter((x) => x !== ov) : [...cur, ov].sort((a, b) => a - b),
    );
  const toggleBall = (b) =>
    setBallSel((cur) =>
      cur.includes(b) ? cur.filter((x) => x !== b) : [...cur, b].sort((a, b2) => a - b2),
    );
  const allBallsOn = ballList.length > 0 && ballList.every((d) => ballSel.includes(d.ball));
  const toggleAllBalls = () =>
    setBallSel(allBallsOn ? [] : ballList.map((d) => d.ball));

  // Resolve the currently-selected balls (index records) → geometry on Start.
  const selectedBalls = useMemo(() => {
    if (selMode === "single") {
      if (over == null) return [];
      // single OVER, MULTI balls: the chosen balls of that one over (in order).
      return ballsOfOver(innings, over).filter((d) => ballSel.includes(d.ball));
    }
    // multiple: all 6 balls of every selected over (no manual ball picking).
    return overs.flatMap((ov) => ballsOfOver(innings, ov));
  }, [deliveries, selMode, innings, over, ballSel, overs]); // eslint-disable-line react-hooks/exhaustive-deps
  selRef.current = selectedBalls;

  // Report the selection up so "Send to Big Screen" can push the SAME balls the
  // operator picked (otherwise the big screen would show the whole over).
  useEffect(() => {
    if (onSelection)
      onSelection({
        balls: selectedBalls.map((d) => ({
          innings: d.innings,
          over: d.over,
          ball: d.ball,
        })),
        reveal, // "together" | "onebyone" → the big screen reveals the same way
      });
  }, [selectedBalls, reveal, onSelection]);

  // Totals for the little summary line.
  const totals = useMemo(() => {
    const bs = selectedBalls;
    const runs = bs.reduce((s, d) => s + (d.runs || 0), 0);
    const wkts = bs.filter((d) => d.is_wicket).length;
    return { balls: bs.length, runs, wkts };
  }, [selectedBalls]);

  // Start → fetch the selected balls' bounce points and render them. Grouped by
  // over so "one by one" reveals over-by-over; "all together" shows them at once.
  useEffect(() => {
    if (!runToken) return;
    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const sel = selRef.current;
    // "All together" → dots DROP from the top; "one by one" → quick pop.
    dispatch(setPitchMapDrop(reveal === "together"));
    dispatch(startPitchMap([]));
    if (!sel.length) return () => ac.abort();

    // Group by over, in order.
    const byOver = new Map();
    sel.forEach((d) => {
      const k = `${d.innings}/${d.over}`;
      if (!byOver.has(k)) byOver.set(k, []);
      byOver.get(k).push(d);
    });
    const groups = Array.from(byOver.values());

    const loadGroup = async (balls) => {
      const pts = await Promise.all(
        balls.map(async (d) => buildPoint(d, await loadTrajectory(d.innings, d.over, d.ball))),
      );
      return pts.filter(Boolean);
    };

    if (reveal === "together") {
      // All at once: load everything, then render in one go.
      runPool(groups, loadGroup, {
        concurrency: CONCURRENCY,
        signal: ac.signal,
        onResult: (pts) => {
          if (!ac.signal.aborted && pts?.length) dispatch(addPitchMapPoints(pts));
        },
      });
    } else {
      // One by one: reveal each BALL in sequence with a short gap (clearly stepped).
      (async () => {
        for (const d of sel) {
          if (ac.signal.aborted) return;
          const pt = buildPoint(d, await loadTrajectory(d.innings, d.over, d.ball));
          if (ac.signal.aborted) return;
          if (pt) dispatch(addPitchMapPoints([pt]));
          await new Promise((r) => setTimeout(r, ONE_BY_ONE_GAP_MS));
        }
      })();
    }
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runToken]);

  if (data.status === "loading")
    return <div className="pmd"><style>{STYLE}</style><div className="pmd-state">Loading live data…</div></div>;
  if (data.status === "error")
    return <div className="pmd"><style>{STYLE}</style><div className="pmd-state err">Couldn’t load match data — {data.error || "API unavailable"}.</div></div>;
  if (data.status === "empty")
    return <div className="pmd"><style>{STYLE}</style><div className="pmd-state">No deliveries recorded for this match yet.</div></div>;

  return (
    <div className="pmd">
      <style>{STYLE}</style>

      {/* What to select: one delivery, or whole overs */}
      <div className="pmd-field">
        <span className="pmd-flbl">What to show</span>
        <div className="pmd-seg">
          <button className={`db-segbtn${selMode === "single" ? " on" : ""}`} style={selMode === "single" ? { background: accent } : undefined} onClick={() => setSelMode("single")}>Single ball</button>
          <button className={`db-segbtn${selMode === "multiple" ? " on" : ""}`} style={selMode === "multiple" ? { background: accent } : undefined} onClick={() => setSelMode("multiple")}>Whole overs</button>
        </div>
        <span className="pmd-hint">
          {selMode === "single"
            ? "Pick one over, then one or more of its balls."
            : "Tap one or more overs — all 6 balls of each are included."}
        </span>
      </div>

      {/* How to reveal the dots on screen */}
      <div className="pmd-field">
        <span className="pmd-flbl">How to play</span>
        <div className="pmd-seg">
          <button className={`db-segbtn${reveal === "onebyone" ? " on" : ""}`} style={reveal === "onebyone" ? { background: accent } : undefined} onClick={() => setReveal("onebyone")}>One by one</button>
          <button className={`db-segbtn${reveal === "together" ? " on" : ""}`} style={reveal === "together" ? { background: accent } : undefined} onClick={() => setReveal("together")}>All together</button>
        </div>
        <span className="pmd-hint">
          {reveal === "onebyone"
            ? "Balls appear one after another."
            : "All selected balls appear at once."}
        </span>
      </div>

      {/* Innings */}
      <div className="pmd-row">
        <span className="pmd-lbl">Innings</span>
        <div className="pmd-tiles">
          {(inningsList.length ? inningsList : [1]).map((n) => (
            <button key={n} className={`db-tile${innings === n ? " on" : ""}`} style={innings === n ? { background: accent } : undefined} onClick={() => changeInnings(n)}>
              <span className="db-tile-n">{n}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Over(s) */}
      <div className="pmd-row">
        <span className="pmd-lbl">{selMode === "multiple" ? "Overs" : "Over"}</span>
        <div className="pmd-tiles">
          {overList.map((ov) => {
            const on = selMode === "multiple" ? overs.includes(ov) : over === ov;
            return (
              <button
                key={ov}
                className={`db-tile${on ? " on" : ""}`}
                style={on ? { background: accent } : undefined}
                onClick={() => (selMode === "multiple" ? toggleOver(ov) : setOver(ov))}
              >
                <span className="db-tile-n">{ov}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Ball (single-over mode) — MULTI-select; each box shows its run, DRS-style */}
      {selMode === "single" && (
        <div className="pmd-row">
          <span className="pmd-lbl">Balls</span>
          <div className="pmd-tiles">
            <button
              className={`db-tile db-tile-all${allBallsOn ? " on" : ""}`}
              style={allBallsOn ? { background: accent } : undefined}
              onClick={toggleAllBalls}
            >
              {allBallsOn ? "✓ All" : "All"}
            </button>
            {ballList.map((d) => {
              const on = ballSel.includes(d.ball);
              return (
                <button
                  key={d.ball}
                  className={`db-tile db-tile-sub${on ? " on" : ""}`}
                  style={on ? { background: accent } : undefined}
                  onClick={() => toggleBall(d.ball)}
                >
                  <span className="db-tile-n">{d.ball}</span>
                  <span className="db-tile-tag">{runTag(d)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Multiple: compact per-over strip of its 6 balls + runs (auto-included).
          Stays small and scrolls when many overs are picked — no big expansion. */}
      {selMode === "multiple" && overs.length > 0 && (
        <div className="pmd-multi">
          {overs.map((ov) => (
            <div key={ov} className="pmd-mrow">
              <span className="pmd-mlbl">Ov {ov}</span>
              <div className="pmd-chips">
                {ballsOfOver(innings, ov).map((d) => (
                  <span key={d.ball} className="pmd-chip" title={`Ball ${d.ball}`}>
                    <b>{d.ball}</b>
                    <i>{runTag(d)}</i>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="pmd-sum">
        {totals.balls} ball{totals.balls === 1 ? "" : "s"} · {totals.runs} run
        {totals.runs === 1 ? "" : "s"}
        {totals.wkts ? ` · ${totals.wkts} wkt${totals.wkts === 1 ? "" : "s"}` : ""}
      </div>
    </div>
  );
}

const STYLE = `
.pmd{margin-top:10px;display:flex;flex-direction:column;gap:10px}
.pmd-state{padding:14px;border-radius:8px;background:#121a30;border:1px solid #ffffff14;color:#aeb7c6;font-size:13px;font-weight:600}
.pmd-state.err{background:#3a1414;border-color:#6b1f1f;color:#f0a0a0}
.pmd-field{display:flex;flex-direction:column;gap:5px}
.pmd-flbl{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#8b95a7;font-weight:800}
.pmd-hint{font-size:11px;color:#8b95a7;font-weight:600}
.pmd-seg{display:flex;gap:2px;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:4px}
.pmd-row{display:flex;align-items:flex-start;gap:12px}
.pmd-lbl{width:52px;flex:none;padding-top:11px;font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:#6B7791;font-weight:800}
.pmd-tiles{display:flex;flex-wrap:wrap;gap:6px}
.pmd-multi{display:flex;flex-direction:column;gap:5px;padding:8px;border:1px solid #ffffff12;border-radius:9px;background:#0f1526;max-height:168px;overflow-y:auto}
.pmd-mrow{display:flex;align-items:center;gap:8px}
.pmd-mlbl{width:36px;flex:none;font-size:10px;font-weight:800;color:#8b95a7}
.pmd-chips{display:flex;flex-wrap:wrap;gap:4px}
.pmd-chip{display:inline-flex;align-items:baseline;gap:3px;padding:2px 6px;border-radius:6px;
  border:1px solid #ffffff14;background:#141a2e;font-family:ui-monospace,Menlo,monospace}
.pmd-chip b{font-size:12px;font-weight:800;color:#e9eef9}
.pmd-chip i{font-size:9px;font-style:normal;font-weight:700;color:#9aa4b2}
.pmd-sum{font-size:12px;font-weight:700;color:#aeb7c6}
`;
