// End-to-end tests of the real request handler against a fake D1 binding.
// Network access is stubbed so the suite is fast and deterministic.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { handler } from "../lib/api-core.mjs";
import { fakeD1 } from "./helpers.mjs";

const realFetch = globalThis.fetch;
before(() => {
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes("youtube") || u.includes("youtu.be")) {
      return new Response(JSON.stringify({ title: "Stubbed YouTube title", author_name: "Stub Author", thumbnail_url: "https://i.ytimg.com/vi/x/hqdefault.jpg" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    const html = `<html><head>
      <meta property="og:title" content="Stubbed page title" />
      <meta property="og:image" content="https://example.com/thumb.jpg" />
    </head><body>${"x".repeat(5000)}</body></html>`;
    return new Response(html, { status: 200, headers: { "Content-Type": "text/html" } });
  };
});
after(() => { globalThis.fetch = realFetch; });

function mkEnv(extra = {}) {
  return { DB: fakeD1(), NO_SEED: "1", ...extra };
}
function req(path, { method = "GET", body, cookie } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (cookie) headers.cookie = cookie;
  return new Request("https://reelroom.pages.dev" + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function call(env, path, opts) {
  const res = await handler(req(path, opts), env);
  let data = null;
  try { data = await res.clone().json(); } catch {}
  return { res, data };
}

test("health is public and reports ok", async () => {
  const { res, data } = await call(mkEnv(), "/api/health");
  assert.equal(res.status, 200);
  assert.equal(data.ok, true);
  assert.ok(data.time);
});

test("missing D1 binding gives a clear, actionable error", async () => {
  const { res, data } = await call({ NO_SEED: "1" }, "/api/items");
  assert.equal(res.status, 400);
  assert.match(data.error, /D1 binding named DB/);
});

test("password gate: 401 without cookie, 200 after login", async () => {
  const env = mkEnv({ REELROOM_PASSWORD: "letmein" });
  assert.equal((await call(env, "/api/me")).data.authenticated, false);
  assert.equal((await call(env, "/api/items")).res.status, 401);

  const bad = await call(env, "/api/login", { method: "POST", body: { password: "nope" } });
  assert.equal(bad.res.status, 401);

  const good = await call(env, "/api/login", { method: "POST", body: { password: "letmein" } });
  assert.equal(good.res.status, 200);
  const cookie = good.res.headers.get("Set-Cookie");
  assert.ok(cookie && cookie.includes("reelroom_auth="));
  assert.match(cookie, /Secure/, "https request must set a Secure cookie");

  const after = await call(env, "/api/items", { cookie });
  assert.equal(after.res.status, 200);
  assert.deepEqual(after.data, []);
  assert.equal((await call(env, "/api/me", { cookie })).data.authenticated, true);

  const out = await call(env, "/api/logout", { method: "POST", cookie });
  assert.match(out.res.headers.get("Set-Cookie"), /Max-Age=0/);
});

test("no password set -> items are open", async () => {
  const { res, data } = await call(mkEnv(), "/api/items");
  assert.equal(res.status, 200);
  assert.deepEqual(data, []);
});

test("add, list, patch and delete an item", async () => {
  const env = mkEnv();
  const add = await call(env, "/api/items", { method: "POST", body: { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" } });
  assert.equal(add.res.status, 201);
  assert.equal(add.data.duplicate, false);
  const id = add.data.item.id;
  assert.equal(add.data.item.platform, "youtube");

  // same URL again -> duplicate, not a second row
  const dup = await call(env, "/api/items", { method: "POST", body: { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" } });
  assert.equal(dup.data.duplicate, true);
  assert.equal((await call(env, "/api/items")).data.length, 1);

  const patch = await call(env, `/api/items/${id}`, { method: "PATCH", body: { title: "Renamed", favorite: true, progress: 0.5, watch_seconds: 42 } });
  assert.equal(patch.res.status, 200);
  assert.equal(patch.data.title, "Renamed");
  assert.equal(patch.data.progress, 0.5);
  assert.equal(patch.data.watch_seconds, 42);

  assert.equal((await call(env, `/api/items/${id}`, { method: "DELETE" })).res.status, 200);
  assert.equal((await call(env, `/api/items/${id}`, { method: "DELETE" })).res.status, 404);
});

test("PATCH clamps progress and rejects a bad timestamp", async () => {
  const env = mkEnv();
  const { data } = await call(env, "/api/items", { method: "POST", body: { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" } });
  const id = data.item.id;
  const hi = await call(env, `/api/items/${id}`, { method: "PATCH", body: { progress: 9, watch_seconds: -5 } });
  assert.equal(hi.data.progress, 1);
  assert.equal(hi.data.watch_seconds, 0);
  const bad = await call(env, `/api/items/${id}`, { method: "PATCH", body: { last_opened_at: "not-a-date" } });
  assert.equal(bad.res.status, 400);
  const ok = await call(env, `/api/items/${id}`, { method: "PATCH", body: { last_opened_at: "2026-11-05T09:00:00Z" } });
  assert.equal(ok.res.status, 200);
});

test("backup link is derived and can be cleared", async () => {
  const env = mkEnv();
  const { data } = await call(env, "/api/items", { method: "POST", body: { url: "https://www.facebook.com/reel/1126709309747313" } });
  const id = data.item.id;
  const set = await call(env, `/api/items/${id}`, { method: "PATCH", body: { backup_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" } });
  assert.equal(set.data.backup_platform, "youtube");
  assert.ok(set.data.backup_embed_url.includes("youtube-nocookie"));
  const clear = await call(env, `/api/items/${id}`, { method: "PATCH", body: { backup_url: "" } });
  assert.equal(clear.data.backup_url, null);
  assert.equal(clear.data.backup_embed_url, null);
});

test("bulk add dedupes and reports errors", async () => {
  const env = mkEnv();
  const { data } = await call(env, "/api/items/bulk", {
    method: "POST",
    body: { urls: "https://www.youtube.com/watch?v=dQw4w9WgXcQ\nhttps://www.youtube.com/watch?v=jNQXAC9IVRw\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ\nnot-a-url" },
  });
  assert.equal(data.added.length, 2);
  assert.equal(data.duplicates.length, 1);
  assert.equal(data.errors.length, 1);
});

test("export then import round-trips the library", async () => {
  const env = mkEnv();
  await call(env, "/api/items", { method: "POST", body: { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", tags: "mine" } });
  const exp = await handler(req("/api/export"), env);
  assert.equal(exp.status, 200);
  assert.match(exp.headers.get("Content-Disposition"), /reelroom-library\.json/);
  const items = await exp.json();
  assert.equal(items.length, 1);

  const fresh = mkEnv();
  const imp = await call(fresh, "/api/import", { method: "POST", body: items });
  assert.equal(imp.data.added, 1);
  const listed = (await call(fresh, "/api/items")).data;
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, items[0].id, "import preserves ids");
  assert.deepEqual(listed[0].tags, ["mine"]);
});

test("demo seeding can be cleared", async () => {
  const env = { DB: fakeD1() }; // no NO_SEED -> seeds 8 demo items
  assert.equal((await call(env, "/api/items")).data.length, 8);
  const del = await call(env, "/api/demo", { method: "DELETE" });
  assert.equal(del.data.deleted, 8);
  assert.equal((await call(env, "/api/items")).data.length, 0);
});

test("unknown route is 404 and bad input is 400", async () => {
  const env = mkEnv();
  assert.equal((await call(env, "/api/nope")).res.status, 404);
  assert.equal((await call(env, "/api/items", { method: "POST", body: {} })).res.status, 400);
});

test("instagram and tiktok URLs parse to the right embeds", async () => {
  const env = mkEnv();
  const ig = await call(env, "/api/items", { method: "POST", body: { url: "https://www.instagram.com/reel/DdG02dtFW19/" } });
  assert.equal(ig.data.item.platform, "instagram");
  assert.equal(ig.data.item.media_type, "reel");
  assert.ok(ig.data.item.embed_url.includes("/reel/DdG02dtFW19/embed"));
  const tt = await call(env, "/api/items", { method: "POST", body: { url: "https://www.tiktok.com/@someone/video/6718335390845095173" } });
  assert.equal(tt.data.item.platform, "tiktok");
  assert.ok(tt.data.item.embed_url.includes("player/v1/6718335390845095173"));
});
