/* =============================================================================
   SAM EMPIRE — property.js
   Single-property page controller. Resolves the plot from the URL slug, renders
   the full detail layout, and wires every action: gallery + lightbox, the spec
   sheet, nearby amenities, the Kigamboni map (with no-key fallback), share / QR /
   print, wishlist / compare, and the contact / schedule-visit / reserve flows
   that write inbound documents straight to Firestore (no backend).

   All inbound writes use ONLY the keys allowed by firestore.rules' validInbound()
   guard, and route "reserve" through /leads (anonymous-creatable) since
   /reservations requires sign-in (auth arrives in a later phase).
   ============================================================================= */

import {
  getPropertyBySlugOrId, fetchAllPublished, propertyCardHTML, plotPlaceholder, locationBySlug
} from "/assets/js/catalog.js";
import {
  $, $$, el, escapeHtml, formatMoney, formatNumber, truncate, qrUrl, shareLinks,
  whatsappLink, copyText, nativeShare, isPhoneTz, normalizePhoneTz, isEmail, store,
  observeOnce, SAM_BRAND
} from "/assets/js/utils.js";
import { col, serverTimestamp, COLLECTIONS, IS_CONFIGURED } from "/assets/js/firebase.js";
import { addDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { trackPropertyView, trackLead, trackAppointment, trackShare } from "/assets/js/analytics.js";

let PROP = null;
let CATALOG = [];
let gallery = { images: [], index: 0 };

/* -----------------------------------------------------------------------------
   Resolve which property to show.
   -------------------------------------------------------------------------- */
function parseKey() {
  const m = location.pathname.match(/\/property\/([^/?#]+)/);
  if (m && m[1]) return decodeURIComponent(m[1]);
  const sp = new URLSearchParams(location.search);
  return sp.get("slug") || sp.get("id") || "";
}

/* -----------------------------------------------------------------------------
   SVG icon shorthands.
   -------------------------------------------------------------------------- */
const I = {
  size: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none"><path d="M3 3h7v7H3zM14 14h7v7h-7z" stroke="currentColor" stroke-width="1.7"/><path d="M10 7h11M7 10v11" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  type: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none"><path d="M3 21h18M5 21V9l7-5 7 5v12" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
  status: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/><path d="M8 12l3 3 5-5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  deed: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none"><rect x="5" y="3" width="14" height="18" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M9 8h6M9 12h6M9 16h4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  pin: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none"><path d="M12 21s-7-5.3-7-11a7 7 0 0114 0c0 5.7-7 11-7 11z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="12" cy="10" r="2.4" stroke="currentColor" stroke-width="1.7"/></svg>',
  road: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none"><path d="M6 3l-3 18M18 3l3 18M12 4v3M12 11v3M12 18v2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none"><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  use: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none"><path d="M3 9l9-6 9 6v11a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1V9z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M5 12l4 4L19 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};

/* -----------------------------------------------------------------------------
   Layout builder.
   -------------------------------------------------------------------------- */
function specItem(icon, k, v) {
  if (!v) return "";
  return `<div class="spec"><span class="spec__icon">${icon}</span><span><span class="spec__k">${escapeHtml(k)}</span><br/><span class="spec__v">${escapeHtml(v)}</span></span></div>`;
}

function buildLayout(p) {
  const loc = locationBySlug(p.locationSlug);
  const images = (p.images && p.images.length) ? p.images : [{ url: plotPlaceholder(p.location, p.code), thumb: plotPlaceholder(p.location, p.code) }];
  gallery.images = images;

  const badges = [];
  if (p.featured) badges.push(`<span class="badge badge-featured">Maalum</span>`);
  if (p.governmentApproved) badges.push(`<span class="badge badge-gov">${I.check} Serikali Imeidhinisha</span>`);
  if (p.verified) badges.push(`<span class="badge badge-verified">Imethibitishwa</span>`);
  if (p.isNew) badges.push(`<span class="badge badge-new">Mpya</span>`);
  if (p.hot) badges.push(`<span class="badge badge-hot">Ofa</span>`);
  badges.push(statusBadge(p.status));

  const thumbs = images.length > 1 ? `
    <div class="gallery__thumbs" id="gallery-thumbs">
      ${images.map((im, i) => `<button class="gallery__thumb${i === 0 ? " is-active" : ""}" data-idx="${i}" type="button"><img src="${im.thumb || im.url}" alt="Picha ${i + 1}" loading="lazy" /></button>`).join("")}
    </div>` : "";

  const priceBlock = `
    <div class="price-row">
      <span class="price-now">${formatMoney(p.price)}</span>
      ${p.oldPrice && p.oldPrice > p.price ? `<span class="price-old">${formatMoney(p.oldPrice)}</span>` : ""}
    </div>
    ${p.downPayment ? `<p class="text-sm text-muted mt-2">Malipo ya awali kuanzia <strong>${formatMoney(p.downPayment)}</strong>${p.installmentMonths ? ` · awamu hadi miezi ${p.installmentMonths}` : ""}</p>` : ""}`;

  const features = p.features && p.features.length ? `
    <h3 class="h4 mt-8">Sifa za Kiwanja</h3>
    <ul class="feature-list mt-4">
      ${p.features.map((f) => `<li>${I.check}<span>${escapeHtml(f)}</span></li>`).join("")}
    </ul>` : "";

  const am = p.amenities || {};
  const amenityItems = [
    ["Shule", am.schools], ["Hospitali", am.hospitals], ["Masoko", am.markets], ["Usafiri", am.transport]
  ].filter(([, v]) => v);
  const amenities = amenityItems.length ? `
    <h3 class="h4 mt-8">Huduma za Jirani</h3>
    <div class="grid grid-2 mt-4">
      ${amenityItems.map(([k, v]) => `<div class="amenity"><span class="amenity__icon">${I.pin}</span><span><strong>${escapeHtml(k)}</strong><br/><span class="text-sm text-muted">${escapeHtml(v)}</span></span></div>`).join("")}
    </div>` : "";

  const utilities = (p.utilities && p.utilities.length)
    ? `<div class="spec"><span class="spec__icon">${I.bolt}</span><span><span class="spec__k">Huduma</span><br/><span class="spec__v">${escapeHtml(p.utilities.join(", "))}</span></span></div>`
    : "";

  const gmapsLink = p.gps ? `https://www.google.com/maps?q=${p.gps.lat},${p.gps.lng}` : "https://www.google.com/maps?q=Kigamboni";
  const streetLink = p.gps ? `https://www.google.com/maps?q=&layer=c&cbll=${p.gps.lat},${p.gps.lng}` : gmapsLink;

  const benefits = [
    "Thamani ya ardhi Kigamboni inapanda kila mwaka",
    "Hati miliki safi iliyosajiliwa — uwekezaji salama",
    "Malipo kwa awamu yanayonyumbulika",
    "Eneo la kimkakati karibu na miundombinu mipya"
  ];

  return `
  <div class="container container-wide section">
    <nav class="crumbs" aria-label="Njia ya ukurasa">
      <a href="/">Nyumbani</a>
      <a href="/properties.html">Viwanja</a>
      <a href="/locations.html?slug=${escapeHtml(p.locationSlug)}">${escapeHtml(p.location)}</a>
      <span class="is-current">${escapeHtml(p.code)}</span>
    </nav>

    <div class="detail-grid mt-6">
      <!-- MAIN -->
      <div class="detail-main">
        <!-- Gallery -->
        <div class="gallery">
          <div class="gallery__main">
            <div class="gallery__badges">${badges.join("")}</div>
            <img id="gallery-img" src="${images[0].url}" alt="${escapeHtml(p.title)}" />
            ${images.length > 1 ? `
              <button class="gallery__nav gallery__prev" id="gallery-prev" aria-label="Picha iliyopita"><svg viewBox="0 0 24 24" width="22" height="22" fill="none"><path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
              <button class="gallery__nav gallery__next" id="gallery-next" aria-label="Picha inayofuata"><svg viewBox="0 0 24 24" width="22" height="22" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
              <span class="gallery__count"><span id="gallery-cur">1</span> / ${images.length}</span>` : ""}
          </div>
          ${thumbs}
        </div>

        <!-- Title -->
        <div class="mt-7">
          <div class="flex-between wrap gap-3">
            <span class="property-card__loc detail-loc">${I.pin}${escapeHtml(p.location)}, Kigamboni</span>
            <span class="mono text-faint text-sm">${escapeHtml(p.code)}</span>
          </div>
          <h1 class="detail-title mt-2">${escapeHtml(p.title)}</h1>
        </div>

        <!-- Quick specs -->
        <div class="spec-grid mt-6">
          ${specItem(I.size, "Ukubwa", p.size ? `${formatNumber(p.size)} ${p.sizeUnit}` : "")}
          ${specItem(I.type, "Aina", p.type)}
          ${specItem(I.use, "Matumizi", p.landUse)}
          ${specItem(I.deed, "Umiliki", p.ownership)}
          ${specItem(I.road, "Barabara", p.roadAccess)}
          ${utilities}
        </div>

        ${p.description ? `<h3 class="h4 mt-8">Maelezo</h3><p class="lead mt-3">${escapeHtml(p.description)}</p>` : ""}
        ${features}
        ${amenities}

        <!-- Investment benefits -->
        <h3 class="h4 mt-8">Faida za Uwekezaji</h3>
        <ul class="feature-list mt-4">
          ${benefits.map((b) => `<li>${I.check}<span>${escapeHtml(b)}</span></li>`).join("")}
        </ul>

        <!-- Map -->
        <h3 class="h4 mt-8">Ramani &amp; Mahali</h3>
        <div class="detail-map mt-4">
          <div class="detail-map__mount" id="detail-map-mount"></div>
          <div class="detail-map__fallback" id="detail-map-fallback">
            <div class="detail-map__grid" aria-hidden="true"></div>
            <div style="position:relative;z-index:1">
              <span class="seal-sm" style="margin:0 auto"><span>KGB<br/>PLOT</span></span>
              <p class="mono text-sm mt-4" style="color:var(--c-gold-bright)">${p.gps ? `LAT ${p.gps.lat} · LON ${p.gps.lng}` : "KIGAMBONI · TANZANIA"}</p>
              <div class="flex-center gap-3 mt-4 wrap">
                <a class="btn btn-gold btn-sm" href="${gmapsLink}" target="_blank" rel="noopener">Fungua Google Maps</a>
                <a class="btn btn-glass btn-sm" href="${streetLink}" target="_blank" rel="noopener">Street View</a>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- SIDEBAR -->
      <aside class="detail-side">
        <div class="card side-card">
          <div class="card-body">
            <div class="flex gap-4 items-center">
              <span class="seal-sm" aria-hidden="true"><span>SERIKALI<br/>HATI SAFI</span></span>
              <div>${priceBlock}</div>
            </div>

            <div class="flex flex-col gap-3 mt-6">
              <a class="btn btn-whatsapp btn-lg btn-block" id="act-whatsapp" target="_blank" rel="noopener">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 00-8.6 15l-1.3 4.7 4.8-1.3A10 10 0 1012 2zm0 18a8 8 0 01-4.1-1.1l-.3-.2-2.9.8.8-2.8-.2-.3A8 8 0 1112 20z"/></svg>
                Uliza kwa WhatsApp
              </a>
              <button class="btn btn-gold btn-block" id="act-schedule" type="button">Panga Ziara ya Kiwanja</button>
              <button class="btn btn-navy btn-block" id="act-reserve" type="button">Hifadhi Kiwanja (Reserve)</button>
              <a class="btn btn-outline btn-block" id="act-call">Piga Simu</a>
            </div>

            <div class="divider"></div>

            <div class="flex gap-2 wrap">
              <button class="btn btn-outline btn-sm" data-wish="${escapeHtml(p.id)}" id="act-wish" type="button">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true"><path d="M12 21s-7-4.6-9.2-8.4C1.2 9.3 2.6 6 6 6c2 0 3.2 1.2 4 2.3C10.8 7.2 12 6 14 6c3.4 0 4.8 3.3 3.2 6.6C19 16.4 12 21 12 21z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>
                <span id="wish-label">Hifadhi</span>
              </button>
              <button class="btn btn-outline btn-sm" data-compare="${escapeHtml(p.id)}" type="button">Linganisha</button>
            </div>

            <div class="share-row mt-5">
              <button class="icon-action" id="share-native" aria-label="Sambaza" title="Sambaza"><svg viewBox="0 0 24 24" width="18" height="18" fill="none"><path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M16 6l-4-4-4 4M12 2v14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
              <button class="icon-action" data-ch="whatsapp" aria-label="WhatsApp" title="WhatsApp"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2a10 10 0 00-8.6 15l-1.3 4.7 4.8-1.3A10 10 0 1012 2z"/></svg></button>
              <button class="icon-action" data-ch="facebook" aria-label="Facebook" title="Facebook"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M14 9h3V6h-3c-2.2 0-4 1.8-4 4v2H8v3h2v7h3v-7h2.5l.5-3H13v-2c0-.6.4-1 1-1z"/></svg></button>
              <button class="icon-action" data-ch="x" aria-label="X" title="X"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M17 3h3l-7 8 8 10h-6l-5-6-5 6H2l8-9L2 3h6l4 5 5-5z"/></svg></button>
              <button class="icon-action" id="share-copy" aria-label="Nakili kiungo" title="Nakili kiungo"><svg viewBox="0 0 24 24" width="18" height="18" fill="none"><rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M5 15V5a2 2 0 012-2h10" stroke="currentColor" stroke-width="1.8"/></svg></button>
              <button class="icon-action" id="share-qr" aria-label="QR" title="QR Code"><svg viewBox="0 0 24 24" width="18" height="18" fill="none"><rect x="3" y="3" width="7" height="7" stroke="currentColor" stroke-width="1.8"/><rect x="3" y="14" width="7" height="7" stroke="currentColor" stroke-width="1.8"/><rect x="14" y="3" width="7" height="7" stroke="currentColor" stroke-width="1.8"/><path d="M14 14h3v3M21 14v7h-7" stroke="currentColor" stroke-width="1.8"/></svg></button>
              <button class="icon-action" id="share-print" aria-label="Chapisha" title="Chapisha"><svg viewBox="0 0 24 24" width="18" height="18" fill="none"><path d="M6 9V3h12v6M6 18H4a2 2 0 01-2-2v-3a2 2 0 012-2h16a2 2 0 012 2v3a2 2 0 01-2 2h-2M6 14h12v7H6z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg></button>
            </div>

            ${p.brochureUrl ? `<a class="btn btn-ghost btn-sm btn-block mt-4" href="${escapeHtml(p.brochureUrl)}" target="_blank" rel="noopener">Pakua Brosha (PDF)</a>` : ""}

            <div class="divider"></div>
            <p class="text-sm text-muted">Wasiliana na wakala wetu kwa maelezo zaidi, upangaji wa ziara, au mazungumzo ya bei.</p>
            <p class="text-sm mt-2"><strong data-bind="brand.name">SAM EMPIRE</strong> · <span data-bind="brand.phone">+255 689 621 263</span></p>
          </div>
        </div>
      </aside>
    </div>

    <!-- Related -->
    <section class="mt-12" id="related-section" hidden>
      <h2 class="h3">Viwanja Vinavyofanana</h2>
      <div class="grid grid-3 mt-6" id="related-grid"></div>
    </section>

    <!-- Recently viewed -->
    <section class="mt-12" id="recent-section" hidden>
      <h2 class="h3">Ulivyotazama Hivi Karibuni</h2>
      <div class="grid grid-4 mt-6" id="recent-grid"></div>
    </section>
  </div>`;
}

function statusBadge(status) {
  const s = String(status).toLowerCase();
  if (s === "sold" || s === "imeuzwa") return `<span class="badge badge-sold"><span class="dot"></span>Imeuzwa</span>`;
  if (s === "reserved" || s === "imehifadhiwa") return `<span class="badge badge-reserved"><span class="dot"></span>Imehifadhiwa</span>`;
  return `<span class="badge badge-available"><span class="dot"></span>Inapatikana</span>`;
}

/* -----------------------------------------------------------------------------
   Gallery interactions.
   -------------------------------------------------------------------------- */
function setImage(idx) {
  const imgs = gallery.images;
  gallery.index = (idx + imgs.length) % imgs.length;
  const main = $("#gallery-img");
  if (main) main.src = imgs[gallery.index].url;
  const cur = $("#gallery-cur");
  if (cur) cur.textContent = String(gallery.index + 1);
  $$("#gallery-thumbs .gallery__thumb").forEach((t, i) => t.classList.toggle("is-active", i === gallery.index));
}

function wireGallery() {
  $("#gallery-prev")?.addEventListener("click", () => setImage(gallery.index - 1));
  $("#gallery-next")?.addEventListener("click", () => setImage(gallery.index + 1));
  $("#gallery-thumbs")?.addEventListener("click", (e) => {
    const t = e.target.closest("[data-idx]"); if (t) setImage(parseInt(t.dataset.idx, 10));
  });
  // Lightbox
  const lb = $("#lightbox"), lbImg = $("#lightbox-img");
  $("#gallery-img")?.addEventListener("click", () => { lbImg.src = gallery.images[gallery.index].url; lb.classList.add("is-open"); });
  $("#lightbox-close")?.addEventListener("click", () => lb.classList.remove("is-open"));
  lb?.addEventListener("click", (e) => { if (e.target === lb) lb.classList.remove("is-open"); });
  document.addEventListener("keydown", (e) => {
    if (!lb.classList.contains("is-open")) return;
    if (e.key === "Escape") lb.classList.remove("is-open");
    if (e.key === "ArrowLeft") { setImage(gallery.index - 1); lbImg.src = gallery.images[gallery.index].url; }
    if (e.key === "ArrowRight") { setImage(gallery.index + 1); lbImg.src = gallery.images[gallery.index].url; }
  });
}

/* -----------------------------------------------------------------------------
   Contact / schedule / reserve forms → Firestore (inbound, rules-compliant).
   -------------------------------------------------------------------------- */
function makeField(labelHtml, inputEl, hint) {
  const wrap = el("div", { class: "field" });
  const lab = el("label", { class: "label", html: labelHtml });
  wrap.append(lab, inputEl);
  if (hint) wrap.append(el("p", { class: "hint", text: hint }));
  inputEl._field = wrap;
  return wrap;
}

function openLeadForm(kind) {
  const SAM = window.SAM;
  if (!SAM || !SAM.openModal) return;

  const titles = { inquiry: "Wasiliana na Wakala", schedule: "Panga Ziara ya Kiwanja", reserve: "Hifadhi Kiwanja" };
  const name = el("input", { class: "input", type: "text", placeholder: "Jina lako kamili", maxLength: "120", autocomplete: "name" });
  const phone = el("input", { class: "input", type: "tel", placeholder: "07XX XXX XXX", autocomplete: "tel" });
  const email = el("input", { class: "input", type: "email", placeholder: "barua@pepe.com (hiari)", autocomplete: "email" });
  const date = el("input", { class: "input", type: "date" });
  const time = el("input", { class: "input", type: "time" });
  const msg = el("textarea", { class: "textarea", placeholder: "Ujumbe wako (hiari)", maxLength: "1500" });

  const body = el("div", { class: "flex flex-col gap-4" });
  body.append(
    el("p", { class: "text-sm text-muted", text: `${PROP.title} · ${PROP.code}` }),
    makeField('Jina <span class="req">*</span>', name),
    makeField('Simu <span class="req">*</span>', phone, "Tutawasiliana nawe kupitia simu/WhatsApp.")
  );
  if (kind === "reserve" || kind === "inquiry") body.append(makeField("Barua pepe", email));
  if (kind === "schedule") {
    const row = el("div", { class: "grid grid-2 gap-3" });
    row.append(makeField("Tarehe", date), makeField("Saa", time));
    body.append(row);
  }
  body.append(makeField("Ujumbe", msg));

  const setErr = (input, on) => input._field && input._field.classList.toggle("is-error", on);

  const submit = async (close) => {
    let ok = true;
    const nm = name.value.trim();
    if (!nm || nm.length > 120) { setErr(name, true); ok = false; } else setErr(name, false);
    if (!isPhoneTz(phone.value)) { setErr(phone, true); ok = false; } else setErr(phone, false);
    if ((kind === "reserve" || kind === "inquiry") && email.value && !isEmail(email.value)) { setErr(email, true); ok = false; } else setErr(email, false);
    if (!ok) { SAM.toast && SAM.toast("Tafadhali jaza taarifa sahihi.", "warning"); return; }

    const phoneNorm = normalizePhoneTz(phone.value);
    const message = msg.value.trim();

    // No backend / not configured yet → still capture the lead via WhatsApp.
    if (!IS_CONFIGURED) {
      const lines = [
        `*${titles[kind]}* — SAM EMPIRE`,
        `Kiwanja: ${PROP.title} (${PROP.code})`,
        `Jina: ${nm}`, `Simu: ${phoneNorm}`,
        kind === "schedule" && date.value ? `Tarehe: ${date.value} ${time.value || ""}` : "",
        message ? `Ujumbe: ${message}` : ""
      ].filter(Boolean).join("\n");
      window.open(whatsappLink(lines), "_blank", "noopener");
      close();
      SAM.toast && SAM.toast("Tunakupeleka WhatsApp kukamilisha ombi.", "info");
      return;
    }

    try {
      if (kind === "schedule") {
        const payload = {
          name: nm, phone: phoneNorm, propertyId: PROP.id, propertyCode: PROP.code,
          source: "schedule_visit", status: "new",
          date: date.value || "", time: time.value || "", notes: message,
          createdAt: serverTimestamp(), locale: SAM_BRAND.locale
        };
        await addDoc(col(COLLECTIONS.APPOINTMENTS), payload);
        trackAppointment(PROP.id);
      } else {
        const payload = {
          name: nm, phone: phoneNorm, email: email.value.trim() || "", message,
          propertyId: PROP.id, propertyCode: PROP.code,
          source: kind === "reserve" ? "reservation" : "property_inquiry", status: "new",
          createdAt: serverTimestamp(), locale: SAM_BRAND.locale
        };
        await addDoc(col(COLLECTIONS.LEADS), payload);
        trackLead(kind, PROP.id);
      }
      close();
      SAM.toast && SAM.toast("Ombi lako limepokelewa! Tutawasiliana nawe hivi karibuni.", "success");
    } catch (err) {
      console.warn("[SAM] lead submit:", err?.code || err);
      SAM.toast && SAM.toast("Samahani, imeshindikana kutuma. Jaribu tena au tumia WhatsApp.", "error");
    }
  };

  // Enter-to-submit on single-line inputs.
  [name, phone, email, date, time].forEach((inp) =>
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); submit(window.SAM.closeModal); } }));

  SAM.openModal({
    title: titles[kind],
    body,
    actions: [
      { label: "Ghairi", class: "btn btn-ghost", onClick: (close) => close() },
      { label: kind === "schedule" ? "Thibitisha Ziara" : (kind === "reserve" ? "Hifadhi Sasa" : "Tuma Ujumbe"), class: "btn btn-gold", onClick: (close) => submit(close) }
    ]
  });
  setTimeout(() => name.focus(), 60);
}

/* -----------------------------------------------------------------------------
   Sidebar actions (share / qr / print / wishlist label).
   -------------------------------------------------------------------------- */
function wireActions(p) {
  const url = location.href;
  const title = `${p.title} — SAM EMPIRE`;
  const text = `${p.title} · ${formatMoney(p.price)} · ${p.location}, Kigamboni`;
  const links = shareLinks({ url, title, text });

  $("#act-whatsapp")?.setAttribute("href", whatsappLink(`Habari SAM EMPIRE, nimevutiwa na kiwanja: ${p.title} (${p.code}). Naomba maelezo zaidi.`));
  $("#act-call")?.setAttribute("href", "tel:" + SAM_BRAND.phonePlain);
  $("#act-schedule")?.addEventListener("click", () => openLeadForm("schedule"));
  $("#act-reserve")?.addEventListener("click", () => openLeadForm("reserve"));

  // Share channels
  $$("[data-ch]").forEach((b) => b.addEventListener("click", () => {
    const ch = b.dataset.ch;
    if (links[ch]) { window.open(links[ch], "_blank", "noopener"); trackShare(ch, url); }
  }));
  $("#share-native")?.addEventListener("click", async () => {
    const done = await nativeShare({ title, text, url });
    if (done) trackShare("native", url);
    else { window.open(links.whatsapp, "_blank", "noopener"); }
  });
  $("#share-copy")?.addEventListener("click", async () => {
    const ok = await copyText(url);
    window.SAM && window.SAM.toast && window.SAM.toast(ok ? "Kiungo kimenakiliwa!" : "Imeshindikana kunakili.", ok ? "success" : "error");
    if (ok) trackShare("copy", url);
  });
  $("#share-print")?.addEventListener("click", () => window.print());
  $("#share-qr")?.addEventListener("click", () => {
    window.SAM && window.SAM.openModal && window.SAM.openModal({
      title: "QR Code ya Kiwanja",
      body: `<div class="text-center"><img src="${qrUrl(url, 240)}" alt="QR code" width="240" height="240" style="margin:0 auto;border-radius:var(--r-md)" /><p class="text-sm text-muted mt-4">Skani kufungua kiwanja hiki kwenye simu.</p></div>`,
      actions: [{ label: "Funga", class: "btn btn-outline", onClick: (c) => c() }]
    });
  });

  // Wishlist label reflects state (script.js toggles is-active + aria-pressed).
  const updateWishLabel = () => {
    const lbl = $("#wish-label");
    const on = window.SAM && window.SAM.isWished && window.SAM.isWished(p.id);
    if (lbl) lbl.textContent = on ? "Imehifadhiwa" : "Hifadhi";
  };
  updateWishLabel();
  document.addEventListener("sam:wishlist", updateWishLabel);
}

/* -----------------------------------------------------------------------------
   Related + recently viewed.
   -------------------------------------------------------------------------- */
function revealIn(container) {
  const nodes = $$("[data-reveal]", container);
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) { nodes.forEach((n) => n.classList.add("is-visible")); return; }
  observeOnce(nodes, (n) => n.classList.add("is-visible"), { threshold: 0.1 });
}

