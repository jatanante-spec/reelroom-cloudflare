// Optional password gate for ReelRoom on Cloudflare Pages.
// Set REELROOM_PASSWORD in the Pages project's environment variables to require a login.
// Uses WebCrypto (crypto.subtle) — the Workers runtime has no node:crypto or Buffer.

const COOKIE = "reelroom_auth";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const enc = new TextEncoder();

// Cache the derived token per isolate so we don't re-run HMAC on every request.
const tokenCache = new Map();

async function tokenFor(password) {
  const key = String(password ?? "");
  if (tokenCache.has(key)) return tokenCache.get(key);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode("reelroom-auth-v1"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(key));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (tokenCache.size > 8) tokenCache.clear();
  tokenCache.set(key, hex);
  return hex;
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
  const parts = [
    `${COOKIE}=${await tokenFor(env.REELROOM_PASSWORD)}`,
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
  return safeEqual(match[1], await tokenFor(env.REELROOM_PASSWORD));
}
