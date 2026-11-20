import React, { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { loadPitchMapData, buildPoint, dismissalTag } from "./pitchMapData";
import { loadTrajectory } from "../../trajectoryCache";
import { PITCH_MAP_CAMERA } from "../../drs/pitchMapAnimations";
import {
  startPitchMap,
  addPitchMapPoints,
  setPitchMapDrop,
  setPitchMapStandalone,
  setPitchMapView,
  setPitchDotStyle,
} from "../../store/slices/sessionSlice";

// STANDALONE Pitch Mapping UI — a copy of PitchMapDrsControls, used ONLY by the
// standalone "Pitch" mode so it can be redesigned independently WITHOUT affecting the
// pitch mapping inside Bowling Analysis (which keeps using the originals). Start point
// for the new standalone UI.
const ONE_BY_ONE_GAP_MS = 350; // delay between overs in "one by one" reveal
// Hold the dots until the camera has craned over to the top view, so the move happens
// FIRST and the dots animate in only once we're looking down at the pitch.
const CAMERA_SETTLE_MS = (PITCH_MAP_CAMERA.entryDuration || 1.6) * 1000 + 200;

// Short run/outcome tag for a ball-index record (matches the DRS ball tags).
function runTag(d) {
  if (d.is_wicket) return dismissalTag(d.dismissal); // LBW / C / B / RO … (not plain "W")
  if (d.outcome === "four") return "4";
  if (d.outcome === "six") return "6";
  if (!d.is_legal) return "•"; // wide / no-ball
  return String(d.runs ?? 0);
}

export default function PitchMapStandaloneControls({
  runToken = 0,
  accent = "#A78BFA",
  onSelection,
}) {
  const dispatch = useDispatch();
  const [data, setData] = useState({ balls: [], meta: {}, status: "loading" });
  const [selMode, setSelMode] = useState("single"); // single | multiple
  const [reveal, setReveal] = useState("together"); // together | onebyone
  const [dotStyle, setDotStyle] = useState("runs"); // runs | ball (dot label)
  const [innings, setInnings] = useState(1);
  const [over, setOver] = useState(null); // single: chosen over (single-select)
  const [ballSel, setBallSel] = useState([]); // single: chosen balls (MULTI-select)
  const [overs, setOvers] = useState([]); // multiple: chosen overs
  const abortRef = useRef(null);

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

  // Report the selection up so "Send to Big Screen" can push the SAME balls the
  // operator picked (otherwise the big screen would show the whole over).
  useEffect(() => {
    if (onSelection)
      onSelection({
        balls: selectedBalls.map((d) => ({
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
        reveal, // "together" | "onebyone" → the big screen reveals the same way
        dotStyle, // "runs" | "ball" → the big screen labels dots the same way
      });
  }, [selectedBalls, reveal, dotStyle, onSelection]);

  // Totals for the little summary line.
  const totals = useMemo(() => {
    const bs = selectedBalls;
    const runs = bs.reduce((s, d) => s + (d.runs || 0), 0);
    const wkts = bs.filter((d) => d.is_wicket).length;
    return { balls: bs.length, runs, wkts };
  }, [selectedBalls]);

  // Start → fetch the selected balls' bounce points and render them. Grouped by
  // over so "one by one" reveals over-by-over; "all together" shows them at once.
  //
  // Depends on BOTH runToken AND selectedBalls: after a tab switch the panel reloads its
  // data asynchronously, so when Start is pressed the default over/balls selection may not
  // be populated yet. Gating on `selectedBalls` (with a last-played guard so a later filter
  // change can't auto-replay) means the Start WAITS for the selection to be ready and fires
  // once — instead of silently no-op'ing on an empty selection (which looked like "not
  // playing" right after switching from Filters).
  // Seed with the CURRENT token so a remount (switching tabs away and back) never auto-fires
  // on the stale token — only a genuine new Start (token bump after mount) plays.
  const lastPlayedRef = useRef(runToken);
  useEffect(() => {
    if (!runToken || runToken === lastPlayedRef.current) return;
    const sel = selectedBalls;
    if (!sel.length) return; // selection not ready yet → wait; re-runs when it populates
    lastPlayedRef.current = runToken;

    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    // "All together" → dots DROP from the top; "one by one" → quick pop.
    dispatch(setPitchMapDrop(reveal === "together"));
    dispatch(setPitchDotStyle(dotStyle)); // "runs" | "ball" dot label
    dispatch(startPitchMap([]));
    dispatch(setPitchMapStandalone(true)); // top-view flat-dot renderer + bowler ticker
    dispatch(setPitchMapView("overview")); // main view = key-2 (bowler's-end angled), not top

    // Pre-load every ball's bounce point WHILE the camera cranes over, then reveal the
    // dots only AFTER the camera reaches the top view — so the move comes first and the
    // dots animate in on the settled view (one-by-one or all together).
    (async () => {
      const pts = (
        await Promise.all(
          sel.map(async (d) =>
            buildPoint(d, await loadTrajectory(d.innings, d.over, d.ball)),
          ),
        )
      ).filter(Boolean);
      if (ac.signal.aborted) return;
      // Wait for the camera move to finish.
      await new Promise((r) => setTimeout(r, CAMERA_SETTLE_MS));
      if (ac.signal.aborted) return;
      if (reveal === "together") {
        dispatch(addPitchMapPoints(pts)); // all drop in at once
      } else {
        for (const pt of pts) {
          if (ac.signal.aborted) return;
          dispatch(addPitchMapPoints([pt])); // one after another
          await new Promise((r) => setTimeout(r, ONE_BY_ONE_GAP_MS));
        }
      }
    })();
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runToken, selectedBalls]);

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
      </div>

      {/* How to reveal the dots on screen */}
      <div className="pmd-field">
        <span className="pmd-flbl">How to play</span>
        <div className="pmd-seg">
          <button className={`db-segbtn${reveal === "onebyone" ? " on" : ""}`} style={reveal === "onebyone" ? { background: accent } : undefined} onClick={() => setReveal("onebyone")}>One by one</button>
          <button className={`db-segbtn${reveal === "together" ? " on" : ""}`} style={reveal === "together" ? { background: accent } : undefined} onClick={() => setReveal("together")}>All together</button>
        </div>
      </div>

      {/* Dot label: show the RUN value, or the BALL number (colour stays by outcome) */}
      <div className="pmd-field">
        <span className="pmd-flbl">Dot style</span>
        <div className="pmd-seg">
          <button className={`db-segbtn${dotStyle === "runs" ? " on" : ""}`} style={dotStyle === "runs" ? { background: accent } : undefined} onClick={() => { setDotStyle("runs"); dispatch(setPitchDotStyle("runs")); }}>With runs</button>
          <button className={`db-segbtn${dotStyle === "ball" ? " on" : ""}`} style={dotStyle === "ball" ? { background: accent } : undefined} onClick={() => { setDotStyle("ball"); dispatch(setPitchDotStyle("ball")); }}>By ball</button>
        </div>
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
.pmd-field{display:flex;align-items:center;gap:10px}
.pmd-flbl{width:92px;flex:none;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#8b95a7;font-weight:800}
.pmd-seg{display:flex;flex:1;gap:2px;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:4px}
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
