# DRS — Open Questions (need decisions / backend confirmation)

Things the DRS review currently **assumes** or **falls back on**, that should be
confirmed. Each item: what the code does today, and the question to answer.

---

## 1. Video start frame — fallback when `bowling_frame` is null ✅ DECIDED (option B)

**Now (implemented):** the delivery video starts at **`bowling_frame`** from
`ball_coords.json`. If `bowling_frame` is **null**, it starts from the **beginning
of the video (frame 0)** — no fallback to `release_frame` / `detect_start`
(`src/drs/drsController.js`):

```
start = bowling_frame ?? null      // null → play from frame 0
```

> Note: the local sample balls have `bowling_frame: null`, so with option B they
> now start from the **beginning** of the video (previously they used
> `release_frame`). Real match data with a real `bowling_frame` starts at it.

---

## 2. Video FPS is hard-coded to 120

**Today:** frame → time uses `VIDEO_FPS = 120` (`src/drs/drsConfig.js`):
`startTime = bowling_frame / 120`. Same constant drives the pitch/impact/stop
frame timing.

**Question:** is every delivery mp4 truly **120 fps**? If some are 60/30/50 fps,
the start (and pitch/impact/stop) will land at the **wrong moment**.
- **Best fix:** have the backend include the real **fps** (or the total frame
  count) per ball in `ball_coords.json`, so we never guess.

---

## 3. "Shot offered" is not in the data

**Today:** the LBW matrix distinguishes *impact outside off **with** a shot* (stop
at pad) vs *without a shot* (wicket still checked → full trajectory). The ball
data has **no "shot offered" flag**, so the app decides by **whether the wicket
value was evaluated** (present → full; N/A → stop at pad).

**Question:** is that proxy acceptable, or should the backend send a
`shotOffered` flag so this matches the matrix exactly?

---

## 4. Review Retained / Lost derivation

**Today:** the `reviewStatus` panel shows **RETAINED / LOST** derived from
`playerReview`: `SUCCESSFUL → RETAINED`, `UNSUCCESSFUL → LOST`, anything else →
RETAINED.

**Question:** is this correct for all cases (especially **Umpire's Call**, which
by law retains the review)? Should the backend send an explicit `reviewLost` /
`reviewRetained` value instead of us deriving it?

---

## 5. Per-camera alignment transform for cameras 4/5/6

**Today:** the 3D overlay roll/alignment uses `<cam>_transform` from
`ball_coords.json`. Transforms only exist for the cameras that **produced** the
ball (`produced_by.cameras`, e.g. `[1,2,3]`). Cameras without a transform (e.g.
CAM 4) fall back to raw calibration → a slight **roll/tilt** on the overlay.

**Question:** should the backend emit a `<cam>_transform` for **every** camera, or
should we add a manual per-camera roll offset in the app as a backup?

---

## 6. Full-toss data is untested

**Today:** the rules for full toss (top-down, line-only for 3.4.7, height =
umpire's call) exist in `drs-review-rules.json`, but the sample data has **no
full-toss balls** (no `pitching = N/A` + `height`).

**Question:** what fields will the backend send for a full toss (how do we detect
it, and where does the height verdict come from)? The rules are ready but
unverified against real data.

---

## 7. Overlay panel placement granularity

**Today:** panels are placed with two lists — `panelsLeft` / `panelsRight`
(left/right columns). Order in the list = top-to-bottom.

**Question:** is left/right enough, or do you need finer control (specific
corners, a custom x/y, stacking within a corner)? Easy to extend the config if so.

---

## 8. LBW matrix ambiguities (flagged in `LBW_Full_Matrix.xlsx`, raise with ICC)

- **Ambiguity A** — Not-out review, all three gates against the batter but the
  pitch-to-impact distance saves him (3.4.6.4): the review is recorded **lost**.
- **Ambiguity B** — the distance override (3.4.6.4) names only `IMPACT = In Line`;
  on an "Umpire's Call / Outside" impact-with-no-shot path there is literally no
  distance protection. Almost certainly unintended.
- **Full toss that would NOT have pitched** — Appendix D has no clause; the matrix
  assumes the ordinary 3.4.6 process with full height prediction (inferred,
  pending ICC confirmation).

---

*Related docs: `DRS_Rules_Master_Table.md` (the config + rules), the matrix
`LBW_Full_Matrix.xlsx`, and the fps/start code in `drsController.js` +
`DrsVideoLayer.jsx`.*
