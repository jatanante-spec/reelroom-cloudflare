// v30: rename a collection label across all its videos.
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

test("rename modal + per-collection pencil exist", () => {
  for (const id of ["renameModal", "renameInput", "renameSaveBtn", "renameSub"]) assert.ok(html.includes(`id="${id}"`), "missing #" + id);
  assert.match(appjs, /data-rename="/);
  assert.match(appjs, /function openRenameCollection\(name\)/);
  assert.match(css, /\.side-rename/);
});

test("rename PATCHes every video in the collection and keeps filter", () => {
  assert.match(appjs, /async function saveRenameCollection\(\)/);
  assert.match(appjs, /const ids = state\.items\.filter\(\(i\) => i\.collection === old\)\.map\(\(i\) => i\.id\);/);
  assert.match(appjs, /method: "PATCH", body: \{ collection: next \}/);
  assert.match(appjs, /if \(state\.collection === old && !failed\.length\) state\.collection = next;/);
  assert.match(appjs, /renameSave\.addEventListener\("click", saveRenameCollection\)/);
  assert.equal(css.split("{").length, css.split("}").length);
});
