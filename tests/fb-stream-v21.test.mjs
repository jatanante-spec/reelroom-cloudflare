// v21: Facebook-hosted stream upgrade with regular iframe fallback.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { extractFacebookStream, handler } from "../lib/api-core.mjs";
import { fakeD1 } from "./helpers.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appjs = readFileSync(join(root, "public", "app.js"), "utf8");

test("extractFacebookStream unescapes JSON and only accepts https fbcdn URLs", () => {
  const html = '{"sd_src":"https:\\/\\/video-sea5-1.xx.fbcdn.net\\/v\\/x.mp4?oe=abc&oh=def"}';
  const got = extractFacebookStream(html);
  assert.equal(got.quality, "sd");
  assert.equal(got.url, "https://video-sea5-1.xx.fbcdn.net/v/x.mp4?oe=abc&oh=def");
  assert.equal(extractFacebookStream('{"sd_src":"https:\\/\\/evil.com\\/x.mp4"}'), null);
  assert.equal(extractFacebookStream('{"sd_src":"javascript:alert(1)"}'), null);
  assert.equal(extractFacebookStream('{"hd_src":null,"playable_url":"https:\\/\\/video.xx.fbcdn.net\\/y.mp4"}').quality, "sd");
});

test("frontend keeps the iframe fallback and only upgrades Facebook video/reel items", () => {
  assert.match(appjs, /const REELROOM_VERSION = "v\d+";/);
  assert.match(appjs, /fbNativeVideo: null/);
  assert.match(appjs, /fbStreamFailed: new Set\(\)/);
  assert.match(appjs, /tryFacebookStreamUpgrade\(item, state\.fbStreamSeq, prepared\);/);
  assert.match(appjs, /item\.media_type === "video" \|\| item\.media_type === "reel"/);
  assert.match(appjs, /!embed\.includes\("\/plugins\/post\.php"\)/);
  assert.match(appjs, /api\(`\/api\/items\/\$\{item\.id\}\/stream`\)/);
});

test("native Facebook video is muted, inline, autoplaying, and reports playback", () => {
  assert.match(appjs, /function mountFacebookNativeVideo\(item, url, seq, preparedVideo = null\)/);
  assert.match(appjs, /video\.muted = true;/);
  assert.match(appjs, /video\.autoplay = true;/);
  assert.match(appjs, /video\.playsInline = true;/);
  assert.match(appjs, /video\.setAttribute\("playsinline", ""\);/);
  assert.match(appjs, /video\.addEventListener\("ended", \(\) => \{ bridge\.playerState = 0; sync\(\); handleEnded\(\); \}\);/);
  assert.match(appjs, /function reportsProgress\(platform\) \{ return platform === "youtube" \|\| platform === "tiktok" \|\| \(platform === "facebook" && !!state\.fbNativeVideo\); \}/);
});

test("stream failure returns to the regular Facebook iframe without retry loops", () => {
  assert.match(appjs, /function fallbackFacebookIframe\(item, seq\)/);
  assert.match(appjs, /state\.fbStreamFailed\.add\(item\.id\);/);
  assert.match(appjs, /renderPlayer\(item\);/);
  assert.match(appjs, /Facebook stream unavailable — using the regular Facebook player\./);
  assert.match(appjs, /function fallbackFacebookIframe\(item, seq\)/);
  assert.match(appjs, /if \(fallbackUrl && !video\.dataset\.fbSmallTried\) \{/);
});

function mkEnv(extra = {}) { return { DB: fakeD1(), NO_SEED: "1", ...extra }; }
function req(path, { method = "GET", cookie } = {}) {
  return new Request("https://reelroom.pages.dev" + path, { method, headers: cookie ? { cookie } : {} });
}
async function call(env, path, opts) {
  const res = await handler(req(path, opts), env);
  let data = null; try { data = await res.clone().json(); } catch {}
  return { res, data };
}

test("stream endpoint requires auth, validates the item, and never proxies video bytes", async () => {
  const env = mkEnv({ REELROOM_PASSWORD: "letmein" });
  assert.equal((await call(env, "/api/items/abc/stream")).res.status, 401);

  const login = await handler(new Request("https://reelroom.pages.dev/api/login", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "letmein" }),
  }), env);
  const cookie = login.headers.get("Set-Cookie");

  const add = await handler(new Request("https://reelroom.pages.dev/api/items", {
    method: "POST", headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ url: "https://www.facebook.com/NASA/videos/695595847675337/" }),
  }), env);
  const item = (await add.json()).item;

  const realFetch = globalThis.fetch;
  let seenUrl = "";
  globalThis.fetch = async (url) => {
    seenUrl = String(url);
    return new Response('{"sd_src":"https:\\/\\/video.xx.fbcdn.net\\/x.mp4"}', { status: 200, headers: { "Content-Type": "text/html" } });
  };
  try {
    const ok = await call(env, `/api/items/${item.id}/stream`, { cookie });
    assert.equal(ok.res.status, 200);
    assert.equal(ok.data.ok, true);
    assert.equal(ok.data.stream_url, "https://video.xx.fbcdn.net/x.mp4");
    assert.equal(ok.data.source, "facebook-cdn");
    assert.match(seenUrl, /^https:\/\/www\.facebook\.com\/video\/embed\?video_id=695595847675337$/);
    assert.equal(ok.res.headers.get("Cache-Control"), "no-store");
  } finally {
    globalThis.fetch = realFetch;
  }

  const missing = await call(env, "/api/items/does-not-exist/stream", { cookie });
  assert.equal(missing.res.status, 404);
});

test("stream endpoint returns ok:false when Facebook exposes no usable stream", async () => {
  const env = mkEnv();
  const add = await handler(new Request("https://reelroom.pages.dev/api/items", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: "https://www.facebook.com/NASA/videos/695595847675337/" }),
  }), env);
  const item = (await add.json()).item;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("<html>login wall</html>", { status: 200 });
  try {
    const out = await call(env, `/api/items/${item.id}/stream`);
    assert.equal(out.res.status, 200);
    assert.equal(out.data.ok, false);
    assert.equal(out.data.reason, "no-stream");
  } finally {
    globalThis.fetch = realFetch;
  }
});
