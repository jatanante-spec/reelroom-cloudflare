// v12 installable-app checks: manifest validity, real icon pixels, HTML wiring,
// and the deliberate absence of a service worker.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = (p) => join(root, "public", p);
const read = (p) => readFileSync(pub(p), "utf8");

const manifest = JSON.parse(read("manifest.webmanifest"));
const html = read("index.html");
const appjs = read("app.js");
const css = read("styles.css");

// Read a PNG's IHDR width/height straight from the bytes — no image library.
function pngSize(path) {
  const b = readFileSync(path);
  assert.equal(b.subarray(1, 4).toString(), "PNG", "not a PNG: " + path);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

test("manifest has every field Chrome checks for installability", () => {
  assert.ok(manifest.name || manifest.short_name, "name");
  assert.equal(manifest.short_name, "ReelRoom");
  assert.ok(manifest.start_url, "start_url");
  assert.equal(manifest.display, "standalone", "standalone is what removes the browser UI");
  assert.ok(manifest.scope, "scope");
  assert.ok(manifest.background_color, "background_color");
  assert.ok(manifest.theme_color, "theme_color");
  // true would make Chrome prefer a store app and block the install prompt
  assert.notEqual(manifest.prefer_related_applications, true);
});

test("manifest declares both required icon sizes, plus a maskable one", () => {
  const sizes = manifest.icons.map((i) => i.sizes);
  assert.ok(sizes.includes("192x192"), "192x192 present");
  assert.ok(sizes.includes("512x512"), "512x512 present");
  assert.ok(manifest.icons.some((i) => i.purpose === "maskable"), "maskable present");
  assert.ok(manifest.icons.some((i) => i.purpose === "any"), "any present");
  for (const icon of manifest.icons) assert.equal(icon.type, "image/png");
});

test("every declared icon exists and really is the stated pixel size", () => {
  for (const icon of manifest.icons) {
    const path = pub(icon.src);
    assert.ok(existsSync(path), "missing icon file: " + icon.src);
    const { w, h } = pngSize(path);
    const [wantW, wantH] = icon.sizes.split("x").map(Number);
    assert.equal(w, wantW, `${icon.src} width`);
    assert.equal(h, wantH, `${icon.src} height`);
  }
});

test("apple touch icon exists at 180x180", () => {
  const { w, h } = pngSize(pub("icons/apple-touch-icon.png"));
  assert.equal(w, 180);
  assert.equal(h, 180);
});

test("start_url and shortcut urls stay inside scope", () => {
  assert.ok(manifest.start_url.startsWith("/"));
  for (const sc of manifest.shortcuts || []) {
    assert.ok(sc.url.startsWith("/"), "shortcut must be same-origin: " + sc.url);
    assert.ok(sc.name);
  }
});

test("HTML links the manifest and the icons", () => {
  assert.match(html, /<link[^>]+rel="manifest"[^>]+href="manifest\.webmanifest"/);
  assert.match(html, /<link[^>]+rel="apple-touch-icon"[^>]+href="icons\/apple-touch-icon\.png"/);
  assert.match(html, /<meta[^>]+name="theme-color"[^>]+content="#0f0f0f"/);
  assert.match(html, /name="apple-mobile-web-app-capable"[^>]+content="yes"/);
  assert.match(html, /name="apple-mobile-web-app-title"[^>]+content="ReelRoom"/);
  assert.match(html, /viewport-fit=cover/);
});

test("HTML uses no Apple-only private-use glyphs that render as boxes elsewhere", () => {
  const bad = [...html].filter((c) => {
    const n = c.codePointAt(0);
    return n >= 0xe000 && n <= 0xf8ff;
  });
  assert.equal(bad.length, 0);
});

test("install menu entry and help modal are wired up", () => {
  assert.match(html, /data-action="install"[^>]*id="installAppBtn"[^>]*hidden/);
  for (const id of ["installModal", "installIos", "installAndroid", "installOther"]) {
    assert.ok(html.includes(`id="${id}"`), "missing #" + id);
  }
  assert.match(appjs, /if \(act === "install"\) doInstall\(\);/);
  assert.match(appjs, /\$\$\("\[data-close\]"\)/, "generic close handler covers the new modal");
});

test("install logic listens for the Chromium install events", () => {
  assert.match(appjs, /addEventListener\("beforeinstallprompt"/);
  assert.match(appjs, /addEventListener\("appinstalled"/);
  assert.match(appjs, /e\.preventDefault\(\)/, "must preventDefault to control the prompt");
  assert.match(appjs, /evt\.prompt\(\)/);
  assert.match(appjs, /userChoice/);
});

test("standalone detection covers Android and iOS signals", () => {
  assert.match(appjs, /display-mode: standalone/);
  assert.match(appjs, /navigator\.standalone/);
  assert.match(appjs, /maxTouchPoints/, "iPadOS masquerading as Macintosh");
  assert.match(appjs, /classList\.toggle\("standalone", standalone\)/);
});

test("no service worker in this release — updates must never get stuck", () => {
  assert.ok(!/serviceWorker\.register/.test(appjs), "app.js must not register a worker");
  assert.ok(!existsSync(pub("sw.js")), "no sw.js shipped");
  assert.ok(!/caches\.open/.test(appjs));
});

test("safe-area padding is scoped to standalone so browser layout is unchanged", () => {
  assert.match(css, /body\.standalone \.topbar/);
  assert.match(css, /env\(safe-area-inset-top/);
  assert.match(css, /env\(safe-area-inset-bottom/);
  // the fullscreen exit button must dodge the notch too
  assert.match(css, /\.player-shell:fullscreen \.fs-exit[\s\S]*?env\(safe-area-inset-top/);
});

test("css braces stay balanced", () => {
  assert.equal(css.split("{").length, css.split("}").length);
});

test("_headers forces the correct manifest MIME type", () => {
  const headers = read("_headers");
  assert.match(headers, /\/manifest\.webmanifest/);
  assert.match(headers, /Content-Type: application\/manifest\+json/);
});

test("_routes.json still keeps static assets off the API quota", () => {
  const routes = JSON.parse(read("_routes.json"));
  assert.deepEqual(routes.include, ["/api/*"]);
});

test("version badge reports v12", () => {
  assert.match(appjs, /const REELROOM_VERSION = "v12";/);
});

test("v10 fullscreen chrome is still present (no regression)", () => {
  for (const id of ["fsExitBtn", "fsBar", "fsFullPostBtn", "cropAdjust"]) {
    assert.ok(html.includes(`id="${id}"`), "lost v10 control #" + id);
  }
  assert.match(appjs, /IG_GEOM/, "Instagram crop engine intact");
});

test("Fire TV is excluded from the Android install steps", () => {
  // Silk reports as Android but cannot install web apps.
  assert.match(appjs, /tv = looksLikeTV\(\)/);
  assert.match(appjs, /\/Android\/i\.test\(navigator\.userAgent \|\| ""\) && !tv/);
  assert.match(html, /Fire TV \/ Silk does not offer app installation/);
});
