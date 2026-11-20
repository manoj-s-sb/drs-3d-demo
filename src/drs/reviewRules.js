// Rule-driven DRS review UI resolver.
//
// The authoritative rules live in public/config/drs-review-rules.json so they can
// be edited WITHOUT a rebuild. We fetch that at startup and cache it; the FALLBACK
// below (a copy of the same rules) is used only if the fetch hasn't finished or
// fails — so the UI always has a sane plan and can never break.
//
// resolveReviewPlan(gate) reads a ball's gate values and returns the matched
// rule's `show` block (the "reviewPlan") that the DRS components render from.

const CONFIG_URL = "/config/drs-review-rules.json";

// Built-in fallback (mirror of public/config/drs-review-rules.json). The rules
// are WICKET-DRIVEN to match the LBW matrix exactly: if the wicket was evaluated
// (not N/A) the full trajectory is shown; else if impact was evaluated we stop at
// the pad; else (pitched outside leg) it's pitch-only. Full toss → top-down.
const R = ["originalDecision", "finalDecision", "playerReview"];
const FALLBACK = {
  rules: [
    {
      id: "fulltoss-would-pitch",
      when: { delivery: "fullToss", height: "PRESENT" },
      show: { trajectory: "lineOnly", camera: "topDown", pitchMarker: false, impactMarker: true,
        panelsLeft: ["impact"], panelsRight: R },
    },
    {
      id: "fulltoss-wicket",
      when: { delivery: "fullToss", wicket: "PRESENT" },
      show: { trajectory: "full", camera: "topDown", pitchMarker: false, impactMarker: true,
        panelsLeft: ["impact", "wickets"], panelsRight: R },
    },
    {
      id: "fulltoss-impact",
      when: { delivery: "fullToss", impact: "PRESENT" },
      show: { trajectory: "toImpact", camera: "topDown", pitchMarker: false, impactMarker: true,
        panelsLeft: ["impact"], panelsRight: R },
    },
    {
      id: "fulltoss-fallback",
      when: { delivery: "fullToss" },
      show: { trajectory: "full", camera: "topDown", pitchMarker: false, impactMarker: true,
        panelsLeft: ["impact", "wickets"], panelsRight: R },
    },
    {
      id: "pitched-outside-leg",
      when: { delivery: "pitched", pitching: "OUTSIDE_LEG" },
      show: { trajectory: "none", camera: "topPitch", pitchMarker: true, impactMarker: false,
        panelsLeft: ["originalDecision", "pitching"], panelsRight: ["finalDecision", "playerReview"] },
    },
    {
      id: "pitched-wicket",
      when: { delivery: "pitched", wicket: "PRESENT" },
      show: { trajectory: "full", camera: "auto", pitchMarker: true, impactMarker: true,
        panelsLeft: ["pitching", "impact", "wickets"], panelsRight: R },
    },
    {
      id: "pitched-impact",
      when: { delivery: "pitched", impact: "PRESENT" },
      show: { trajectory: "toImpact", camera: "auto", pitchMarker: true, impactMarker: true,
        panelsLeft: ["pitching", "impact"], panelsRight: R },
    },
    {
      id: "pitched-fallback",
      when: { delivery: "pitched" },
      show: { trajectory: "none", camera: "auto", pitchMarker: true, impactMarker: false,
        panelsLeft: ["pitching"], panelsRight: ["originalDecision", "finalDecision"] },
    },
  ],
  default: {
    id: "default",
    show: { trajectory: "full", camera: "auto", pitchMarker: true, impactMarker: true,
      panelsLeft: ["pitching", "impact", "wickets"], panelsRight: R },
  },
};

let CONFIG = FALLBACK; // active config (replaced once the fetch resolves)

// Fetch the editable config once at startup; keep FALLBACK on any failure.
export async function loadReviewRules() {
  try {
    const res = await fetch(`${CONFIG_URL}?t=${Date.now()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (Array.isArray(json?.rules) && json?.default) {
      CONFIG = json;
      console.log("[drs-rules] loaded", json.rules.length, "rules from", CONFIG_URL);
    }
  } catch (err) {
    console.warn("[drs-rules] using built-in fallback rules:", err?.message);
  }
  return CONFIG;
}
// Kick it off immediately so the config is ready before the first review.
loadReviewRules();

// N/A = null / empty / "NA" / any dash the backend uses ("-", "–", "—").
const isNA = (v) =>
  v == null || v === "NA" || v === "" || /^[\s\-–—]+$/.test(String(v));

// True if the rule's `when` matches the ball's gate values. Per key, `want` may be:
//   "any" / omitted → matches anything
//   "PRESENT"        → matches when the ball's value is NOT N/A (was evaluated)
//   "NA"             → matches when the ball's value IS N/A
//   [a, b, ...]      → matches when the ball's value is one of these
//   "VALUE"          → matches when the ball's value equals it exactly
function whenMatches(when, gate) {
  if (!when) return true;
  for (const key of Object.keys(when)) {
    const want = when[key];
    const val = gate[key];
    if (want == null || want === "any") continue;
    if (want === "PRESENT") {
      if (isNA(val)) return false;
    } else if (want === "NA") {
      if (!isNA(val)) return false;
    } else if (Array.isArray(want)) {
      if (!want.map(String).includes(String(val ?? "NA"))) return false;
    } else if (String(val ?? "NA") !== String(want)) {
      return false;
    }
  }
  return true;
}

// Map a ball's decision row (+ full-toss flag) → gate values the rules match on.
//   selectedDecision: { pitching, impact, wickets, ... } from ballMeta.decisions
//   opts.fullToss: true if the ball did not bounce
//   opts.hasDistance / opts.height: optional extras when the data provides them
export function gateFromDecision(selectedDecision = {}, opts = {}) {
  const pitching = selectedDecision.pitching ?? null;
  return {
    delivery: opts.fullToss ? "fullToss" : "pitched",
    pitching: pitching ?? "NA",
    impact: selectedDecision.impact ?? "NA",
    wicket: selectedDecision.wickets ?? "NA",
    height: opts.height ?? "NA",
    distance: opts.hasDistance ? "PRESENT" : "NA",
  };
}

// Resolve the reviewPlan for a ball: walk rules top-to-bottom, first match wins.
export function resolveReviewPlan(gate) {
  const rules = CONFIG.rules || [];
  for (const rule of rules) {
    if (!whenMatches(rule.when, gate)) continue;
    return { ruleId: rule.id, ...rule.show };
  }
  return { ruleId: CONFIG.default?.id || "default", ...(CONFIG.default?.show || {}) };
}
