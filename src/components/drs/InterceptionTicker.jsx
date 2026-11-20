import { useSelector } from "react-redux";
import FiguresTicker from "./FiguresTicker";
import { OUTCOME_LEGEND } from "./ballColors";

// Interception lower-third — same style as the stump/wagon ticker: a centred blue NAME container
// with a white card below holding the outcome colour legend (the SAME ball colours plotted:
// dot · runs · four · six · wicket). Shown only while the interception map is active.
export default function InterceptionTicker() {
  const active = useSelector((s) => s.session.interceptActive);
  const hideTicker = useSelector((s) => s.session.hideTicker);
  const name = useSelector((s) => s.session.interceptName);
  const keepCase = useSelector((s) => s.session.interceptNameKeepCase);
  const ballCategories = useSelector((s) => s.session.ballCategories);

  if (hideTicker || !active) return null;

  // White card = outcome colour legend (only the categories the operator enabled).
  const legend = OUTCOME_LEGEND.filter((l) => ballCategories[l.key] !== false);
  const nm = (name || "").trim();
  if (!nm && !legend.length) return null;
  return (
    <FiguresTicker
      name={nm}
      hand={null}
      legend={legend}
      hideHeader={!nm}
      keepCase={keepCase}
    />
  );
}
