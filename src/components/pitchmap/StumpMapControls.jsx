import React, { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { loadPitchMapData, buildStumpPoint, dismissalTag } from "./pitchMapData";
import { loadTrajectory } from "../../trajectoryCache";
import { runPool } from "../../pool";
import {
  startStumpMap,
  addStumpMapPoints,
  setStumpMapDrop,
  setStumpMapStyle,
} from "../../store/slices/sessionSlice";

// Stump Map operator controls — a copy of PitchMapStandaloneControls, but it plots where
// each ball crosses the STUMPS plane (buildStumpPoint) instead of the bounce point.
const CONCURRENCY = 6;
const ONE_BY_ONE_GAP_MS = 350;

function runTag(d) {
  if (d.is_wicket) return dismissalTag(d.dismissal);
  if (d.outcome === "four") return "4";
  if (d.outcome === "six") return "6";
  if (!d.is_legal) return "•";
  return String(d.runs ?? 0);
}

export default function StumpMapControls({ runToken = 0, accent = "#2DD4BF", onSelection }) {
  const dispatch = useDispatch();
  const [data, setData] = useState({ balls: [], meta: {}, status: "loading" });
  const [selMode, setSelMode] = useState("single");
  const [reveal, setReveal] = useState("together");
  const [style, setStyle] = useState("runs"); // "runs" numbered dots | "ball" glossy balls
  const [innings, setInnings] = useState(1);
  const [over, setOver] = useState(null);
  const [ballSel, setBallSel] = useState([]);
  const [overs, setOvers] = useState([]);
  const abortRef = useRef(null);
  const selRef = useRef([]);

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

  useEffect(() => {
    setOver(overList[0] ?? null);
    setOvers(overList.length ? [overList[0]] : []);
  }, [overList]);
  useEffect(() => {
    setBallSel(ballList.map((d) => d.ball));
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

  const selectedBalls = useMemo(() => {
    if (selMode === "single") {
      if (over == null) return [];
      return ballsOfOver(innings, over).filter((d) => ballSel.includes(d.ball));
    }
    return overs.flatMap((ov) => ballsOfOver(innings, ov));
  }, [deliveries, selMode, innings, over, ballSel, overs]); // eslint-disable-line react-hooks/exhaustive-deps
  selRef.current = selectedBalls;

  const totals = useMemo(() => {
    const bs = selectedBalls;
    const runs = bs.reduce((s, d) => s + (d.runs || 0), 0);
    const wkts = bs.filter((d) => d.is_wicket).length;
    return { balls: bs.length, runs, wkts };
  }, [selectedBalls]);

  // Keep the renderer's display style in sync with the toggle.
  useEffect(() => {
    dispatch(setStumpMapStyle(style));
  }, [style, dispatch]);

  // Report the selection up so "Send to Big Screen" pushes the same balls.
  useEffect(() => {
    if (onSelection)
      onSelection({
        balls: selectedBalls.map((d) => ({
          innings: d.innings,
          over: d.over,
          ball: d.ball,
          // Per-ball meta so the big screen builds the SAME dot as the preview (LHB flip +
          // runs/outcome from the per-ball index, not the score API).
          runs: d.runs,
          is_wicket: d.is_wicket,
          outcome: d.outcome,
          batter_hand: d.batter_hand,
        })),
        reveal,
        style,
      });
  }, [selectedBalls, reveal, style, onSelection]);

  // Start → fetch each selected ball's STUMPS-crossing point and plot it.
  useEffect(() => {
    if (!runToken) return;
    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const sel = selRef.current;
    dispatch(setStumpMapDrop(reveal === "together"));
    dispatch(startStumpMap([]));
    if (!sel.length) return () => ac.abort();

    const byOver = new Map();
    sel.forEach((d) => {
      const k = `${d.innings}/${d.over}`;
      if (!byOver.has(k)) byOver.set(k, []);
      byOver.get(k).push(d);
    });
    const groups = Array.from(byOver.values());

    const loadGroup = async (balls) => {
      const pts = await Promise.all(
        balls.map(async (d) => buildStumpPoint(d, await loadTrajectory(d.innings, d.over, d.ball))),
      );
      return pts.filter(Boolean);
    };

    if (reveal === "together") {
      runPool(groups, loadGroup, {
        concurrency: CONCURRENCY,
        signal: ac.signal,
        onResult: (pts) => {
          if (!ac.signal.aborted && pts?.length) dispatch(addStumpMapPoints(pts));
        },
      });
    } else {
      (async () => {
        for (const d of sel) {
          if (ac.signal.aborted) return;
          const pt = buildStumpPoint(d, await loadTrajectory(d.innings, d.over, d.ball));
          if (ac.signal.aborted) return;
          if (pt) dispatch(addStumpMapPoints([pt]));
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

      <div className="pmd-field">
        <span className="pmd-flbl">What to show</span>
        <div className="pmd-seg">
          <button className={`db-segbtn${selMode === "single" ? " on" : ""}`} style={selMode === "single" ? { background: accent } : undefined} onClick={() => setSelMode("single")}>Single ball</button>
          <button className={`db-segbtn${selMode === "multiple" ? " on" : ""}`} style={selMode === "multiple" ? { background: accent } : undefined} onClick={() => setSelMode("multiple")}>Whole overs</button>
        </div>
      </div>

      <div className="pmd-field">
        <span className="pmd-flbl">How to play</span>
        <div className="pmd-seg">
          <button className={`db-segbtn${reveal === "onebyone" ? " on" : ""}`} style={reveal === "onebyone" ? { background: accent } : undefined} onClick={() => setReveal("onebyone")}>One by one</button>
          <button className={`db-segbtn${reveal === "together" ? " on" : ""}`} style={reveal === "together" ? { background: accent } : undefined} onClick={() => setReveal("together")}>All together</button>
        </div>
      </div>

      {/* Display: numbered run dots, or glossy coloured balls (by outcome). */}
      <div className="pmd-field">
        <span className="pmd-flbl">Display</span>
        <div className="pmd-seg">
          <button className={`db-segbtn${style === "runs" ? " on" : ""}`} style={style === "runs" ? { background: accent } : undefined} onClick={() => setStyle("runs")}>Runs</button>
          <button className={`db-segbtn${style === "ball" ? " on" : ""}`} style={style === "ball" ? { background: accent } : undefined} onClick={() => setStyle("ball")}>Ball</button>
        </div>
      </div>

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
