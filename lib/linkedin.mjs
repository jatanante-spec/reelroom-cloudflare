// Resolve only public LinkedIn post URLs. Never accept or fetch arbitrary hosts.
// The official embed remains hosted by LinkedIn; no media is downloaded.
const allowedLinkedIn = (h) => h === 'linkedin.com' || h.endsWith('.linkedin.com');
const allowedShort = (h) => h === 'lnkd.in' || h === 'www.lnkd.in';
export function isLinkedInUrl(raw) {
  try { const u = new URL(raw); return u.protocol === 'https:' && (allowedLinkedIn(u.hostname.toLowerCase()) || allowedShort(u.hostname.toLowerCase())); } catch { return false; }
}
export function linkedinPostUrn(raw) {
  try {
    const u = new URL(raw), host = u.hostname.toLowerCase();
    if (u.protocol !== 'https:' || !allowedLinkedIn(host)) return null;
    const path = decodeURIComponent(u.pathname);
    if (!/^\/(?:posts\/|feed\/update\/|embed\/feed\/update\/)/i.test(path)) return null;
    const urn = path.match(/urn:li:(activity|share|ugcPost):(\d{13,25})(?:\/|$)/i);
    const slug = path.match(/[-_](activity|share|ugcPost)-(\d{13,25})(?:-|\/|$)/i);
    const m = urn || slug;
    if (!m) return null;
    const type = m[1].toLowerCase() === 'ugcpost' ? 'ugcPost' : m[1].toLowerCase();
    return `urn:li:${type}:${m[2]}`;
  } catch { return null; }
}
export async function linkedinEmbedFor(raw) {
  if (!isLinkedInUrl(raw)) return null;
  let current = new URL(raw);
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    // Short links can hop between LinkedIn short-link hosts, but never follow a
    // redirect to another host or private address. No cookies or user data sent.
    for (let hop = 0; hop <= 4; hop++) {
      if (allowedLinkedIn(current.hostname.toLowerCase())) {
        const urn = linkedinPostUrn(current.href);
        return urn ? `https://www.linkedin.com/embed/feed/update/${urn}` : null;
      }
      if (!allowedShort(current.hostname.toLowerCase()) || current.protocol !== 'https:') return null;
      const r = await fetch(current.href, {method:'GET', redirect:'manual', signal:ctrl.signal, headers:{'User-Agent':'Mozilla/5.0 (compatible; ReelRoom/1.0; +personal-link-library)', 'Accept':'text/html'}});
      const loc = r.headers.get('location');
      if (r.body) { try { await r.body.cancel(); } catch {} }
      if (r.status < 300 || r.status >= 400 || !loc) return null;
      const next = new URL(loc, current);
      if (!isLinkedInUrl(next.href)) return null;
      current = next;
    }
  } catch {} finally { clearTimeout(timer); }
  return null;
}
