import { store } from "../store/store";

// Fallbacks used only before any config exists (or if the store can't be read).
const SOCKET_DEFAULT_IP = "192.168.0.100";
const SOCKET_DEFAULT_PORT = "8080";
const SOCKET_PATH = "/ws"; // hub path — fixed (only IP/port are editable, like the score API)

// Build "ws://<ip>:<port>/ws" live from the Redux data-source config (socketIp/socketPort),
// which the operator edits in the Server modal and is persisted to localStorage. Read fresh
// on every (re)connect so a change in the modal takes effect on the next connection.
function socketUrl() {
  let ip = SOCKET_DEFAULT_IP;
  let port = SOCKET_DEFAULT_PORT;
  try {
    const ds = store.getState().dataSource || {};
    if (ds.socketIp) ip = String(ds.socketIp).trim();
    if (ds.socketPort !== undefined && ds.socketPort !== null)
      port = String(ds.socketPort).trim();
  } catch {
    /* store not ready — use defaults */
  }
  const host = port ? `${ip}:${port}` : ip;
  return `ws://${host}${SOCKET_PATH}`;
}

// ─── Hub handshake config ────────────────────────────────────────────────────
// The hub won't push events until we JOIN a channel. On connect we send
// cmd.client.hello (identity) then cmd.channel.subscribe (join). The DRS events
// (cmd.replay.load, evt.triangulation.completed, …) are published on the "drs"
// channel. `source` must be unique (a duplicate id is rejected), so `host`
// carries a random suffix.
const CHANNEL = "drs";
const APP = "operator-dashboard";
const HOST = String(Math.floor(Math.random() * 100000)); // keeps source unique
const CLIENT_ID = `${APP}-${HOST}`; // → envelope.source (unique clientId)

let socket = null;

let reconnectInterval = null;

let manualClose = false; // true → intentional close (settings change / unmount); skip auto-reconnect

const uuid = () =>
  (typeof crypto !== "undefined" && crypto.randomUUID && crypto.randomUUID()) ||
  `${CLIENT_ID}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

// Build a DRS hub envelope (see "DRS Message Naming Conventions"):
//   { id, type, ts:<ns string>, corr, source:<unique clientId>, payload }
// corr threads a command to its acks/results — a fresh command gets a new corr;
// echo the incoming corr when replying to an event.
function envelope(type, payload, corr) {
  return {
    id: uuid(),
    type,
    ts: String(Date.now() * 1_000_000), // ms → ns, as a string (matches server)
    corr: corr || uuid(),
    source: CLIENT_ID,
    payload: payload || {},
  };
}

// Join the DRS channel: pre-register identity, then subscribe. Both carry the
// same { channel, app, host } payload shape the other apps use.
function sendHandshake() {
  const identity = { channel: CHANNEL, app: APP, host: HOST };
  const hello = envelope("cmd.client.hello", identity);
  const subscribe = envelope("cmd.channel.subscribe", identity);
  console.log("🙋 [ws] hello →", hello);
  socket.send(JSON.stringify(hello));
  console.log("📡 [ws] subscribe → channel:", CHANNEL, subscribe);
  socket.send(JSON.stringify(subscribe));
}

// Fixed display type. Read by socketHandler to black out the batting display
// during bowling sessions. (The URL-based laneId/displayType detection and the
// channel-subscribe message on connect were removed.)
export const DISPLAY_CONFIG = { displayType: "batting" };

// Connect WebSocket
const connectWebSocket = (onMessageCallback) => {
  const url = socketUrl(); // read the configured ws://ip:port/ws fresh on every (re)connect
  manualClose = false; // a fresh connect clears any prior intentional-close flag
  console.log("🔌 [ws] connecting to", url, "…");
  socket = new WebSocket(url);

  socket.onopen = () => {
    // Connection is up — join the channel so the hub starts pushing events.
    console.log("✅ [ws] CONNECTED to", url);
    if (reconnectInterval) {
      clearInterval(reconnectInterval);
      reconnectInterval = null;
    }
    sendHandshake();
  };

  socket.onmessage = (event) => {
    // Log every raw frame first so we can always see something arrived, even if
    // it isn't valid JSON or has an unexpected shape.
    // console.log("📩 [ws] message received:", event.data);
    let msg;
    try {
      msg =
        typeof event.data === "string" ? JSON.parse(event.data) : event.data;
    } catch (err) {
      console.error("⚠️ [ws] Failed to parse message:", event.data, err);
      return;
    }
    onMessageCallback && onMessageCallback(msg);
  };

  socket.onclose = (e) => {
    // An intentional close (settings change / unmount) must NOT auto-reconnect — the
    // caller will reconnect to the new URL itself. Only drops reconnect.
    if (manualClose) {
      console.log("🔌 [ws] closed (intentional) — not reconnecting");
      return;
    }
    console.warn(
      `❌ [ws] disconnected (code ${e.code}${e.reason ? ", " + e.reason : ""}), reconnecting…`,
    );
    attemptReconnect(onMessageCallback);
  };

  socket.onerror = (err) => {
    console.error("⚠️ [ws] error (is the server up / reachable?):", err);
    socket.close();
  };
};

// Quick way to check the live connection state from the browser console:
//   window.wsStatus()
export function socketState() {
  if (!socket) return "not started";
  return (
    { 0: "connecting", 1: "open", 2: "closing", 3: "closed" }[
      socket.readyState
    ] || "unknown"
  );
}
if (typeof window !== "undefined") {
  window.wsStatus = () => {
    const s = socketState();
    console.log("🔎 [ws] status:", s, "→", socketUrl());
    return s;
  };
}

const attemptReconnect = (onMessageCallback) => {
  if (reconnectInterval) return;
  reconnectInterval = setInterval(() => {
    console.log("🔄 Reconnecting WebSocket...");
    connectWebSocket(onMessageCallback);
  }, 2000);
};

export const sendMessage = (data) => {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(data));
  } else {
    console.warn("⚠️ Cannot send — socket not open");
  }
};

export const closeWebSocket = () => {
  // Intentional close: stop the reconnect loop and flag it so onclose won't reconnect.
  manualClose = true;
  if (reconnectInterval) {
    clearInterval(reconnectInterval);
    reconnectInterval = null;
  }
  if (socket) {
    console.log("🔌 Closing WebSocket connection...");
    socket.close();
  }
};

export const initializeWebSocket = (onMessageCallback) => {
  connectWebSocket(onMessageCallback);
};
