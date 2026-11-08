// Optional password gate for ReelRoom on Cloudflare Pages.
// Set REELROOM_PASSWORD in the Pages project's environment variables to require a login.
// Uses WebCrypto (crypto.subtle) — the Workers runtime has no node:crypto or Buffer.
// v32: tokens now carry an expiry, so a stolen cookie stops working after 30 days
// even if the password is never changed. Changing the password still invalidates all tokens.

const COOKIE = "reelroom_auth";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const enc = new TextEncoder();

let keyPromise = null;
function signingKey() {
  if (!keyPromise) {
    keyPromise = crypto.subtle.importKey(
      "raw",
      enc.encode("reelroom-auth-v2"),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
  }
  return keyPromise;
}

async function sign(payload) {
  const sig = await crypto.subtle.sign("HMAC", await signingKey(), enc.encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Constant-time string comparison (no Buffer/timingSafeEqual in Workers).
function safeEqual(a, b) {
  const x = String(a ?? "");
  const y = String(b ?? "");
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

export function passwordRequired(env) {
  return Boolean(env?.REELROOM_PASSWORD);
}

export function checkPassword(input, env) {
  const expected = env?.REELROOM_PASSWORD || "";
  if (!expected) return true;
  return safeEqual(input, expected);
}

export async function makeCookie(env, secure) {
  const exp = Date.now() + MAX_AGE * 1000;
  const token = `v2.${exp}.${await sign(`${env.REELROOM_PASSWORD}|${exp}`)}`;
  const parts = [
    `${COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${MAX_AGE}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearCookie(secure) {
  const parts = [`${COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function isSecureRequest(req) {
  try {
    return new URL(req.url).protocol === "https:";
  } catch {
    return false;
  }
}

export async function isAuthenticated(req, env) {
  if (!passwordRequired(env)) return true;
  const header = req.headers.get("cookie") || "";
  const match = header.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!match) return false;
  const parts = match[1].split(".");
  if (parts.length !== 3 || parts[0] !== "v2") return false;
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const expected = await sign(`${env.REELROOM_PASSWORD}|${exp}`);
  return safeEqual(parts[2], expected);
}
