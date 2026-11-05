// Metadata fetching. Reads public link-preview tags and oEmbed only.
// Never downloads, proxies or re-hosts video files.
//
// Cloudflare's free plan allows 10ms of CPU per request, so we read only the
// head of each page instead of buffering half a megabyte of HTML and running
// regexes over all of it. The og: tags we need live in <head>, near the top.

const OEMBED_UA = "Mozilla/5.0 (compatible; ReelRoom/1.0; +personal-link-library)";
// Facebook and Instagram only emit og: preview tags to link-preview crawlers.
// This is the same mechanism chat apps use to unfurl a pasted link.
const PREVIEW_UA = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";

const REFRESH_AFTER_MS = 7 * 24 * 60 * 60 * 1000; // preview image URLs are signed and expire

// Read at most maxBytes of the response body, then stop. Keeps both memory
// and regex CPU bounded on the Workers free tier.
const HEAD_BYTES = 192 * 1024;

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

async function fetchWithTimeout(url, ua, timeoutMs = 12000, maxBytes = HEAD_BYTES) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": ua, "Accept-Language": "en-US,en;q=0.9" },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await readCapped(resp, maxBytes);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url) {
  const text = await fetchWithTimeout(url, OEMBED_UA, 9000);
  return JSON.parse(text);
}

function decodeEntities(str) {
  return String(str)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
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

// Read the public og: preview tags for a Facebook / Instagram link.
async function fetchLinkPreview(item) {
  const candidates = [];
  const canonical = item.canonical_url || item.url;
  if (canonical) candidates.push(canonical);
  if (item.platform === "facebook" && item.external_id && !/\/reel\//.test(canonical || "")) {
    candidates.push(`https://www.facebook.com/reel/${item.external_id}`);
  }
  for (const url of candidates) {
    let html;
    try {
      html = await fetchWithTimeout(url, PREVIEW_UA);
    } catch { continue; }
    const image = metaContent(html, "og:image") || metaContent(html, "twitter:image");
    const rawTitle = metaContent(html, "og:title");
    if (!image && !rawTitle) continue;

    const updates = {};
    if (image && /^https:\/\//i.test(image)) updates.thumbnail_url = image.slice(0, 2000);
    if (item.platform === "instagram") {
      const { title, author } = cleanInstagram(rawTitle);
      if (title) updates.title = title;
      if (author) updates.author = author;
    } else {
      const title = cleanFacebookTitle(rawTitle);
      if (title) updates.title = title.slice(0, 300);
    }
    if (updates.thumbnail_url || updates.title) return updates;
  }
  return {};
}

export async function fetchMetadata(item) {
  const stamp = new Date().toISOString();
  const base = { metadata_fetched_at: stamp };
  const platform = item.platform;
  const canonical = item.canonical_url;

  if (platform === "facebook" || platform === "instagram") {
    // Instagram's public preview image is a stable redirect; prefer it when we have no image yet.
    const updates = await fetchLinkPreview(item);
    if (!updates.thumbnail_url && platform === "instagram") {
      const m = String(canonical || "").match(/instagram\.com\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
      if (m) updates.thumbnail_url = `https://www.instagram.com/${m[1]}/${m[2]}/media/?size=l`;
    }
    const ok = Boolean(updates.thumbnail_url || updates.title);
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
  if (!["youtube", "tiktok", "instagram", "facebook"].includes(item.platform)) return false;
  if (!item.metadata_fetched_at) return true;
  const at = Date.parse(item.metadata_fetched_at);
  if (!Number.isFinite(at)) return true;
  return Date.now() - at > REFRESH_AFTER_MS;
}

// Refresh a batch. Returns { refreshed, remaining }.
export async function refreshPending(repo, limit = 4) {
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

  await repo.updateMany(Object.fromEntries(results));
  const after = await repo.list();
  return { refreshed: queue.length, remaining: after.filter(needsRefresh).length };
}
