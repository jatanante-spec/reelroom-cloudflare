// v25: Smart top bar = auto-hide + shrink + context chip + pinned progress.
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

test("Smart top bar hides on scroll-down and condenses on scroll-up", () => {
  assert.match(appjs, /function updateTopbar\(\)/);
  assert.match(appjs, /document\.body\.classList\.toggle\("top-hidden", hide\);/);
  assert.match(appjs, /document\.body\.classList\.toggle\("top-condensed", !tv && y > 60 && !state\.searchOpen\);/);
  assert.match(appjs, /if \(tv \|\| blocked\) hide = false;/); // TV never hides
  assert.match(css, /body\.top-hidden \.topbar \{ transform: translateY\(-105%\); \}/);
  assert.match(css, /body\.top-condensed \.topbar \{ height: 48px; \}/);
});

test("condensed bar keeps search reachable + context chip", () => {
  assert.match(html, /id="topSearchBtn"/);
  assert.match(html, /id="topContext"/);
  assert.match(appjs, /function openTopSearch\(\)/);
  assert.match(appjs, /function updateTopContext\(count\)/);
  assert.match(appjs, /topbar\.addEventListener\("focusin"/); // D-pad reveals
  assert.match(css, /body\.top-condensed #topSearchBtn \{ display: inline-flex; \}/);
  assert.match(css, /body\.top-condensed:not\(\.top-hidden\) \.top-context \{ display: block; \}/);
});

test("progress stays pinned; earlier v24 contracts intact", () => {
  assert.match(css, /#scrollProgress \{[\s\S]*?position: fixed; top: 0;/);
  assert.match(appjs, /function updateDock\(\)/);
  assert.match(appjs, /async function checkClipboard\(\)/);
  assert.match(appjs, /function openAddWith\(url, shared\)/);
  assert.equal(css.split("{").length, css.split("}").length);
});
