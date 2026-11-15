// v24: B auto-hide dock + C copied-link chip + D share target.
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
const manifest = JSON.parse(read("manifest.webmanifest"));

test("B: minimal auto-hide dock with Home/Search/Add/Top", () => {
  for (const id of ["dock", "dockHome", "dockSearch", "dockAdd", "dockTop"]) assert.ok(html.includes(`id="${id}"`), "missing #" + id);
  assert.match(appjs, /function updateDock\(\)/);
  assert.match(appjs, /dock\.classList\.toggle\("dock-hidden", hide && !blocked\);/);
  assert.match(appjs, /if \(tvEnabled\(\)\) hide = false;/); // TV never auto-hides
  assert.match(appjs, /dock\.addEventListener\("focusin"/); // D-pad focus reveals
  assert.match(css, /\.dock\.dock-hidden/);
  assert.equal(css.split("{").length, css.split("}").length);
});

test("C: copied-link chip + paste button", () => {
  for (const id of ["clipChip", "clipAddBtn", "clipDismissBtn", "pasteBtn"]) assert.ok(html.includes(`id="${id}"`), "missing #" + id);
  assert.match(appjs, /async function checkClipboard\(\)/);
  assert.match(appjs, /navigator\.clipboard\.readText\(\)/);
  assert.match(appjs, /function hideClip\(\)/);
  assert.match(appjs, /window\.addEventListener\("focus", \(\) => \{ checkClipboard\(\); updateDock\(\); \}\);/);
  assert.match(css, /\.clip-chip/);
});

test("D: PWA share target pre-fills the add sheet", () => {
  assert.ok(manifest.share_target, "manifest share_target missing");
  assert.equal(manifest.share_target.method, "GET");
  assert.ok(manifest.share_target.params.url);
  assert.match(appjs, /function openAddWith\(url, shared\)/);
  assert.match(appjs, /const sharedUrl = extractUrl\(params\.get\("url"\) \|\| params\.get\("text"\) \|\| params\.get\("title"\) \|\| ""\);/);
  assert.match(appjs, /if \(sharedUrl\) openAddWith\(sharedUrl, true\);/);
  assert.match(html, /id="sharedNote"/);
});

test("add modal becomes a bottom sheet on phones; earlier contracts intact", () => {
  assert.match(css, /#addModal \.modal \{ border-radius: 18px 18px 0 0;/);
  assert.match(appjs, /function layoutSwipeZones\(\)/);
  assert.match(appjs, /function mountFacebookNativeVideo\(item, url, seq\)/);
  assert.match(appjs, /function undoAdd\(item\)/);
});
