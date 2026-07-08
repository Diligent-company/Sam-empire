/* =============================================================================
   SAM EMPIRE — utils.js
   Pure, side-effect-free helpers shared by every page and module.
   Importing this file NEVER touches the DOM or network on its own, so it is
   safe to pull into firebase.js, script.js, storage.js, analytics.js and admin.js
   without causing duplicate initialisation.
   ============================================================================= */

/* -----------------------------------------------------------------------------
   0. BRAND DEFAULTS
   These are fallbacks only. At runtime the Settings collection (managed from the
   Admin Dashboard) overrides them via SAM.applySettings(). Editing them here is
   never required for normal operation.
   -------------------------------------------------------------------------- */
export const SAM_BRAND = Object.freeze({
  name:        "SAM EMPIRE",
  tagline:     "Muuzaji wa Viwanja Kigamboni",
  phone:       "+255689621263",
  phonePlain:  "255689621263",
  whatsapp:    "255689621263",
  email:       "info@samempire.co.tz",
  salesEmail:  "sales@samempire.co.tz",
  supportEmail:"support@samempire.co.tz",
  city:        "Kigamboni",
  region:      "Dar es Salaam",
  country:     "Tanzania",
  currency:    "TZS",
  currencySymbol: "TSh",
  locale:      "sw-TZ",
  mapCenter:   { lat: -6.8500, lng: 39.3200 }, // Kigamboni
  socials: {
    facebook:  "https://facebook.com/",
    instagram: "https://instagram.com/",
    tiktok:    "https://tiktok.com/",
    youtube:   "https://youtube.com/",
    x:         "https://x.com/",
    linkedin:  "https://linkedin.com/",
    telegram:  "https://t.me/"
  }
});

/* -----------------------------------------------------------------------------
   1. DOM SHORTHANDS
   -------------------------------------------------------------------------- */
export const $  = (sel, ctx = document) => ctx.querySelector(sel);
export const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

/** Create an element with attributes/props and children in one call. */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k === "text") node.textContent = v;
    else if (k === "dataset") Object.assign(node.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in node && k !== "list") { try { node[k] = v; } catch { node.setAttribute(k, v); } }
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

/* -----------------------------------------------------------------------------
   2. SANITISATION & ESCAPING  (security: never inject raw user content)
   -------------------------------------------------------------------------- */
const ESC_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" };

