// Build the show command for a socket-requested ball (cmd.replay.load), running
// the SAME resolution the manual DRS "Start" uses: probe the ball's cameras on
// the configured camera server(s) and play the one that exists. Only the
// delivery (match / innings / over / ball) comes from the socket URL; the server
// stays whatever the operator configured (that's where the videos live).
import {
  cacheBust,
  deliveryFolder,
  deliveryFolderFor,
  getCameraServers,
  isLocal,
} from "../dataSource";

const withSlash = (u) => (u.endsWith("/") ? u : u + "/");

// Default physical camera (index) for an auto-played DRS review, used when the
// ball actually ships that camera. Configurable: edit DEFAULT_REPLAY_CAMERA, or
// override at runtime with  localStorage.setItem("replayCamera", "2")
export const DEFAULT_REPLAY_CAMERA = "3";

export function getDefaultReplayCamera() {
  try {
    const v = localStorage.getItem("replayCamera");
    if (v != null && v !== "") return String(v);
  } catch {
    /* ignore storage errors */
  }
  // Settings-panel override (drs.config.overrides → DEFAULT_REPLAY_CAMERA).
  try {
    const cfg = JSON.parse(localStorage.getItem("drs.config.overrides") || "{}");
    if (cfg.DEFAULT_REPLAY_CAMERA) return String(cfg.DEFAULT_REPLAY_CAMERA);
  } catch {
    /* ignore */
  }
  return DEFAULT_REPLAY_CAMERA;
}

// The cameras a ball ships are listed in ball_coords.json as "<i>_transform"
// keys; we HEAD-probe only those videos. (Same as TrajectoryPicker/dashboard.)
async function probeCameras(folder) {
  const base = withSlash(folder);
  let indices = [];
  try {
    const res = await fetch(cacheBust(base + "ball_coords.json"));
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (res.ok && !ct.includes("text/html")) {
      const bc = await res.json();
      indices = Object.keys(bc)
        .filter((k) => k.endsWith("_transform"))
        .map((k) => k.slice(0, -"_transform".length))
        .sort((a, b) => Number(a) - Number(b));
    }
  } catch {
    indices = [];
  }
  const checks = await Promise.all(
    indices.map(async (i) => {
      try {
        const r = await fetch(base + `${i}.mp4`, { method: "HEAD" });
        if (!r.ok) return null;
        const ct = (r.headers.get("content-type") || "").toLowerCase();
        if (ct.includes("text/html")) return null;
        return { index: String(i) };
      } catch {
        return null;
      }
    }),
  );
  return checks.filter(Boolean);
}

// Merge cameras from every configured machine for one ball (each entry carries
// its own machine's folder). Local source → the single public folder.
async function probeCamerasAllServers(innings, over, ball) {
  const folders = isLocal()
    ? [{ folder: deliveryFolder(innings, over, ball) }]
    : getCameraServers().map((s) => ({
        folder: deliveryFolderFor(s, innings, over, ball),
      }));
  const perServer = await Promise.all(
    folders.map(async ({ folder }) => {
      try {
        const cams = await probeCameras(folder);
        return cams.map((c) => ({ folder, index: c.index }));
      } catch {
        return [];
      }
    }),
  );
  return perServer.flat();
}

// Resolve the DRS folder + camera for the delivery, exactly like the manual
// flow: prefer the backend-provided camera (preferredCam), else the configured
// default camera, else the first available. Returns null when the ball ships no
// camera feeds (caller falls back to trajectory).
export async function resolveDrsReplay(innings, over, ball, preferredCam) {
  const cams = await probeCamerasAllServers(innings, over, ball);
  if (!cams.length) return null;
  const want =
    preferredCam != null && preferredCam !== ""
      ? String(preferredCam)
      : getDefaultReplayCamera();
  const chosen = cams.find((c) => String(c.index) === want) || cams[0];
  return { folderUrl: chosen.folder, camera: String(chosen.index) };
}

// Build the show command for an auto-played ball, honouring the operator's mode.
//   mode: "bowling" | "noball" | "drs" (anything else → drs)
// Requires the delivery's match already set in the store (so folder URLs resolve).
export async function buildReplayCommand({
  req,
  mode = "drs",
  playModeSel = "chronological",
  operatorInput,
}) {
  const { innings, over, ball, trajUrl, folderUrl, cam } = req;
  const trajectory =
    trajUrl || (folderUrl ? withSlash(folderUrl) + "trajectory_data.json" : "");

  // Bowling analysis: single ball played as a one-ball over (trajectory only).
  if (mode === "bowling") {
    return { kind: "over", urls: [trajectory], playMode: playModeSel };
  }

  // DRS / No-Ball: probe + play the real camera, same as manual Start. The
  // backend-provided camera (req.cam) is preferred when present.
  const drs = await resolveDrsReplay(innings, over, ball, cam);
  if (drs) {
    return {
      kind: "drs",
      folderUrl: drs.folderUrl,
      operatorInput:
        operatorInput || {
          originalDecision: "NOT_OUT",
          isRightHanded: true,
          softSignal: false,
        },
      noBall: mode === "noball",
      camera: drs.camera,
    };
  }

  // Ball ships no camera feeds → fall back to the 3D batting trajectory.
  return { kind: "single", url: trajectory, session: "BATTING_SESSION" };
}
