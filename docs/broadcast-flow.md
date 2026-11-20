# Broadcast System — Complete Flow (Operator ↔ Big Screen)

This is the full, plain-English guide to how the operator tool drives the
stadium big screen: opening it, pushing shows, playing, camera angles, the
Operator/Broadcast tabs, fullscreen/HDMI, and how state survives reloads.

Target browser: **Google Chrome**.

---

## 1. The two screens

| | Operator tool | Big screen |
|---|---|---|
| URL | `/` | `/?broadcast=1` |
| Component | `App.jsx` | `BroadcastApp.jsx` |
| Controls (toolbar, keys, picker) | **Yes** | **No** |
| Sends channel messages | **Yes** | No |
| Receives channel messages | No | **Yes** |
| Cursor | normal | hidden |
| Camera drag | on (when idle) | off |

Communication is **one-way: operator → big screen**, over
`BroadcastChannel("drs-broadcast")`.

> ⚠️ Same **Chrome instance + profile + machine** only. The big screen is a
> second window (on the HDMI monitor) opened from the same Chrome. It can't
> reach a different PC, a different Chrome profile, or an Incognito↔normal pair.

---

## 2. One-time setup

1. **Window management permission** — first Start prompts "manage windows on all
   your displays" → **Allow** (lets it open on the HDMI screen). Check at
   `chrome://settings/content/windowManagement`.
2. **HDMI connected** before (or while) the operator tab is open — the screen
   list updates live.
3. Everything else is automatic.

---

## 3. The toolbar (top-right of the operator tool)

| Control | What it does |
|---|---|
| 🗄 **Check data server** | Set server IP/port, browse matches, verify a path (response → console) |
| ⌨ **Shortcuts** | Opens the keyboard reference modal |
| **Start Broadcast** | Opens the big-screen window **on the HDMI screen + fullscreen** |
| **Stop Broadcasting** | Closes the big-screen window |
| **Push to Display** | Cues the current show on the big screen (shows its initial frame, waits) |
| **Play** | Plays / replays the **big screen** (always the big screen) |
| **Operator / Broadcast** tabs | Choose which screen the keyboard keys control |

---

## 4. The Operator / Broadcast tab (the key concept)

The two tabs decide **which screen the keyboard keys act on**:

- **Operator** (default) = the keys control **this tool's preview**.
- **Broadcast** = the keys control **the big screen**.

So you can privately review one delivery on the operator while the big screen
shows something else — just keep the tab on **Operator**. Switch to **Broadcast**
when you want the keys to drive the big screen.

> The on-screen **Play** button is the one exception — it **always** plays the
> big screen, regardless of the tab.

---

## 5. Keyboard keys (operator tool)

All keys are handled in the operator window. (Typing in an input is ignored.)

| Key | Operator tab | Broadcast tab |
|---|---|---|
| **Space / Enter** | Play / replay the operator preview | Play / replay the big screen |
| **0** | Reset the operator preview to start | Reset the big screen to start |
| **1–5** | Camera angle on the operator preview | Camera angle on the big screen |
| **R** | Idle the operator tool | Idle the big screen |
| **A** | Open / close the control panel | (same) |
| **Esc** | Close the control panel | (same) |
| **T** | Run the DRS test replay | (same) |

**Camera angles (1–5):**
- **Bowling / DRS:** `1` side · `2` top-down · `3` behind stumps · `4` front-on · `5` cinematic sweep
- **Pitch:** `1` top-down · `2` overview

> Number keys for the big screen are interpreted **by the big screen against its
> own current show** — so `3` is "behind stumps" if an over is up, the DRS angle
> if a DRS is up, etc. It works no matter what the operator is previewing.

**F (fullscreen):** pressed **on the big-screen window** (click it first to give
it focus) → enters fullscreen. Repeatable (re-enter after Esc). Browsers only
allow fullscreen from a gesture inside that window, so F lives on the big screen.

---

## 6. Cue → Play model

A pushed show does **not** auto-play. **Push** cues it (initial frame shown),
**Play** runs it.

| Show | Push shows (initial) | Play does |
|---|---|---|
| **Bowling (over)** | Stump view from the bowler, balls hidden | Balls animate (sequential or combined) |
| **Pitch** | Empty pitch length zones | Bounce dots appear |
| **Single delivery** | Bowler's-end view | The ball animates |
| **DRS** | The DRS video, held on frame 1 | Video plays + tracking + verdict |
| **No-Ball** | The delivery video, held on frame 1 | Video plays + 3D ball tracking (no out/not-out panels) |

> **DRS setup is inline now:** the wizard's DRS screen collects Original
> Decision / Batsman / Soft Signal directly — there is no second "DRS Review
> Setup" popup. **No-Ball Check** reuses the DRS replay with the decision panels
> hidden.

