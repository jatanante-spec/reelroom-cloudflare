// v18: Anywhere swipe must keep the embed's centre Play button tappable.
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

test("Anywhere swipe layer is positioned zones around tap-through holes", () => {
  for (const cls of ["swipe-zone-top", "swipe-zone-left", "swipe-zone-right", "swipe-zone-bottom", "swipe-zone-letter"]) {
    assert.ok(html.includes(cls), "missing " + cls);
  }
  assert.match(css, /\.swipe-layer\s*{[^}]*pointer-events:\s*none/s);
  assert.match(css, /\.swipe-zone\s*{[^}]*pointer-events:\s*auto/s);
  assert.match(css, /--swipe-hole:\s*132px/);
  // v22: zones are absolutely positioned from the real video box so the
  // player's control bar stays tappable (no full-width bottom blanket).
  assert.match(css, /\.swipe-zone\s*{[^}]*position:\s*absolute/s);
  assert.match(appjs, /function layoutSwipeZones\(\)/);
  assert.match(appjs, /function swipeControlBarHeight\(\)/);
});

test("the layer still only appears in Anywhere mode and hides for panels", () => {
  assert.match(appjs, /prefs\.swipeNav === "anywhere" && !\$\("#playerModal"\)\.hidden/);
  assert.match(appjs, /!state\.moreOpen && !state\.backGuardOpen/);
  assert.match(appjs, /layer\.hidden = !on/);
});

test("swipe recognition still uses the shell listeners and vertical threshold", () => {
  assert.match(appjs, /shellEl\.addEventListener\("touchstart"/);
  assert.match(appjs, /shellEl\.addEventListener\("touchend"/);
  assert.match(appjs, /Math\.abs\(dy\) > 70 && Math\.abs\(dy\) > Math\.abs\(dx\) \* 1\.4/);
  assert.match(appjs, /swipeStep\(dy < 0 \? 1 : -1\)/);
});

test("v17 Smart Back / Undo / honest Continue remain intact", () => {
  assert.match(appjs, /backGuard: "smart"/);
  assert.match(appjs, /function showUndo\(item\)/);
  assert.match(appjs, /const label = canResume \? "Resume" : "Reopen";/);
  assert.equal(css.split("{").length, css.split("}").length);
});
