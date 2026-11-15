// v16 resume + phone-back guard checks: frequent/keepalive saves, YouTube/TikTok
// resume, honest platform limits, history popstate guard, ask/double/off modes.
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

test("progress is saved frequently and on mobile leave events with keepalive", () => {
  assert.match(appjs, /saveTimer = setInterval\(\(\) => saveProgress\(item, false\), 5000\);/);
  assert.match(appjs, /async function saveProgress\(item, final, opts = \{\}\)/);
  assert.match(appjs, /keepalive: !!opts\.keepalive/);
  assert.match(appjs, /document\.addEventListener\("visibilitychange"/);
  assert.match(appjs, /window\.addEventListener\("pagehide"/);
  assert.match(appjs, /window\.addEventListener\("beforeunload"/);
  assert.match(appjs, /function flushProgress/);
});

test("a quick exit without player timing never downgrades a known saved place", () => {
  assert.match(appjs, /const known = Number\(item\.watch_seconds\) \|\| 0;/);
  assert.match(appjs, /if \(bridge\.duration <= 0 && pos < known\) pos = known;/);
});

test("auto-resume is preference-controlled and limited to platforms that can seek", () => {
  assert.match(appjs, /autoResume: true/);
  assert.match(appjs, /function resumePosition\(item, platform\)/);
  assert.match(appjs, /platform !== "youtube" && platform !== "tiktok"/);
  assert.match(appjs, /function toggleAutoResume/);
  assert.ok(html.includes('id="fsAutoResumeBtn"'));
});

test("YouTube resumes via start param and TikTok seeks after player ready", () => {
  assert.match(appjs, /const pos = resumePosition\(item, "youtube"\);/);
  assert.match(appjs, /u\.searchParams\.set\("start", String\(pos\)\);/);
  assert.match(appjs, /state\.pendingTikTokSeek = active\.platform === "tiktok" \? rp : 0;/);
  assert.match(appjs, /if \(d\.type === "onPlayerReady"\) \{/);
  assert.match(appjs, /if \(state\.pendingTikTokSeek > 0\)/);
  assert.match(appjs, /tiktokCommand\("seekTo", s\)/);
});

test("phone Back is intercepted with a history guard and smart/ask/double/off modes", () => {
  assert.match(appjs, /function armPlayerHistory/);
  assert.match(appjs, /history\.pushState\(\{ reelroom: "player-guard" \}/);
  assert.match(appjs, /window\.addEventListener\("popstate"/);
  assert.match(appjs, /function handlePlayerBack\(fromPopstate\)/);
  assert.match(appjs, /backGuard: "smart"/);
  assert.match(appjs, /function applyBackGuard\(value\)/);
  assert.match(appjs, /\["smart", "ask", "double", "off"\]\.includes\(value\)/);
});

test("back guard UI exists, is focusable, and keeps watching or exits cleanly", () => {
  for (const id of ["backGuard", "backGuardText", "backGuardContinueBtn", "backGuardExitBtn", "fsBackGuardSelect"]) {
    assert.ok(html.includes(`id="${id}"`), "missing #" + id);
  }
  assert.match(appjs, /function showBackGuard/);
  assert.match(appjs, /function hideBackGuard/);
  assert.match(appjs, /"#backGuardContinueBtn", "#backGuardExitBtn"/);
  assert.match(appjs, /backGuardExitBtn\.addEventListener\("click"/);
  assert.match(css, /\.back-guard\.open/);
  assert.match(css, /\.back-guard-primary/);
});

test("closing from UI removes the history guard; closing from popstate does not go back twice", () => {
  assert.match(appjs, /function closePlayer\(opts = \{\}\)/);
  assert.match(appjs, /state\.playerHistoryActive && !opts\.fromPopstate/);
  assert.match(appjs, /history\.back\(\);/);
  assert.match(appjs, /closePlayer\(\{ fromPopstate: !!fromPopstate, undo: true \}\)/);
});

test("v15 sound and v13/v14 landmarks remain intact", () => {
  assert.match(appjs, /function requestSound/);
  assert.ok(html.includes('id="soundHelperBtn"'));
  assert.match(appjs, /IG_GEOM/);
  assert.match(appjs, /function setSidebar\(open\)/);
  assert.equal(css.split("{").length, css.split("}").length);
});
