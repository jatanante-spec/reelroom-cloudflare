// v13 player layout checks: big-by-default, More panel, TV side controls,
// and the old detailed view still reachable. Static checks against the shipped
// HTML/CSS/JS so a bad edit cannot silently remove the new wiring.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, "public", p), "utf8");
const html = read("index.html");
const appjs = read("app.js");
const css = read("styles.css");

test("opening a card enters the CSS big view immediately", () => {
  assert.match(appjs, /state\.playerView = "big";/);
  assert.match(appjs, /shell\.classList\.add\("pseudo-fs"\);/);
  // openPlayer must unhide the modal before rendering, and must not wait for F
  const open = appjs.slice(appjs.indexOf("function openPlayer"), appjs.indexOf("function facebookEmbeds"));
  assert.match(open, /\$\("#playerModal"\)\.hidden = false;/);
  assert.match(open, /classList\.add\("pseudo-fs"\)/);
  assert.match(open, /renderPlayer\(list\[idx\]\);/);
});

test("More panel exists and carries the occasional actions", () => {
  for (const id of [
    "fsMorePanel", "fsMoreBtn", "fsMoreCloseBtn", "fsMoreFavBtn", "fsMoreWatchedBtn",
    "fsMoreOriginalBtn", "fsMoreCopyBtn", "fsMoreBackupBtn", "fsMoreEditBtn",
    "fsMoreDetailsBtn", "fsMoreDeleteBtn", "fsAutoplayBtn", "fsAdvanceSelect",
  ]) {
    assert.ok(html.includes(`id="${id}"`), "missing #" + id);
  }
  assert.match(appjs, /function openFsMore/);
  assert.match(appjs, /function closeFsMore/);
  assert.match(appjs, /function syncFsMore/);
});

test("TV mode moves the primary controls into the side space", () => {
  assert.match(css, /body\.tv-mode \.player-shell\.pseudo-fs #fsPrevBtn/);
  assert.match(css, /body\.tv-mode \.player-shell\.pseudo-fs #fsNextBtn/);
  assert.match(css, /body\.tv-mode \.player-shell\.pseudo-fs #fsMoreBtn/);
  assert.match(css, /body\.tv-mode \.player-shell\.pseudo-fs \.fs-more\.open/);
  // TV controls should not auto-hide while the remote is the primary input
  assert.match(appjs, /inFullscreen\(\) && !tvEnabled\(\) && !state\.moreOpen/);
});

test("the old detailed view is still reachable on T", () => {
  assert.match(appjs, /function enterDetailsView/);
  assert.match(appjs, /function toggleDetailsView/);
  assert.match(appjs, /e\.key === "t" \|\| e\.key === "T"[^}]*toggleDetailsView/);
  assert.match(html, /id="theatreBtn"[^>]*title="Details view \(T\)"/);
});

test("Escape closes to the grid; Backspace is handled by the v16 back guard", () => {
  const esc = appjs.slice(appjs.indexOf('if (e.key === "Escape")'), appjs.indexOf('if (typing) return;'));
  assert.match(esc, /else if \(!\$\("#playerModal"\)\.hidden\) closePlayer\(\);/);
  assert.doesNotMatch(esc, /if \(inFullscreen\(\)\) \{ exitFullscreen\(\); return; \}/);
  // v16: Backspace no longer hard-closes; it asks/double-checks according to prefs.
  assert.match(appjs, /if \(e\.key === "Backspace"\) \{ e\.preventDefault\(\); handlePlayerBack\(false\); \}/);
});

test("remote focus navigation and More shortcut are wired", () => {
  assert.match(appjs, /function moveFsFocus/);
  assert.match(appjs, /e\.key === "m" \|\| e\.key === "M"/);
  assert.match(appjs, /ArrowUp/);
  assert.match(appjs, /ArrowDown/);
});

test("v10 crop and v7 Facebook sizing engines are untouched", () => {
  assert.match(appjs, /IG_GEOM/);
  assert.match(appjs, /IG_RENDER_W/);
  assert.match(appjs, /function fitFacebook/);
  assert.match(appjs, /measureAspect/);
  assert.match(css, /\.ig-window\.cropping/);
});

test("no service worker crept in with the player update", () => {
  assert.ok(!/serviceWorker\.register/.test(appjs));
  assert.ok(!/caches\.open/.test(appjs));
});

test("css braces stay balanced after the v13 section", () => {
  assert.equal(css.split("{").length, css.split("}").length);
});
