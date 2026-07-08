/* =============================================================================
   SAM EMPIRE — home.js
   Homepage data controller. Renders the dynamic, Firestore-driven sections of
   index.html (featured + latest properties, locations, testimonials, FAQs,
   news) and wires the hero search, FAQ accordion, and Kigamboni map.

   Design goals:
     • Works end-to-end with Firebase only — no backend.
     • Degrades gracefully: when Firebase isn't configured yet, or a collection
       is empty, it shows curated, on-brand demo content so the page always
       feels alive and premium (never blank, never broken).
     • Imports the SAME Firebase singleton as script.js, so nothing double-inits.
     • Page-view analytics are owned by script.js — this file never tracks them.
   ============================================================================= */

import { db, COLLECTIONS, IS_CONFIGURED } from "/assets/js/firebase.js";
import {
  collection, query, where, orderBy, limit, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  $, $$, el, escapeHtml, formatMoney, formatNumber, slugify, truncate, observeOnce
} from "/assets/js/utils.js";

/* -----------------------------------------------------------------------------
   0. CONSTANTS — the twelve Kigamboni areas this business serves.
   These are fixed geography, so they render instantly (no DB round-trip needed),
   and are enriched with live plot counts when property data is available.
   -------------------------------------------------------------------------- */
const KIGAMBONI_LOCATIONS = [
  { name: "Vijibweni",     slug: "vijibweni",      code: "LOC-01", lat: -6.8190, lng: 39.3210 },
  { name: "Daraja la Nyerere", slug: "nyerere-bridge", code: "LOC-02", lat: -6.8290, lng: 39.3050 },
  { name: "Kibada",        slug: "kibada",         code: "LOC-03", lat: -6.8650, lng: 39.3360 },
  { name: "Mwera",         slug: "mwera",          code: "LOC-04", lat: -6.8880, lng: 39.3520 },
  { name: "Mwasonga",      slug: "mwasonga",       code: "LOC-05", lat: -6.9120, lng: 39.3470 },
  { name: "Ungindoni",     slug: "ungindoni",      code: "LOC-06", lat: -6.8420, lng: 39.3280 },
  { name: "Cheka",         slug: "cheka",          code: "LOC-07", lat: -6.9300, lng: 39.3600 },
  { name: "Puna",          slug: "puna",           code: "LOC-08", lat: -6.9450, lng: 39.3650 },
  { name: "Kimbiji",       slug: "kimbiji",        code: "LOC-09", lat: -6.9850, lng: 39.4180 },
  { name: "Dege",          slug: "dege",           code: "LOC-10", lat: -6.9020, lng: 39.3380 },
  { name: "Mwembe Mdogo",  slug: "mwembemdogo",    code: "LOC-11", lat: -6.8350, lng: 39.3190 },
  { name: "Vikindu",       slug: "vikindu",        code: "LOC-12", lat: -7.0050, lng: 39.3550 }
];

/* -----------------------------------------------------------------------------
   1. ON-BRAND IMAGE PLACEHOLDER
   A deterministic survey-grid SVG (navy field, gold plot lines + code) used
   whenever a property/news item has no uploaded image yet. Keeps the grid
   identity consistent and guarantees images never break.
   -------------------------------------------------------------------------- */
