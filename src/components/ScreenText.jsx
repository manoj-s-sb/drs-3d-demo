import React, { useEffect, useRef, useState, useMemo } from "react";
import * as THREE from "three";
import { Text } from "@react-three/drei";
import { useSelector } from "react-redux";

const ScreenText = ({
  parentScene,
  offset = 1,
  lineSpacing = 0.5,
  curvature = 0,
  rotation = { x: 0, y: 0, z: 0 },
  positionOffset = { x: 0, y: 0, z: 0 },
  rotationOffset = { x: 0, y: 0, z: 0 },
  defaultLetterSpacing = 0.005,
}) => {
  const groupRef = useRef();
  const [screenObject, setScreenObject] = useState(null);
  const lines = useSelector((state) => state.screenText.lines);

  useEffect(() => {
    if (parentScene) {
      const found = parentScene.getObjectByName("screen2");
      if (found) setScreenObject(found);
      else console.warn("ScreenText: 'screen2' not found in parentScene.");
    }
  }, [parentScene]);

  useEffect(() => {
    if (!screenObject || !groupRef.current) return;

    const worldPos = new THREE.Vector3();
    const worldQuat = new THREE.Quaternion();

    screenObject.getWorldPosition(worldPos);
    screenObject.getWorldQuaternion(worldQuat);

    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(worldQuat);
    worldPos.addScaledVector(forward, offset);

    groupRef.current.position.copy(worldPos);
    groupRef.current.quaternion.copy(worldQuat);

    const baseQuat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(rotation.x, rotation.y, rotation.z),
    );
    groupRef.current.quaternion.multiply(baseQuat);

    const posOffsetVec = new THREE.Vector3(
      positionOffset.x,
      positionOffset.y,
      positionOffset.z,
    );
    groupRef.current.position.add(posOffsetVec);

    const rotOffsetQuat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(rotationOffset.x, rotationOffset.y, rotationOffset.z),
    );
    groupRef.current.quaternion.multiply(rotOffsetQuat);
  }, [screenObject, offset, rotation, positionOffset, rotationOffset]);

  const rendered = useMemo(() => {
    const all = [];
    const lineHeights = lines.map((l) => l.fontSize || 1);
    const totalHeight =
      lineHeights.reduce((s, h) => s + h, 0) +
      Math.max(0, lines.length - 1) * lineSpacing;
    let accum = 0;
    const startY = totalHeight / 2;

    lines.forEach((line, li) => {
      const text = (line.text || "").toString();
      const fontSize = line.fontSize || 1;
      const color = line.color || "#ffffff";
      const font = line.font || undefined;
      const y = -(startY - (accum + fontSize / 2));
      accum += fontSize + lineSpacing;

      all.push(
        <Text
          key={`line${li}`}
          fontSize={fontSize}
          color={color}
          anchorX="center"
          anchorY="middle"
          position={[0, y, 0]}
          letterSpacing={line.letterSpacing ?? defaultLetterSpacing}
          font={font}
        >
          {text}
        </Text>,
      );
    });

    return all;
  }, [lines, curvature, lineSpacing, defaultLetterSpacing]);

  if (!screenObject) return null;

  return <group ref={groupRef}>{rendered}</group>;
};

export default ScreenText;
