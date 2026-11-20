// Shared styling for the broadcast lower-third tickers (bowling MultiTicker and
// pitch-map MultiPitchTicker) so both share ONE look. Kept in its own module (not a
// component file) so React Fast Refresh stays happy.

export const hex = (c) => `#${(c >>> 0).toString(16).padStart(6, "0")}`;

// Every dimension is AUTHORED at the 1920×1080 reference frame and expressed in `cqw`
// so the whole ticker scales WITH the frame (exact spec px at 1920, proportionally
// smaller in the operator preview). The wrapper is the size container (see .mt-wrap).
export const ref = (n) => `${((n / 1920) * 100).toFixed(4)}cqw`;
export const FONT = '"DejaVu Sans", sans-serif';

// Font size that scales with the frame (cqw) but is CLAMPED between a px floor and a
// px ceiling: clamp(min, preferred@1920=max, max). The frame can only scale it DOWN to
// `min` on a small window and never past `max` on a big one.
export const clampFont = (min, max) => `clamp(${min}px, ${ref(max)}, ${max}px)`;

export const MT_STYLE = `
/* container-type:inline-size → sizes to content (height auto) and makes 1cqw = 1% of
   the frame width for the children. The bottom gap lives on the inner stack (as a
   margin) so its cqw resolves against this wrapper; putting it on the wrapper itself
   would resolve to 0 (an element can't query its own container). */
.mt-wrap{position:fixed;left:0;bottom:0;width:100%;z-index:9999990;
  display:flex;justify-content:center;pointer-events:none;container-type:inline-size;
  font-family:${FONT}}
.mt-stack{position:relative;pointer-events:auto;margin-bottom:${ref(80)};
  animation:mtIn .6s cubic-bezier(.16,1,.3,1) both;
  filter:drop-shadow(0 ${ref(10)} ${ref(34)} rgba(0,0,0,.45))}
@keyframes mtIn{from{transform:translateY(16%);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes mtBall{from{opacity:0;transform:translateY(${ref(10)})}to{opacity:1;transform:translateY(0)}}

/* Blue header — hugs the bowler name (compact), with a min/max so it's neither tiny nor
   huge. Pokes above the white card, left-inset. */
.mt-head{position:absolute;top:${ref(-66)};left:${ref(70)};
  width:fit-content;min-width:${ref(260)};max-width:${ref(630)};height:${ref(75)};
  display:flex;align-items:center;justify-content:space-between;
  padding:0 ${ref(36)};border-radius:${ref(15)};
  background:#0866B2;
  border-left:${ref(7)} solid #002F7F;border-right:${ref(7)} solid #002F7F;
  box-shadow:0 ${ref(6)} ${ref(18)} rgba(0,0,0,.4)}
.mt-bowler{color:#fff;font-family:${FONT};font-weight:700;font-size:${clampFont(18, 21)};
  letter-spacing:${ref(0.28)};text-transform:uppercase;white-space:nowrap;line-height:1}
.mt-hand{color:#fff;font-family:${FONT};font-weight:700;font-size:${clampFont(18, 18)};
  letter-spacing:${ref(0.22)};text-transform:uppercase;line-height:1}

/* White card — min 856 wide @1920, grows to fit the balls; height auto so the speed
   row always has breathing room (no clipping). Bottom padding = real bottom space. */
/* Card hugs its content (Over label + one fixed-width slot per ball) → it's exactly as
   wide as the over, with no trailing space after the last ball. A small min-width keeps
   very short overs from looking cramped. */
.mt-card{width:fit-content;min-width:${ref(360)};
  padding:${ref(42)} ${ref(40)} ${ref(42)} ${ref(40)};
  display:flex;flex-direction:column;align-items:flex-start;gap:${ref(8)};
  border-radius:${ref(15)};background:#FFF}
/* TOP-aligned so the left Over/labels column lines up row-for-row with the ball columns. */
.mt-row{display:flex;align-items:flex-start;gap:${ref(48)}}
/* Left column mirrors a ball column: a head box (= circle height) holding "Over", then one
   unit label per value row (RUNS / SPEED(KPH)) with the SAME gap as the ball value rows. */
.mt-over-wrap{display:flex;flex-direction:column;align-items:center;gap:${ref(6)};flex:none}
.mt-over-head{height:${ref(38)};display:flex;align-items:center;justify-content:center}
.mt-over{color:#092C49;font-family:${FONT};font-weight:700;font-size:${clampFont(18, 18)};
  letter-spacing:${ref(0.24)};white-space:nowrap}
.mt-over-unit{color:#5b6b82;font-family:${FONT};font-weight:600;font-size:${clampFont(12, 12)};
  letter-spacing:${ref(0.3)};text-transform:uppercase;white-space:nowrap;line-height:1.15}
.mt-balls{display:flex;align-items:flex-start;gap:${ref(48)};flex:none}

/* Solo header → bowler name sits to the LEFT (not centred). */
.mt-head-solo{justify-content:flex-start}
/* Name only (no card under it) → the header sits in normal flow instead of poking
   above a card. */
.mt-head-only{position:relative;top:auto;left:auto}

/* Each ball sits in a FIXED-WIDTH slot (reserved even before it's revealed) so the card
   is sized to the real ball count and never grows/leaves trailing space. */
.mt-ball{width:${ref(50)};flex:none;display:flex;justify-content:center;align-items:flex-start;
  min-height:${ref(52)}}
.mt-ball-in{display:flex;flex-direction:column;justify-content:center;align-items:center;
  gap:${ref(6)};animation:mtBall .45s cubic-bezier(.16,1,.3,1) both}
.mt-circle{width:${ref(38)};height:${ref(38)};padding:${ref(4)};border-radius:50%;
  display:flex;align-items:center;justify-content:center;
  color:#fff;font-family:${FONT};font-weight:700;font-size:${clampFont(14, 14)};line-height:1;
  box-shadow:0 ${ref(2)} ${ref(6)} rgba(0,0,0,.25)}
.mt-speed{color:#092C49;font-family:${FONT};font-weight:700;font-size:${clampFont(12, 12)};
  letter-spacing:${ref(0.16)};line-height:1.15;font-variant-numeric:tabular-nums}
/* Runs value under a ball (runs-only or the second line in "both"). Slightly dimmer so that,
   when both show, the speed reads as primary and the runs as secondary. */
.mt-runs{color:#2c5793;font-family:${FONT};font-weight:800;font-size:${clampFont(12, 12)};
  letter-spacing:${ref(0.16)};line-height:1.15;font-variant-numeric:tabular-nums}

/* Broadcast big screen: shrink the whole bowling ticker + move it DOWN (same scale as
   the stump/pitch tickers) so it clears the dots. Operator tool unaffected. */
.mt-broadcast .mt-stack{transform:scale(0.78);transform-origin:bottom center;
  margin-bottom:${ref(24)}}

/* Operator tool: the ticker is designed at big-screen (1920) size, which reads too large in
   the smaller operator preview. Scale it down so it sits neatly at the bottom of the preview. */
.mt-operator .mt-stack{transform:scale(0.62);transform-origin:bottom center;
  margin-bottom:${ref(20)}}
`;
