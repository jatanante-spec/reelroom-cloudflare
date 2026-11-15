// v29: fix vertical count, empty rail column, orphan platform chip.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, "public", p), "utf8");
const appjs = read("app.js");
const css = read("styles.css");

test("result count stays on one line; toolbar wraps cleanly", () => {
  assert.match(css, /\.result-count \{[^}]*white-space: nowrap;/);
  assert.match(css, /\.toolbar-right \{[^}]*flex-wrap: wrap;/);
});

test("platform chips are a single swipeable row", () => {
  assert.match(css, /\.chips \{[^}]*flex-wrap: nowrap; overflow-x: auto;/);
  assert.match(css, /\.chip \{ flex-shrink: 0; \}/);
});

test("rail column only reserved when 2+ sections exist", () => {
  assert.match(appjs, /document\.body\.classList\.toggle\("has-rail", state\.groups\.length > 1\);/);
  assert.match(appjs, /if \(state\.groups\.length < 2\) \{ rail\.innerHTML = ""; return; \}/);
  assert.match(css, /body\.has-rail \.main \{ padding-right: 34px; \}/);
  assert.match(css, /\.jump-rail \{ display: none; \}/);
  assert.match(css, /body\.has-rail \.jump-rail \{/);
  assert.equal(css.split("{").length, css.split("}").length);
});
