import { useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { pitchMapFromAccumulated } from "./showCommands";

// Automatic + Combine auto-advance. When a bowling-analysis over finishes AND the
// operator chose Automatic + "Bowling + Pitch mapping", this morphs the view STRAIGHT to
// the pitch map on its own — NO intermediate "tubes off / ball resting on the stumps" step.
// The short hold lets the completion brighten + zoom land first, then the camera glides
// smoothly into the pitch-map view. Mounted in BOTH the operator app AND the broadcast
// (big screen) so they behave identically — flags carried onto each store by loadOver.
export default function MultiAutoAdvance() {
  const dispatch = useDispatch();
  const autoPlayOn = useSelector((s) => s.session.multiAutoPlay);
  const combineOn = useSelector((s) => s.session.multiCombinePitchMap);
  const complete = useSelector((s) => s.session.multiTrajectoryComplete);
  const pmActive = useSelector((s) => s.session.pitchMapActive);

  useEffect(() => {
    if (!autoPlayOn || !combineOn || !complete || pmActive) return;
    const t = setTimeout(() => pitchMapFromAccumulated(dispatch), 1600);
    return () => clearTimeout(t);
  }, [autoPlayOn, combineOn, complete, pmActive, dispatch]);

  return null;
}
