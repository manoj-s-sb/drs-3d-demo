import { useSelector } from "react-redux";
import FiguresTicker from "./FiguresTicker";

// Wagon-wheel lower-third — same style as the pitch/stump ticker: a centred blue BATSMAN-name
// header with a white card below holding the boundary legend (blue ball = Fours, red ball =
// Sixes). Shown only while the wagon wheel is active; respects the operator's Hide-ticker toggle.
const WAGON_LEGEND = [
  { key: "four", label: "FOURS", color: "#0866B2" }, // blue
  { key: "six", label: "SIXES", color: "#FF0004" }, // red
];

export default function WagonTicker() {
  const active = useSelector((s) => s.session.wagonActive);
  const batterName = useSelector((s) => s.session.wagonBatterName);
  const keepCase = useSelector((s) => s.session.wagonNameKeepCase);
  const showFours = useSelector((s) => s.session.wagonFours);
  const showSixes = useSelector((s) => s.session.wagonSixes);
  const hideCard = useSelector((s) => s.session.wagonHideCard); // white legend container
  const hideName = useSelector((s) => s.session.wagonHideName); // blue name container

  if (!active) return null;

  // Two INDEPENDENT containers:
  //   • blue NAME header  → shown unless hidden by its toggle (and a name exists)
  //   • white LEGEND card → shown unless hidden by its toggle; reflects the Fours/Sixes picks
  const name = (batterName || "").trim();
  const showName = !hideName && !!name;
  const legend = hideCard
    ? null
    : WAGON_LEGEND.filter(
        (l) => (l.key === "four" && showFours) || (l.key === "six" && showSixes),
      );
  // Nothing to show → render nothing.
  if (!showName && !legend) return null;
  return (
    <FiguresTicker
      name={name}
      hand={null}
      legend={legend}
      hideHeader={!showName}
      keepCase={keepCase}
    />
  );
}
