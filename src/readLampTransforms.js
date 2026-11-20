import * as THREE from "three";

// Read the WORLD transform + light definition of every light node straight from a GLB
// file's JSON. We parse the glb ourselves (not via GLTFLoader) because three.js CACHES
// a reused light and SHARES the single instance across all the nodes that reference it,
// so only one lamp survives the normal load. Here we get every lamp's real position,
// baked aim direction, and the file's own light params (intensity/cone/colour).
//
// Returns: Promise<Array<{ pos: Vector3, fwd: Vector3, def: object }>>
export async function readLampTransforms(url) {
  const buf = await (await fetch(url)).arrayBuffer();
  const dv = new DataView(buf);
  // GLB: 12-byte header, then the first chunk is JSON (4-byte len + 4-byte type + data).
  const jsonLen = dv.getUint32(12, true);
  const j = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen)));
  const nodes = j.nodes || [];
  const lightDefs =
    (j.extensions &&
      j.extensions.KHR_lights_punctual &&
      j.extensions.KHR_lights_punctual.lights) ||
    [];

  const parent = {};
  nodes.forEach((n, i) => (n.children || []).forEach((c) => (parent[c] = i)));

  const localM = (n) =>
    new THREE.Matrix4().compose(
      new THREE.Vector3(...(n.translation || [0, 0, 0])),
      new THREE.Quaternion(...(n.rotation || [0, 0, 0, 1])),
      new THREE.Vector3(...(n.scale || [1, 1, 1])),
    );
  const worldM = (i) => {
    let m = localM(nodes[i]);
    let p = parent[i];
    while (p !== undefined) {
      m = localM(nodes[p]).multiply(m);
      p = parent[p];
    }
    return m;
  };

  const out = [];
  nodes.forEach((n, i) => {
    if (!n.extensions || !n.extensions.KHR_lights_punctual) return;
    const m = worldM(i);
    out.push({
      pos: new THREE.Vector3().setFromMatrixPosition(m),
      fwd: new THREE.Vector3(0, 0, -1).transformDirection(m),
      def: lightDefs[n.extensions.KHR_lights_punctual.light] || {},
    });
  });
  return out;
}
