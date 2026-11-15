// v31: no accidental long-press selection; phone Back closes popups.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, "public", p), "utf8");
const appjs = read("app.js");
const css = read("styles.css");

test("long-press cannot select card/popup text, but inputs stay selectable", () => {
  assert.match(css, /\.card, \.modal, \.dock, \.topbar, \.sidebar, \.chip, \.org-pick, \.btn, \.icon-btn,[\s\S]*?-webkit-user-select: none; user-select: none; -webkit-touch-callout: none;/);
  assert.match(css, /input, textarea, \[contenteditable="true"\] \{ -webkit-user-select: text; user-select: text; \}/);
  assert.match(appjs, /window\.getSelection && window\.getSelection\(\)\.removeAllRanges\(\);/);
});

test("Back closes the open popup via a history guard, not exit app", () => {
  assert.match(appjs, /const GUARD_MODALS = \["renameModal", "jumpModal", "orgModal", "editModal", "addModal", "installModal", "loginModal", "linkModal"\];/);
  assert.match(appjs, /history\.pushState\(\{ reelroom: "modal-guard" \}, "", location\.href\);/);
  assert.match(appjs, /if \(!state\.modalGuard\) return;/);
  assert.match(appjs, /const m = topGuardModal\(\);/);
  assert.match(appjs, /if \(!state\.modalGuardFromPop\) \{ try \{ history\.back\(\); \} catch \{\} \}/);
  assert.equal(css.split("{").length, css.split("}").length);
});
