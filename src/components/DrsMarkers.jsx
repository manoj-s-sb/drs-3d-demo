import { useSelector } from "react-redux";
import GlbBall from "./GlbBall";
import { getConfig } from "../drs/drsConfig";

// The bounce / impact marker is the realistic leather cricket ball (same model as
// the moving ball) placed at the point, so the top-down "where it pitched" view
// shows an actual ball rather than a plain dot.
function Marker({ position }) {
  if (!position) return null;
  return (
    <GlbBall
      position={[position.x, position.y, position.z]}
      radius={getConfig("MARKER_SCALE")}
    />
  );
}

export default function DrsMarkers() {
  const { active, phase, markers, markerPositions, reviewPlan, noBall } =
    useSelector((s) => s.drs);
  if (!active) return null;
  // Never during asset loading. Otherwise the pitch/impact markers are COMMON to
  // every ball — they show on the video (AR) as the ball crosses those frames,
  // and stay into the 3D. The rule only controls WHICH markers via pitchMarker /
  // impactMarker below.
  if (phase === "loading" || phase === "operatorInput") return null;
  // Rule-driven marker gate (LBW review only). Default true (show) when there's
  // no plan or it's a no-ball check. A full toss hides the pitch marker.
  const applyPlan = reviewPlan && !noBall;
  const showPitch = !applyPlan || reviewPlan.pitchMarker !== false;
  const showImpact = !applyPlan || reviewPlan.impactMarker !== false;
  return (
    <group>
      {showPitch && markers.pitching && <Marker position={markerPositions.pitching} />}
      {showImpact && markers.impact && <Marker position={markerPositions.impact} />}
    </group>
  );
}
