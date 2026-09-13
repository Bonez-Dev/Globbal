/**
 * Copies three.module.js into vendor/ for static hosting (Google Drive / CDN deploy).
 * Run after npm install: npm run vendor:three
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "node_modules", "three", "build", "three.module.js");
const DEST_DIR = path.join(ROOT, "vendor", "three", "build");
const DEST = path.join(DEST_DIR, "three.module.js");

if (!fs.existsSync(SRC)) {
  process.stderr.write("Missing node_modules/three — run npm install first.\n");
  process.exit(1);
}

const stat = fs.statSync(SRC);
if (!stat.size) {
  process.stderr.write("three.module.js is empty — run npm install again.\n");
  process.exit(1);
}

fs.mkdirSync(DEST_DIR, { recursive: true });
fs.copyFileSync(SRC, DEST);
process.stdout.write(`Vendored three.module.js (${stat.size} bytes) → vendor/three/build/\n`);
