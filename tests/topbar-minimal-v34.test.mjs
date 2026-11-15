// v34: ultra-minimal top — bar (menu · red logo · search · ⋮) + one slim sort chip.
// Select / Comfortable / Newest ↓ / the link count / TV mode / the version badge
// all moved into the ⋮ menu, so the videos start much higher up the screen.
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

const header = html.slice(html.indexOf('<header class="topbar">'), html.indexOf("</header>"));
const moreMenu = html.slice(html.indexOf('id="moreMenu"'), html.indexOf('id="moreMenu"') + 2000);

test("the bar keeps the menu, the red logo, the search box and the ⋮ button", () => {
  assert.match(header, /id="menuBtn"/);
  assert.match(header, /class="brand-logo"/);
  assert.match(header, /id="searchInput"/);
  assert.match(header, /id="moreBtn"/);
});

test("the TV button and the version badge are no longer in the bar row", () => {
  // they still live inside <header>, but only inside the ⋮ dropdown
  const menuAt = header.indexOf('id="moreMenu"');
  const tvAt = header.indexOf('id="tvModeBtn"');
  assert.ok(menuAt > -1 && tvAt > menuAt, "the TV button must sit after the ⋮ menu, not in the bar row");
  assert.doesNotMatch(header, /id="versionBadge"/);
  // the visible bar row ends where the ⋮ menu begins
  const barRow = header.slice(0, menuAt);
  assert.doesNotMatch(barRow, /id="tvModeBtn"/);
});

test("the moved controls now live in the ⋮ menu", () => {
  for (const id of ["selectBtn", "compactBtn", "flipBtn", "tvModeBtn", "resultCount"]) {
    assert.ok(moreMenu.includes(`id="${id}"`), "#" + id + " is not inside the ⋮ menu");
  }
});

test("one slim sort chip replaces the old dropdown row", () => {
  assert.match(html, /id="sortChip"/);
  assert.match(html, /id="sortMenu"/);
  for (const v of ["newest", "oldest", "title", "platform"]) {
    assert.ok(html.includes(`data-sort="${v}"`), "missing sort option " + v);
  }
  // the native select is kept (hidden) so the existing sort logic keeps working
  assert.match(html, /<select id="sortSelect" aria-label="Sort" hidden>/);
});

test("the sort chip opens its list and applies the chosen order", () => {
  assert.match(appjs, /const REELROOM_VERSION = "v34";/);
  assert.match(appjs, /function syncSortChip\(\)/);
  assert.match(appjs, /sortChip\.addEventListener\("click"/);
  assert.match(appjs, /sortMenu\.addEventListener\("click"/);
  assert.match(appjs, /state\.sort = v;/);
  assert.match(appjs, /syncFlip\(\); render\(\);/);
  assert.match(appjs, /chip\.textContent = label \+ " ▾";/);
});

test("the version badge is stamped into the ⋮ menu", () => {
  assert.match(appjs, /const menu = document\.querySelector\("#moreMenu"\);/);
  assert.match(appjs, /badge\.className = "menu-ver";/);
  assert.match(appjs, /menu\.appendChild\(badge\);/);
});

test("the moved rows look like plain menu entries", () => {
  assert.match(css, /#moreMenu \.btn \{/);
  assert.match(css, /#moreMenu \.icon-btn \{/);
  assert.match(css, /#moreMenu \.menu-sep \{/);
  assert.match(css, /#moreMenu \.menu-ver \{/);
  assert.match(css, /\.sort-wrap \{ flex: 0 0 auto; \}/);
});

test("the filter row is one line: scrolling chips plus the sort chip", () => {
  assert.match(css, /\.toolbar \{[^}]*flex-wrap: nowrap;/);
  assert.match(css, /\.chips \{[^}]*flex: 1 1 auto; min-width: 0; \}/);
  // earlier v29 layout contracts are untouched
  assert.match(css, /\.toolbar-right \{[^}]*flex-wrap: wrap;/);
  assert.match(css, /\.result-count \{[^}]*white-space: nowrap;/);
  assert.match(css, /\.chips \{[^}]*flex-wrap: nowrap; overflow-x: auto;/);
});
