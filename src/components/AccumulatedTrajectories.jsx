import React, { useMemo } from "react";
import * as THREE from "three";
import { useSelector } from "react-redux";
import { buildTubeGeometry } from "./drs/trajectoryGeometry";
import { BALL_COLORS } from "./drs/ballColors";

const TUBE_RADIUS = 0.005;
const TUBE_OPACITY = 0.3; // match the multi-ball playback / DRS tube opacity

// One solid per-ball color across the whole trajectory (same scheme as the
// animated MultiBowlingTrajectory playback), so the static accumulated view agrees.
function TrajectoryTube({ positions, impactIndex, color, opacity = TUBE_OPACITY }) {
  // Convert plain objects back to THREE.Vector3
  const vector3Positions = useMemo(() => {
    if (!positions?.length) return [];
    return positions.map((p) => new THREE.Vector3(p.x, p.y, p.z));
  }, [positions]);

  const redGeometry = useMemo(() => {
    if (!vector3Positions?.length) return null;
    const redPts = vector3Positions.slice(0, impactIndex + 1);
    return buildTubeGeometry(redPts, TUBE_RADIUS);
  }, [vector3Positions, impactIndex]);

  const greenGeometry = useMemo(() => {
    if (!vector3Positions?.length || impactIndex >= vector3Positions.length - 1) return null;
    const greenPts = vector3Positions.slice(impactIndex);
    return buildTubeGeometry(greenPts, TUBE_RADIUS);
  }, [vector3Positions, impactIndex]);

  return (
    <group>
      {redGeometry && (
        <mesh geometry={redGeometry}>
          <meshStandardMaterial
            color={color}
            transparent
            opacity={opacity}
            roughness={1}
            metalness={0}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
      {greenGeometry && (
        <mesh geometry={greenGeometry}>
          <meshStandardMaterial
            color={color}
            transparent
            opacity={opacity}
            roughness={1}
            metalness={0}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
    </group>
  );
}

export default function AccumulatedTrajectories() {
  const accumulatedTrajectories = useSelector(
    (state) => state.session.accumulatedTrajectories
  );

  if (!accumulatedTrajectories?.length) return null;

  return (
    <group>
      {accumulatedTrajectories.map((trajectory, index) => (
        <TrajectoryTube
          key={index}
          positions={trajectory.positions}
          impactIndex={trajectory.impactIndex}
          color={BALL_COLORS[index % BALL_COLORS.length]}
        />
      ))}
    </group>
  );
}
