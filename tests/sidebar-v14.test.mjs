// v14 mobile sidebar drawer checks: scrim, close button, outside tap,
// auto-close on every selection, keyboard/remote dismissal, scroll lock.
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

test("drawer has a scrim and a visible close button", () => {
  assert.ok(html.includes('id="sidebarScrim"'), "missing scrim");
  assert.ok(html.includes('id="sidebarCloseBtn"'), "missing close button");
  assert.match(html, /id="menuBtn"[^>]*aria-controls="sidebar"[^>]*aria-expanded="false"/);
});

test("scrim only exists on mobile and locks background scroll", () => {
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*?\.sidebar-scrim/);
  assert.match(css, /body\.sidebar-open \.sidebar-scrim \{ opacity: 1; pointer-events: auto; \}/);
  assert.match(css, /body\.sidebar-open \{ overflow: hidden; \}/);
  assert.match(css, /\.sidebar-head \{ display: none; \}/);
});

test("opening and closing the drawer is centralised", () => {
  assert.match(appjs, /function setSidebar\(open\)/);
  assert.match(appjs, /function closeSidebar\(\)/);
  assert.match(appjs, /classList\.toggle\("sidebar-open", open\)/);
  assert.match(appjs, /setAttribute\("aria-expanded", String\(open\)\)/);
});

test("tap outside, close button and scrim all dismiss the drawer", () => {
  assert.match(appjs, /sidebarScrim\.addEventListener\("click", closeSidebar\)/);
  assert.match(appjs, /sidebarCloseBtn\.addEventListener\("click", closeSidebar\)/);
  assert.match(appjs, /sidebarOpen\(\) && !\$\("#sidebar"\)\.contains\(e\.target\) && !\$\("#menuBtn"\)\.contains\(e\.target\)/);
});

test("every sidebar selection closes the drawer, including collections and tags", () => {
  assert.match(appjs, /data-view[\s\S]*?render\(\); closeSidebar\(\);/);
  assert.match(appjs, /platform-link[\s\S]*?render\(\); closeSidebar\(\);/);
  assert.match(appjs, /data-collection[\s\S]*?render\(\);\s*closeSidebar\(\);/);
  assert.match(appjs, /data-tag[\s\S]*?render\(\);\s*closeSidebar\(\);/);
});

test("Esc, Back and swipe-left dismiss the drawer", () => {
  assert.match(appjs, /sidebarOpen\(\) && e\.key === "Escape"/);
  assert.match(appjs, /sidebarOpen\(\) && e\.key === "Backspace"/);
  assert.match(appjs, /dx < -60/);
});

test("focus is managed: trap Tab and arrow-key navigation inside the drawer", () => {
  assert.match(appjs, /function trapSidebarTab/);
  assert.match(appjs, /function sidebarArrowNav/);
  assert.match(appjs, /first\.focus\(\)/);
});

test("desktop and TV mode do not leave the drawer locked open", () => {
  assert.match(appjs, /if \(open && !isMobileLayout\(\)\) open = false;/);
  assert.match(appjs, /!isMobileLayout\(\) && sidebarOpen\(\)/);
  assert.match(appjs, /if \(tvEnabled\(\)\) closeSidebar\(\);/);
});

test("css braces stay balanced after the v14 section", () => {
  assert.equal(css.split("{").length, css.split("}").length);
});
