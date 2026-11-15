// v36: batch tidy-up.
//  1. BUG FIX: organising several videos at once used to wipe their collection
//     and their tags. Now only what you actually choose is changed.
//  2. "Select all" takes every video matching the current filter/search.
//  3. The Bulk paste tab has tap-chips of the collections and tags you have.
//  4. The Organize sheet can clear the tags of a group on purpose.
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

test("the app says the current version", () => {
  assert.match(appjs, /const REELROOM_VERSION = "v37";/);
});

test("organising several videos no longer wipes their collection and tags", () => {
  const save = appjs.slice(appjs.indexOf("async function saveOrg()"));
  assert.ok(save.length, "saveOrg is missing");
  // the old line sent both fields every time — that is what wiped them
  assert.doesNotMatch(save.slice(0, 2500), /method: "PATCH", body: \{ collection: state\.orgCol, tags: \[\.\.\.state\.orgTags\] \}/);
  // a collection is only changed when one was actually chosen
  assert.match(save.slice(0, 2500), /if \(state\.orgColTouched && item && \(item\.collection \|\| ""\) !== state\.orgCol\) body\.collection = state\.orgCol;/);
  // tags are added to each video, keeping the ones it already had
  assert.match(save.slice(0, 2500), /const merged = \[\.\.\.new Set\(\[\.\.\.own, \.\.\.state\.orgTags\]\)\];/);
  // and a video with nothing to change is not written to at all
  assert.match(save.slice(0, 2500), /if \(!Object\.keys\(body\)\.length\) \{ saved\.push\(id\); continue; \}/);
});

test("one video can still be edited exactly (tags can be taken off)", () => {
  const save = appjs.slice(appjs.indexOf("async function saveOrg()"));
  assert.match(save.slice(0, 2500), /if \(state\.orgSingle\)/);
  assert.match(save.slice(0, 2500), /if \(cur !== want\) body\.tags = \[\.\.\.state\.orgTags\];/);
});

test("the organize sheet starts from 'change nothing' when many videos are picked", () => {
  const open = appjs.slice(appjs.indexOf("function openOrg(ids)"));
  assert.match(open.slice(0, 900), /state\.orgColTouched = ids\.length === 1;/);
  assert.match(open.slice(0, 900), /state\.orgTags = new Set\(ids\.length === 1 \? \(first\?\.tags \|\| \[\]\) : \[\]\);/);
  assert.match(open.slice(0, 900), /state\.orgSingle = ids\.length === 1;/);
});

test("the sheet says in plain words what Save is going to do", () => {
  assert.match(html, /id="orgWhat"/);
  const fn = appjs.slice(appjs.indexOf("const what = $(\"#orgWhat\")"));
  assert.match(fn.slice(0, 1200), /collections stay as they are/);
  assert.match(fn.slice(0, 1200), /keeps the rest/);
  assert.match(css, /\.org-what/);
});

test("'Select all' picks every video you are looking at", () => {
  assert.match(html, /id="bulkSelectAllBtn"/);
  const fn = appjs.slice(appjs.indexOf("function selectAllVisible()"));
  assert.match(fn.slice(0, 700), /const list = filtered\(\);/);
  assert.match(fn.slice(0, 700), /state\.selected\.add\(i\.id\)/);
  assert.match(appjs, /const bulkAll = \$\("#bulkSelectAllBtn"\); if \(bulkAll\) bulkAll\.addEventListener\("click", selectAllVisible\);/);
  // the button says which way it will go
  const count = appjs.slice(appjs.indexOf("function updateBulkCount()"));
  assert.match(count.slice(0, 900), /all\.textContent = every \? "Clear" : "Select all";/);
});

test("the bulk paste tab offers your own collections and tags as chips", () => {
  assert.match(html, /id="bulkColChips"/);
  assert.match(html, /id="bulkTagChips"/);
  const fn = appjs.slice(appjs.indexOf("function renderBulkChips()"));
  assert.match(fn.slice(0, 1500), /allCollections\(\)/);
  assert.match(fn.slice(0, 1500), /allTags\(\)/);
  // tapping a chip fills the box with the exact existing name
  assert.match(fn.slice(0, 1500), /f\.value = b\.dataset\.bcol;/);
  assert.match(fn.slice(0, 1500), /parts\.push\(t\)/);
});

test("tags that every selected video already has are marked", () => {
  const fn = appjs.slice(appjs.indexOf("function renderOrg()"));
  assert.match(fn.slice(0, 2200), /const common = new Set\(/);
  assert.match(fn.slice(0, 2200), /\$\{already \? " ✓" : ""\}/);
});

test("the tags of a group can be cleared on purpose", () => {
  assert.match(html, /id="orgClearTagsBtn"/);
  assert.match(appjs, /state\.orgTagsClear = !state\.orgTagsClear;/);
  const save = appjs.slice(appjs.indexOf("async function saveOrg()"));
  assert.match(save.slice(0, 2500), /if \(state\.orgTagsClear\) \{\s*if \(own\.length\) body\.tags = \[\];/);
});

test("the older organize contracts are still in place", () => {
  assert.match(html, /id="orgColChips"/);
  assert.match(html, /id="orgTagChips"/);
  assert.match(html, /id="orgNewCol"/);
  assert.match(html, /id="orgNewTag"/);
  assert.match(appjs, /function openOrg\(ids\)/);
  assert.match(appjs, /async function bulkFav\(\)/);
});
