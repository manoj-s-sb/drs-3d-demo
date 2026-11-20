# "Select All" — Play All 10 Bowling Trajectories (Animated)

Date: 2026-06-23
Branch: drs-view

## Goal

Add a **"Select All"** button to the trajectory picker. Clicking it plays **all 10
bowling trajectories simultaneously** in one go, with the **same UI as the single
ball**:

- thick red (pre-impact) / blue (post-impact) tubes — radius `0.0355`,
- a moving ball per trajectory,
- the same camera move (intro → top-down),
- the on-pitch text zones (FULL TOSS / YORKER / HALF VOLLEY / FULL, with 2M/4M/6M lines),
- **no** details card.

## Reuse decision: new component, shared helpers

**Do not overload `BowlingTrajectory.jsx`.** It is ~425 lines and tightly coupled to a
single ball:

- one `ballData` state, one ref set (`ballRef`, `redMeshRef`, `blueMeshRef`), fetches one `trajectoryUrl`;
- single-ball side effects we must NOT run in multi-mode: `setTrajectoryDetails` (card),
  `setTrajectoryComplete`, DRS hooks (`setDrsPhase`, `setDrsLastBallPos`, DRS camera branch);
- it only animates when `animationType === "TrajectoryView"`, which is the same flag that
  shows the details card.

Generalizing it to N balls would require arrays of refs, a render loop, and conditionals to
suppress the card + DRS — converting a proven, central file into a risky dual-mode component.

**Chosen approach:** extract the ball-agnostic pieces into a shared module, then build a new
`MultiBowlingTrajectory.jsx` that reuses them and contains none of the card/DRS coupling.

## What already exists (reuse as-is)

- `state.session.accumulatedTrajectories` array + `addAccumulatedTrajectory` /
  `clearAccumulatedTrajectories` actions (`sessionSlice.js`).
- `AccumulatedTrajectories.jsx` — renders all trajectories, but **static**, thin (`0.005`),
  no moving ball, no camera, no pitch text.
- Pitch text = the `pitchmap1` model; visibility driven by `showTrajectoryPitchmap`
  (`Ground.jsx`), flipped on by `setTrajectoryOverlay(true)`. The single ball turns it on at
  `BowlingTrajectory.jsx:332`.
- Details card shows only when `animationType === "TrajectoryView"` (`Overlay2D.jsx`).

## Components & flow

### 1. Shared module — `src/components/trajectoryGeometry.js` (new)
Extract, verbatim, the ball-agnostic helpers currently duplicated in `BowlingTrajectory.jsx`
and `AccumulatedTrajectories.jsx`:
- `buildTubeGeometry(pts, radius)`
- `setMeshPts(meshRef, pts, radius)`
- `parseTrajectoryArray(arr, scale)` (frame + Vector3 parsing)
- camera constants `DEFAULT_CAM_POS`, `DEFAULT_CAM_LOOK`, `TOP_CAM_POS`, `TOP_CAM_LOOK`,
  plus `CAMERA_POST_DELAY`, `TOP_MOVE_DURATION`, `smoothstep`.

Refactor `BowlingTrajectory.jsx` and `AccumulatedTrajectories.jsx` to import these. **No
behavior change** — pure DRY so the new component and the single ball cannot drift apart.
(`AccumulatedTrajectories` keeps its own `TUBE_RADIUS = 0.005` local — the static view stays
thin on purpose.)

### 2. State — `src/store/slices/sessionSlice.js`
- Reuse `accumulatedTrajectories` to hold the 10 parsed balls (`{ positions, impactIndex }`).
- Add boolean `multiTrajectoryPlay` (default `false`).
- Add action `startMultiTrajectoryPlay` → sets it `true`.
- `clearAccumulatedTrajectories` → also resets `multiTrajectoryPlay = false`.

### 3. Trigger — `src/components/TrajectoryPicker.jsx`
Add a **"Select All"** button. On click (`onSelectAll`):
1. `setSessionType("BOWLING_SESSION")`, `resetTrajectoryUrl()` (so the single-ball
   `BowlingTrajectory` does not also run),
2. `clearAccumulatedTrajectories()`,
3. fetch all 10 JSON files in parallel; for each, parse `balls[0].trajectory` into
   `{ positions: {x,y,z}[], impactIndex }` scaled by `0.01` (same math as `BowlingTrajectory`),
4. `addAccumulatedTrajectory(parsed)` for each surviving file,
5. `startMultiTrajectoryPlay()`,
6. close the popup (`setTrajectoryPickerOpen(false)`).

### 4. Animated player — `src/components/MultiBowlingTrajectory.jsx` (new)
Reads `accumulatedTrajectories` + `multiTrajectoryPlay`. Returns `null` unless playing and
balls exist. Mirrors the single-ball animation but loops over all balls on **one shared
clock**:

- Per ball: red mesh + blue mesh (grown over time, radius `0.0355`, colors `0xff0000` /
  `0x0066ff`, opacity `0.8`) + a moving ball sphere (scale `0.0355`).
- `useFrame`: one normalized progress `t` (0→1) over a single shared `PLAY_DURATION` so all
  balls start and finish together. For each ball: slice points up to current index, rebuild
  red (up to `impactIndex`) and blue (after `impactIndex`) tubes via `setMeshPts`, move its
  sphere along the lerped path.
- Camera: bootstrap to `DEFAULT_CAM_POS` (fov 8) once; after `CAMERA_POST_DELAY`, smoothstep
  to `TOP_CAM_POS` and dispatch `setTrajectoryOverlay(true)` → pitch text appears. Reuses the
  shared camera constants; **no DRS branch**.
- **Never** sets `animationType = "TrajectoryView"` and never dispatches
  `setTrajectoryDetails` → the details card stays hidden.

### 5. Scene wiring — `src/components/ThreeScene.jsx`
- Mount `<MultiBowlingTrajectory />`.
- Render `<AccumulatedTrajectories />` (static) only when `!multiTrajectoryPlay`, so the
  static and animated sets never double-draw.

## Why the pitch text "just works"
It is the `pitchmap1` model toggled by `showTrajectoryPitchmap`, independent of
`animationType`. Dispatching `setTrajectoryOverlay(true)` from the multi player reveals it the
same way the single ball does — no new geometry or text needed.

## Decisions (confirm)
- All 10 start **simultaneously** (one shared timeline).
- **No** details card during multi-play.
- **New** "Select All" button; per-ball buttons stay.
- Static `AccumulatedTrajectories` view: kept but hidden during multi-play (open question —
  remove entirely if no longer wanted).

## Trade-offs
- All balls normalized to one shared duration (simultaneous finish) — simplest, matches "one
  go." Real per-ball speed differences are not reproduced.
- Reusing `accumulatedTrajectories` + a flag avoids a second parallel data array and keeps the
  static and animated paths sharing one source of truth.

## Out of scope
- Staggered/sequential ball timing.
- Per-ball or aggregate details card.
- DRS-specific camera handling for multi-ball.
```
