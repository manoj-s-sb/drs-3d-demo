import { initializeWebSocket } from "./socketClient";
import { requestReplay } from "../store/slices/remoteReplaySlice";

// Live sensor-session message handling was removed for the DRS build (all the
// SESSION_*, TEST_BALL, SENSOR, SLOT, BLACK-OVERLAY etc. cases, which drove the
// now-deleted live match UI). The WebSocket connection itself is kept — wire
// any DRS control signals in the callback below. `dispatch` is threaded through
// for that future use.
//
// NOTE: initializeSocketHandlers is currently NOT called (the useEffect in
// SocketProvider is commented out), so the socket does not connect until that
// is re-enabled.
// cmd.replay.load: the DRS hub tells us which ball to replay. Split the
// trajectory3dUrl into the delivery it points at and hand it to the operator
// views (via Redux) to auto-select + auto-play on their preview. URL shape:
//   http://<ip>:<port>/<match>/in-<innings>/<over>/<ball>/trajectory_data.json
function handleReplayLoad(dispatch, msg) {
  const payload = msg?.payload || {};
  const url = payload.trajectory3dUrl;
  if (!url) {
    console.warn("[replay-socket] cmd.replay.load with no trajectory3dUrl", payload);
    return;
  }
  try {
    const u = new URL(url);
    // pathname segments: [match, in-<innings>, over, ball, trajectory_data.json]
    const [match, inn, over, ball] = u.pathname.split("/").filter(Boolean);
    const innings = inn?.startsWith("in-") ? inn.slice(3) : inn;
    // Folder = the URL minus the trajectory_data.json filename (keeps trailing /).
    const folderUrl = url.replace(/[^/]*$/, "");
    const req = {
      ip: u.hostname,
      port: u.port,
      match,
      innings,
      over,
      ball,
      folderUrl,
      trajUrl: url, // the trajectory_data.json itself — played directly
      cam: payload.cam != null ? String(payload.cam) : null, // camera from backend
      ballId: payload.ballId ?? null,
      corr: msg?.corr ?? null,
    };
    console.log("[replay-socket] cmd.replay.load → auto-play", req);
    dispatch(requestReplay(req));
  } catch (err) {
    console.error("[replay-socket] bad trajectory3dUrl:", url, err);
  }
}

export const initializeSocketHandlers = (dispatch) => {
  initializeWebSocket((msg) => {
    console.log("🧩 [ws] parsed message, type =", msg?.type, msg);
    if (!msg?.type) return;
    switch (msg.type) {
      case "evt.channel.subscribed":
        console.log("✅ [ws] channel subscribed — hub will now push events:", msg.payload);
        break;
      case "evt.channel.rejected":
        console.error("⛔ [ws] channel REJECTED (fix the channel name / id):", msg.payload);
        break;
      case "evt.channel.unsubscribed":
        console.log("👋 [ws] channel unsubscribed:", msg.payload);
        break;
      case "evt.channel.subscribers":
        console.log("👥 [ws] channel subscribers:", msg.payload);
        break;
      case "cmd.replay.load":
        handleReplayLoad(dispatch, msg);
        break;
      default:
        // Other message types — nothing wired yet.
        break;
    }
  });
};
