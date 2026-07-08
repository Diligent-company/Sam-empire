/* =============================================================================
   SAM EMPIRE — script.js
   Public-site controller. This is the single <script type="module"> entry point
   for every public page; it imports the other modules so nothing initialises
   twice. Drives the design system's exact hooks:
     loader (.is-done) · header (.is-stuck/.is-solid) · drawer/menu (.is-open) ·
     [data-reveal]→.is-visible · .counter→.is-counting · .fab-top→.is-visible ·
     .cookie→.is-visible · .overlay/.modal · .toast-stack/.toast · .chip→.is-active
   Also: dark mode, parallax, live settings binding (admin-editable site), guest
   wishlist/compare, share, newsletter, service-worker registration.
   Exposes a curated window.SAM API for inline page scripts.
   ============================================================================= */

import {
  $, $$, el, escapeHtml, isEmail, debounce, onFrame, prefersReducedMotion,
  observeOnce, store, copyText, nativeShare, shareLinks, whatsappLink, formatNumber,
  formatMoney, normalizePhoneTz, sanitizeText, SAM_BRAND
} from "./utils.js";
import {
  db, col, ref, COLLECTIONS, serverTimestamp, IS_CONFIGURED, onAuth
} from "./firebase.js";
import {
  addDoc, getDoc, setDoc, doc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  setConsent, getConsent, trackPageView, trackShare, trackWishlist
} from "./analytics.js";
import "./content.js"; // CMS page-content overlay (admin-editable copy + SEO)

/* =============================================================================
   A. TOAST + MODAL (built to the design-system markup)
   ============================================================================= */
function ensureToastStack() {
  let stack = $(".toast-stack");
  if (!stack) { stack = el("div", { class: "toast-stack", "aria-live": "polite", "aria-atomic": "true" }); document.body.append(stack); }
  return stack;
}

const ICONS = {
  success: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  error:   '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  warning: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  info:    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
};
const TONE = { success: "var(--c-success)", error: "var(--c-danger)", warning: "var(--c-warning)", info: "var(--c-info)" };

/** Show a toast. type ∈ success|error|warning|info. */
export function toast(message, type = "info", timeout = 4200) {
  const stack = ensureToastStack();
  const node = el("div", { class: `toast is-${type}`, role: "status" }, [
    el("span", { class: "toast__icon", style: `color:${TONE[type] || TONE.info}`, html: ICONS[type] || ICONS.info }),
    el("span", { class: "toast__msg", text: String(message) })
  ]);
  stack.append(node);
  const close = () => {
    node.style.transition = "opacity .25s ease, transform .25s ease";
    node.style.opacity = "0"; node.style.transform = "translateX(12px)";
    setTimeout(() => node.remove(), 260);
  };
  node.addEventListener("click", close);
  if (timeout) setTimeout(close, timeout);
  return close;
}

let _lastFocus = null;
/** Open a modal. Pass an element or an HTML string for the body. Returns controls. */
export function openModal({ title = "", body = "", actions = [], size = "" } = {}) {
  closeModal();
  const overlay = el("div", { class: "overlay", id: "sam-modal", role: "dialog", "aria-modal": "true", "aria-label": title || "Dialog" });
  const modal = el("div", { class: "modal" + (size ? " modal--" + size : "") });
  const head = el("div", { class: "modal__head" }, [
    el("h3", { class: "modal__title", text: title }),
    el("button", { class: "modal__close", "aria-label": "Close", html: ICONS.error, onClick: closeModal })
  ]);
  const bodyEl = el("div", { class: "modal__body" });
  if (typeof body === "string") bodyEl.innerHTML = body; else bodyEl.append(body);
  modal.append(head, bodyEl);
  if (actions.length) {
    const foot = el("div", { class: "modal__foot" });
    actions.forEach((a) => {
      const btn = el("button", { class: a.class || "btn btn--ghost", text: a.label });
      btn.addEventListener("click", () => a.onClick ? a.onClick(closeModal) : closeModal());
      foot.append(btn);
    });
    modal.append(foot);
  }
  overlay.append(modal);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });
  document.body.append(overlay);
  _lastFocus = document.activeElement;
  lockScroll(true);
  requestAnimationFrame(() => overlay.classList.add("is-open"));
  trapFocus(modal);
  document.addEventListener("keydown", escClose);
  return { overlay, modal, body: bodyEl, close: closeModal };
}

