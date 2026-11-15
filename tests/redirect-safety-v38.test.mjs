// v38: every redirect hop is checked before it is followed, so a link cannot
// walk the app into a private network, a local file, or the cloud metadata
// address of the machine that serves it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { safeRedirectTarget, fetchPage } from "../lib/metadata.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const meta = readFileSync(join(root, "lib", "metadata.mjs"), "utf8");

test("a redirect to a private address is refused", () => {
  const base = "https://example.com/page";
  assert.equal(safeRedirectTarget("http://127.0.0.1/admin", base), null);
  assert.equal(safeRedirectTarget("http://localhost:8080/", base), null);
  assert.equal(safeRedirectTarget("http://192.168.1.10/", base), null);
  assert.equal(safeRedirectTarget("http://10.0.0.5/", base), null);
  assert.equal(safeRedirectTarget("http://169.254.169.254/latest/meta-data/", base), null);
  assert.equal(safeRedirectTarget("http://[::1]/", base), null);
  assert.equal(safeRedirectTarget("file:///etc/passwd", base), null);
  assert.equal(safeRedirectTarget("javascript:alert(1)", base), null);
});

test("a redirect to a public address is allowed", () => {
  assert.equal(safeRedirectTarget("https://example.org/next", "https://example.com/page"),
    "https://example.org/next");
  assert.equal(safeRedirectTarget("/next", "https://example.com/page"),
    "https://example.com/next");
  assert.equal(safeRedirectTarget("https://www.facebook.com/1/posts/2/", "https://www.facebook.com/"),
    "https://www.facebook.com/1/posts/2/");
});

test("the page fetch follows redirects by hand and checks each hop", () => {
  assert.match(meta, /redirect: "manual"/);
  assert.match(meta, /MAX_REDIRECTS/);
  assert.match(meta, /safeRedirectTarget\(location, u\.toString\(\)\)/);
  // and a private address is refused before anything is fetched
  assert.match(meta, /isPrivateHost\(u\.hostname\)/);
});

test("a private address is never fetched at all", async () => {
  await assert.rejects(() => fetchPage("http://127.0.0.1:9/secret", "test-agent"));
  await assert.rejects(() => fetchPage("http://169.254.169.254/", "test-agent"));
  await assert.rejects(() => fetchPage("file:///etc/passwd", "test-agent"));
});
