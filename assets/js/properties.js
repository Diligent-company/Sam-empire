/* =============================================================================
   SAM EMPIRE — properties.js
   Listings page controller. Loads the published catalogue once, then filters,
   sorts and paginates entirely on the client for instant UX. Reads initial
   filters from the URL (so the homepage hero search deep-links here), keeps the
   URL in sync, renders active-filter chips, and drives the compare overlay.
   ============================================================================= */

import {
  fetchAllPublished, propertyCardHTML, KIGAMBONI_LOCATIONS,
  inPriceBucket, inSizeBucket, plotPlaceholder
} from "/assets/js/catalog.js";
import {
  $, $$, debounce, getParam, setParams, escapeHtml, formatMoney, formatNumber, observeOnce, store
} from "/assets/js/utils.js";
import { trackSearch } from "/assets/js/analytics.js";

const PAGE_SIZE = 9;
let ALL = [];
let page = 1;

const els = {};
function cache() {
  els.q = $("#f-q");
  els.location = $("#f-location");
  els.type = $("#f-type");
  els.price = $("#f-price");
  els.size = $("#f-size");
  els.sort = $("#f-sort");
  els.grid = $("#results-grid");
  els.count = $("#result-count");
  els.chips = $("#active-chips");
  els.clear = $("#clear-filters");
  els.empty = $("#empty-state");
  els.pagination = $("#pagination");
  els.compareBar = $("#compare-bar");
}

/* ---- Filters ------------------------------------------------------------- */
function readFilters() {
  return {
    q: (els.q.value || "").trim().toLowerCase(),
    location: els.location.value || "",
    type: els.type.value || "",
    price: els.price.value || "",
    size: els.size.value || "",
    sort: els.sort.value || "new"
  };
}

function applyFilters(list, f) {
  let out = list.filter((p) => {
    if (f.q) {
      const hay = `${p.title} ${p.location} ${p.code} ${p.type}`.toLowerCase();
      if (!hay.includes(f.q)) return false;
    }
    if (f.location && p.locationSlug !== f.location) return false;
    if (f.type && p.type !== f.type) return false;
    if (!inPriceBucket(p.price, f.price)) return false;
    if (!inSizeBucket(p.size, f.size)) return false;
    return true;
  });
  switch (f.sort) {
    case "price-asc":  out.sort((a, b) => a.price - b.price); break;
    case "price-desc": out.sort((a, b) => b.price - a.price); break;
    case "size-desc":  out.sort((a, b) => (b.size || 0) - (a.size || 0)); break;
    case "size-asc":   out.sort((a, b) => (a.size || 0) - (b.size || 0)); break;
    default:           out.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }
  return out;
}

/* ---- Chips --------------------------------------------------------------- */
function optionLabel(select, value) {
  const opt = $$("option", select).find((o) => o.value === value);
  return opt ? opt.textContent : value;
}

function renderChips(f) {
  const chips = [];
  const add = (key, label) => chips.push(
    `<span class="chip-x">${escapeHtml(label)}<button data-remove="${key}" aria-label="Ondoa kichujio" type="button"><svg viewBox="0 0 24 24" width="14" height="14" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></span>`
  );
  if (f.q) add("q", `“${f.q}”`);
  if (f.location) add("location", optionLabel(els.location, f.location));
  if (f.type) add("type", f.type);
  if (f.price) add("price", optionLabel(els.price, f.price));
  if (f.size) add("size", optionLabel(els.size, f.size));
  els.chips.innerHTML = chips.join("");
  const any = !!(f.q || f.location || f.type || f.price || f.size);
  els.clear.hidden = !any;
}

/* ---- Pagination ---------------------------------------------------------- */
function renderPagination(total) {
  const pages = Math.ceil(total / PAGE_SIZE);
  if (pages <= 1) { els.pagination.innerHTML = ""; return; }
  const btn = (label, p, opts = {}) => {
    if (opts.current) return `<span class="is-current" aria-current="page">${label}</span>`;
    if (opts.disabled) return `<span aria-disabled="true" style="opacity:.4">${label}</span>`;
    return `<a href="#" data-page="${p}">${label}</a>`;
  };
  const parts = [];
  parts.push(btn("‹", page - 1, { disabled: page === 1 }));
  const win = [];
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - page) <= 1) win.push(p);
    else if (win[win.length - 1] !== "…") win.push("…");
  }
  win.forEach((p) => parts.push(p === "…" ? `<span style="opacity:.4">…</span>` : btn(String(p), p, { current: p === page })));
  parts.push(btn("›", page + 1, { disabled: page === pages }));
  els.pagination.innerHTML = parts.join("");
}

/* ---- Render -------------------------------------------------------------- */
function revealIn(container) {
  const nodes = $$("[data-reveal]", container);
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) { nodes.forEach((n) => n.classList.add("is-visible")); return; }
  observeOnce(nodes, (n) => n.classList.add("is-visible"), { threshold: 0.1, rootMargin: "0px 0px -4% 0px" });
}

function render() {
  const f = readFilters();
  const list = applyFilters(ALL, f);
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  if (page > pages) page = pages;

  renderChips(f);

  els.count.textContent = list.length
    ? `${formatNumber(list.length)} ${list.length === 1 ? "kiwanja" : "viwanja"} vimepatikana`
    : "Hakuna kiwanja kilichopatikana";

  if (!list.length) {
    els.grid.innerHTML = "";
    els.grid.setAttribute("aria-busy", "false");
    els.empty.hidden = false;
    els.pagination.innerHTML = "";
    return;
  }
  els.empty.hidden = true;

  const start = (page - 1) * PAGE_SIZE;
  const slice = list.slice(start, start + PAGE_SIZE);
  els.grid.innerHTML = slice.map(propertyCardHTML).join("");
  els.grid.setAttribute("aria-busy", "false");
  renderPagination(list.length);
  revealIn(els.grid);
  window.SAM && window.SAM.refreshWishUI && window.SAM.refreshWishUI();
}

