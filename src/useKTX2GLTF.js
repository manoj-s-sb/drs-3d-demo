import { useGLTF } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";

// useGLTF for models whose textures are KTX2-compressed (KHR_texture_basisu). Those
// need a KTX2Loader wired into the GLTFLoader, with the basis transcoder self-hosted
// at /basis/ (copied from three's libs) so it works fully offline like the rest of
// the app. detectSupport needs the live WebGL renderer, so this is a hook.
//
// IMPORTANT: do NOT call useGLTF.preload() for these models — preload runs at module
// load with the DEFAULT loader (no KTX2Loader, no renderer yet) and poisons the cache
// with a failed load. Let this hook be the only loader.
export function useKTX2GLTF(url) {
  const gl = useThree((s) => s.gl);
  return useGLTF(url, true, true, (loader) => {
    const ktx2 = new KTX2Loader().setTranscoderPath("/basis/").detectSupport(gl);
    loader.setKTX2Loader(ktx2);
  });
}
