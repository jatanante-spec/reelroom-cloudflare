// v37: save any link.
//  * any website is accepted and stored as a link, not as a video;
//  * the page title is read when the site allows it;
//  * the site says whether it may be shown in a frame — no blank boxes;
//  * a link card is a globe, not a play button, and the player steps over it;
//  * opening a link marks it as visited.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseUrl, isPrivateHost } from "../lib/parse.mjs";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, "public", p), "utf8");
const html = read("index.html");
const appjs = read("app.js");
const css = read("styles.css");
const meta = readFileSync(join(root, "lib", "metadata.mjs"), "utf8");
const api = readFileSync(join(root, "lib", "api-core.mjs"), "utf8");

test("the app says v37", () => {
  assert.match(appjs, /const REELROOM_VERSION = "v37";/);
});

test("a website is saved as a link, not as a video", async () => {
  const p = await parseUrl("https://www.bbc.co.uk/news/world-12345");
  assert.equal(p.platform, "web");
  assert.equal(p.media_type, "page");
  assert.equal(p.embed_url, null, "a website has nothing to embed");
  assert.equal(p.title, "bbc.co.uk", "the site name is the fallback title");
  assert.match(p.canonical_url, /^https:\/\/www\.bbc\.co\.uk\/news\/world-12345$/);
});

test("only real web addresses are accepted", async () => {
  await assert.rejects(() => parseUrl("not-a-url"), /doesn't look like a web address/);
  await assert.rejects(() => parseUrl("file:///etc/passwd"), /Only web links/);
  await assert.rejects(() => parseUrl("javascript:alert(1)"), /Only web links/);
  await assert.rejects(() => parseUrl("http://localhost:3000/x"), /private address/);
});

test("private and local addresses are never fetched", () => {
  assert.equal(isPrivateHost("127.0.0.1"), true);
  assert.equal(isPrivateHost("10.0.0.5"), true);
  assert.equal(isPrivateHost("192.168.1.1"), true);
  assert.equal(isPrivateHost("169.254.169.254"), true);   // cloud metadata
  assert.equal(isPrivateHost("metadata.google.internal"), true);
  assert.equal(isPrivateHost("::1"), true);
  assert.equal(isPrivateHost("example.com"), false);
});

test("the page title is read, and the frame check is done, in one visit", () => {
  assert.match(meta, /async function fetchWebPage\(url\)/);
  assert.match(meta, /og:title/);
  assert.match(meta, /function canFrame\(resp\)/);
  assert.match(meta, /x-frame-options/);
  assert.match(meta, /frame-ancestors/);
  // only the head of the page is read, never the whole thing
  assert.match(meta, /readCapped\(resp, HEAD_BYTES\)/);
  // and private addresses are refused before anything is fetched
  assert.match(meta, /isPrivateHost\(u\.hostname\)/);
});

test("a saved link is stored with its title and its frame answer", () => {
  assert.match(api, /parsed\.platform === "web"/);
  assert.match(meta, /platform === "web"/);
  assert.match(meta, /web_frameable/);
  assert.match(meta, /web_description/);
});

test("a link can be marked as visited", () => {
  assert.match(api, /"visited"/);
  assert.match(api, /key === "visited"/);
  assert.match(api, /visited: Boolean\(data\.visited\)/);
});

test("a link card is a globe, not a play button", () => {
  assert.match(appjs, /function isLinkItem\(item\)/);
  const fn = appjs.slice(appjs.indexOf("function thumbHtml(item)"));
  assert.match(fn.slice(0, 900), /thumb-web/);
  assert.match(fn.slice(0, 900), /web-globe/);
  assert.match(css, /\.thumb-web/);
  assert.match(css, /\.badge\.web/);
});

test("tapping a link opens the link sheet, never the player", () => {
  assert.match(html, /id="linkModal"/);
  assert.match(html, /id="linkFrame"/);
  assert.match(html, /id="linkOpenBtn"/);
  assert.match(html, /id="linkCopyBtn"/);
  assert.match(appjs, /function openLink\(id\)/);
  assert.match(appjs, /if \(isLinkItem\(tapped\)\) \{ openLink\(id\); return; \}/);
  assert.match(appjs, /if \(isLinkItem\(kd\)\) openLink\(id\); else openPlayer\(id\);/);
});

test("a site that refuses to be framed opens in the browser instead", () => {
  const fn = appjs.slice(appjs.indexOf("function openLink(id)"));
  assert.match(fn.slice(0, 1600), /item\.web_frameable === true/);
  assert.match(fn.slice(0, 1600), /does not allow pages to be shown inside apps/);
  assert.match(fn.slice(0, 1600), /window\.open\(url, "_blank", "noopener"\)/);
  // the preview is only shown when the site allows it
  assert.match(fn.slice(0, 1600), /wrap\.hidden = !frameable;/);
});

test("opening a link marks it as visited", () => {
  assert.match(appjs, /async function markVisited\(item\)/);
  assert.match(appjs, /method: "PATCH", body: \{ visited: true \}/);
  const fn = appjs.slice(appjs.indexOf("function openLink(id)"));
  assert.match(fn.slice(0, 1600), /markVisited\(item\)/);
});

test("the video player steps over links", () => {
  const fn = appjs.slice(appjs.indexOf("function stepPlayer(delta)"));
  assert.match(fn.slice(0, 600), /while \(next >= 0 && next < list\.length && isLinkItem\(list\[next\]\)\) next \+= delta;/);
  const up = appjs.slice(appjs.indexOf("function renderUpNext"));
  assert.match(up.slice(0, 600), /filter\(\(i\) => !isLinkItem\(i\)\)/);
});

test("links are not videos, so they stay out of the unwatched list", () => {
  const fn = appjs.slice(appjs.indexOf("function filtered()"));
  assert.match(fn.slice(0, 700), /!i\.watched && !isLinkItem\(i\)/);
});

test("the app knows about websites everywhere", () => {
  assert.match(appjs, /web: "Website"/);
  assert.match(appjs, /page: "Page"/);
  assert.match(appjs, /return "web";/);
  assert.match(html, /data-platform="web">Web</);
  assert.match(html, /data-platform="web"><span class="plat-dot web"><\/span> Websites/);
  assert.match(html, /<option value="page">Page<\/option>/);
  assert.match(css, /\.plat-dot\.web/);
});

test("v37: a Facebook share link is never stored as Facebook's login page", async () => {
  // a share link that resolves to /login/ keeps the share link
  const parse = readFileSync(join(root, "lib", "parse.mjs"), "utf8");
  assert.match(parse, /if \(\/\^\\\/\(login\|checkpoint\|consent\|privacy\|home\\\.php\)\/i\.test\(path\)\)/);
  assert.ok(parse.includes("canonical_url: shareUrl.slice(0, 2000)"), "the share link is not kept");
  // and the app prefers the share link over the login page
  assert.ok(appjs.includes("function bestUrl(item)"), "bestUrl is missing");
  assert.ok(appjs.includes("/login/i.test(canonical)"), "the login-page check is missing in the app");
});
