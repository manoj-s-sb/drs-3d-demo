import * as THREE from "three";

const NPY_MAGIC = [0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59];

export function parseNpyF64(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  for (let i = 0; i < 6; i++) {
    if (bytes[i] !== NPY_MAGIC[i]) {
      throw new Error("calibration: not a .npy file");
    }
  }
  const major = bytes[6];
  let headerLen;
  let dataOffset;
  if (major === 1) {
    headerLen = bytes[8] | (bytes[9] << 8);
    dataOffset = 10 + headerLen;
  } else {
    headerLen =
      bytes[8] |
      (bytes[9] << 8) |
      (bytes[10] << 16) |
      (bytes[11] << 24);
    dataOffset = 12 + headerLen;
  }
  const headerText = new TextDecoder("latin1").decode(
    bytes.slice(10, 10 + headerLen),
  );
  const shapeMatch = headerText.match(/'shape'\s*:\s*\(([^)]*)\)/);
  const descrMatch = headerText.match(/'descr'\s*:\s*'([^']+)'/);
  if (!shapeMatch || !descrMatch) {
    throw new Error("calibration: invalid .npy header");
  }
  const descr = descrMatch[1];
  if (descr !== "<f8" && descr !== "|f8" && descr !== "=f8") {
    throw new Error(`calibration: unsupported .npy dtype ${descr}`);
  }
  if (/'fortran_order'\s*:\s*True/i.test(headerText)) {
    throw new Error("calibration: fortran_order=True not supported");
  }
  const shape = shapeMatch[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number);
  const count = shape.reduce((a, b) => a * b, 1);
  const data = new Float64Array(
    arrayBuffer.slice(dataOffset, dataOffset + count * 8),
  );
  return { data, shape };
}

export function parseProjectionMatrix(arrayBuffer) {
  const { data, shape } = parseNpyF64(arrayBuffer);
  if (shape.length !== 2 || shape[0] !== 3 || shape[1] !== 4) {
    throw new Error(
      `calibration: P must be 3x4, got ${JSON.stringify(shape)}`,
    );
  }
  const P = [[], [], []];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 4; j++) {
      P[i][j] = data[i * 4 + j];
    }
  }
  return P;
}

function inv3x3(m) {
  const [a, b, c] = m[0];
  const [d, e, f] = m[1];
  const [g, h, i] = m[2];
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-12) throw new Error("calibration: K not invertible");
  const inv = 1 / det;
  return [
    [(e * i - f * h) * inv, (c * h - b * i) * inv, (b * f - c * e) * inv],
    [(f * g - d * i) * inv, (a * i - c * g) * inv, (c * d - a * f) * inv],
    [(d * h - e * g) * inv, (b * g - a * h) * inv, (a * e - b * d) * inv],
  ];
}

function det3x3(m) {
  const [a, b, c] = m[0];
  const [d, e, f] = m[1];
  const [g, h, i] = m[2];
  return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
}

export function decomposeProjection(P, K) {
  const Kinv = inv3x3(K);
  const Rt = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 4; j++) {
      for (let k = 0; k < 3; k++) {
        Rt[i][j] += Kinv[i][k] * P[k][j];
      }
    }
  }
  const R = [Rt[0].slice(0, 3), Rt[1].slice(0, 3), Rt[2].slice(0, 3)];
  const t = [Rt[0][3], Rt[1][3], Rt[2][3]];
  const d = det3x3(R);
  if (Math.abs(d - 1) > 0.05) {
    console.warn(
      `[calibration] det(R)=${d.toFixed(4)} (expected ~1). Calibration convention may differ.`,
    );
  }
  // C = -R^T t
  const C = [
    -(R[0][0] * t[0] + R[1][0] * t[1] + R[2][0] * t[2]),
    -(R[0][1] * t[0] + R[1][1] * t[1] + R[2][1] * t[2]),
    -(R[0][2] * t[0] + R[1][2] * t[1] + R[2][2] * t[2]),
  ];
  return { R, t, C };
}

export function fovYFromK(K, imageHeight) {
  const fy = K[1][1];
  return (2 * Math.atan(imageHeight / (2 * fy)) * 180) / Math.PI;
}

// P_left_1.npy decomposes with det(R)=1.0 and R[1,1]=+0.98, i.e. the camera
// frame is Y-up with -Z forward (OpenGL/Three.js style). The calibration's
// world frame has Z pointing opposite to the Three.js scene's Z, so the
// camera position and basis vectors get their Z components negated below.
// If a future calibration uses OpenCV (Y-down, +Z forward) or a different
// world convention, the signs of `up`, `forward`, and the Z flip will need
// to be revisited.
const FLIP_WORLD_Z = true;

