import React, { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { loadPitchMapData, buildStumpPoint } from "./pitchMapData";
import { loadTrajectory } from "../../trajectoryCache";
import { runPool } from "../../pool";
import {
  startStumpMap,
  addStumpMapPoints,
  setStumpMapDrop,
  setStumpMapStyle,
  setStumpBowlerName,
} from "../../store/slices/sessionSlice";

// Stump Map "Filters" controls — a copy of PitchMapControls (scenario presets + filters +
// live summary), but it plots where each ball crosses the STUMPS plane (buildStumpPoint)
// instead of the bounce point. Pairs with StumpMapControls (the "Over & ball" picker) via the
// operator's stumpUiMode toggle, exactly like the pitch map's two modes.
const CONCURRENCY = 6;

const PHASES = {
  all: { label: "All overs", from: 1, to: Infinity },
  powerplay: { label: "Powerplay (1–6)", from: 1, to: 6 },
  middle: { label: "Middle (7–15)", from: 7, to: 15 },
  death: { label: "Death (16–20)", from: 16, to: 20 },
};
const SCENARIOS = [
  { key: "full", label: "Full innings", note: "All deliveries this innings." },
  { key: "spell", label: "Bowler spell", note: "Only the selected bowler." },
  { key: "powerplay", label: "Powerplay", note: "Overs 1 to 6." },
  { key: "first5", label: "First 5", note: "Overs 1 to 5." },
  { key: "death", label: "Death", note: "Overs 16 to 20." },
  { key: "lastover", label: "Last over", note: "The final over bowled." },
  { key: "wickets", label: "Wickets", note: "Wicket balls only." },
  { key: "boundaries", label: "Boundaries", note: "Fours and sixes only." },
  { key: "vsleft", label: "Vs left", note: "Left-handed batters." },
  { key: "spin", label: "Spin only", note: "Spin bowlers only." },
];
const BASE = {
  bowler: "all",
  phase: "all",
  overFrom: 1,
  overTo: 1,
  bowlerType: "all",
  batterHand: "all",
  outcome: "all",
};

export default function StumpMapFilterControls({ runToken = 0, accent = "#2DD4BF", onSelection }) {
  const dispatch = useDispatch();
  const [data, setData] = useState({ balls: [], meta: {}, status: "loading" });
  const [f, setF] = useState({ innings: 1, ...BASE });
  const [scenario, setScenario] = useState("full");
  const [geo, setGeo] = useState({ loaded: 0, total: 0, points: [], busy: false });
  const abortRef = useRef(null);
  const matchedRef = useRef([]);
  // Display style: "runs" numbered dots | "ball" glossy coloured balls (live, same as pitch).
  const style = useSelector((s) => s.session.stumpMapStyle);

  useEffect(() => {
    let alive = true;
    loadPitchMapData()
      .then(({ balls, meta }) => {
        if (!alive) return;
        setData({ balls: balls || [], meta: meta || {}, status: balls?.length ? "ready" : "empty" });
      })
      .catch((e) => {
        console.warn("[stumpmap] load failed:", e.message);
        if (alive) setData({ balls: [], meta: {}, status: "error", error: e.message });
      });
    return () => {
      alive = false;
    };
  }, []);

  const deliveries = data.balls;
  const META = data.meta;

  const inningsList = useMemo(() => {
    const s = new Set(deliveries.map((d) => d.innings));
    return Array.from(s).sort((a, b) => a - b);
  }, [deliveries]);

  const maxOverOf = (inn) => {
    const overs = deliveries.filter((d) => d.innings === inn).map((d) => d.over);
    return overs.length ? Math.max(...overs) : 1;
  };
  const maxOver = useMemo(() => maxOverOf(f.innings), [deliveries, f.innings]); // eslint-disable-line react-hooks/exhaustive-deps

  const bowlers = useMemo(() => {
    const s = new Set(
      deliveries.filter((d) => d.innings === f.innings).map((d) => d.bowler),
    );
    return ["all", ...Array.from(s).filter(Boolean)];
  }, [deliveries, f.innings]);

  // Keep the ticker's bowler name in sync with the Bowler FILTER: pick a specific bowler →
  // the blue header shows that name; "All bowlers" → clear it (falls back to the API bowler).
  useEffect(() => {
    dispatch(setStumpBowlerName(f.bowler === "all" ? "" : f.bowler));
  }, [f.bowler, dispatch]);

  useEffect(() => {
    setF((p) => {
      const overFrom = Math.max(1, Math.min(p.overFrom, maxOver));
      const overTo =
        p.phase === "all" ? maxOver : Math.max(1, Math.min(p.overTo, maxOver));
      if (overFrom === p.overFrom && overTo === p.overTo) return p;
      return { ...p, overFrom, overTo };
    });
  }, [maxOver]);

  const set = (patch) => {
    setScenario(null);
    setF((p) => ({ ...p, ...patch }));
  };
  const setPhase = (phase) => {
    if (phase === "custom" || !PHASES[phase]) return set({ phase: "custom" });
    const to = Math.min(PHASES[phase].to, maxOver);
    set({ phase, overFrom: Math.min(PHASES[phase].from, maxOver), overTo: to });
  };
  const setOver = (which, val) => {
    const v = Math.max(1, Math.min(maxOver, Number(val) || 1));
    set({ phase: "custom", [which]: v });
  };
  const applyScenario = (key) => {
    let n = { ...BASE, overTo: maxOver };
    if (key === "spell") n.bowler = bowlers[1] || "all";
    else if (key === "powerplay")
      n = { ...n, phase: "powerplay", overFrom: 1, overTo: Math.min(6, maxOver) };
    else if (key === "first5")
      n = { ...n, phase: "custom", overFrom: 1, overTo: Math.min(5, maxOver) };
    else if (key === "death")
      n = { ...n, phase: "death", overFrom: Math.min(16, maxOver), overTo: maxOver };
    else if (key === "lastover")
      n = { ...n, phase: "custom", overFrom: maxOver, overTo: maxOver };
    else if (key === "wickets") n.outcome = "wickets";
    else if (key === "boundaries") n.outcome = "boundaries";
    else if (key === "vsleft") n.batterHand = "L";
    else if (key === "spin") n.bowlerType = "spin";
    setF((p) => ({ innings: p.innings, ...n }));
    setScenario(key);
  };

  const matched = useMemo(() => {
    const lo = Math.min(f.overFrom, f.overTo);
    const hi = Math.max(f.overFrom, f.overTo);
    const ok = (d) => {
      switch (f.outcome) {
        case "dot":
          return d.outcome === "dot";
        case "runs":
          return d.outcome === "runs";
        case "boundaries":
          return d.outcome === "four" || d.outcome === "six";
        case "wickets":
          return d.outcome === "wicket";
        default:
          return true;
      }
    };
    return deliveries.filter(
      (d) =>
        d.innings === f.innings &&
        (f.bowler === "all" || d.bowler === f.bowler) &&
        d.over >= lo &&
        d.over <= hi &&
        (f.bowlerType === "all" || d.bowler_type === f.bowlerType) &&
        (f.batterHand === "all" || d.batter_hand === f.batterHand) &&
        ok(d),
    );
  }, [deliveries, f]);

  const summary = useMemo(() => {
    const balls = matched.length;
    const legal = matched.filter((d) => d.is_legal).length;
    const runs = matched.reduce((s, d) => s + (d.runs || 0), 0);
    const wickets = matched.filter((d) => d.outcome === "wicket").length;
    const eco = legal ? (runs / legal) * 6 : null;
    return { balls, runs, wickets, eco };
  }, [matched]);

  matchedRef.current = matched;

  // Report the selection up so "Send to Big Screen" pushes the SAME balls.
  useEffect(() => {
    if (onSelection)
      onSelection({
        balls: matched.map((d) => ({
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
        reveal: "together",
        style,
      });
  }, [matched, style, onSelection]);

  // Start → fetch each filtered ball's STUMPS-crossing point and plot it, over by over.
  // Waits for the data to be ready (handles a tab switch), fires once per fresh Start.
  const lastPlayedRef = useRef(runToken);
  useEffect(() => {
    if (!runToken || runToken === lastPlayedRef.current) return;
    if (data.status !== "ready") return;
    lastPlayedRef.current = runToken;

    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const plottable = matchedRef.current;
    const byOver = new Map();
    plottable.forEach((d) => {
      const k = `${d.innings}/${d.over}`;
      if (!byOver.has(k)) byOver.set(k, []);
      byOver.get(k).push(d);
    });
    const groups = Array.from(byOver.values()).sort((a, b) => a[0].over - b[0].over);

    dispatch(setStumpMapDrop(true)); // filters → all-together drop
    dispatch(startStumpMap([]));
    if (!plottable.length) {
      setGeo({ loaded: 0, total: 0, points: [], busy: false });
      return () => ac.abort();
    }

    setGeo({ loaded: 0, total: plottable.length, points: [], busy: true });
    let done = 0;
    const accum = [];
    runPool(
      groups,
      async (balls) => {
        const pts = await Promise.all(
          balls.map(async (d) =>
            buildStumpPoint(d, await loadTrajectory(d.innings, d.over, d.ball)),
          ),
        );
        return { pts: pts.filter(Boolean), count: balls.length };
      },
      {
        concurrency: CONCURRENCY,
        signal: ac.signal,
        onResult: (res) => {
          if (ac.signal.aborted || !res) return;
          done += res.count;
          accum.push(...res.pts);
          if (res.pts.length) dispatch(addStumpMapPoints(res.pts));
          setGeo({
            loaded: done,
            total: plottable.length,
            points: accum.slice(),
            busy: done < plottable.length,
          });
        },
      },
    ).then(() => {
      if (ac.signal.aborted) return;
      setGeo({ loaded: done, total: plottable.length, points: accum, busy: false });
    });

    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runToken, data.status]);

  const chipStyle = (on) =>
    on ? { background: accent, borderColor: accent, color: "#06110A" } : undefined;

  if (data.status === "loading")
    return <div className="smc"><style>{STYLE}</style><div className="smc-state">Loading live data…</div></div>;
  if (data.status === "error")
    return <div className="smc"><style>{STYLE}</style><div className="smc-state err">Couldn’t load match data — {data.error || "API unavailable"}.</div></div>;
  if (data.status === "empty")
    return <div className="smc"><style>{STYLE}</style><div className="smc-state">No deliveries recorded for this match yet.</div></div>;

  return (
    <div className="smc">
      <style>{STYLE}</style>

      <div className="smc-src">
        {META.tag || "match"} · {deliveries.length} balls
      </div>

      {/* Display FIRST: numbered run dots, or glossy coloured balls (by outcome). Live preview. */}
      <div className="smc-dot">
        <button
          className={`smc-chip${style === "runs" ? " on" : ""}`}
          style={chipStyle(style === "runs")}
          onClick={() => dispatch(setStumpMapStyle("runs"))}
        >
          Runs
        </button>
        <button
          className={`smc-chip${style === "ball" ? " on" : ""}`}
          style={chipStyle(style === "ball")}
          onClick={() => dispatch(setStumpMapStyle("ball"))}
        >
          Ball
        </button>
      </div>

      <div className="smc-grid">
        <L label="Innings">
          <select
            value={f.innings}
            onChange={(e) => {
              const inn = Number(e.target.value);
              set({
                innings: inn,
                bowler: "all",
                phase: "all",
                overFrom: 1,
                overTo: maxOverOf(inn),
              });
            }}
          >
            {(inningsList.length ? inningsList : [1]).map((n) => (
              <option key={n} value={n}>
                {n} — {META.innings?.[n] || `Innings ${n}`}
              </option>
            ))}
          </select>
        </L>
        <L label="Bowler">
          <select value={f.bowler} onChange={(e) => set({ bowler: e.target.value })}>
            {bowlers.map((b) => (
              <option key={b} value={b}>
                {b === "all" ? "All bowlers" : b}
              </option>
            ))}
          </select>
        </L>
        <L label="Phase">
          <select value={f.phase} onChange={(e) => setPhase(e.target.value)}>
            {Object.entries(PHASES).map(([k, p]) => (
              <option key={k} value={k}>
                {p.label}
              </option>
            ))}
            <option value="custom">Custom range</option>
          </select>
        </L>
        <L label={`Over range (1–${maxOver})`}>
          <div className="smc-overs">
            <input type="number" min={1} max={maxOver} value={f.overFrom} onChange={(e) => setOver("overFrom", e.target.value)} />
            <span>to</span>
            <input type="number" min={1} max={maxOver} value={f.overTo} onChange={(e) => setOver("overTo", e.target.value)} />
          </div>
        </L>
        <L label="Bowler type">
          <select value={f.bowlerType} onChange={(e) => set({ bowlerType: e.target.value })}>
            <option value="all">All</option>
            <option value="pace">Pace</option>
            <option value="spin">Spin</option>
          </select>
        </L>
        <L label="Batter hand">
          <select value={f.batterHand} onChange={(e) => set({ batterHand: e.target.value })}>
            <option value="all">All</option>
            <option value="R">Right</option>
            <option value="L">Left</option>
          </select>
        </L>
        <L label="Outcome" wide>
          <select value={f.outcome} onChange={(e) => set({ outcome: e.target.value })}>
            <option value="all">All balls</option>
            <option value="dot">Dot balls</option>
            <option value="runs">1–3 runs</option>
            <option value="boundaries">Boundaries (4 &amp; 6)</option>
            <option value="wickets">Wickets</option>
          </select>
        </L>
      </div>

      <div className="smc-cards">
        <C l="Balls" v={summary.balls} />
        <C l="Runs" v={summary.runs} />
        <C l="Wkts" v={summary.wickets} />
        <C l="Econ" v={summary.eco == null ? "–" : summary.eco.toFixed(2)} />
      </div>
      {/* Scenario preset chips LAST (per the requested order). */}
      <div className="smc-scn">
        {SCENARIOS.map((s) => (
          <button
            key={s.key}
            className={`smc-chip${scenario === s.key ? " on" : ""}`}
            style={chipStyle(scenario === s.key)}
            onClick={() => applyScenario(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="smc-geo">
        {geo.busy
          ? `Loading stump crossings… ${geo.loaded}/${geo.total}`
          : geo.points.length
            ? `${geo.points.length} dots plotted · ${geo.total - geo.points.length} not tracked`
            : geo.total
              ? "No stump crossings to plot (untracked)"
              : ""}
      </div>
    </div>
  );
}

const L = ({ label, wide, children }) => (
  <label className={`smc-f${wide ? " wide" : ""}`}>
    <span>{label}</span>
    {children}
  </label>
);
const C = ({ l, v }) => (
  <div className="smc-card">
    <div className="smc-cl">{l}</div>
    <div className="smc-cv">{v}</div>
  </div>
);

const STYLE = `
.smc{margin-top:10px}
.smc-state{padding:14px;border-radius:8px;background:#121a30;border:1px solid #ffffff14;
  color:#aeb7c6;font-size:13px;font-weight:600}
.smc-state.err{background:#3a1414;border-color:#6b1f1f;color:#f0a0a0}
.smc-src{margin-bottom:8px;padding:5px 9px;border-radius:7px;font-size:11px;font-weight:700;
  letter-spacing:.02em;background:#10351f;color:#7ee2a8;border:1px solid #1f6b3f}
.smc-scn{display:flex;flex-wrap:wrap;gap:6px;margin-top:14px}
.smc-chip{padding:6px 10px;border-radius:8px;border:1px solid #ffffff1f;background:#141a2e;
  color:#dfe4ee;font-size:12px;font-weight:600;cursor:pointer}
.smc-chip:hover{background:#1b2440}
.smc-note{margin:8px 0 10px;padding:7px 10px;border-radius:8px;background:#102a26;
  color:#9fe6d6;font-size:12px}
.smc-dot{display:flex;gap:6px;margin-bottom:10px}
.smc-dot .smc-chip{flex:1;text-align:center}
.smc-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}
.smc-f{display:flex;flex-direction:column;gap:4px}
.smc-f.wide{grid-column:1 / -1}
.smc-f>span{font-size:10px;color:#8b95a7;font-weight:700;letter-spacing:.04em;text-transform:uppercase}
.smc-f select,.smc-f input{background:#0f1526;border:1px solid #ffffff22;color:#fff;
  border-radius:7px;padding:7px 8px;font-size:13px;font-weight:600;outline:none}
.smc-f select:focus,.smc-f input:focus{border-color:#2DD4BF}
.smc-overs{display:flex;align-items:center;gap:6px}
.smc-overs input{width:58px}
.smc-overs span{color:#8b95a7;font-size:11px}
.smc-cards{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:10px}
.smc-card{background:#121a30;border:1px solid #ffffff14;border-radius:8px;padding:5px 7px}
.smc-cl{font-size:8.5px;letter-spacing:.08em;text-transform:uppercase;color:#8b95a7;font-weight:700}
.smc-cv{font-size:15px;font-weight:900;margin-top:1px}
.smc-geo{margin-top:6px;font-size:11px;color:#8b95a7;font-weight:600;min-height:0}
.smc-geo:empty{display:none}
`;
