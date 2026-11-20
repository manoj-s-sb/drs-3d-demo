// TEMPORARY load diagnostics — remove when done.
// Logs 3D-asset loading to the browser console so you can see exactly what the
// loader is doing while the bar sits near ~98% (usually the big stadium .glb
// still downloading, or an asset that failed). Two logs:
//   [glb] …  <bytes>/<total> MB  <pct>%   — real per-file download progress
//   [load] <pct>% active=…                 — overall drei loader progress + errors
import { useEffect, useRef } from "react";
import { useProgress } from "@react-three/drei";

// Patch XHR once — three's GLTFLoader downloads .glb via XHR, so this gives the
// real byte-level progress of the stadium/ground models.
let patched = false;
function patchXHR() {
  if (patched || typeof XMLHttpRequest === "undefined") return;
  patched = true;
  const open = XMLHttpRequest.prototype.open;
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__url = url;
    return open.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    const url = this.__url || "";
    if (/\.glb(\?|$)/i.test(url)) {
      const name = url.split("/").pop().split("?")[0];
      const t0 = performance.now();
      const mb = (n) => (n / 1048576).toFixed(1);
      let last = 0;
      this.addEventListener("progress", (e) => {
        const step = e.total ? e.total * 0.05 : 1048576 * 5; // ~5% or 5MB
        if (e.loaded - last >= step || (e.total && e.loaded === e.total)) {
          last = e.loaded;
          const pct = e.total ? ((e.loaded / e.total) * 100).toFixed(1) : "?";
          const secs = ((performance.now() - t0) / 1000).toFixed(1);
          console.log(
            `[glb] ${name}  ${mb(e.loaded)}/${e.total ? mb(e.total) : "?"} MB  ${pct}%  +${secs}s`,
          );
        }
      });
      this.addEventListener("load", () => {
        console.log(
          `%c[glb] ✓ ${name} done in ${((performance.now() - t0) / 1000).toFixed(1)}s`,
          "color:#22C55E;font-weight:bold",
        );
      });
      this.addEventListener("error", () => {
        console.error(`%c[glb] ✗ ${name} FAILED`, "color:#F43F5E;font-weight:bold");
      });
    }
    return send.apply(this, args);
  };
}

export default function LoadDebug() {
  const { active, progress, item, errors } = useProgress();
  const t0 = useRef(performance.now());
  const done = useRef(false);
  patchXHR();

  useEffect(() => {
    console.log(`[load] ${progress.toFixed(1)}%  active=${active}  ${item || ""}`);
    if (!active && !done.current && progress >= 100) {
      done.current = true;
      console.log(
        `%c[load] ✅ all assets ready in ${((performance.now() - t0.current) / 1000).toFixed(1)}s`,
        "color:#22C55E;font-weight:bold",
      );
    }
  }, [progress, item, active]);

  useEffect(() => {
    if (errors && errors.length) {
      console.error(
        "%c[load] ❌ FAILED assets (this is what hangs the bar):",
        "color:#F43F5E;font-weight:bold",
        errors,
      );
    }
  }, [errors]);

  return null;
}
