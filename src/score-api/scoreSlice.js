// Redux slice for the score snapshot (GET /snapshot).
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { fetchSnapshot, fetchBalls } from "./api";
import { REQUEST_STATUS } from "./types";

// Load the score snapshot for one delivery.
export const loadSnapshot = createAsyncThunk(
  "score/loadSnapshot",
  async ({ match, innings, over, ball }) => {
    return await fetchSnapshot({ match, innings, over, ball });
  },
);

// Parse one ballLog entry (the API's per-ball outcome string, e.g. "0","1","4",
// "6","W","Wd","Nb") into { runs, isWicket }. Extras/edge cases are best-effort:
//   • runs    = the leading number in the string (0 when there's none).
//   • isWicket= the entry marks a wicket ("W") but NOT a wide ("Wd").
function parseBallLog(raw) {
  const s = String(raw ?? "").trim();
  const up = s.toUpperCase();
  const isWicket = up.includes("W") && !up.includes("WD"); // "W" wicket, "Wd" wide
  const m = s.match(/\d+/);
  return { runs: m ? parseInt(m[0], 10) : 0, isWicket };
}

// Bowling analysis for ONE over. The new score API returns the WHOLE over in a
// single call (GET /api/snapshot?match&innings&over — no ball ⇒ end of the over),
// so one request gives everything the multi-ball ticker needs EXCEPT ball speed:
//
//   WHERE EACH FIELD COMES FROM
//   • bowler + per-ball runs & wickets     → GET /balls (one row per delivery, each
//       carrying its own over/ball/bowler/code). The snapshot can NOT be trusted for
//       these: at the end of an over its "current bowler" is already the NEXT over's
//       bowler, prevOverBowler is stale, and engine.ballLog is the WHOLE INNINGS so far
//       (not this over). The snapshot fields stay only as a fallback if /balls fails.
//   • batting team / bowling team / totals → snapshot. The over/innings are the SELECTION.
//   • ball SPEED                           → NOT here — it comes from the trajectory
//       JSON and is read directly by the ticker from accumulatedTrajectories.
export const loadBowlingAnalysis = createAsyncThunk(
  "score/loadBowlingAnalysis",
  async ({ match, innings, over }) => {
    // One call for the whole over (ball omitted ⇒ the API returns the full over), plus
    // the innings' per-delivery list for the over's real bowler + outcomes. /balls is
    // best-effort: if it fails we fall back to the snapshot fields.
    const [snap, ballsRes] = await Promise.all([
      fetchSnapshot({ match, innings, over }),
      fetchBalls({ match, innings }).catch((err) => {
        console.warn("[score-api] /balls failed — using snapshot bowler/ballLog", err);
        return null;
      }),
    ]);
    const allBalls = Array.isArray(ballsRes?.balls)
      ? ballsRes.balls
      : Array.isArray(ballsRes)
        ? ballsRes
        : [];
    const overBalls = allBalls.filter(
      (b) =>
        Number(b?.over) === Number(over) &&
        (innings == null || Number(b?.innings) === Number(innings)),
    );
    // Score source. The API exposes the live score line as `score` (GET /snapshot, see
    // types.js) AND as `live` (GET /match-state → { …, live:{ bowler:{name}, striker, … } }).
    // Read `score` first, then `live`, then the older engine/info shape — so the bowler/teams
    // resolve no matter which the endpoint returns.
    const score = snap?.score ?? snap?.live ?? {};
    const eng = snap?.engine ?? {};
    const info = snap?.info ?? {};

    // Per-ball outcomes for the over, keyed by ball number (extras count as balls, same
    // as the trajectory ballNo). From /balls; fallback: the snapshot ballLog, where
    // ballLog[i] is ball (i + 1).
    const byBall = {};
    overBalls.forEach((b) => {
      byBall[String(b.ball)] = parseBallLog(b.code);
    });
    let log = [];
    if (!overBalls.length) {
      if (Array.isArray(score.ballLog)) log = score.ballLog;
      else if (Array.isArray(eng.ballLog)) log = eng.ballLog;
    }
    log.forEach((entry, i) => {
      byBall[String(i + 1)] = parseBallLog(entry);
    });

    // Bowler for this over: from /balls (the delivery rows of THIS over); fall back to the
    // snapshot's score.bowler, then the older engine fields.
    const bowlerEntry =
      eng.bowlers?.[eng.currentBowlerIndex] ?? eng.bowlers?.[0] ?? null;
    const ballsBowler = overBalls.find((b) => b?.bowler)?.bowler;
    const bowler =
      (typeof ballsBowler === "string" ? ballsBowler : ballsBowler?.name) ||
      score.bowler?.name ||
      (typeof score.bowler === "string" ? score.bowler : null) ||
      eng.prevOverBowler ||
      bowlerEntry?.name ||
      null;
    // Best-effort bowler hand ("RHB"/"LHB") for the ticker header tag. null (tag hidden) when none.
    // Look the bowler up BY NAME — the engine's "current" entry can be the next over's bowler.
    const styleEntry = ballsBowler
      ? eng.bowlers?.find((b) => b?.name === bowler) ?? null
      : bowlerEntry;
    const rawStyle = String(
      (!ballsBowler && (score.bowler?.style || score.bowler?.hand)) ||
        styleEntry?.style ||
        styleEntry?.hand ||
        styleEntry?.battingStyle ||
        "",
    ).toUpperCase();
    const bowlerHand = rawStyle.includes("LH")
      ? "LHB"
      : rawStyle.includes("RH")
        ? "RHB"
        : null;

    return {
      bowler, // API (/balls row bowler for this over)
      bowlerHand, // API (best-effort; null if unknown)
      battingTeam: score.battingTeam ?? eng.battingTeam ?? info.team1 ?? null, // API
      bowlingTeam: score.bowlingTeam ?? eng.bowlingTeam ?? info.team2 ?? null, // API
      over: String(snap?.over ?? snap?.at?.over ?? over), // selection
      innings: String(snap?.innings ?? snap?.at?.innings ?? innings), // selection
      totalRuns:
        typeof score.runs === "number"
          ? score.runs
          : typeof eng.total === "number"
            ? eng.total
            : null, // API (cumulative)
      wickets:
        typeof score.wickets === "number"
          ? score.wickets
          : typeof eng.wickets === "number"
            ? eng.wickets
            : null, // API (cumulative)
      byBall, // API (per-ball runs/wickets from /balls codes)
    };
  },
);

