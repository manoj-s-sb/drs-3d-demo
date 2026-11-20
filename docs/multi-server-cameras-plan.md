# Multi-Server Cameras — Design Plan

**Goal:** a ball's cameras can live on **more than one machine** (e.g. 6 cameras = 3 on machine A + 3 on machine B). Show **all** of them for a ball, play any one (video + 3D overlay) from the correct machine. **Adaptive** — 2 machines today, N tomorrow. **Same match name and same folder structure on every machine.**

---

## Why this is tractable

The whole DRS replay is built from exactly two inputs — a **folder base URL** and a **numeric camera index**:

| Asset | Built as |
|---|---|
| Video | `base + "<index>.mp4"` |
| Calibration | `base + "camera_config/<index>_camera_calibration.yaml"` |
| Projection | `base + "camera_config/P_<index>.npy"` |
| Transform / frames | `base + "ball_coords.json"` → `<index>_transform`, `pitching_frame`, `impact_frame` |
| Trajectory / decisions | `base + "trajectory_data.json"` |

Today `base` = one server's `…/<match>/in-X/over/ball/`. **The fix is to let a "camera" carry its own `base`** (its machine's folder) plus its local `index`. Then `drsReplay` / `drsSubmitOperatorInput` / `switchDrsCamera` — which already take `(folder, index)` — work unchanged.

> Key idea: **camera = `{ serverId, folder, index, label }`**, not a bare index. The pipeline stays folder+index; only *discovery* and *selection* change.

---

## Current model (single server)

- `dataSource` = `{ source, ip, port, basePath, match, innings, over, ball }` — **one** `ip:port`.
- `deliveryFolder(in,ov,bl)` → `http://ip:port/<basePath>/<match>/in-<in>/<ov>/<bl>/`.
- `TrajectoryPicker.probeCameras(folder)` reads that folder's `ball_coords.json` → indices → HEAD-probes `<i>.mp4` → camera list.
- `currentShow = { kind:"drs", folderUrl, camera }` (folderUrl absolute), replayed on the big screen tab.
- `dataSource` is **persisted to `localStorage` ("dataSourceConfig")** → the big-screen tab (same origin) already shares it.

---

## Target model (N servers, adaptive)

### 1. Config: one server → a list of servers
Replace the single `ip`/`port` with a **servers array**:

```js
// dataSourceSlice
servers: [
  { id: "a", ip: "192.168.0.100", port: "7575", label: "Machine A" },
  { id: "b", ip: "192.168.0.101", port: "7575", label: "Machine B" },
],
// match / basePath / innings / over / ball stay shared (same on every machine)
```
- Add reducers: `addServer`, `updateServer(id, …)`, `removeServer(id)`.
- Keep it persisted (already localStorage-backed) so the big-screen tab shares it.
- **Adaptive:** nothing hardcodes 2 — it's a list of any length.
- Back-compat: migrate the old `{ip,port}` into `servers[0]` on load.

### 2. Server-aware URL builders (`dataSource.js`)
Make the builders take a server (default = the "primary" = `servers[0]`, used for match/innings/over/ball listing which is identical everywhere):

```js
serverBase(server)                 // http://ip:port for THAT server
datasetBase(server)                // + basePath + match
deliveryFolder(server, in, ov, bl) // per-server ball folder (absolute)
```
Listing (`listInnings/Overs/Balls`, `loadMatches`) uses the **primary** server — folder structure is identical across machines, so one is enough. (Optional hardening: intersect listings across servers.)

### 3. Unified camera discovery (the merge)
New helper (replaces `probeCameras`): **query every server for the same ball, tag each camera with its server, merge.**

