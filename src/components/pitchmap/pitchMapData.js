// Pitch Map data layer (Step 1): build the per-ball index from the score API.
//   /api/live            → match id + tag + teams + format
//   /api/balls           → every delivery (runs, outcome, wicket, bowler, striker…)
//   /api/teams/:t/players → roster style → batter hand + bowler pace/spin
// Geometry (bounce_x/y from trajectory_data.json) is added LATER, lazily, per dot.
import { fetchMatches, fetchBalls, fetchTeamPlayers } from "../../score-api/api";
import { store } from "../../store/store";
import { parseBallPitching, parseTrajectoryArray } from "../drs/trajectoryGeometry";
import { listInnings, listOvers, listBalls, isLocal } from "../../dataSource";
import { loadTrajectory } from "../../trajectoryCache";

const SCALE = 0.01; // cm → metres, same as showCommands

/**
 * Build a pitch-map dot point from an index ball + its trajectory JSON.
 * Returns null for a full toss / untracked ball (no bounce point → not plotted).
 * `line flip` keeps the off side consistent for left-handers.
 *   → { x, y, z, ballNo, over, runs, isWicket, outcome }
 */
export function buildPoint(indexBall, trajJson) {
  const b = trajJson?.balls?.[0];
  const p = b ? parseBallPitching(b, SCALE) : null;
  if (!p) return null; // full toss / no tracking → counted elsewhere, not plotted
  const x = indexBall.batter_hand === "L" ? -p.x : p.x; // flip for LHB
  return {
    x,
    y: p.y,
    z: p.z,
    ballNo: indexBall.ball,
    over: indexBall.over,
    innings: indexBall.innings,
    runs: indexBall.runs,
    isWicket: indexBall.is_wicket,
    outcome: indexBall.outcome,
  };
}

// STUMP MAP — where the ball crosses the stumps/crease plane (z ≈ 1.22 m). Walk the
// delivery trajectory and interpolate (x, y) at that z, giving the ball's LINE + HEIGHT
// on the stumps plane. Returns null if the ball never reaches the stumps (e.g. hit away
// before crossing) → not plotted, like the pitch map skips full tosses.
const STUMP_Z = 1.22; // metres down the pitch (the crease line the user specified)
export function buildStumpPoint(indexBall, trajJson) {
  const b = trajJson?.balls?.[0];
  const pts = b ? parseTrajectoryArray(b.trajectory, SCALE) : null;
  if (!pts || pts.length < 2) return null;
  // Find the segment where z crosses STUMP_Z (ball travels bowler→batter, z decreasing).
  let hit = null;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1].pos;
    const c = pts[i].pos;
    if ((a.z - STUMP_Z) * (c.z - STUMP_Z) <= 0 && a.z !== c.z) {
      const t = (STUMP_Z - a.z) / (c.z - a.z);
      hit = { x: a.x + (c.x - a.x) * t, y: a.y + (c.y - a.y) * t };
      break;
    }
  }
  if (!hit) return null;
  const x = indexBall.batter_hand === "L" ? -hit.x : hit.x; // flip for LHB
  return {
    x,
    y: hit.y,
    ballNo: indexBall.ball,
    over: indexBall.over,
    runs: indexBall.runs,
    isWicket: indexBall.is_wicket,
    outcome: indexBall.outcome,
  };
}

// INTERCEPTION MAP — where the ball MET THE BAT (bat-impact point), not the stumps. Prefer the
// first post-impact sample (afterImpact[0]); if that isn't tracked, fall back to the END of the
// delivery trajectory (the ball's last tracked spot ≈ the impact). Returns null only if NOTHING
// was tracked for the ball.
export function buildImpactPoint(indexBall, trajJson) {
  const b = trajJson?.balls?.[0];
  if (!b) return null;
  // 1) real post-impact flight start
  let p = null;
  const arr = b.afterImpact;
  const aiPts = arr && arr.length ? parseTrajectoryArray(arr, SCALE) : null;
  if (aiPts && aiPts.length) {
    p = aiPts[0].pos;
  } else {
    // 2) fallback: the delivery trajectory's last point (where the ball reached the bat)
    const dPts = b.trajectory ? parseTrajectoryArray(b.trajectory, SCALE) : null;
    if (dPts && dPts.length) p = dPts[dPts.length - 1].pos;
  }
  if (!p) return null;
  const x = indexBall.batter_hand === "L" ? -p.x : p.x; // flip for LHB
  return {
    x,
    y: p.y,
    z: p.z, // real down-the-pitch position → ball is "stopped" at the true impact point
    ballNo: indexBall.ball,
    over: indexBall.over,
    runs: indexBall.runs,
    isWicket: indexBall.is_wicket,
    outcome: indexBall.outcome,
  };
}