const initialState = {
  /** @type {import("./types").Snapshot | null} */
  snapshot: null,
  status: REQUEST_STATUS.IDLE, // idle | loading | succeeded | failed
  error: null,
  /** @type {{bowler:string|null, battingTeam:string|null, bowlingTeam:string|null,
   *          over:string|null, innings:string|null, totalRuns:number|null,
   *          wickets:number|null, byBall:Object} | null} */
  bowling: null, // one-call-per-over analysis (bowler + teams + per-ball runs/wkts)
};

const scoreSlice = createSlice({
  name: "score",
  initialState,
  reducers: {
    clearSnapshot: (state) => {
      state.snapshot = null;
      state.status = REQUEST_STATUS.IDLE;
      state.error = null;
    },
    // Set a snapshot directly (used on the big screen when the operator pushes
    // it over the cross-tab channel).
    setSnapshot: (state, action) => {
      state.snapshot = action.payload;
      state.status = REQUEST_STATUS.SUCCEEDED;
      state.error = null;
    },
    // Bowling analysis, set directly (big screen receives it over the channel).
    setBowlingAnalysis: (state, action) => {
      state.bowling = action.payload;
    },
    clearBowlingAnalysis: (state) => {
      state.bowling = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadSnapshot.pending, (state) => {
        state.status = REQUEST_STATUS.LOADING;
        state.error = null;
      })
      .addCase(loadSnapshot.fulfilled, (state, action) => {
        state.status = REQUEST_STATUS.SUCCEEDED;
        state.snapshot = action.payload;
      })
      .addCase(loadSnapshot.rejected, (state, action) => {
        state.status = REQUEST_STATUS.FAILED;
        state.error = action.error?.message || "Failed to load snapshot";
        console.error("[score-api] loadSnapshot failed:", state.error);
      })
      .addCase(loadBowlingAnalysis.fulfilled, (state, action) => {
        state.bowling = action.payload;
      })
      .addCase(loadBowlingAnalysis.rejected, (state, action) => {
        console.error(
          "[score-api] loadBowlingAnalysis failed:",
          action.error?.message,
        );
      });
  },
});

export const {
  clearSnapshot,
  setSnapshot,
  setBowlingAnalysis,
  clearBowlingAnalysis,
} = scoreSlice.actions;
export default scoreSlice.reducer;
