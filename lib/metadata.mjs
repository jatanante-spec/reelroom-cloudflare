// Metadata fetching. Reads public link-preview tags and oEmbed only.
// Never downloads, proxies or re-hosts video files.
//
// Cloudflare's free plan allows 10ms of CPU per request, so we read only the
// head of each page instead of buffering half a megabyte of HTML and running
// regexes over all of it. The og: tags we need live in <head>, near the top.

import { isPrivateHost } from "./parse.mjs";

const OEMBED_UA = "Mozilla/5.0 (compatible; ReelRoom/1.0; +personal-link-library)";
// Facebook and Instagram only emit og: preview tags to link-preview crawlers.
// This is the same mechanism chat apps use to unfurl a pasted link.
const PREVIEW_UA = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";

const REFRESH_AFTER_MS = 7 * 24 * 60 * 60 * 1000; // preview image URLs are signed and expire

// Read at most maxBytes of the response body, then stop. Keeps both memory
// and regex CPU bounded on the Workers free tier.
const HEAD_BYTES = 192 * 1024;

// v38: a post's caption is shown in full in the player, so it is kept whole.
const POST_TEXT_MAX = 4000;

// How many redirects we follow by hand. Each hop is checked, so a link that
// tries to walk us into a private network is stopped on the way.
const MAX_REDIRECTS = 5;

async function readCapped(resp, maxBytes) {
  if (!resp.body) {
    const t = await resp.text();
    return t.length > maxBytes ? t.slice(0, maxBytes) : t;
  }
  const reader = resp.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    try { await reader.cancel(); } catch {}
  }
  const buf = new Uint8Array(Math.min(total, maxBytes));
  let off = 0;
  for (const c of chunks) {
    const take = Math.min(c.byteLength, buf.byteLength - off);
    if (take <= 0) break;
    buf.set(c.subarray(0, take), off);
    off += take;
  }
  return new TextDecoder("utf-8").decode(buf);
}

// A redirect may only lead to a public web address. Anything else — a file,
// a private network, the cloud metadata address — is refused.
export function safeRedirectTarget(location, base) {
  let next;
  try { next = new URL(location, base); } catch { return null; }
  if (!/^https?:$/.test(next.protocol)) return null;
  if (isPrivateHost(next.hostname)) return null;
  return next.toString();
}

// Fetch a page by hand: every redirect hop is checked before it is followed.
// Returns the text, the URL we finally landed on, and the response headers.
export async function fetchPage(url, ua, timeoutMs = 12000, maxBytes = HEAD_BYTES, accept = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8") {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let target = String(url);
    let hops = 0;
    for (;;) {
      let u;
      try { u = new URL(target); } catch { throw new Error("Not a valid address"); }
      if (!/^https?:$/.test(u.protocol)) throw new Error("Not a web address");
      if (isPrivateHost(u.hostname)) throw new Error("That address is not public");
      const resp = await fetch(u.toString(), {
        signal: controller.signal,
        redirect: "manual",
        headers: { "User-Agent": ua, "Accept": accept, "Accept-Language": "en-US,en;q=0.9" },
      });
      const status = resp.status;
      const location = resp.headers.get("location");
      if (status >= 300 && status < 400 && location) {
        try { if (resp.body) await resp.body.cancel(); } catch {}
        if (++hops > MAX_REDIRECTS) throw new Error("Too many redirects");
        const next = safeRedirectTarget(location, u.toString());
        if (!next) throw new Error("That redirect does not lead to a public page");
        target = next;
        continue;
      }
      if (!resp.ok) throw new Error(`HTTP ${status}`);
      const text = await readCapped(resp, maxBytes);
      return { text, url: u.toString(), headers: resp.headers };
    }
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url) {
  const { text } = await fetchPage(url, OEMBED_UA, 9000, HEAD_BYTES, "application/json");
  return JSON.parse(text);
}

function decodeEntities(str) {
  return String(str)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
}

function safeCodePoint(n) {
  if (!Number.isFinite(n) || n < 0 || n > 0x10ffff) return "";
  try { return String.fromCodePoint(n); } catch { return ""; }
}

