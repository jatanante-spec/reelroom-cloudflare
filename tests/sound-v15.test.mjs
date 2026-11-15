// v15 sound helper checks: obvious muted state, one-tap unmute where supported,
// session memory, honest Instagram/Facebook fallback, remote-friendly controls.
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

test("sound helper controls exist in the player, big view and More panel", () => {
  for (const id of ["soundHelperBtn", "soundHelperText", "soundHint", "fsSoundBtn", "soundActionBtn", "fsSoundRememberBtn"]) {
    assert.ok(html.includes(`id="${id}"`), "missing #" + id);
  }
  assert.match(html, /id="soundHelperBtn"[^>]*hidden/);
});

test("sound choice is remembered per browser session, not forced forever", () => {
  assert.match(appjs, /const SOUND_SESSION_KEY = "reelroom\.sound\.session\.v1";/);
  assert.match(appjs, /sessionStorage\.getItem\(SOUND_SESSION_KEY\)/);
  assert.match(appjs, /sessionStorage\.setItem\(SOUND_SESSION_KEY, "on"\)/);
  assert.match(appjs, /soundRemember: true/);
  assert.match(appjs, /function toggleSoundRemember/);
});

test("embed URLs get a safe muted start and can try sound-on later", () => {
  assert.match(appjs, /function shouldStartMuted/);
  assert.match(appjs, /function applySoundParams/);
  assert.match(appjs, /u\.searchParams\.set\("mute", muted \? "1" : "0"\)/);
  assert.match(appjs, /u\.searchParams\.set\("muted", muted \? "1" : "0"\)/);
  assert.match(appjs, /return applySoundParams\(platform, u\.href, navBoost\);/);
});

test("host-unmute is limited to YouTube/TikTok and native Facebook video", () => {
  assert.match(appjs, /function canHostUnmute\(platform\) \{ return platform === "youtube" \|\| platform === "tiktok" \|\| \(platform === "facebook" && !!state\.fbNativeVideo\); \}/);
  assert.match(appjs, /ytCommand\("unMute"\)/);
  assert.match(appjs, /tiktokCommand\("unMute"\)/);
  assert.match(appjs, /else if \(platform === "facebook" && state\.fbNativeVideo\)/);
});

test("Instagram and Facebook get an honest in-player fallback, not a fake unmute", () => {
  assert.match(appjs, /sound\.status = "fallback"; sound\.fallback = true;/);
  assert.match(appjs, /Tap the speaker inside the Instagram video/);
  assert.match(appjs, /Tap the speaker inside the Facebook video/);
  assert.match(appjs, /Instagram controls its own sound/);
  assert.match(appjs, /Facebook controls its own sound/);
});

test("player reports update the sound state when platforms confirm mute/unmute", () => {
  assert.match(appjs, /function setSoundConfirmed/);
  assert.match(appjs, /typeof info\.muted === "boolean"/);
  assert.match(appjs, /d\.type === "onMute"/);
});

test("sound is reachable by keyboard and remote focus order", () => {
  assert.match(appjs, /e\.key === "s" \|\| e\.key === "S"/);
  assert.match(appjs, /"#fsSoundBtn", "#soundHelperBtn"/);
  assert.match(appjs, /fsSoundBtn\.addEventListener\("click"/);
  assert.match(appjs, /soundHelperBtn\.addEventListener\("click"/);
});

test("CSS shows the helper only in the big view and hides it when idle/More open", () => {
  assert.match(css, /\.player-shell\.pseudo-fs \.sound-helper:not\(\[hidden\]\)/);
  assert.match(css, /\.sound-hint/);
  assert.match(css, /\.player-shell\.fs-idle:not\(\.counting\) \.sound-helper/);
  assert.match(css, /\.player-shell\.more-open \.sound-helper/);
  assert.match(css, /body\.tv-mode \.player-shell\.pseudo-fs #fsSoundBtn/);
});

test("v13/v14 player and drawer landmarks are still intact", () => {
  assert.match(appjs, /IG_GEOM/);
  assert.match(appjs, /function sizeFacebookStage/);
  assert.match(appjs, /function setSidebar\(open\)/);
  assert.ok(html.includes('id="sidebarScrim"'));
  assert.equal(css.split("{").length, css.split("}").length);
});