/** Escape a string for safe insertion as HTML text/attribute. */
export function escapeHtml(str) {
  return String(str == null ? "" : str).replace(/[&<>"'`]/g, (ch) => ESC_MAP[ch]);
}

/** Strip all tags and collapse whitespace — for plain-text contexts. */
export function stripTags(str) {
  return String(str == null ? "" : str).replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

/** Sanitise free-text input before persisting: trims, removes control chars,
    caps length. Does NOT allow HTML. */
export function sanitizeText(value, maxLen = 5000) {
  let s = String(value == null ? "" : value);
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  s = s.replace(/<\s*script/gi, "&lt;script");
  s = s.trim();
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

/** Whitelist a value against allowed options, else return fallback. */
export function oneOf(value, allowed, fallback = allowed[0]) {
  return allowed.includes(value) ? value : fallback;
}

/* -----------------------------------------------------------------------------
   3. VALIDATION
   -------------------------------------------------------------------------- */
export const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || "").trim());

/** Accepts Tanzanian formats: +255XXXXXXXXX, 0XXXXXXXXX, 255XXXXXXXXX. */
export function isPhoneTz(v) {
  const d = String(v || "").replace(/[^\d+]/g, "");
  return /^(\+?255|0)\d{9}$/.test(d);
}

/** Normalise any Tanzanian phone to international 255XXXXXXXXX (no +). */
export function normalizePhoneTz(v) {
  let d = String(v || "").replace(/[^\d]/g, "");
  if (d.startsWith("0")) d = "255" + d.slice(1);
  if (d.startsWith("255")) return d;
  if (d.length === 9) return "255" + d;
  return d;
}

export const isUrl = (v) => { try { new URL(v); return true; } catch { return false; } };

/* -----------------------------------------------------------------------------
   4. FORMATTING
   -------------------------------------------------------------------------- */
const _numFmt = new Intl.NumberFormat("en-US");

/** Group a number: 25000000 → "25,000,000". */
export function formatNumber(n) {
  const v = Number(n);
  return Number.isFinite(v) ? _numFmt.format(v) : "0";
}

/** Compact currency: 25_000_000 → "TSh 25M". Full: "TSh 25,000,000". */
export function formatMoney(amount, { currency = SAM_BRAND.currencySymbol, compact = false, blankZero = false } = {}) {
  const v = Number(amount);
  if (!Number.isFinite(v) || (blankZero && v === 0)) return blankZero ? "" : `${currency} 0`;
  if (compact) {
    const abs = Math.abs(v);
    if (abs >= 1e9) return `${currency} ${trimZero(v / 1e9)}B`;
    if (abs >= 1e6) return `${currency} ${trimZero(v / 1e6)}M`;
    if (abs >= 1e3) return `${currency} ${trimZero(v / 1e3)}K`;
  }
  return `${currency} ${_numFmt.format(Math.round(v))}`;
}
function trimZero(n) { return (Math.round(n * 10) / 10).toString().replace(/\.0$/, ""); }

/** Pluralise a count with a unit. (3, "plot") → "3 plots". */
export function plural(count, unit, units) {
  const n = Number(count) || 0;
  return `${formatNumber(n)} ${n === 1 ? unit : (units || unit + "s")}`;
}

/** Convert Firestore Timestamp | Date | ISO string | millis to a Date. */
export function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "object" && typeof value.toDate === "function") return value.toDate();
  if (typeof value === "object" && typeof value.seconds === "number") return new Date(value.seconds * 1000);
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

export function formatDate(value, opts = { day: "numeric", month: "short", year: "numeric" }) {
  const d = toDate(value);
  return d ? new Intl.DateTimeFormat("en-GB", opts).format(d) : "";
}

export function formatDateTime(value) {
  return formatDate(value, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** "3 hours ago" / "in 2 days". */
export function relativeTime(value) {
  const d = toDate(value);
  if (!d) return "";
  const diff = d.getTime() - Date.now();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const units = [["year", 31536e6], ["month", 2592e6], ["week", 6048e5], ["day", 864e5], ["hour", 36e5], ["minute", 6e4], ["second", 1e3]];
  for (const [unit, ms] of units) {
    if (abs >= ms || unit === "second") return rtf.format(Math.round(diff / ms), unit);
  }
  return "";
}

/* -----------------------------------------------------------------------------
   5. STRINGS / IDS
   -------------------------------------------------------------------------- */
export function slugify(str) {
  return String(str || "")
    .toLowerCase().trim()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function truncate(str, n = 140) {
  const s = String(str || "");
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}

export function titleCase(str) {
  return String(str || "").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Cryptographically-random id (falls back to Math.random). */
export function uid(prefix = "") {
  let core;
  if (typeof crypto !== "undefined" && crypto.randomUUID) core = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  else core = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  return prefix ? `${prefix}_${core}` : core;
}

/** Human property code, e.g. KGB-7F3A. */
export function propertyCode(seedSlug = "KGB") {
  const base = (seedSlug || "KGB").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3) || "KGB";
  const tail = uid().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
  return `${base}-${tail}`;
}

/* -----------------------------------------------------------------------------
   6. FUNCTION HELPERS
   -------------------------------------------------------------------------- */
export function debounce(fn, wait = 250) {
  let t;
  return function (...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), wait); };
}

export function throttle(fn, limit = 100) {
  let last = 0, queued;
  return function (...args) {
    const now = Date.now();
    if (now - last >= limit) { last = now; fn.apply(this, args); }
    else { clearTimeout(queued); queued = setTimeout(() => { last = Date.now(); fn.apply(this, args); }, limit - (now - last)); }
  };
}

/** rAF-based scheduler that coalesces calls within a frame. */
export function onFrame(fn) {
  let ticking = false;
  return function (...args) {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; fn.apply(this, args); });
  };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const clamp = (n, min, max) => Math.min(Math.max(Number(n) || 0, min), max);

/* -----------------------------------------------------------------------------
   7. URL / QUERY PARAMS
   -------------------------------------------------------------------------- */
export function getParam(key, fallback = null) {
  return new URLSearchParams(location.search).get(key) ?? fallback;
}
export function getParams() {
  return Object.fromEntries(new URLSearchParams(location.search).entries());
}
/** Update the URL query without reloading. Pass null/"" to remove a key. */
export function setParams(obj, { replace = true } = {}) {
  const p = new URLSearchParams(location.search);
  for (const [k, v] of Object.entries(obj)) {
    if (v == null || v === "") p.delete(k); else p.set(k, v);
  }
  const qs = p.toString();
  const url = location.pathname + (qs ? "?" + qs : "") + location.hash;
  history[replace ? "replaceState" : "pushState"]({}, "", url);
}

/* -----------------------------------------------------------------------------
   8. LOCAL STORAGE (namespaced, JSON-safe, quota-tolerant)
   The "LocalStorage Backup" layer the rest of the app relies on for offline
   resilience and guest wishlists/recently-viewed.
   -------------------------------------------------------------------------- */
const NS = "sam:";
export const store = {
  get(key, fallback = null) {
    try { const raw = localStorage.getItem(NS + key); return raw == null ? fallback : JSON.parse(raw); }
    catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(NS + key, JSON.stringify(value)); return true; }
    catch (e) { console.warn("[SAM] storage quota:", e?.name); return false; }
  },
  remove(key) { try { localStorage.removeItem(NS + key); } catch {} },
  /** Toggle membership of an id within an array key. Returns the new array. */
  toggleInArray(key, id, max = 500) {
    const arr = this.get(key, []);
    const i = arr.indexOf(id);
    if (i >= 0) arr.splice(i, 1);
    else { arr.unshift(id); if (arr.length > max) arr.length = max; }
    this.set(key, arr);
    return arr;
  },
  has(key, id) { return (this.get(key, []) || []).includes(id); },
  /** Push an item to the front of a capped list (recently viewed, etc.). */
  pushUnique(key, id, max = 30) {
    let arr = this.get(key, []).filter((x) => x !== id);
    arr.unshift(id);
    if (arr.length > max) arr = arr.slice(0, max);
    this.set(key, arr);
    return arr;
  }
};