export function closeModal() {
  const overlay = $("#sam-modal");
  if (!overlay) return;
  overlay.classList.remove("is-open");
  document.removeEventListener("keydown", escClose);
  setTimeout(() => { overlay.remove(); lockScroll(false); if (_lastFocus) _lastFocus.focus?.(); }, 280);
}
function escClose(e) { if (e.key === "Escape") closeModal(); }

/** Promise-based confirm dialog. */
export function confirmDialog(message, { title = "Please confirm", confirmLabel = "Confirm", cancelLabel = "Cancel", danger = false } = {}) {
  return new Promise((resolve) => {
    openModal({
      title,
      body: `<p style="color:var(--text-muted);line-height:1.6">${escapeHtml(message)}</p>`,
      actions: [
        { label: cancelLabel, class: "btn btn--ghost", onClick: (c) => { c(); resolve(false); } },
        { label: confirmLabel, class: "btn " + (danger ? "btn--danger" : "btn--primary"), onClick: (c) => { c(); resolve(true); } }
      ]
    });
  });
}

/* Focus utilities ----------------------------------------------------------- */
function focusable(container) {
  return $$('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])', container)
    .filter((n) => n.offsetParent !== null);
}
function trapFocus(container) {
  const nodes = focusable(container);
  (nodes[0] || container).focus?.();
  container.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    const f = focusable(container); if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
}

let _scrollLocks = 0;
function lockScroll(on) {
  _scrollLocks = Math.max(0, _scrollLocks + (on ? 1 : -1));
  const locked = _scrollLocks > 0;
  if (locked) {
    const sbw = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (sbw > 0) document.body.style.paddingRight = sbw + "px";
  } else {
    document.body.style.overflow = "";
    document.body.style.paddingRight = "";
  }
}

/* =============================================================================
   B. LOADING SCREEN
   ============================================================================= */
function initLoader() {
  const loader = $(".loader");
  if (!loader) return;
  const reveal = () => loader.classList.add("is-done");
  if (prefersReducedMotion()) { reveal(); return; }
  const start = performance.now();
  const finish = () => {
    const elapsed = performance.now() - start;
    setTimeout(reveal, Math.max(0, 550 - elapsed)); // graceful minimum
  };
  if (document.readyState === "complete") finish();
  else window.addEventListener("load", finish, { once: true });
  // Safety net so the loader never traps the page
  setTimeout(reveal, 6000);
}

/* =============================================================================
   C. HEADER (sticky glass) + scroll progress
   ============================================================================= */
function initHeader() {
  const header = $(".site-header");
  if (!header) return;
  const solid = document.body.dataset.header === "solid";
  if (solid) header.classList.add("is-solid");

  const progress = $("[data-scroll-progress]");
  const onScroll = onFrame(() => {
    const y = window.scrollY;
    if (!solid) header.classList.toggle("is-stuck", y > 24);
    if (progress) {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;
    }
  });
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

/* =============================================================================
   D. MOBILE DRAWER
   ============================================================================= */
function initDrawer() {
  const toggle = $(".menu-toggle");
  const drawer = $(".drawer");
  if (!toggle || !drawer) return;
  let backdrop = $(".drawer-backdrop");
  if (!backdrop) { backdrop = el("div", { class: "drawer-backdrop" }); document.body.append(backdrop); }

  const open = () => {
    toggle.classList.add("is-open"); toggle.setAttribute("aria-expanded", "true");
    drawer.classList.add("is-open"); backdrop.classList.add("is-open");
    lockScroll(true); trapFocus(drawer);
  };
  const close = () => {
    toggle.classList.remove("is-open"); toggle.setAttribute("aria-expanded", "false");
    drawer.classList.remove("is-open"); backdrop.classList.remove("is-open");
    lockScroll(false); toggle.focus();
  };
  const isOpen = () => drawer.classList.contains("is-open");

  toggle.setAttribute("aria-controls", "site-drawer");
  toggle.setAttribute("aria-expanded", "false");
  toggle.addEventListener("click", () => (isOpen() ? close() : open()));
  backdrop.addEventListener("click", close);
  $$(".drawer__link, [data-drawer-close]", drawer).forEach((a) => a.addEventListener("click", close));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && isOpen()) close(); });
}