function renderRelated(p) {
  const related = CATALOG
    .filter((x) => x.id !== p.id && (x.locationSlug === p.locationSlug || x.type === p.type))
    .slice(0, 3);
  if (!related.length) return;
  $("#related-grid").innerHTML = related.map(propertyCardHTML).join("");
  $("#related-section").hidden = false;
  revealIn($("#related-grid"));
}

function renderRecent(p) {
  const ids = store.get("recent:properties", []).filter((id) => id !== p.id);
  const items = ids.map((id) => CATALOG.find((x) => x.id === id)).filter(Boolean).slice(0, 4);
  if (!items.length) return;
  $("#recent-grid").innerHTML = items.map(propertyCardHTML).join("");
  $("#recent-section").hidden = false;
  revealIn($("#recent-grid"));
}

/* -----------------------------------------------------------------------------
   SEO / meta.
   -------------------------------------------------------------------------- */
function applyMeta(p) {
  document.title = `${p.title} · ${formatMoney(p.price)} — SAM EMPIRE`;
  const set = (sel, val) => { const m = $(sel); if (m) m.setAttribute("content", val); };
  set('meta[name="description"]', truncate(p.description || `${p.title} — kiwanja kilichopimwa ${p.location}, Kigamboni. ${formatMoney(p.price)}.`, 160));
  set("#og-title", `${p.title} — SAM EMPIRE`);
  set("#og-desc", `${p.location}, Kigamboni · ${formatMoney(p.price)} · ${p.ownership}`);
  if (p.images && p.images[0]) set('meta[property="og:image"]', p.images[0].url);
}

