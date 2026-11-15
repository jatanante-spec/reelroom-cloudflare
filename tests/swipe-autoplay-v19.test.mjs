// v19: swipe/Next/Prev should start the next embed automatically where possible.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, "public", p), "utf8");
const appjs = read("app.js");
const html = read("index.html");
const css = read("styles.css");

test("navigation marks an autoplay boost window", () => {
  assert.match(appjs, /navAutoplayAt: 0/);
  assert.match(appjs, /state\.navAutoplayAt = Date\.now\(\);/);
  assert.match(appjs, /const navBoost = Date\.now\(\) - \(state\.navAutoplayAt \|\| 0\) < 2500;/);
});

test("embed URLs ask for autoplay and mobile inline playback", () => {
  assert.match(appjs, /u\.searchParams\.set\("autoplay", "1"\);/);
  assert.match(appjs, /u\.searchParams\.set\("playsinline", "1"\);/);
  assert.match(appjs, /u\.searchParams\.set\("autoplay", "true"\);/);
  assert.match(appjs, /allow="[^"]*autoplay \*[^"]*"/);
});

test("navigation forces a reliable muted start even when sound is remembered on", () => {
  assert.match(appjs, /function applySoundParams\(platform, url, forceMuted\)/);
  assert.match(appjs, /const muted = !!forceMuted \|\| shouldStartMuted\(platform\);/);
  assert.match(appjs, /return applySoundParams\(platform, u\.href, navBoost\);/);
});

test("YouTube and TikTok receive best-effort play commands after navigation", () => {
  assert.match(appjs, /ytCommand\("playVideo"\);/);
  assert.match(appjs, /tiktokCommand\("play"\);/);
  assert.match(appjs, /if \(data\.event === "onReady"\)/);
  assert.match(appjs, /if \(d\.type === "onPlayerReady"\)/);
});

test("sound restore and earlier swipe/Back engines remain intact", () => {
  assert.match(appjs, /function sendUnmute\(platform\)/);
  assert.match(appjs, /setTimeout\(\(\) => \{ if \(sound\.seq === seq && state\.activePlatform === platform\) sendUnmute\(platform\); \}, 900\);/);
  assert.match(appjs, /function swipeStep\(dir\)/);
  assert.match(appjs, /backGuard: "smart"/);
  assert.ok(html.includes('id="swipeLayer"'));
  assert.equal(css.split("{").length, css.split("}").length);
});
