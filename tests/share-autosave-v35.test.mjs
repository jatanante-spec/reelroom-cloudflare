// v35: "share → saved" + a clipboard that actually works.
//  1. A link shared from Facebook / YouTube / TikTok / Instagram is saved
//     straight away, with an Undo button.
//  2. A share that arrives while signed out waits for the password and is
//     saved straight after the login (it used to be lost).
//  3. Tapping "+ Add" reads the clipboard during that tap and fills the box.
//  4. The bulk tab has its own "Paste from clipboard" button.
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

test("the app says the current version", () => {
  assert.match(appjs, /const REELROOM_VERSION = "v37";/);
});

test("a shared link is saved straight away, not just dropped into the sheet", () => {
  assert.match(appjs, /async function handleSharedUrl\(url, sharedText\)/);
  // the share route calls it …
  assert.match(appjs, /if \(sharedUrl\) handleSharedUrl\(/);
  // … and it really posts the link to the server
  const fn = appjs.slice(appjs.indexOf("async function handleSharedUrl"));
  assert.match(fn.slice(0, 1500), /api\("\/api\/items", \{ method: "POST"/);
});

test("a shared link can be taken back with one tap", () => {
  const fn = appjs.slice(appjs.indexOf("async function handleSharedUrl"));
  assert.match(fn.slice(0, 2500), /label: "Undo", fn: \(\) => undoAdd\(data\.item\)/);
});

test("a share that arrives while signed out is not lost", () => {
  // the app remembers whether it is signed in …
  assert.match(appjs, /state\.authed = me\.authenticated !== false;/);
  // … parks the shared link …
  assert.match(appjs, /state\.pendingShare = \{ url, text: sharedText \|\| "" \};/);
  // … and saves it as soon as the login succeeds
  const login = appjs.slice(appjs.indexOf("async function doLogin()"));
  assert.match(login.slice(0, 1200), /state\.pendingShare/);
  assert.match(login.slice(0, 1200), /handleSharedUrl\(s\.url, s\.text\)/);
});

test("the share is handled even when the app is not signed in yet", () => {
  const boot = appjs.slice(appjs.lastIndexOf("checkAuth().then"));
  assert.match(boot.slice(0, 400), /applyLaunchShortcut\(\)/);
  // applyLaunchShortcut must be outside the "if (ok)" block
  assert.doesNotMatch(boot.slice(0, 400), /if \(ok\) \{[^}]*applyLaunchShortcut/);
});

test("tapping + Add reads the clipboard during the tap", () => {
  // the read must start inside the click handler — Android only allows a
  // clipboard read during a real tap
  assert.match(appjs, /function readClipNow\(\)/);
  const helper = appjs.slice(appjs.indexOf("function openAddFromTap()"));
  assert.match(helper.slice(0, 400), /const clip = readClipNow\(\);/);
  assert.match(helper.slice(0, 400), /clip\.then\(\(t\) => fillFromClipboard\(t\)\)/);
  // and every entry point uses it
  assert.match(appjs, /\$\("#addBtn"\)\.addEventListener\("click", openAddFromTap\);/);
  assert.match(appjs, /\$\("#emptyAddBtn"\)\.addEventListener\("click", openAddFromTap\);/);
  assert.match(appjs, /\$\("#dockAdd"\)\.addEventListener\("click", openAddFromTap\);/);
});

test("one copied link goes into the single box, several into the bulk box", () => {
  assert.match(appjs, /function extractAllUrls\(text\)/);
  const fn = appjs.slice(appjs.indexOf("function fillFromClipboard"));
  assert.match(fn.slice(0, 1600), /urls\.length === 1/);
  assert.match(fn.slice(0, 1600), /\$\("#singleUrl"\)/);
  assert.match(fn.slice(0, 1600), /\$\("#bulkUrls"\)/);
  assert.match(fn.slice(0, 1600), /dataset\.tab === "bulk"/);
});

test("the Add sheet can say where the link came from", () => {
  assert.match(html, /id="clipNote"/);
  assert.match(css, /#clipNote/);
});

test("the bulk tab has its own paste button", () => {
  assert.match(html, /id="bulkPasteBtn"/);
  assert.match(appjs, /const bulkPasteBtn = \$\("#bulkPasteBtn"\);/);
  const fn = appjs.slice(appjs.indexOf('const bulkPasteBtn = $("#bulkPasteBtn")'));
  assert.match(fn.slice(0, 800), /navigator\.clipboard\.readText\(\)/);
});

test("the share target is still in the manifest so Facebook can reach ReelRoom", () => {
  assert.ok(manifest.share_target, "the manifest needs a share_target");
  assert.equal(manifest.share_target.action, "/?share=1");
  assert.ok(manifest.share_target.params.url, "the shared url must be handed over");
});

test("a link that is not a video is never auto-saved — the sheet opens instead", () => {
  const fn = appjs.slice(appjs.indexOf("async function handleSharedUrl"));
  assert.match(fn.slice(0, 900), /if \(!detectPlatform\(url\)\) \{ openAddWith\(url, true\); return; \}/);
});

test("a strange answer from the server never crashes or loses the link", () => {
  const fn = appjs.slice(appjs.indexOf("async function handleSharedUrl"));
  assert.match(fn.slice(0, 1200), /if \(!data \|\| !data\.item\) \{ openAddWith\(url, true\); return; \}/);
});