function plotPlaceholder(label = "KGB", subtitle = "SAM EMPIRE") {
  const safe = String(label).toUpperCase().slice(0, 12);
  const sub = String(subtitle).toUpperCase().slice(0, 22);
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="550" viewBox="0 0 800 550">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0C2A5E"/><stop offset="0.55" stop-color="#081F4D"/><stop offset="1" stop-color="#050F26"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#E8C75A"/><stop offset="0.5" stop-color="#D4AF37"/><stop offset="1" stop-color="#B8932B"/>
    </linearGradient>
    <pattern id="grid" width="44" height="44" patternUnits="userSpaceOnUse">
      <path d="M44 0H0V44" fill="none" stroke="#D4AF37" stroke-opacity="0.16" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="800" height="550" fill="url(#bg)"/>
  <rect width="800" height="550" fill="url(#grid)"/>
  <rect x="40" y="40" width="720" height="470" fill="none" stroke="#D4AF37" stroke-opacity="0.5" stroke-width="2"/>
  <path d="M40 40 L760 510 M760 40 L40 510" stroke="#D4AF37" stroke-opacity="0.12" stroke-width="1"/>
  <circle cx="400" cy="240" r="54" fill="none" stroke="url(#gold)" stroke-width="3"/>
  <text x="400" y="252" text-anchor="middle" font-family="'Space Mono',monospace" font-size="30" font-weight="700" fill="#E8C75A">KGB</text>
  <text x="400" y="360" text-anchor="middle" font-family="'Playfair Display',serif" font-size="44" font-weight="800" fill="#FFFFFF">${escapeHtml(safe)}</text>
  <text x="400" y="400" text-anchor="middle" font-family="'Space Mono',monospace" font-size="16" letter-spacing="4" fill="#D4AF37">${escapeHtml(sub)}</text>
</svg>`.trim();
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

/* -----------------------------------------------------------------------------
   2. DEMO DATA — curated Kigamboni plots used as a graceful fallback.
   Realistic enough to demo the full UI; replaced automatically by real Firestore
   documents the moment they exist.
   -------------------------------------------------------------------------- */
const DEMO_PROPERTIES = [
  { id: "demo-kibada-01", code: "KGB-K601", title: "Kiwanja cha Makazi — Kibada", location: "Kibada", locationSlug: "kibada", price: 12000000, oldPrice: 14000000, size: 600, sizeUnit: "m²", type: "Makazi", status: "available", featured: true, governmentApproved: true, verified: true, createdAt: Date.now() - 1 * 864e5 },
  { id: "demo-kimbiji-01", code: "KGB-J102", title: "Kiwanja cha Pwani — Kimbiji", location: "Kimbiji", locationSlug: "kimbiji", price: 25000000, size: 1000, sizeUnit: "m²", type: "Pwani", status: "available", featured: true, governmentApproved: true, hot: true, createdAt: Date.now() - 2 * 864e5 },
  { id: "demo-mwasonga-01", code: "KGB-M805", title: "Kiwanja cha Biashara — Mwasonga", location: "Mwasonga", locationSlug: "mwasonga", price: 18500000, size: 800, sizeUnit: "m²", type: "Biashara", status: "available", featured: true, verified: true, createdAt: Date.now() - 3 * 864e5 },
  { id: "demo-vijibweni-01", code: "KGB-V401", title: "Kiwanja cha Makazi — Vijibweni", location: "Vijibweni", locationSlug: "vijibweni", price: 8500000, size: 400, sizeUnit: "m²", type: "Makazi", status: "available", featured: true, governmentApproved: true, isNew: true, createdAt: Date.now() - 4 * 864e5 },
  { id: "demo-dege-01", code: "KGB-D502", title: "Kiwanja cha Makazi — Dege", location: "Dege", locationSlug: "dege", price: 9800000, size: 500, sizeUnit: "m²", type: "Makazi", status: "available", featured: true, isNew: true, createdAt: Date.now() - 5 * 864e5 },
  { id: "demo-mwera-01", code: "KGB-W703", title: "Shamba la Kilimo — Mwera", location: "Mwera", locationSlug: "mwera", price: 15000000, size: 2000, sizeUnit: "m²", type: "Kilimo", status: "available", featured: true, verified: true, createdAt: Date.now() - 6 * 864e5 },
  { id: "demo-vikindu-01", code: "KGB-X451", title: "Kiwanja cha Makazi — Vikindu", location: "Vikindu", locationSlug: "vikindu", price: 7200000, size: 450, sizeUnit: "m²", type: "Makazi", status: "available", governmentApproved: true, isNew: true, createdAt: Date.now() - 7 * 864e5 },
  { id: "demo-cheka-01", code: "KGB-C551", title: "Kiwanja cha Makazi — Cheka", location: "Cheka", locationSlug: "cheka", price: 10500000, size: 550, sizeUnit: "m²", type: "Makazi", status: "available", verified: true, isNew: true, createdAt: Date.now() - 8 * 864e5 }
];

const DEMO_TESTIMONIALS = [
  { name: "Juma Athumani", role: "Mfanyabiashara, Dar es Salaam", rating: 5, text: "Nilinunua kiwanja Kibada kwa njia rahisi kabisa. Hati nilipata ndani ya wiki mbili, na timu ilikuwa wazi kuhusu kila kitu. Nawapendekeza sana." },
  { name: "Neema Mushi", role: "Mwalimu, Kigamboni", rating: 5, text: "Mpango wa malipo kwa awamu ulinisaidia kumiliki kiwanja bila msongo. Walinionyesha mipaka na GPS papo hapo eneo. Huduma ya kuaminika." },
  { name: "Salum Rashid", role: "Mwekezaji", rating: 5, text: "Niliwekeza viwanja viwili Mwasonga. Thamani imepanda ndani ya mwaka mmoja. SAM EMPIRE ni waaminifu na wataalamu wa kweli." }
];

const DEMO_FAQS = [
  { q: "Je, viwanja vyenu vina hati halali?", a: "Ndiyo. Kila kiwanja kina Title Deed iliyosajiliwa na kuidhinishwa na mamlaka husika za ardhi. Tunakuonyesha hati na nyaraka zote kabla ya malipo." },
  { q: "Naweza kulipa kwa awamu?", a: "Ndiyo. Tunatoa mpango wa malipo kwa awamu unaonyumbulika. Unaanza na malipo ya awali (down payment), kisha unalipa kiasi kilichobaki kwa muda mliokubaliana." },
  { q: "Je, nitaona kiwanja kabla ya kununua?", a: "Bila shaka. Tunapanga ziara ya bure eneo la kiwanja ambapo utaona mipaka halisi na viwianishi vya GPS pamoja na timu yetu." },
  { q: "Mchakato wa uhamisho wa umiliki ni upi?", a: "Baada ya malipo kukamilika, tunasimamia uhamisho rasmi wa hati (transfer) hadi jina lako, ikihusisha taratibu zote za kisheria za ardhi." },
  { q: "Mnauza maeneo gani Kigamboni?", a: "Tunauza viwanja Vijibweni, Kibada, Mwasonga, Kimbiji, Dege, Vikindu, Mwera, Cheka na maeneo mengine muhimu ya Kigamboni." }
];

const DEMO_NEWS = [
  { title: "Kwa Nini Kigamboni Ni Eneo Bora la Uwekezaji 2026", excerpt: "Ujenzi wa Daraja la Nyerere na miundombinu mipya umefanya thamani ya ardhi Kigamboni kupanda kwa kasi. Hii ndiyo sababu ya kuwekeza sasa.", tag: "Uwekezaji", slug: "kigamboni-uwekezaji-2026", date: "2026-06-10" },
  { title: "Hatua 5 za Kuhakiki Hati ya Kiwanja Kabla ya Kununua", excerpt: "Usinunue kiwanja bila kuhakiki hati. Hapa kuna hatua muhimu za kukulinda dhidi ya udanganyifu wa ardhi.", tag: "Ushauri", slug: "kuhakiki-hati-kiwanja", date: "2026-05-22" },
  { title: "Malipo kwa Awamu: Jinsi ya Kumiliki Kiwanja Bila Msongo", excerpt: "Mpango wa malipo kwa awamu unakuwezesha kumiliki ardhi hata kama huna fedha zote kwa mara moja. Tunakueleza jinsi unavyofanya kazi.", tag: "Mwongozo", slug: "malipo-kwa-awamu", date: "2026-04-30" }
];

/* -----------------------------------------------------------------------------
   3. NORMALISE — map a Firestore property doc into the shape the card expects.
   Tolerant of differing field names so it works with whatever the admin schema
   evolves into.
   -------------------------------------------------------------------------- */
function normalizeProperty(id, d) {
  const firstImg = Array.isArray(d.images) && d.images.length
    ? (d.images[0].thumb || d.images[0].url || d.images[0])
    : (d.image || d.thumbnail || null);
  return {
    id,
    code: d.code || d.propertyCode || "KGB",
    title: d.title || d.name || "Kiwanja Kigamboni",
    location: d.location || d.locationName || d.area || "Kigamboni",
    locationSlug: d.locationSlug || slugify(d.location || d.area || "kigamboni"),
    price: Number(d.price ?? d.amount ?? 0),
    oldPrice: Number(d.oldPrice ?? d.originalPrice ?? 0) || null,
    size: d.size ?? d.area_size ?? null,
    sizeUnit: d.sizeUnit || d.unit || "m²",
    type: d.type || d.category || "Kiwanja",
    status: d.status || d.availability || "available",
    image: firstImg,
    featured: !!d.featured,
    governmentApproved: !!(d.governmentApproved || d.govApproved || d.approved),
    verified: !!d.verified,
    isNew: !!(d.isNew || d.new),
    hot: !!(d.hot || d.hotDeal),
    slug: d.slug || slugify(`${d.title || d.name || "kiwanja"}-${d.code || id}`),
    createdAt: d.createdAt?.toMillis ? d.createdAt.toMillis() : (d.createdAt || 0)
  };
}

/* -----------------------------------------------------------------------------
   4. CARD TEMPLATE — exact .property-card markup the design system expects.
   -------------------------------------------------------------------------- */
function statusBadge(status) {
  const s = String(status).toLowerCase();
  if (s === "sold" || s === "imeuzwa") return `<span class="badge badge-sold"><span class="dot"></span>Imeuzwa</span>`;
  if (s === "reserved" || s === "imehifadhiwa") return `<span class="badge badge-reserved"><span class="dot"></span>Imehifadhiwa</span>`;
  return `<span class="badge badge-available"><span class="dot"></span>Inapatikana</span>`;
}

function propertyCardHTML(p) {
  const img = p.image || plotPlaceholder(p.location || p.code, p.code);
  const href = `/property-details.html?slug=${encodeURIComponent(p.slug || slugify(`${p.title}-${p.code}`))}`;
  const badges = [];
  if (p.featured) badges.push(`<span class="badge badge-featured">Maalum</span>`);
  if (p.governmentApproved) badges.push(
    `<span class="badge badge-gov" title="Imeidhinishwa na Serikali">
       <svg viewBox="0 0 24 24" width="12" height="12" fill="none" aria-hidden="true"><path d="M12 2l2.4 1.6 2.9-.2 1 2.7 2.3 1.7-1 2.7 1 2.7-2.3 1.7-1 2.7-2.9-.2L12 22l-2.4-1.6-2.9.2-1-2.7L3.4 16l1-2.7-1-2.7 2.3-1.7 1-2.7 2.9.2L12 2z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
       Serikali
     </span>`);
  if (p.verified) badges.push(`<span class="badge badge-verified">Imethibitishwa</span>`);
  if (p.isNew) badges.push(`<span class="badge badge-new">Mpya</span>`);
  if (p.hot) badges.push(`<span class="badge badge-hot">Ofa</span>`);

  const meta = [];
  if (p.size) meta.push(`<span><svg viewBox="0 0 24 24" width="15" height="15" fill="none" aria-hidden="true"><path d="M3 3h7v7H3zM14 14h7v7h-7z" stroke="currentColor" stroke-width="1.6"/><path d="M10 7h11M7 10v11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>${formatNumber(p.size)} ${escapeHtml(p.sizeUnit)}</span>`);
  meta.push(`<span><svg viewBox="0 0 24 24" width="15" height="15" fill="none" aria-hidden="true"><path d="M3 21h18M5 21V9l7-5 7 5v12" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>${escapeHtml(p.type)}</span>`);

  const priceHTML = p.oldPrice && p.oldPrice > p.price
    ? `${formatMoney(p.price)} <del>${formatMoney(p.oldPrice)}</del>`
    : `${formatMoney(p.price)}`;

  return `
  <article class="property-card" data-reveal>
    <div class="property-card__media">
      <img class="property-card__img" src="${img}" alt="${escapeHtml(p.title)}" loading="lazy" width="800" height="550" />
      <div class="property-card__badges">${badges.join("")}</div>
      <button class="property-card__fav" data-wish="${escapeHtml(p.id)}" aria-label="Hifadhi kwenye pendwa" type="button">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true"><path d="M12 21s-7-4.6-9.2-8.4C1.2 9.3 2.6 6 6 6c2 0 3.2 1.2 4 2.3C10.8 7.2 12 6 14 6c3.4 0 4.8 3.3 3.2 6.6C19 16.4 12 21 12 21z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>
      </button>
      <span class="property-card__code">${escapeHtml(p.code)}</span>
    </div>
    <div class="property-card__body">
      <span class="property-card__loc">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" aria-hidden="true"><path d="M12 21s-7-5.3-7-11a7 7 0 0114 0c0 5.7-7 11-7 11z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="10" r="2.2" stroke="currentColor" stroke-width="1.8"/></svg>
        ${escapeHtml(p.location)}
      </span>
      <h3 class="property-card__title"><a href="${href}">${escapeHtml(p.title)}</a></h3>
      <div class="property-card__meta">${meta.join("")}</div>
      <div class="property-card__foot">
        <div class="property-card__price">${priceHTML}<small>Bei</small></div>
        <a class="btn btn-navy btn-sm" href="${href}">Angalia</a>
      </div>
    </div>
  </article>`;
}

