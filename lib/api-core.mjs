// ReelRoom API core — all /api/* routes, runtime-agnostic.
// The Cloudflare Pages entry point in functions/api/[[path]].mjs calls this.
// Env comes from the Pages bindings (env.DB, env.REELROOM_PASSWORD, ...).
import { parseUrl } from "./parse.mjs";
import { makeRepo, d1Adapter, cleanTags, now } from "./store.mjs";
import { fetchMetadata, refreshPending } from "./metadata.mjs";
import {
  passwordRequired, checkPassword, makeCookie, clearCookie,
  isSecureRequest, isAuthenticated,
} from "./auth.mjs";

const MAX_ITEMS = 2000;
const MAX_BULK = 500;

// v21: Facebook-hosted stream extraction. Reads only a capped public embed page
// and returns the signed fbcdn MP4 URL. Video bytes are never proxied or stored.
const FB_STREAM_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const FB_STREAM_EMBED_BYTES = 192 * 1024;
const FB_STREAM_PLUGIN_BYTES = 224 * 1024;
const FB_STREAM_KEYS = [
  ["sd_src", "sd"], ["hd_src", "hd"],
  ["browser_native_sd_url", "sd"], ["playable_url", "sd"],
  ["browser_native_hd_url", "hd"], ["playable_url_quality_hd", "hd"],
];

export function extractFacebookStream(html) {
  // One pass over the capped HTML keeps CPU bounded on the Workers free tier.
  const keys = new Map(FB_STREAM_KEYS);
  const re = /"(sd_src|hd_src|browser_native_sd_url|playable_url|browser_native_hd_url|playable_url_quality_hd)"\s*:\s*"((?:\\.|[^"\\])*)"/g;
  const found = new Map();
  const text = String(html || "");
  let m;
  while ((m = re.exec(text)) !== null) {
    if (!keys.has(m[1]) || found.has(m[1])) continue;
    let url;
    try { url = JSON.parse('"' + m[2] + '"'); } catch { continue; }
    if (/^https:\/\/[A-Za-z0-9.-]+\.fbcdn\.net\//i.test(url)) found.set(m[1], url);
  }
  for (const [key, quality] of FB_STREAM_KEYS) {
    const url = found.get(key);
    if (url) return { url, quality };
  }
  return null;
}

async function readCappedBody(resp, maxBytes) {
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

async function fetchFacebookPage(url, maxBytes) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": FB_STREAM_UA, "Accept-Language": "en-US,en;q=0.9" },
    });
    if (!resp.ok) return { error: "http-" + resp.status };
    return { html: await readCappedBody(resp, maxBytes) };
  } catch {
    return { error: "fetch-failed" };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFacebookStream(item) {
  if (item.platform !== "facebook") return { ok: false, reason: "not-facebook" };
  if (!["video", "reel"].includes(item.media_type)) return { ok: false, reason: "not-video" };
  const canonical = String(item.canonical_url || item.url || "");
  let id = /^\d{1,30}$/.test(String(item.external_id || "")) ? String(item.external_id) : "";
  if (!id) {
    const m = canonical.match(/\/reel\/(\d{1,30})/) || canonical.match(/\/videos\/(?:[^/]+\/)?(\d{1,30})/) || canonical.match(/[?&]v=(\d{1,30})/);
    if (m) id = m[1];
  }

  // The legacy embed page is smaller and usually has the media keys early.
  if (id) {
    const page = await fetchFacebookPage("https://www.facebook.com/video/embed?video_id=" + encodeURIComponent(id), FB_STREAM_EMBED_BYTES);
    const stream = page.html ? extractFacebookStream(page.html) : null;
    if (stream) return { ok: true, stream_url: stream.url, quality: stream.quality, source: "facebook-cdn" };
  }

  // Some videos only expose the stream in the official plugin page. Its media
  // keys sit a little deeper, so allow a slightly larger capped read.
  if (/^https:\/\/www\.facebook\.com\//.test(canonical)) {
    const plugin = "https://www.facebook.com/plugins/video.php?href=" + encodeURIComponent(canonical) + "&show_text=false&autoplay=true";
    const page = await fetchFacebookPage(plugin, FB_STREAM_PLUGIN_BYTES);
    const stream = page.html ? extractFacebookStream(page.html) : null;
    if (stream) return { ok: true, stream_url: stream.url, quality: stream.quality, source: "facebook-cdn" };
    return { ok: false, reason: page.error || "no-stream" };
  }
  return { ok: false, reason: id ? "no-stream" : "no-video-id" };
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extraHeaders },
  });
}

