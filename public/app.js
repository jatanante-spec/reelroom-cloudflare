/* ReelRoom frontend */
(() => {
  "use strict";

  const REELROOM_VERSION = "v10";
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const state = {
    items: [],
    view: "all",          // all | favorites | unwatched
    platform: "",
    collection: "",
    tag: "",
    search: "",
    sort: "newest",
    playerIndex: -1,
    editingId: null,
    pollTimer: null,
    fbUseAlt: false,
    useBackup: null,
  };

  const PLATFORM_LABEL = { youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram", facebook: "Facebook" };
  const PLATFORM_ICON = { youtube: "▶", tiktok: "♪", instagram: "◉", facebook: "f" };
  const TYPE_LABEL = { video: "Video", short: "Short", reel: "Reel", image: "Image", post: "Post" };

  // ---------- utils ----------
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function safeUrl(u) {
    try {
      const p = new URL(u);
      return (p.protocol === "http:" || p.protocol === "https:") ? p.href : "";
    } catch { return ""; }
  }
  async function api(path, opts = {}) {
    const res = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && !path.startsWith("/api/login") && !path.startsWith("/api/me")) {
      showLogin();
      throw new Error("Please sign in");
    }
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }
  let toastTimer;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
  }
  function debounce(fn, ms) {
    let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }

  // ---------- data ----------
  async function loadItems() {
    try {
      state.items = await api("/api/items");
      render();
      schedulePoll();
    } catch (e) { toast(e.message); }
  }
  const META_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;
  function needsMeta(item) {
    if (item.metadata_status === "pending") return true;
    if (!["youtube", "tiktok", "instagram", "facebook"].includes(item.platform)) return false;
    if (!item.metadata_fetched_at) return true;
    const at = Date.parse(item.metadata_fetched_at);
    if (!Number.isFinite(at)) return true;
    return Date.now() - at > META_REFRESH_MS;
  }

  function schedulePoll() {
    clearTimeout(state.pollTimer);
    if (state.items.some(needsMeta)) {
      state.pollTimer = setTimeout(refreshPending, 1200);
    }
  }
  async function refreshPending() {
    clearTimeout(state.pollTimer);
    try {
      await api("/api/refresh-pending", { method: "POST" });
      // loadItems() re-runs schedulePoll(), which continues only while work remains.
      await loadItems();
    } catch { /* auth modal will handle 401 */ }
  }

  // ---------- auth ----------
  function showLogin() {
    $("#loginModal").hidden = false;
    setTimeout(() => $("#loginPassword").focus(), 50);
  }
  async function checkAuth() {
    try {
      const me = await api("/api/me");
      $("#logoutBtn").hidden = !me.required;
      if (me.required && !me.authenticated) { showLogin(); return false; }
    } catch { /* offline or error; try loading anyway */ }
    return true;
  }
  async function doLogin() {
    const pw = $("#loginPassword").value;
    try {
      await api("/api/login", { method: "POST", body: { password: pw } });
      $("#loginModal").hidden = true;
      $("#loginError").textContent = "";
      $("#loginPassword").value = "";
      $("#logoutBtn").hidden = false;
      await loadItems();
    } catch (e) {
      $("#loginError").innerHTML = `<span class="bad">${esc(e.message)}</span>`;
    }
  }
  async function doLogout() {
    try { await api("/api/logout", { method: "POST" }); } catch {}
    state.items = [];
    render();
    showLogin();
  }

  function filtered() {
    let list = state.items.slice();
    if (state.view === "favorites") list = list.filter((i) => i.favorite);
    if (state.view === "unwatched") list = list.filter((i) => !i.watched);
    if (state.platform) list = list.filter((i) => i.platform === state.platform);
    if (state.collection) list = list.filter((i) => i.collection === state.collection);
    if (state.tag) list = list.filter((i) => (i.tags || []).some((t) => t.toLowerCase() === state.tag.toLowerCase()));
    if (state.search) {
      const q = state.search.toLowerCase();
      list = list.filter((i) =>
        [i.title, i.author, i.collection, i.notes, i.url, ...(i.tags || [])]
          .filter(Boolean).join(" ").toLowerCase().includes(q)
      );
    }
    const stamp = (i) => String(i.created_at || "");
    const sorters = {
      newest: (a, b) => stamp(b).localeCompare(stamp(a)),
      oldest: (a, b) => stamp(a).localeCompare(stamp(b)),
      title: (a, b) => String(a.title || "").localeCompare(String(b.title || "")),
      platform: (a, b) => String(a.platform || "").localeCompare(String(b.platform || "")) || stamp(b).localeCompare(stamp(a)),
    };
    list.sort(sorters[state.sort] || sorters.newest);
    return list;
  }

  // ---------- render ----------
  function render() {
    const list = filtered();
    renderCounts();
    renderCollections();
    renderTags();
    renderChips();
    renderActiveFilters();
    renderGrid(list);
    renderContinue();
    $("#resultCount").textContent = `${list.length} of ${state.items.length} link${state.items.length === 1 ? "" : "s"}`;
    $("#demoBanner").hidden = !state.items.some((i) => i.demo);
    $("#emptyState").hidden = list.length > 0;
    $("#grid").hidden = list.length === 0;
  }

  function renderCounts() {
    for (const p of Object.keys(PLATFORM_LABEL)) {
      const el = document.querySelector(`[data-count="${p}"]`);
      if (el) el.textContent = state.items.filter((i) => i.platform === p).length || "";
    }
    $$(".side-link[data-view]").forEach((b) => b.classList.toggle("active", b.dataset.view === state.view && !state.platform && !state.collection && !state.tag));
    $$(".platform-link").forEach((b) => b.classList.toggle("active", b.dataset.platform === state.platform));
  }

  function renderCollections() {
    const cols = [...new Set(state.items.map((i) => i.collection).filter(Boolean))].sort();
    const wrap = $("#collectionList");
    wrap.innerHTML = cols.length
      ? cols.map((c) => `<button class="side-link ${state.collection === c ? "active" : ""}" data-collection="${esc(c)}"><span class="side-ico">📁</span> ${esc(c)}</button>`).join("")
      : `<div class="side-footer" style="margin:0;padding:4px 12px;">No collections yet</div>`;
    wrap.querySelectorAll("[data-collection]").forEach((b) => b.addEventListener("click", () => {
      state.collection = state.collection === b.dataset.collection ? "" : b.dataset.collection;
      render();
    }));
  }

  function renderTags() {
    const tags = [...new Set(state.items.flatMap((i) => i.tags || []))].sort();
    const wrap = $("#tagCloud");
    wrap.innerHTML = tags.length
      ? tags.map((t) => `<button class="tag-pill ${state.tag.toLowerCase() === t.toLowerCase() ? "active" : ""}" data-tag="${esc(t)}">#${esc(t)}</button>`).join("")
      : `<span class="side-footer" style="margin:0;padding:0 4px;">No tags yet</span>`;
    wrap.querySelectorAll("[data-tag]").forEach((b) => b.addEventListener("click", () => {
      state.tag = state.tag === b.dataset.tag ? "" : b.dataset.tag;
      render();
    }));
  }

  function renderChips() {
    $$("#platformChips .chip").forEach((c) => c.classList.toggle("active", c.dataset.platform === state.platform));
  }

  function renderActiveFilters() {
    const parts = [];
    if (state.view !== "all") parts.push({ label: state.view === "favorites" ? "Favorites" : "Unwatched", clear: () => { state.view = "all"; } });
    if (state.collection) parts.push({ label: `Collection: ${state.collection}`, clear: () => { state.collection = ""; } });
    if (state.tag) parts.push({ label: `#${state.tag}`, clear: () => { state.tag = ""; } });
    if (state.search) parts.push({ label: `Search: “${state.search}”`, clear: () => { state.search = ""; $("#searchInput").value = ""; } });
    const wrap = $("#activeFilters");
    wrap.innerHTML = parts.map((p, idx) => `<span class="filter-tag">${esc(p.label)} <button data-idx="${idx}" aria-label="Remove filter">✕</button></span>`).join("");
    wrap.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { parts[+b.dataset.idx].clear(); render(); }));
  }

  // Thumbnail resolution. Some platforms give us one directly; for others we can
  // build a public preview-image URL from the link itself. Nothing is downloaded.
  function thumbnailFor(item) {
    const direct = safeUrl(item.thumbnail_url);
    if (direct) return direct;
    const canonical = safeUrl(item.canonical_url || item.url);
    if (item.platform === "instagram") {
      const m = canonical.match(/instagram\.com\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
      if (m) return `https://www.instagram.com/${m[1]}/${m[2]}/media/?size=l`;
    }
    if (item.platform === "youtube") {
      const id = item.external_id || (canonical.match(/[?&]v=([A-Za-z0-9_-]{6,})/) || [])[1];
      if (id) return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    }
    return "";
  }

  // Facebook prefixes og:title with engagement counts, e.g.
  // "1M views \u00b7 15K reactions | How to manage your time". Strip that for display.
  function displayTitle(item) {
    const raw = String(item.title || item.url || "");
    const cleaned = raw.replace(
      /^(?:[\d.,]+\s*[KMBkmb]?\s*(?:views?|reactions?|likes?|comments?|shares?)\s*(?:[\u00b7\u2022]\s*)?)+\|\s*/i,
      ""
    ).trim();
    return cleaned || raw;
  }

  function thumbHtml(item) {
    const thumb = thumbnailFor(item);
    const ph = `<div class="thumb-placeholder ph-${item.platform}"><span class="big">${PLATFORM_ICON[item.platform] || "▶"}</span><span>${esc(PLATFORM_LABEL[item.platform] || item.platform)}</span></div>`;
    const img = thumb ? `<img src="${esc(thumb)}" alt="" loading="lazy" onerror="this.remove()">` : "";
    return `<div class="thumb">${ph}${img}
      <span class="badge ${item.platform}">${esc(PLATFORM_LABEL[item.platform] || item.platform)}</span>
      ${item.demo ? '<span class="demo-badge">DEMO</span>' : ""}
      <span class="type-badge">${esc(TYPE_LABEL[item.media_type] || item.media_type)}</span>
      ${Number(item.progress) > 0.02 && !item.watched ? `<span class="resume-badge">Resume</span><span class="thumb-progress"><i style="width:${Math.round(Math.min(1, Number(item.progress)) * 100)}%"></i></span>` : ""}
      <div class="play-overlay"><span>▶</span></div>
    </div>`;
  }

  function renderGrid(list) {
    const grid = $("#grid");
    grid.innerHTML = list.map((item) => `
      <article class="card" data-id="${item.id}" tabindex="0" role="button" aria-label="Play ${esc(displayTitle(item))}">
        ${thumbHtml(item)}
        <div class="card-body">
          <h3 class="card-title">${esc(displayTitle(item))}</h3>
          <div class="card-author">${esc(item.author || PLATFORM_LABEL[item.platform] || "")} ${item.watched ? '<span class="watched-mark">✓ watched</span>' : ""}</div>
          <div class="card-meta">
            ${(item.tags || []).slice(0, 3).map((t) => `<span class="mini-tag">#${esc(t)}</span>`).join("")}
            ${item.collection ? `<span class="mini-tag">📁 ${esc(item.collection)}</span>` : ""}
            ${item.backup_embed_url ? `<span class="mini-tag" title="A backup link is set">▶ backup</span>` : ""}
            <span class="card-actions">
              <button data-act="fav" title="Favorite" class="${item.favorite ? "fav-on" : ""}">${item.favorite ? "★" : "☆"}</button>
              <button data-act="edit" title="Edit">✎</button>
              <button data-act="delete" title="Delete">🗑</button>
            </span>
          </div>
        </div>
      </article>`).join("");

    grid.querySelectorAll(".card").forEach((card) => {
      const id = card.dataset.id;
      card.addEventListener("click", (e) => {
        const actBtn = e.target.closest("[data-act]");
        if (actBtn) {
          e.stopPropagation();
          const item = state.items.find((i) => i.id === id);
          if (actBtn.dataset.act === "fav") toggleFav(item);
          if (actBtn.dataset.act === "edit") openEdit(item);
          if (actBtn.dataset.act === "delete") deleteItem(item);
          return;
        }
        openPlayer(id);
      });
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPlayer(id); }
      });
    });
  }

  // ---------- player ----------
  function currentList() { return filtered(); }

  function openPlayer(id, fromRail) {
    let list = currentList();
    let idx = list.findIndex((i) => i.id === id);
    if (idx === -1 && fromRail) {
      // the item may be outside the current filter — clear filters so prev/next still work
      state.view = "all"; state.platform = ""; state.collection = ""; state.tag = ""; state.search = "";
      const si = $("#searchInput"); if (si) si.value = "";
      render();
      list = currentList();
      idx = list.findIndex((i) => i.id === id);
    }
    if (idx === -1) return;
    state.returnFocusId = id;
    state.playerIndex = idx;
    state.fbUseAlt = false;
    state.useBackup = null;
    $("#playerModal").hidden = false;
    document.body.style.overflow = "hidden";
    renderPlayer(list[idx]);
  }

  function facebookEmbeds(item) {
    const canonical = safeUrl(item.canonical_url || item.url);
    if (!canonical) return { primary: safeUrl(item.embed_url), alt: "" };
    const post = "https://www.facebook.com/plugins/post.php?" + new URLSearchParams({ href: canonical, show_text: "true" });
    const video = "https://www.facebook.com/plugins/video.php?" + new URLSearchParams({ href: canonical, show_text: "false", autoplay: "true", mute: "0" });
    // Verified: Facebook's post.php plugin returns an error page for /reel/ links,
    // so Reels must use the video player. Only plain video/post links get a fallback.
    if (item.media_type === "reel") return { primary: video, alt: "" };
    if (item.media_type === "video") return { primary: video, alt: post };
    return { primary: safeUrl(item.embed_url) || post, alt: "" };
  }

  function stampVersion() {
    const footer = document.querySelector(".side-footer");
    if (footer) footer.textContent = "Embed-only \u00b7 nothing is downloaded \u00b7 " + REELROOM_VERSION;
    const top = document.querySelector(".topbar");
    if (top && !$("#versionBadge")) {
      const badge = document.createElement("span");
      badge.id = "versionBadge";
      badge.textContent = REELROOM_VERSION;
      badge.title = "ReelRoom build version";
      badge.style.cssText = "font-size:11px;color:#9a9a9a;border:1px solid #3a3a3a;border-radius:6px;padding:2px 6px;flex-shrink:0;";
      top.appendChild(badge);
    }
    try { console.log("ReelRoom " + REELROOM_VERSION + " (Instagram crop, own fullscreen controls)"); } catch {}
  }

  function ensurePlayerActionButtons() {
    const actions = document.querySelector(".player-actions");
    if (!actions) return;
    const fav = $("#favBtn");
    const oldToggle = $("#fbEmbedToggleBtn");
    if (oldToggle) oldToggle.hidden = true;

    let postBtn = $("#fbPostPlayerBtn");
    if (!postBtn) {
      postBtn = document.createElement("button");
      postBtn.id = "fbPostPlayerBtn";
      postBtn.type = "button";
      postBtn.className = "btn btn-small";
      actions.insertBefore(postBtn, fav || null);
    }
    let videoBtn = $("#fbVideoPlayerBtn");
    if (!videoBtn) {
      videoBtn = document.createElement("button");
      videoBtn.id = "fbVideoPlayerBtn";
      videoBtn.type = "button";
      videoBtn.className = "btn btn-small";
      actions.insertBefore(videoBtn, fav || null);
    }
    let copyBtn = $("#copyLinkBtn");
    if (!copyBtn) {
      copyBtn = document.createElement("button");
      copyBtn.id = "copyLinkBtn";
      copyBtn.type = "button";
      copyBtn.className = "btn btn-small";
      copyBtn.textContent = "Copy link";
      actions.insertBefore(copyBtn, fav || null);
    }
    for (const [id, text] of [["sourceOriginalBtn", "Original"], ["sourceBackupBtn", "Backup"], ["addBackupBtn", "Add backup link"]]) {
      let btn = $("#" + id);
      if (!btn) {
        btn = document.createElement("button");
        btn.id = id;
        btn.type = "button";
        btn.className = "btn btn-small";
        btn.textContent = text;
        actions.insertBefore(btn, fav || null);
      }
      btn.hidden = true;
    }
  }

  function ensureBackupField() {
    if ($("#editBackupUrl")) return;
    const modal = $("#editModal");
    if (!modal) return;
    const actionsRow = modal.querySelector(".modal-actions");
    const label = document.createElement("label");
    label.innerHTML = 'Backup link (optional)' +
      '<input type="url" id="editBackupUrl" placeholder="Paste the same clip on YouTube / TikTok / Instagram">' +
      '<span style="display:block;font-size:12px;color:#9a9a9a;margin-top:4px;">If the original site blocks embedding, ReelRoom plays this link instead.</span>';
    if (actionsRow) actionsRow.parentNode.insertBefore(label, actionsRow);
    else modal.appendChild(label);
  }

  function activeSources(item) {
    let originalEmbed = safeUrl(item.embed_url);
    if (item.platform === "facebook") {
      const { primary, alt } = facebookEmbeds(item);
      originalEmbed = state.fbUseAlt && alt ? alt : primary;
    }
    const sources = [{
      key: "original",
      label: PLATFORM_LABEL[item.platform] || "Original",
      embed: originalEmbed,
      platform: item.platform,
      media_type: item.media_type,
      url: safeUrl(item.canonical_url || item.url),
    }];
    const backupEmbed = safeUrl(item.backup_embed_url);
    if (backupEmbed) {
      sources.push({
        key: "backup",
        label: PLATFORM_LABEL[item.backup_platform] || "Backup",
        embed: backupEmbed,
        platform: item.backup_platform,
        media_type: item.backup_media_type,
        url: safeUrl(item.backup_canonical_url || item.backup_url),
      });
    }
    return sources;
  }

  // Facebook's player renders at the iframe's width and clips anything taller,
  // so the frame must match the video's real shape. The preview image has the
  // same proportions as the video, so we measure it once and cache the result.
  const aspectCache = new Map();

  function measureAspect(item) {
    return new Promise((resolve) => {
      if (aspectCache.has(item.id)) return resolve(aspectCache.get(item.id));
      const src = thumbnailFor(item);
      if (!src) return resolve(null);
      const img = new Image();
      const done = (val) => { if (val) aspectCache.set(item.id, val); resolve(val); };
      img.onload = () => {
        const a = img.naturalWidth / img.naturalHeight;
        done(Number.isFinite(a) && a > 0.1 && a < 10 ? a : null);
      };
      img.onerror = () => done(null);
      img.src = src;
    });
  }

  // ===== v10: Instagram crop geometry =====
  // Measured from real embeds on a 411px-wide viewport, confirmed identical on two
  // reels and at two pixel densities (agreement within 0.2 percentage points).
  // Everything is a fraction of the IFRAME's own width, so we render the frame at
  // a fixed known width and scale the result — that keeps the crop identical on a
  // phone, a tablet and a TV, and sidesteps Instagram's own 480px card cap.
  const IG_RENDER_W = 480;
  const IG_GEOM = {
    reel: { top: 0.052, w: 0.7035, h: 1.2500 },  // header 5.2%, video 70.35% x 125%
    post: { top: 0.143, w: 0.9200, h: 0.6050 },  // carousels/photos: wider, more padding
  };
  function igKind(item) { return item && item.media_type === "reel" ? "reel" : "post"; }
  function igCropActive() { return inFullscreen() && state.igActive && !prefs.igFullPost; }

  function layoutInstagram() {
    const win = document.getElementById("igWindow");
    const frame = win && win.querySelector("iframe");
    const stage = $("#playerStage");
    if (!win || !frame || !stage) return;
    const crop = igCropActive();
    win.classList.toggle("cropping", crop);
    win.classList.toggle("fullpost", inFullscreen() && state.igActive && !!prefs.igFullPost);
    if (!crop) {
      frame.style.width = "100%";
      frame.style.height = "100%";
      frame.style.transform = "none";
      return;
    }
    const item = currentList()[state.playerIndex];
    const kind = igKind(item);
    const G = IG_GEOM[kind];
    const adj = (prefs.igAdjust && prefs.igAdjust[kind]) || { zoom: 1, dy: 0 };
    const Wi = IG_RENDER_W, Hi = Wi * 2;   // 2:1 reproduces the measured page proportions
    const Vw = G.w * Wi, Vh = G.h * Wi;
    const Vx = (Wi - Vw) / 2, Vy = G.top * Wi;
    const Wc = stage.clientWidth || window.innerWidth;
    const Hc = stage.clientHeight || window.innerHeight;
    const k = Math.min(Wc / Vw, Hc / Vh) * (adj.zoom || 1);
    const tx = (Wc - Vw * k) / 2 - Vx * k;
    const ty = (Hc - Vh * k) / 2 - Vy * k + (adj.dy || 0) * Hc;
    frame.style.width = Wi + "px";
    frame.style.height = Hi + "px";
    frame.style.transform = "translate(" + tx.toFixed(1) + "px," + ty.toFixed(1) + "px) scale(" + k.toFixed(4) + ")";
  }

  function nudgeInstagram(what, dir) {
    const item = currentList()[state.playerIndex];
    const kind = igKind(item);
    const a = prefs.igAdjust[kind] || (prefs.igAdjust[kind] = { zoom: 1, dy: 0 });
    if (what === "zoom") a.zoom = Math.min(2.5, Math.max(0.5, (a.zoom || 1) * (dir > 0 ? 1.06 : 1 / 1.06)));
    if (what === "dy") a.dy = Math.min(0.4, Math.max(-0.4, (a.dy || 0) + dir * 0.02));
    if (what === "reset") { a.zoom = 1; a.dy = 0; }
    savePrefs(); layoutInstagram();
  }

  function syncIgButtons() {
    const on = state.igActive;
    for (const id of ["#fsFullPostBtn", "#fsAdjustBtn"]) {
      const b = $(id); if (b) b.style.display = on ? "" : "none";
    }
    const fp = $("#fsFullPostBtn");
    if (fp) { fp.textContent = prefs.igFullPost ? "Crop to video" : "Show full post"; fp.setAttribute("aria-pressed", String(!!prefs.igFullPost)); }
    if (!on) { const p = $("#cropAdjust"); if (p) { p.hidden = true; p.classList.remove("open"); } }
  }

  let lastFitKey = "", stageRO = null, fitRaf = 0;

  // Size the Facebook box to fit INSIDE the stage. The stage now has a definite
  // height in every mode, so its size does not depend on the box -> no feedback
  // loop, and the box can never end up taller than the space and get clipped.
  function fitFacebook(item) {
    const box = document.getElementById("stageBox");
    const stage = $("#playerStage");
    if (!box || !stage || !item) return;
    const a = aspectCache.get(item.id) || (item.media_type === "reel" ? 9 / 16 : 16 / 9);
    const big = inFullscreen() || !!prefs.theatre;
    const availW = stage.clientWidth || Math.min(1100, window.innerWidth - 48);
    const availH = stage.clientHeight || Math.round(big ? window.innerHeight : Math.min(window.innerHeight * 0.70, 620));
    let w = availH * a;
    let h = availH;
    if (w > availW) { w = availW; h = w / a; }
    w = Math.max(60, Math.floor(w));
    h = Math.max(60, Math.floor(h));
    const key = w + "x" + h;
    if (key === lastFitKey) return;
    lastFitKey = key;
    box.style.width = w + "px";
    box.style.height = h + "px";
  }

  function sizeFacebookStage(item) {
    if (!item) return;
    fitFacebook(item);
    measureAspect(item).then((a) => {
      const current = currentList()[state.playerIndex];
      if (current && current.id === item.id) { lastFitKey = ""; fitFacebook(item); }
    });
  }

  // Re-fit whenever the stage actually changes size — title wrapping, buttons
  // wrapping, rotation, entering/leaving fullscreen. This is the crop fix.
  function observeStage() {
    const stage = $("#playerStage");
    if (!stage || typeof window.ResizeObserver !== "function") return;
    if (stageRO) stageRO.disconnect();
    let burst = 0, burstAt = 0;
    stageRO = new window.ResizeObserver(() => {
      cancelAnimationFrame(fitRaf);
      fitRaf = requestAnimationFrame(() => {
        const now = Date.now();
        if (now - burstAt > 400) { burst = 0; burstAt = now; }
        if (++burst > 10) return; // belt and braces: never spin on a pathological layout
        const it = currentList()[state.playerIndex];
        if (it && state.fbAutoFit) fitFacebook(it);
        if (state.igActive) layoutInstagram();
      });
    });
    stageRO.observe(stage);
  }

  // ---- fullscreen chrome: tap an edge to reveal, auto-hide when idle ----
  let fsIdleTimer = null;
  function ensureFsChrome() {
    const shell = $("#playerShell");
    if (!shell || shell.querySelector(".fs-hit-top")) return;
    for (const pos of ["top", "bottom"]) {
      const z = document.createElement("div");
      z.className = "fs-hit fs-hit-" + pos;
      z.setAttribute("aria-hidden", "true");
      z.addEventListener("pointerenter", () => showFsControls());
      z.addEventListener("click", (e) => {
        e.stopPropagation();
        if ($("#playerShell").classList.contains("fs-idle")) showFsControls();
        else hideFsControls();
      });
      shell.appendChild(z);
    }
  }
  function showFsControls() {
    const shell = $("#playerShell");
    if (!shell) return;
    shell.classList.remove("fs-idle");
    clearTimeout(fsIdleTimer);
    if (inFullscreen()) fsIdleTimer = setTimeout(hideFsControls, 3500);
  }
  function hideFsControls() {
    clearTimeout(fsIdleTimer); fsIdleTimer = null;
    const shell = $("#playerShell");
    if (shell && inFullscreen()) shell.classList.add("fs-idle");
  }
  function syncFsChrome() {
    const shell = $("#playerShell");
    if (!shell) return;
    if (inFullscreen()) { ensureFsChrome(); showFsControls(); }
    else {
      clearTimeout(fsIdleTimer); fsIdleTimer = null;
      shell.classList.remove("fs-idle", "counting");
      const p = $("#cropAdjust"); if (p) { p.hidden = true; p.classList.remove("open"); }
      const ab = $("#fsAdjustBtn"); if (ab) ab.setAttribute("aria-pressed", "false");
    }
  }

  function stageClass(src, embed) {
    if (src.platform === "facebook") {
      if (embed.includes("/plugins/post.php")) return "stage-post";
      // Shape varies per video; sizeFacebookStage() measures and fits it.
      return "stage-fb-auto";
    }
    if (["tiktok", "instagram"].includes(src.platform) && ["reel", "short", "video"].includes(src.media_type)) return "stage-vertical";
    if (src.platform === "youtube" && src.media_type === "short") return "stage-vertical";
    if (src.platform === "instagram" && ["post", "image"].includes(src.media_type)) return "stage-post";
    return "stage-video";
  }

  function setFacebookPlayer(mode) {
    const item = currentList()[state.playerIndex];
    if (!item || item.platform !== "facebook") return;
    const { primary } = facebookEmbeds(item);
    const primaryIsPost = primary.includes("/plugins/post.php");
    state.fbUseAlt = mode === "post" ? !primaryIsPost : primaryIsPost;
    renderPlayer(item);
  }

  function embedWithApi(platform, item, url) {
    if (!url) return url;
    try {
      const u = new URL(url);
      if (/youtube(-nocookie)?\.com$/.test(u.hostname)) {
        u.searchParams.set("enablejsapi", "1");
        if (/^https?:/.test(location.origin)) u.searchParams.set("origin", location.origin);
        const pos = Number(item.watch_seconds) || 0;
        const prog = Number(item.progress) || 0;
        if (pos > 5 && prog > 0.02 && prog < 0.92) u.searchParams.set("start", String(Math.floor(pos)));
      }
      return u.href;
    } catch { return url; }
  }

  async function markOpened(item) {
    try {
      const updated = await api(`/api/items/${item.id}`, { method: "PATCH", body: { last_opened_at: new Date().toISOString() } });
      const idx = state.items.findIndex((i) => i.id === updated.id);
      if (idx >= 0) state.items[idx] = updated;
    } catch {}
  }

  function renderPlayer(item) {
    $("#playerTitle").textContent = displayTitle(item);
    $("#playerSub").textContent = [item.author, PLATFORM_LABEL[item.platform], TYPE_LABEL[item.media_type], item.collection].filter(Boolean).join(" · ");
    $("#openOriginalBtn").href = safeUrl(item.canonical_url || item.url);
    $("#favBtn").textContent = item.favorite ? "★ Favorited" : "☆ Favorite";
    $("#watchedBtn").textContent = item.watched ? "✓ Watched" : "Mark watched";

    const stage = $("#playerStage");
    ensurePlayerActionButtons();

    const sources = activeSources(item);
    const hasBackup = sources.length > 1;
    const useBackup = hasBackup && state.useBackup !== false;
    const active = useBackup ? sources[1] : sources[0];
    const embed = active.embed;

    const origBtn = $("#sourceOriginalBtn");
    const backBtn = $("#sourceBackupBtn");
    const addBackupBtn = $("#addBackupBtn");
    if (origBtn && backBtn) {
      origBtn.hidden = !hasBackup;
      backBtn.hidden = !hasBackup;
      if (hasBackup) {
        origBtn.textContent = (useBackup ? "" : "✓ ") + "Original · " + sources[0].label;
        backBtn.textContent = (useBackup ? "✓ " : "") + "Backup · " + sources[1].label;
        origBtn.disabled = !useBackup;
        backBtn.disabled = useBackup;
      }
    }
    if (addBackupBtn) {
      addBackupBtn.hidden = false;
      addBackupBtn.textContent = hasBackup ? "Change backup link" : "Add backup link";
    }
    $("#openOriginalBtn").href = active.url || safeUrl(item.canonical_url || item.url);

    const fbPostBtn = $("#fbPostPlayerBtn");
    const fbVideoBtn = $("#fbVideoPlayerBtn");
    if (fbPostBtn) fbPostBtn.hidden = true;
    if (fbVideoBtn) fbVideoBtn.hidden = true;
    if (!useBackup && item.platform === "facebook") {
      const { alt } = facebookEmbeds(item);
      if (alt && fbPostBtn && fbVideoBtn) {
        const usingPost = embed.includes("/plugins/post.php");
        fbPostBtn.hidden = false;
        fbVideoBtn.hidden = false;
        fbPostBtn.textContent = usingPost ? "Post player ✓" : "Try post player";
        fbVideoBtn.textContent = usingPost ? "Try video player" : "Video player ✓";
        fbPostBtn.disabled = usingPost;
        fbVideoBtn.disabled = !usingPost;
      }
    }

    cancelCountdown();
    const cls = stageClass(active, embed);
    const embedSrc = embedWithApi(active.platform, item, embed);
    state.igActive = active.platform === "instagram" && !!embedSrc;
    const frameHtml = `<iframe src="${esc(embedSrc)}" title="${esc(item.title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
    stage.innerHTML = embedSrc
      ? (state.igActive
          ? `<div class="${cls} ig-window" id="igWindow">${frameHtml}</div>`
          : `<div class="${cls}" id="stageBox">${frameHtml}</div>`)
      : `<div style="padding:40px;color:#aaa;">No embed available. Use “Open original”.</div>`;
    if (state.igActive) layoutInstagram();
    syncIgButtons();

    state.fbAutoFit = item.platform === "facebook" && !useBackup && !embed.includes("/plugins/post.php");
    lastFitKey = "";
    if (state.fbAutoFit) sizeFacebookStage(item);
    observeStage();
    syncFsChrome();

    // playback reporting + continue-watching tracking
    resetBridge(active.platform);
    state.activePlatform = active.platform;
    const frame = stage.querySelector("iframe");
    if (frame && active.platform === "youtube") {
      frame.addEventListener("load", () => {
        ytHandshake(frame);
        setTimeout(() => ytHandshake(frame), 900);
        setTimeout(() => ytHandshake(frame), 2600);
      });
    }
    startTracking(item);
    markOpened(item);
    renderUpNext({ ...item, platform: active.platform });
    if (prefs.autoplay && !reportsProgress(active.platform) && prefs.advanceSecs > 0) {
      startCountdown(prefs.advanceSecs);
    }
    clearTimeout(state.reportWatchdog);
    if (reportsProgress(active.platform)) {
      state.reportWatchdog = setTimeout(() => {
        if ($("#playerModal").hidden || bridge.duration > 0) return;
        if (prefs.autoplay && prefs.advanceSecs > 0) {
          setUpnextStatus("This player isn't reporting playback — falling back to the " + prefs.advanceSecs + "s timer.");
          startCountdown(prefs.advanceSecs);
        } else {
          setUpnextStatus("This player isn't reporting playback. Set a timer above, or press › for the next one.");
        }
      }, 12000);
    }
    $("#playerModal").classList.toggle("theatre", !!prefs.theatre);
    const titleEl = $("#playerTitle");
    if (titleEl) titleEl.title = displayTitle(item);
    updateFsBtn();

    const note = document.querySelector(".embed-note");
    if (note) {
      if (useBackup) {
        note.textContent = "Playing your backup link (" + sources[1].label + "). Switch to “Original” to see the source post.";
      } else if (item.platform === "facebook") {
        note.textContent = "If Facebook says “content owned by someone else”, Facebook is refusing to let this video play on other websites. Add a backup link to the same clip on YouTube, TikTok or Instagram and ReelRoom will play that here instead.";
      } else {
        note.textContent = "Playback blocked? Use “Open original”, or add a backup link to the same clip on another site.";
      }
    }

    const list = currentList();
    $("#prevBtn").disabled = state.playerIndex <= 0;
    $("#nextBtn").disabled = state.playerIndex >= list.length - 1;
  }

  function closePlayer() {
    const item = currentList()[state.playerIndex];
    cancelCountdown();
    stopTracking();
    clearTimeout(state.reportWatchdog);
    if (item) saveProgress(item, true).then(() => renderContinue());
    if (inFullscreen()) exitFullscreen();
    $("#playerModal").hidden = true;
    $("#playerStage").innerHTML = "";
    document.body.style.overflow = "";
    state.playerIndex = -1;
    state.igActive = false;
    resetBridge("");
    const back = state.returnFocusId && document.querySelector(`#grid .card[data-id="${state.returnFocusId}"]`);
    if (back) back.focus();
  }

  function stepPlayer(delta) {
    const list = currentList();
    const next = state.playerIndex + delta;
    if (next < 0 || next >= list.length) return;
    const prevItem = list[state.playerIndex];
    cancelCountdown();
    stopTracking();
    clearTimeout(state.reportWatchdog);
    if (prevItem) saveProgress(prevItem, true);
    state.playerIndex = next;
    state.fbUseAlt = false;
    state.useBackup = null;
    renderPlayer(list[next]);
  }

  async function copyCurrentLink() {
    const item = currentList()[state.playerIndex];
    const url = item?.canonical_url || item?.url;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied");
    } catch {
      prompt("Copy this link:", url);
    }
  }

  async function toggleFav(item) {
    try {
      const updated = await api(`/api/items/${item.id}`, { method: "PATCH", body: { favorite: !item.favorite } });
      Object.assign(item, updated);
      render();
      if (!$("#playerModal").hidden && state.playerIndex >= 0) renderPlayer(currentList()[state.playerIndex]);
    } catch (e) { toast(e.message); }
  }

  async function toggleWatched(item) {
    try {
      const updated = await api(`/api/items/${item.id}`, { method: "PATCH", body: { watched: !item.watched } });
      Object.assign(item, updated);
      render();
      if (!$("#playerModal").hidden && state.playerIndex >= 0) renderPlayer(currentList()[state.playerIndex]);
    } catch (e) { toast(e.message); }
  }

  async function deleteItem(item) {
    if (!confirm(`Delete “${item.title || item.url}” from your library?`)) return;
    try {
      await api(`/api/items/${item.id}`, { method: "DELETE" });
      state.items = state.items.filter((i) => i.id !== item.id);
      closePlayer();
      render();
      toast("Deleted");
    } catch (e) { toast(e.message); }
  }

  // ---------- add ----------
  function detectPlatform(url) {
    const u = url.toLowerCase();
    if (u.includes("youtube.com") || u.includes("youtu.be")) return "youtube";
    if (u.includes("tiktok.com")) return "tiktok";
    if (u.includes("instagram.com")) return "instagram";
    if (u.includes("facebook.com") || u.includes("fb.watch")) return "facebook";
    return null;
  }

  async function addSingle() {
    const url = $("#singleUrl").value.trim();
    if (!url) { toast("Paste a link first"); return; }
    try {
      const data = await api("/api/items", {
        method: "POST",
        body: {
          url,
          title: $("#singleTitle").value.trim() || undefined,
          collection: $("#singleCollection").value.trim() || undefined,
          tags: $("#singleTags").value.trim() || undefined,
          notes: $("#singleNotes").value.trim() || undefined,
        },
      });
      if (data.duplicate) {
        toast("Already in your library");
      } else {
        state.items.unshift(data.item);
        toast("Added to library");
      }
      $("#singleUrl").value = ""; $("#singleTitle").value = ""; $("#singleTags").value = ""; $("#singleNotes").value = "";
      $("#detectedPlatform").textContent = "";
      render();
      schedulePoll();
    } catch (e) { toast(e.message); }
  }

  async function addBulk() {
    const text = $("#bulkUrls").value.trim();
    if (!text) { toast("Paste at least one link"); return; }
    const btn = $("#bulkAddBtn");
    btn.disabled = true; btn.textContent = "Adding…";
    try {
      const data = await api("/api/items/bulk", {
        method: "POST",
        body: { urls: text, collection: $("#bulkCollection").value.trim() || undefined, tags: $("#bulkTags").value.trim() || undefined },
      });
      const lines = [`Added: ${data.added.length}`, `Duplicates skipped: ${data.duplicates.length}`];
      if (data.errors.length) lines.push(`Errors: ${data.errors.length}`, ...data.errors.slice(0, 8).map((e) => `• ${e.url} — ${e.error}`));
      $("#bulkResult").textContent = lines.join("\n");
      toast(`Added ${data.added.length} link${data.added.length === 1 ? "" : "s"}`);
      $("#bulkUrls").value = "";
      await loadItems();
    } catch (e) { toast(e.message); }
    finally { btn.disabled = false; btn.textContent = "Add all links"; }
  }

  // ---------- edit ----------
  function openEdit(item) {
    state.editingId = item.id;
    $("#editTitle").value = item.title || "";
    $("#editAuthor").value = item.author || "";
    $("#editCollection").value = item.collection || "";
    $("#editTags").value = (item.tags || []).join(", ");
    $("#editThumb").value = item.thumbnail_url || "";
    $("#editNotes").value = item.notes || "";
    $("#editType").value = item.media_type || "video";
    $("#editFavorite").checked = !!item.favorite;
    ensureBackupField();
    $("#editBackupUrl").value = item.backup_url || "";
    $("#editModal").hidden = false;
  }

  async function saveEdit() {
    if (!state.editingId) return;
    try {
      const updated = await api(`/api/items/${state.editingId}`, {
        method: "PATCH",
        body: {
          title: $("#editTitle").value.trim(),
          author: $("#editAuthor").value.trim(),
          collection: $("#editCollection").value.trim(),
          tags: $("#editTags").value,
          thumbnail_url: $("#editThumb").value.trim() || null,
          notes: $("#editNotes").value.trim(),
          media_type: $("#editType").value,
          favorite: $("#editFavorite").checked,
          backup_url: $("#editBackupUrl") ? $("#editBackupUrl").value.trim() : "",
        },
      });
      const idx = state.items.findIndex((i) => i.id === updated.id);
      if (idx >= 0) state.items[idx] = updated;
      $("#editModal").hidden = true;
      render();
      if (!$("#playerModal").hidden && state.playerIndex >= 0) renderPlayer(currentList()[state.playerIndex]);
      toast("Saved");
    } catch (e) { toast(e.message); }
  }

  async function refreshMeta() {
    if (!state.editingId) return;
    try {
      const updated = await api(`/api/items/${state.editingId}/refresh`, { method: "POST" });
      const idx = state.items.findIndex((i) => i.id === updated.id);
      if (idx >= 0) state.items[idx] = updated;
      $("#editTitle").value = updated.title || "";
      $("#editAuthor").value = updated.author || "";
      $("#editThumb").value = updated.thumbnail_url || "";
      render();
      toast(updated.metadata_status === "ok" ? "Metadata refreshed" : "Metadata unavailable — you can edit it manually");
    } catch (e) { toast(e.message); }
  }

  // ---------- import/export/demo ----------
  async function clearDemo() {
    if (!confirm("Remove all demo items? Your own links will stay.")) return;
    try {
      const data = await api("/api/demo", { method: "DELETE" });
      state.items = state.items.filter((i) => !i.demo);
      render();
      toast(`Removed ${data.deleted} demo item${data.deleted === 1 ? "" : "s"}`);
    } catch (e) { toast(e.message); }
  }

  async function importFile(file) {
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const data = await api("/api/import", { method: "POST", body: json });
      toast(`Imported ${data.added} link${data.added === 1 ? "" : "s"} (${data.duplicates} duplicates skipped)`);
      await loadItems();
    } catch (e) { toast("Import failed: " + e.message); }
  }

  // ---------- events ----------
  // ================= v8: prefs, fullscreen, theatre, TV, up-next =================
  const PREFS_KEY = "reelroom.prefs.v1";
  function loadPrefs() { try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch { return {}; } }
  const prefs = Object.assign({ tvMode: null, theatre: false, autoplay: true, advanceSecs: 0, continueClearedAt: null,
    igFullPost: false, igAdjust: { reel: { zoom: 1, dy: 0 }, post: { zoom: 1, dy: 0 } } }, loadPrefs());
  if (!prefs.igAdjust || !prefs.igAdjust.reel) prefs.igAdjust = { reel: { zoom: 1, dy: 0 }, post: { zoom: 1, dy: 0 } };
  function savePrefs() { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch {} }

  function looksLikeTV() {
    return /AFT[MTS]?|AmazonWebAppPlatform|Silk\/|SMART-TV|SmartTV|HbbTV|BRAVIA|Roku|GoogleTV|Android TV|AppleTV/i.test(navigator.userAgent || "");
  }
  function tvEnabled() { return prefs.tvMode === null ? looksLikeTV() : !!prefs.tvMode; }
  function applyTvMode() {
    document.body.classList.toggle("tv-mode", tvEnabled());
    const b = $("#tvModeBtn");
    if (b) { b.setAttribute("aria-pressed", String(tvEnabled())); b.title = tvEnabled() ? "TV mode is on" : "TV / remote mode"; }
  }
  function toggleTvMode() {
    prefs.tvMode = !tvEnabled(); savePrefs(); applyTvMode(); render();
    toast(tvEnabled() ? "TV mode on — use the arrow keys" : "TV mode off");
    if (tvEnabled()) setTimeout(() => { const c = $("#grid .card"); if (c) c.focus(); }, 40);
  }

  // ---- fullscreen / theatre ----
  function pseudoFs() { const s = $("#playerShell"); return !!s && s.classList.contains("pseudo-fs"); }
  function inFullscreen() { return !!document.fullscreenElement || pseudoFs(); }
  function updateFsBtn() {
    const b = $("#fullscreenBtn");
    if (b) {
      const on = inFullscreen();
      b.title = on ? "Exit fullscreen (F / Esc)" : "Fullscreen (F)";
      b.setAttribute("aria-label", on ? "Exit fullscreen" : "Fullscreen");
      b.setAttribute("aria-pressed", String(on));
    }
    const t = $("#theatreBtn");
    if (t) t.setAttribute("aria-pressed", String(prefs.theatre));
  }
  function refitStage() {
    const it = currentList()[state.playerIndex];
    if (it && state.fbAutoFit) { lastFitKey = ""; fitFacebook(it); }
    if (state.igActive) { layoutInstagram(); syncIgButtons(); }
  }
  async function toggleFullscreen() {
    const shell = $("#playerShell");
    if (!shell) return;
    if (inFullscreen()) return exitFullscreen();
    try {
      if (!shell.requestFullscreen) throw new Error("unsupported");
      await shell.requestFullscreen();
    } catch {
      shell.classList.add("pseudo-fs");
    }
    updateFsBtn(); syncFsChrome(); setTimeout(refitStage, 60);
    if (prefs.fsHintVersion !== 10) {
      prefs.fsHintVersion = 10; prefs.fsHintShown = true; savePrefs();
      toast("Tap the video for controls · ✕ top-left to exit");
    }
  }
  function exitFullscreen() {
    const shell = $("#playerShell");
    if (shell) shell.classList.remove("pseudo-fs");
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    updateFsBtn(); syncFsChrome(); setTimeout(refitStage, 60);
  }
  function toggleTheatre() {
    prefs.theatre = !prefs.theatre; savePrefs();
    $("#playerModal").classList.toggle("theatre", prefs.theatre);
    updateFsBtn(); setTimeout(refitStage, 60);
    toast(prefs.theatre ? "Theatre mode on" : "Theatre mode off");
  }

  // ---- remote / keyboard grid navigation ----
  function gridNav(e, container) {
    const cards = Array.from(container.querySelectorAll(".card"));
    if (!cards.length) return;
    const i = cards.indexOf(document.activeElement.closest ? document.activeElement.closest(".card") : null);
    if (i < 0) { if (["ArrowRight", "ArrowDown"].includes(e.key)) { e.preventDefault(); cards[0].focus(); } return; }
    const gap = 14;
    let cols = 0;
    if (container.classList.contains("rail")) cols = cards.length;
    else {
      const tpl = (window.getComputedStyle(container).gridTemplateColumns || "").trim();
      if (tpl && tpl !== "none") cols = tpl.split(/\s+/).filter(Boolean).length;
      if (!cols) {
        const first = cards[0].getBoundingClientRect();
        cols = Math.max(1, Math.round((container.clientWidth + gap) / ((first.width || 240) + gap)));
      }
    }
    cols = Math.max(1, cols);
    let n = null;
    if (e.key === "ArrowRight") n = i + 1;
    if (e.key === "ArrowLeft") n = i - 1;
    if (e.key === "ArrowDown") n = i + cols;
    if (e.key === "ArrowUp") n = i - cols;
    if (n === null) return;
    e.preventDefault();
    if (n >= 0 && n < cards.length) { cards[n].focus(); cards[n].scrollIntoView({ block: "nearest", inline: "nearest" }); }
  }

  // ---- playback bridge: YouTube + TikTok report position and ending ----
  const bridge = { win: null, platform: "", currentTime: 0, duration: 0, ended: false, openSeconds: 0 };
  function resetBridge(platform) {
    bridge.win = null; bridge.platform = platform || "";
    bridge.currentTime = 0; bridge.duration = 0; bridge.ended = false; bridge.openSeconds = 0;
  }
  function ytHandshake(iframe) {
    if (!iframe || !iframe.contentWindow) return;
    const msg = JSON.stringify({ event: "listening", id: "reelroom", channel: "widget" });
    for (const origin of ["https://www.youtube-nocookie.com", "https://www.youtube.com"]) {
      try { iframe.contentWindow.postMessage(msg, origin); } catch {}
    }
  }
  function onPlayerMessage(ev) {
    const iframe = $("#playerStage iframe");
    if (!iframe || ev.source !== iframe.contentWindow) return;
    const origin = String(ev.origin || "");
    if (bridge.platform === "youtube" && /youtube(-nocookie)?\.com$/.test(origin.replace(/^https?:\/\//, ""))) {
      let data = ev.data;
      if (typeof data === "string") { try { data = JSON.parse(data); } catch { return; } }
      if (!data || typeof data !== "object") return;
      if (data.event === "onReady") ytHandshake(iframe);
      const info = data.info || {};
      if (typeof info.currentTime === "number") bridge.currentTime = info.currentTime;
      if (typeof info.duration === "number" && info.duration > 0) bridge.duration = info.duration;
      const st = data.event === "onStateChange" ? data.info : info.playerState;
      if (st === 0) handleEnded();
      return;
    }
    if (bridge.platform === "tiktok" && /tiktok\.com$/.test(origin.replace(/^https?:\/\//, ""))) {
      const d = ev.data;
      if (!d || d["x-tiktok-player"] !== true) return;
      if (d.type === "onCurrentTime" && d.value) {
        if (typeof d.value.currentTime === "number") bridge.currentTime = d.value.currentTime;
        if (typeof d.value.duration === "number" && d.value.duration > 0) bridge.duration = d.value.duration;
      }
      if (d.type === "onStateChange" && Number(d.value) === 0) handleEnded();
    }
  }
  function reportsProgress(platform) { return platform === "youtube" || platform === "tiktok"; }
  function liveProgress() {
    if (bridge.duration > 0) return Math.min(1, Math.max(0, bridge.currentTime / bridge.duration));
    return 0;
  }

  // ---- progress persistence ----
  let saveTimer = null, tickTimer = null;
  function startTracking(item) {
    stopTracking();
    tickTimer = setInterval(() => { bridge.openSeconds += 5; }, 5000);
    saveTimer = setInterval(() => saveProgress(item, false), 15000);
  }
  function stopTracking() { clearInterval(tickTimer); clearInterval(saveTimer); tickTimer = saveTimer = null; }
  async function saveProgress(item, final) {
    if (!item) return;
    const p = liveProgress();
    const pos = bridge.duration > 0 ? Math.round(bridge.currentTime) : Math.round(bridge.openSeconds);
    const payload = { last_opened_at: new Date().toISOString(), watch_seconds: pos };
    if (p > 0) payload.progress = p;
    if (p >= 0.92 && !item.watched) payload.watched = true;
    // don't overwrite a known position with a blank one
    if (!p && !pos && !final) return;
    try {
      const updated = await api(`/api/items/${item.id}`, { method: "PATCH", body: payload });
      const idx = state.items.findIndex((i) => i.id === updated.id);
      if (idx >= 0) state.items[idx] = updated;
      if (payload.watched) render();
    } catch {}
  }

  // ---- up next + autoplay ----
  let countdownTimer = null;
  function cancelCountdown() {
    clearInterval(countdownTimer); countdownTimer = null;
    const c = $("#autoplayCountdown"); if (c) c.hidden = true;
    const fb2 = $("#fsCountdown"); if (fb2) fb2.hidden = true;
    const shell = $("#playerShell"); if (shell) shell.classList.remove("counting");
  }
  function startCountdown(seconds) {
    cancelCountdown();
    const list = currentList();
    if (state.playerIndex >= list.length - 1) { setUpnextStatus("End of this list."); return; }
    let n = seconds;
    const box = $("#autoplayCountdown"), num = $("#countdownNum");
    box.hidden = false; num.textContent = n;
    const fb = $("#fsCountdown"), fn = $("#fsCountNum");
    if (fb) fb.hidden = false; if (fn) fn.textContent = n;
    const shell = $("#playerShell"); if (shell) shell.classList.add("counting");
    countdownTimer = setInterval(() => {
      n--; num.textContent = n;
      const fn2 = $("#fsCountNum"); if (fn2) fn2.textContent = n;
      if (n <= 0) { cancelCountdown(); stepPlayer(1); }
    }, 1000);
  }
  function handleEnded() {
    if (bridge.ended) return;
    bridge.ended = true;
    const item = currentList()[state.playerIndex];
    if (item) saveProgress(item, true);
    if (prefs.autoplay) startCountdown(5);
  }
  function setUpnextStatus(text) { const el = $("#upnextStatus"); if (el) el.textContent = text; }
  function renderUpNext(item) {
    const bar = $("#upnextBar"), listBox = $("#upnextList");
    if (!bar || !listBox) return;
    const list = currentList();
    const upcoming = list.slice(state.playerIndex + 1, state.playerIndex + 5);
    listBox.innerHTML = upcoming.length
      ? upcoming.map((u, k) => {
          const th = thumbnailFor(u);
          return `<button class="upnext-item" data-jump="${state.playerIndex + 1 + k}">
            ${th ? `<img src="${esc(th)}" alt="" loading="lazy" onerror="this.remove()">` : `<img alt="">`}
            <span><span class="un-t">${esc(displayTitle(u))}</span><span class="un-m">${esc(PLATFORM_LABEL[u.platform] || u.platform)}</span></span>
          </button>`;
        }).join("")
      : `<span class="upnext-empty">Nothing after this in the current list.</span>`;
    listBox.querySelectorAll("[data-jump]").forEach((b) => b.addEventListener("click", () => {
      cancelCountdown();
      const target = Number(b.dataset.jump);
      stepPlayer(target - state.playerIndex);
    }));

    const ab = $("#autoplayBtn");
    if (ab) { ab.textContent = "Autoplay: " + (prefs.autoplay ? "on" : "off"); ab.setAttribute("aria-pressed", String(prefs.autoplay)); ab.classList.toggle("btn-primary", prefs.autoplay); }
    const sel = $("#advanceSelect"); if (sel) sel.value = String(prefs.advanceSecs);

    if (!prefs.autoplay) setUpnextStatus("Autoplay is off — press › for the next one.");
    else if (reportsProgress(item.platform)) setUpnextStatus("Advances when the video actually ends.");
    else if (prefs.advanceSecs > 0) setUpnextStatus(`${PLATFORM_LABEL[item.platform]} doesn't report endings — using the ${prefs.advanceSecs}s timer.`);
    else setUpnextStatus(`${PLATFORM_LABEL[item.platform]} doesn't report endings — set a timer above, or press ›.`);
  }

  // ---- continue watching ----
  function continueItems() {
    const cut = prefs.continueClearedAt ? Date.parse(prefs.continueClearedAt) : 0;
    return state.items
      .filter((i) => i.last_opened_at && !i.watched && Date.parse(i.last_opened_at) > cut)
      .sort((a, b) => String(b.last_opened_at).localeCompare(String(a.last_opened_at)))
      .slice(0, 12);
  }
  function renderContinue() {
    const sec = $("#continueSection"), rail = $("#continueRail");
    if (!sec || !rail) return;
    const items = continueItems();
    sec.hidden = items.length === 0;
    if (!items.length) { rail.innerHTML = ""; return; }
    rail.innerHTML = items.map((item) => `
      <article class="card" data-id="${item.id}" tabindex="0" role="button" aria-label="Resume ${esc(displayTitle(item))}">
        ${thumbHtml(item)}
        <div class="card-body"><h3 class="card-title">${esc(displayTitle(item))}</h3>
        <div class="card-author">${esc(item.author || PLATFORM_LABEL[item.platform] || "")}</div></div>
      </article>`).join("");
    rail.querySelectorAll(".card").forEach((card) => {
      card.addEventListener("click", () => openPlayer(card.dataset.id, true));
      card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPlayer(card.dataset.id, true); } });
    });
  }

  function bind() {
    $("#addBtn").addEventListener("click", () => { $("#addModal").hidden = false; $("#singleUrl").focus(); });
    $("#emptyAddBtn").addEventListener("click", () => { $("#addModal").hidden = false; $("#singleUrl").focus(); });
    $$("[data-close]").forEach((b) => b.addEventListener("click", () => { $("#" + b.dataset.close).hidden = true; }));
    $$(".modal-backdrop").forEach((m) => m.addEventListener("click", (e) => { if (e.target === m) { m.hidden = true; if (m.id === "playerModal") closePlayer(); } }));

    $("#menuBtn").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
    $("#brandLink").addEventListener("click", (e) => { e.preventDefault(); state.view = "all"; state.platform = ""; state.collection = ""; state.tag = ""; state.search = ""; $("#searchInput").value = ""; render(); });

    $("#searchInput").addEventListener("input", debounce((e) => { state.search = e.target.value.trim(); render(); }, 180));
    $("#sortSelect").addEventListener("change", (e) => { state.sort = e.target.value; render(); });

    $$(".side-link[data-view]").forEach((b) => b.addEventListener("click", () => { state.view = b.dataset.view; state.platform = ""; state.collection = ""; state.tag = ""; render(); $("#sidebar").classList.remove("open"); }));
    $$(".platform-link").forEach((b) => b.addEventListener("click", () => { state.platform = state.platform === b.dataset.platform ? "" : b.dataset.platform; state.view = "all"; render(); $("#sidebar").classList.remove("open"); }));
    $$("#platformChips .chip").forEach((c) => c.addEventListener("click", () => { state.platform = c.dataset.platform; render(); }));

    $("#moreBtn").addEventListener("click", (e) => { e.stopPropagation(); $("#moreMenu").hidden = !$("#moreMenu").hidden; });
    document.addEventListener("click", () => { $("#moreMenu").hidden = true; });
    $("#moreMenu").addEventListener("click", (e) => {
      const act = e.target.dataset.action;
      if (act === "export") window.location.href = "/api/export";
      if (act === "import") $("#importFile").click();
      if (act === "clear-demo") clearDemo();
      if (act === "logout") doLogout();
    });
    $("#clearDemoBtn").addEventListener("click", clearDemo);
    $("#importFile").addEventListener("change", (e) => { if (e.target.files[0]) importFile(e.target.files[0]); e.target.value = ""; });

    $$(".tab").forEach((t) => t.addEventListener("click", () => {
      $$(".tab").forEach((x) => x.classList.toggle("active", x === t));
      $("#tab-single").hidden = t.dataset.tab !== "single";
      $("#tab-bulk").hidden = t.dataset.tab !== "bulk";
    }));
    $("#singleUrl").addEventListener("input", (e) => {
      const p = detectPlatform(e.target.value.trim());
      $("#detectedPlatform").innerHTML = e.target.value.trim()
        ? (p ? `<span class="ok">Detected: ${PLATFORM_LABEL[p]}</span>` : `<span class="bad">Unsupported platform</span>`)
        : "";
    });
    $("#singleAddBtn").addEventListener("click", addSingle);
    $("#bulkAddBtn").addEventListener("click", addBulk);

    stampVersion();
    ensurePlayerActionButtons();
    $("#closePlayerBtn").addEventListener("click", closePlayer);
    $("#prevBtn").addEventListener("click", () => stepPlayer(-1));
    $("#nextBtn").addEventListener("click", () => stepPlayer(1));
    const playerActions = document.querySelector(".player-actions");
    if (playerActions) {
      playerActions.addEventListener("click", (e) => {
        const id = e.target && e.target.id;
        if (id === "fbPostPlayerBtn") setFacebookPlayer("post");
        if (id === "fbVideoPlayerBtn") setFacebookPlayer("video");
        if (id === "sourceOriginalBtn" || id === "sourceBackupBtn") {
          state.useBackup = id === "sourceBackupBtn";
          const it = currentList()[state.playerIndex];
          if (it) renderPlayer(it);
        }
        if (id === "addBackupBtn") {
          const it = currentList()[state.playerIndex];
          if (it) {
            openEdit(it);
            const f = $("#editBackupUrl");
            if (f) f.focus();
          }
        }
      });
    }
    $("#copyLinkBtn").addEventListener("click", copyCurrentLink);
    $("#favBtn").addEventListener("click", () => { const it = currentList()[state.playerIndex]; if (it) toggleFav(it); });
    $("#watchedBtn").addEventListener("click", () => { const it = currentList()[state.playerIndex]; if (it) toggleWatched(it); });
    $("#editBtn").addEventListener("click", () => { const it = currentList()[state.playerIndex]; if (it) openEdit(it); });
    $("#deleteBtn").addEventListener("click", () => { const it = currentList()[state.playerIndex]; if (it) deleteItem(it); });

    $("#loginBtn").addEventListener("click", doLogin);
    $("#loginPassword").addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });

    $("#saveEditBtn").addEventListener("click", saveEdit);
    $("#refreshMetaBtn").addEventListener("click", refreshMeta);

    // ---- v8 controls ----
    const tvBtn = $("#tvModeBtn");
    if (tvBtn) tvBtn.addEventListener("click", toggleTvMode);
    const fsBtn = $("#fullscreenBtn");
    if (fsBtn) fsBtn.addEventListener("click", toggleFullscreen);
    const thBtn = $("#theatreBtn");
    if (thBtn) thBtn.addEventListener("click", toggleTheatre);
    const apBtn = $("#autoplayBtn");
    if (apBtn) apBtn.addEventListener("click", () => {
      prefs.autoplay = !prefs.autoplay; savePrefs();
      if (!prefs.autoplay) cancelCountdown();
      const it = currentList()[state.playerIndex];
      if (it) renderUpNext({ ...it, platform: state.activePlatform || it.platform });
    });
    const advSel = $("#advanceSelect");
    if (advSel) advSel.addEventListener("change", (e) => {
      prefs.advanceSecs = Number(e.target.value) || 0; savePrefs();
      cancelCountdown();
      const it = currentList()[state.playerIndex];
      if (it) {
        const plat = state.activePlatform || it.platform;
        renderUpNext({ ...it, platform: plat });
        cancelCountdown();
        if (prefs.autoplay && prefs.advanceSecs > 0 && !reportsProgress(plat)) startCountdown(prefs.advanceSecs);
      }
    });
    const cancelAp = $("#cancelAutoplayBtn");
    if (cancelAp) cancelAp.addEventListener("click", () => { cancelCountdown(); setUpnextStatus("Auto-advance cancelled."); });
    const clearCont = $("#clearContinueBtn");
    if (clearCont) clearCont.addEventListener("click", () => {
      prefs.continueClearedAt = new Date().toISOString(); savePrefs(); renderContinue();
      toast("Continue watching cleared");
    });

    // ---- v10 fullscreen bar + Instagram crop controls ----
    const on = (id, fn) => { const b = $(id); if (b) b.addEventListener("click", (e) => { e.stopPropagation(); showFsControls(); fn(); }); };
    on("#fsExitBtn", exitFullscreen);
    on("#fsPrevBtn", () => stepPlayer(-1));
    on("#fsNextBtn", () => stepPlayer(1));
    on("#fsCancelBtn", () => { cancelCountdown(); setUpnextStatus("Auto-advance cancelled."); });
    on("#fsFullPostBtn", () => {
      prefs.igFullPost = !prefs.igFullPost; savePrefs();
      layoutInstagram(); syncIgButtons();
      toast(prefs.igFullPost ? "Showing the full Instagram post" : "Cropped to the video");
    });
    on("#fsAdjustBtn", () => {
      const p = $("#cropAdjust"), b = $("#fsAdjustBtn");
      const open = p.hidden;
      p.hidden = !open; p.classList.toggle("open", open);
      b.setAttribute("aria-pressed", String(open));
      if (open) { clearTimeout(fsIdleTimer); }
    });
    on("#caZoomIn", () => nudgeInstagram("zoom", 1));
    on("#caZoomOut", () => nudgeInstagram("zoom", -1));
    on("#caUp", () => nudgeInstagram("dy", -1));
    on("#caDown", () => nudgeInstagram("dy", 1));
    on("#caReset", () => { nudgeInstagram("reset", 0); toast("Picture adjustment reset"); });

    document.addEventListener("fullscreenchange", () => { updateFsBtn(); syncFsChrome(); setTimeout(refitStage, 60); });

    // reveal the fullscreen controls on movement / tap, and when the video steals focus
    const shellEl = $("#playerShell");
    if (shellEl) {
      shellEl.addEventListener("pointermove", () => { if (inFullscreen()) showFsControls(); });
      shellEl.addEventListener("pointerdown", () => { if (inFullscreen()) showFsControls(); });
    }
    window.addEventListener("blur", () => { if (inFullscreen()) showFsControls(); });

    // the Facebook explanation is clamped on phones — tap it to read the rest
    const noteEl = document.querySelector(".embed-note");
    if (noteEl) {
      noteEl.title = "Tap to show the full note";
      noteEl.addEventListener("click", () => noteEl.classList.toggle("expanded"));
    }
    window.addEventListener("message", onPlayerMessage);
    window.addEventListener("beforeunload", () => {
      const it = currentList()[state.playerIndex];
      if (it && !$("#playerModal").hidden) saveProgress(it, true);
    });

    window.addEventListener("resize", () => {
      if ($("#playerModal").hidden) return;
      const it = currentList()[state.playerIndex];
      if (it && it.platform === "facebook") sizeFacebookStage(it);
    });

    document.addEventListener("keydown", (e) => {
      const tag = document.activeElement && document.activeElement.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if (e.key === "Escape") {
        if (inFullscreen()) { exitFullscreen(); return; }
        if (!$("#editModal").hidden) $("#editModal").hidden = true;
        else if (!$("#addModal").hidden) $("#addModal").hidden = true;
        else if (!$("#playerModal").hidden) closePlayer();
        else if (tvEnabled() && document.activeElement && document.activeElement.closest(".card")) document.activeElement.blur();
        return;
      }
      if (typing) return;
      if (inFullscreen()) showFsControls();
      if (e.key === "/") { e.preventDefault(); $("#searchInput").focus(); return; }
      if (!$("#playerModal").hidden) {
        if (e.key === "ArrowLeft") { e.preventDefault(); stepPlayer(-1); }
        if (e.key === "ArrowRight") { e.preventDefault(); stepPlayer(1); }
        if (e.key === "f" || e.key === "F") { e.preventDefault(); toggleFullscreen(); }
        if (e.key === "t" || e.key === "T") { e.preventDefault(); toggleTheatre(); }
        if (e.key === "Backspace") { e.preventDefault(); closePlayer(); }
        return;
      }
      // grid shortcuts when the player is closed
      const active = document.activeElement;
      const arrows = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
      if (active && active.classList && active.classList.contains("card")) {
        if (arrows.includes(e.key)) {
          const box = active.closest("#grid") || active.closest("#continueRail");
          if (box) gridNav(e, box);
        }
        if (e.key === "Backspace") { e.preventDefault(); active.blur(); }
      } else if (tvEnabled() && arrows.includes(e.key)) {
        const first = $("#grid .card");
        if (first) { e.preventDefault(); first.focus(); }
      }
    });
  }

  bind();
  applyTvMode();
  if (prefs.theatre) $("#playerModal").classList.add("theatre");
  updateFsBtn();
  checkAuth().then((ok) => { if (ok) loadItems(); });
})();