function metaContent(html, prop) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*>`, "i");
  const tag = html.match(re);
  if (!tag) return null;
  const c = tag[0].match(/content=["']([\s\S]*?)["']/i);
  if (!c) return null;
  return decodeEntities(c[1]).replace(/\s+/g, " ").trim() || null;
}

function cleanFacebookTitle(raw) {
  if (!raw) return null;
  // Facebook prefixes captions with engagement counts, sometimes several:
  //   "64 reactions | actual caption"
  //   "218 reactions · 22 shares | actual caption"
  //   "1.2K views, 30 comments | actual caption"
  const metric = "[\\d.,\\sKMB]+(?:reactions?|views?|likes?|comments?|shares?|plays?)";
  const prefix = new RegExp(`^${metric}(?:\\s*[·•,]\\s*${metric})*\\s*\\|\\s*`, "i");
  let t = raw.replace(prefix, "").trim();
  if (!t || /^facebook$/i.test(t) || /^discover popular videos/i.test(t)) return null;
  return t;
}

function cleanInstagram(raw) {
  if (!raw) return { title: null, author: null };
  const m = raw.match(/^(.+?)\s+on Instagram:\s*([\s\S]*)$/i);
  if (!m) return { title: raw.slice(0, 300), author: null };
  let title = m[2].trim().replace(/^["'\u201c]+/, "").replace(/["'\u201d]+$/, "").trim();
  return { title: title ? title.slice(0, 300) : null, author: m[1].trim().slice(0, 200) };
}

// Can this site be shown inside an iframe? Most sites say no, and they say so
// in a header — so we ask once, at save time, instead of showing a blank box.
function canFrame(headers) {
  const xfo = String(headers.get("x-frame-options") || "").toLowerCase();
  if (xfo && xfo !== "allow") return false;
  const csp = String(headers.get("content-security-policy") || "");
  const fa = csp.match(/frame-ancestors([^;]*)/i);
  if (fa && !/\*/.test(fa[1])) return false;
  return true;
}

// v37: read a saved website — its title, and whether it may be framed.
async function fetchWebPage(url) {
  const stamp = new Date().toISOString();
  let u;
  try { u = new URL(url); } catch { return { metadata_fetched_at: stamp, metadata_status: "error", web_frameable: false }; }
  if (!/^https?:$/.test(u.protocol) || isPrivateHost(u.hostname)) {
    return { metadata_fetched_at: stamp, metadata_status: "error", web_frameable: false };
  }
  try {
    const page = await fetchPage(u.toString(), OEMBED_UA, 12000, HEAD_BYTES);
    const html = page.text;
    const updates = { metadata_fetched_at: stamp, web_frameable: canFrame(page.headers) };
    const og = metaContent(html, "og:title") || metaContent(html, "twitter:title");
    const raw = og || (html.match(/<title[^>]*>([\s\S]{0,300}?)<\/title>/i) || [])[1];
    const title = raw ? decodeEntities(String(raw)).replace(/\s+/g, " ").trim().slice(0, 300) : null;
    // bot walls ("Just a moment…") are not the page title
    if (title && !/^just a moment/i.test(title) && !/^access denied/i.test(title)) updates.title = title;
    const desc = metaContent(html, "description") || metaContent(html, "og:description");
    if (desc) updates.web_description = desc.slice(0, 300);
    updates.metadata_status = updates.title ? "ok" : "error";
    return updates;
  } catch {
    return { metadata_fetched_at: stamp, metadata_status: "error", web_frameable: false };
  }
}

// ---------------------------------------------------------------------------
// v38: the caption of a Facebook post
//
// Facebook's link preview cuts a post's caption short (about 200 characters).
// The whole caption is on the post itself — in the page Facebook's own post
// plugin shows. The plugin only shows it when it is given the canonical
// /posts/... link of the post, so a share link has to be resolved first.
// ---------------------------------------------------------------------------

// The link Facebook's post plugin can read: the canonical /posts/... path of
// one post. A share link (…/share/…) has to be resolved before this works,
// and a link that lands on the login page keeps the real post in "next".
export function facebookPostHref(url) {
  let u;
  try { u = new URL(String(url)); } catch { return null; }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (host !== "facebook.com" && !host.endsWith(".facebook.com")) return null;

  // the login page hides the real post in its "next" parameter
  const next = u.searchParams.get("next");
  if (next) {
    let inner;
    try { inner = new URL(next, u); } catch { inner = null; }
    if (inner && inner.hostname.toLowerCase().replace(/^www\./, "").endsWith("facebook.com")) {
      const href = facebookPostHref(inner.toString());
      if (href) return href;
    }
  }

  const path = u.pathname || "/";
  const m = path.match(/^\/([^/]+)\/posts\/(\d+)/);
  if (m) return `https://www.facebook.com/${m[1]}/posts/${m[2]}/`;

  // a story link carries the post id in the address itself
  const story = u.searchParams.get("story_fbid");
  if (story && /^\d+$/.test(story)) {
    const owner = String(u.searchParams.get("id") || u.searchParams.get("post_id") || "").split("_")[0];
    if (/^\d+$/.test(owner)) return `https://www.facebook.com/${owner}/posts/${story}/`;
    return `https://www.facebook.com/permalink.php?story_fbid=${story}`;
  }

  return null;
}

