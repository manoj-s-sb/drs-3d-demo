import { useSelector } from "react-redux";
import { selectPitchMapPoints } from "../../store/slices/sessionSlice";
import FiguresTicker from "./FiguresTicker";
import { OUTCOME_LEGEND } from "./ballColors";

// Pitch-map lower-third — a centred BOWLER-name blue header (same in both dot styles):
//   • "With runs" → optional free TEXT line under it (white card; empty = header only).
//   • "By ball"   → the outcome colour LEGEND as the card (no free text). This way both
//                   views share the same centred bowler container.
// The LENGTH DISTRIBUTION % chips + metre markers are a separate overlay (PitchMapOverlay).

export default function MultiPitchTicker() {
  const active = useSelector((s) => s.session.pitchMapActive);
  const points = useSelector(selectPitchMapPoints); // real balls + operator fake balls
  const bowling = useSelector((s) => s.score?.bowling);
  const hideTicker = useSelector((s) => s.session.hideTicker);
  const hideBowler = useSelector((s) => s.session.hideBowler);
  const pitchDotStyle = useSelector((s) => s.session.pitchDotStyle);
  // Editable bowler name (blue header) + free text (white card).
  const pitchBowlerName = useSelector((s) => s.session.pitchBowlerName);
  const pitchTickerText = useSelector((s) => s.session.pitchTickerText);
  const pitchNameKeepCase = useSelector((s) => s.session.pitchNameKeepCase);
  const ballCategories = useSelector((s) => s.session.ballCategories);

  if (hideTicker) return null; // operator hid the ticker
  if (!active || !points?.length) return null;

  const byBall = pitchDotStyle === "ball";
  // Header = operator's bowler name, else the score API bowler, else a neutral fallback.
  const headerLabel =
    (pitchBowlerName && pitchBowlerName.trim()) || bowling?.bowler || "BOWLER";
  // "With runs" → the free-text white card (empty → header only).
  // "By ball"   → the colour legend as the card (no free text). Only the operator-enabled
  //               categories appear (ballCategories).
  const text = byBall ? "" : (pitchTickerText || "").trim();
  const legend = OUTCOME_LEGEND.filter((l) => ballCategories[l.key] !== false);

  return (
    <FiguresTicker
      name={headerLabel}
      hand={null} // bowler name only (no hand tag)
      text={text}
      legend={byBall ? legend : null}
      hideHeader={hideBowler} // "Hide bowler container" operator toggle
      keepCase={pitchNameKeepCase} // operator option: name as typed, not UPPERCASE
    />
  );
}