/* ---- URL sync + change handling ----------------------------------------- */
function syncUrl(f) {
  setParams({
    q: f.q || null, location: f.location || null, type: f.type || null,
    price: f.price || null, size: f.size || null,
    sort: f.sort && f.sort !== "new" ? f.sort : null
  });
}

function onFilterChange({ resetPage = true } = {}) {
  if (resetPage) page = 1;
  const f = readFilters();
  syncUrl(f);
  render();
  trackSearch(f.q, { location: f.location, type: f.type, price: f.price, size: f.size, sort: f.sort });
}

/* ---- Compare overlay ----------------------------------------------------- */
function updateCompareBar() {
  const ids = store.get("compare", []);
  els.compareBar.classList.toggle("is-visible", ids.length > 0);
}

function openCompare() {
  const ids = store.get("compare", []);
  const items = ids.map((id) => ALL.find((p) => p.id === id)).filter(Boolean);
  if (!items.length) return;

  const rows = [
    ["Picha", (p) => `<img src="${(p.images[0] && (p.images[0].thumb || p.images[0].url)) || plotPlaceholder(p.location, p.code)}" alt="${escapeHtml(p.title)}" />`],
    ["Jina", (p) => `<a href="/property-details.html?slug=${encodeURIComponent(p.slug)}" style="font-weight:700;color:var(--c-gold-deep)">${escapeHtml(p.title)}</a>`],
    ["Msimbo", (p) => `<span class="mono">${escapeHtml(p.code)}</span>`],
    ["Eneo", (p) => escapeHtml(p.location)],
    ["Bei", (p) => `<strong>${formatMoney(p.price)}</strong>`],
    ["Ukubwa", (p) => p.size ? `${formatNumber(p.size)} ${escapeHtml(p.sizeUnit)}` : "—"],
    ["Aina", (p) => escapeHtml(p.type)],
    ["Hati", (p) => escapeHtml(p.ownership)],
    ["Malipo ya awali", (p) => p.downPayment ? formatMoney(p.downPayment) : "—"]
  ];

  const table = `
    <div class="table-wrap">
      <table class="table compare-table">
        <tbody>
          ${rows.map(([label, fn]) => `<tr><th>${escapeHtml(label)}</th>${items.map((p) => `<td>${fn(p)}</td>`).join("")}</tr>`).join("")}
        </tbody>
      </table>
    </div>`;

  if (window.SAM && window.SAM.openModal) {
    window.SAM.openModal({
      title: `Linganisha Viwanja (${items.length})`,
      body: table,
      actions: [
        { label: "Funga", class: "btn btn-outline", onClick: (close) => close() },
        { label: "Futa Linganisho", class: "btn btn-ghost", onClick: (close) => { clearCompare(); close(); } }
      ]
    });
  }
}

function clearCompare() {
  store.set("compare", []);
  window.SAM && window.SAM.refreshWishUI && window.SAM.refreshWishUI();
  document.dispatchEvent(new CustomEvent("sam:compare", { detail: { ids: [] } }));
  updateCompareBar();
}

/* ---- Init ---------------------------------------------------------------- */
function populateLocationOptions() {
  els.location.append(...KIGAMBONI_LOCATIONS.map((l) => {
    const o = document.createElement("option");
    o.value = l.slug; o.textContent = l.name; return o;
  }));
}

function hydrateFromUrl() {
  const set = (elm, val) => { if (val != null) elm.value = val; };
  set(els.q, getParam("q"));
  set(els.location, getParam("location"));
  set(els.type, getParam("type"));
  set(els.price, getParam("price"));
  set(els.size, getParam("size"));
  set(els.sort, getParam("sort") || "new");
}

function wire() {
  els.q.addEventListener("input", debounce(() => onFilterChange(), 280));
  [els.location, els.type, els.price, els.size, els.sort].forEach((s) =>
    s.addEventListener("change", () => onFilterChange()));

  els.clear.addEventListener("click", resetFilters);
  $("#empty-clear")?.addEventListener("click", resetFilters);

  els.chips.addEventListener("click", (e) => {
    const b = e.target.closest("[data-remove]");
    if (!b) return;
    const key = b.dataset.remove;
    if (key === "q") els.q.value = "";
    else if (els[key]) els[key].value = "";
    onFilterChange();
  });

  els.pagination.addEventListener("click", (e) => {
    const a = e.target.closest("[data-page]");
    if (!a) return;
    e.preventDefault();
    page = parseInt(a.dataset.page, 10) || 1;
    render();
    document.getElementById("result-count").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  $("#compare-open")?.addEventListener("click", openCompare);
  $("#compare-clear")?.addEventListener("click", clearCompare);
  document.addEventListener("sam:compare", updateCompareBar);
}

function resetFilters() {
  els.q.value = ""; els.location.value = ""; els.type.value = "";
  els.price.value = ""; els.size.value = ""; els.sort.value = "new";
  onFilterChange();
}

async function boot() {
  cache();
  populateLocationOptions();
  hydrateFromUrl();
  wire();
  updateCompareBar();
  ALL = await fetchAllPublished(120);
  render();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