```js
async function probeCamerasAllServers(innings, over, ball) {
  const servers = getServers();               // from store
  const perServer = await Promise.all(servers.map(async (srv) => {
    const folder = deliveryFolder(srv, innings, over, ball);
    const indices = await readBallCoordsIndices(folder);   // <i>_transform keys
    const present = await headProbeVideos(folder, indices); // <i>.mp4 exists
    return present.map((index) => ({ serverId: srv.id, folder, index }));
  }));
  // flatten + assign a global label
  return perServer.flat().map((c, i) => ({ ...c, label: `Cam ${i + 1}` }));
}
```
- **Index collision is a non-issue for playback** (each camera resolves against its own `folder`), and only a *labelling* concern for the operator → give global labels `Cam 1…6` (server order), optionally prefixed `A·1`, `B·1`.
- A **server offline** → its probe fails → its cameras are simply omitted (show what's reachable). Log it so it's visible.

### 4. Selection & replay (mostly unchanged)
When the operator picks a camera object `{ folder, index }`:
- `startDrs` / `playDrs(dispatch, folder, operatorInput, noBall, viewAngle, index)` — pass the camera's **own folder** as `folderUrl` and its **local index**.
- `drsReplay(folder, { camera: index })` and `drsSubmitOperatorInput` are **unchanged** — they already build every asset off `base + index`.
- `currentShow.folderUrl` becomes that camera's server folder (absolute) → the big-screen tab replays correctly with **no extra config** needed.

### 5. Store the unified camera list for switching
`drs.cameras` currently holds indices from one `ball_coords`. Change it to the **unified list** `[{ serverId, folder, index, label }]` so number-key / on-screen switching can hop **across servers**:
- `switchDrsCamera(dispatch, cmd, targetCam)` → `playDrs(dispatch, targetCam.folder, cmd.operatorInput, cmd.noBall, null, targetCam.index)` and update `currentShow.folderUrl = targetCam.folder`.
- Number keys `1…N` (`DrsKeyBindings` / `crossTabSync`) index into the unified list instead of a raw camera index.
- Big-screen camera switch: send the resolved `{ folder, index }` (extend the `key`/camera message) so the big screen just runs `drsReplay` on it — it doesn't need to recompute the merge.

### 6. ServerCheck UI (adaptive)
Turn the single IP/Port row into a **list of server rows**:
- Each row: label + IP + port + a live status dot (reachable / not) + remove (✕).
- A **"＋ Add machine"** button appends a row.
- One shared **Match** dropdown (loaded from the primary server).
- "Active dataset" line shows all machines, e.g. `A: …:7575 · B: …:7575 → /<match>/`.

---

## The one decision you need to make ⚠️

**Where does the 3D ball trajectory + decisions come from when cameras span machines?**

`trajectory_data.json` (the ball's 3D path) and `ballMeta.decisions` are per-folder. Two options:

- **A — Per-camera-server (simplest):** trajectory + decisions come from the *selected camera's* machine. Works cleanly (everything stays `base`-keyed) **if every machine stores the same trajectory for the ball**. You said the folder structure is identical — if the *contents* of `trajectory_data.json` are identical across machines, pick this. Risk: if each machine computes its own slightly different 3D track from its own 3 cameras, switching camera would subtly change the tracked line.
- **B — Primary trajectory:** designate a **primary** machine that owns `trajectory_data.json` + `ball_coords` frames + `decisions`; each camera still uses **its own** machine for video + calibration + transform. More faithful when one machine is authoritative, but requires decoupling "trajectory base" from "camera base" in `drsReplay` (a small extra param).

**Tell me which** (or "the trajectory JSON is identical on both machines" → I'll go with A).

---

## Files touched (when we build it)

| File | Change |
|---|---|
| `store/slices/dataSourceSlice.js` | `servers[]` + add/update/remove reducers; migrate old `{ip,port}` |
| `dataSource.js` | server-aware `serverBase/datasetBase/deliveryFolder`; listing uses primary |
| `components/ServerCheck.jsx` | server-list UI (add/remove rows, per-row status) |
| `components/drs/TrajectoryPicker.jsx` | `probeCamerasAllServers` merge; camera row shows all; selection carries `{folder,index}` |
| `components/drs/showCommands.js` | `playDrs`/`switchDrsCamera` accept a camera object (folder+index) |
| `drs/drsController.js` | unchanged core; `drs.cameras` becomes the unified list (+ optional primary-trajectory param for Option B) |
| `components/DrsKeyBindings.jsx` / `crossTabSync.js` | number keys index the unified list; camera switch message carries `{folder,index}` |
| `broadcastChannel.js` | (only if Option B / richer camera-switch message) |

---

## Requirements on the machines (ops)
- Every machine serves the **same match name + same folder tree** (`/<match>/in-X/over/ball/…`).
- Each machine's ball folder holds **its own** `ball_coords.json`, `<i>.mp4`, and `camera_config/<i>_…` for the cameras it recorded.
- **CORS must be enabled on every machine** (the browser fetches all of them). Same nginx `autoindex_format json` requirement as today.
- Camera indices may repeat across machines (both `0,1,2`) — that's fine; the app namespaces by machine.

---

## Suggested phases
1. **Config + discovery** — `servers[]`, server-aware URLs, `probeCamerasAllServers`. Result: all 6 cameras listed for a ball (view only).
2. **Replay per camera** — selection carries `{folder,index}`; play any camera from its machine. (Decide A vs B here.)
3. **Switching + big screen** — number keys / on-screen buttons hop across machines; big-screen camera switch.
4. **UI polish** — ServerCheck server-list, status dots, labels; monitor shows machine per camera.

Confirm the **trajectory-source decision (A or B)** and I'll start on Phase 1.
