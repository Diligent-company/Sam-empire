/* =============================================================================
   SAM EMPIRE — locations.js
   Dual-mode controller for locations.html. firebase.json rewrites /location/**
   to this page, so one file serves two views:
     • OVERVIEW  (/locations)         → map + grid of all twelve Kigamboni areas
     • SINGLE    (/location/{slug})   → one area: intro, highlights, map, plots
   Plot counts and listings come from the shared catalogue (with demo fallback).
   ============================================================================= */

import {
  KIGAMBONI_LOCATIONS, locationBySlug, fetchAllPublished, propertyCardHTML
} from "/assets/js/catalog.js";
import { $, $$, escapeHtml, formatNumber, observeOnce } from "/assets/js/utils.js";
import { trackLocationView } from "/assets/js/analytics.js";
import { db, COLLECTIONS, IS_CONFIGURED } from "/assets/js/firebase.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* -----------------------------------------------------------------------------
   Per-area editorial content (fixed geography → ships with the page; admins can
   layer richer copy via Firestore later without touching this baseline).
   -------------------------------------------------------------------------- */
const CONTENT = {
  "vijibweni":      { tagline: "Lango la Kigamboni", intro: "Vijibweni ni eneo la kimkakati lililo karibu na kivuko na Daraja la Nyerere, likifanya iwe rahisi kufika katikati ya jiji. Eneo linalokua kwa kasi, linafaa makazi na uwekezaji wa muda mrefu.", highlights: ["Karibu na Daraja la Nyerere", "Ufikiaji rahisi wa kivuko", "Eneo linalokua kwa kasi", "Linafaa makazi ya familia"] },
  "nyerere-bridge": { tagline: "Karibu na Daraja", intro: "Maeneo ya karibu na Daraja la Julius Nyerere yamebadilika kuwa kitovu cha ukuaji. Viwanja hapa vina thamani inayopanda kutokana na miundombinu mipya na urahisi wa usafiri.", highlights: ["Thamani inayopanda kwa kasi", "Miundombinu ya kisasa", "Karibu na barabara kuu", "Fursa nzuri ya biashara"] },
  "kibada":         { tagline: "Makazi Tulivu", intro: "Kibada ni eneo tulivu lenye mvuto kwa familia zinazotafuta utulivu mbali na kelele za jiji, huku likiwa karibu na huduma muhimu kama shule, masoko na vituo vya afya.", highlights: ["Mazingira tulivu", "Karibu na shule na masoko", "Barabara zinazopitika", "Bei nafuu kwa makazi"] },
  "mwera":          { tagline: "Ardhi ya Rutuba", intro: "Mwera lina ardhi yenye rutuba inayofaa kilimo na makazi. Eneo linalopendwa na wanaotaka viwanja vikubwa kwa kilimo biashara au ujenzi wa nyumba zenye nafasi.", highlights: ["Udongo wenye rutuba", "Viwanja vikubwa vinapatikana", "Linafaa kilimo na makazi", "Mazingira ya kijani"] },
  "mwasonga":       { tagline: "Kitovu cha Biashara", intro: "Mwasonga ni eneo lenye msongamano wa shughuli za kibiashara kando ya barabara kuu. Linafaa wawekezaji wa maduka, maghala na majengo ya biashara.", highlights: ["Kando ya barabara kuu", "Umeme na maji vinapatikana", "Kitovu cha biashara", "Msongamano mzuri wa watu"] },
  "ungindoni":      { tagline: "Eneo Linalostawi", intro: "Ungindoni ni miongoni mwa maeneo yanayostawi Kigamboni, yenye mchanganyiko wa makazi na biashara ndogo ndogo. Fursa nzuri kwa wanaoanza kumiliki ardhi.", highlights: ["Eneo linalostawi", "Mchanganyiko wa makazi/biashara", "Bei rafiki", "Huduma zinazoongezeka"] },
  "cheka":          { tagline: "Makazi ya Kisasa", intro: "Cheka linavutia familia za kisasa zinazotafuta makazi karibu na huduma za jamii. Eneo lenye mpangilio mzuri na barabara zinazopitika.", highlights: ["Mpangilio mzuri", "Karibu na huduma za jamii", "Barabara nzuri", "Jamii inayokua"] },
  "puna":           { tagline: "Utulivu wa Pwani", intro: "Puna ni eneo lenye utulivu lililo karibu na maeneo ya pwani ya Kigamboni. Linafaa makazi na uwekezaji wa mapumziko kwa wanaopenda mandhari ya asili.", highlights: ["Karibu na pwani", "Mazingira ya asili", "Linafaa mapumziko", "Hewa safi ya bahari"] },
  "kimbiji":        { tagline: "Hazina ya Pwani", intro: "Kimbiji ni eneo adimu lenye ukaribu na bahari, likitoa fursa za kipekee za makazi ya kifahari na uwekezaji wa kitalii. Mandhari ya kuvutia na ardhi yenye thamani inayopanda.", highlights: ["Ukaribu na bahari", "Fursa ya uwekezaji wa kitalii", "Mandhari ya kifahari", "Thamani inayopanda"] },
  "dege":           { tagline: "Makazi Yanayokua", intro: "Dege ni eneo linalokua kwa kasi lenye mchanganyiko wa makazi mapya. Linafaa familia zinazotafuta kiwanja cha bei nafuu katika mazingira tulivu.", highlights: ["Eneo linalokua", "Bei nafuu", "Mazingira tulivu", "Malipo kwa awamu"] },
  "mwembemdogo":    { tagline: "Karibu na Kila Kitu", intro: "Mwembe Mdogo lina ukaribu na huduma muhimu na njia kuu za usafiri. Eneo linalofaa wanaotaka kuishi karibu na shughuli za kila siku za Kigamboni.", highlights: ["Ukaribu na huduma", "Usafiri rahisi", "Eneo lenye shughuli", "Linafaa makazi"] },
  "vikindu":        { tagline: "Bei ya Kuanzia", intro: "Vikindu linatoa viwanja vya bei nafuu zaidi, likiwa chaguo bora kwa wanaoanza safari ya kumiliki ardhi. Eneo linalokua na huduma zinazoongezeka kila siku.", highlights: ["Bei nafuu zaidi", "Linafaa wanaoanza", "Eneo linalokua", "Malipo kwa awamu"] }
};

