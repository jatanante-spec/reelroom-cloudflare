// v23: add-link close-and-return + Undo, and back-to-top helpers.
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

test("single add closes the modal by default, highlights and scrolls to the new card", () => {
  assert.match(appjs, /const keep = \$\("#keepOpenAdd"\) && \$\("#keepOpenAdd"\)\.checked;/);
  assert.match(appjs, /if \(!keep\) \{ \$\("#addModal"\)\.hidden = true; scrollToCard\(data\.item\.id\); \}/);
  assert.match(appjs, /function highlightAdded\(id\)/);
  assert.match(appjs, /function scrollToCard\(id\)/);
  assert.match(appjs, /state\.lastAddedId === item\.id \? "just-added" : ""/);
  assert.match(html, /id="keepOpenAdd"/);
  assert.match(css, /\.card\.just-added/);
});

test("add success offers Undo and optional details are collapsed", () => {
  assert.match(appjs, /toast\("Added to library", \{ label: "Undo", fn: \(\) => undoAdd\(data\.item\) \}\);/);
  assert.match(appjs, /async function undoAdd\(item\)/);
  assert.match(html, /<details class="add-details" id="addDetails">/);
  assert.match(html, /id="toastAction"/);
  assert.match(appjs, /function toast\(msg, action\)/);
});

test("bulk paste keeps a summary with Done / Add more actions", () => {
  assert.match(html, /id="bulkActions"/);
  assert.match(html, /id="bulkDoneBtn"/);
  assert.match(html, /id="bulkMoreBtn"/);
  assert.match(appjs, /const ba = \$\("#bulkActions"\); if \(ba\) ba\.hidden = false;/);
  assert.match(appjs, /bulkDone\.addEventListener\("click"/);
  assert.match(appjs, /bulkMore\.addEventListener\("click"/);
});

test("back-to-top controls exist and are hidden until useful", () => {
  for (const id of ["toTopBtn", "headTopBtn", "scrollProgress"]) assert.ok(html.includes(`id="${id}"`), "missing #" + id);
  assert.match(appjs, /function scrollToTop\(\)/);
  assert.match(appjs, /function updateScrollUI\(\)/);
  assert.match(appjs, /fab\.hidden = playerOpen \|\| y <= window\.innerHeight \* 0\.9;/);
  assert.match(appjs, /head\.hidden = playerOpen \|\| y <= 80;/);
  assert.match(appjs, /window\.addEventListener\("scroll", updateScrollUI, \{ passive: true \}\);/);
  assert.match(appjs, /if \(e\.key === "Home" && \$\("#playerModal"\)\.hidden && !sidebarOpen\(\)\)/);
  assert.match(appjs, /if \(now - lastBrandTap < 350\) scrollToTop\(\);/);
  assert.match(css, /\.to-top/);
  assert.equal(css.split("{").length, css.split("}").length);
});

test("earlier player/swipe/Facebook contracts remain intact", () => {
  assert.match(appjs, /function layoutSwipeZones\(\)/);
  assert.match(appjs, /function mountFacebookNativeVideo\(item, url, seq, preparedVideo = null\)/);
  assert.match(appjs, /function scheduleAutoplayNudges\(platform\)/);
  assert.match(appjs, /IG_GEOM/);
});