// WAGON WHEEL — one line per SCORING shot, from the bat-impact point out to where the
// ball finished (the shot's `afterImpact` flight: bat → outfield). Returns null if the ball
// has no post-impact shot path (no run-scoring stroke tracked). Coordinates in metres on the
// ground plane (x across, z down the pitch); x is flipped for a left-hander so the off/leg
// side stays consistent, matching the pitch/stump maps.
export function buildWagonLine(indexBall, trajJson) {
  const b = trajJson?.balls?.[0];
  const arr = b?.afterImpact;
  if (!arr || arr.length < 2) return null; // no tracked shot flight → not drawn
  const pts = parseTrajectoryArray(arr, SCALE);
  if (!pts || pts.length < 2) return null;
  const flip = indexBall.batter_hand === "L" ? -1 : 1; // mirror LHB so off/leg stays consistent
  // afterImpact can be very dense (thousands of points) and may continue past the landing
  // (bounces/roll). Trim at the FIRST landing (y returns to ~ground after the apex) so the beam
  // is just the carry, then downsample to a smooth, cheap control set for the tube.
  let end = pts.length - 1;
  let apexI = 0;
  for (let i = 1; i < pts.length; i++) if (pts[i].pos.y > pts[apexI].pos.y) apexI = i;
  for (let i = apexI + 1; i < pts.length; i++) {
    if (pts[i].pos.y <= 0.02) { end = i; break; } // first ground touch after the apex
  }
  const trimmed = pts.slice(0, end + 1);
  const MAXP = 60;
  const stride = Math.max(1, Math.floor(trimmed.length / MAXP));
  const sampled = trimmed.filter((_, i) => i % stride === 0);
  if (sampled[sampled.length - 1] !== trimmed[trimmed.length - 1]) sampled.push(trimmed[trimmed.length - 1]);
  // Full 3D flight path (bat → landing), metres, x mirrored for a left-hander. y is the real
  // ball height so the beam reads as a trajectory, not a flat line.
  const path = sampled.map((p) => [p.pos.x * flip, Math.max(p.pos.y, 0), p.pos.z]);
  const s = path[0];
  const l = path[path.length - 1];
  const dx = l[0] - s[0];
  const dz = l[2] - s[2];
  const distance = Math.hypot(dx, dz); // ground distance bat → landing (m)
  // sixDir: horizontal angle of the shot (0 = straight down the ground, +ve = off for a RHB).
  const sixDir = Math.atan2(dx, dz);
  let apexY = 0;
  for (const p of path) if (p[1] > apexY) apexY = p[1];
  return {
    path, // [[x,y,z], …] metres — the beam follows this curve
    sx: s[0],
    sz: s[2],
    lx: l[0],
    lz: l[2],
    apexY,
    distance,
    sixDir,
    ballNo: indexBall.ball,
    over: indexBall.over,
    innings: indexBall.innings,
    runs: indexBall.runs,
    isWicket: indexBall.is_wicket,
    outcome: indexBall.outcome,
    batterHand: indexBall.batter_hand || null, // "R" | "L" → drives the OFF/LEG ground labels
  };
}

// ── style → hand / bowling type ────────────────────────────────────────────
const SPIN = ["OB", "LB", "LBG", "SLA", "SLC"];
const norm = (s) => String(s || "").toUpperCase().replace(/[\s.-]+/g, "");

export function styleToHand(style) {
  const s = norm(style);
  if (s.startsWith("RHB") || s === "R" || s.includes("RIGHTHAND")) return "R";
  if (s.startsWith("LHB") || s === "L" || s.includes("LEFTHAND")) return "L";
  return null; // unknown (default XI / no style)
}
export function styleToType(style) {
  const s = norm(style);
  if (!s) return null;
  if (SPIN.includes(s) || s.includes("SPIN") || s.includes("BREAK") || s.includes("ORTHODOX"))
    return "spin";
  // Any seam/pace code (RF/RFM/RM/LF/LM…) or the word fast/medium.
  if (/^[RL](F|FM|MF|M)$/.test(s) || s.includes("FAST") || s.includes("MEDIUM"))
    return "pace";
  return null; // unknown
}

