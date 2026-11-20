// On-demand, de-duplicated cache for per-ball trajectory_data.json.
// Fetches a ball's tracking JSON only when something asks for it, caches the
// parsed result (and in-flight promise) by innings/over/ball so the same ball is
// never fetched twice. Used by the DRS full-toss check, Swing, and the Pitch Map dots.
//
// MACHINE-AWARE: in multi-machine (server) mode an over's balls can be SPLIT across
// machines, so we first RESOLVE each ball to the machine that actually has it
// (resolveDeliveryUrl → first-machine-wins), then fetch that absolute URL. Keying by
// innings/over/ball is still safe because a given ball resolves to exactly ONE machine.
import { cacheBust, resolveDeliveryUrl } from "./dataSource";

const cache = new Map(); // "innings/over/ball" -> Promise<object|null>

/**
 * Load one delivery's trajectory_data.json (cached, machine-resolved). Resolves to the
 * parsed object, or null if the ball is on no machine / failed. Concurrent callers share
 * one request.
 */
export function loadTrajectory(innings, over, ball) {
  const key = `${innings}/${over}/${ball}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const p = resolveDeliveryUrl(innings, over, ball)
    .then((url) => (url ? fetch(cacheBust(url)) : null))
    .then((r) => (r && r.ok ? r.json() : null))
    .catch(() => null);
  cache.set(key, p);
  return p;
}

/** Drop cached trajectories (e.g. on a manual Reload) so the next ask refetches. */
export function clearTrajectoryCache() {
  cache.clear();
}
