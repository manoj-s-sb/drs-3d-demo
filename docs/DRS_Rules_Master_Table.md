# DRS Rules — Master Table (edit one file, the UI follows)

**Verified:** the rules below match `LBW_Full_Matrix.xlsx` for **all 196 rows** (0 mismatches).

---

## The ONE file you edit

**`public/config/drs-review-rules.json`**

- Change a rule here → the UI changes. **No code edit, no rebuild** (it's served from
  `public/`, re-read on each review; refresh the page to pick up edits).
- There is a safety **mirror** in `src/drs/reviewRules.js` (used only if the JSON fails to
  load). Keep the two in sync for production.

## What the rule file controls (everything the review shows)

Each rule has a `when` (which ball it matches) and a `show` block that decides **all** of:

| `show` field | Controls | Values |
|---|---|---|
| `trajectory` | the **3D animation** | `none` (pitch-only, stays on video→top-down) · `toImpact` (stop at pad) · `full` (to stumps) · `lineOnly` (full-toss line) |
| `camera` | the **camera angle / movement** | `auto` (default DRS pose) · `topPitch` (move top-down to the bounce) · `topDown` (full-toss overhead) · `side`/`behind`/`front` |
| `pitchMarker` | show the **bounce ball** | `true` / `false` |
| `impactMarker` | show the **impact ball** | `true` / `false` |
| `panelsLeft` | overlay boxes on the **LEFT** column (top-to-bottom order) | any of: `pitching, impact, wickets, height, originalDecision, finalDecision, playerReview, reviewStatus` — or `[]` for none |
| `panelsRight` | overlay boxes on the **RIGHT** column | same names — or `[]` for none |

`when` matching: first rule whose conditions all match wins. Conditions use
`PRESENT` (value was evaluated), `NA` (not evaluated), an exact value (`OUTSIDE_LEG`), a list, or `any`.

---

## MASTER TABLE — every rule → what the UI does

| # | Rule id | Matches when | Trajectory (animation) | Camera | Markers | Panels shown | Placement |
|---|---|---|---|---|---|---|---|
| 1 | `fulltoss-would-pitch` | Full toss **+ height given (3.4.7)** | **Line only** | Top-down | impact only | Impact · Height · Original · Final · Player · Review | split |
| 2 | `fulltoss-wicket` | Full toss **+ wicket evaluated** | **Full** to stumps | Top-down | impact only | Impact · Wickets · Original · Final · Player · Review | split |
| 3 | `fulltoss-impact` | Full toss **+ impact only** | **To pad** | Top-down | impact only | Impact · Original · Final · Player · Review | split |
| 4 | `fulltoss-fallback` | Full toss (anything else) | **Full** | Top-down | impact only | Impact · Wickets · Original · Final · Player · Review | split |
| 5 | `pitched-outside-leg` | Pitched **+ pitching = Outside Leg** | **None** (no trajectory) | **topPitch** (video → 2s → top-down zoom to bounce) | bounce ball only | **Original Decision · Pitching** | **left** |
| 6 | `pitched-wicket` | Pitched **+ wicket evaluated** | **Full** to stumps | Default (auto) | bounce + impact | Pitching · Impact · Wickets · Original · Final · Player · Review | split |
| 7 | `pitched-impact` | Pitched **+ impact only** (wicket N/A) | **To pad** (stop at impact) | Default (auto) | bounce + impact | Pitching · Impact · Original · Final · Player · Review | split |
| 8 | `pitched-fallback` | Pitched (anything else) | **None** | Default | bounce only | Pitching · Original · Final · Review | split |
| — | `default` | nothing matched (safety net) | **Full** | Default | bounce + impact | all panels | split |

> The **order matters** — rules are checked top-to-bottom, first match wins. That's why
> `pitched-outside-leg` sits **above** `pitched-wicket`: outside-leg is a legal absolute
> stop, so it must win even when the tracker still filled the wicket value.

---

## Plain-English meaning of each scenario

| Situation | What the operator/viewer sees |
|---|---|
| **Pitched outside leg** (rule 5) | Video plays fully → 2s freeze → 3D camera moves **top-down and zooms onto the bounce** (real cricket ball there). Only **Original Decision + Pitching** panels, stacked **left**. No trajectory. |
| **Struck outside off/leg, no wicket check** (rule 7) | Video → 3D shows ball path **up to the pad only**, then stops. Pitching + Impact panels. |
| **Impact in line / umpire's call / outside-off-with-wicket** (rule 6) | **Full trajectory** to the stumps (Hitting/Missing/UC). All decision panels. |
| **Full toss** (rules 1–4) | **Top-down** camera; full/line trajectory (no bounce marker). Height = umpire's call on the 3.4.7 path. |

---

## The animation timeline (outside-leg example, rule 5)

```
mp4 plays fully  →  stop at impact  →  freeze 2 s (clean video, only Original Decision)
   →  cross-dissolve to 3D  →  camera glides to centred top-down on the bounce
   →  bounce ball + Pitching panel appear
```
For the other rules the 3D comes up in the default pose and the trajectory animates to the
stumps (rule 6) or stops at the pad (rule 7) / top-down for full toss (rules 1–4).

---

## To change something tomorrow (examples — JSON only)

- **Make outside-off stop at the pad even when the wicket was checked:** add a rule above
  `pitched-wicket`: `{ "when": {"delivery":"pitched","impact":"OUTSIDE_OFF"}, "show": {"trajectory":"toImpact", …} }`.
- **Move a scenario's panels to the left:** add `"panelLayout": "left"` to its `show`.
- **Change which panels show:** edit that rule's `panels` array (also sets their order).
- **Change the camera for a scenario:** set `camera` to `topPitch` / `topDown` / `auto` / `side` / `behind` / `front`.
- **Turn a trajectory off / to-pad / full:** set `trajectory` to `none` / `toImpact` / `full`.

*Machine-readable source: `public/config/drs-review-rules.json`. Full legal breakdown:
`docs/DRS_LBW_Scenarios_and_Animation.md`. Plain rules for sign-off:
`docs/DRS_Review_UI_Rules_SIMPLE.md`.*