// ── outcome bucket from a /api/balls row ───────────────────────────────────
export function deriveOutcome(b) {
  if (b.wicket) return "wicket";
  if (b.boundary === 6) return "six";
  if (b.boundary === 4) return "four";
  if ((b.runs?.total ?? 0) > 0) return "runs";
  return "dot";
}

// Short wicket tag from the dismissal type ("how"): show the DISMISSAL (LBW, etc.)
// rather than a generic "W" so an LBW reads as "LBW" in the ball box. Falls back to
// "W" when the type is unknown. Shared by the DRS & Pitch-Map ball selectors.
export function dismissalTag(how) {
  const h = String(how ?? "").toLowerCase().replace(/[_\s]+/g, " ").trim();
  if (!h) return "W";
  if (h.includes("lbw")) return "LBW";
  if (h.includes("run out")) return "RO";
  if (h.includes("stump")) return "ST";
  if (h.includes("hit wicket")) return "HW";
  if (h.includes("caught") || h.includes("catch") || h === "c") return "C";
  if (h.includes("bowled") || h === "b") return "B";
  return "W";
}

// Last (family) name, lower-cased — used to match a short ball name ("Raza") to a roster full
// name ("Sikandar Raza") when the ball has no striker_id.
const lastName = (name) => {
  const parts = String(name || "").trim().toLowerCase().split(/\s+/);
  return parts[parts.length - 1] || "";
};

// Build {byId, byName, byLast} → {hand, type} from a players[] roster response. byLast lets a
// short ball name resolve by family name when striker_id is missing (it's a FALLBACK only, so a
// cross-team family-name collision can't override an exact id/name match).
function indexRoster(players, map) {
  (players || []).forEach((p) => {
    const entry = { hand: styleToHand(p.style), type: styleToType(p.style), style: p.style };
    if (p.player_id) map.byId[p.player_id] = entry;
    if (p.name) {
      map.byName[p.name] = entry;
      const ln = lastName(p.name);
      if (ln && !map.byLast[ln]) map.byLast[ln] = entry; // first roster entry wins on collision
    }
  });
}

// Resolve the match from the OPERATOR-SELECTED dataset (dataSource.match) — the
// same match the dashboard header shows. We take the tag from there and look up
// its match_id / teams / format in /api/matches (needed for the roster calls).
// (No /api/live — that's whatever is live on the scoring system, not what's picked.)
async function resolveMatch() {
  const ds = store.getState().dataSource || {};
  const tag = ds.match || null;
  if (!tag) return { matchId: null, tag: null, team1: null, team2: null, format: "T20" };
  let row = null;
  try {
    const res = await fetchMatches();
    row =
      (res?.matches || []).find((m) => m.match === tag || m.key === tag) || null;
  } catch {
    /* /api/matches unavailable — still fetch balls by tag, skip rosters */
  }
  return {
    matchId: row?.match_id || null,
    tag,
    team1: row?.team1 || null,
    team2: row?.team2 || null,
    format: row?.format || "T20",
  };
}

/**
 * Load the per-ball index for the Pitch Map. The CONNECTION / data source decides:
 *   • Sample data (local)  → read the LOCAL dataset files only (never calls the API).
 *   • Server (API)         → read the score API ONLY. If it fails / has no data, show
 *                            nothing (empty) — NEVER fall back to sample/dummy data.
 * @returns {Promise<{meta, balls: object[], source: "api"|"local"}>}
 */
export async function loadPitchMapData() {
  if (isLocal()) {
    const local = await loadFromLocal();
    return { ...local, source: "local" };
  }
  // Server source → API only, no local fallback.
  const api = await loadFromApi();
  return { ...api, source: "api" };
}