/* =============================================================================
   E. ACTIVE NAV LINK
   ============================================================================= */
function initActiveNav() {
  const path = location.pathname.replace(/\/index\.html$/, "/").replace(/\.html$/, "");
  $$(".nav__link, .drawer__link").forEach((a) => {
    const href = (a.getAttribute("href") || "").replace(/\.html$/, "").replace(/\/index$/, "/");
    if (!href || href.startsWith("#") || href.startsWith("http")) return;
    const norm = href === "/index" ? "/" : href;
    if (norm === path || (norm !== "/" && path.startsWith(norm))) a.classList.add("is-active");
  });
}

/* =============================================================================
   F. DARK MODE
   ============================================================================= */
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  store.set("theme", theme);
  const color = theme === "dark" ? "#050F26" : "#F4F6FA";
  let meta = $('meta[name="theme-color"]');
  if (!meta) { meta = el("meta", { name: "theme-color" }); document.head.append(meta); }
  meta.setAttribute("content", color);
  $$("[data-theme-toggle]").forEach((b) => b.setAttribute("aria-pressed", String(theme === "dark")));
  $$(".theme-switch input, [data-theme-switch]").forEach((i) => { if ("checked" in i) i.checked = theme === "dark"; });
}
function initTheme() {
  const saved = store.get("theme", null);
  const sys = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  applyTheme(saved || sys);
  $$("[data-theme-toggle], [data-theme-switch]").forEach((btn) => {
    btn.addEventListener("click", () => {
      applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
    });
    if (btn.tagName === "INPUT") btn.addEventListener("change", () => applyTheme(btn.checked ? "dark" : "light"));
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", (e) => {
    if (!store.get("theme", null)) applyTheme(e.matches ? "dark" : "light");
  });
}

/* =============================================================================
   G. SCROLL REVEAL
   ============================================================================= */
function initReveal() {
  const items = $$("[data-reveal]");
  if (!items.length) return;
  if (prefersReducedMotion()) { items.forEach((n) => n.classList.add("is-visible")); return; }
  items.forEach((n) => {
    const delay = n.dataset.delay;
    if (delay && !/^\d+$/.test(delay) === false && Number(delay) > 10) n.style.transitionDelay = delay + "ms";
  });
  observeOnce(items, (node) => node.classList.add("is-visible"));
}

/* =============================================================================
   H. ANIMATED COUNTERS
   ============================================================================= */
function animateCounter(node) {
  const target = parseFloat(node.dataset.count ?? node.textContent.replace(/[^\d.]/g, "")) || 0;
  const decimals = parseInt(node.dataset.decimals || "0", 10);
  const duration = parseInt(node.dataset.duration || "1800", 10);
  const prefix = node.dataset.prefix || "";
  const suffix = node.dataset.suffix || "";
  if (prefersReducedMotion()) { node.textContent = prefix + formatNumber(target.toFixed(decimals)) + suffix; return; }
  node.classList.add("is-counting");
  const startT = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - startT) / duration);
    const eased = 1 - Math.pow(1 - p, 3);          // easeOutCubic
    const val = target * eased;
    node.textContent = prefix + formatNumber(decimals ? val.toFixed(decimals) : Math.round(val)) + suffix;
    if (p < 1) requestAnimationFrame(step);
    else { node.textContent = prefix + formatNumber(decimals ? target.toFixed(decimals) : target) + suffix; setTimeout(() => node.classList.remove("is-counting"), 400); }
  };
  requestAnimationFrame(step);
}
function initCounters() {
  const counters = $$(".counter");
  if (!counters.length) return;
  observeOnce(counters, animateCounter, { threshold: 0.4 });
}

/* =============================================================================
   I. PARALLAX
   ============================================================================= */
function initParallax() {
  const items = $$("[data-parallax]");
  if (!items.length || prefersReducedMotion()) return;
  const update = onFrame(() => {
    const vh = window.innerHeight;
    for (const n of items) {
      const r = n.getBoundingClientRect();
      if (r.bottom < -200 || r.top > vh + 200) continue;
      const speed = parseFloat(n.dataset.parallax) || 0.18;
      const offset = (r.top + r.height / 2 - vh / 2) * -speed;
      n.style.transform = `translate3d(0, ${offset.toFixed(1)}px, 0)`;
    }
  });
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
  update();
}