const ICON_CHECK = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M5 12l4 4L19 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_ARROW = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

let CATALOG = [];

/* -----------------------------------------------------------------------------
   Helpers.
   -------------------------------------------------------------------------- */
function parseSlug() {
  const m = location.pathname.match(/\/location\/([^/?#]+)/);
  if (m && m[1]) return decodeURIComponent(m[1]);
  const sp = new URLSearchParams(location.search);
  return sp.get("slug") || null;
}

function countByLocation() {
  const map = {};
  CATALOG.forEach((p) => { map[p.locationSlug] = (map[p.locationSlug] || 0) + 1; });
  return map;
}

function revealIn(container) {
  const nodes = $$("[data-reveal]", container || document);
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) { nodes.forEach((n) => n.classList.add("is-visible")); return; }
  observeOnce(nodes, (n) => n.classList.add("is-visible"), { threshold: 0.1 });
}

/* -----------------------------------------------------------------------------
   OVERVIEW VIEW.
   -------------------------------------------------------------------------- */
function renderOverviewPins() {
  const fb = $("#overview-map-fallback");
  if (!fb) return;
  const lats = KIGAMBONI_LOCATIONS.map((l) => l.lat);
  const lngs = KIGAMBONI_LOCATIONS.map((l) => l.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const pad = 10, span = 100 - pad * 2;
  KIGAMBONI_LOCATIONS.forEach((l) => {
    const x = pad + ((l.lng - minLng) / (maxLng - minLng || 1)) * span;
    const y = pad + ((maxLat - l.lat) / (maxLat - minLat || 1)) * span; // north up
    const pin = document.createElement("a");
    pin.className = "map-pin";
    pin.href = `/locations.html?slug=${l.slug}`;
    pin.style.left = x + "%";
    pin.style.top = y + "%";
    pin.innerHTML = `<i></i>${escapeHtml(l.name.toUpperCase())}`;
    fb.appendChild(pin);
  });
}

function renderOverviewGrid() {
  const counts = countByLocation();
  const grid = $("#loc-grid");
  grid.innerHTML = KIGAMBONI_LOCATIONS.map((l) => {
    const c = CONTENT[l.slug] || {};
    const n = counts[l.slug] || 0;
    return `
      <a class="loc-tile" data-reveal href="/locations.html?slug=${l.slug}" aria-label="Viwanja ${escapeHtml(l.name)}">
        <span class="loc-tile__grid" aria-hidden="true"></span>
        <span class="loc-tile__body">
          <span class="loc-tile__name">${escapeHtml(l.name)}</span>
          <span class="loc-tile__coord">KGB · ${l.code}${c.tagline ? " · " + escapeHtml(c.tagline) : ""}</span>
          <span class="loc-tile__desc">${escapeHtml((c.intro || "").slice(0, 96))}${(c.intro || "").length > 96 ? "…" : ""}</span>
          <span class="loc-tile__count">
            <strong>${n ? formatNumber(n) : "—"}</strong> ${n === 1 ? "kiwanja" : "viwanja"}
            <span class="loc-tile__arrow">${ICON_ARROW}</span>
          </span>
        </span>
      </a>`;
  }).join("");
  revealIn(grid);
}

function initOverviewMap() {
  const key = (typeof window !== "undefined" && window.SAM_MAPS_KEY) || "";
  const mount = $("#overview-map");
  if (!key || !mount) return;
  window.__samLocMap = function () {
    try {
      const map = new google.maps.Map(mount, {
        center: { lat: -6.90, lng: 39.36 }, zoom: 12,
        mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
        styles: [
          { elementType: "geometry", stylers: [{ color: "#0b1a38" }] },
          { elementType: "labels.text.fill", stylers: [{ color: "#cbd5e8" }] },
          { featureType: "water", stylers: [{ color: "#06294f" }] },
          { featureType: "road", elementType: "geometry", stylers: [{ color: "#1e2f50" }] },
          { featureType: "poi", stylers: [{ visibility: "off" }] }
        ]
      });
      KIGAMBONI_LOCATIONS.forEach((l) => {
        const m = new google.maps.Marker({ position: { lat: l.lat, lng: l.lng }, map, title: l.name,
          icon: { path: google.maps.SymbolPath.CIRCLE, scale: 7, fillColor: "#D4AF37", fillOpacity: 1, strokeColor: "#081F4D", strokeWeight: 2 } });
        m.addListener("click", () => { location.href = `/locations.html?slug=${l.slug}`; });
      });
      const fb = $("#overview-map-fallback"); if (fb) fb.style.display = "none";
    } catch (e) { console.warn("[SAM] loc map:", e); }
  };
  const s = document.createElement("script");
  s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=__samLocMap&loading=async`;
  s.async = true; s.onerror = () => console.warn("[SAM] Maps failed; keeping fallback.");
  document.head.appendChild(s);
}

function showOverview() {
  $("#view-overview").hidden = false;
  renderOverviewPins();
  renderOverviewGrid();
  initOverviewMap();
}

/* -----------------------------------------------------------------------------
   SINGLE-AREA VIEW.
   -------------------------------------------------------------------------- */
async function fetchContentOverride(slug) {
  if (!IS_CONFIGURED) return null;
  try {
    const snap = await getDoc(doc(db, COLLECTIONS.LOCATIONS, slug));
    if (!snap.exists()) return null;
    const d = snap.data();
    const out = {};
    if (d.tagline) out.tagline = d.tagline;
    if (d.intro) out.intro = d.intro;
    if (Array.isArray(d.highlights) && d.highlights.length) out.highlights = d.highlights;
    return out;
  } catch (err) { console.warn("[SAM] location override:", err?.code || err); return null; }
}

async function showSingle(slug) {
  const loc = locationBySlug(slug);
  const base = CONTENT[slug];
  if (!loc || !base) { $("#loc-missing").hidden = false; return; }
  const override = await fetchContentOverride(slug);
  const content = override ? { ...base, ...override } : base;

  // Banner
  $("#loc-h1").textContent = `Viwanja ${loc.name}`;
  $("#loc-sub").textContent = content.tagline + " · Kigamboni, Dar es Salaam";
  $("#loc-crumbs").innerHTML = `<a href="/">Nyumbani</a><a href="/locations.html">Maeneo</a><span class="is-current">${escapeHtml(loc.name)}</span>`;
  document.title = `Viwanja ${loc.name}, Kigamboni — SAM EMPIRE`;
  const desc = $('meta[name="description"]'); if (desc) desc.setAttribute("content", content.intro.slice(0, 160));
  const ogt = $("#og-title"); if (ogt) ogt.setAttribute("content", `Viwanja ${loc.name} — SAM EMPIRE`);
  const ogd = $("#og-desc"); if (ogd) ogd.setAttribute("content", content.intro.slice(0, 160));

  const plots = CATALOG.filter((p) => p.locationSlug === slug);
  const gmaps = `https://www.google.com/maps?q=${loc.lat},${loc.lng}`;

  const plotsBlock = plots.length
    ? `<div class="grid grid-3" id="area-plots">${plots.map(propertyCardHTML).join("")}</div>`
    : `<div class="notice" style="border:1px dashed var(--border-strong);border-radius:var(--r-lg);padding:var(--s-7);text-align:center;color:var(--text-muted)">
         <p>Hakuna kiwanja kilichoorodheshwa kwa sasa eneo la <strong>${escapeHtml(loc.name)}</strong>. Wasiliana nasi — tunaweza kuwa na viwanja ambavyo havijaorodheshwa.</p>
         <a class="btn btn-whatsapp mt-4" data-action="whatsapp" data-message="Habari, nataka kujua viwanja vinavyopatikana ${escapeHtml(loc.name)}, Kigamboni." target="_blank" rel="noopener">Uliza kwa WhatsApp</a>
       </div>`;

  $("#single-root").innerHTML = `
    <section class="section">
      <div class="container container-wide">
        <div class="grid grid-2" style="align-items:center;gap:var(--s-9)">
          <div data-reveal>
            <p class="eyebrow">KGB · ${loc.code}</p>
            <h2 class="mt-3">${escapeHtml(content.tagline)}</h2>
            <p class="lead mt-4">${escapeHtml(content.intro)}</p>
            <div class="area-stats mt-7">
              <div class="area-stat"><strong>${plots.length ? formatNumber(plots.length) : "—"}</strong><span>Viwanja Vilivyopo</span></div>
              <div class="area-stat"><strong>100%</strong><span>Hati Halali</span></div>
              <div class="area-stat"><strong>GPS</strong><span>Viwianishi Sahihi</span></div>
            </div>
            <ul class="hl-list mt-7">
              ${content.highlights.map((h) => `<li class="hl">${ICON_CHECK}<span>${escapeHtml(h)}</span></li>`).join("")}
            </ul>
            <div class="flex gap-3 mt-7 wrap">
              <a class="btn btn-gold" href="/properties.html?location=${encodeURIComponent(slug)}">Viwanja Vyote ${escapeHtml(loc.name)}</a>
              <a class="btn btn-whatsapp" data-action="whatsapp" data-message="Habari, nimevutiwa na viwanja vya ${escapeHtml(loc.name)}, Kigamboni." target="_blank" rel="noopener">WhatsApp</a>
            </div>
          </div>
          <div class="map-frame" data-reveal data-delay="1" style="min-height:380px">
            <div class="map-mount" id="single-map"></div>
            <div class="map-fallback" id="single-map-fallback" aria-hidden="true">
              <div class="map-fallback__grid"></div>
              <div style="position:absolute;inset:0;display:grid;place-items:center;text-align:center;padding:var(--s-6)">
                <div>
                  <div class="map-pin" style="position:static;transform:none;align-items:center"><i></i>${escapeHtml(loc.name.toUpperCase())}</div>
                  <p class="mono text-sm mt-3" style="color:var(--c-gold-bright)">LAT ${loc.lat} · LON ${loc.lng}</p>
                  <a class="btn btn-glass btn-sm mt-4" href="${gmaps}" target="_blank" rel="noopener">Fungua Google Maps</a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="section bg-soft" style="padding-top:0;background:var(--surface-3)">
      <div class="container container-wide" style="padding-top:var(--s-10)">
        <div class="flex-between wrap gap-4 mb-6" style="align-items:flex-end">
          <div>
            <p class="eyebrow">Viwanja</p>
            <h2 class="mt-2">Viwanja Vilivyopo ${escapeHtml(loc.name)}</h2>
          </div>
          <a class="btn btn-outline-gold btn-hide-sm" href="/properties.html?location=${encodeURIComponent(slug)}">Vyote &rarr;</a>
        </div>
        ${plotsBlock}
      </div>
    </section>`;

  $("#view-single").hidden = false;
  initSingleMap(loc);
  revealIn($("#single-root"));
  window.SAM && window.SAM.refreshWishUI && window.SAM.refreshWishUI();
  document.dispatchEvent(new CustomEvent("sam:settings", { detail: (window.SAM && window.SAM.settings) || {} }));
  trackLocationView({ id: slug, slug, name: loc.name });
}

function initSingleMap(loc) {
  const key = (typeof window !== "undefined" && window.SAM_MAPS_KEY) || "";
  const mount = $("#single-map");
  if (!key || !mount) return;
  window.__samSingleMap = function () {
    try {
      const center = { lat: loc.lat, lng: loc.lng };
      const map = new google.maps.Map(mount, {
        center, zoom: 14, mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
        styles: [
          { elementType: "geometry", stylers: [{ color: "#0b1a38" }] },
          { elementType: "labels.text.fill", stylers: [{ color: "#cbd5e8" }] },
          { featureType: "water", stylers: [{ color: "#06294f" }] },
          { featureType: "road", elementType: "geometry", stylers: [{ color: "#1e2f50" }] }
        ]
      });
      new google.maps.Marker({ position: center, map, title: loc.name,
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: "#D4AF37", fillOpacity: 1, strokeColor: "#081F4D", strokeWeight: 2 } });
      const fb = $("#single-map-fallback"); if (fb) fb.style.display = "none";
    } catch (e) { console.warn("[SAM] single map:", e); }
  };
  const s = document.createElement("script");
  s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=__samSingleMap&loading=async`;
  s.async = true; s.onerror = () => console.warn("[SAM] Maps failed; keeping fallback.");
  document.head.appendChild(s);
}

/* -----------------------------------------------------------------------------
   Boot.
   -------------------------------------------------------------------------- */
async function boot() {
  CATALOG = await fetchAllPublished(120);
  const slug = parseSlug();
  if (slug) await showSingle(slug);
  else showOverview();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