/* -----------------------------------------------------------------------------
   Map (live with key, else fallback already shown).
   -------------------------------------------------------------------------- */
function initDetailMap(p) {
  const key = (typeof window !== "undefined" && window.SAM_MAPS_KEY) || "";
  const mount = $("#detail-map-mount");
  if (!key || !p.gps || !mount) return;
  window.__samDetailMap = function () {
    try {
      const map = new google.maps.Map(mount, {
        center: p.gps, zoom: 15, mapTypeControl: false, streetViewControl: true, fullscreenControl: false,
        styles: [
          { elementType: "geometry", stylers: [{ color: "#0b1a38" }] },
          { elementType: "labels.text.fill", stylers: [{ color: "#cbd5e8" }] },
          { featureType: "water", stylers: [{ color: "#06294f" }] },
          { featureType: "road", elementType: "geometry", stylers: [{ color: "#1e2f50" }] }
        ]
      });
      new google.maps.Marker({ position: p.gps, map, title: p.title,
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: "#D4AF37", fillOpacity: 1, strokeColor: "#081F4D", strokeWeight: 2 } });
      const fb = $("#detail-map-fallback"); if (fb) fb.style.display = "none";
    } catch (e) { console.warn("[SAM] detail map:", e); }
  };
  const s = document.createElement("script");
  s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=__samDetailMap&loading=async`;
  s.async = true; s.onerror = () => console.warn("[SAM] Maps failed; keeping fallback.");
  document.head.appendChild(s);
}

/* -----------------------------------------------------------------------------
   Boot.
   -------------------------------------------------------------------------- */
async function boot() {
  const key = parseKey();
  PROP = await getPropertyBySlugOrId(key);

  const loading = $("#property-loading");
  const root = $("#property-root");
  const missing = $("#property-missing");

  if (!PROP) {
    if (loading) loading.hidden = true;
    if (missing) missing.hidden = false;
    return;
  }

  root.innerHTML = buildLayout(PROP);
  if (loading) loading.hidden = true;
  root.hidden = false;

  applyMeta(PROP);
  wireGallery();
  wireActions(PROP);
  initDetailMap(PROP);
  trackPropertyView(PROP); // records the view + pushes to recently-viewed

  // Reflect wishlist/compare state on the freshly injected buttons.
  window.SAM && window.SAM.refreshWishUI && window.SAM.refreshWishUI();
  // Re-bind brand/contact placeholders inside the injected markup.
  document.dispatchEvent(new CustomEvent("sam:settings", { detail: (window.SAM && window.SAM.settings) || {} }));

  // Related + recently viewed need the catalogue.
  CATALOG = await fetchAllPublished(120);
  renderRelated(PROP);
  renderRecent(PROP);
  revealIn(root);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