// Reads the text out of the box Facebook puts a post's caption in.
export function extractPostMessage(html) {
  const start = html.search(/data-testid="post_message"/i);
  if (start < 0) return null;
  const tagEnd = html.indexOf(">", start);
  if (tagEnd < 0) return null;
  let depth = 1;
  let i = tagEnd + 1;
  const limit = Math.min(html.length, tagEnd + 80000);
  while (i < limit) {
    const next = html.indexOf("<", i);
    if (next < 0) break;
    if (html.startsWith("</div", next)) {
      depth--;
      if (depth === 0) return html.slice(tagEnd + 1, next);
      i = next + 6;
      continue;
    }
    if (html.startsWith("<div", next)) { depth++; i = next + 4; continue; }
    i = next + 1;
  }
  return null;
}

function cleanPostText(inner) {
  let t = inner;
  // Facebook splits a long caption into a shown part and a hidden part, with
  // a "See more" link between them. The shown part is the whole caption.
  t = t.replace(/<span class="text_exposed_hide">[\s\S]*?<\/span>/gi, "");
  t = t.replace(/<span class="text_exposed_show">/gi, "");
  t = t.replace(/<span class="text_exposed_link">[\s\S]*?<\/span>/gi, "");
  t = t.replace(/<br\s*\/?>/gi, "\n");
  t = t.replace(/<[^>]+>/g, "");
  t = decodeEntities(t);
  t = t.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return t;
}

// Use only a substantial photo in the embed, never the author's avatar or logo.
// Facebook supplies signed CDN links; no image is downloaded or stored here.
export function extractPostImage(html) {
  let best = null, area = 0;
  for (const match of String(html).matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    const attr = (name) => tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1];
    const width = Number(attr("width")), height = Number(attr("height"));
    if (width < 120 || height < 120 || !Number.isFinite(width * height)) continue;
    const src = decodeEntities(attr("src") || "");
    let u;
    try { u = new URL(src); } catch { continue; }
    if (u.protocol !== "https:" || !u.hostname.toLowerCase().endsWith(".fbcdn.net")) continue;
    if (width * height > area && src.length <= 2000) { best = src; area = width * height; }
  }
  return best;
}

// Caption and photo are read together from Facebook's post plugin.
async function fetchPostPluginText(href, needText) {
  const url = "https://www.facebook.com/plugins/post.php?" +
    new URLSearchParams({ href, show_text: "true" });
  let html;
  // The regular ReelRoom UA gets direct CDN images here; Facebook's crawler
  // UA can instead yield lookaside links that serve an HTML error.
  try { ({ text: html } = await fetchPage(url, OEMBED_UA, 12000, HEAD_BYTES)); } catch { return null; }
  const inner = needText ? extractPostMessage(html) : null;
  return { text: inner ? cleanPostText(inner) : null, image: extractPostImage(html) };
}

