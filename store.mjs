// Data layer for ReelRoom on Cloudflare D1.
// The whole library is stored as one JSON document in a single row, with a
// version column giving us compare-and-swap writes (safe read-modify-write
// even with concurrent requests). The storage backend is an adapter, so the
// library logic below is identical in production and in tests.
//
// Multi-user later: add a user_id column and key reads/writes by it. The
// repository interface below does not need to change.

export const LIBRARY_KEY = "library";
export const TABLE = "library";
const MAX_RETRIES = 25;

export function now() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function cleanTags(value) {
  if (value == null) return [];
  const arr = Array.isArray(value) ? value : String(value).split(/[,\n]/);
  const out = [];
  for (let t of arr) {
    t = String(t).trim().replace(/^#+/, "");
    if (t && !out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t.slice(0, 40));
    if (out.length >= 20) break;
  }
  return out;
}

const DEMO = [
  { url: "https://www.youtube.com/watch?v=jNQXAC9IVRw", title: "Me at the zoo", author: "jawed", tags: ["demo", "history"] },
  { url: "https://www.youtube.com/watch?v=h6fcK_fRYaI", title: "The Egg — A Short Story", author: "Kurzgesagt – In a Nutshell", tags: ["demo", "animation", "science"] },
  { url: "https://www.youtube.com/watch?v=OmJ-4B-mS-Y", title: "The Map of Mathematics", author: "Domain of Science", tags: ["demo", "math", "science"] },
  { url: "https://www.youtube.com/watch?v=fJ9rUzIMcZQ", title: "Queen – Bohemian Rhapsody (Official Video Remastered)", author: "Queen Official", tags: ["demo", "music"] },
  { url: "https://www.youtube.com/watch?v=9bZkp7q19f0", title: "PSY - GANGNAM STYLE M/V", author: "officialpsy", tags: ["demo", "music"] },
  { url: "https://www.tiktok.com/@scout2015/video/6718335390845095173", title: "TikTok demo video", author: "@scout2015", tags: ["demo"], platform: "tiktok", media_type: "video", external_id: "6718335390845095173" },
  { url: "https://www.instagram.com/p/B7hAEQ7l3y5/", title: "Earth from the ISS (NASA photo)", author: "@nasa", tags: ["demo", "space", "photo"], platform: "instagram", media_type: "post", external_id: "B7hAEQ7l3y5" },
  { url: "https://www.facebook.com/NASA/videos/695595847675337/", title: "Watch NASA and SpaceX Launch Astronauts to Space!", author: "NASA", tags: ["demo", "space"], platform: "facebook", media_type: "video", external_id: "695595847675337" },
];

function demoParsed(entry) {
  const u = new URL(entry.url);
  if (entry.platform === "youtube" || u.hostname.includes("youtube")) {
    const id = u.searchParams.get("v");
    return {
      platform: "youtube", media_type: "video", external_id: id,
      canonical_url: `https://www.youtube.com/watch?v=${id}`,
      embed_url: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`,
      thumbnail_url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    };
  }
  if (entry.platform === "tiktok") {
    return {
      platform: "tiktok", media_type: "video", external_id: entry.external_id,
      canonical_url: entry.url,
      embed_url: `https://www.tiktok.com/player/v1/${entry.external_id}?autoplay=1&music_info=1&description=1`,
      thumbnail_url: null,
    };
  }
  if (entry.platform === "instagram") {
    return {
      platform: "instagram", media_type: "post", external_id: entry.external_id,
      canonical_url: entry.url,
      embed_url: `https://www.instagram.com/p/${entry.external_id}/embed/captioned/`,
      thumbnail_url: null,
    };
  }
  return {
    platform: "facebook", media_type: "video", external_id: entry.external_id,
    canonical_url: entry.url,
    embed_url: "https://www.facebook.com/plugins/video.php?" + new URLSearchParams({ href: entry.url, show_text: "false", autoplay: "true", mute: "0" }),
    thumbnail_url: null,
  };
}

export function makeDemoLibrary() {
  const stamp = now();
  const items = DEMO.map((entry) => {
    const parsed = demoParsed(entry);
    return {
      id: crypto.randomUUID(),
      url: entry.url,
      ...parsed,
      title: entry.title,
      author: entry.author || null,
      tags: entry.tags || ["demo"],
      collection: "Demo",
      notes: "Demo item — clear the demo collection to start your own library.",
      favorite: false,
      watched: false,
      demo: true,
      metadata_status: parsed.platform === "youtube" ? "ok" : "manual",
      created_at: stamp,
      updated_at: stamp,
    };
  });
  return { version: 1, seeded: true, items };
}

export function emptyLibrary() {
  return { version: 1, seeded: true, items: [] };
}

// ---------------------------------------------------------------------------
// Storage adapters
// ---------------------------------------------------------------------------
// An adapter supplies two operations:
//   read()                     -> { data: object|null, version: number|null }
//   write(data, expectVersion) -> boolean  (true when the write landed)
// expectVersion === null means "only write if the row does not exist yet".

export function d1Adapter(db) {
  let ready = null;
  function init() {
    if (!ready) {
      ready = db
        .prepare(`CREATE TABLE IF NOT EXISTS ${TABLE} (id INTEGER PRIMARY KEY, data TEXT NOT NULL, version INTEGER NOT NULL)`)
        .run();
    }
    return ready;
  }
  return {
    async read() {
      await init();
      const row = await db.prepare(`SELECT data, version FROM ${TABLE} WHERE id = 1`).first();
      if (!row) return { data: null, version: null };
      return { data: JSON.parse(row.data), version: row.version };
    },
    async write(data, expectVersion) {
      await init();
      const json = JSON.stringify(data);
      if (expectVersion == null) {
        // Insert only if absent; INSERT OR IGNORE makes this atomic.
        const res = await db
          .prepare(`INSERT OR IGNORE INTO ${TABLE} (id, data, version) VALUES (1, ?, 1)`)
          .bind(json)
          .run();
        return (res?.meta?.changes ?? 0) > 0;
      }
      const res = await db
        .prepare(`UPDATE ${TABLE} SET data = ?, version = version + 1 WHERE id = 1 AND version = ?`)
        .bind(json, expectVersion)
        .run();
      return (res?.meta?.changes ?? 0) > 0;
    },
  };
}

// In-memory adapter with the same compare-and-swap semantics, for tests.
export function memoryAdapter() {
  let data = null;
  let version = null;
  return {
    async read() {
      return { data: data == null ? null : structuredClone(data), version };
    },
    async write(next, expectVersion) {
      if (expectVersion == null) {
        if (data != null) return false;
        data = structuredClone(next);
        version = 1;
        return true;
      }
      if (version !== expectVersion) return false;
      data = structuredClone(next);
      version = version + 1;
      return true;
    },
  };
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------
export function makeRepo(adapter, opts = {}) {
  const noSeed = Boolean(opts.noSeed);
  const blank = () => (noSeed ? emptyLibrary() : makeDemoLibrary());

  async function read() {
    return adapter.read();
  }

  async function ensureSeeded() {
    const { data } = await read();
    if (data) return data;
    const lib = blank();
    if (await adapter.write(lib, null)) return lib;
    const again = await read();
    return again.data || lib;
  }

  // Apply a mutation with optimistic concurrency control.
  // fn receives a mutable library object and returns the response payload.
  async function mutate(fn) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const { data, version } = await read();
      const base = data ? structuredClone(data) : blank();
      const result = await fn(base);
      if (await adapter.write(base, data ? version : null)) return result;
      // Someone else wrote first; back off briefly and retry with fresh data.
      await new Promise((r) => setTimeout(r, 5 + Math.random() * 25 * (attempt + 1)));
    }
    throw new Error("Could not save (too many concurrent writes). Please try again.");
  }

  return {
    read,
    ensureSeeded,
    mutate,

    async list() {
      const lib = await ensureSeeded();
      return lib.items.slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
    },

    async findByCanonical(canonical) {
      const lib = await ensureSeeded();
      return lib.items.find((i) => i.canonical_url === canonical) || null;
    },

    async insert(item) {
      return mutate((lib) => {
        const existing = lib.items.find((i) => i.canonical_url === item.canonical_url);
        if (existing) return { item: existing, duplicate: true };
        lib.items.push(item);
        return { item, duplicate: false };
      });
    },

    async insertMany(items) {
      return mutate((lib) => {
        const added = [], duplicates = [];
        for (const item of items) {
          const existing = lib.items.find((i) => i.canonical_url === item.canonical_url);
          if (existing) duplicates.push(existing);
          else { lib.items.push(item); added.push(item); }
        }
        return { added, duplicates };
      });
    },

    async update(id, updates) {
      return mutate((lib) => {
        const item = lib.items.find((i) => i.id === id);
        if (!item) return null;
        Object.assign(item, updates, { updated_at: now() });
        return item;
      });
    },

    async updateMany(updatesById) {
      return mutate((lib) => {
        let count = 0;
        for (const item of lib.items) {
          const upd = updatesById[item.id];
          if (upd) { Object.assign(item, upd, { updated_at: now() }); count++; }
        }
        return count;
      });
    },

    async remove(id) {
      return mutate((lib) => {
        const idx = lib.items.findIndex((i) => i.id === id);
        if (idx === -1) return false;
        lib.items.splice(idx, 1);
        return true;
      });
    },

    async clearDemo() {
      return mutate((lib) => {
        const before = lib.items.length;
        lib.items = lib.items.filter((i) => !i.demo);
        return before - lib.items.length;
      });
    },
  };
}