/* -----------------------------------------------------------------------------
   5. DATA FETCH — published properties, with demo fallback.
   -------------------------------------------------------------------------- */
async function fetchProperties({ featuredOnly = false, max = 8 } = {}) {
  if (!IS_CONFIGURED) {
    const list = featuredOnly ? DEMO_PROPERTIES.filter((p) => p.featured) : DEMO_PROPERTIES;
    return list.slice(0, max);
  }
  try {
    const constraints = [where("status", "==", "published")];
    if (featuredOnly) constraints.push(where("featured", "==", true));
    constraints.push(orderBy("createdAt", "desc"), limit(max));
    const snap = await getDocs(query(collection(db, COLLECTIONS.PROPERTIES), ...constraints));
    const rows = snap.docs.map((doc) => normalizeProperty(doc.id, doc.data()));
    if (rows.length) return rows;
  } catch (err) {
    console.warn("[SAM] properties fetch failed, using demo set:", err?.code || err?.message || err);
  }
  // Empty or errored → curated fallback so the section never looks dead.
  const fb = featuredOnly ? DEMO_PROPERTIES.filter((p) => p.featured) : DEMO_PROPERTIES;
  return fb.slice(0, max);
}

/* -----------------------------------------------------------------------------
   6. RENDERERS
   -------------------------------------------------------------------------- */
