// v20: swipe autoplay must not auto-unmute, and should nudge muted playback.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, "public", p), "utf8");
const appjs = read("app.js");
const css = read("styles.css");

test("navigation sound init is explicitly muted and stale unmute timers are guarded", () => {
  assert.match(appjs, /function initSoundFor\(platform, opts = \{\}\)/);
  assert.match(appjs, /const mutedStart = !!opts\.mutedStart \|\| shouldStartMuted\(platform\);/);
  assert.match(appjs, /initSoundFor\(active\.platform, \{ mutedStart: navBoost \}\);/);
  assert.match(appjs, /if \(!mutedStart && canHostUnmute\(platform\)\)/);
  assert.match(appjs, /sound\.seq === seq && state\.activePlatform === platform/);
});

test("swipe/Next/Prev schedules muted play nudges for YouTube and TikTok", () => {
  assert.match(appjs, /function scheduleAutoplayNudges\(platform\)/);
  assert.match(appjs, /if \(navBoost\) scheduleAutoplayNudges\(active\.platform\);/);
  assert.match(appjs, /ytCommand\("mute"\); ytCommand\("playVideo"\);/);
  assert.match(appjs, /tiktokCommand\("mute"\); tiktokCommand\("play"\);/);
  assert.match(appjs, /bridge\.playerState === 1 \|\| bridge\.currentTime > 0\.75/);
});

test("nudges are cleared when sound is requested, guard pauses, or player closes", () => {
  assert.match(appjs, /function clearAutoplayNudges\(\)/);
  assert.match(appjs, /function requestSound\(\) \{[\s\S]*?clearAutoplayNudges\(\);/);
  assert.match(appjs, /clearAutoplayNudges\(\);\n    if \(state\.activePlatform === "youtube"\) ytCommand\("pauseVideo"\);/);
  assert.match(appjs, /stopTracking\(\);\n    clearAutoplayNudges\(\);/);
});

test("player state is tracked so nudges stop once playback starts", () => {
  assert.match(appjs, /playerState: -1/);
  assert.match(appjs, /bridge\.playerState = st;/);
  assert.match(appjs, /if \(st === 1\) clearAutoplayNudges\(\);/);
  assert.equal(css.split("{").length, css.split("}").length);
});
