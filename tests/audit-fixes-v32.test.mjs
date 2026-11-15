// v32: audit fixes — Back/Edit, focus trap, header overlap, link punctuation,
// bulk-save reporting, import id repair + truncation warnings, long-press on
// action buttons, login hardening, library cap, 500 for server errors.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { handler } from "../lib/api-core.mjs";
import { fakeD1 } from "./helpers.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, "public", p), "utf8");
const appjs = read("app.js");
const css = read("styles.css");

const realFetch = globalThis.fetch;
before(() => {
  globalThis.fetch = async () => new Response(JSON.stringify({ title: "Stub", author_name: "A", thumbnail_url: "https://i.ytimg.com/vi/x/hqdefault.jpg" }), { status: 200, headers: { "Content-Type": "application/json" } });
});
after(() => { globalThis.fetch = realFetch; });

function req(path, { method = "GET", body, headers = {} } = {}) {
  const h = { ...headers };
  if (body !== undefined) h["Content-Type"] = "application/json";
  return new Request("https://reelroom.pages.dev" + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function call(env, path, opts) {
  const res = await handler(req(path, opts), env);
  let data = null; try { data = await res.clone().json(); } catch {}
  return { res, data };
}
const mkEnv = (extra = {}) => ({ DB: fakeD1(), NO_SEED: "1", ...extra });

// ---------- frontend contracts ----------
test("#1 Back closes a popup on top of the player before exiting", () => {
  assert.match(appjs, /const gm = topGuardModal\(\);/);
  assert.match(appjs, /if \(gm\) \{[\s\S]*?armPlayerHistory\(\);[\s\S]*?return;/);
});

test("#2 popups trap Tab focus and restore it on close", () => {
  assert.match(appjs, /function trapModalTab\(e\)/);
  assert.match(appjs, /function focusablesIn\(el\)/);
  assert.match(appjs, /trapModalTab\(e\);/);
  assert.match(appjs, /state\.modalReturnFocus/);
});

test("#3 condensed context line is 22px and sits flush under the 48px bar", () => {
  assert.match(css, /\.top-context \{[\s\S]*?top: 48px;[\s\S]*?height: 22px;/);
  // 48 + 22 = 70, which is exactly the sticky group-head offset -> no overlap
  assert.match(css, /body\.top-condensed \.group-head \{ top: 70px; \}/);
});

test("#4 extractUrl strips trailing punctuation and unmatched brackets", () => {
  assert.match(appjs, /u = u\.replace\(\/\[\.,;!\?\]\+\$\/, ""\);/);
  assert.match(appjs, /while \(\/\[\)\\\]\]\$\/\.test\(u\)\)/);
});

test("#5 bulk save / favorite / rename report partial failures and keep failed selected", () => {
  assert.match(appjs, /Saved \$\{saved\.length\} of \$\{ids\.length\} — \$\{failed\.length\} failed/);
  assert.match(appjs, /Favorited \$\{saved\.length\} of \$\{ids\.length\} — \$\{failed\.length\} failed/);
  assert.match(appjs, /Renamed \$\{ok\} of \$\{ids\.length\} — \$\{failed\.length\} failed/);
  assert.match(appjs, /state\.orgIds = failed;/);
});

test("#7 long-press ignores action buttons / links / fields", () => {
  assert.match(appjs, /e\.target\.closest\("\[data-act\], \.card-actions, button, a, input, select, textarea"\)/);
});

test("#6/#9 frontend surfaces backend warnings", () => {
  assert.match(appjs, /data\.warnings && data\.warnings\.length/);
});

// ---------- backend behaviour ----------
test("#6 import repairs unsafe ids so the item stays editable/deletable", async () => {
  const env = mkEnv();
  const imp = await call(env, "/api/import", { method: "POST", body: [{ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", id: "bad/id" }] });
  assert.equal(imp.data.added, 1);
  const list = (await call(env, "/api/items")).data;
  const id = list[0].id;
  assert.match(id, /^[A-Za-z0-9-]+$/);
  const patch = await call(env, `/api/items/${id}`, { method: "PATCH", body: { title: "New" } });
  assert.equal(patch.res.status, 200);
  const del = await call(env, `/api/items/${id}`, { method: "DELETE" });
  assert.equal(del.res.status, 200);
});

test("#6 import preserves valid ids and warns on truncation", async () => {
  const env = mkEnv();
  const items = Array.from({ length: 2001 }, (_, i) => ({ url: `https://www.youtube.com/watch?v=${String(i).padStart(11, "a")}`, id: `keep-${i}` }));
  const imp = await call(env, "/api/import", { method: "POST", body: items });
  assert.equal(imp.data.added, 2000);
  assert.ok(imp.data.warnings.some((w) => /2000/.test(w) && /ignored/.test(w)));
  const list = (await call(env, "/api/items")).data;
  assert.ok(list.some((i) => i.id === "keep-0"));
});

test("#9 bulk add warns when over 500 lines and enforces the library cap", async () => {
  const env = mkEnv();
  const urls = Array.from({ length: 501 }, (_, i) => `https://www.youtube.com/watch?v=${String(i).padStart(11, "b")}`).join("\n");
  const bulk = await call(env, "/api/items/bulk", { method: "POST", body: { urls } });
  assert.equal(bulk.data.added.length, 500);
  assert.ok(bulk.data.warnings.some((w) => /500/.test(w)));
  // fill to the cap, then one more bulk must be refused with a warning
  const fill = Array.from({ length: 1500 }, (_, i) => ({ url: `https://www.youtube.com/watch?v=${String(i).padStart(11, "c")}`, id: `f${i}` }));
  await call(env, "/api/import", { method: "POST", body: fill });
  const over = await call(env, "/api/items/bulk", { method: "POST", body: { urls: "https://www.youtube.com/watch?v=zzzzzzzzzzz" } });
  assert.equal(over.data.added.length, 0);
  assert.ok(over.data.warnings.some((w) => /full/.test(w)));
  assert.equal((await call(env, "/api/items")).data.length, 2000);
});

test("#8 login is rate-limited and rejects oversized bodies", async () => {
  const env = mkEnv({ REELROOM_PASSWORD: "pw" });
  const headers = { "cf-connecting-ip": "203.0.113.9" };
  let last;
  for (let i = 0; i < 11; i++) last = await call(env, "/api/login", { method: "POST", body: { password: "wrong" }, headers });
  assert.equal(last.res.status, 429);
  // a different IP is not limited
  const ok = await call(env, "/api/login", { method: "POST", body: { password: "pw" }, headers: { "cf-connecting-ip": "203.0.113.10" } });
  assert.equal(ok.res.status, 200);
  const big = await call(env, "/api/login", { method: "POST", body: { password: "x".repeat(5000) }, headers: { "cf-connecting-ip": "203.0.113.11" } });
  assert.equal(big.res.status, 400);
});

test("#10 unexpected server errors are 500, client errors stay 400/404", async () => {
  const env = mkEnv();
  assert.equal((await call(env, "/api/items", { method: "POST", body: {} })).res.status, 400);
  assert.equal((await call(env, "/api/items", { method: "POST", body: { url: "not-a-url" } })).res.status, 400);
  assert.equal((await call(env, "/api/nope")).res.status, 404);
  assert.equal((await call({ NO_SEED: "1" }, "/api/items")).res.status, 500);
});