/* =============================================================================
   J. BACK-TO-TOP
   ============================================================================= */
function initBackToTop() {
  const btn = $(".fab-top");
  if (!btn) return;
  const onScroll = onFrame(() => btn.classList.toggle("is-visible", window.scrollY > 520));
  window.addEventListener("scroll", onScroll, { passive: true });
  btn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" }));
  onScroll();
}

/* =============================================================================
   K. COOKIE CONSENT  (gates analytics)
   ============================================================================= */
function initCookies() {
  const banner = $(".cookie");
  const choice = store.get("consent", null);
  if (choice === "accepted") setConsent(true);
  if (!banner) return;
  if (choice === null) requestAnimationFrame(() => setTimeout(() => banner.classList.add("is-visible"), 900));
  $$("[data-consent]", banner).forEach((btn) => {
    btn.addEventListener("click", () => {
      const granted = btn.dataset.consent === "accept";
      setConsent(granted);
      banner.classList.remove("is-visible");
      if (granted) trackPageView();
      toast(granted ? "Thanks — analytics enabled." : "Preferences saved.", "success", 2600);
    });
  });
}

/* =============================================================================
   L. NEWSLETTER  → Firestore subscribers
   ============================================================================= */
function initNewsletter() {
  $$("[data-newsletter]").forEach((form) => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = $('input[type="email"], input[name="email"]', form);
      const btn = $('button[type="submit"], .btn', form);
      const email = (input?.value || "").trim();
      if (!isEmail(email)) { toast("Please enter a valid email address.", "warning"); input?.focus(); return; }
      if (!IS_CONFIGURED) { toast("Subscriptions activate once Firebase is connected.", "info"); return; }
      const original = btn?.innerHTML;
      if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>'; }
      try {
        await addDoc(col(COLLECTIONS.SUBSCRIBERS), {
          email: sanitizeText(email, 254),
          source: form.dataset.newsletter || "footer",
          locale: document.documentElement.lang || "sw",
          createdAt: serverTimestamp()
        });
        form.reset();
        toast("You're subscribed. Karibu SAM EMPIRE!", "success");
      } catch (err) {
        toast("Couldn't subscribe right now. Please try again.", "error");
        console.warn("[SAM] newsletter", err?.code || err);
      } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = original; }
      }
    });
  });
}

/* =============================================================================
   M. WISHLIST + COMPARE  (guest via LocalStorage; synced for users later)
   ============================================================================= */
const WISH_KEY = "wishlist", COMPARE_KEY = "compare", COMPARE_MAX = 4;

export function isWished(id) { return store.has(WISH_KEY, id); }
export function wishlistIds() { return store.get(WISH_KEY, []); }

export function toggleWishlist(id) {
  const arr = store.toggleInArray(WISH_KEY, id);
  const added = arr.includes(id);
  reflectWishlist();
  trackWishlist(id, added);
  document.dispatchEvent(new CustomEvent("sam:wishlist", { detail: { id, added, ids: arr } }));
  toast(added ? "Saved to your wishlist." : "Removed from wishlist.", added ? "success" : "info", 2400);
  return added;
}

export function toggleCompare(id) {
  let arr = store.get(COMPARE_KEY, []);
  if (arr.includes(id)) arr = arr.filter((x) => x !== id);
  else { if (arr.length >= COMPARE_MAX) { toast(`You can compare up to ${COMPARE_MAX} plots.`, "warning"); return false; } arr.push(id); }
  store.set(COMPARE_KEY, arr);
  reflectCompare();
  document.dispatchEvent(new CustomEvent("sam:compare", { detail: { id, ids: arr } }));
  return arr.includes(id);
}

