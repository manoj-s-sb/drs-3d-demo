// Score/snapshot REST API endpoints + base URL.
// The base now comes from the Redux data-source config (apiIp/apiPort), which
// the operator edits in the Server & Dataset modal and is persisted to
// localStorage. These constants are only the fallback used before any config
// exists (or if the store can't be read).
import { store } from "../store/store";

export const API_DEFAULT_IP = "192.168.0.100";
export const API_DEFAULT_PORT = "3001";
// Path prefix appended after the host for every score API call, e.g.
//   http://192.168.0.100:3001/api/snapshot?...
export const API_PREFIX = "/api";

// "http://<ip>:<port>" (no trailing slash), read live from the store so a change
// in the modal takes effect immediately for every subsequent request.
export function apiBase() {
  let ip = API_DEFAULT_IP;
  let port = API_DEFAULT_PORT;
  try {
    const ds = store.getState().dataSource || {};
    if (ds.apiIp) ip = String(ds.apiIp).trim();
    if (ds.apiPort !== undefined && ds.apiPort !== null)
      port = String(ds.apiPort).trim();
  } catch {
    /* store not ready — use defaults */
  }
  const host = port ? `${ip}:${port}` : ip;
  return `http://${host}`.replace(/\/+$/, "");
}

export const ENDPOINTS = {
  // GET ?match=&innings=&over=&ball= — score snapshot for one delivery.
  SNAPSHOT: "/snapshot",
  // GET — the match that is live now (matchId, tag, teams, format).
  LIVE: "/live",
  // GET — every match (id, tag, team1/2, format…); used to resolve a selected
  // match tag → match_id for roster calls.
  MATCHES: "/matches",
  // GET ?match=<tag>&innings= — every delivery (runs, outcome, wicket, bowler,
  // striker, legality…). The per-ball index for the Pitch Map analysis.
  BALLS: "/balls",
  // GET /teams/:team/players?match=<id> — roster with style (→ hand / pace-spin).
  // Path carries the team name, so build it with teamPlayersPath(team).
  TEAMS: "/teams",
};

// "/teams/<team>/players" with the team name URL-encoded.
export function teamPlayersPath(team) {
  return `${ENDPOINTS.TEAMS}/${encodeURIComponent(team)}/players`;
}

// Build "<base><prefix><path>?<query>".
export function apiUrlWithQuery(path, query = {}) {
  const p = path.startsWith("/") ? path : `/${path}`;
  const qs = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return apiBase() + API_PREFIX + p + (qs ? `?${qs}` : "");
}
