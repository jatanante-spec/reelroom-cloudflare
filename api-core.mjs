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

async function readBody(req) {
  try {
    return await req.json();
  } catch {
    return null;
  }
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
      const body = await readBody(req);
      if (!passwordRequired(env)) return json({ ok: true, required: false });
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

    if (path === "/api/items" && method === "GET") {
      return json(await db.list());
    }

    if (path === "/api/items" && method === "POST") {
      const body = await readBody(req);
      if (!body?.url) return json({ error: "URL is required" }, 400);
      const parsed = await parseUrl(body.url);
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
      const lines = (Array.isArray(raw) ? raw.map(String) : String(raw).split(/\r?\n/))
        .map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).slice(0, MAX_BULK);
      const added = [], duplicates = [], errors = [];
      const toInsert = [];
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
      const result = await db.insertMany(toInsert);
      added.push(...result.added);
      duplicates.push(...result.duplicates);
      return json({ added, duplicates, errors });
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
      const toInsert = [], errors = [];
      const seen = new Set();
      for (const entry of body.slice(0, MAX_ITEMS)) {
        if (!entry || typeof entry !== "object" || !entry.url) { errors.push({ url: String(entry), error: "Missing url" }); continue; }
        try {
          const parsed = await parseUrl(entry.url);
          if (seen.has(parsed.canonical_url)) continue;
          seen.add(parsed.canonical_url);
          const item = normalizeItemInput(entry, parsed, env);
          // Preserve user data from the export when present.
          if (entry.id) item.id = String(entry.id);
          if (entry.created_at) item.created_at = String(entry.created_at);
          if (typeof entry.watched === "boolean") item.watched = entry.watched;
          if (typeof entry.favorite === "boolean") item.favorite = entry.favorite;
          item.metadata_status = entry.metadata_status === "ok" ? "ok" : item.metadata_status;
          toInsert.push(item);
        } catch (e) {
          errors.push({ url: entry.url, error: e.message });
        }
      }
      const result = await db.insertMany(toInsert);
      return json({ added: result.added.length, duplicates: result.duplicates.length, errors });
    }

    return json({ error: "Not found" }, 404);
  } catch (e) {
    return json({ error: e.message || "Server error" }, 400);
  }
}