function reflectWishlist() {
  const ids = wishlistIds();
  $$("[data-wish]").forEach((b) => {
    const on = ids.includes(b.dataset.wish);
    b.classList.toggle("is-active", on);
    b.setAttribute("aria-pressed", String(on));
  });
  $$("[data-wish-count]").forEach((c) => { c.textContent = ids.length; c.hidden = ids.length === 0; });
}
function reflectCompare() {
  const ids = store.get(COMPARE_KEY, []);
  $$("[data-compare]").forEach((b) => {
    const on = ids.includes(b.dataset.compare);
    b.classList.toggle("is-active", on);
    b.setAttribute("aria-pressed", String(on));
  });
  $$("[data-compare-count]").forEach((c) => { c.textContent = ids.length; c.hidden = ids.length === 0; });
}
function initWishCompare() {
  document.addEventListener("click", (e) => {
    const w = e.target.closest("[data-wish]");
    if (w) { e.preventDefault(); toggleWishlist(w.dataset.wish); return; }
    const c = e.target.closest("[data-compare]");
    if (c) { e.preventDefault(); toggleCompare(c.dataset.compare); }
  });
  reflectWishlist(); reflectCompare();
}

/* =============================================================================
   N. SHARE
   ============================================================================= */
function initShare() {
  document.addEventListener("click", async (e) => {
    const channel = e.target.closest("[data-share-channel]");
    if (channel) {
      const url = channel.dataset.url || location.href;
      const links = shareLinks({ url, title: channel.dataset.title || document.title, text: channel.dataset.text || "" });
      const key = channel.dataset.shareChannel;
      trackShare(key, url);
      if (key === "copy") { await copyText(url); toast("Link copied to clipboard.", "success"); }
      else if (links[key]) window.open(links[key], "_blank", "noopener,width=640,height=560");
      return;
    }
    const btn = e.target.closest("[data-share]");
    if (!btn) return;
    e.preventDefault();
    const url = btn.dataset.url || location.href;
    const title = btn.dataset.title || document.title;
    const text = btn.dataset.text || "";
    trackShare("native", url);
    const ok = await nativeShare({ title, text, url });
    if (!ok) { await copyText(url); toast("Link copied to clipboard.", "success"); }
  });
}

/* =============================================================================
   O. LIVE SETTINGS BINDING  (the site is admin-editable)
   Reads settings/public once (cached) and binds brand/contact/social values to
   any element carrying [data-bind], [data-bind-href], [data-bind-src].
   Falls back to SAM_BRAND defaults so pages look correct before Firebase is set.
   ============================================================================= */
function resolvePath(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
}
function bindSettings(settings) {
  $$("[data-bind]").forEach((n) => {
    const v = resolvePath(settings, n.dataset.bind);
    if (v != null && v !== "") n.textContent = v;
  });
  $$("[data-bind-href]").forEach((n) => {
    const v = resolvePath(settings, n.dataset.bindHref);
    if (v != null && v !== "") n.setAttribute("href", v);
  });
  $$("[data-bind-src]").forEach((n) => {
    const v = resolvePath(settings, n.dataset.bindSrc);
    if (v != null && v !== "") n.setAttribute("src", v);
  });
  // Convenience: WhatsApp / phone / email actions
  const wa = settings.brand?.whatsapp || SAM_BRAND.whatsapp;
  $$("[data-action='whatsapp']").forEach((a) => a.setAttribute("href", whatsappLink(a.dataset.message || "", wa)));
  const phone = settings.brand?.phone || SAM_BRAND.phone;
  $$("[data-action='call']").forEach((a) => a.setAttribute("href", "tel:" + phone.replace(/\s/g, "")));
  const email = settings.brand?.email || SAM_BRAND.email;
  $$("[data-action='email']").forEach((a) => a.setAttribute("href", "mailto:" + email));
  // Social links
  const socials = settings.socials || SAM_BRAND.socials;
  $$("[data-social]").forEach((a) => { const u = socials[a.dataset.social]; if (u) { a.setAttribute("href", u); a.hidden = false; } });
}

function defaultSettings() {
  return {
    brand: { name: SAM_BRAND.name, tagline: SAM_BRAND.tagline, phone: SAM_BRAND.phone, whatsapp: SAM_BRAND.whatsapp, email: SAM_BRAND.email, salesEmail: SAM_BRAND.salesEmail, supportEmail: SAM_BRAND.supportEmail, city: SAM_BRAND.city, region: SAM_BRAND.region },
    socials: { ...SAM_BRAND.socials },
    maps: { apiKey: "" }
  };
}

