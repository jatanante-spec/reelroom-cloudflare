import { test } from "node:test";
import assert from "node:assert/strict";
import { parseUrl } from "../lib/parse.mjs";

test("youtube watch", async () => {
  const p = await parseUrl("https://www.youtube.com/watch?v=jNQXAC9IVRw");
  assert.equal(p.platform, "youtube");
  assert.equal(p.external_id, "jNQXAC9IVRw");
  assert.match(p.embed_url, /youtube-nocookie\.com\/embed\/jNQXAC9IVRw/);
});

test("youtube short link", async () => {
  const p = await parseUrl("https://youtu.be/jNQXAC9IVRw?t=10");
  assert.equal(p.external_id, "jNQXAC9IVRw");
});

test("youtube shorts", async () => {
  const p = await parseUrl("https://www.youtube.com/shorts/abc123def45");
  assert.equal(p.media_type, "short");
});

test("tiktok video", async () => {
  const p = await parseUrl("https://www.tiktok.com/@user/video/6718335390845095173");
  assert.equal(p.platform, "tiktok");
  assert.equal(p.media_type, "video");
  assert.match(p.embed_url, /player\/v1\/6718335390845095173/);
});

test("tiktok photo", async () => {
  const p = await parseUrl("https://www.tiktok.com/@user/photo/6718335390845095173");
  assert.equal(p.media_type, "image");
});

test("instagram post", async () => {
  const p = await parseUrl("https://www.instagram.com/p/B7hAEQ7l3y5/");
  assert.equal(p.platform, "instagram");
  assert.equal(p.media_type, "post");
  assert.match(p.embed_url, /\/p\/B7hAEQ7l3y5\/embed\//);
});

test("instagram reel", async () => {
  const p = await parseUrl("https://www.instagram.com/reel/Cabc123/");
  assert.equal(p.media_type, "reel");
});

test("facebook watch", async () => {
  const p = await parseUrl("https://www.facebook.com/watch?v=695595847675337");
  assert.equal(p.platform, "facebook");
  assert.equal(p.media_type, "video");
  assert.match(p.embed_url, /plugins\/video\.php/);
});

test("facebook page video", async () => {
  const p = await parseUrl("https://www.facebook.com/NASA/videos/695595847675337/");
  assert.equal(p.media_type, "video");
  assert.equal(p.external_id, "695595847675337");
});

test("facebook reel", async () => {
  const p = await parseUrl("https://www.facebook.com/reel/123456789");
  assert.equal(p.media_type, "reel");
  assert.match(p.embed_url, /plugins\/post\.php/);
  assert.match(p.embed_url_alt, /plugins\/video\.php/);
});

test("unsupported", async () => {
  await assert.rejects(() => parseUrl("https://example.com/video"), /Unsupported/);
});

test("missing scheme", async () => {
  const p = await parseUrl("youtube.com/watch?v=jNQXAC9IVRw");
  assert.equal(p.platform, "youtube");
});

// --- Facebook title cleanup (metadata.mjs) -------------------------------
// Exercised through fetchMetadata's og path with a stubbed page response.
import { fetchMetadata } from "../lib/metadata.mjs";

async function titleFromOg(og) {
  const real = globalThis.fetch;
  globalThis.fetch = async () => new Response(
    `<html><head><meta property="og:title" content="${og}"><meta property="og:image" content="https://example.com/t.jpg"></head></html>`,
    { status: 200, headers: { "Content-Type": "text/html" } },
  );
  try {
    const out = await fetchMetadata({
      platform: "facebook", media_type: "reel",
      canonical_url: "https://www.facebook.com/reel/1126709309747313",
      external_id: "1126709309747313",
    });
    return out.title;
  } finally { globalThis.fetch = real; }
}

test("facebook title: single metric prefix is stripped", async () => {
  assert.equal(await titleFromOg("64 reactions | actual caption"), "actual caption");
});

test("facebook title: two metrics separated by a middot are stripped", async () => {
  assert.equal(await titleFromOg("218 reactions · 22 shares | In 1948, Neville Goddard"), "In 1948, Neville Goddard");
});

test("facebook title: comma-separated metrics and K suffix are stripped", async () => {
  assert.equal(await titleFromOg("1.2K views, 30 comments | Hello there"), "Hello there");
});

test("facebook title: a real caption containing a pipe is preserved", async () => {
  assert.equal(await titleFromOg("My caption | part two"), "My caption | part two");
});

test("facebook title: generic placeholder emits no title update", async () => {
  // cleanFacebookTitle returns null, so fetchLinkPreview omits the key entirely
  // rather than overwriting a good manual title with a placeholder.
  assert.equal(await titleFromOg("Facebook"), undefined);
});
