# Picture-in-Picture (PiP) — small broadcast window

> Explained simply: the broadcast is like a TV. Normally it fills the screen.
> **PiP = shrink that TV into a small box.** When the box is small, we show **only the
> 3D** (no video, no decision panels) — just the ball-tracking, filling the box. When
> it's big again, the full broadcast comes back. The box decides for itself, by its
> own size.

---

## 1. The one global switch

A single flag drives everything: **`session.compact`**.

- `true`  → the broadcast window is **small**: `width ≤ 400px` **OR** `height ≤ 600px`.
- `false` → normal full broadcast.

Only the **broadcast window** sets it (it measures itself on open + on every resize).
The **operator tool never touches it** → the operator is 100% unaffected.

Everything else only *reads* this flag. This is the single source of truth.

---

## 2. What shows in each mode

| Layer                               | Full (normal) | **Compact (PiP, ≤400×600)**            |
| ----------------------------------- | ------------- | -------------------------------------- |
| MP4 video (DRS / no-ball)           | ✅ shown       | **hidden** (still runs, just invisible) |
| 3D scene (DRS 3D, bowling, pitch …) | ✅             | ✅ **fills the box, stadium kept**      |
| Decision panels (`Overlay2D`)       | ✅             | **hidden**                             |
| Ticker                              | ✅             | ✅ (scales down with the box)          |

Click **DRS** while small → you see **only the DRS 3D** (no video). Same for every
mode. Modes that never had video (bowling / pitch / swing / highlights) just show
their 3D.

### Why the video stays MOUNTED (but hidden) — the DRS fix

The DRS video layer (`DrsVideoLayer`) is not just the picture — it also **drives the
DRS through its phases** (video → review) and the pitch/impact marker timing. If we
*unmount* it in compact, the DRS **never progresses to the 3D review** → black /
stuck screen. (This is exactly why "DRS didn't work in the small screen" before.)

**Rule:** in compact we keep `DrsVideoLayer` mounted but **visually hidden
(`opacity:0`)**. The video still plays and advances the phases; you just don't see
it. The 3D renders on top, so you get a clean 3D-only view that still works end to end.

---

## 3. How they size it (squeeze / full)

Two ways, both supported:

**A — Operator toggle (recommended):** one **Broadcast** button opens the window; a
**`Full ⟷ PiP`** toggle next to it resizes the SAME window live:
- **PiP** → `window.resizeTo(400, 600)` → window becomes small → compact auto-on.
- **Full** → `window.resizeTo(screen)` → compact off → full show.
Uses our own window handle → **no browser permission popup.**

**B — Manual resize:** drag the broadcast window smaller/larger. Crossing 400×600
flips compact live, by itself.

---

## 4. Clean window (no browser UI)

A page can open a window at three "clean" levels:

| Level                 | How                                        | Chrome shown                         | Small box? |
| --------------------- | ------------------------------------------ | ------------------------------------ | ---------- |
| Tab (worst)           | open `?broadcast=1` in a tab               | tabs + address bar + bookmarks       | —          |
| **Popup** (what we use) | `window.open(url,name,"popup=yes,w,h")`  | **no tabs / no address bar** (thin OS title bar only) | ✅         |
| Fullscreen            | `requestFullscreen()`                      | nothing at all                       | ❌ (can't be small) |

- **Always open via the button as a POPUP** (never a tab) → no address bar.
- **Full** mode → popup sized to the screen, optional `requestFullscreen` for true
  edge-to-edge.
- **PiP** mode → small popup. **We do NOT call fullscreen** (it can't be small and it
  shows the "press Esc" banner we don't want).

### Killing the fullscreen fight

Today the big screen **auto-goes-fullscreen on click**. That fights PiP (one click
would blow the small box up). **Rule:** when the window is small (compact), **all
auto-fullscreen is disabled** (no click-to-full, no F-key, no banner). Big → fullscreen
works as before; small → stays small and clean.

### The one honest limit — and how to get ZERO browser chrome

Modern browsers **always show a slim address bar on a script-opened popup**
(`window.open`), and **Chrome changed this ~2020 for anti-spoofing** — so the URL bar
**cannot be removed from the page's code**, in Chrome *or* Safari. `toolbar=no` /
`location=no` etc. are ignored.

To get a **completely clean window** (no address bar, no tabs), open the broadcast URL
in Chrome **app mode** — a window with no chrome that you can still resize small (so
the PiP profile kicks in):

```bash
# macOS
open -na "Google Chrome" --args --app="http://localhost:5173/?broadcast=1"

# Windows
chrome.exe --app="http://localhost:5173/?broadcast=1"

# Linux
google-chrome --app="http://localhost:5173/?broadcast=1"
```

- The window opens with **no address bar / no tabs** — just the content.
- **Drag its corner down to ≤ 400×600** → the app auto-switches to the **3D-only PiP**
  (fully clean). Drag it big again → full broadcast returns.
- For a locked-down broadcast machine, add **`--kiosk`** for zero chrome that can't be
  exited: `--kiosk --app="…/?broadcast=1"`.
- Replace `localhost:5173` with the real host/port in production.

You can also run it straight from the Claude Code prompt:
`! open -na "Google Chrome" --args --app="http://localhost:5173/?broadcast=1"`

(A plain `window.open` popup still works and is fine when a thin URL bar is
acceptable, or when the production vision mixer crops it.)

---

## 5. Every scenario

- **Normal big screen** → unchanged; full show; click-to-fullscreen still works.
- **Operator taps PiP** → window shrinks to 400×600, shows only the 3D; no popup.
- **DRS played while in PiP** → only the DRS 3D (video hidden but still driving the
  phases → the 3D review arrives normally). ← the key fix.
- **Operator taps Full** → window grows, full show returns, still in sync.
- **Drag resize small/large** → switches 3D-only ⟷ full live.
- **Click the small window** → nothing jumps to fullscreen (suppressed while small).
- **Bowling / Pitch / Swing / Highlights in PiP** → their 3D shows; ticker scales.
- **Idle** → stadium 3D in the small box.

---

## 6. Files touched (and why each is safe)

| File                          | Change                                                                 | Safe because                                          |
| ----------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------- |
| `store/slices/sessionSlice.js`| add `compact` flag + `setCompact`                                      | new field; nothing reads it unless told to            |
| `BroadcastApp.jsx`            | measure window → set flag; hide video (opacity 0) + panels in compact; `ThreeScene fill`; disable auto-fullscreen when compact | only the broadcast view; purely presentation          |
| `ThreeScene.jsx`              | `fill` prop → 3D fills the box (no cover-box crop)                     | off by default → zero effect elsewhere                |
| `FixedScene.jsx`              | keep the stadium in compact (don't hide it during the DRS video phase)| guarded by `compact`; normal big screen unchanged     |
| `OperatorDashboard.jsx`       | add the `Full ⟷ PiP` toggle (uses the existing window handle)          | new control; existing Start / Send / Stop untouched   |

**Not touched:** the command system, `crossTabSync`, the renderers' logic, the
operator's existing controls. Everything is gated by the single `compact` flag, so the
existing flow cannot break.

---

## 7. Performance / smoothness

- The flag is set only on **resize** (and once on open) — not per frame.
- Compact rendering **mounts fewer layers** (no panels), and the video is hidden — so
  the small window is lighter than the full one.
- The 3D uses the mode's existing camera driver (filling the box). A dedicated compact
  camera angle can be added later as a tunable preset without touching this wiring.
