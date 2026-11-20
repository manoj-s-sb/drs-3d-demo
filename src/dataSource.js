// URL helpers built from the Redux data-source config (the single source of
// truth — see store/slices/dataSourceSlice.js). Any fetch in the project should
// build its URL through these so the whole app follows the configured server +
// path and the current match/innings/over/ball selection.
import axios from "axios";
import { store } from "./store/store";

// The delivery JSON that lives inside every ball folder.
export const DELIVERY_FILE = "trajectory_data.json";

// Normalise a host the operator typed: drop any scheme prefix and trailing
// slashes so building `http://<ip>:<port>` never doubles the scheme (a pasted
// "http://192.168.0.200/" becomes "192.168.0.200"). If the value already
// carries a port (has a ":"), keep it and don't append another.
export function cleanHost(ip) {
  return String(ip || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
}

// "http://<ip>:<port>" with no trailing slash.
export function getServerBase() {
  const { ip, port } = store.getState().dataSource;
  const h = cleanHost(ip);
  const host = h.includes(":") ? h : port ? `${h}:${port}` : h;
  return `http://${host}`.replace(/\/+$/, "");
}

// Server base + an absolute server path, e.g. dataUrl("/foo/bar.json").
export function dataUrl(path = "/") {
  const base = getServerBase();
  const p = String(path || "/");
  return p.startsWith("/") ? base + p : `${base}/${p}`;
}

// Join path segments with single slashes (ignores empty segments).
function joinPath(...segs) {
  return (
    "/" +
    segs
      .filter((s) => s !== null && s !== undefined && `${s}` !== "")
      .map((s) => `${s}`.replace(/^\/+|\/+$/g, ""))
      .join("/")
  );
}

// Absolute URL into the dataset, appending optional sub-segments after the
// configured basePath, e.g. datasetUrl("ind-eng-26-july-26", "in-1").
export function datasetUrl(...segs) {
  const { basePath } = store.getState().dataSource;
  return dataUrl(joinPath(basePath, ...segs));
}

export function isLocal() {
  return store.getState().dataSource.source !== "server";
}

// Base URL under which the innings folders (in-1, in-2, …) live, source-aware:
//   local  → /data
//   server → <serverBase><basePath><match>
// Everything below (listing + delivery URLs) is built from this single base, so
// local and server share one dynamic code path.
export function datasetBase() {
  const ds = store.getState().dataSource;
  if (ds.source === "server") return datasetUrl(ds.match);
  return "/data";
}

// Folder URL for one delivery (always ends with "/"), e.g.
//   /data/in-1/2/3/  or  <server>/<match>/in-1/2/3/
export function deliveryFolder(innings, over, ball) {
  return `${datasetBase()}/in-${innings}/${over}/${ball}/`;
}

// URL for one delivery's trajectory JSON: <folder>/trajectory_data.json.
export function deliveryUrl(innings, over, ball) {
  return deliveryFolder(innings, over, ball) + DELIVERY_FILE;
}

// Full URL for the current selection in the store.
export function selectedBallUrl() {
  const { innings, over, ball } = store.getState().dataSource;
  return deliveryUrl(innings, over, ball);
}

/* ---------------- directory listing (server browsing) ---------------- */

// Extract sub-directory names from a listing. Supports nginx JSON
// (autoindex_format json) and the default HTML "Index of /" page.
export function parseDirectories(data) {
  if (Array.isArray(data)) {
    return data.filter((e) => e.type === "directory").map((e) => e.name);
  }
  if (typeof data === "string") {
    const dirs = [];
    const re = /href="([^"]+\/)"/gi;
    let m;
    while ((m = re.exec(data)) !== null) {
      const href = m[1];
      if (href.startsWith("../") || href === "/" || href.startsWith("http")) {
        continue;
      }
      try {
        dirs.push(decodeURIComponent(href.replace(/\/$/, "")));
      } catch {
        dirs.push(href.replace(/\/$/, ""));
      }
    }
    return dirs;
  }
  return [];
}