// ── LOCAL fallback: build the index from the dataset folders + trajectory JSON ──
// (runs/wicket from each ball's trajectory_data.json, like Bowling Analysis). No
// score API. innings 0 (calibration) is skipped.
async function loadFromLocal() {
  const inns = await listInnings();
  const balls = [];
  for (const inn of inns) {
    const innNum = Number(inn);
    if (!Number.isFinite(innNum) || innNum < 1) continue;
    const overs = await listOvers(inn);
    for (const ov of overs) {
      const bls = await listBalls(inn, ov);
      for (const bl of bls) {
        const traj = await loadTrajectory(inn, ov, bl).catch(() => null);
        const b = traj?.balls?.[0];
        const runs = Number(b?.runs) || 0;
        const isWkt = !!b?.wicket && b.wicket !== "not_out";
        balls.push({
          innings: innNum,
          over: Number(ov),
          ball: Number(bl),
          bowler: traj?.bowler?.name || null,
          bowler_id: null,
          bowler_type: styleToType(traj?.bowler?.bowlingType),
          batter: traj?.batter?.name || null,
          striker_id: null,
          batter_hand: styleToHand(traj?.batter?.battingHand),
          runs,
          runs_bat: runs,
          outcome: isWkt
            ? "wicket"
            : runs === 6
              ? "six"
              : runs === 4
                ? "four"
                : runs > 0
                  ? "runs"
                  : "dot",
          boundary: runs === 4 ? 4 : runs === 6 ? 6 : null,
          is_wicket: isWkt,
          dismissal: b?.dismissal || null,
          bowling_end: b?.bowling_end || null, // "near" | "far" if present locally
          onfield_decision: b?.onField || null, // usually absent locally (manual)
          is_legal: true, // no extras info in the trajectory JSON
          bounce_x: null,
          bounce_y: null,
          full_toss: false,
          no_track: false,
        });
      }
    }
  }
  return { meta: { tag: "local dataset", format: "T20", innings: {} }, balls };
}

/** API index (score API). Throws / returns empty when the API has no data. */
async function loadFromApi() {
  const m = await resolveMatch();
  if (!m.tag) return { meta: {}, balls: [] };

  // Roster style map (both teams), fetched in parallel with the balls.
  const styleMap = { byId: {}, byName: {}, byLast: {} };
  const [ballsRes] = await Promise.all([
    fetchBalls({ match: m.tag }),
    ...(m.matchId && m.team1
      ? [
          fetchTeamPlayers({ match: m.matchId, team: m.team1 })
            .then((r) => indexRoster(r.players, styleMap))
            .catch(() => {}),
        ]
      : []),
    ...(m.matchId && m.team2
      ? [
          fetchTeamPlayers({ match: m.matchId, team: m.team2 })
            .then((r) => indexRoster(r.players, styleMap))
            .catch(() => {}),
        ]
      : []),
  ]);

  const styleOf = (id, name) =>
    (id && styleMap.byId[id]) ||
    (name && styleMap.byName[name]) ||
    (name && styleMap.byLast[lastName(name)]) || // fallback: short name → family name
    {};

  const balls = (ballsRes?.balls || [])
    .filter((b) => Number(b.innings) >= 1) // drop innings 0 (Cal / calibration balls)
    .map((b) => {
    const bowlerStyle = styleOf(b.bowler_id, b.bowler);
    const batStyle = styleOf(b.striker_id, b.striker);
    return {
      innings: b.innings,
      over: b.over,
      ball: b.ball,
      bowler: b.bowler,
      bowler_id: b.bowler_id || null,
      bowler_type: bowlerStyle.type || null, // pace | spin | null(unknown)
      batter: b.striker,
      striker_id: b.striker_id || null,
      batter_hand: batStyle.hand || null, // R | L | null(unknown)
      runs: b.runs?.total ?? 0,
      runs_bat: b.runs?.batsman ?? 0,
      outcome: deriveOutcome(b), // dot|runs|four|six|wicket
      boundary: b.boundary ?? null,
      is_wicket: !!b.wicket,
      dismissal: b.wicket?.how || null,
      is_legal: b.legal !== false,
      bowling_end: b.bowling_end || null, // "near" | "far" — drives DRS camera default
      // On-field call for the DRS Original-Decision auto-pick ("out" | "notout").
      onfield_decision: b.drs?.onField || b.onField || null,
      // geometry — filled lazily by the dot plot:
      bounce_x: null,
      bounce_y: null,
      full_toss: false,
      no_track: false,
    };
  });

  // Innings labels: the BATTING side per innings (from the ball rows; skip innings 0). Labelled
  // by who is BATTING so the batsman list matches the label (picking "AFG batting" lists AFG
  // batsmen). Falls back to "<bowling_team> bowling" only when no batting_team is present.
  const inningsLabels = {};
  (ballsRes?.balls || []).forEach((b) => {
    if (Number(b.innings) < 1 || inningsLabels[b.innings]) return;
    if (b.batting_team) inningsLabels[b.innings] = `${b.batting_team} batting`;
    else if (b.bowling_team) inningsLabels[b.innings] = `${b.bowling_team} bowling`;
  });

  return {
    meta: {
      matchId: m.matchId,
      tag: m.tag,
      format: m.format,
      innings: inningsLabels,
    },
    balls,
  };
}
