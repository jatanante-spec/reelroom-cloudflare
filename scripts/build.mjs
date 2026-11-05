// Build step for Cloudflare Pages: the frontend is already static in /public.
// This script validates that everything required is present.
import { existsSync } from "node:fs";
import { join } from "node:path";

const required = [
  "public/index.html",
  "public/styles.css",
  "public/app.js",
  "public/_routes.json",
  "public/manifest.webmanifest",
  "public/icon-192.png",
  "public/icon-512.png",
  "public/icon-maskable-512.png",
  "public/apple-touch-icon.png",
  "functions/api/[[path]].mjs",
  "lib/api-core.mjs",
  "lib/store.mjs",
  "lib/auth.mjs",
  "lib/parse.mjs",
  "lib/metadata.mjs",
];
const missing = required.filter((f) => !existsSync(join(process.cwd(), f)));
if (missing.length) {
  console.error("Missing required files:", missing.join(", "));
  process.exit(1);
}
console.log("ReelRoom build OK — static site in /public, API in /functions/api.");
