# Broadcast Big Screen — Design

Date: 2026-06-25
Branch: drs-view-v1

## Problem

The operator drives the DRS / multi-ball / pitch-map visualizations on their
laptop (the "debug" app). They need a second display — the stadium **big
screen** — that shows a clean broadcast view: only the 3D scene and the show
overlays, **none** of the operator's control tools (ball picker, operator input
dialog, resume dialog, key hints).

Crucially, the operator wants to **preview privately first**, then **push on
demand**:

1. While the operator checks balls on the debug app (e.g. over 2, ball 3, ball
   details), the big screen keeps showing an **idle animation** — it does NOT
   mirror the operator's debugging.
2. When the operator is happy, they click **"Send to Big Screen"** and the big
   screen plays *that* view from the start.
3. When done, the operator presses **R** and the big screen returns to the
   **idle animation**.

## Idle state

The big screen's resting state (before any Send, and after R) is the **default
scene with the idle camera** — the same view the app shows at startup
(`animationType: "Default"`).

## Approach: command push over BroadcastChannel

The big screen is the **same SPA** loaded in a second tab/window with
`?broadcast=1`. It renders a stripped component tree (no operator tools) and is
driven entirely by small **command messages** sent from the operator tab over
the `BroadcastChannel` API (same-origin tabs).

We do NOT mirror raw Redux state. Instead the operator posts a high-level
"show command" describing what to play; the broadcast tab rebuilds the same
state by running the same play logic (re-fetching the same public JSON the
operator used). This removes all state-serialization and per-frame-coalescing
concerns.

### Command shapes

```
{ kind: "single", url }                       // single ball trajectory
{ kind: "over",   urls: [...] }               // one over (up to 6 balls)
{ kind: "pitch",  urls: [...] }               // pitch map (all balls)
{ kind: "drs",    folderUrl, operatorInput }  // DRS replay + baked-in decision
{ kind: "idle" }                              // return to default scene
```

The DRS command carries `operatorInput` (the 3 booleans: softSignal,
originalDecision, isRightHanded) that the operator already chose. The broadcast
tab runs `drsReplay(folderUrl)` then auto-calls `drsSubmitOperatorInput(input)`,
so the DRS plays **with the decision baked in and the operator input dialog
never shown** on the big screen.

## Files

New:
- `src/viewMode.js` — reads `?broadcast` once; exports `isBroadcast`,
  `viewMode`.
- `src/crossTabSync.js` — singleton `BroadcastChannel("drs-broadcast")`.
  - `sendShow(cmd)` (operator) posts `{ type: "show", cmd }`.
  - `startBroadcastReceiver(store)` (broadcast) runs `executeCommand` on each
    incoming command.
- `src/components/drs/showCommands.js` — reusable play logic, extracted from
  `TrajectoryPicker`: `loadBall`, `loadPitching`, `playSingle`, `playOver`,
  `playPitchMap`, `playDrs`, `goIdle`, and `executeCommand(dispatch, cmd)`.
- `src/store/slices/broadcastSlice.js` — tiny slice holding `currentShow` (what
  the operator is currently previewing) so the Send button knows what to push.
- `src/BroadcastApp.jsx` — big-screen tree: `DrsVideoLayer`, `ThreeScene`,
  `Overlay2D`, `MultiTicker`, `MultiPitchTicker`. No `TrajectoryPicker`, no
  `DrsKeyBindings`, no `SocketProvider`. Boots into the idle default scene.

Edited:
- `src/store/store.js` — register `broadcastSlice`.
- `src/main.jsx` — if `isBroadcast`, render `BroadcastApp` and call
  `startBroadcastReceiver(store)` (no `SocketProvider`); else render `App`.
- `src/App.jsx` — top-right **"Broadcast"** button (opens the window with
  `?broadcast=1`, named window so re-click focuses it) and **"Send to Big
  Screen"** button (`sendShow(currentShow)`; disabled when nothing to send).
- `src/components/2d_components/Overlay2D.jsx` — hide `DrsOperatorInputDialog`
  and `ResumeDialog` when `isBroadcast`.
- `src/components/DrsKeyBindings.jsx` — bind **R** → `sendShow({ kind: "idle" })`.
- `src/components/drs/TrajectoryPicker.jsx` — route plays through
  `showCommands`; record `currentShow` on each selection.
- `src/drs/drsController.js` — in `drsSubmitOperatorInput`, record `currentShow`
  = `{ kind: "drs", folderUrl, operatorInput }`.

## Data flow

Operator triggers a show locally (picker / DRS) → that play runs on the operator
tab AND `currentShow` is recorded. Operator clicks **Send to Big Screen** →
`sendShow(currentShow)` → broadcast tab receives → `executeCommand` runs the
same play from the start. Operator presses **R** → `sendShow({kind:"idle"})` →
broadcast `goIdle` → default scene. Operator and broadcast are independent after
a Send (operator can debug the next ball while the big screen holds the sent
view until R).

## Notes / edge cases

- Broadcast videos are `muted` so programmatic `play()` (no user gesture in the
  broadcast tab) isn't blocked by autoplay policy. Big screen is muted anyway.
- Broadcast tab does not open a socket connection (no `SocketProvider`); it is
  driven only by commands.
- `goIdle` = `endDrs()` + `clearAccumulatedTrajectories()` + `clearPitchMap()` +
  `resetAllSessionStates()` → returns to `animationType: "Default"`.

## Testing

No test runner exists in the repo. Command builders and `goIdle` are pure /
dispatch-only and unit-testable if a runner is added. Primary verification is
manual: open the big screen, debug on the operator app, confirm the big screen
stays idle until Send, plays the sent view, and returns to idle on R; confirm no
operator dialogs ever appear on the big screen. Plus `npm run build` / `npm run
lint` clean.
