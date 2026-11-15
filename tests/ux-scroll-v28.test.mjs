// v28: scroll navigation = grouped wall + rail scrubber + jump sheet + compact + flip.
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

test("grouped wall with sticky headers", () => {
  assert.match(html, /class="groups" id="grid"/);
  assert.match(appjs, /function groupList\(list\)/);
  assert.match(appjs, /class="vgroup" data-group=/);
  assert.match(appjs, /class="group-head"/);
  assert.match(css, /\.group-head \{[\s\S]*?position: sticky;/);
});

test("right-edge rail scrubber with bubble + thumb", () => {
  for (const id of ["jumpRail", "railBubble"]) assert.ok(html.includes(`id="${id}"`), "missing #" + id);
  assert.match(appjs, /function buildRail\(\)/);
  assert.match(appjs, /function updateRail\(\)/);
  assert.match(appjs, /function scrubRail\(clientY\)/);
  assert.match(appjs, /rail\.addEventListener\("pointerdown"/);
  assert.match(css, /\.jump-rail/);
  assert.match(css, /body\.tv-mode \.jump-rail/); // hidden on TV, jump sheet covers
});

test("jump navigator sheet reaches sections/collections/tags/platforms", () => {
  for (const id of ["jumpModal", "jumpGroups", "jumpCols", "jumpTags", "jumpPlats", "dockJump"]) assert.ok(html.includes(`id="${id}"`), "missing #" + id);
  assert.match(appjs, /function openJump\(\)/);
  assert.match(appjs, /function renderJump\(\)/);
  assert.match(appjs, /function jumpToGroup\(idx\)/);
});

test("compact density + flip order persist/apply", () => {
  for (const id of ["compactBtn", "flipBtn"]) assert.ok(html.includes(`id="${id}"`), "missing #" + id);
  assert.match(appjs, /function applyCompact\(\)/);
  assert.match(appjs, /function flipOrder\(\)/);
  assert.match(appjs, /compact: false/);
  assert.match(css, /body\.compact \.group-grid/);
});

test("earlier contracts intact", () => {
  assert.match(appjs, /function openOrg\(ids\)/);
  assert.match(appjs, /function updateTopbar\(\)/);
  assert.match(appjs, /function layoutSwipeZones\(\)/);
  assert.match(appjs, /function mountFacebookNativeVideo\(item, url, seq\)/);
  assert.equal(css.split("{").length, css.split("}").length);
});
