import { createSlice } from "@reduxjs/toolkit";

// Strip a pasted scheme ("http://"/"https://") and any trailing slashes from an
// IP/host so the field only ever stores a bare host. Prevents "http://ip" from
// becoming "http://http://ip" when URLs are built. Applied to every IP field.
const cleanIp = (v) =>
  String(v ?? "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");

// Single source of truth for WHERE the data comes from. Held in Redux so the
// whole project (fetches, pickers, DRS) reads the same server + path, and it's
// easy to track/change. Persisted to localStorage (see store.js).
//
// A full file path looks like:
//   http://<ip>:<port><basePath><match>/in-<innings>/<over>/<ball>/trajectory_data.json
//   e.g. http://192.168.0.200:7575/ind-eng-26-july-26/in-1/4/2/trajectory_data.json
//
// Multiple camera machines: `ip`/`port` is machine 1 (the primary, used for
// browsing matches/innings/overs/balls). `extraServers` are additional machines
// that host the SAME match + folder structure; every machine's cameras are
// merged per ball (3 + 3 → 6). Adaptive — any number of machines.
const DEFAULTS = {
  // Where data is read from: "local" = the app's public/ folder (offline dev),
  // "server" = the nginx IP.
  source: "local",
  ip: "192.168.0.100", // Machine 1 (primary) default
  port: "7575",
  // Path up to (and including) the dataset folder on the server. nginx now
  // serves the dataset at root, so this is empty → URL is ip:port/<match>/…
  basePath: "",
  // Extra camera machines beyond the primary. Each: { id, ip, port }. Machine 2 ships by default.
  extraServers: [{ id: "srv-1", ip: "192.168.0.200", port: "7575" }],
  // Score API server (live score / snapshot). Independent of the camera/DRS
  // server above — see score-api/endpoints.js. Editable from the Server modal.
  apiIp: "192.168.0.100",
  apiPort: "3001", // score API → http://192.168.0.100:3001/api (prefix in endpoints.js)
  // DRS review hub WebSocket (cmd.replay.load auto-replay). Independent of the camera
  // and score servers above — editable from the Server modal, like them. Full URL is
  // ws://<socketIp>:<socketPort>/ws (scheme + "/ws" path are fixed in socketClient.js).
  socketIp: "192.168.0.100",
  socketPort: "8080",
  // Internal counter used to mint stable extraServers ids (srv-1 ships by default → next is srv-2).
  _sid: 1,
  // Current selection within the dataset.
  match: "", // e.g. "ind-eng-26-july-26" (server only)
  innings: "1", // "1" | "2"
  over: "1", // over number
  ball: "1", // ball number within the over
};

function loadPersisted() {
  if (typeof localStorage === "undefined") return DEFAULTS;
  try {
    const saved = JSON.parse(localStorage.getItem("dataSourceConfig") || "null");
    // basePath is code-controlled (no UI to edit it), so always take it from
    // DEFAULTS — this drops any stale basePath saved from an older build.
    return saved
      ? {
          ...DEFAULTS,
          ...saved,
          basePath: DEFAULTS.basePath,
          extraServers: Array.isArray(saved.extraServers)
            ? saved.extraServers
            : [],
        }
      : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

const dataSourceSlice = createSlice({
  name: "dataSource",
  initialState: loadPersisted(),
  reducers: {
    // Switch between "local" (public folder) and "server" (nginx IP).
    setSource: (state, action) => {
      state.source = action.payload === "server" ? "server" : "local";
    },
    // Set the primary server + base path together (the "Set" button).
    setServer: (state, action) => {
      const { ip, port, basePath } = action.payload || {};
      if (ip !== undefined) state.ip = cleanIp(ip);
      if (port !== undefined) state.port = port;
      if (basePath !== undefined) state.basePath = basePath;
    },
    // Set the score API server (IP and/or port).
    setApi: (state, action) => {
      const { apiIp, apiPort } = action.payload || {};
      if (apiIp !== undefined) state.apiIp = cleanIp(apiIp);
      if (apiPort !== undefined) state.apiPort = apiPort;
    },
    // Set the DRS review-hub WebSocket server (IP and/or port). URL is rebuilt as
    // ws://<socketIp>:<socketPort>/ws by socketClient.js.
    setSocket: (state, action) => {
      const { socketIp, socketPort } = action.payload || {};
      if (socketIp !== undefined) state.socketIp = cleanIp(socketIp);
      if (socketPort !== undefined) state.socketPort = socketPort;
    },
    // --- extra camera machines ---
    addServer: (state) => {
      state._sid = (state._sid || 0) + 1;
      state.extraServers.push({
        id: `srv-${state._sid}`,
        ip: "",
        port: state.port || "7575",
      });
    },
    updateServer: (state, action) => {
      const { id, ip, port } = action.payload || {};
      const s = state.extraServers.find((x) => x.id === id);
      if (!s) return;
      if (ip !== undefined) s.ip = cleanIp(ip);
      if (port !== undefined) s.port = port;
    },
    removeServer: (state, action) => {
      state.extraServers = state.extraServers.filter(
        (x) => x.id !== action.payload,
      );
    },
    // Update any part of the current selection (match/innings/over/ball).
    setSelection: (state, action) => {
      Object.assign(state, action.payload || {});
    },
    resetSelection: (state) => {
      state.match = "";
      state.innings = "";
      state.over = "";
      state.ball = "";
    },
  },
});

export const {
  setSource,
  setServer,
  setApi,
  setSocket,
  addServer,
  updateServer,
  removeServer,
  setSelection,
  resetSelection,
} = dataSourceSlice.actions;
export default dataSourceSlice.reducer;