// Append a timestamp so the browser never serves a STALE cached copy of live
// data (the server overwrites the JSON in place, so same-URL responses would
// otherwise come from the HTTP cache). Preserves any existing query string.
export function cacheBust(url) {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}t=${Date.now()}`;
}

// Bowling (release) speed in km/h from the delivery's ball_analytics.json — the
// authoritative speed (trajectory_data.json's speed.beforePitch is only approximate).
// `trajectoryUrl` is the delivery's trajectory_data.json; the analytics file sits next
// to it. Resolves null if the file / key is missing, so callers can fall back.
export async function loadReleaseSpeed(trajectoryUrl) {
  if (!trajectoryUrl || !trajectoryUrl.includes(DELIVERY_FILE)) return null;
  const url = trajectoryUrl.replace(/trajectory_data\.json.*$/, "ball_analytics.json");
  try {
    const res = await fetch(cacheBust(url));
    if (!res.ok) return null;
    const v = (await res.json())?.release_speed_kmph;
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

async function listDir(url) {
  const res = await axios.get(cacheBust(url), { validateStatus: () => true });
  return parseDirectories(res.data);
}

// Natural numeric sort for folder names like "1","2","10".
const numSort = (a, b) =>
  String(a).localeCompare(String(b), undefined, { numeric: true });

// Innings options (values like "1","2"): folders named "in-*" under the base,
// with the "in-" prefix stripped. Dynamic for both local and server.
// `baseOverride` lets a view (e.g. 6 Highlights) list from a DIFFERENT local base
// such as "/highlights" instead of the main "/data".
export async function listInnings(baseOverride) {
  const ds = store.getState().dataSource;
  if (ds.source === "server" && !ds.match) return []; // pick a match first
  const dirs = await listDir(`${baseOverride || datasetBase()}/`);
  return dirs
    .filter((d) => /^in-/i.test(d))
    .map((d) => d.replace(/^in-/i, ""))
    .sort(numSort);
}

// Over options for an innings: folders under in-<innings>.
export async function listOvers(innings, baseOverride) {
  const ds = store.getState().dataSource;
  if (!innings || (ds.source === "server" && !ds.match)) return [];
  return (
    await listDir(`${baseOverride || datasetBase()}/in-${innings}/`)
  ).sort(numSort);
}

// Ball options for an over: folders under in-<innings>/<over>.
export async function listBalls(innings, over, baseOverride) {
  const ds = store.getState().dataSource;
  if (!innings || !over || (ds.source === "server" && !ds.match)) return [];
  return (
    await listDir(`${baseOverride || datasetBase()}/in-${innings}/${over}/`)
  ).sort(numSort);
}

// All ball URLs in one over — MULTI-MACHINE aware: unions the balls across machines and
// builds each URL from the machine that has it (split overs supported). Local → single source.
export async function overUrls(innings, over) {
  const { balls, owner } = await listBallsMultiServer(innings, over);
  return balls.map((b) => {
    const srv = owner[b];
    return srv
      ? deliveryFolderFor(srv, innings, over, b) + DELIVERY_FILE
      : deliveryUrl(innings, over, b);
  });
}

// All ball URLs across the given overs (for the pitch map).
export async function collectBallUrls(innings, overs) {
  const out = [];
  for (const o of overs) {
    const urls = await overUrls(innings, o);
    out.push(...urls);
  }
  return out;
}

/* ---------------- multi-server (camera machines) ---------------- */

// All camera machines: the primary (ip/port) plus any extra servers. Each hosts
// the SAME match + folder structure; their cameras are merged per ball. Only
// machines with an ip are included.
export function getCameraServers() {
  const ds = store.getState().dataSource;
  const primary = { id: "m1", ip: ds.ip, port: ds.port };
  const extras = (ds.extraServers || []).filter((s) => s && s.ip);
  return [primary, ...extras];
}

// "http://ip:port" for a given server object (no trailing slash).
export function serverBaseFor(server) {
  const h = cleanHost(server.ip);
  const host = h.includes(":") ? h : server.port ? `${h}:${server.port}` : h;
  return `http://${host}`.replace(/\/+$/, "");
}

