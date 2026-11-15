// v17 Smart Back + swipe navigation + honest Continue watching checks.
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

test("Smart Back only asks where resume is useful, otherwise exits with Undo", () => {
  assert.match(appjs, /function canResumePlatform\(platform\)/);
  assert.match(appjs, /const usefulResume = canResumePlatform\(platform\) && pos > 5/);
  assert.match(appjs, /mode === "smart" && !usefulResume/);
  assert.match(appjs, /closePlayer\(\{ fromPopstate: !!fromPopstate, undo: true \}\)/);
  assert.match(appjs, /function showUndo\(item\)/);
  assert.match(appjs, /function hideUndo\(\)/);
  assert.ok(html.includes('id="undoBar"'));
  assert.ok(html.includes('id="undoBtn"'));
});

test("the old v16 ask default migrates to Smart once", () => {
  assert.match(appjs, /prefs\.backGuard === "ask" && prefs\.smartBackMigrated !== 17/);
  assert.match(appjs, /prefs\.backGuard = "smart"; prefs\.smartBackMigrated = 17;/);
});

test("swipe navigation has edges/anywhere/off modes and a gesture layer", () => {
  assert.match(appjs, /swipeNav: "edges"/);
  assert.match(appjs, /function applySwipeNav\(value\)/);
  assert.match(appjs, /\["edges", "anywhere", "off"\]\.includes\(value\)/);
  assert.match(appjs, /function swipeStep\(dir\)/);
  assert.match(appjs, /function updateSwipeLayer\(\)/);
  assert.match(appjs, /shellEl\.addEventListener\("touchstart"/);
  assert.match(appjs, /shellEl\.addEventListener\("touchend"/);
  assert.ok(html.includes('id="swipeLayer"'));
  assert.ok(html.includes('id="swipeHint"'));
  assert.ok(html.includes('id="fsSwipeNavSelect"'));
  assert.match(css, /\.swipe-layer/);
  assert.match(css, /\.swipe-hint\.show/);
});

test("Reels mode limits swipes to short/vertical videos", () => {
  assert.match(appjs, /reelsMode: false/);
  assert.match(appjs, /function isVerticalItem\(item\)/);
  assert.match(appjs, /function toggleReelsMode\(\)/);
  assert.match(appjs, /if \(prefs\.reelsMode\)/);
  assert.ok(html.includes('id="fsReelsModeBtn"'));
});

test("Continue watching is honest: Resume for YouTube/TikTok, Reopen otherwise", () => {
  assert.match(appjs, /const canResume = canResumePlatform\(item\.platform\) && Number\(item\.watch_seconds\) > 5;/);
  assert.match(appjs, /const label = canResume \? "Resume" : "Reopen";/);
  assert.match(appjs, /Last watched · exact resume not supported/);
  assert.match(appjs, /canResumePlatform\(item\.platform\) \? "Resume" : "Reopen"/);
  assert.match(css, /\.continue-label\.resume/);
  assert.match(css, /\.continue-label\.reopen/);
});

test("More panel exposes Smart Back, swipe mode and Reels mode", () => {
  assert.match(html, /<option value="smart">Smart<\/option>/);
  assert.match(html, /id="fsSwipeNavSelect"[\s\S]*?<option value="edges">/);
  assert.match(appjs, /fsSwipeNavSelect\.addEventListener\("change"/);
  assert.match(appjs, /fsReelsModeBtn\.addEventListener\("click"/);
});

test("earlier player/sound/sidebar engines remain intact", () => {
  assert.match(appjs, /IG_GEOM/);
  assert.match(appjs, /function requestSound/);
  assert.match(appjs, /function setSidebar\(open\)/);
  assert.match(appjs, /function resumePosition\(item, platform\)/);
  assert.equal(css.split("{").length, css.split("}").length);
});
