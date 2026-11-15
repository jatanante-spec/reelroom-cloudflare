// v27: newly created collection/tag must appear as a selected chip immediately.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appjs = readFileSync(join(root, "public", "app.js"), "utf8");

test("draft collection is merged into the chip list so Create is visible", () => {
  assert.match(appjs, /const cols = \[\.\.\.new Set\(\[\.\.\.allCollections\(\), \.\.\.\(state\.orgCol \? \[state\.orgCol\] : \[\]\)\]\)\]\.sort\(\);/);
  assert.match(appjs, /const tags = \[\.\.\.new Set\(\[\.\.\.allTags\(\), \.\.\.state\.orgTags\]\)\]\.sort\(\);/);
});

test("Create/Add give feedback and support Enter", () => {
  assert.match(appjs, /const createCol = \(\) => \{/);
  assert.match(appjs, /const createTag = \(\) => \{/);
  assert.match(appjs, /toast\(`Collection “\$\{v\}” selected — tap Save`\);/);
  assert.match(appjs, /toast\(`Tag #\$\{v\} added — tap Save`\);/);
  assert.match(appjs, /orgNewCol\.addEventListener\("keydown", \(e\) => \{ if \(e\.key === "Enter"\)/);
  assert.match(appjs, /orgNewTag\.addEventListener\("keydown", \(e\) => \{ if \(e\.key === "Enter"\)/);
});

test("organize save/undo and earlier contracts intact", () => {
  assert.match(appjs, /async function saveOrg\(\)/);
  assert.match(appjs, /function openOrg\(ids\)/);
  assert.match(appjs, /function layoutSwipeZones\(\)/);
  assert.match(appjs, /function updateTopbar\(\)/);
});
