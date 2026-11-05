import { test } from "node:test";
import assert from "node:assert/strict";
import { makeRepo, memoryAdapter, d1Adapter, cleanTags, makeDemoLibrary } from "../lib/store.mjs";
import { fakeD1 } from "./helpers.mjs";

function sampleItem(overrides = {}) {
  return {
    id: "id-" + Math.random().toString(36).slice(2),
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    canonical_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    platform: "youtube", media_type: "video", external_id: "dQw4w9WgXcQ",
    embed_url: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    thumbnail_url: null, title: "Test", author: null,
    tags: [], collection: "", notes: "", favorite: false, watched: false, demo: false,
    metadata_status: "ok", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

// Run the whole behavioural suite against both adapters.
for (const [label, mkAdapter] of [["memory", memoryAdapter], ["d1", () => d1Adapter(fakeD1())]]) {
  test(`[${label}] cleanTags dedupes and strips #`, () => {
    assert.deepEqual(cleanTags("a, #b, A, c"), ["a", "b", "c"]);
    assert.deepEqual(cleanTags(["x", "x", "y"]), ["x", "y"]);
    assert.deepEqual(cleanTags(null), []);
  });

  test(`[${label}] seeds demo library once`, async () => {
    const repo = makeRepo(mkAdapter());
    const items = await repo.list();
    assert.equal(items.length, 8);
    assert.ok(items.every((i) => i.demo));
    assert.equal((await repo.list()).length, 8);
  });

  test(`[${label}] noSeed starts empty`, async () => {
    const repo = makeRepo(mkAdapter(), { noSeed: true });
    assert.equal((await repo.list()).length, 0);
  });

  test(`[${label}] insert and duplicate detection`, async () => {
    const repo = makeRepo(mkAdapter());
    await repo.list();
    assert.equal((await repo.insert(sampleItem())).duplicate, false);
    assert.equal((await repo.insert(sampleItem({ id: "other" }))).duplicate, true);
  });

  test(`[${label}] insertMany dedupes within batch`, async () => {
    const repo = makeRepo(mkAdapter());
    await repo.list();
    const a = sampleItem();
    const b = sampleItem({ canonical_url: "https://www.instagram.com/p/abc/", url: "https://www.instagram.com/p/abc/", platform: "instagram" });
    const res = await repo.insertMany([a, b, sampleItem({ id: "dup-of-a" })]);
    assert.equal(res.added.length, 2);
    assert.equal(res.duplicates.length, 1);
  });

  test(`[${label}] update and remove`, async () => {
    const repo = makeRepo(mkAdapter());
    await repo.list();
    const { item } = await repo.insert(sampleItem());
    const updated = await repo.update(item.id, { title: "New", favorite: true });
    assert.equal(updated.title, "New");
    assert.equal(updated.favorite, true);
    assert.equal(await repo.remove(item.id), true);
    assert.equal(await repo.remove(item.id), false);
  });

  test(`[${label}] updateMany applies progress to several items`, async () => {
    const repo = makeRepo(mkAdapter());
    await repo.list();
    const a = (await repo.insert(sampleItem({ canonical_url: "https://www.instagram.com/p/a/" }))).item;
    const b = (await repo.insert(sampleItem({ canonical_url: "https://www.instagram.com/p/b/" }))).item;
    const n = await repo.updateMany({ [a.id]: { progress: 0.5 }, [b.id]: { watched: true } });
    assert.equal(n, 2);
    const items = await repo.list();
    assert.equal(items.find((i) => i.id === a.id).progress, 0.5);
    assert.equal(items.find((i) => i.id === b.id).watched, true);
  });

  test(`[${label}] clearDemo removes only demo items`, async () => {
    const repo = makeRepo(mkAdapter());
    await repo.list();
    await repo.insert(sampleItem());
    assert.equal(await repo.clearDemo(), 8);
    const items = await repo.list();
    assert.equal(items.length, 1);
    assert.equal(items[0].demo, false);
  });

  test(`[${label}] concurrent writes do not lose data`, async () => {
    const repo = makeRepo(mkAdapter());
    await repo.list();
    // Fire 10 inserts concurrently; compare-and-swap retries must keep all.
    await Promise.all(Array.from({ length: 10 }, (_, i) =>
      repo.insert(sampleItem({
        canonical_url: `https://www.instagram.com/p/item${i}/`,
        url: `https://www.instagram.com/p/item${i}/`,
        platform: "instagram",
      }))
    ));
    assert.equal((await repo.list()).length, 8 + 10);
  });
}

test("d1Adapter creates the table and stores JSON in one row", async () => {
  const db = fakeD1();
  const repo = makeRepo(d1Adapter(db), { noSeed: true });
  await repo.insert(sampleItem());
  const row = db._row();
  assert.ok(row, "row exists");
  assert.equal(typeof row.data, "string");
  assert.equal(JSON.parse(row.data).items.length, 1);
  assert.equal(row.version, 1, "first write creates the row at version 1");
  // a second mutation must bump the version, not overwrite blindly
  await repo.insert(sampleItem({ canonical_url: "https://www.instagram.com/p/second/" }));
  assert.equal(db._row().version, 2, "version increments on the next write");
  assert.equal(JSON.parse(db._row().data).items.length, 2);
  assert.ok(db._calls.some(([, s]) => /^CREATE TABLE IF NOT EXISTS/i.test(s)));
});

test("d1Adapter compare-and-swap rejects a stale version", async () => {
  const db = fakeD1();
  const a = d1Adapter(db);
  await a.write({ items: [] }, null);
  const { version } = await a.read();
  assert.equal(await a.write({ items: [1] }, version), true);
  assert.equal(await a.write({ items: [2] }, version), false, "stale version must fail");
  assert.equal(await a.write({ items: [] }, null), false, "only-if-new must fail once present");
});

test("demo library shape", () => {
  const lib = makeDemoLibrary();
  assert.equal(lib.version, 1);
  assert.equal(lib.seeded, true);
  assert.equal(lib.items.length, 8);
  assert.ok(lib.items.every((i) => i.id && i.embed_url));
});
