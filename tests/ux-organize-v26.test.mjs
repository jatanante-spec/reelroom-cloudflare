// v26: quick organize = chips sheet, long-press, multi-select, edge swipe.
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

test("organize sheet with one-tap collection/tag chips + inline create", () => {
  for (const id of ["orgModal", "orgColChips", "orgTagChips", "orgNewCol", "orgNewTag", "orgSaveBtn", "orgSuggest"]) assert.ok(html.includes(`id="${id}"`), "missing #" + id);
  assert.match(appjs, /function openOrg\(ids\)/);
  assert.match(appjs, /function renderOrg\(\)/);
  assert.match(appjs, /async function saveOrg\(\)/);
  assert.match(appjs, /label: "Undo"/);
  assert.match(css, /\.org-pick\.on/);
});

test("quick tag icon + long-press open Organize", () => {
  assert.match(appjs, /data-act="org"/);
  assert.match(appjs, /if \(actBtn\.dataset\.act === "org"\) openOrg\(\[id\]\);/);
  assert.match(appjs, /lpTimer = setTimeout\(\(\) => \{/);
  assert.match(appjs, /card\.addEventListener\("contextmenu"/);
  assert.match(css, /\.org-tool/);
});

test("multi-select + bulk organize/favorite", () => {
  for (const id of ["selectBtn", "bulkBar", "bulkOrganizeBtn", "bulkFavBtn", "bulkCancelBtn"]) assert.ok(html.includes(`id="${id}"`), "missing #" + id);
  assert.match(appjs, /function setSelecting\(on\)/);
  assert.match(appjs, /function toggleSel\(id\)/);
  assert.match(appjs, /async function bulkFav\(\)/);
  assert.match(appjs, /if \(state\.selecting\) \{ toggleSel\(id\); return; \}/);
  assert.match(css, /body\.selecting \.selbox/);
});

test("edge swipe opens sidebar; earlier contracts intact", () => {
  assert.match(html, /id="edgeHandle"/);
  assert.match(appjs, /edgeX = t\.clientX <= 28 \? t\.clientX : null;/);
  assert.match(appjs, /if \(dx > 60 && Math\.abs\(dx\) > Math\.abs\(dy\) \* 1\.3\) setSidebar\(true\);/);
  assert.match(appjs, /function updateTopbar\(\)/);
  assert.match(appjs, /function updateDock\(\)/);
  assert.match(appjs, /function layoutSwipeZones\(\)/);
  assert.equal(css.split("{").length, css.split("}").length);
});
