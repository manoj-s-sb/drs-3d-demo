import React, { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { loadPitchMapData, buildWagonLine, styleToHand } from "./pitchMapData";
import { loadTrajectory } from "../../trajectoryCache";
import { runPool } from "../../pool";
import { startWagon, addWagonLines, setWagonReveal, setWagonDuration, setWagonSweep, setWagonStyle, setWagonBatterName, setWagonNameKeepCase, setWagonOutcomes, setWagonBatHand } from "../../store/slices/sessionSlice";
import { isLocal, listInnings, listOvers, listBalls, DELIVERY_FILE, cacheBust } from "../../dataSource";

// SAMPLE (local) mode: there's no balls/roster API, so the filters can't drive anything.
// We just load the curated /highlights sixes and draw their trajectories so the operator can
// preview the ANIMATION. (On a real machine connection the full filters above take over.)
const HILITE_BASE = "/highlights";
async function loadSampleWagonLines(signal) {
  const inns = await listInnings(HILITE_BASE);
  const jobs = [];
  for (const inn of inns) {
    const overs = await listOvers(inn, HILITE_BASE);
    for (const ov of overs) {
      const balls = await listBalls(inn, ov, HILITE_BASE);
      for (const bl of balls) jobs.push({ innings: Number(inn), over: Number(ov), ball: Number(bl) });
    }
  }
  const out = [];
  for (const j of jobs) {
    if (signal?.aborted) break;
    const url = `${HILITE_BASE}/in-${j.innings}/${j.over}/${j.ball}/${DELIVERY_FILE}`;
    const traj = await fetch(cacheBust(url), { signal }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const b = traj?.balls?.[0];
    const runs = Number(b?.runs) || 6; // sample sixes
    const line = buildWagonLine(
      {
        innings: j.innings,
        over: j.over,
        ball: j.ball,
        runs,
        is_wicket: false,
        outcome: runs === 6 ? "six" : runs === 4 ? "four" : "runs",
        batter_hand: styleToHand(traj?.batter?.battingHand),
      },
      traj,
    );
    if (line) out.push(line);
  }
  return out;
}

// Wagon Wheel "Filters" controls — a copy of the pitch/stump filter panels, but it draws one
// LINE per scoring shot (bat impact → landing, from each ball's `afterImpact` flight) on a
// top-down ground view. Same balls API + match roster for names. Defaults to SIXES.
const CONCURRENCY = 6;

const PHASES = {
  all: { label: "All overs", from: 1, to: Infinity },
  powerplay: { label: "Powerplay (1–6)", from: 1, to: 6 },
  middle: { label: "Middle (7–15)", from: 7, to: 15 },
  death: { label: "Death (16–20)", from: 16, to: 20 },
};
// Scenario presets (shown at the bottom, like the pitch/stump panels).
const SCENARIOS = [
  { key: "full", label: "Full innings" },
  { key: "powerplay", label: "Powerplay" },
  { key: "death", label: "Death" },
];
// The wagon wheel is built for ONE subject at a time — either a BATSMAN (their shots) or a
// BOWLER (shots off them). The `subject` toggle picks which; only that one's selector shows,
// and there is no cross-relation between batsman and bowler.
const BASE = {
  subject: "batsman", // "batsman" | "bowler"
  batsman: "all",
  bowler: "all",
  batStyle: "all", // all | R | L — narrows the batsman list / filters shots by hand
  phase: "all",
  overFrom: 1,
  overTo: 1,
  bowlerType: "all", // all | pace | spin — narrows shots in bowler mode
  // Boundary toggles — independent, multi-select. Default: sixes only.
  fours: false,
  sixes: true,
};

export default function WagonFilterControls({ runToken = 0, accent = "#F472B6", onSelection }) {
  const dispatch = useDispatch();
  const wagonReveal = useSelector((s) => s.session.wagonReveal);
  const wagonDuration = useSelector((s) => s.session.wagonDuration);
  const wagonSweep = useSelector((s) => s.session.wagonSweep);
  const wagonStyle = useSelector((s) => s.session.wagonStyle);
  const wagonBatterName = useSelector((s) => s.session.wagonBatterName);
  const wagonNameKeepCase = useSelector((s) => s.session.wagonNameKeepCase);
  const [data, setData] = useState({ balls: [], meta: {}, status: "loading" });
  const [f, setF] = useState({ innings: 1, ...BASE });
  const [scenario, setScenario] = useState(null);
  const [geo, setGeo] = useState({ loaded: 0, total: 0, lines: [], busy: false });
  const abortRef = useRef(null);
  const matchedRef = useRef([]);

  useEffect(() => {
    let alive = true;
    loadPitchMapData()
      .then(({ balls, meta }) => {
        if (!alive) return;
        setData({ balls: balls || [], meta: meta || {}, status: balls?.length ? "ready" : "empty" });
      })
      .catch((e) => {
        console.warn("[wagon] load failed:", e.message);
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

  // Bowlers who bowled in this innings (real names from the API). "all" = every bowler.
  const bowlers = useMemo(() => {
    const s = new Set(deliveries.filter((d) => d.innings === f.innings).map((d) => d.bowler));
    return ["all", ...Array.from(s).filter(Boolean)];
  }, [deliveries, f.innings]);

  // Batsmen who faced in this innings — the normalized ball stores the striker NAME as `batter`.
  // Narrowed by the batStyle filter (RHB=R / LHB=L, from the roster-derived batter_hand).
  const batsmen = useMemo(() => {
    const s = new Set(
      deliveries
        .filter(
          (d) =>
            d.innings === f.innings &&
            (f.batStyle === "all" || d.batter_hand === f.batStyle),
        )
        .map((d) => d.batter),
    );
    return ["all", ...Array.from(s).filter(Boolean)];
  }, [deliveries, f.innings, f.batStyle]);

  useEffect(() => {
    setF((p) => {
      const overFrom = Math.max(1, Math.min(p.overFrom, maxOver));
      const overTo = p.phase === "all" ? maxOver : Math.max(1, Math.min(p.overTo, maxOver));
      if (overFrom === p.overFrom && overTo === p.overTo) return p;
      return { ...p, overFrom, overTo };
    });
  }, [maxOver]);

  // If a specifically-picked batsman/bowler drops out of the list (e.g. innings or style change),
  // fall back to "all" rather than a wrong name.
  useEffect(() => {
    setF((p) => (batsmen.includes(p.batsman) ? p : { ...p, batsman: "all" }));
  }, [batsmen]);
  useEffect(() => {
    setF((p) => (bowlers.includes(p.bowler) ? p : { ...p, bowler: "all" }));
  }, [bowlers]);

  // Mirror the Fours/Sixes selection to the store so the ticker legend matches the panel.
  useEffect(() => {
    dispatch(setWagonOutcomes({ fours: f.fours, sixes: f.sixes }));
  }, [f.fours, f.sixes, dispatch]);

  // OFF/LEG ground labels' sides come from the batsman's HAND. Priority:
  //   1) a specific batsman is picked → look up THAT batsman's batter_hand from the API data
  //   2) else the Batsman-style (RHB/LHB) filter
  //   3) else default RHB
  useEffect(() => {
    let hand = null;
    if (f.batsman && f.batsman !== "all") {
      const d = deliveries.find(
        (x) => x.innings === f.innings && x.batter === f.batsman && x.batter_hand,
      );
      if (d) hand = d.batter_hand;
    }
    if (!hand && f.batStyle !== "all") hand = f.batStyle;
    dispatch(setWagonBatHand(hand === "L" ? "L" : "R"));
  }, [f.batsman, f.batStyle, f.innings, deliveries, dispatch]);

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
    // Scenarios tweak overs / bowler-type only — the required batsman & bowler selections are
    // preserved (they have no "All").
    const patch = { phase: "all", overFrom: 1, overTo: maxOver };
    if (key === "powerplay")
      Object.assign(patch, { phase: "powerplay", overFrom: 1, overTo: Math.min(6, maxOver) });
    else if (key === "death")
      Object.assign(patch, { phase: "death", overFrom: Math.min(16, maxOver), overTo: maxOver });
    setF((p) => ({ ...p, ...patch }));
    setScenario(key);
  };

  const matched = useMemo(() => {
    const lo = Math.min(f.overFrom, f.overTo);
    const hi = Math.max(f.overFrom, f.overTo);
    // Boundary toggles: include fours and/or sixes per the two chips (both can be on).
    const ok = (d) =>
      (f.fours && d.outcome === "four") || (f.sixes && d.outcome === "six");
    // Name match is trim + case-insensitive so a stray space / casing from the API never
    // silently yields zero shots.
    const norm = (s) => String(s || "").trim().toLowerCase();
    const wantBat = norm(f.batsman);
    const wantBowl = norm(f.bowler);
    // ONE subject only — batsman OR bowler. No cross-relation between the two.
    const subjectOk =
      f.subject === "bowler"
        ? (d) =>
            (f.bowler === "all" || norm(d.bowler) === wantBowl) &&
            (f.bowlerType === "all" || d.bowler_type === f.bowlerType)
        : (d) =>
            (f.batsman === "all" || norm(d.batter) === wantBat) &&
            (f.batStyle === "all" || d.batter_hand === f.batStyle);
    return deliveries.filter(
      (d) => d.innings === f.innings && d.over >= lo && d.over <= hi && subjectOk(d) && ok(d),
    );
  }, [deliveries, f]);

  const summary = useMemo(() => {
    const shots = matched.length;
    const runs = matched.reduce((s, d) => s + (d.runs || 0), 0);
    const fours = matched.filter((d) => d.outcome === "four").length;
    const sixes = matched.filter((d) => d.outcome === "six").length;
    return { shots, runs, fours, sixes };
  }, [matched]);

  matchedRef.current = matched;

  // Report the selection up so "Send to Big Screen" can push the SAME shots.
  useEffect(() => {
    if (onSelection)
      onSelection({
        balls: matched.map((d) => ({
          innings: d.innings,
          over: d.over,
          ball: d.ball,
          runs: d.runs,
          is_wicket: d.is_wicket,
          outcome: d.outcome,
          batter_hand: d.batter_hand,
        })),
      });
  }, [matched, onSelection]);

  // Start → fetch each filtered ball's SHOT path and draw its wagon line, over by over.
  const lastPlayedRef = useRef(runToken);
  useEffect(() => {
    if (!runToken || runToken === lastPlayedRef.current) return;
    // Local (sample) mode has no balls API → the status may never be "ready"; the sample branch
    // below loads /highlights directly, so only gate on "ready" for the machine path.
    if (!isLocal() && data.status !== "ready") return;
    lastPlayedRef.current = runToken;

    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    // ── SAMPLE mode: ignore filters, just play the curated /highlights trajectories. ──
    if (isLocal()) {
      dispatch(startWagon([]));
      setGeo({ loaded: 0, total: 0, lines: [], busy: true });
      loadSampleWagonLines(ac.signal)
        .then((lines) => {
          if (ac.signal.aborted) return;
          if (lines.length) dispatch(addWagonLines(lines));
          setGeo({ loaded: lines.length, total: lines.length, lines, busy: false });
        })
        .catch(() => {
          if (!ac.signal.aborted) setGeo({ loaded: 0, total: 0, lines: [], busy: false });
        });
      return () => ac.abort();
    }

    const plottable = matchedRef.current;
    const byOver = new Map();
    plottable.forEach((d) => {
      const k = `${d.innings}/${d.over}`;
      if (!byOver.has(k)) byOver.set(k, []);
      byOver.get(k).push(d);
    });
    const groups = Array.from(byOver.values()).sort((a, b) => a[0].over - b[0].over);

    dispatch(startWagon([]));
    if (!plottable.length) {
      setGeo({ loaded: 0, total: 0, lines: [], busy: false });
      return () => ac.abort();
    }

    setGeo({ loaded: 0, total: plottable.length, lines: [], busy: true });
    let done = 0;
    const accum = [];
    runPool(
      groups,
      async (balls) => {
        const lines = await Promise.all(
          balls.map(async (d) =>
            buildWagonLine(d, await loadTrajectory(d.innings, d.over, d.ball)),
          ),
        );
        return { lines: lines.filter(Boolean), count: balls.length };
      },
      {
        concurrency: CONCURRENCY,
        signal: ac.signal,
        onResult: (res) => {
          if (ac.signal.aborted || !res) return;
          done += res.count;
          accum.push(...res.lines);
          if (res.lines.length) dispatch(addWagonLines(res.lines));
          setGeo({
            loaded: done,
            total: plottable.length,
            lines: accum.slice(),
            busy: done < plottable.length,
          });
        },
      },
    ).then(() => {
      if (ac.signal.aborted) return;
      setGeo({ loaded: done, total: plottable.length, lines: accum, busy: false });
    });

    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runToken, data.status]);

  const chipStyle = (on) =>
    on ? { background: accent, borderColor: accent, color: "#1a0a12" } : undefined;

  // Sweep direction: the one-by-one order goes round the ground FROM THE LEG SIDE, clockwise or
  // anticlockwise. Same for sample + machine.
  const renderSweep = () => (
    <div className="wwc-quick">
      <button
        className={`wwc-chip${wagonSweep === "cw" ? " on" : ""}`}
        style={chipStyle(wagonSweep === "cw")}
        onClick={() => dispatch(setWagonSweep("cw"))}
      >
        ↻ Clockwise
      </button>
      <button
        className={`wwc-chip${wagonSweep === "ccw" ? " on" : ""}`}
        style={chipStyle(wagonSweep === "ccw")}
        onClick={() => dispatch(setWagonSweep("ccw"))}
      >
        ↺ Anticlockwise
      </button>
    </div>
  );

  // Beam shape: ACTUAL trajectory (real flight arc with the bounce) vs LINE trajectory (a straight
  // bat→landing line, no bounce). Same for sample + machine.
  const renderStyle = () => (
    <div className="wwc-quick">
      <button
        className={`wwc-chip${wagonStyle === "actual" ? " on" : ""}`}
        style={chipStyle(wagonStyle === "actual")}
        onClick={() => dispatch(setWagonStyle("actual"))}
      >
        Actual trajectory
      </button>
      <button
        className={`wwc-chip${wagonStyle === "line" ? " on" : ""}`}
        style={chipStyle(wagonStyle === "line")}
        onClick={() => dispatch(setWagonStyle("line"))}
      >
        Line trajectory
      </button>
    </div>
  );

  // Total-duration field: "N shots · finish in [X] s (≈ Y ms/ball)". Editing the total adapts
  // the per-ball speed (duration ÷ count) — reduce the total and every trajectory speeds up.
  const renderDuration = (count) => {
    const n = Math.max(1, count || 0);
    const msPerBall = Math.round((wagonDuration * 1000) / n);
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, letterSpacing: ".04em", textTransform: "uppercase", color: "#8b95a7", fontWeight: 700 }}>
          {count ? `${count} shots · finish in` : "Finish in"}
        </span>
        <input
          className="wwc-dur"
          type="number"
          min={0.5}
          max={60}
          step={0.5}
          value={wagonDuration}
          onChange={(e) => dispatch(setWagonDuration(e.target.value))}
        />
        <span style={{ fontSize: 11, color: "#8b95a7" }}>
          s{count ? ` · ≈${msPerBall} ms/ball` : ""}
        </span>
      </div>
    );
  };

  // SAMPLE mode: no live filters — show a note + the Fours/Sixes & play-mode toggles only.
  // Pressing Start plays the curated /highlights trajectories (animation preview).
  if (isLocal()) {
    return (
      <div className="wwc">
        <style>{STYLE}</style>
        <div className="wwc-state">
          Sample data — press <b>Start</b> to play the highlight trajectories. Filters apply on a
          live machine connection.
        </div>
        <div className="wwc-quick" style={{ marginTop: 10 }}>
          <button
            className={`wwc-chip${wagonReveal !== "together" ? " on" : ""}`}
            style={chipStyle(wagonReveal !== "together")}
            onClick={() => dispatch(setWagonReveal("sequential"))}
          >
            One by one
          </button>
          <button
            className={`wwc-chip${wagonReveal === "together" ? " on" : ""}`}
            style={chipStyle(wagonReveal === "together")}
            onClick={() => dispatch(setWagonReveal("together"))}
          >
            All together
          </button>
        </div>
        {renderSweep()}
        {renderStyle()}
        {renderDuration(geo.lines.length)}
        <div className="wwc-geo">
          {geo.busy
            ? `Loading trajectories… ${geo.loaded}/${geo.total}`
            : geo.lines.length
              ? `${geo.lines.length} trajectories plotted`
              : ""}
        </div>
      </div>
    );
  }

  if (data.status === "loading")
    return <div className="wwc"><style>{STYLE}</style><div className="wwc-state">Loading live data…</div></div>;
  if (data.status === "error")
    return <div className="wwc"><style>{STYLE}</style><div className="wwc-state err">Couldn’t load match data — {data.error || "API unavailable"}.</div></div>;
  if (data.status === "empty")
    return <div className="wwc"><style>{STYLE}</style><div className="wwc-state">No deliveries recorded for this match yet.</div></div>;

  return (
    <div className="wwc">
      <style>{STYLE}</style>

      <div className="wwc-src">
        {META.tag || "match"} · {deliveries.length} balls
      </div>

      {/* Subject toggle: BATSMAN only for now — the Bowler option is hidden (easy to restore).
          With a single option the row is omitted; the wheel always builds for the batsman. */}
      {/*
      <div className="wwc-quick">
        <button
          className={`wwc-chip${f.subject === "batsman" ? " on" : ""}`}
          style={chipStyle(f.subject === "batsman")}
          onClick={() => set({ subject: "batsman" })}
        >
          Batsman
        </button>
        <button
          className={`wwc-chip${f.subject === "bowler" ? " on" : ""}`}
          style={chipStyle(f.subject === "bowler")}
          onClick={() => set({ subject: "bowler" })}
        >
          Bowler
        </button>
      </div>
      */}

      {/* Boundary toggles — independent (select Fours, Sixes, or both). */}
      <div className="wwc-quick">
        <button
          className={`wwc-chip${f.fours ? " on" : ""}`}
          style={chipStyle(f.fours)}
          onClick={() => set({ fours: !f.fours })}
        >
          Fours
        </button>
        <button
          className={`wwc-chip${f.sixes ? " on" : ""}`}
          style={chipStyle(f.sixes)}
          onClick={() => set({ sixes: !f.sixes })}
        >
          Sixes
        </button>
      </div>

      {/* Play mode: beams one-by-one (then all stay) or all together in one shot. */}
      <div className="wwc-quick">
        <button
          className={`wwc-chip${wagonReveal !== "together" ? " on" : ""}`}
          style={chipStyle(wagonReveal !== "together")}
          onClick={() => dispatch(setWagonReveal("sequential"))}
        >
          One by one
        </button>
        <button
          className={`wwc-chip${wagonReveal === "together" ? " on" : ""}`}
          style={chipStyle(wagonReveal === "together")}
          onClick={() => dispatch(setWagonReveal("together"))}
        >
          All together
        </button>
      </div>
      {renderSweep()}
      {renderStyle()}
      {renderDuration(summary.shots)}

      <div className="wwc-grid">
        <L label="Innings">
          <select
            value={f.innings}
            onChange={(e) => {
              const inn = Number(e.target.value);
              set({ innings: inn, batsman: "all", bowler: "all", phase: "all", overFrom: 1, overTo: maxOverOf(inn) });
            }}
          >
            {(inningsList.length ? inningsList : [1]).map((n) => (
              <option key={n} value={n}>
                {n} — {META.innings?.[n] || `Innings ${n}`}
              </option>
            ))}
          </select>
        </L>
        {/* BATSMAN mode → style + batsman picker. BOWLER mode → type + bowler picker. */}
        {f.subject === "batsman" ? (
          <>
            <L label="Batsman style">
              <select value={f.batStyle} onChange={(e) => set({ batStyle: e.target.value })}>
                <option value="all">All</option>
                <option value="R">RHB</option>
                <option value="L">LHB</option>
              </select>
            </L>
            <L label="Batsman" wide>
              <select value={f.batsman} onChange={(e) => set({ batsman: e.target.value })}>
                {batsmen.map((b) => (
                  <option key={b} value={b}>{b === "all" ? "All batsmen" : b}</option>
                ))}
              </select>
            </L>
          </>
        ) : (
          <>
            <L label="Bowler type">
              <select value={f.bowlerType} onChange={(e) => set({ bowlerType: e.target.value })}>
                <option value="all">All</option>
                <option value="pace">Pace</option>
                <option value="spin">Spin</option>
              </select>
            </L>
            <L label="Bowler" wide>
              <select value={f.bowler} onChange={(e) => set({ bowler: e.target.value })}>
                {bowlers.map((b) => (
                  <option key={b} value={b}>{b === "all" ? "All bowlers" : b}</option>
                ))}
              </select>
            </L>
          </>
        )}
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
        <L label={`Over range (1–${maxOver})`} wide>
          <div className="wwc-overs">
            <input type="number" min={1} max={maxOver} value={f.overFrom} onChange={(e) => setOver("overFrom", e.target.value)} />
            <span>to</span>
            <input type="number" min={1} max={maxOver} value={f.overTo} onChange={(e) => setOver("overTo", e.target.value)} />
          </div>
        </L>
      </div>

      <div className="wwc-cards">
        <C l="Shots" v={summary.shots} />
        <C l="Runs" v={summary.runs} />
        <C l="4s" v={summary.fours} />
        <C l="6s" v={summary.sixes} />
      </div>

      {/* Scenario preset chips LAST. */}
      <div className="wwc-scn">
        {SCENARIOS.map((s) => (
          <button
            key={s.key}
            className={`wwc-chip${scenario === s.key ? " on" : ""}`}
            style={chipStyle(scenario === s.key)}
            onClick={() => applyScenario(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="wwc-geo">
        {geo.busy
          ? `Loading shots… ${geo.loaded}/${geo.total}`
          : geo.lines.length
            ? `${geo.lines.length} shots plotted · ${geo.total - geo.lines.length} not tracked`
            : geo.total
              ? "No shot paths to plot (untracked)"
              : ""}
      </div>

      {/* Editable ticker name at the BOTTOM — sits just above the standard Ticker checkbox
          (rendered right below this panel), so the two line up together. Auto-filled from the
          picked batsman; editable. */}
      <div className="wwc-name">
        <span>Ticker name</span>
        <input
          type="text"
          value={wagonBatterName}
          placeholder="BATSMAN"
          onChange={(e) => dispatch(setWagonBatterName(e.target.value))}
        />
        {/* Keep case: show the name exactly as typed (off → forced UPPERCASE on the ticker). */}
        <button
          type="button"
          className={`wwc-chip${wagonNameKeepCase ? " on" : ""}`}
          style={chipStyle(wagonNameKeepCase)}
          title="Keep name case as typed (off → UPPERCASE)"
          onClick={() => dispatch(setWagonNameKeepCase(!wagonNameKeepCase))}
        >
          Keep case
        </button>
      </div>
    </div>
  );
}

const L = ({ label, wide, children }) => (
  <label className={`wwc-f${wide ? " wide" : ""}`}>
    <span>{label}</span>
    {children}
  </label>
);
const C = ({ l, v }) => (
  <div className="wwc-card">
    <div className="wwc-cl">{l}</div>
    <div className="wwc-cv">{v}</div>
  </div>
);

const STYLE = `
.wwc{margin-top:10px}
.wwc-state{padding:14px;border-radius:8px;background:#121a30;border:1px solid #ffffff14;
  color:#aeb7c6;font-size:13px;font-weight:600}
.wwc-state.err{background:#3a1414;border-color:#6b1f1f;color:#f0a0a0}
.wwc-src{margin-bottom:8px;padding:5px 9px;border-radius:7px;font-size:11px;font-weight:700;
  letter-spacing:.02em;background:#351028;color:#f3a6d2;border:1px solid #6b1f52}
.wwc-quick{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}
.wwc-scn{display:flex;flex-wrap:wrap;gap:6px;margin-top:14px}
.wwc-chip{padding:6px 10px;border-radius:8px;border:1px solid #ffffff1f;background:#141a2e;
  color:#dfe4ee;font-size:12px;font-weight:600;cursor:pointer}
.wwc-chip:hover{background:#1b2440}
.wwc-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}
.wwc-f{display:flex;flex-direction:column;gap:4px}
.wwc-f.wide{grid-column:1 / -1}
.wwc-f>span{font-size:10px;color:#8b95a7;font-weight:700;letter-spacing:.04em;text-transform:uppercase}
.wwc-f select,.wwc-f input{background:#0f1526;border:1px solid #ffffff22;color:#fff;
  border-radius:7px;padding:7px 8px;font-size:13px;font-weight:600;outline:none}
.wwc-f select:focus,.wwc-f input:focus{border-color:#F472B6}
.wwc-overs{display:flex;align-items:center;gap:6px}
.wwc-overs input{width:58px}
.wwc-dur{width:64px;background:#0f1526;border:1px solid #ffffff22;color:#fff;border-radius:7px;padding:6px 8px;font-size:13px;font-weight:700;outline:none}
.wwc-dur:focus{border-color:#F472B6}
.wwc-name{display:flex;align-items:center;gap:8px;margin-top:10px}
.wwc-name>span{font-size:10px;letter-spacing:.04em;text-transform:uppercase;color:#8b95a7;font-weight:700;flex:none}
.wwc-name input{flex:1;min-width:0;background:#0f1526;border:1px solid #ffffff22;color:#fff;border-radius:7px;padding:7px 9px;font-size:13px;font-weight:700;outline:none}
.wwc-name input:focus{border-color:#F472B6}
.wwc-overs span{color:#8b95a7;font-size:11px}
.wwc-cards{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:10px}
.wwc-card{background:#121a30;border:1px solid #ffffff14;border-radius:8px;padding:5px 7px}
.wwc-cl{font-size:8.5px;letter-spacing:.08em;text-transform:uppercase;color:#8b95a7;font-weight:700}
.wwc-cv{font-size:15px;font-weight:900;margin-top:1px}
.wwc-geo{margin-top:6px;font-size:11px;color:#8b95a7;font-weight:600;min-height:0}
.wwc-geo:empty{display:none}
`;