function revealIn(container) {
  const nodes = $$("[data-reveal]", container);
  if (!nodes.length) return;
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) { nodes.forEach((n) => n.classList.add("is-visible")); return; }
  observeOnce(nodes, (n) => n.classList.add("is-visible"), { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
}

function renderGrid(targetId, items, builder) {
  const grid = $(`#${targetId}`);
  if (!grid) return;
  grid.innerHTML = items.map(builder).join("");
  grid.setAttribute("aria-busy", "false");
  revealIn(grid);
}

async function renderFeatured() {
  const items = await fetchProperties({ featuredOnly: true, max: 6 });
  renderGrid("featured-grid", items, propertyCardHTML);
  window.SAM && window.SAM.refreshWishUI && window.SAM.refreshWishUI();
}

async function renderLatest() {
  const items = await fetchProperties({ featuredOnly: false, max: 8 });
  // Newest first by createdAt
  items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  renderGrid("latest-grid", items.slice(0, 8), propertyCardHTML);
  window.SAM && window.SAM.refreshWishUI && window.SAM.refreshWishUI();
}

function renderLocations() {
  const grid = $("#locations-grid");
  if (!grid) return;
  grid.innerHTML = KIGAMBONI_LOCATIONS.map((l) => `
    <a class="loc-tile" data-reveal href="/locations.html?slug=${l.slug}" aria-label="Viwanja ${escapeHtml(l.name)}">
      <span class="loc-tile__grid" aria-hidden="true"></span>
      <span class="loc-tile__body">
        <span class="loc-tile__name">${escapeHtml(l.name)}</span>
        <span class="loc-tile__coord">KGB · ${l.code}</span>
        <span class="loc-tile__count">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" aria-hidden="true"><path d="M3 21h18M5 21V9l7-5 7 5v12" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
          Tazama viwanja
          <span class="loc-tile__arrow"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
        </span>
      </span>
    </a>`).join("");
  revealIn(grid);
}

async function renderTestimonials() {
  let items = DEMO_TESTIMONIALS;
  if (IS_CONFIGURED) {
    try {
      const snap = await getDocs(query(
        collection(db, COLLECTIONS.TESTIMONIALS),
        where("approved", "==", true),
        orderBy("createdAt", "desc"),
        limit(3)
      ));
      const rows = snap.docs.map((d) => d.data());
      if (rows.length) items = rows;
    } catch (err) { console.warn("[SAM] testimonials:", err?.code || err); }
  }
  const grid = $("#testimonials-grid");
  if (!grid) return;
  grid.innerHTML = items.map((t) => {
    const rating = Math.max(0, Math.min(5, t.rating || 5));
    const stars = "★".repeat(rating) + "☆".repeat(5 - rating);
    const initial = escapeHtml((t.name || "S").trim().charAt(0).toUpperCase());
    return `
      <div class="card" data-reveal>
        <div class="card-body quote">
          <div class="stars" aria-label="Nyota ${rating} kati ya 5">${stars}</div>
          <span class="quote__mark" aria-hidden="true">&ldquo;</span>
          <p class="quote__text">${escapeHtml(truncate(t.text || "", 240))}</p>
          <div class="quote__by">
            <span class="quote__avatar" aria-hidden="true">${initial}</span>
            <span>
              <span class="quote__name">${escapeHtml(t.name || "Mteja")}</span>
              <span class="quote__role">${escapeHtml(t.role || "Mteja wa SAM EMPIRE")}</span>
            </span>
          </div>
        </div>
      </div>`;
  }).join("");
  revealIn(grid);
}

async function renderFaqs() {
  let items = DEMO_FAQS;
  if (IS_CONFIGURED) {
    try {
      const snap = await getDocs(query(collection(db, COLLECTIONS.FAQS), orderBy("order", "asc"), limit(6)));
      const rows = snap.docs.map((d) => d.data()).map((d) => ({ q: d.question || d.q, a: d.answer || d.a }));
      if (rows.length) items = rows;
    } catch (err) { console.warn("[SAM] faqs:", err?.code || err); }
  }
  const acc = $("#faq-accordion");
  if (!acc) return;
  acc.innerHTML = items.map((f, i) => `
    <div class="accordion__item${i === 0 ? " is-open" : ""}">
      <button class="accordion__head" aria-expanded="${i === 0 ? "true" : "false"}" type="button">
        <span>${escapeHtml(f.q)}</span>
        <span class="accordion__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </span>
      </button>
      <div class="accordion__panel"><div class="accordion__panel-inner">${escapeHtml(f.a)}</div></div>
    </div>`).join("");
  wireAccordion(acc);
}

async function renderNews() {
  let items = DEMO_NEWS;
  if (IS_CONFIGURED) {
    try {
      const snap = await getDocs(query(
        collection(db, COLLECTIONS.BLOG),
        where("status", "==", "published"),
        orderBy("createdAt", "desc"),
        limit(3)
      ));
      const rows = snap.docs.map((d) => {
        const x = d.data();
        return {
          title: x.title, excerpt: x.excerpt || x.summary || "",
          tag: x.category || x.tag || "Makala",
          slug: x.slug || d.id,
          date: x.createdAt?.toDate ? x.createdAt.toDate().toISOString() : (x.date || ""),
          image: (Array.isArray(x.images) && x.images[0] && (x.images[0].url || x.images[0])) || x.cover || x.image || null
        };
      });
      if (rows.length) items = rows;
    } catch (err) { console.warn("[SAM] blog:", err?.code || err); }
  }
  const grid = $("#news-grid");
  if (!grid) return;
  grid.innerHTML = items.map((n) => {
    const img = n.image || plotPlaceholder(n.tag || "Makala", "SAM EMPIRE");
    const date = n.date ? new Date(n.date).toLocaleDateString("sw-TZ", { day: "numeric", month: "short", year: "numeric" }) : "";
    return `
      <article class="card post-card" data-reveal>
        <a class="post-card__media" href="/blog/${encodeURIComponent(n.slug)}" aria-label="${escapeHtml(n.title)}">
          <img src="${img}" alt="${escapeHtml(n.title)}" loading="lazy" width="800" height="500" />
          <span class="post-card__tag badge badge-glass">${escapeHtml(n.tag)}</span>
        </a>
        <div class="card-body flex flex-col gap-3">
          <span class="post-card__date">${escapeHtml(date)}</span>
          <h3 class="h5"><a href="/blog/${encodeURIComponent(n.slug)}">${escapeHtml(n.title)}</a></h3>
          <p class="text-sm text-muted">${escapeHtml(truncate(n.excerpt || "", 130))}</p>
          <a class="text-gold text-sm" href="/blog/${encodeURIComponent(n.slug)}" style="font-weight:700">Soma zaidi &rarr;</a>
        </div>
      </article>`;
  }).join("");
  revealIn(grid);
}

/* -----------------------------------------------------------------------------
   7. ACCORDION INTERACTION (panels animate via measured max-height).
   -------------------------------------------------------------------------- */
function wireAccordion(root) {
  const setOpen = (item, open) => {
    const panel = $(".accordion__panel", item);
    const head = $(".accordion__head", item);
    item.classList.toggle("is-open", open);
    head && head.setAttribute("aria-expanded", String(open));
    if (panel) panel.style.maxHeight = open ? panel.scrollHeight + "px" : "0px";
  };
  $$(".accordion__item", root).forEach((item) => {
    setOpen(item, item.classList.contains("is-open")); // initialise measured heights
    $(".accordion__head", item).addEventListener("click", () => {
      const willOpen = !item.classList.contains("is-open");
      // Single-open accordion: collapse siblings for a tidy column.
      $$(".accordion__item", root).forEach((sib) => { if (sib !== item) setOpen(sib, false); });
      setOpen(item, willOpen);
    });
  });
  // Keep the open panel correctly sized on resize.
  window.addEventListener("resize", () => {
    const open = $(".accordion__item.is-open", root);
    if (open) { const p = $(".accordion__panel", open); if (p) p.style.maxHeight = p.scrollHeight + "px"; }
  });
}

/* -----------------------------------------------------------------------------
   8. HERO SEARCH → /properties.html with query params.
   -------------------------------------------------------------------------- */
function wireHeroSearch() {
  const btn = $("#hero-search-btn");
  if (!btn) return;
  const go = () => {
    const params = new URLSearchParams();
    const add = (id, key) => { const v = $(`#${id}`)?.value; if (v) params.set(key, v); };
    add("q-loc", "location");
    add("q-type", "type");
    add("q-price", "price");
    add("q-size", "size");
    const qs = params.toString();
    location.href = "/properties.html" + (qs ? "?" + qs : "");
  };
  btn.addEventListener("click", go);
  $$(".search-bar select").forEach((s) => s.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); }));
}

