import { test } from "node:test";
import assert from "node:assert/strict";
import {
  passwordRequired, checkPassword, makeCookie, clearCookie,
  isSecureRequest, isAuthenticated,
} from "../lib/auth.mjs";

test("no password set -> open access", async () => {
  const env = {};
  assert.equal(passwordRequired(env), false);
  assert.equal(await isAuthenticated(new Request("http://localhost/api/items"), env), true);
  assert.equal(checkPassword("anything", env), true);
});

test("password set -> cookie required", async () => {
  const env = { REELROOM_PASSWORD: "secret123" };
  assert.equal(passwordRequired(env), true);
  assert.equal(checkPassword("secret123", env), true);
  assert.equal(checkPassword("wrong", env), false);
  assert.equal(checkPassword("", env), false);
  assert.equal(checkPassword(null, env), false);

  const req = new Request("http://localhost/api/items");
  assert.equal(await isAuthenticated(req, env), false);

  const cookie = await makeCookie(env, false);
  const req2 = new Request("http://localhost/api/items", { headers: { cookie } });
  assert.equal(await isAuthenticated(req2, env), true);
});

test("cookie is deterministic for the same password and differs across passwords", async () => {
  const a = await makeCookie({ REELROOM_PASSWORD: "one" }, false);
  const b = await makeCookie({ REELROOM_PASSWORD: "one" }, false);
  const c = await makeCookie({ REELROOM_PASSWORD: "two" }, false);
  assert.equal(a, b);
  assert.notEqual(a, c);
  // a cookie from another password must not authenticate
  const env = { REELROOM_PASSWORD: "one" };
  assert.equal(await isAuthenticated(new Request("http://x/api/items", { headers: { cookie: c } }), env), false);
});

test("cookie flags", async () => {
  const env = { REELROOM_PASSWORD: "pw" };
  const insecure = await makeCookie(env, false);
  assert.match(insecure, /HttpOnly/);
  assert.match(insecure, /SameSite=Lax/);
  assert.match(insecure, /Path=\//);
  assert.ok(!insecure.includes("Secure"));
  const secure = await makeCookie(env, true);
  assert.match(secure, /Secure/);
  assert.match(clearCookie(true), /Max-Age=0/);
});

test("isSecureRequest reads the protocol", () => {
  assert.equal(isSecureRequest(new Request("https://x.netlify.app/api/items")), true);
  assert.equal(isSecureRequest(new Request("http://localhost/api/items")), false);
});

test("garbage cookie is rejected, not thrown on", async () => {
  const env = { REELROOM_PASSWORD: "pw" };
  for (const cookie of ["reelroom_auth=", "reelroom_auth=zzz", "other=1", "reelroom_auth=" + "a".repeat(500)]) {
    assert.equal(await isAuthenticated(new Request("http://x/api/items", { headers: { cookie } }), env), false);
  }
});
