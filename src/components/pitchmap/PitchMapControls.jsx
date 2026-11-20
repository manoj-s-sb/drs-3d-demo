import React, { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { PITCH_ZONE_SETS } from "../../drs/pitchZoneSets";
import { loadPitchMapData, buildPoint } from "./pitchMapData";
import { loadTrajectory } from "../../trajectoryCache";
import { runPool } from "../../pool";
import {
  startPitchMap,
  addPitchMapPoints,
  setPitchMapDrop,
  setPitchMapStandalone,
  setPitchMapView,
  setPitchBowlerName,
  setPitchDotStyle,
} from "../../store/slices/sessionSlice";

// How many trajectory files to fetch at once (the "6 helpers"). ~6 matches the
// browser's per-host connection cap on HTTP/1.1, so more just queue anyway.
const TRAJECTORY_CONCURRENCY = 6;

// Compact Pitch Map analysis controls for the operator dashboard right rail:
// scenario presets + filters + live summary. Reads the real per-ball index from
// the score API (loadPitchMapData). The over range follows the ACTUAL overs
// bowled (not a fixed 20), so a 5-over innings caps at over 5. Geometry (bounce
// points → length-band %) is added in Step 2.

// Phase presets as fractions of the format; `to` is clamped to the overs actually
// bowled at render time, so they never ask for an over that wasn't played.
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

export default function PitchMapControls({ runToken = 0, onSelection }) {
  const dispatch = useDispatch();
  // Dot style: "runs" → white discs with the run value; "ball" → coloured balls + legend.
  const dotStyle = useSelector((s) => s.session.pitchDotStyle);
  // Active pitch-zone set (Seamers / Spinners) → drives the length-distribution bars below.
  const pitchBowlerType = useSelector((s) => s.session.pitchBowlerType);
  const [data, setData] = useState({ balls: [], meta: {}, status: "loading" });
  const [f, setF] = useState({ innings: 1, ...BASE });
  const [scenario, setScenario] = useState("full");
  // Geometry load state for the dot plot: how many of the filtered balls' bounce
  // points have been fetched, and the plotted points (for length-band %).
  const [geo, setGeo] = useState({ loaded: 0, total: 0, points: [], busy: false });
  const abortRef = useRef(null);
  const matchedRef = useRef([]); // current filtered balls, read at Start time

  useEffect(() => {
    let alive = true;
    loadPitchMapData()
      .then(({ balls, meta }) => {
        if (!alive) return;
        setData({ balls: balls || [], meta: meta || {}, status: balls?.length ? "ready" : "empty" });
      })
      .catch((e) => {
        console.warn("[pitchmap] load failed:", e.message);
        if (alive) setData({ balls: [], meta: {}, status: "error", error: e.message });
      });
    return () => {
      alive = false;
    };
  }, []);

  const deliveries = data.balls;
  const META = data.meta;

  // Which innings exist in the data.
  const inningsList = useMemo(() => {
    const s = new Set(deliveries.map((d) => d.innings));
    return Array.from(s).sort((a, b) => a - b);
  }, [deliveries]);

  // Highest over actually bowled in a given innings (caps the over range).
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
  // the blue header shows that name; "All bowlers" → clear it (falls back to the API bowler
  // / "BOWLER"). So selecting a bowler here updates the ticker too, not just the dots.
  useEffect(() => {
    dispatch(setPitchBowlerName(f.bowler === "all" ? "" : f.bowler));
  }, [f.bowler, dispatch]);

  // When the data/over-count changes: for phase "all" snap to the full 1..maxOver,
  // and ALWAYS clamp the range into [1, maxOver] so a stale value can't exclude or
  // over-reach balls (keeps the Balls count correct).
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

  // Scorecard cards come from the index (no geometry needed) → instant.
  const summary = useMemo(() => {
    const balls = matched.length;
    const legal = matched.filter((d) => d.is_legal).length;
    const runs = matched.reduce((s, d) => s + (d.runs || 0), 0);
    const wickets = matched.filter((d) => d.outcome === "wicket").length;
    const eco = legal ? (runs / legal) * 6 : null;
    return { balls, runs, wickets, eco };
  }, [matched]);

  // Length distribution from the fetched bounce points — bucketed into the ACTIVE pitch-zone
  // set (Seamers / Spinners, from the "Bowler type (pitch zones)" toggle), using the SAME
  // zones, names, colours and `z < zone.to` bucketing as the 3D overlay (PitchMapOverlay), so
  // the panel bars always match the on-pitch zones + % and switch with the toggle.
  const bands = useMemo(() => {
    const zones = (PITCH_ZONE_SETS[pitchBowlerType] || PITCH_ZONE_SETS.seamers).zones;
    const pts = geo.points;
    const counts = new Array(zones.length).fill(0);
    pts.forEach((p) => {
      const z = Number(p.z) || 0;
      let idx = zones.length - 1;
      for (let i = 0; i < zones.length; i++) {
        if (z < zones[i].to) { idx = i; break; }
      }
      counts[idx] += 1;
    });
    return zones.map((zn, i) => ({
      key: zn.name,
      label: zn.name,
      color: zn.color,
      pct: pts.length ? (counts[i] / pts.length) * 100 : 0,
    }));
  }, [geo.points, pitchBowlerType]);

  // Keep the current filtered balls in a ref so Start reads the latest selection
  // without the fetch re-running on every filter change.
  matchedRef.current = matched;

  // Report the filtered balls + dot style up so "Send to Big Screen" pushes the SAME
  // balls the preview plots (otherwise the big screen would show the whole over).
  useEffect(() => {
    if (onSelection)
      onSelection({
        balls: matched.map((d) => ({
          innings: d.innings,
          over: d.over,
          ball: d.ball,
          // Per-ball meta so the big screen builds the SAME dot as the preview (LHB flip +
          // runs/outcome from the per-ball index, not the single-over score API).
          runs: d.runs,
          is_wicket: d.is_wicket,
          outcome: d.outcome,
          batter_hand: d.batter_hand,
        })),
        dotStyle,
      });
  }, [matched, dotStyle, onSelection]);

  // ── Dot geometry: fetch bounce points when the operator presses "Start — preview
  // here" (runToken). Each "helper" loads ONE OVER (its ~6 balls) and its dots are
  // shown the moment that over is done — the pitch fills progressively, over by
  // over, instead of waiting for every ball. Cancelled on a new Start. ───────────
  // Also depends on `data.status`: after a tab switch the panel reloads its data
  // asynchronously, so a Start pressed before the data is ready would plot nothing. Gating
  // on "ready" (with a last-played guard) makes Start WAIT for the data and fire once.
  // Seed with the CURRENT token so a remount (switching tabs away and back) never auto-fires
  // on the stale token — only a genuine new Start (token bump after mount) plays.
  const lastPlayedRef = useRef(runToken);
  useEffect(() => {
    if (!runToken || runToken === lastPlayedRef.current) return; // nothing until a NEW Start
    if (data.status !== "ready") return; // data still loading → wait; re-runs when ready
    lastPlayedRef.current = runToken;

    if (abortRef.current) abortRef.current.abort(); // cancel a prior run
    const ac = new AbortController();
    abortRef.current = ac;

    const plottable = matchedRef.current; // full toss / untracked → null → skipped
    // Group the filtered balls by over (one over = one helper's job).
    const overMap = new Map();
    plottable.forEach((d) => {
      const key = `${d.innings}/${d.over}`;
      if (!overMap.has(key)) overMap.set(key, []);
      overMap.get(key).push(d);
    });
    const overs = Array.from(overMap.values()).sort(
      (a, b) => a[0].over - b[0].over,
    );

    // Fresh session: activate the pitch map empty (camera entry starts), then stream.
    dispatch(setPitchMapDrop(false)); // filters UI → quick pop (not the drop reveal)
    dispatch(startPitchMap([]));
    dispatch(setPitchMapStandalone(true)); // same standalone flat-dot render
    dispatch(setPitchMapView("overview")); // default = key-2 (bowler's-end angled), not top

    if (!plottable.length) {
      setGeo({ loaded: 0, total: 0, points: [], busy: false });
      return () => ac.abort();
    }

    setGeo({ loaded: 0, total: plottable.length, points: [], busy: true });
    let done = 0;
    let plotted = 0;
    const accum = []; // local copy for the length-band %

    runPool(
      overs,
      async (overBalls) => {
        // Load this over's balls in parallel, return its (non-null) dots.
        const pts = await Promise.all(
          overBalls.map(async (d) => {
            const traj = await loadTrajectory(d.innings, d.over, d.ball);
            return buildPoint(d, traj);
          }),
        );
        return { pts: pts.filter(Boolean), count: overBalls.length };
      },
      {
        concurrency: TRAJECTORY_CONCURRENCY, // up to 6 overs loading at once
        signal: ac.signal,
        onResult: (res) => {
          if (ac.signal.aborted || !res) return;
          done += res.count;
          plotted += res.pts.length;
          accum.push(...res.pts);
          if (res.pts.length) dispatch(addPitchMapPoints(res.pts)); // reveal this over
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
      setGeo({
        loaded: done,
        total: plottable.length,
        points: accum,
        busy: false,
      });
      void plotted;
    });

    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runToken, data.status]);


  if (data.status === "loading")
    return <div className="pmc"><style>{STYLE}</style><div className="pmc-state">Loading live data…</div></div>;
  if (data.status === "error")
    return <div className="pmc"><style>{STYLE}</style><div className="pmc-state err">Couldn’t load match data — {data.error || "API unavailable"}.</div></div>;
  if (data.status === "empty")
    return <div className="pmc"><style>{STYLE}</style><div className="pmc-state">No deliveries recorded for this match yet.</div></div>;

  return (
    <div className="pmc">
      <style>{STYLE}</style>

      <div className="pmc-src">
        {META.tag || "match"} · {deliveries.length} balls
      </div>

      {/* Dot style FIRST: "With runs" (white discs + run value) or "By ball" (coloured balls
          + the outcome legend). Live preview. */}
      <div className="pmc-dot">
        <button
          className={`pmc-chip${dotStyle === "runs" ? " on" : ""}`}
          onClick={() => dispatch(setPitchDotStyle("runs"))}
        >
          With runs
        </button>
        <button
          className={`pmc-chip${dotStyle === "ball" ? " on" : ""}`}
          onClick={() => dispatch(setPitchDotStyle("ball"))}
        >
          By ball
        </button>
      </div>

      <div className="pmc-grid">
        <L label="Innings">
          <select
            value={f.innings}
            onChange={(e) => {
              const inn = Number(e.target.value);
              // Over ranges aren't comparable across innings → reset to the new
              // innings' full range so the Balls count is always correct.
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
          <div className="pmc-overs">
            <input
              type="number"
              min={1}
              max={maxOver}
              value={f.overFrom}
              onChange={(e) => setOver("overFrom", e.target.value)}
            />
            <span>to</span>
            <input
              type="number"
              min={1}
              max={maxOver}
              value={f.overTo}
              onChange={(e) => setOver("overTo", e.target.value)}
            />
          </div>
        </L>
        <L label="Bowler type">
          <select
            value={f.bowlerType}
            onChange={(e) => set({ bowlerType: e.target.value })}
          >
            <option value="all">All</option>
            <option value="pace">Pace</option>
            <option value="spin">Spin</option>
          </select>
        </L>
        <L label="Batter hand">
          <select
            value={f.batterHand}
            onChange={(e) => set({ batterHand: e.target.value })}
          >
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

      <div className="pmc-cards">
        <C l="Balls" v={summary.balls} />
        <C l="Runs" v={summary.runs} />
        <C l="Wkts" v={summary.wickets} />
        <C l="Econ" v={summary.eco == null ? "–" : summary.eco.toFixed(2)} />
      </div>
      <div className="pmc-bands">
        {bands.map((b) => (
          <div key={b.key} className="pmc-brow">
            <span className="pmc-bname">{b.label}</span>
            <span className="pmc-btrack">
              <span
                className="pmc-bfill"
                style={{ width: `${b.pct}%`, background: b.color }}
              />
            </span>
            <span className="pmc-bpct">{b.pct.toFixed(0)}%</span>
          </div>
        ))}
      </div>
      {/* Scenario preset chips LAST (per the requested order). */}
      <div className="pmc-scn">
        {SCENARIOS.map((s) => (
          <button
            key={s.key}
            className={`pmc-chip${scenario === s.key ? " on" : ""}`}
            onClick={() => applyScenario(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="pmc-geo">
        {geo.busy
          ? `Loading bounce points… ${geo.loaded}/${geo.total}`
          : geo.points.length
            ? `${geo.points.length} dots plotted · ${geo.total - geo.points.length} not tracked`
            : geo.total
              ? "No bounce points to plot (full tosses / untracked)"
              : ""}
      </div>
    </div>
  );
}

const L = ({ label, wide, children }) => (
  <label className={`pmc-f${wide ? " wide" : ""}`}>
    <span>{label}</span>
    {children}
  </label>
);
const C = ({ l, v }) => (
  <div className="pmc-card">
    <div className="pmc-cl">{l}</div>
    <div className="pmc-cv">{v}</div>
  </div>
);

const STYLE = `
.pmc{margin-top:10px}
.pmc-state{padding:14px;border-radius:8px;background:#121a30;border:1px solid #ffffff14;
  color:#aeb7c6;font-size:13px;font-weight:600}
.pmc-state.err{background:#3a1414;border-color:#6b1f1f;color:#f0a0a0}
.pmc-src{margin-bottom:8px;padding:5px 9px;border-radius:7px;font-size:11px;font-weight:700;
  letter-spacing:.02em;background:#10351f;color:#7ee2a8;border:1px solid #1f6b3f}
.pmc-scn{display:flex;flex-wrap:wrap;gap:6px;margin-top:14px}
.pmc-chip{padding:6px 10px;border-radius:8px;border:1px solid #ffffff1f;background:#141a2e;
  color:#dfe4ee;font-size:12px;font-weight:600;cursor:pointer}
.pmc-chip:hover{background:#1b2440}
.pmc-chip.on{background:#A78BFA;border-color:#A78BFA;color:#1a1030}
.pmc-note{margin:8px 0 10px;padding:7px 10px;border-radius:8px;background:#1a1536;
  color:#c3b6ef;font-size:12px}
.pmc-dot{display:flex;gap:6px;margin-bottom:10px}
.pmc-dot .pmc-chip{flex:1;text-align:center}
.pmc-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}
.pmc-f{display:flex;flex-direction:column;gap:4px}
.pmc-f.wide{grid-column:1 / -1}
.pmc-f>span{font-size:10px;color:#8b95a7;font-weight:700;letter-spacing:.04em;text-transform:uppercase}
.pmc-f select,.pmc-f input{background:#0f1526;border:1px solid #ffffff22;color:#fff;
  border-radius:7px;padding:7px 8px;font-size:13px;font-weight:600;outline:none}
.pmc-f select:focus,.pmc-f input:focus{border-color:#A78BFA}
.pmc-overs{display:flex;align-items:center;gap:6px}
.pmc-overs input{width:58px}
.pmc-overs span{color:#8b95a7;font-size:11px}
.pmc-cards{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:10px}
.pmc-card{background:#121a30;border:1px solid #ffffff14;border-radius:8px;padding:5px 7px}
.pmc-cl{font-size:8.5px;letter-spacing:.08em;text-transform:uppercase;color:#8b95a7;font-weight:700}
.pmc-cv{font-size:15px;font-weight:900;margin-top:1px}
.pmc-bands{margin-top:9px;display:flex;flex-direction:column;gap:3px}
.pmc-brow{display:grid;grid-template-columns:96px 1fr 34px;align-items:center;gap:8px;font-size:11px}
.pmc-bname{color:#c5ccd8;font-weight:600}
.pmc-btrack{height:8px;border-radius:4px;background:#ffffff14;overflow:hidden}
.pmc-bfill{display:block;height:100%;background:linear-gradient(90deg,#6366f1,#A78BFA)}
.pmc-bpct{text-align:right;color:#aeb7c6;font-variant-numeric:tabular-nums;font-weight:700}
.pmc-geo{margin-top:6px;font-size:11px;color:#8b95a7;font-weight:600;min-height:0}
.pmc-geo:empty{display:none}
`;