function repo(env) {
  if (!env?.DB) throw new Error("Database not connected. Add a D1 binding named DB in the Pages project settings.");
  return makeRepo(d1Adapter(env.DB), { noSeed: Boolean(env.NO_SEED) });
}

function normalizeItemInput(data, parsed, env) {
  const stamp = now();
  const wantsFetch = parsed.platform === "youtube" || parsed.platform === "tiktok" ||
    (parsed.platform === "instagram" && Boolean(env?.META_OEMBED_TOKEN));
  const item = {
    id: crypto.randomUUID(),
    url: String(data.url || "").trim().slice(0, 2000),
    ...parsed,
    title: data.title ? String(data.title).slice(0, 300) : parsed.title,
    author: data.author ? String(data.author).slice(0, 200) : null,
    tags: cleanTags(data.tags),
    collection: String(data.collection || "").trim().slice(0, 80),
    notes: String(data.notes || "").trim().slice(0, 2000),
    favorite: Boolean(data.favorite),
    watched: Boolean(data.watched),
    progress: 0,
    watch_seconds: 0,
    last_opened_at: null,
    demo: false,
    metadata_status: wantsFetch ? "pending" : "manual",
    created_at: stamp,
    updated_at: stamp,
  };
  if (data.thumbnail_url) item.thumbnail_url = String(data.thumbnail_url).slice(0, 2000);
  return item;
}

