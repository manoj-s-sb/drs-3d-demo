// Build-time directory manifest generator.
//
// WHY: in "local" mode the app discovers innings/overs/balls by requesting a
// directory URL (e.g. /data/in-1/) and parsing a listing. The Vite dev/preview
// server fakes those listings via the dataDirListing() plugin (vite.config.js),
// but that middleware does NOT exist in a static production build. On static
// hosts (Vercel, nginx without autoindex, S3, …) a directory request returns
// the SPA index.html, so the pickers list nothing and no ball can be selected.
//
// FIX: walk public/data and public/highlights and drop an `index.json` into
// every folder carrying the SAME [{name,type}] shape the nginx/dev autoindex
// returns. listDir() in src/dataSource.js falls back to this file when a live
// listing isn't available, so local, nginx and static hosting share one path.
//
// Wired into `npm run build` (see package.json) so the manifest is always fresh.
import fs from "node:fs";
import path from "node:path";

const publicRoot = path.resolve("public");
const ROOTS = ["data", "highlights"];
const MANIFEST = "index.json";

let dirsWritten = 0;

// Write <dir>/index.json listing the directory's immediate children (the
// manifest file itself is excluded). Recurses into subdirectories.
function walk(absDir) {
  const entries = fs.readdirSync(absDir, { withFileTypes: true });
  const listing = entries
    .filter((e) => e.name !== MANIFEST)
    .map((e) => ({ name: e.name, type: e.isDirectory() ? "directory" : "file" }));

  fs.writeFileSync(path.join(absDir, MANIFEST), JSON.stringify(listing));
  dirsWritten++;

  for (const e of entries) {
    if (e.isDirectory()) walk(path.join(absDir, e.name));
  }
}

for (const root of ROOTS) {
  const abs = path.join(publicRoot, root);
  if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
    walk(abs);
  } else {
    console.warn(`[gen-data-manifest] skip missing public/${root}`);
  }
}

console.log(`[gen-data-manifest] wrote ${dirsWritten} ${MANIFEST} file(s)`);
