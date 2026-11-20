// Per-tab view mode. The big-screen broadcast window is the same SPA loaded
// with `?broadcast=1`. This is a constant for the life of the tab.
const params =
  typeof window !== "undefined"
    ? new URLSearchParams(window.location.search)
    : new URLSearchParams();

export const isBroadcast = params.has("broadcast");
// Preview flag for the new operator dashboard UI (?dashboard=1). Isolated from
// the current operator view so the redesign can be built/tested without
// touching the existing tool. Ignored on the big screen.
export const isDashboard = !isBroadcast && params.has("dashboard");
export const viewMode = isBroadcast
  ? "broadcast"
  : isDashboard
    ? "dashboard"
    : "operator";