async function readBody(req, maxBytes = 5_000_000) {
  try {
    const text = await req.text();
    if (text.length > maxBytes) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// v32: best-effort per-isolate login rate limit (10 tries / 15 min / IP).
const loginAttempts = new Map();
function loginRateLimited(req) {
  const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "local";
  const now = Date.now();
  let rec = loginAttempts.get(ip);
  if (!rec || now > rec.reset) { rec = { count: 0, reset: now + 15 * 60 * 1000 }; }
  rec.count++;
  loginAttempts.set(ip, rec);
  if (loginAttempts.size > 1000) loginAttempts.clear();
  return rec.count > 10;
}

export async function handler(req, env) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = req.method.toUpperCase();
  const secure = isSecureRequest(req);

  try {
    // ---- public endpoints ----
    if (path === "/api/health") return json({ ok: true, time: now() });

    if (path === "/api/login" && method === "POST") {
      if (loginRateLimited(req)) return json({ error: "Too many attempts. Try again in 15 minutes." }, 429);
      const raw = await req.text();
      if (raw.length > 4096) return json({ error: "Invalid password" }, 400);
      let body = null; try { body = JSON.parse(raw); } catch {}
      if (!passwordRequired(env)) return json({ ok: true, required: false });
      if (typeof body?.password === "string" && body.password.length > 200) return json({ error: "Invalid password" }, 400);
      if (!checkPassword(body?.password, env)) return json({ error: "Incorrect password" }, 401);
      return json({ ok: true }, 200, { "Set-Cookie": await makeCookie(env, secure) });
    }

    if (path === "/api/logout" && method === "POST") {
      return json({ ok: true }, 200, { "Set-Cookie": clearCookie(secure) });
    }

    if (path === "/api/me") {
      return json({ required: passwordRequired(env), authenticated: await isAuthenticated(req, env) });
    }

    // ---- everything below requires auth (when a password is set) ----
    if (!(await isAuthenticated(req, env))) return json({ error: "Authentication required" }, 401);

    const db = repo(env);

    const streamMatch = path.match(/^\/api\/items\/([A-Za-z0-9-]+)\/stream$/);
    if (streamMatch && method === "GET") {
      const items = await db.list();
      const item = items.find((i) => i.id === streamMatch[1]);
      if (!item) return json({ error: "Not found" }, 404);
      return json(await fetchFacebookStream(item));
    }

    if (path === "/api/items" && method === "GET") {
      return json(await db.list());
    }

    if (path === "/api/items" && method === "POST") {
      const body = await readBody(req);
      if (!body?.url) return json({ error: "URL is required" }, 400);
      let parsed;
      try { parsed = await parseUrl(body.url); } catch (e) { return json({ error: e.message }, 400); }
      const existing = await db.findByCanonical(parsed.canonical_url);
      if (existing) return json({ item: existing, duplicate: true }, 200);
      const count = (await db.list()).length;
      if (count >= MAX_ITEMS) return json({ error: `Library is full (max ${MAX_ITEMS} items)` }, 400);
      const item = normalizeItemInput(body, parsed, env);
      // Fetch metadata for single adds so the card is complete right away.
      if (item.metadata_status === "pending") {
        Object.assign(item, await fetchMetadata(item));
      }
      const result = await db.insert(item);
      return json(result, result.duplicate ? 200 : 201);
    }

    if (path === "/api/items/bulk" && method === "POST") {
      const body = await readBody(req);
      const raw = body?.urls ?? body?.text ?? "";
      const allLines = (Array.isArray(raw) ? raw.map(String) : String(raw).split(/\r?\n/))
        .map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
      const truncated = Math.max(0, allLines.length - MAX_BULK);
      const lines = allLines.slice(0, MAX_BULK);
      const added = [], duplicates = [], errors = [];
      let toInsert = [];
      const seen = new Set();
      for (const line of lines) {
        try {
          const parsed = await parseUrl(line);
          if (seen.has(parsed.canonical_url)) { duplicates.push({ url: line }); continue; }
          seen.add(parsed.canonical_url);
          toInsert.push(normalizeItemInput({ url: line, tags: body?.tags, collection: body?.collection }, parsed, env));
        } catch (e) {
          errors.push({ url: line, error: e.message });
        }
      }
      const remaining = Math.max(0, MAX_ITEMS - (await db.list()).length);
      let skippedFull = 0;
      if (toInsert.length > remaining) { skippedFull = toInsert.length - remaining; toInsert = toInsert.slice(0, remaining); }
      const result = await db.insertMany(toInsert);
      added.push(...result.added);
      duplicates.push(...result.duplicates);
      const warnings = [];
      if (truncated) warnings.push(`Only the first ${MAX_BULK} links were processed; ${truncated} more were ignored.`);
      if (skippedFull) warnings.push(`Library is full (max ${MAX_ITEMS}); ${skippedFull} links were not added.`);
      return json({ added, duplicates, errors, warnings });
    }

    if (path === "/api/refresh-pending" && method === "POST") {
      return json(await refreshPending(db, 4));
    }

    const itemMatch = path.match(/^\/api\/items\/([A-Za-z0-9-]+)(\/refresh)?$/);
    if (itemMatch) {
      const id = itemMatch[1];
      const isRefresh = Boolean(itemMatch[2]);
      if (isRefresh && method === "POST") {
        const items = await db.list();
        const item = items.find((i) => i.id === id);
        if (!item) return json({ error: "Not found" }, 404);
        const updates = await fetchMetadata(item);
        const updated = await db.update(id, updates);
        return json(updated);
      }
      if (method === "PATCH") {
        const body = await readBody(req);
        if (!body) return json({ error: "Invalid JSON" }, 400);
        const allowed = ["title", "author", "thumbnail_url", "tags", "collection", "notes", "favorite", "watched", "media_type", "progress", "watch_seconds", "last_opened_at"];
        const updates = {};
        for (const key of allowed) {
          if (!(key in body)) continue;
          let v = body[key];
          if (key === "tags") v = cleanTags(v);
          else if (key === "collection") v = String(v).trim().slice(0, 80);
          else if (key === "notes") v = String(v).trim().slice(0, 2000);
          else if (key === "title") v = String(v).trim().slice(0, 300);
          else if (key === "author") v = String(v).trim().slice(0, 200);
          else if (key === "thumbnail_url") v = v ? String(v).slice(0, 2000) : null;
          else if (key === "media_type") {
            if (!["video", "short", "reel", "image", "post"].includes(v)) return json({ error: "Invalid media_type" }, 400);
          } else if (key === "progress") {
            const n = Number(v);
            v = Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
          } else if (key === "watch_seconds") {
            const n = Number(v);
            v = Number.isFinite(n) ? Math.min(600000, Math.max(0, Math.round(n))) : 0;
          } else if (key === "last_opened_at") {
            if (!v) { v = null; }
            else {
              const d = new Date(String(v));
              if (!Number.isFinite(d.getTime())) return json({ error: "Invalid last_opened_at" }, 400);
              v = d.toISOString();
            }
          } else if (key === "favorite" || key === "watched") v = Boolean(v);
          updates[key] = v;
        }
        if ("backup_url" in body) {
          const raw = String(body.backup_url || "").trim();
          if (!raw) {
            updates.backup_url = null;
            updates.backup_canonical_url = null;
            updates.backup_platform = null;
            updates.backup_media_type = null;
            updates.backup_embed_url = null;
          } else {
            let bp;
            try {
              bp = await parseUrl(raw);
            } catch (err) {
              return json({ error: "Backup link: " + (err && err.message ? err.message : "unsupported") }, 400);
            }
            updates.backup_url = raw.slice(0, 2000);
            updates.backup_canonical_url = bp.canonical_url;
            updates.backup_platform = bp.platform;
            updates.backup_media_type = bp.media_type;
            updates.backup_embed_url = bp.embed_url;
          }
        }
        const updated = await db.update(id, updates);
        if (!updated) return json({ error: "Not found" }, 404);
        return json(updated);
      }
      if (method === "DELETE") {
        const ok = await db.remove(id);
        if (!ok) return json({ error: "Not found" }, 404);
        return json({ ok: true });
      }
    }

    if (path === "/api/demo" && method === "DELETE") {
      return json({ deleted: await db.clearDemo() });
    }

    if (path === "/api/export" && method === "GET") {
      const items = await db.list();
      return new Response(JSON.stringify(items, null, 2), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": "attachment; filename=reelroom-library.json",
          "Cache-Control": "no-store",
        },
      });
    }

    if (path === "/api/import" && method === "POST") {
      let body = await readBody(req);
      if (body && !Array.isArray(body) && Array.isArray(body.items)) body = body.items;
      if (!Array.isArray(body)) return json({ error: "Expected a JSON array of items" }, 400);
      let toInsert = []; const errors = [];
      const seen = new Set();
      const truncated = Math.max(0, body.length - MAX_ITEMS);
      const existingItems = await db.list();
      const existingIds = new Set(existingItems.map((i) => i.id));
      for (const entry of body.slice(0, MAX_ITEMS)) {
        if (!entry || typeof entry !== "object" || !entry.url) { errors.push({ url: String(entry), error: "Missing url" }); continue; }
        try {
          const parsed = await parseUrl(entry.url);
          if (seen.has(parsed.canonical_url)) continue;
          seen.add(parsed.canonical_url);
          const item = normalizeItemInput(entry, parsed, env);
          // Preserve user data from the export when present.
          // v32: repair ids to the URL-safe character set so every imported video
          // can still be edited / deleted; fall back to a fresh id on collision.
          if (entry.id) {
            let id = String(entry.id).replace(/[^A-Za-z0-9-]/g, "-").slice(0, 64);
            if (!id || existingIds.has(id)) id = crypto.randomUUID();
            item.id = id;
            existingIds.add(id);
          }
          if (entry.created_at) item.created_at = String(entry.created_at);
          if (typeof entry.watched === "boolean") item.watched = entry.watched;
          if (typeof entry.favorite === "boolean") item.favorite = entry.favorite;
          item.metadata_status = entry.metadata_status === "ok" ? "ok" : item.metadata_status;
          toInsert.push(item);
        } catch (e) {
          errors.push({ url: entry.url, error: e.message });
        }
      }
      const remaining = Math.max(0, MAX_ITEMS - existingItems.length);
      let skippedFull = 0;
      if (toInsert.length > remaining) { skippedFull = toInsert.length - remaining; toInsert = toInsert.slice(0, remaining); }
      const result = await db.insertMany(toInsert);
      const warnings = [];
      if (truncated) warnings.push(`Only the first ${MAX_ITEMS} items were processed; ${truncated} more were ignored.`);
      if (skippedFull) warnings.push(`Library is full (max ${MAX_ITEMS}); ${skippedFull} items were not added.`);
      return json({ added: result.added.length, duplicates: result.duplicates.length, errors, warnings });
    }

    return json({ error: "Not found" }, 404);
  } catch (e) {
    // v32: client mistakes are reported as 400 at their source; anything that
    // reaches here is unexpected (database/runtime) and is a 500.
    return json({ error: e.message || "Server error" }, 500);
  }
}
