/* =============================================================================
   SAM EMPIRE — gallery.js
   Image gallery from the Firestore `gallery` collection, with category filtering
   and a keyboard-navigable lightbox. Falls back to on-brand survey-grid imagery
   so the page is presentable before any photos are uploaded.
   ============================================================================= */

import { $, $$, escapeHtml, observeOnce } from "/assets/js/utils.js";
import { plotPlaceholder } from "/assets/js/catalog.js";
import { db, COLLECTIONS, IS_CONFIGURED } from "/assets/js/firebase.js";
import { collection, query, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const FALLBACK = [
  { category: "Viwanja", caption: "Kiwanja Kibada", area: "Kibada" },
  { category: "Viwanja", caption: "Kiwanja Kimbiji", area: "Kimbiji" },
  { category: "Viwanja", caption: "Kiwanja Mwasonga", area: "Mwasonga" },
  { category: "Ziara", caption: "Ziara ya mteja Vijibweni", area: "Vijibweni" },
  { category: "Ziara", caption: "Ukaguzi wa mipaka Dege", area: "Dege" },
  { category: "Hati", caption: "Hati Miliki iliyosajiliwa", area: "Hati" },
  { category: "Viwanja", caption: "Kiwanja Vikindu", area: "Vikindu" },
  { category: "Matukio", caption: "Makabidhiano ya hati", area: "Tukio" },
  { category: "Viwanja", caption: "Shamba Mwera", area: "Mwera" },
  { category: "Ziara", caption: "Upimaji wa GPS Cheka", area: "Cheka" },
  { category: "Matukio", caption: "Maonyesho ya viwanja", area: "Maonyesho" },
  { category: "Viwanja", caption: "Kiwanja Ungindoni", area: "Ungindoni" }
];

let ITEMS = [];
let filtered = [];
let lbIndex = 0;

function normalize(rows) {
  return rows.map((r) => ({
    src: r.url || r.image || (Array.isArray(r.images) && (r.images[0]?.url || r.images[0])) || plotPlaceholder(r.area || r.caption || "KGB", "SAM EMPIRE"),
    caption: r.caption || r.title || "",
    category: r.category || "Viwanja"
  }));
}

function categories() {
  return ["Zote", ...Array.from(new Set(ITEMS.map((i) => i.category)))];
}

function renderFilters(active) {
  const wrap = $("#gallery-filters");
  wrap.innerHTML = categories().map((c) =>
    `<button class="chip${c === active ? " is-active" : ""}" data-cat="${escapeHtml(c)}" role="tab" aria-selected="${c === active}" type="button">${escapeHtml(c)}</button>`).join("");
}

function renderGrid(cat) {
  filtered = cat === "Zote" ? ITEMS : ITEMS.filter((i) => i.category === cat);
  const grid = $("#gallery-grid");
  grid.innerHTML = filtered.map((it, i) => `
    <figure class="g-item" data-idx="${i}" data-reveal>
      <img src="${it.src}" alt="${escapeHtml(it.caption)}" loading="lazy" />
      <span class="g-item__tag badge badge-glass">${escapeHtml(it.category)}</span>
      ${it.caption ? `<figcaption class="g-item__cap">${escapeHtml(it.caption)}</figcaption>` : ""}
    </figure>`).join("");
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const nodes = $$("[data-reveal]", grid);
  if (reduce) nodes.forEach((n) => n.classList.add("is-visible"));
  else observeOnce(nodes, (n) => n.classList.add("is-visible"), { threshold: 0.05 });
}

/* Lightbox */
function openLightbox(i) {
  lbIndex = i;
  $("#lb-img").src = filtered[i].src;
  $("#lb-img").alt = filtered[i].caption || "";
  $("#lightbox").classList.add("is-open");
}
function step(d) { lbIndex = (lbIndex + d + filtered.length) % filtered.length; $("#lb-img").src = filtered[lbIndex].src; $("#lb-img").alt = filtered[lbIndex].caption || ""; }

function wire() {
  $("#gallery-filters").addEventListener("click", (e) => {
    const b = e.target.closest("[data-cat]"); if (!b) return;
    renderFilters(b.dataset.cat); renderGrid(b.dataset.cat);
  });
  $("#gallery-grid").addEventListener("click", (e) => {
    const f = e.target.closest("[data-idx]"); if (f) openLightbox(parseInt(f.dataset.idx, 10));
  });
  const lb = $("#lightbox");
  $("#lb-close").addEventListener("click", () => lb.classList.remove("is-open"));
  $("#lb-prev").addEventListener("click", () => step(-1));
  $("#lb-next").addEventListener("click", () => step(1));
  lb.addEventListener("click", (e) => { if (e.target === lb) lb.classList.remove("is-open"); });
  document.addEventListener("keydown", (e) => {
    if (!lb.classList.contains("is-open")) return;
    if (e.key === "Escape") lb.classList.remove("is-open");
    if (e.key === "ArrowLeft") step(-1);
    if (e.key === "ArrowRight") step(1);
  });
}

async function boot() {
  let rows = FALLBACK;
  if (IS_CONFIGURED) {
    try {
      const snap = await getDocs(query(collection(db, COLLECTIONS.GALLERY), orderBy("createdAt", "desc")));
      const data = snap.docs.map((d) => d.data());
      if (data.length) rows = data;
    } catch (err) { console.warn("[SAM] gallery:", err?.code || err); }
  }
  ITEMS = normalize(rows);
  renderFilters("Zote");
  renderGrid("Zote");
  wire();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();
