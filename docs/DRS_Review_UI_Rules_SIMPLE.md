# DRS Review — What the Screen Shows (Simple Rules)

A plain-English list of every rule that decides **what appears on the DRS review screen**
for each type of ball. Read top to bottom — the **first situation that matches the ball
wins**. For each ball we show: the **ball path (trajectory)**, the **camera angle**, and a
set of **info boxes (panels)**.

> Purpose: confirm these rules are correct. Once approved, the screen follows them exactly
> (they live in a settings file, so a rule can be changed later without touching the app).

---

## Quick glossary (so everyone reads it the same way)

- **Pitched** = the ball bounced before reaching the batter.
- **Full toss** = the ball reached the batter **without bouncing**.
- **Pitching** = **where the ball bounced** (In line / Outside off / Outside leg).
- **Impact** = **where the ball hit the pad** (In line / Outside off / Outside leg).
- **Wicket** = **would it have hit the stumps** (Hitting / Missing / Umpire's Call).
- **Trajectory** = the coloured ball-path line shown in 3D.
- **Panels** = the info boxes (Pitching, Impact, Wickets, Original Decision, Final Decision,
  Player Review, Review Retained/Lost).

---

## THE RULES (first match wins)

### Rule 1 — Ball pitched **OUTSIDE LEG**
- **When:** the ball **bounced outside leg stump**.
- **Why:** by law the batter is **Not Out** immediately — nothing after this matters.
- **Show on screen:**
  - Trajectory: **NONE** (do **not** draw the ball path to the stumps)
  - Only the **bounce spot** is shown
  - Camera: normal
  - Panels: **Pitching**, **Original Decision**, **Review Retained/Lost**
- *(This is the IPL example: “Pitching — Outside Leg”, no trajectory.)*

---

### Rule 2 — Ball **STRUCK OUTSIDE OFF** (impact outside off)
- **When:** the ball **hit the pad outside off stump** (and the batter played a shot).
- **Why:** the review stops here — we never check the stumps.
- **Show on screen:**
  - Trajectory: **UP TO THE PAD ONLY** (no line continuing to the stumps)
  - Camera: normal
  - Panels: **Pitching**, **Impact**, **Original Decision**, **Final Decision**,
    **Player Review**, **Review Retained/Lost**

---

### Rule 3 — Ball **STRUCK OUTSIDE LEG** (impact outside leg)
- **When:** the ball **hit the pad outside leg stump**.
- **Why:** review stops at impact — stumps not checked.
- **Show on screen:** **same as Rule 2** (trajectory up to the pad only).

---

### Rule 4 — Ball **IN LINE** at impact → full check
- **When:** the ball **hit the pad in line** (or Umpire's Call at impact). This is the
  normal LBW case that goes all the way to the stumps.
- **Show on screen:**
  - Trajectory: **FULL** — bounce → pad → **projected path to the stumps**
    (shows Hitting / Missing / Umpire's Call zone)
  - Camera: normal
  - Panels: **Pitching**, **Impact**, **Wickets**, **Original Decision**,
    **Final Decision**, **Player Review**, **Review Retained/Lost**
- *Note: whether the ball pitched In line **or Outside off** does not stop the review —
  both come here and show the full trajectory.*

---

### Rule 5 — **FULL TOSS** (ball did not bounce)
- **When:** the ball reached the batter **without bouncing**.
- **Show on screen:**
  - Camera: **TOP-DOWN** (view from directly above the stumps)
  - Trajectory: **FULL** projected path (there is **no bounce spot** to show)
  - Panels: **Impact**, **Wickets**, **Original Decision**, **Final Decision**,
    **Player Review**, **Review Retained/Lost**

---

### Rule 6 — **FULL TOSS that would have bounced first** (special height case)
- **When:** a full toss that, if not intercepted, **would have pitched** before the stumps.
- **Why:** the tracker can show the **line**, but **height is the on-field umpire's call**
  (the system must not decide height here).
- **Show on screen:**
  - Camera: **TOP-DOWN**
  - Trajectory: **LINE ONLY** (side-to-side line, no height verdict animated)
  - Panels: **Impact**, **Height (umpire's call)**, **Original Decision**,
    **Final Decision**, **Player Review**, **Review Retained/Lost**

---

### Default — anything not covered above
- Trajectory: **FULL**, camera normal, **all panels shown**. (Safety net — shows everything.)

---

## One-page summary table

| # | Situation | Trajectory shown | Camera | Panels shown |
|---|---|---|---|---|
| 1 | **Pitched outside leg** | ❌ None (bounce spot only) | Normal | Pitching · Original · Review |
| 2 | **Impact outside off** | ➖ Up to the pad only | Normal | Pitching · Impact · Original · Final · Player · Review |
| 3 | **Impact outside leg** | ➖ Up to the pad only | Normal | Pitching · Impact · Original · Final · Player · Review |
| 4 | **Impact in line** (pitched in line OR outside off) | ✅ Full (to stumps) | Normal | Pitching · Impact · Wickets · Original · Final · Player · Review |
| 5 | **Full toss** | ✅ Full (no bounce spot) | Top-down | Impact · Wickets · Original · Final · Player · Review |
| 6 | **Full toss, would have pitched** | ➖ Line only | Top-down | Impact · Height(umpire) · Original · Final · Player · Review |
| — | Default (anything else) | ✅ Full | Normal | All panels |

---

## Two standing rules that apply to all of the above

1. **Umpire's Call** at any stage → the **on-field decision stays**, and the **review is
   retained** (team does not lose it).
2. **Review Retained vs Lost:**
   - Decision **changed** by clear evidence → review **retained**.
   - Decision **stayed the same** (clear evidence upheld it) → review **lost**.
   - Any **Umpire's Call** → review **retained**.

---

*For the full ball-by-ball legal breakdown (124 scenarios, ICC Appendix D), see
`DRS_LBW_Scenarios_and_Animation.md`. The machine-readable version of these rules is
`public/config/drs-review-rules.json`.*