async function initSettings() {
  const cached = store.get("settings:public", null);
  const merged = cached ? deepMerge(defaultSettings(), cached) : defaultSettings();
  bindSettings(merged);
  window.SAM && (window.SAM.settings = merged);
  if (merged.maps?.apiKey) window.SAM_MAPS_KEY = window.SAM_MAPS_KEY || merged.maps.apiKey;

  if (!IS_CONFIGURED) return;
  try {
    const snap = await getDoc(doc(db, COLLECTIONS.SETTINGS, "public"));
    if (snap.exists()) {
      const data = deepMerge(defaultSettings(), snap.data());
      store.set("settings:public", snap.data());
      bindSettings(data);
      if (window.SAM) window.SAM.settings = data;
      if (data.maps?.apiKey) window.SAM_MAPS_KEY = data.maps.apiKey;
      document.dispatchEvent(new CustomEvent("sam:settings", { detail: data }));
    }
  } catch (err) { console.warn("[SAM] settings", err?.code || err); }
}

function deepMerge(base, over) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(over || {})) {
    out[k] = (v && typeof v === "object" && !Array.isArray(v)) ? deepMerge(base?.[k] || {}, v) : v;
  }
  return out;
}

/* =============================================================================
   P. SMALL ENHANCEMENTS
   ============================================================================= */
function initMisc() {
  // Footer year
  $$("[data-year]").forEach((n) => (n.textContent = new Date().getFullYear()));
  // Secure external links
  $$('a[target="_blank"]').forEach((a) => {
    const rel = (a.getAttribute("rel") || "").split(" ");
    if (!rel.includes("noopener")) rel.push("noopener");
    if (!rel.includes("noreferrer")) rel.push("noreferrer");
    a.setAttribute("rel", rel.filter(Boolean).join(" "));
  });
  // Lazy data-src images
  const lazy = $$("img[data-src]");
  if (lazy.length) observeOnce(lazy, (img) => {
    img.src = img.dataset.src;
    if (img.dataset.srcset) img.srcset = img.dataset.srcset;
    img.removeAttribute("data-src"); img.removeAttribute("data-srcset");
  }, { rootMargin: "200px" });
  // Smooth in-page anchors with header offset
  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute("href");
    if (id.length < 2) return;
    const target = $(id);
    if (!target) return;
    e.preventDefault();
    const top = target.getBoundingClientRect().top + window.scrollY - 92;
    window.scrollTo({ top, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  });
}

/* =============================================================================
   Q. SERVICE WORKER (PWA)
   ============================================================================= */
function initServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch((err) =>
      console.warn("[SAM] SW registration failed:", err?.message || err)
    );
  });
}

/* =============================================================================
   R. AUTH-AWARE UI  (show/hide account vs login controls)
   ============================================================================= */
function initAuthUI() {
  if (!IS_CONFIGURED) { document.body.dataset.auth = "guest"; return; }
  onAuth((user) => {
    document.body.dataset.auth = user ? "user" : "guest";
    $$("[data-auth='user']").forEach((n) => (n.hidden = !user));
    $$("[data-auth='guest']").forEach((n) => (n.hidden = !!user));
    $$("[data-user-name]").forEach((n) => (n.textContent = user?.displayName || user?.email?.split("@")[0] || "Account"));
    $$("[data-user-email]").forEach((n) => (n.textContent = user?.email || ""));
  });
}

/* =============================================================================
   S. PUBLIC API + BOOT
   ============================================================================= */
const SAM = {
  brand: SAM_BRAND,
  settings: defaultSettings(),
  toast, openModal, closeModal, confirmDialog,
  store, copyText, shareLinks, whatsappLink,
  formatMoney, formatNumber, escapeHtml, normalizePhoneTz, sanitizeText,
  toggleWishlist, isWished, wishlistIds, toggleCompare,
  consent: { get: getConsent, set: setConsent },
  refreshWishUI: () => { reflectWishlist(); reflectCompare(); }
};
window.SAM = SAM;

let _booted = false;
function boot() {
  if (_booted) return; _booted = true;
  initLoader();
  initHeader();
  initDrawer();
  initActiveNav();
  initTheme();
  initReveal();
  initCounters();
  initParallax();
  initBackToTop();
  initCookies();
  initNewsletter();
  initWishCompare();
  initShare();
  initMisc();
  initAuthUI();
  initSettings();
  initServiceWorker();
  if (getConsent()) trackPageView();
  document.dispatchEvent(new CustomEvent("sam:ready", { detail: SAM }));
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();

export default SAM;