// Ball folder on a SPECIFIC machine (absolute, ends with "/"). Uses the shared
// basePath + match + in-<innings>/<over>/<ball>.
export function deliveryFolderFor(server, innings, over, ball) {
  const ds = store.getState().dataSource;
  const path = joinPath(ds.basePath, ds.match, `in-${innings}`, over, ball);
  return serverBaseFor(server) + path + "/";
}

// Over folder on a SPECIFIC machine (for a directory listing), ends with "/".
function overFolderFor(server, innings, over) {
  const ds = store.getState().dataSource;
  const path = joinPath(ds.basePath, ds.match, `in-${innings}`, over);
  return serverBaseFor(server) + path + "/";
}

// List the balls an over has on ONE machine (empty array if listing is off/unreachable).
async function listBallsOnServer(server, innings, over) {
  try {
    return (await listDir(overFolderFor(server, innings, over))).sort(numSort);
  } catch {
    return [];
  }
}

// Union the over's balls across ALL connected machines + a ball→machine "owner" map
// (the FIRST machine that has a ball wins — handles arbitrary/overlapping splits). This is
// what lets the picker SHOW ALL balls even when an over is split across machines, while
// remembering where each ball lives so Start loads it from the right one.
//   local  → the single bundled source (owner = null → primary deliveryUrl)
//   server → merge every machine's listing
// Returns { balls: sorted-deduped string[], owner: { "<ball>": serverObj|null } }.
export async function listBallsMultiServer(innings, over) {
  if (isLocal()) {
    const balls = await listBalls(innings, over);
    const owner = {};
    balls.forEach((b) => (owner[b] = null));
    return { balls, owner };
  }
  const servers = getCameraServers();
  const lists = await Promise.all(
    servers.map((s) => listBallsOnServer(s, innings, over)),
  );
  const owner = {};
  servers.forEach((srv, i) => {
    for (const b of lists[i]) if (!(b in owner)) owner[b] = srv; // first machine wins
  });
  return { balls: Object.keys(owner).sort(numSort), owner };
}

// Resolve ONE ball's trajectory_data.json to the FIRST machine that actually has it.
//   local  → the single bundled source (no probing).
//   server → try each machine in order; a lightweight HEAD check (headers only) confirms
//            the file exists and isn't an SPA/HTML fallback. Returns the absolute URL, or
//            null if the ball is on NO machine.
export async function resolveDeliveryUrl(innings, over, ball, preferredId) {
  if (isLocal()) return deliveryUrl(innings, over, ball);
  const servers = getCameraServers();
  // Try the operator's "Fetch from server" pick FIRST (if given), then the others.
  const ordered = preferredId
    ? [
        ...servers.filter((s) => s.id === preferredId),
        ...servers.filter((s) => s.id !== preferredId),
      ]
    : servers;
  for (const srv of ordered) {
    const url = deliveryFolderFor(srv, innings, over, ball) + DELIVERY_FILE;
    try {
      const r = await axios.head(cacheBust(url), { validateStatus: () => true });
      const ct = String(r.headers?.["content-type"] || "").toLowerCase();
      if (r.status >= 200 && r.status < 300 && !ct.includes("text/html")) return url;
    } catch {
      /* machine unreachable / no data → try the next one */
    }
  }
  return null; // not on any machine
}

// Resolve one ball's FOLDER (ends "/") to the first machine that has it — for sibling files
// in the same folder (e.g. ball_analytics.json). Falls back to the primary folder.
export async function resolveDeliveryFolder(innings, over, ball) {
  const url = await resolveDeliveryUrl(innings, over, ball);
  return url
    ? url.slice(0, url.length - DELIVERY_FILE.length)
    : deliveryFolder(innings, over, ball);
}

// Resolve MANY deliveries (preferred machine first, then fall back) in parallel, dropping
// any that are on no machine. Returns { urls: string[], missing: number }.
export async function resolveDeliveryUrls(items, preferredId) {
  const resolved = await Promise.all(
    items.map((it) =>
      resolveDeliveryUrl(it.innings, it.over, it.ball, preferredId),
    ),
  );
  return {
    urls: resolved.filter(Boolean),
    missing: resolved.filter((u) => u == null).length,
  };
}
