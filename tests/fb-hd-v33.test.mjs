// v33: Facebook videos play Facebook's own sharp file (720p) instead of the
// small one (240p/360p) that the old key order always picked first.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { extractFacebookStream, facebookStreamResolution, handler } from "../lib/api-core.mjs";
import { fakeD1 } from "./helpers.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appjs = readFileSync(join(root, "public", "app.js"), "utf8");

// Build a Facebook-style rendition URL the way Facebook signs them.
function fbUrl(host, path, tag, bitrate) {
  const efg = Buffer.from(JSON.stringify({ vencode_tag: tag }), "utf8").toString("base64");
  return `https://${host}/${path}?_nc_ht=${host}&efg=${encodeURIComponent(efg)}&bitrate=${bitrate}&tag=x`;
}
const SD_URL = fbUrl("video-sea5-1.xx.fbcdn.net", "v/sd.mp4", "xpv_progressive.FACEBOOK..C3.360.dash_baseline_3_v1", 324712);
const HD_URL = fbUrl("video-sea5-2.xx.fbcdn.net", "v/hd.mp4", "xpv_progressive.FACEBOOK..C3.720.dash_baseline_1_v1", 1212843);
const TINY_URL = fbUrl("video-sea5-1.xx.fbcdn.net", "v/tiny.mp4", "xpv_progressive.FACEBOOK..C3.240.sve_sd", 84794);
const html = (obj) => JSON.stringify(obj);

test("the resolution is read from Facebook's signed rendition tag", () => {
  assert.equal(facebookStreamResolution(SD_URL), 360);
  assert.equal(facebookStreamResolution(HD_URL), 720);
  assert.equal(facebookStreamResolution(TINY_URL), 240);
  assert.equal(facebookStreamResolution("https://video.xx.fbcdn.net/x.mp4"), 0);
});

test("the sharp file is chosen even when the small one is listed first", () => {
  const got = extractFacebookStream(html({ sd_src: SD_URL, hd_src: HD_URL }));
  assert.equal(got.url, HD_URL);
  assert.equal(got.quality, "hd");
  assert.equal(got.resolution, 720);
  // The small file is kept as a safety net, not thrown away.
  assert.equal(got.fallback_url, SD_URL);
  assert.equal(got.fallback_resolution, 360);
});

test("a 720p file beats a 240p file no matter which key carried it", () => {
  const got = extractFacebookStream(html({ sd_src: TINY_URL, playable_url: HD_URL }));
  assert.equal(got.url, HD_URL);
  assert.equal(got.resolution, 720);
});

test("when Facebook publishes no sharp file the small one is still used", () => {
  const got = extractFacebookStream(html({ sd_src: SD_URL }));
  assert.equal(got.url, SD_URL);
  assert.equal(got.quality, "sd");
  assert.equal(got.resolution, 360);
  assert.equal(got.fallback_url, null);
});

test("nothing off fbcdn is ever handed back", () => {
  assert.equal(extractFacebookStream(html({ hd_src: "https://evil.com/x.mp4" })), null);
  assert.equal(extractFacebookStream(html({ hd_src: "javascript:alert(1)" })), null);
  assert.equal(extractFacebookStream(html({ hd_src: null })), null);
});

test("the frontend plays the sharp file and keeps the small one as a safety net", () => {
  assert.match(appjs, /const REELROOM_VERSION = "v38";/);
  assert.match(appjs, /function mountFacebookNativeVideo\(item, url, seq, preparedVideo = null\)/);
  assert.match(appjs, /state\.fbSmallUrl = data && data\.fallback_url \? safeUrl\(data\.fallback_url\) : "";/);
  assert.match(appjs, /const fallbackUrl = state\.fbSmallUrl \|\| "";/);
  assert.match(appjs, /state\.fbResolution = data && data\.resolution \? Number\(data\.resolution\) : 0;/);
  assert.match(appjs, /video\.dataset\.fbSmallTried = "1";/);
  assert.match(appjs, /if \(fallbackUrl && !video\.dataset\.fbSmallTried\) \{/);
  assert.match(appjs, /video\.src = fallbackUrl;/);
  // The regular Facebook player is still the last resort.
  assert.match(appjs, /function fallbackFacebookIframe\(item, seq\)/);
  assert.match(appjs, /Facebook stream unavailable — using the regular Facebook player\./);
});

test("a slow connection drops to the small file instead of a black screen", () => {
  assert.match(appjs, /if \(!fallbackUrl \|\| video\.dataset\.fbSmallTried\) return;/);
  assert.match(appjs, /const startWatch = setTimeout\(\(\) => \{/);
  assert.match(appjs, /started = true; clearTimeout\(startWatch\);/);
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

test("the stream endpoint reports the sharp file and the safety net", async () => {
  const env = mkEnv();
  const add = await handler(new Request("https://reelroom.pages.dev/api/items", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: "https://www.facebook.com/NASA/videos/695595847675337/" }),
  }), env);
  const item = (await add.json()).item;

  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(html({ sd_src: SD_URL, hd_src: HD_URL }), { status: 200, headers: { "Content-Type": "text/html" } });
  try {
    const out = await call(env, `/api/items/${item.id}/stream`);
    assert.equal(out.res.status, 200);
    assert.equal(out.data.ok, true);
    assert.equal(out.data.stream_url, HD_URL);
    assert.equal(out.data.quality, "hd");
    assert.equal(out.data.resolution, 720);
    assert.equal(out.data.fallback_url, SD_URL);
    assert.equal(out.data.source, "facebook-cdn");
  } finally {
    globalThis.fetch = realFetch;
  }
});