/* -----------------------------------------------------------------------------
   9. KIGAMBONI MAP — live Google Map when a key is present, else the on-brand
   fallback already in the DOM stays (never broken).
   Provide a key via:  window.SAM_MAPS_KEY = "..."  (e.g. in a small config tag).
   -------------------------------------------------------------------------- */
function initMap() {
  const key = (typeof window !== "undefined" && window.SAM_MAPS_KEY) || "";
  const mount = $("#home-map");
  const fallback = $("#map-fallback");
  if (!key || !mount) return; // keep stylish fallback

  window.__samInitMap = function () {
    try {
      const center = { lat: -6.88, lng: 39.35 };
      const map = new google.maps.Map(mount, {
        center, zoom: 12, mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
        styles: [
          { elementType: "geometry", stylers: [{ color: "#0b1a38" }] },
          { elementType: "labels.text.fill", stylers: [{ color: "#cbd5e8" }] },
          { elementType: "labels.text.stroke", stylers: [{ color: "#050f26" }] },
          { featureType: "water", stylers: [{ color: "#06294f" }] },
          { featureType: "road", elementType: "geometry", stylers: [{ color: "#1e2f50" }] },
          { featureType: "poi", stylers: [{ visibility: "off" }] }
        ]
      });
      KIGAMBONI_LOCATIONS.forEach((l) => {
        new google.maps.Marker({
          position: { lat: l.lat, lng: l.lng }, map, title: l.name,
          icon: { path: google.maps.SymbolPath.CIRCLE, scale: 6, fillColor: "#D4AF37", fillOpacity: 1, strokeColor: "#081F4D", strokeWeight: 2 }
        });
      });
      if (fallback) fallback.style.display = "none";
    } catch (e) { console.warn("[SAM] map init:", e); }
  };

  const s = document.createElement("script");
  s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=__samInitMap&loading=async`;
  s.async = true;
  s.onerror = () => console.warn("[SAM] Google Maps failed to load; keeping fallback.");
  document.head.appendChild(s);
}

/* -----------------------------------------------------------------------------
   10. BOOT
   -------------------------------------------------------------------------- */
function boot() {
  wireHeroSearch();
  renderLocations();
  initMap();
  // Data sections — independent, so a slow/empty one never blocks the others.
  renderFeatured();
  renderLatest();
  renderTestimonials();
  renderFaqs();
  renderNews();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