// The caption of a Facebook post, from the post itself. Returns null when
// Facebook does not show the post to us (a private group, a removed post).
async function fetchFacebookPostCaption(item, resolved) {
  if (item.platform !== "facebook") return null;
  if (!["post", "image"].includes(item.media_type)) return null;
  const hrefs = [];
  const add = (h) => { if (h && !hrefs.includes(h)) hrefs.push(h); };
  for (const u of [item.canonical_url, item.url, ...(resolved || [])]) {
    if (!u) continue;
    add(facebookPostHref(u));
  }
  const found = { text: null, image: null };
  for (const href of hrefs) {
    const result = await fetchPostPluginText(href, !item.post_text_fetched);
    if (!result) continue;
    found.text ||= result.text;
    found.image ||= result.image;
    if (found.image && (item.post_text_fetched || found.text)) break;
  }
  return found;
}

// Read the public og: preview tags for a Facebook / Instagram link.
async function fetchLinkPreview(item) {
  const candidates = [];
  const canonical = item.canonical_url || item.url;
  if (canonical) candidates.push(canonical);
  // v38: a share link may be the only link that still names the post.
  if (item.url && item.url !== canonical) candidates.push(item.url);
  if (item.platform === "facebook" && item.external_id && !/\/reel\//.test(canonical || "")) {
    candidates.push(`https://www.facebook.com/reel/${item.external_id}`);
  }

  const updates = {};
  const resolved = [];
  let answered = false;

  for (const url of candidates) {
    let page;
    try { page = await fetchPage(url, PREVIEW_UA); } catch { continue; }
    answered = true;
    if (page.url) resolved.push(page.url);
    const html = page.text;
    const image = metaContent(html, "og:image") || metaContent(html, "twitter:image");
    const rawTitle = metaContent(html, "og:title");
    // the caption of a post lives in the link preview, outside the picture
    const rawDesc = metaContent(html, "og:description") || metaContent(html, "description");
    if (!image && !rawTitle && !rawDesc) continue;
    if (image && /^https:\/\//i.test(image)) updates.thumbnail_url = image.slice(0, 2000);
    if (item.platform === "instagram") {
      const { title, author } = cleanInstagram(rawTitle);
      if (title) updates.title = title;
      if (author) updates.author = author;
    } else {
      const title = cleanFacebookTitle(rawTitle);
      if (title) updates.title = title.slice(0, 300);
    }
    // the preview text is the fallback caption — Facebook cuts it short
    if (rawDesc) {
      const text = decodeEntities(rawDesc).replace(/\s+/g, " ").trim();
      if (text) updates.post_text = text.slice(0, POST_TEXT_MAX);
    }
    if (updates.thumbnail_url || updates.title || updates.post_text || updates.author) break;
  }
  return { updates, resolved, answered };
}

export async function fetchMetadata(item) {
  const stamp = new Date().toISOString();
  const base = { metadata_fetched_at: stamp };
  const platform = item.platform;
  const canonical = item.canonical_url;

  if (platform === "web") {
    // v37: a saved website — its real title, and whether it may be framed.
    const updates = await fetchWebPage(canonical);
    return { ...base, ...updates, metadata_fetched_at: updates.metadata_fetched_at || stamp };
  }

  if (platform === "facebook" || platform === "instagram") {
    // Instagram's public preview image is a stable redirect; prefer it when we have no image yet.
    const { updates, resolved, answered } = await fetchLinkPreview(item);
    // A previously captured full caption must not be replaced by a preview.
    if (item.post_text_fetched && item.post_text) delete updates.post_text;
    // v38: the whole caption of a post, when Facebook shows it to us.
    const full = await fetchFacebookPostCaption(item, resolved);
    if (full?.text) updates.post_text = full.text.slice(0, POST_TEXT_MAX);
    if (platform === "facebook" && ["post", "image"].includes(item.media_type)) {
      // Preserve a custom thumbnail. Replace Facebook's unreliable lookaside
      // previews and refresh our own signed CDN images when metadata is stale.
      let oldHost = "";
      try { oldHost = new URL(item.thumbnail_url || "").hostname.toLowerCase(); } catch {}
      if (full?.image && (!item.thumbnail_url || oldHost === "lookaside.fbsbx.com" || item.post_image_source === "plugin")) {
        updates.thumbnail_url = full.image;
        updates.post_image_source = "plugin";
      } else if (item.thumbnail_url && oldHost !== "lookaside.fbsbx.com") {
        // Do not let a generic link-preview image overwrite a working/custom photo.
        delete updates.thumbnail_url;
      } else if (!full?.image && updates.thumbnail_url) {
        // The lookaside endpoint often returns an HTML error rather than a photo.
        try { if (new URL(updates.thumbnail_url).hostname.toLowerCase() === "lookaside.fbsbx.com") delete updates.thumbnail_url; } catch {}
      }
      // One migration attempt for older posts, even if Facebook withholds them.
      updates.post_image_checked = true;
    }
    // fetched once, so a post without a caption is never looked up again
    if (answered) updates.post_text_fetched = true;
    if (!updates.thumbnail_url && platform === "instagram") {
      const m = String(canonical || "").match(/instagram\.com\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
      if (m) updates.thumbnail_url = `https://www.instagram.com/${m[1]}/${m[2]}/media/?size=l`;
    }
    if (item.thumbnail_custom) delete updates.thumbnail_url;
    const ok = Boolean(updates.thumbnail_url || updates.title || updates.post_text);
    return { ...base, ...updates, metadata_status: ok ? "ok" : "error" };
  }

  let endpoint;
  if (platform === "youtube") {
    endpoint = "https://www.youtube.com/oembed?" + new URLSearchParams({ url: canonical, format: "json" });
  } else if (platform === "tiktok") {
    endpoint = "https://www.tiktok.com/oembed?" + new URLSearchParams({ url: canonical });
  } else {
    return { ...base, metadata_status: "manual" };
  }

  try {
    const data = await fetchJson(endpoint);
    const updates = { ...base, metadata_status: "ok" };
    if (data.title) updates.title = String(data.title).slice(0, 300);
    if (data.author_name) updates.author = String(data.author_name).slice(0, 200);
    if (data.thumbnail_url) updates.thumbnail_url = String(data.thumbnail_url).slice(0, 2000);
    if (!updates.thumbnail_url && platform === "youtube" && item.external_id) {
      updates.thumbnail_url = `https://i.ytimg.com/vi/${item.external_id}/hqdefault.jpg`;
    }
    return updates;
  } catch {
    const updates = { ...base, metadata_status: "error" };
    if (platform === "youtube" && item.external_id) {
      updates.thumbnail_url = `https://i.ytimg.com/vi/${item.external_id}/hqdefault.jpg`;
    }
    return updates;
  }
}

export function needsRefresh(item) {
  if (!item) return false;
  if (item.metadata_status === "pending") return true;
  if (!["youtube", "tiktok", "instagram", "facebook", "web"].includes(item.platform)) return false;
  if (item.platform === "facebook" && ["post", "image"].includes(item.media_type) && !item.post_image_checked) return true;
  // v38: a post still needs its caption fetched
  if ((item.media_type === "post" || item.media_type === "image") && !item.post_text_fetched) return true;
  if (!item.metadata_fetched_at) return true;
  const at = Date.parse(item.metadata_fetched_at);
  if (!Number.isFinite(at)) return true;
  return Date.now() - at > REFRESH_AFTER_MS;
}

// Only one refresh may run at a time. Two browser tabs asking for a refresh
// must not fetch the same post's caption twice.
let refreshRunning = null;

// Refresh a batch. Returns { refreshed, remaining }.
export async function refreshPending(repo, limit = 4) {
  if (refreshRunning) return refreshRunning;
  refreshRunning = (async () => {
    const items = await repo.list();
    const queue = items.filter(needsRefresh).slice(0, limit);
    if (queue.length === 0) return { refreshed: 0, remaining: 0 };

    // Small concurrency so we stay polite to the source sites.
    const results = [];
    const CONCURRENCY = 4;
    for (let i = 0; i < queue.length; i += CONCURRENCY) {
      const slice = queue.slice(i, i + CONCURRENCY);
      const settled = await Promise.all(slice.map(async (item) => {
        try {
          return [item.id, await fetchMetadata(item)];
        } catch {
          return [item.id, { metadata_status: "error", metadata_fetched_at: new Date().toISOString() }];
        }
      }));
      results.push(...settled);
    }

    // v38: a caption that is already stored is never overwritten by a fetch
    // that came back empty, and a caption that was fetched in the meantime is
    // left alone.
    const fresh = await repo.list();
    const byId = new Map(fresh.map((i) => [i.id, i]));
    const safe = {};
    for (const [id, upd] of results) {
      const current = byId.get(id);
      if (!current) continue;
      const merged = { ...upd };
      // a caption we already have is never replaced by a shorter one (the
      // link preview cuts a caption short, the post itself does not)
      if (current.post_text && (!merged.post_text || current.post_text.length >= merged.post_text.length)) {
        delete merged.post_text;
      }
      safe[id] = merged;
    }

    await repo.updateMany(safe);
    const after = await repo.list();
    return { refreshed: queue.length, remaining: after.filter(needsRefresh).length };
  })();
  try {
    return await refreshRunning;
  } finally {
    refreshRunning = null;
  }
}

// Facebook CDN image addresses have an `oe` expiry timestamp. Refresh only
// signed Facebook video images, without touching titles, captions or videos.
// Legacy signed CDN images are treated as automatic unless explicitly marked
// custom; future user-picked thumbnails are marked custom by the API.
export function facebookThumbnailDueAt(item) {
  if (!item || item.platform !== "facebook" || ["post", "image", "page"].includes(item.media_type) || item.thumbnail_custom) return null;
  try {
    const u = new URL(item.thumbnail_url || "");
    const h = u.hostname.toLowerCase();
    if (u.protocol !== "https:" || !(h === "fbcdn.net" || h.endsWith(".fbcdn.net"))) return null;
    const oe = u.searchParams.get("oe");
    if (!oe || !/^[0-9a-f]{6,12}$/i.test(oe)) return null;
    const expiry = parseInt(oe, 16) * 1000;
    const lastAttempt = Date.parse(item.thumbnail_refresh_attempt_at || "") || 0;
    return Math.max(expiry - 24 * 3600000, lastAttempt + 12 * 3600000);
  } catch { return null; }
}
let thumbRefreshRunning = null;
export async function refreshExpiringFacebookThumbnails(repo, limit = 4) {
  if (thumbRefreshRunning) return thumbRefreshRunning;
  thumbRefreshRunning = (async () => {
    const all = await repo.list(), nowMs = Date.now();
    const queue = all.filter(i => { const due = facebookThumbnailDueAt(i); return due !== null && due <= nowMs; }).slice(0, Math.min(4, Math.max(1, limit)));
    const results = await Promise.all(queue.map(async item => {
      let image = null;
      try { image = (await fetchLinkPreview(item)).updates.thumbnail_url || null; } catch {}
      const updates = {thumbnail_refresh_attempt_at: new Date().toISOString()};
      // Reject lookaside/login pictures and already-expired signed links.
      if (image) {
        try {
          const u = new URL(image), h = u.hostname.toLowerCase(), oe = u.searchParams.get("oe") || "";
          if (u.protocol === "https:" && (h === "fbcdn.net" || h.endsWith(".fbcdn.net")) && /^[0-9a-f]{6,12}$/i.test(oe) && parseInt(oe, 16) * 1000 > Date.now() + 3600000) updates.thumbnail_url = image;
        } catch {}
      }
      return repo.updateThumbnailIfUnchanged(item.id, item.thumbnail_url, updates);
    }));
    const after = await repo.list();
    return {attempted: queue.length, updated: results.filter(Boolean).length, remaining: after.filter(i => { const due = facebookThumbnailDueAt(i); return due !== null && due <= Date.now(); }).length};
  })();
  try { return await thumbRefreshRunning; } finally { thumbRefreshRunning = null; }
}
