/* =============================================================================
   SAM EMPIRE — videos.js
   Video library from the Firestore `videos` collection. Plays YouTube or direct
   files inside the design-system modal. When no videos exist yet, it shows
   tasteful on-brand placeholder cards whose player invites the visitor to book a
   live walkthrough via WhatsApp — honest and useful rather than a dead embed.
   ============================================================================= */

import { $, escapeHtml } from "/assets/js/utils.js";
import { plotPlaceholder } from "/assets/js/catalog.js";
import { db, COLLECTIONS, IS_CONFIGURED } from "/assets/js/firebase.js";
import { collection, query, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { whatsappLink } from "/assets/js/utils.js";

const FALLBACK = [
  { title: "Ziara ya Kiwanja — Kibada", category: "Ziara", duration: "" },
  { title: "Jinsi ya Kuhakiki Hati ya Kiwanja", category: "Mwongozo", duration: "" },
  { title: "Ushuhuda wa Mteja — Kimbiji", category: "Ushuhuda", duration: "" },
  { title: "Malipo kwa Awamu Yanavyofanya Kazi", category: "Mwongozo", duration: "" },
  { title: "Mandhari ya Viwanja — Mwasonga", category: "Ziara", duration: "" },
  { title: "Kwa Nini Uwekeze Kigamboni", category: "Uwekezaji", duration: "" }
];

let VIDEOS = [];

function youtubeId(v) {
  if (v.youtubeId) return v.youtubeId;
  const u = v.url || "";
  const m = u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : null;
}

function normalize(rows) {
  return rows.map((r) => ({
    title: r.title || "Video",
    category: r.category || "Video",
    duration: r.duration || "",
    url: r.url || "",
    youtubeId: r.youtubeId || null,
    thumbnail: r.thumbnail || (r.youtubeId ? `https://i.ytimg.com/vi/${r.youtubeId}/hqdefault.jpg` : plotPlaceholder(r.category || "VIDEO", "SAM EMPIRE"))
  }));
}

function render() {
  const grid = $("#video-grid");
  grid.innerHTML = VIDEOS.map((v, i) => `
    <article class="card video-card" data-idx="${i}" role="button" tabindex="0" aria-label="Cheza: ${escapeHtml(v.title)}">
      <div class="video-card__media">
        <img src="${v.thumbnail}" alt="${escapeHtml(v.title)}" loading="lazy" />
        <span class="video-card__play"><span><svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span></span>
        ${v.duration ? `<span class="video-card__dur">${escapeHtml(v.duration)}</span>` : ""}
      </div>
      <div class="card-body">
        <span class="badge badge-glass" style="color:var(--c-gold-deep);background:var(--c-warning-soft);border:0">${escapeHtml(v.category)}</span>
        <h3 class="h5 mt-3">${escapeHtml(v.title)}</h3>
      </div>
    </article>`).join("");
}

function play(v) {
  const SAM = window.SAM;
  if (!SAM || !SAM.openModal) return;
  const yt = youtubeId(v);
  let body;
  if (yt) {
    body = `<div class="video-embed"><iframe src="https://www.youtube.com/embed/${encodeURIComponent(yt)}?autoplay=1&rel=0" title="${escapeHtml(v.title)}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>`;
  } else if (v.url) {
    body = `<div class="video-embed"><video src="${escapeHtml(v.url)}" controls autoplay playsinline></video></div>`;
  } else {
    body = `<div class="text-center" style="padding:var(--s-4)">
      <p class="lead">Video hii itapatikana hivi karibuni.</p>
      <p class="text-muted mt-2">Wakati huo, tunaweza kukupa ziara ya moja kwa moja ya kiwanja — tuandikie WhatsApp tupange.</p>
      <a class="btn btn-whatsapp mt-5" href="${whatsappLink('Habari SAM EMPIRE, naomba kupanga ziara ya kuona viwanja Kigamboni.')}" target="_blank" rel="noopener">Panga Ziara kwa WhatsApp</a>
    </div>`;
  }
  SAM.openModal({ title: v.title, body, size: "video", actions: [{ label: "Funga", class: "btn btn-outline", onClick: (c) => c() }] });
}

function wire() {
  const grid = $("#video-grid");
  const trigger = (elm) => { const c = elm.closest("[data-idx]"); if (c) play(VIDEOS[parseInt(c.dataset.idx, 10)]); };
  grid.addEventListener("click", (e) => trigger(e.target));
  grid.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); trigger(e.target); } });
}

async function boot() {
  let rows = FALLBACK;
  if (IS_CONFIGURED) {
    try {
      const snap = await getDocs(query(collection(db, COLLECTIONS.VIDEOS), orderBy("createdAt", "desc")));
      const data = snap.docs.map((d) => d.data());
      if (data.length) rows = data;
    } catch (err) { console.warn("[SAM] videos:", err?.code || err); }
  }
  VIDEOS = normalize(rows);
  render();
  wire();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();
