// v38: the caption of a Facebook / Instagram post.
// Facebook's post embed shows the picture but leaves the caption outside the
// picture, so ReelRoom reads the caption from the post itself and shows it
// itself — the full text in the player, a short snippet on the card.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { facebookPostHref, extractPostMessage } from "../lib/metadata.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, "public", p), "utf8");
const html = read("index.html");
const appjs = read("app.js");
const css = read("styles.css");
const meta = readFileSync(join(root, "lib", "metadata.mjs"), "utf8");

test("the app says v38", () => {
  assert.match(appjs, /const REELROOM_VERSION = "v38";/);
});

test("the whole caption is read from the post itself", () => {
  // the link preview only shows about 200 characters, so the post plugin is
  // the source of the caption
  assert.match(meta, /plugins\/post\.php/);
  assert.match(meta, /show_text/);
  assert.match(meta, /data-testid="post_message"/);
  assert.match(meta, /fetchPostPluginText/);
  assert.match(meta, /cleanPostText/);
  // and the link preview stays as the fallback
  assert.match(meta, /metaContent\(html, "og:description"\)/);
  assert.match(meta, /updates\.post_text = text\.slice\(0, POST_TEXT_MAX\)/);
  assert.match(meta, /updates\.post_text_fetched = true/);
});

test("a share link is turned into the link the post plugin can read", () => {
  assert.equal(
    facebookPostHref("https://www.facebook.com/100047126350934/posts/1675888873991975/"),
    "https://www.facebook.com/100047126350934/posts/1675888873991975/"
  );
  // a share link itself is not enough — it has to be resolved first
  assert.equal(facebookPostHref("https://www.facebook.com/share/1ESJAvTQ1k/"), null);
  // a login page keeps the real post in its "next" parameter
  assert.equal(
    facebookPostHref("https://www.facebook.com/login/?next=" +
      encodeURIComponent("https://www.facebook.com/story.php?story_fbid=2056203935291167&id=100027047427020")),
    "https://www.facebook.com/100027047427020/posts/2056203935291167/"
  );
  // a group post is left alone — Facebook does not show those to us
  assert.equal(facebookPostHref("https://www.facebook.com/groups/592990996063141/permalink/1529284012433830/"), null);
  // and another site is never treated as a Facebook post
  assert.equal(facebookPostHref("https://example.com/posts/1234/"), null);
});

test("the caption is read out of the box Facebook puts it in", () => {
  const html = '<div data-testid="post_message"><div><span class="text_exposed_show">Hello</span>'
    + '<span class="text_exposed_hide">more</span></div></div><div>after</div>';
  const inner = extractPostMessage(html);
  assert.ok(inner, "the caption box was not found");
  assert.match(inner, /Hello/);
  assert.match(inner, /text_exposed_hide/);
  // the box ends where it ends — the text after it is not part of the caption
  assert.doesNotMatch(inner, /after/);
  assert.equal(extractPostMessage("<html><body>nothing here</body></html>"), null);
});

test("a post is looked up once for its caption, never over and over", () => {
  // server side
  assert.ok(meta.includes('(item.media_type === "post" || item.media_type === "image") && !item.post_text_fetched'), "the server rule is missing");
  // client side
  const fn = appjs.slice(appjs.indexOf("function needsMeta(item)"));
  assert.ok(fn.slice(0, 900).includes('!item.post_text_fetched'), "the client rule is missing");
  // and two refreshes cannot run at the same time
  assert.match(meta, /let refreshRunning = null/);
});

test("a picture post is not a video to play", () => {
  assert.match(appjs, /function isPostItem\(item\)/);
  const fn = appjs.slice(appjs.indexOf("function thumbHtml(item)"));
  assert.ok(fn.slice(0, 2200).includes("isPostItem(item)"), "the post rule is missing from the card");
  assert.ok(fn.slice(0, 2200).includes('${post ? "" :'), "a post still gets a play button");
});

test("the player shows the caption above the post", () => {
  assert.match(html, /id="playerPostText"/);
  const fn = appjs.slice(appjs.indexOf("function renderPlayer(item)"));
  assert.ok(fn.slice(0, 1200).includes("item.post_text"), "the player does not read the caption");
  assert.ok(fn.slice(0, 1200).includes("postText.hidden = !txt"), "the caption panel is not shown/hidden");
  assert.match(css, /\.player-post-text/);
});

test("the caption sits above the control bar, not over it", () => {
  // the height of the control bar is measured and the caption is placed above it
  assert.match(appjs, /function syncCaptionLayout\(\)/);
  assert.match(appjs, /--fs-bottom/);
  assert.match(appjs, /--caption-h/);
  assert.match(css, /bottom: var\(--fs-bottom, 0px\)/);
});

test("the card shows a short snippet of the caption", () => {
  const fn = appjs.slice(appjs.indexOf('class="card-body"'));
  assert.ok(fn.slice(0, 1200).includes("card-snippet"), "the card has no snippet");
  assert.match(css, /\.card-snippet/);
});

test("the caption is readable text, not an unselectable blob", () => {
  assert.match(css, /-webkit-user-select: text; user-select: text;/);
});
