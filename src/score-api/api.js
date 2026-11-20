// Score API calls. Logs each response to the console.
import axios from "axios";
import { apiUrlWithQuery, ENDPOINTS, teamPlayersPath } from "./endpoints";
import { cacheBust } from "../dataSource";

// Shared GET: logs, cache-busts, throws on non-2xx. Returns res.data.
async function apiGet(path, query = {}) {
  const url = apiUrlWithQuery(path, query);
  const res = await axios.get(cacheBust(url), { validateStatus: () => true });
  console.log("[score-api] GET", url, "→", res.status);
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`GET ${path} failed: HTTP ${res.status}`);
  }
  return res.data;
}

/**
 * GET /snapshot?match=&innings=&over=&ball= — the score state for one delivery.
 * @returns {Promise<import("./types").Snapshot>}
 */
export async function fetchSnapshot({ match, innings, over, ball }) {
  const url = apiUrlWithQuery(ENDPOINTS.SNAPSHOT, { match, innings, over, ball });
  const res = await axios.get(cacheBust(url), { validateStatus: () => true });
  console.log("[score-api] GET", url, "→", res.status, res.data);
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`GET /snapshot failed: HTTP ${res.status}`);
  }
  return res.data;
}

/** GET /live — the match that is live now ({matchId, match, team1, team2, format}). */
export async function fetchLive() {
  return apiGet(ENDPOINTS.LIVE);
}

/** GET /matches — every match ({matches:[{match_id, match, team1, team2, format…}]}). */
export async function fetchMatches() {
  return apiGet(ENDPOINTS.MATCHES);
}

/**
 * GET /balls?match=<tag>&innings= — every delivery of the match (or one innings).
 * Used as the per-ball index for the Pitch Map analysis.
 */
export async function fetchBalls({ match, innings } = {}) {
  return apiGet(ENDPOINTS.BALLS, { match, innings });
}

/** GET /teams/:team/players?match=<id> — a team's roster (name, jersey, style…). */
export async function fetchTeamPlayers({ match, team }) {
  return apiGet(teamPlayersPath(team), { match });
}

// Quick manual test from the console:
//   await scoreApi.fetchSnapshot({match:"ab-cd-2026-08-06",innings:1,over:4,ball:4})
if (typeof window !== "undefined") {
  window.scoreApi = {
    ...(window.scoreApi || {}),
    fetchSnapshot,
    fetchLive,
    fetchMatches,
    fetchBalls,
    fetchTeamPlayers,
  };
}