- **0** returns the show to its initial frame (then Play replays it).
- **DRS replay:** Play again after it finishes re-runs the whole DRS.

---

## 7. Operator workflow (typical match use)

1. **Start Broadcast** → big screen opens on the HDMI, fullscreen, on idle.
2. Open the panel (**A**) → pick a mode (Bowling / Pitch / DRS / Single),
   configure (innings / over / ball / playback style) → it plays on the
   **operator** as a private preview.
3. Happy with it → **Push to Display** → big screen cues it (Play button pulses).
4. **Play** (button, or Space on the Broadcast tab) → big screen takes it live.
5. Switch tab to **Broadcast**, use **1–5** to change the big-screen camera, **0**
   to reset, **Space** to replay — all without re-pushing.
6. Privately check the next delivery on the **Operator** tab anytime (big screen
   keeps showing the pushed one).
7. **R** (Broadcast tab) → big screen back to idle.

> You only **Push** again to put a *different* show on the big screen. Replays
> use Play/0 on the already-pushed show.

---

## 8. Fullscreen & HDMI

- **Start Broadcast** opens the window **synchronously on your click**, with the
  HDMI screen's position/size baked in (pre-fetched via the Window Management
  permission). So it opens **on the HDMI** and **fullscreens** there using your
  click's gesture.
- If auto-fullscreen is ever blocked: the **first click/keypress on the big
  screen**, or pressing **F** on it, enters fullscreen.
- Bulletproof alternative (zero clicks): launch the big-screen machine's Chrome
  in **kiosk mode**: `chrome --kiosk "http://<host>/?broadcast=1"`.

---

## 9. State & persistence (survives operator reload)

The operator's broadcast state lives in Redux and is **persisted to
localStorage — operator tab only** (so the big-screen tab can't overwrite it):

| Field | Persisted? | Why |
|---|---|---|
| `cameraTarget` | ✅ | Keys keep targeting the right screen after a reload |
| `currentShow` | ✅ | Push still has the last show to send |
| `broadcasting` | ❌ (forced `false` on load) | Must reflect a *real* open window this session — a persisted "true" would wrongly show "Stop" and block the open+fullscreen flow |

After a reload: the toolbar shows **Start Broadcast**; click it once — because it
reuses the **named window**, it reconnects to the still-open big screen (no
duplicate), and camera/Push work immediately (their state was restored).

---

## 10. Message protocol (operator → big screen)

| Message | Sent by | Big screen does |
|---|---|---|
| `show {cmd}` | Push to Display / R (idle) | Cue the show's initial frame (or idle) |
| `play` | Play button / Space (Broadcast) | Play the cued show |
| `reset` | 0 (Broadcast) | Back to the show's initial frame |
| `key {n}` | 1–5 (Broadcast) | Apply the number against its own show |
| `close` | Stop (when no window handle) | `window.close()` itself |

Show command shapes: `{kind:"single",url}`, `{kind:"over",urls,overNo,playMode}`,
`{kind:"pitch",urls}`, `{kind:"drs",folderUrl,operatorInput}`, `{kind:"idle"}`.

---

## 11. Failure modes (and how they're handled)

| Situation | Behaviour |
|---|---|
| Operator tab reloaded/discarded | `cameraTarget` + `currentShow` restored; click Start once to reconnect (reuses the window) |
| Different machine / profile / Incognito | Won't connect — same Chrome only |
| Window-management not allowed | Opens on the current screen (drag to HDMI; F to fullscreen) |
| localStorage disabled / corrupted | `try/catch` → falls back to defaults; no crash |
| Big-screen tab hidden then shown | Re-plays the current show from the start (avoids the throttled-clock skip) |
| Camera angle pressed before playable | Ignored until the over finishes / DRS reaches review |
| Two operator/broadcast windows | Channel is strictly one-way; no echo loops |

---

## 12. Key files

| File | Role |
|---|---|
| `broadcastChannel.js` | Channel + `sendShow / sendPlay / sendReset / sendBroadcastKey / sendClose` |
| `crossTabSync.js` | Big-screen receiver: cue / play / reset / key / close |
| `components/drs/showCommands.js` | `cueShow`, `playShow`, `goIdle`, `goReady`, per-show load/play |
| `components/DrsKeyBindings.jsx` | Keyboard → transport / camera, tab-routed |
| `components/BroadcastControls.jsx` | Toolbar: Start/Stop, Push, Play, tabs, HDMI open |
| `BroadcastApp.jsx` | Big-screen tree + fullscreen (auto + F) |
| `store/slices/broadcastSlice.js` | `currentShow`, `cameraTarget`, `broadcasting` (+ persistence) |
| `store/slices/sessionSlice.js` | over playback/armed/complete, view angle (+ token), pitch state |
| `store/slices/drsSlice.js` | DRS phase, view angle (+ token), video `paused` |
</content>
