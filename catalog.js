/* =============================================================================
   SAM EMPIRE — catalog.js
   Shared listings engine used by the listings page (properties.js) and the
   single-property page (property.js). Centralises:
     • the property data model (normalisation, tolerant of schema drift)
     • the .property-card template (so every grid looks identical)
     • published-property fetching with a graceful, on-brand demo fallback
     • slug/id lookup for the details page
     • the twelve Kigamboni locations

   Firebase-only. Reads obey firestore.rules (published properties are public).
   For a land-sales catalogue (tens–hundreds of plots) we fetch the published
   set once and filter/sort/paginate on the client — fast UX, no composite-index
   sprawl. Admins can add indexes later if the catalogue grows very large.
   ============================================================================= */

import { db, COLLECTIONS, IS_CONFIGURED } from "/assets/js/firebase.js";
import {
  collection, query, where, orderBy, limit, getDocs, getDoc, doc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { escapeHtml, formatMoney, formatNumber, slugify, truncate } from "/assets/js/utils.js";

/* -----------------------------------------------------------------------------
   Locations (fixed geography).
   -------------------------------------------------------------------------- */
export const KIGAMBONI_LOCATIONS = [
  { name: "Vijibweni",         slug: "vijibweni",      code: "LOC-01", lat: -6.8190, lng: 39.3210 },
  { name: "Daraja la Nyerere", slug: "nyerere-bridge", code: "LOC-02", lat: -6.8290, lng: 39.3050 },
  { name: "Kibada",            slug: "kibada",         code: "LOC-03", lat: -6.8650, lng: 39.3360 },
  { name: "Mwera",             slug: "mwera",          code: "LOC-04", lat: -6.8880, lng: 39.3520 },
  { name: "Mwasonga",          slug: "mwasonga",       code: "LOC-05", lat: -6.9120, lng: 39.3470 },
  { name: "Ungindoni",         slug: "ungindoni",      code: "LOC-06", lat: -6.8420, lng: 39.3280 },
  { name: "Cheka",             slug: "cheka",          code: "LOC-07", lat: -6.9300, lng: 39.3600 },
  { name: "Puna",              slug: "puna",           code: "LOC-08", lat: -6.9450, lng: 39.3650 },
  { name: "Kimbiji",           slug: "kimbiji",        code: "LOC-09", lat: -6.9850, lng: 39.4180 },
  { name: "Dege",              slug: "dege",           code: "LOC-10", lat: -6.9020, lng: 39.3380 },
  { name: "Mwembe Mdogo",      slug: "mwembemdogo",    code: "LOC-11", lat: -6.8350, lng: 39.3190 },
  { name: "Vikindu",           slug: "vikindu",        code: "LOC-12", lat: -7.0050, lng: 39.3550 }
];

export function locationBySlug(slug) {
  return KIGAMBONI_LOCATIONS.find((l) => l.slug === slug) || null;
}

/* -----------------------------------------------------------------------------
   On-brand survey-grid image placeholder (no broken images, ever).
   -------------------------------------------------------------------------- */
export function plotPlaceholder(label = "KGB", subtitle = "SAM EMPIRE") {
  const safe = String(label).toUpperCase().slice(0, 12);
  const sub = String(subtitle).toUpperCase().slice(0, 22);
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700" viewBox="0 0 1000 700">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0C2A5E"/><stop offset="0.55" stop-color="#081F4D"/><stop offset="1" stop-color="#050F26"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#E8C75A"/><stop offset="0.5" stop-color="#D4AF37"/><stop offset="1" stop-color="#B8932B"/>
    </linearGradient>
    <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
      <path d="M50 0H0V50" fill="none" stroke="#D4AF37" stroke-opacity="0.16" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="1000" height="700" fill="url(#bg)"/>
  <rect width="1000" height="700" fill="url(#grid)"/>
  <rect x="50" y="50" width="900" height="600" fill="none" stroke="#D4AF37" stroke-opacity="0.5" stroke-width="2"/>
  <path d="M50 50 L950 650 M950 50 L50 650" stroke="#D4AF37" stroke-opacity="0.10" stroke-width="1"/>
  <circle cx="500" cy="300" r="62" fill="none" stroke="url(#gold)" stroke-width="3"/>
  <text x="500" y="314" text-anchor="middle" font-family="'Space Mono',monospace" font-size="34" font-weight="700" fill="#E8C75A">KGB</text>
  <text x="500" y="440" text-anchor="middle" font-family="'Playfair Display',serif" font-size="52" font-weight="800" fill="#FFFFFF">${escapeHtml(safe)}</text>
  <text x="500" y="486" text-anchor="middle" font-family="'Space Mono',monospace" font-size="18" letter-spacing="5" fill="#D4AF37">${escapeHtml(sub)}</text>
</svg>`.trim();
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

/* -----------------------------------------------------------------------------
   Demo dataset — curated Kigamboni plots used when Firestore is empty/not yet
   configured. Slugs/codes mirror the homepage so detail links resolve.
   -------------------------------------------------------------------------- */
const DEMO_PROPERTIES = [
  {
    id: "demo-kibada-01", code: "KGB-K601", title: "Kiwanja cha Makazi — Kibada",
    location: "Kibada", locationSlug: "kibada", price: 12000000, oldPrice: 14000000,
    size: 600, sizeUnit: "m²", type: "Makazi", status: "available",
    featured: true, governmentApproved: true, verified: true,
    gps: { lat: -6.8650, lng: 39.3360 }, downPayment: 4000000, installmentMonths: 12, roadAccess: "Barabara ya changarawe",
    ownership: "Hati Miliki (Title Deed)", landUse: "Makazi", utilities: ["Umeme (karibu)", "Maji (karibu)"],
    amenities: { schools: "Shule ya Msingi Kibada (1.2 km)", hospitals: "Kituo cha Afya Kibada (2 km)", markets: "Soko la Kibada (1.5 km)", transport: "Daladala Kibada (300 m)" },
    description: "Kiwanja kizuri cha makazi katika eneo tulivu la Kibada, lenye kupimwa rasmi na hati safi. Linafaa kujenga nyumba ya familia, karibu na huduma muhimu na barabara kuu.",
    features: ["Limepimwa rasmi", "Mipaka iko wazi (beacons)", "Karibu na barabara kuu", "Eneo linalokua kwa kasi"],
    createdAt: Date.now() - 1 * 864e5
  },
  {
    id: "demo-kimbiji-01", code: "KGB-J102", title: "Kiwanja cha Pwani — Kimbiji",
    location: "Kimbiji", locationSlug: "kimbiji", price: 25000000, size: 1000, sizeUnit: "m²",
    type: "Pwani", status: "available", featured: true, governmentApproved: true, hot: true,
    gps: { lat: -6.9850, lng: 39.4180 }, downPayment: 8000000, installmentMonths: 10, roadAccess: "Barabara ya lami (karibu)",
    ownership: "Hati Miliki (Title Deed)", landUse: "Makazi / Mapumziko", utilities: ["Umeme (karibu)"],
    amenities: { schools: "Shule ya Msingi Kimbiji (2 km)", hospitals: "Zahanati Kimbiji (3 km)", markets: "Soko dogo Kimbiji (1 km)", transport: "Daladala Kimbiji (500 m)" },
    description: "Kiwanja cha kipekee karibu na pwani ya Kimbiji — fursa adimu ya uwekezaji kwa mapumziko au makazi ya kifahari. Eneo linalovutia watalii na wawekezaji.",
    features: ["Karibu na bahari", "Eneo la uwekezaji", "Hati safi", "Mandhari ya kuvutia"],
    createdAt: Date.now() - 2 * 864e5
  },
  {
    id: "demo-mwasonga-01", code: "KGB-M805", title: "Kiwanja cha Biashara — Mwasonga",
    location: "Mwasonga", locationSlug: "mwasonga", price: 18500000, size: 800, sizeUnit: "m²",
    type: "Biashara", status: "available", featured: true, verified: true,
    gps: { lat: -6.9120, lng: 39.3470 }, downPayment: 6000000, installmentMonths: 12, roadAccess: "Barabara kuu ya lami",
    ownership: "Hati Miliki (Title Deed)", landUse: "Biashara", utilities: ["Umeme", "Maji"],
    amenities: { schools: "Shule ya Sekondari Mwasonga (1 km)", hospitals: "Kituo cha Afya (1.8 km)", markets: "Soko kuu Mwasonga (400 m)", transport: "Stendi ya daladala (200 m)" },
    description: "Kiwanja bora cha biashara kando ya barabara kuu Mwasonga — eneo lenye msongamano wa watu, linalofaa duka, godown au jengo la biashara.",
    features: ["Kando ya barabara kuu", "Umeme na maji", "Eneo la biashara", "Ufikiaji rahisi"],
    createdAt: Date.now() - 3 * 864e5
  },
  {
    id: "demo-vijibweni-01", code: "KGB-V401", title: "Kiwanja cha Makazi — Vijibweni",
    location: "Vijibweni", locationSlug: "vijibweni", price: 8500000, size: 400, sizeUnit: "m²",
    type: "Makazi", status: "available", featured: true, governmentApproved: true, isNew: true,
    gps: { lat: -6.8190, lng: 39.3210 }, downPayment: 3000000, installmentMonths: 10, roadAccess: "Barabara ya changarawe",
    ownership: "Hati Miliki (Title Deed)", landUse: "Makazi", utilities: ["Umeme", "Maji (karibu)"],
    amenities: { schools: "Shule ya Msingi Vijibweni (800 m)", hospitals: "Zahanati Vijibweni (1.5 km)", markets: "Soko Vijibweni (1 km)", transport: "Kivuko/Daladala (1 km)" },
    description: "Kiwanja kizuri Vijibweni karibu na kivuko na Daraja la Nyerere — eneo la kimkakati lenye kukua kwa kasi, linafaa makazi ya familia.",
    features: ["Karibu na Daraja la Nyerere", "Limepimwa rasmi", "Bei nafuu", "Eneo la kimkakati"],
    createdAt: Date.now() - 4 * 864e5
  },
  {
    id: "demo-dege-01", code: "KGB-D502", title: "Kiwanja cha Makazi — Dege",
    location: "Dege", locationSlug: "dege", price: 9800000, size: 500, sizeUnit: "m²",
    type: "Makazi", status: "available", featured: true, isNew: true,
    gps: { lat: -6.9020, lng: 39.3380 }, downPayment: 3500000, installmentMonths: 12, roadAccess: "Barabara ya changarawe",
    ownership: "Hati Miliki (Title Deed)", landUse: "Makazi", utilities: ["Umeme (karibu)"],
    amenities: { schools: "Shule ya Msingi Dege (1 km)", hospitals: "Zahanati Dege (2 km)", markets: "Soko Dege (1.2 km)", transport: "Daladala Dege (400 m)" },
    description: "Kiwanja cha makazi Dege katika mazingira tulivu, linafaa kujenga nyumba ya kuishi. Bei rafiki na malipo kwa awamu yanapatikana.",
    features: ["Mazingira tulivu", "Limepimwa", "Malipo kwa awamu", "Karibu na huduma"],
    createdAt: Date.now() - 5 * 864e5
  },
  {
    id: "demo-mwera-01", code: "KGB-W703", title: "Shamba la Kilimo — Mwera",
    location: "Mwera", locationSlug: "mwera", price: 15000000, size: 2000, sizeUnit: "m²",
    type: "Kilimo", status: "available", featured: true, verified: true,
    gps: { lat: -6.8880, lng: 39.3520 }, downPayment: 5000000, installmentMonths: 12, roadAccess: "Barabara ya udongo",
    ownership: "Hati Miliki (Title Deed)", landUse: "Kilimo", utilities: ["Maji (kisima karibu)"],
    amenities: { schools: "Shule ya Msingi Mwera (2 km)", hospitals: "Zahanati Mwera (2.5 km)", markets: "Soko Mwera (1.5 km)", transport: "Daladala Mwera (700 m)" },
    description: "Shamba kubwa la kilimo Mwera lenye udongo wenye rutuba — linafaa kilimo cha mboga, matunda au ufugaji. Fursa nzuri ya kilimo biashara.",
    features: ["Udongo wenye rutuba", "Eneo kubwa", "Linafaa kilimo", "Maji karibu"],
    createdAt: Date.now() - 6 * 864e5
  },
  {
    id: "demo-vikindu-01", code: "KGB-X451", title: "Kiwanja cha Makazi — Vikindu",
    location: "Vikindu", locationSlug: "vikindu", price: 7200000, size: 450, sizeUnit: "m²",
    type: "Makazi", status: "available", governmentApproved: true, isNew: true,
    gps: { lat: -7.0050, lng: 39.3550 }, downPayment: 2500000, installmentMonths: 10, roadAccess: "Barabara ya changarawe",
    ownership: "Hati Miliki (Title Deed)", landUse: "Makazi", utilities: ["Umeme (karibu)"],
    amenities: { schools: "Shule ya Msingi Vikindu (1 km)", hospitals: "Zahanati Vikindu (2 km)", markets: "Soko Vikindu (1.3 km)", transport: "Daladala Vikindu (500 m)" },
    description: "Kiwanja cha bei nafuu Vikindu, linafaa kwa wanaoanza kumiliki ardhi. Eneo linalokua na huduma zinazoongezeka.",
    features: ["Bei nafuu zaidi", "Limepimwa", "Eneo linalokua", "Malipo kwa awamu"],
    createdAt: Date.now() - 7 * 864e5
  },
  {
    id: "demo-cheka-01", code: "KGB-C551", title: "Kiwanja cha Makazi — Cheka",
    location: "Cheka", locationSlug: "cheka", price: 10500000, size: 550, sizeUnit: "m²",
    type: "Makazi", status: "available", verified: true, isNew: true,
    gps: { lat: -6.9300, lng: 39.3600 }, downPayment: 3500000, installmentMonths: 12, roadAccess: "Barabara ya changarawe",
    ownership: "Hati Miliki (Title Deed)", landUse: "Makazi", utilities: ["Umeme (karibu)", "Maji (karibu)"],
    amenities: { schools: "Shule ya Msingi Cheka (1 km)", hospitals: "Zahanati Cheka (1.8 km)", markets: "Soko Cheka (1 km)", transport: "Daladala Cheka (450 m)" },
    description: "Kiwanja cha makazi Cheka katika eneo linalostawi, karibu na huduma za jamii. Linafaa familia inayotaka utulivu na ukaribu wa mji.",
    features: ["Eneo linalostawi", "Limepimwa rasmi", "Karibu na huduma", "Hati safi"],
    createdAt: Date.now() - 8 * 864e5
  }
];

/* -----------------------------------------------------------------------------
   Normalisation — tolerant mapping of a Firestore doc → card/detail model.
   -------------------------------------------------------------------------- */
export function normalizeProperty(id, d = {}) {
  const images = Array.isArray(d.images) && d.images.length
    ? d.images.map((im) => (typeof im === "string" ? { url: im, thumb: im } : { url: im.url || im.thumb, thumb: im.thumb || im.url }))
    : (d.image ? [{ url: d.image, thumb: d.thumbnail || d.image }] : []);
  return {
    id,
    code: d.code || d.propertyCode || "KGB",
    title: d.title || d.name || "Kiwanja Kigamboni",
    location: d.location || d.locationName || d.area || "Kigamboni",
    locationSlug: d.locationSlug || slugify(d.location || d.area || "kigamboni"),
    price: Number(d.price ?? d.amount ?? 0),
    oldPrice: Number(d.oldPrice ?? d.originalPrice ?? 0) || null,
    downPayment: Number(d.downPayment ?? 0) || null,
    installmentMonths: Number(d.installmentMonths ?? d.installments ?? 0) || null,
    size: d.size ?? d.area_size ?? null,
    sizeUnit: d.sizeUnit || d.unit || "m²",
    type: d.type || d.category || "Kiwanja",
    status: (d.status === "published" ? (d.availability || "available") : (d.availability || d.status || "available")),
    images,
    videos: Array.isArray(d.videos) ? d.videos : [],
    featured: !!d.featured,
    governmentApproved: !!(d.governmentApproved || d.govApproved || d.approved),
    verified: !!d.verified,
    isNew: !!(d.isNew || d.new),
    hot: !!(d.hot || d.hotDeal),
    gps: d.gps || (d.lat && d.lng ? { lat: d.lat, lng: d.lng } : null),
    ownership: d.ownership || "Hati Miliki (Title Deed)",
    landUse: d.landUse || d.type || "Makazi",
    utilities: Array.isArray(d.utilities) ? d.utilities : [],
    roadAccess: d.roadAccess || "Barabara inayopitika",
    amenities: d.amenities || {},
    description: d.description || "",
    features: Array.isArray(d.features) ? d.features : [],
    brochureUrl: d.brochureUrl || d.brochure || null,
    slug: d.slug || slugify(`${d.title || d.name || "kiwanja"}-${d.code || id}`),
    createdAt: d.createdAt?.toMillis ? d.createdAt.toMillis() : (d.createdAt || 0)
  };
}

function demoNormalized() {
  return DEMO_PROPERTIES.map((p) => normalizeProperty(p.id, p));
}

/* -----------------------------------------------------------------------------
   Fetch all published properties (client-side filter/sort/paginate afterwards).
   -------------------------------------------------------------------------- */
export async function fetchAllPublished(max = 120) {
  if (!IS_CONFIGURED) return demoNormalized();
  try {
    const snap = await getDocs(query(
      collection(db, COLLECTIONS.PROPERTIES),
      where("status", "==", "published"),
      orderBy("createdAt", "desc"),
      limit(max)
    ));
    const rows = snap.docs.map((dc) => normalizeProperty(dc.id, dc.data()));
    return rows.length ? rows : demoNormalized();
  } catch (err) {
    console.warn("[SAM] catalog fetch failed, using demo set:", err?.code || err?.message || err);
    return demoNormalized();
  }
}

/* -----------------------------------------------------------------------------
   Resolve a single property by slug (preferred) or document id.
   -------------------------------------------------------------------------- */
export async function getPropertyBySlugOrId(key) {
  if (!key) return null;
  if (!IS_CONFIGURED) {
    const list = demoNormalized();
    return list.find((p) => p.slug === key || p.id === key) || null;
  }
  try {
    // Try slug first (links use slugs).
    const bySlug = await getDocs(query(
      collection(db, COLLECTIONS.PROPERTIES),
      where("slug", "==", key),
      limit(1)
    ));
    if (!bySlug.empty) {
      const dc = bySlug.docs[0];
      return normalizeProperty(dc.id, dc.data());
    }
    // Fall back to direct document id.
    const byId = await getDoc(doc(db, COLLECTIONS.PROPERTIES, key));
    if (byId.exists()) return normalizeProperty(byId.id, byId.data());
  } catch (err) {
    console.warn("[SAM] property lookup failed:", err?.code || err);
  }
  // Demo fallback (lets homepage demo links resolve before real data exists).
  const list = demoNormalized();
  return list.find((p) => p.slug === key || p.id === key) || null;
}

/* -----------------------------------------------------------------------------
   The canonical .property-card template (shared by all grids).
   -------------------------------------------------------------------------- */
export function propertyCardHTML(p) {
  const img = (p.images && p.images[0] && (p.images[0].thumb || p.images[0].url)) || plotPlaceholder(p.location || p.code, p.code);
  const href = `/property-details.html?slug=${encodeURIComponent(p.slug)}`;
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
      <img class="property-card__img" src="${img}" alt="${escapeHtml(p.title)}" loading="lazy" width="1000" height="700" />
      <div class="property-card__badges">${badges.join("")}</div>
      <button class="property-card__fav" data-wish="${escapeHtml(p.id)}" aria-label="Hifadhi kwenye pendwa" type="button">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true"><path d="M12 21s-7-4.6-9.2-8.4C1.2 9.3 2.6 6 6 6c2 0 3.2 1.2 4 2.3C10.8 7.2 12 6 14 6c3.4 0 4.8 3.3 3.2 6.6C19 16.4 12 21 12 21z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>
      </button>
      <button class="property-card__fav is-compare" data-compare="${escapeHtml(p.id)}" aria-label="Ongeza kwenye linganisho" type="button" style="top:calc(var(--s-3) + 46px)">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" aria-hidden="true"><path d="M12 3v18M5 7l-3 6h6L5 7zM19 7l-3 6h6l-3-6zM3 7h18" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
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

/* Price/size bucket parsing shared with the listings filters. */
export function inPriceBucket(price, bucket) {
  if (!bucket) return true;
  const [lo, hi] = bucket.split("-").map((n) => (n === "" ? null : Number(n)));
  if (lo != null && price < lo) return false;
  if (hi != null && price > hi) return false;
  return true;
}
export function inSizeBucket(size, bucket) {
  if (!bucket || size == null) return !bucket;
  const [lo, hi] = bucket.split("-").map((n) => (n === "" ? null : Number(n)));
  if (lo != null && size < lo) return false;
  if (hi != null && size > hi) return false;
  return true;
}
