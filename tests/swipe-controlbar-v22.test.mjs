// v22: Anywhere swipe must leave the embedded player's control bar tappable.
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

test("control-bar strip and centre Play are tap-through holes in Anywhere mode", () => {
  assert.match(appjs, /const controlTop = Math\.max\(holeBottom, V\.bottom - swipeControlBarHeight\(\)\);/);
  assert.match(appjs, /set\("\.swipe-zone-bottom", 0, holeBottom, W, Math\.max\(0, controlTop - holeBottom\)\);/);
  assert.match(appjs, /set\("\.swipe-zone-letter", 0, Math\.min\(H, V\.bottom\), W, Math\.max\(0, H - V\.bottom\)\);/);
  // Facebook iframe + native video get a real control-bar allowance.
  assert.match(appjs, /if \(state\.fbNativeVideo\) return 56;/);
  assert.match(appjs, /if \(p === "facebook"\) return 64;/);
});

test("zones re-layout when the video box changes size or metadata arrives", () => {
  assert.match(appjs, /if \(on\) layoutSwipeZones\(\);/);
  assert.match(appjs, /layoutSwipeZones\(\);\n      \}\n    \}\);/);
  assert.match(appjs, /setTimeout\(layoutSwipeZones, 80\);/);
  assert.match(html, /swipe-zone-letter/);
  assert.equal(css.split("{").length, css.split("}").length);
});

test("swipe navigation and centre tap-through contracts are unchanged", () => {
  assert.match(appjs, /Math\.abs\(dy\) > 45 && Math\.abs\(dy\) > Math\.abs\(dx\) \* 1\.4/);
  assert.match(appjs, /swipeStep\(dy < 0 \? 1 : -1\)/);
  assert.match(appjs, /prefs\.swipeNav === "anywhere" && !\$\("#playerModal"\)\.hidden/);
});
