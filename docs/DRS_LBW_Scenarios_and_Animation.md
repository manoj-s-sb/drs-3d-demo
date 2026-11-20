# DRS LBW — Scenarios & Animation Logic

A plain-English guide to **what to show in the 3D DRS review** for every LBW scenario,
derived from `LBW_Full_Matrix.xlsx` (124 rows, ICC Appendix D clauses 3.4.4–3.4.9 + 3.6).

This doc is the single reference for:
1. The decision gates and the order they run in.
2. When to show the **pitch animation only** vs the **full trajectory** vs the **top-down line**.
3. When to show each **decision overlay** panel.
4. The three new **check points** requested (pitch-only, full-toss, overlay gate).

> No code is changed by this doc — it describes the intended behaviour so the
> implementation can follow it exactly.

---

## 1. The one rule behind everything

LBW is judged as a **pipeline of gates, in strict order**. The moment a gate fails,
adjudication **stops** — every gate after it is **N/A ("never evaluated")**.

```
Gate 1: PITCHING   (3.4.4)   where the ball bounced
   ↓ (pass)
Gate 2: IMPACT     (3.4.5)   where it hit the pad
   ↓ (pass)
Gate 3: WICKET     (3.4.6)   would it hit the stumps
   ↓ (pass, Not-out reviews only)
Gate 4: DISTANCE   (3.4.6.4) pitch-to-impact override
```
Plus two special outputs:
- **HEIGHT (3.4.9)** — only for a full toss that *would* have pitched: the on-field
  umpire judges height; the tracker cannot.
- **DISTANCE (3.4.6.4)** — a "too far" safety override, **Not-out reviews only**.

**Key insight for animation:** `N/A` = that stage was never reached, so **there is
nothing to animate for it.** What we render is exactly the stages that were evaluated.

---

## 2. Gate values (what each stage can be)

| Gate | Possible values |
|---|---|
| **PITCHING** | `In Line`, `Outside Off`, `Outside Leg`, **`N/A` (full toss — no bounce)** |
| **IMPACT** | `In Line`, `Outside (off)`, `Outside (leg)`, `Umpire's Call`, `N/A` |
| **WICKET** | `Hitting`, `Missing`, `Umpire's Call`, `N/A` |
| **HEIGHT** | `Would have hit`, `Going over`, `N/A` (only used on full-toss 3.4.7 path) |
| **DISTANCE** | `≤250cm`, `250–300cm (≥40cm pitch-to-impact)`, `250–300cm (<40cm)`, `≥300cm`, `N/A` |

---

## 3. Where adjudication stops → what to animate

This is the heart of the animation logic. Read the **"DECISION MADE AT"** stage:

| Stops at | When | What is shown in 3D |
|---|---|---|
| **PITCHING** | `Outside Leg` (pitched outside leg) | **Pitch animation ONLY** — show the bounce point. **No trajectory to the stumps.** Impact & Wicket are N/A. |
| **IMPACT** | Impact `Outside (off)` / `Outside (leg)`, or `Umpire's Call` decides it | Show **pitch → ball travel → impact point**. **No wicket projection / no "will it hit" tube.** Wicket is N/A. |
| **WICKET** | Impact was `In Line` and it reached the wicket gate | Show the **full trajectory**: pitch → impact → **projected path to the stumps** (Hitting / Missing / Umpire's Call zone). |
| **DISTANCE** | Not-out review, all 3 against batter, but too far | Same as WICKET (full trajectory) **plus** the pitch-to-impact distance readout. |
| **HEIGHT** | Full toss (3.4.7), line is Hitting | Show trajectory **line only** from above the wicket; height caption = umpire's call. |

### The plain-language summary
- **Pitched outside leg** → just show where it pitched. Nothing else matters. ✅ (Check A)
- **Hit outside the line / umpire's call at impact** → show up to the impact, stop there.
- **Everything lined up (impact in line)** → show the full ball-to-stumps trajectory.

---

## 4. The three CHECK POINTS (as requested)

### ✅ Check A — Pitch-only (no trajectory)
> "if the impact and the wicket is N/A then we no need to show the trajectory,
> just show the pitch animation."

```
IF IMPACT == N/A  AND  WICKET == N/A
   → render PITCH ANIMATION ONLY (bounce point / pitch map)
   → DO NOT render the 3D trajectory tube to the stumps
```
This uniquely means **the ball pitched outside leg** and the review died at Gate 1
(matrix rows 23, 56, 73, 100). Where it *would* have gone is irrelevant, so no tube.

### ✅ Check B — Full toss (top angle + trajectory)
> "if its full toss then need one check for full then show the top angle with trajectory."

```
IF DELIVERY == Full toss   (PITCHING == N/A because it was "struck on the full")
   → use the TOP-DOWN camera angle
   → render the trajectory projected from directly above the wicket (clause 3.4.8)
   → there is NO pitch marker (no bounce point exists)
   → if it "WOULD have pitched" (3.4.7): height is the on-field umpire's call,
     tracker shows LINE only (3.4.9) — caption height, don't animate a height verdict.
```
Full toss is detected by **PITCHING = N/A / "no pitching point"** (matrix rows 101+).
A full toss also has **no outside-leg escape** and the distance override can never fire.

### ✅ Check C — Overlay gate (which panels to show)
> "need one more check point to show the overlay also."

**Show a decision-overlay panel only when its stage was actually evaluated (value ≠ N/A).**

```
Show PITCHING panel   IF PITCHING != N/A      (hidden on a full toss)
Show IMPACT panel     IF IMPACT   != N/A      (hidden if stopped at pitching)
Show WICKET panel     IF WICKET   != N/A      (hidden if stopped at pitching or impact)
Show HEIGHT panel     IF HEIGHT   != N/A      (only full-toss 3.4.7 path)
Show DISTANCE panel   IF DISTANCE != N/A      (only Not-out reviews that reached it)
Original / Final / Player-review → always shown for a real review.
```
This mirrors the matrix exactly: a panel appears **iff** the matrix cell is not N/A.

---

## 5. Decision outcomes & overlay colours

Values map to colours (matches `DrsDecisionOverlay.jsx`):

| Colour | Meaning | Values |
|---|---|---|
| 🔴 **RED** | against the batter | `In Line` (impact), `Hitting`, `OUT`, `Unsuccessful` |
| 🟢 **GREEN** | for the batter | `Not Out`, `Missing`, `Successful` |
| ⚪ **NEUTRAL** | umpire's call / N/A | `Umpire's Call`, `N/A`, `—` |

**Umpire's Call** at any gate → decision **stays as the on-field call** (3.6.4) and the
**review is retained** (not lost).

---

## 6. Review retained vs lost (3.6) — for the review-counter

| Outcome | Review category | Review lost? |
|---|---|---|
| On-field decision **changed** by conclusive evidence | Successful (3.6.2) | **No — retained** |
| Conclusive evidence **upholds** the on-field decision | Unsuccessful (3.6.3) | **Yes — lost** |
| Any gate is **Umpire's Call** | Unchanged (3.6.4) | **No — retained** |

(The ticker's Bat/Bowl review dots decrement only when a review is **lost**.)

---

## 7. Complete scenario table

Every scenario shape in the matrix, grouped so it's easy to scan. The **Animation**
column is what the 3D renderer must show. The **Final** column shows the tracker-driven
outcome; where it depends on the on-field call, both are given as `Not-out review → X /
Out review → Y`.

> Legend — **UC** = Umpire's Call. "Full trajectory" = pitch → impact → projected path
> to the stumps. "Pitch → impact" = ball travel up to the pad, no stump projection.

### 7A. Pitched deliveries

| # | Pitch | Impact | Wicket | Stops at | Final (Not-out rev / Out rev) | Animation |
|---|---|---|---|---|---|---|
| P1 | **Outside Leg** | — | — | PITCHING | NOT OUT / NOT OUT | **🟡 Pitch only** (no trajectory) — *Check A* |
| P2 | In Line / Outside Off | **Outside (off)** | — | IMPACT | NOT OUT / NOT OUT | Pitch → impact (stop) |
| P3 | In Line / Outside Off | **Outside (leg)** | — | IMPACT | NOT OUT / NOT OUT | Pitch → impact (stop) |
| P4 | In Line / Outside Off | In Line | **Hitting** | WICKET | **OUT** / OUT | **Full trajectory** (ball hits stumps) |
| P5 | In Line / Outside Off | In Line | **Missing** | WICKET | NOT OUT / NOT OUT | **Full trajectory** (ball misses) |
| P6 | In Line / Outside Off | In Line | **UC** | WICKET | NOT OUT / OUT (stays on-field) | **Full trajectory** (UC zone at stumps) |
| P7 | In Line / Outside Off | In Line | Hitting | DISTANCE | NOT OUT / — (Out rev has no distance test) | **Full trajectory** + pitch-to-impact distance |
| P8 | In Line / Outside Off | **UC** | Hitting / UC / Missing | IMPACT (UC) | NOT OUT / OUT (stays on-field) | **Full trajectory** (wicket still shown — sets review-lost) |

Notes for 7A:
- **P1** is the only pitch-only case (pitched outside leg → adjudication dies at Gate 1).
- **P7 (distance)** only occurs on a **Not-out review** where all three gates are against
  the batter but pitch-to-impact is too short/too far (3.4.6.4). On an **Out review** there
  is no distance test.
- **P8**: even though the outcome is fixed at IMPACT (Umpire's Call), the **wicket is still
  shown** because it decides whether the review is lost (3.6.4) — so render the full trajectory.

### 7B. Full-toss deliveries (no bounce → **top-down camera**, *Check B*)

| # | Sub-type | Impact | Wicket / Height | Stops at | Final | Animation |
|---|---|---|---|---|---|---|
| F1 | Would NOT have pitched | In Line | Hitting | WICKET | **OUT** | Top-down + **full trajectory** (no pitch marker) |
| F2 | Would NOT have pitched | In Line | Missing | WICKET | NOT OUT | Top-down + full trajectory (misses) |
| F3 | Would NOT have pitched | In Line | UC | WICKET | NOT OUT (stays on-field) | Top-down + full trajectory (UC zone) |
| F4 | Would NOT have pitched | UC | any | IMPACT (UC) | NOT OUT (stays on-field) | Top-down, ball → impact |
| F5 | Would NOT have pitched | Outside (off/leg) | — | IMPACT | NOT OUT | Top-down, ball → impact (stop) |
| F6 | **WOULD have pitched (3.4.7)** | In Line | **Would have hit** | HEIGHT | **OUT** | Top-down **line only**; height = **umpire's call** (3.4.9) |
| F7 | WOULD have pitched (3.4.7) | In Line | **Going over** | HEIGHT | NOT OUT | Top-down line only; height = umpire's call |
| F8 | WOULD have pitched (3.4.7) | In Line / UC | line only, height N/A | WICKET/IMPACT | NOT OUT | Top-down line; **line decides**, height never relevant |

Notes for 7B:
- A full toss has **no pitch marker** (nothing bounced) and **no outside-leg escape**
  (3.4.4.4 can't fire); the distance override can never engage.
- **F6/F7** are the only paths where the **tracker cannot give a complete answer** — it
  shows the **line**, and the **on-field umpire** judges height (3.4.9). Caption the height
  panel as the umpire's call; do not animate a tracked height verdict.
- A full toss **above waist height is a No-ball** — it never becomes an LBW review.

### 7C. Overlay panels per case (quick reference — *Check C*)

| Case | Pitching | Impact | Wicket | Height | Distance |
|---|---|---|---|---|---|
| P1 (outside leg) | ✅ | — | — | — | — |
| P2 / P3 (impact outside) | ✅ | ✅ | — | — | — |
| P4–P6 (reached wicket) | ✅ | ✅ | ✅ | — | — |
| P7 (distance) | ✅ | ✅ | ✅ | — | ✅ |
| P8 (impact UC) | ✅ | ✅ | ✅ | — | — |
| F1–F5 (full toss, tracked) | — | ✅ | ✅ (F1-F3) | — | — |
| F6–F8 (full toss 3.4.7) | — | ✅ | ✅ (line) | ✅ | — |

(✅ = panel shown; — = N/A, panel hidden. Original / Final / Player-review always show.)

---

## 7D. The rules config (edit this, not the code)

All of the above is encoded in **`public/config/drs-review-rules.json`** so the review UI
is **data-driven** — change a rule there and the UI changes, no code edit / no rebuild
(it lives in `public/`, served as-is).

**How it works:** for each ball the renderer reads the gate values
(`delivery / pitching / impact / wicket / height / distance`), walks `rules` top-to-bottom,
and applies the **first** rule whose `when` matches (else `default`). Each rule's `show`
block sets exactly what appears:

| `show` field | Meaning | Values |
|---|---|---|
| `trajectory` | how much of the ball path to draw | `none` · `pitchOnly` · `toImpact` · `full` · `lineOnly` |
| `camera` | review camera angle | `auto` · `topDown` · `side` · `behind` · `front` |
| `pitchMarker` | show the bounce dot | `true` / `false` |
| `impactMarker` | show the impact dot | `true` / `false` |
| `panels` | which overlay panels are visible | any of `pitching, impact, wickets, height, originalDecision, finalDecision, playerReview, reviewStatus` |

**Example — the "pitched outside leg" rule** (matches the IPL still: Pitching + Original
Decision + Review status only, no trajectory):
```json
{
  "id": "pitched-outside-leg",
  "when": { "delivery": "pitched", "pitching": "OUTSIDE_LEG" },
  "show": {
    "trajectory": "none",
    "pitchMarker": true,
    "panels": ["pitching", "originalDecision", "finalDecision", "reviewStatus"]
  }
}
```

To change a rule tomorrow (e.g. also show the impact panel on outside-leg), just add
`"impact"` to that rule's `panels` array — nothing in the code changes.

---

## 8. Decision flow (pseudocode for the renderer)

```
if delivery == FULL_TOSS:                      # Check B
    camera = TOP_DOWN
    show trajectory projected from above the wicket
    pitch marker = none
    if path == "would have pitched (3.4.7)":
        height = ON_FIELD_UMPIRE (line only, 3.4.9)
else:
    show pitch marker (bounce point)
    if IMPACT == N/A and WICKET == N/A:        # Check A  (pitched outside leg)
        render pitch animation ONLY            # no trajectory tube
    elif WICKET == N/A:                        # stopped at impact
        render ball path up to IMPACT only
    else:                                      # reached wicket gate
        render full trajectory to the stumps
        if DISTANCE != N/A: show pitch-to-impact distance

# Overlay (Check C): show each panel only if its value != N/A
for panel in [PITCHING, IMPACT, WICKET, HEIGHT, DISTANCE]:
    panel.visible = (value != "N/A")
```

---

## 9. Open items flagged in the matrix (raise with ICC)

- **Ambiguity A** — On a Not-out review where all three gates are against the batter
  but the pitch-to-impact distance saves him (3.4.6.4), the review is recorded **lost**.
- **Ambiguity B** — The distance override (3.4.6.4) names only `IMPACT = In Line`;
  on an "Umpire's Call / Outside" impact-with-no-shot path there is literally no
  distance protection. Almost certainly unintended.
- **Full-toss inference** — Appendix D has **no clause** for a full toss that would
  *not* have pitched; the matrix assumes the ordinary 3.4.6 process applies with full
  height prediction. **Pending ICC confirmation.**
- **A full toss above waist height is a No-ball** and dies before Gate 0 (never an LBW).

---

*Source: `LBW_Full_Matrix.xlsx` — "FULL LBW REVIEW SCENARIO MATRIX", 124 scenarios,
ICC Appendix D (3.4.4–3.4.9) and Law 3.6. This doc summarises it for the 3D DRS
renderer; the spreadsheet remains the authoritative per-row reference.*