/* -----------------------------------------------------------------------------
   9. CLIPBOARD / SHARE / QR
   -------------------------------------------------------------------------- */
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
  } catch {}
  try {
    const ta = el("textarea", { value: text, style: "position:fixed;opacity:0;left:-9999px" });
    document.body.append(ta); ta.select(); document.execCommand("copy"); ta.remove(); return true;
  } catch { return false; }
}

/** Native share sheet where available; resolves false if it falls through. */
export async function nativeShare({ title, text, url }) {
  if (navigator.share) { try { await navigator.share({ title, text, url }); return true; } catch { return false; } }
  return false;
}

/** Build ready-to-use social share URLs for a given page. */
export function shareLinks({ url, title = "", text = "" }) {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  const txt = encodeURIComponent(`${title}${text ? " — " + text : ""} ${url}`);
  return {
    whatsapp:  `https://wa.me/?text=${txt}`,
    facebook:  `https://www.facebook.com/sharer/sharer.php?u=${u}`,
    x:         `https://twitter.com/intent/tweet?url=${u}&text=${t}`,
    telegram:  `https://t.me/share/url?url=${u}&text=${t}`,
    linkedin:  `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
    email:     `mailto:?subject=${t}&body=${txt}`,
    copy:      url
  };
}

/** WhatsApp deep link to the company, with an optional pre-filled message. */
export function whatsappLink(message = "", number = SAM_BRAND.whatsapp) {
  return `https://wa.me/${number}${message ? "?text=" + encodeURIComponent(message) : ""}`;
}

/** QR code image URL (rendered by a public QR service; no key required). */
export function qrUrl(data, size = 240) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=8&data=${encodeURIComponent(data)}`;
}

/* -----------------------------------------------------------------------------
   10. OBSERVERS / MOTION
   -------------------------------------------------------------------------- */
export const prefersReducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Observe elements; fire `onEnter(el)` once when each scrolls into view. */
export function observeOnce(elements, onEnter, options = { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }) {
  const list = [].concat(elements).filter(Boolean);
  if (!("IntersectionObserver" in window)) { list.forEach(onEnter); return () => {}; }
  const io = new IntersectionObserver((entries, obs) => {
    for (const entry of entries) {
      if (entry.isIntersecting) { onEnter(entry.target); obs.unobserve(entry.target); }
    }
  }, options);
  list.forEach((n) => io.observe(n));
  return () => io.disconnect();
}

/* -----------------------------------------------------------------------------
   11. ASYNC / ERROR HELPERS
   -------------------------------------------------------------------------- */
/** Wrap a promise → [result, error] so callers avoid nested try/catch. */
export async function to(promise) {
  try { return [await promise, null]; }
  catch (err) { return [null, err]; }
}

/** Map a Firebase error code to a friendly, end-user message. */
export function friendlyError(err) {
  const code = err?.code || "";
  const map = {
    "auth/invalid-email": "That email address doesn't look right.",
    "auth/user-not-found": "No account matches those details.",
    "auth/wrong-password": "Incorrect email or password.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/email-already-in-use": "An account with this email already exists.",
    "auth/weak-password": "Choose a password with at least 6 characters.",
    "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
    "auth/network-request-failed": "Network problem. Check your connection and retry.",
    "permission-denied": "You don't have permission to do that.",
    "unavailable": "Service is temporarily unavailable. Working offline.",
    "not-found": "That item could no longer be found."
  };
  return map[code] || err?.message || "Something went wrong. Please try again.";
}

/* -----------------------------------------------------------------------------
   12. MISC
   -------------------------------------------------------------------------- */
/** Stable deep clone for plain data. */
export function clone(obj) {
  try { return structuredClone(obj); } catch { return JSON.parse(JSON.stringify(obj)); }
}

/** Read a File as a data URL. */
export function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error("File read failed"));
    r.readAsDataURL(file);
  });
}

/** Convert bytes → "2.4 MB". */
export function formatBytes(bytes) {
  const b = Number(bytes) || 0;
  if (b < 1024) return b + " B";
  const units = ["KB", "MB", "GB", "TB"];
  let i = -1, v = b;
  do { v /= 1024; i++; } while (v >= 1024 && i < units.length - 1);
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`;
}

/** Average a list of numeric ratings → one decimal. */
export function average(list) {
  const nums = (list || []).map(Number).filter(Number.isFinite);
  if (!nums.length) return 0;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}
