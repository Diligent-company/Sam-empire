/* =============================================================================
   SAM EMPIRE — content.js
   Page-content overlay engine (the public half of the admin CMS).

   Admins edit page copy in /admin/content.html, which writes documents to the
   `content` collection (world-readable, admin-write per firestore.rules):

     content/home    → homepage hero + statistics
     content/about   → about-page story / mission / vision
     content/global  → site-wide snippets (footer blurb)
     content/seo     → per-page <title> + meta description overrides

   Public pages opt elements in with attributes; anything the admin leaves
   blank keeps the HTML default, so the site can never render "empty":

     data-content="home:hero.sub"          → textContent from doc `home`, path `hero.sub`
     data-content-count="home:stats.s1"    → animated counter; path resolves to
                                             { value, suffix } and updates
                                             dataset.count / dataset.suffix

   This module is imported by script.js (side-effect), so it runs on every
   page with no per-page script tags. Cached copies (localStorage) are applied
   synchronously at module evaluation — before script.js attaches its counter
   observers — then a live Firestore fetch re-applies and refreshes the cache.
   ============================================================================= */

import { $$, store, formatNumber } from "./utils.js";
import { db, COLLECTIONS, IS_CONFIGURED } from "./firebase.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/** Which content docs each page needs (beyond global/seo). About also pulls
    `home` because its statistics band mirrors the homepage numbers. */
const PAGE_DOCS = { home: ["home"], about: ["about", "home"] };

/** SEO keys the admin can override, matched against body[data-page|data-collection]. */
const SEO_KEYS = ["home", "properties", "locations", "about", "contact", "gallery", "videos", "blog", "news", "faq"];

const DOCS = {}; // docId → data (merged cache/live)

function pageKey() {
  return document.body.dataset.page || document.body.dataset.collection || "";
}

function getPath(obj, path) {
  return path.split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), obj);
}

/* ---- Appliers ------------------------------------------------------------ */
function applyText() {
  $$("[data-content]").forEach((node) => {
    const [docId, path] = String(node.dataset.content || "").split(":");
    if (!docId || !path || !DOCS[docId]) return;
    const v = getPath(DOCS[docId], path);
    if (typeof v === "string" && v.trim()) node.textContent = v;
  });
}

function applyCounters() {
  $$("[data-content-count]").forEach((node) => {
    const [docId, path] = String(node.dataset.contentCount || "").split(":");
    if (!docId || !path || !DOCS[docId]) return;
    const v = getPath(DOCS[docId], path);
    if (!v || typeof v !== "object" || v.value == null || v.value === "") return;
    const value = Number(v.value);
    if (!Number.isFinite(value)) return;
    node.dataset.count = String(value);
    if (typeof v.suffix === "string") node.dataset.suffix = v.suffix;
    // If the animation already ran (text no longer the initial "0"), correct
    // the displayed value in place; future animations use the new dataset.
    if (node.textContent.trim() !== "0") {
      node.textContent = (node.dataset.prefix || "") + formatNumber(value) + (node.dataset.suffix || "");
    }
  });
}

function applySeo() {
  const seo = DOCS.seo;
  const key = pageKey();
  if (!seo || !key || !SEO_KEYS.includes(key)) return;
  const entry = seo[key];
  if (!entry || typeof entry !== "object") return;
  if (typeof entry.title === "string" && entry.title.trim()) {
    document.title = entry.title;
    const og = document.querySelector('meta[property="og:title"]');
    if (og) og.setAttribute("content", entry.title);
  }
  if (typeof entry.description === "string" && entry.description.trim()) {
    const md = document.querySelector('meta[name="description"]');
    if (md) md.setAttribute("content", entry.description);
    const ogd = document.querySelector('meta[property="og:description"]');
    if (ogd) ogd.setAttribute("content", entry.description);
  }
}

function applyAll() {
  applyText();
  applyCounters();
  applySeo();
}

/* ---- Load: cache first (synchronous), then live -------------------------- */
function docIdsForPage() {
  const ids = ["global", "seo"];
  const pd = PAGE_DOCS[pageKey()];
  if (pd) ids.push(...pd);
  return ids;
}

function applyFromCache() {
  for (const id of docIdsForPage()) {
    const cached = store.get("content:" + id, null);
    if (cached && typeof cached === "object") DOCS[id] = cached;
  }
  applyAll();
}

async function refreshLive() {
  if (!IS_CONFIGURED) return;
  let changed = false;
  await Promise.all(docIdsForPage().map(async (id) => {
    try {
      const snap = await getDoc(doc(db, COLLECTIONS.CONTENT, id));
      if (snap.exists()) {
        DOCS[id] = snap.data();
        store.set("content:" + id, snap.data());
        changed = true;
      }
    } catch (err) { console.warn("[SAM] content:", id, err?.code || err); }
  }));
  if (changed) applyAll();
}

applyFromCache();
refreshLive();
