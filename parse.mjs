// URL parsing for ReelRoom (Netlify edition).
// Detects platform, builds canonical + embed URLs. Never downloads media.

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

function hostAllowed(host, suffixes) {
  host = host.toLowerCase().split(":")[0];
  return suffixes.some((s) => host === s || host.endsWith("." + s));
}

async function resolveShortUrl(url) {
  const parsed = new URL(url);
  if (!hostAllowed(parsed.hostname, ["tiktok.com", "fb.watch", "facebook.com"])) {
    throw new Error("Short link host is not supported");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  let finalUrl;
  try {
    const resp = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ReelRoom/1.0)" },
    });
    finalUrl = resp.url;
  } catch {
    throw new Error("Could not resolve this short link. Try the full post URL.");
  } finally {
    clearTimeout(timer);
  }
  if (!hostAllowed(new URL(finalUrl).hostname, ["tiktok.com", "fb.watch", "facebook.com"])) {
    throw new Error("Short link redirected to an unsupported host");
  }
  return finalUrl;
}

export async function parseUrl(input) {
  if (!input || !String(input).trim()) throw new Error("URL is required");
  let url = String(input).trim();
  if (!/^https?:\/\//i.test(url)) url = "https://" + url.replace(/^\/+/, "");
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("That doesn't look like a valid URL");
  }
  const host = parsed.hostname.toLowerCase();
  const base = host.startsWith("www.") ? host.slice(4) : host;
  let path = parsed.pathname || "/";
  let qs = parsed.searchParams;

  // ---------------- YouTube ----------------
  if (["youtube.com", "youtu.be", "youtube-nocookie.com"].includes(base) || host.endsWith(".youtube.com")) {
    let videoId = null;
    let mediaType = "video";
    if (base === "youtu.be") {
      videoId = path.replace(/^\/+/, "").split("/")[0];
    } else if (path === "/watch" && qs.get("v")) {
      videoId = qs.get("v");
    } else {
      const m = path.match(/^\/(shorts|embed|live|v)\/([A-Za-z0-9_-]{11})/);
      if (m) {
        videoId = m[2];
        mediaType = m[1] === "shorts" ? "short" : "video";
      }
    }
    if (!videoId || !YT_ID.test(videoId)) throw new Error("Could not find a YouTube video ID in that URL");
    return {
      platform: "youtube",
      media_type: mediaType,
      external_id: videoId,
      canonical_url: `https://www.youtube.com/watch?v=${videoId}`,
      embed_url: `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`,
      thumbnail_url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      title: "YouTube video",
    };
  }

  // ---------------- TikTok ----------------
  if (base === "tiktok.com" || host.endsWith(".tiktok.com")) {
    if (["vm.tiktok.com", "vt.tiktok.com"].includes(base) || /^\/t\//.test(path)) {
      url = await resolveShortUrl(url);
      parsed = new URL(url);
      path = parsed.pathname || "/";
    }
    const m = path.match(/\/(video|photo)\/(\d+)/);
    if (!m) throw new Error("Could not find a TikTok video/photo ID. Use the full post URL if this is a short link.");
    const [, kind, tiktokId] = m;
    const userMatch = path.match(/\/@([^/]+)\//);
    const user = userMatch ? userMatch[1] : "tiktok";
    return {
      platform: "tiktok",
      media_type: kind === "photo" ? "image" : "video",
      external_id: tiktokId,
      canonical_url: `https://www.tiktok.com/@${user}/${kind}/${tiktokId}`,
      embed_url: `https://www.tiktok.com/player/v1/${tiktokId}?autoplay=1&music_info=1&description=1`,
      thumbnail_url: null,
      title: kind === "video" ? "TikTok video" : "TikTok photo post",
    };
  }

  // ---------------- Instagram ----------------
  if (base === "instagram.com" || host.endsWith(".instagram.com")) {
    const m = path.match(/^\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
    if (!m) throw new Error("Instagram link must be a post (/p/), Reel (/reel/), or IGTV (/tv/) URL");
    let [, kind, code] = m;
    kind = ["reel", "reels", "tv"].includes(kind) ? "reel" : "p";
    const mediaType = kind === "reel" ? "reel" : "post";
    const embedSuffix = kind === "p" ? "captioned/" : "";
    return {
      platform: "instagram",
      media_type: mediaType,
      external_id: code,
      canonical_url: `https://www.instagram.com/${kind}/${code}/`,
      embed_url: `https://www.instagram.com/${kind}/${code}/embed/${embedSuffix}`,
      thumbnail_url: null,
      title: kind === "reel" ? "Instagram Reel" : "Instagram post",
    };
  }

  // ---------------- Facebook ----------------
  if (["facebook.com", "fb.watch"].includes(base) || host.endsWith(".facebook.com")) {
    if (base === "fb.watch" || path.startsWith("/share/")) {
      url = await resolveShortUrl(url);
      parsed = new URL(url);
      path = parsed.pathname || "/";
      qs = parsed.searchParams;
    }
    let mediaType = "post";
    let externalId = null;
    let canonical;
    const trimmed = path.replace(/\/+$/, "");
    if ((trimmed === "/watch" || trimmed === "/video.php") && qs.get("v")) {
      externalId = qs.get("v");
      mediaType = "video";
      canonical = `https://www.facebook.com/watch/?v=${externalId}`;
    } else if (path.includes("/videos/")) {
      const m = path.match(/\/videos\/(?:[^/]+\/)?(\d+)/);
      externalId = m ? m[1] : null;
      mediaType = "video";
      canonical = "https://www.facebook.com" + path;
    } else if (/^\/reel\/(\d+)/.test(path)) {
      externalId = path.match(/^\/reel\/(\d+)/)[1];
      mediaType = "reel";
      canonical = "https://www.facebook.com" + path;
    } else if (path.startsWith("/photo") || qs.get("fbid")) {
      externalId = qs.get("fbid");
      mediaType = "image";
      canonical = "https://www.facebook.com" + path;
      if (externalId) canonical += "?fbid=" + encodeURIComponent(externalId);
    } else if (path.includes("/posts/")) {
      const m = path.match(/\/posts\/(\d+)/);
      externalId = m ? m[1] : null;
      canonical = "https://www.facebook.com" + path;
    } else {
      canonical = "https://www.facebook.com" + path;
    }
    const videoEmbed = "https://www.facebook.com/plugins/video.php?" + new URLSearchParams({
      href: canonical, show_text: "false", autoplay: "true", mute: "0",
    });
    const postEmbed = "https://www.facebook.com/plugins/post.php?" + new URLSearchParams({
      href: canonical, show_text: "true",
    });
    let embed, embedAlt;
    if (mediaType === "reel") {
      // Reels often render more reliably as embedded posts than as the video player.
      embed = postEmbed;
      embedAlt = videoEmbed;
    } else if (mediaType === "video") {
      embed = videoEmbed;
      embedAlt = postEmbed;
    } else {
      embed = postEmbed;
      embedAlt = null;
    }
    const label = { video: "video", reel: "Reel", image: "photo", post: "post" }[mediaType];
    return {
      platform: "facebook",
      media_type: mediaType,
      external_id: externalId,
      canonical_url: canonical,
      embed_url: embed,
      embed_url_alt: embedAlt,
      thumbnail_url: null,
      title: "Facebook " + label,
    };
  }

  throw new Error("Unsupported link. Use a YouTube, TikTok, Instagram, or Facebook post/video URL.");
}