// Compose two calib→video similarities (v = s·R(angle)·c + d): `first` is the
// one-time calib offset (calib → frame 0), `then` a per-frame camera-shake
// transform (frame 0 → frame f). Returns the single calib → frame f transform.
export function composeTransforms(first, then) {
  if (!then) return first;
  if (!first) return then;
  const s1 = first.scale ?? 1;
  const s2 = then.scale ?? 1;
  const a2 = ((then.angle ?? 0) * Math.PI) / 180;
  const c2 = Math.cos(a2);
  const n2 = Math.sin(a2);
  const dx1 = first.dx ?? 0;
  const dy1 = first.dy ?? 0;
  return {
    dx: s2 * (c2 * dx1 - n2 * dy1) + (then.dx ?? 0),
    dy: s2 * (n2 * dx1 + c2 * dy1) + (then.dy ?? 0),
    angle: (first.angle ?? 0) + (then.angle ?? 0),
    scale: s1 * s2,
  };
}

// `transform` is the per-camera 2D alignment ({ dx, dy, angle, scale }) — it is
// NOT left-specific; the caller passes left_transform or right_transform
// depending on which feed is selected.
export function buildVirtualCamera(C, R, K, imageSize, transform) {
  const imgH = imageSize[1];
  const camX = new THREE.Vector3(R[0][0], R[0][1], R[0][2]);
  const camY = new THREE.Vector3(R[1][0], R[1][1], R[1][2]);
  const camZ = new THREE.Vector3(R[2][0], R[2][1], R[2][2]);
  let forward = camZ.clone().negate();
  let up = camY.clone();
  let right = camX.clone();

  if (FLIP_WORLD_Z) {
    forward.z = -forward.z;
    up.z = -up.z;
    right.z = -right.z;
  }

  const fx = K[0][0];
  const fy = K[1][1];
  let fovY = fovYFromK(K, imgH);

  if (transform) {
    const { dx = 0, dy = 0, angle = 0, scale = 1 } = transform;
    // Convention (post-Z-flip world): forward ≈ -Z, up ≈ +Y, right ≈ -X
    // (because camX = R[0,:] ≈ (-1, 0, 0) in this calibration).
    // With `up × forward = right ≈ -X` and `right × forward ≈ -Y`:
    //   dx < 0 = camera panned left (forward→+X) → yaw = atan(dx/fx) (negative yaw).
    //   dy < 0 = camera tilted down (forward→-Y) → pitch = atan(-dy/fy) (positive pitch).
    //   angle > 0 = counter-clockwise roll seen from behind (OpenCV convention:
    //   cv2.getRotationMatrix2D documents positive angle as CCW) → roll = -angle_rad
    //   around forward.
    //
    // The triangulator (Triangulator.apply_transform_inverse) treats the
    // transform as calib → video: v = R(angle)·c + d, rotating about pixel
    // (0,0). A camera roll rotates the image about the principal point p
    // instead, and the roll below is applied about the already yawed/pitched
    // forward axis, so the shift is rotated too: v = p + R·(c − p + d').
    // Solving for the pre-roll shift: d' = R(−angle)·(d − p) + p.
    const a = (angle * Math.PI) / 180;
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);
    const px = K[0][2];
    const py = K[1][2];
    const dxP = cosA * (dx - px) + sinA * (dy - py) + px;
    const dyP = -sinA * (dx - px) + cosA * (dy - py) + py;
    const yaw = Math.atan(dxP / fx);
    const pitch = Math.atan(-dyP / fy);
    const roll = -a;

    const qYaw = new THREE.Quaternion().setFromAxisAngle(up, yaw);
    right.applyQuaternion(qYaw);
    forward.applyQuaternion(qYaw);

    const qPitch = new THREE.Quaternion().setFromAxisAngle(right, pitch);
    up.applyQuaternion(qPitch);
    forward.applyQuaternion(qPitch);

    const qRoll = new THREE.Quaternion().setFromAxisAngle(forward, roll);
    up.applyQuaternion(qRoll);
    right.applyQuaternion(qRoll);

    if (scale > 1e-6) fovY = fovY / scale;
  }

  forward.normalize();
  up.normalize();

  const positionZ = FLIP_WORLD_Z ? -C[2] : C[2];

  return {
    position: { x: C[0], y: C[1], z: positionZ },
    forward: { x: forward.x, y: forward.y, z: forward.z },
    up: { x: up.x, y: up.y, z: up.z },
    fovY,
    aspect: imageSize[0] / imageSize[1],
  };
}
