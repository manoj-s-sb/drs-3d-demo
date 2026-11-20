import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import fs from "node:fs";
import path from "node:path";

// Serve nginx-style JSON directory listings for /data/** so the LOCAL sample is
// discovered dynamically (same code path + JSON shape the server's nginx
// autoindex returns). Without this, Vite would answer directory requests with
// the SPA index.html and the pickers couldn't list innings/overs/balls.
function dataDirListing() {
  const publicRoot = path.resolve("public");
  const handler = (req, res, next) => {
    try {
      const urlPath = decodeURIComponent((req.url || "").split("?")[0]);
      // Only intercept directory requests (trailing slash) under /data/ or the
      // separate /highlights/ base (used by the 6 Highlights view).
      const underData = urlPath.startsWith("/data/");
      const underHighlights = urlPath.startsWith("/highlights/");
      if ((!underData && !underHighlights) || !urlPath.endsWith("/"))
        return next();
      const dir = path.join(publicRoot, urlPath);
      if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return next();
      const entries = fs
        .readdirSync(dir, { withFileTypes: true })
        .map((e) => ({
          name: e.name,
          type: e.isDirectory() ? "directory" : "file",
        }));
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(entries));
    } catch {
      next();
    }
  };
  return {
    name: "data-dir-listing",
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), dataDirListing()],
  assetsInclude: ["**/*.glb", "**/*.gltf"],
});
