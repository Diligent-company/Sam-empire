/* =============================================================================
   SAM EMPIRE — admin-content.js
   Controller for the Page Content CMS (admin/content.html). Reads and writes
   the four `content` documents the public overlay engine (content.js) applies:

     content/home   { hero: {titlePre,titleEm,titleTail,sub},
                      stats: { s1..s4: {value,suffix,label} } }
     content/about  { story: {heading,p1,p2}, mission: {title,text}, vision: {title,text} }
     content/global { footerAbout }
     content/seo    { <pageKey>: {title, description} }

   Statistics are entered as one string ("500+"); the leading number becomes
   `value` and anything after it becomes `suffix`, matching the animated
   counter's data attributes. Empty fields are saved as empty strings, which
   the public overlay skips — so the built-in copy remains the fallback.
   ============================================================================= */

import { ADMIN } from "/assets/js/admin-core.js";
import { db, COLLECTIONS, serverTimestamp } from "/assets/js/firebase.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { $, escapeHtml } from "/assets/js/utils.js";

const SEO_PAGES = [
  { key: "home", label: "Mwanzo" },
  { key: "properties", label: "Viwanja" },
  { key: "locations", label: "Maeneo" },
  { key: "about", label: "Kuhusu" },
  { key: "contact", label: "Wasiliana" },
  { key: "gallery", label: "Picha" },
  { key: "videos", label: "Video" },
  { key: "blog", label: "Blogu" },
  { key: "news", label: "Habari" },
  { key: "faq", label: "Maswali" }
];

const v = (id) => $("#" + id).value.trim();
const setV = (id, val) => { const e = $("#" + id); if (e) e.value = val || ""; };

/* ---- Stat helpers: "500+" ⇄ { value: 500, suffix: "+" } ------------------ */
function parseStat(input) {
  const m = String(input || "").trim().match(/^([\d.,]+)\s*(.*)$/);
  if (!m) return null;
  const value = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(value)) return null;
  return { value, suffix: m[2] || "" };
}
function statToString(s) {
  if (!s || !Number.isFinite(Number(s.value))) return "";
  return String(s.value) + (s.suffix || "");
}

/* ---- Load ----------------------------------------------------------------- */
async function loadDoc(id) {
  try {
    const snap = await getDoc(doc(db, COLLECTIONS.CONTENT, id));
    return snap.exists() ? snap.data() : {};
  } catch (err) { console.warn("[SAM] content load:", id, err?.code || err); return {}; }
}

async function loadAll() {
  const [home, about, global, seo] = await Promise.all([loadDoc("home"), loadDoc("about"), loadDoc("global"), loadDoc("seo")]);

  const h = home.hero || {}, st = home.stats || {};
  setV("h-titlePre", h.titlePre); setV("h-titleEm", h.titleEm); setV("h-titleTail", h.titleTail); setV("h-sub", h.sub);
  ["s1", "s2", "s3", "s4"].forEach((k) => {
    setV(k + "v", statToString(st[k]));
    setV(k + "l", st[k]?.label || "");
  });

  const s = about.story || {}, m = about.mission || {}, vi = about.vision || {};
  setV("a-heading", s.heading); setV("a-p1", s.p1); setV("a-p2", s.p2);
  setV("a-mt", m.title); setV("a-mx", m.text); setV("a-vt", vi.title); setV("a-vx", vi.text);

  setV("g-footerAbout", global.footerAbout);

  SEO_PAGES.forEach((p) => {
    setV("seo-t-" + p.key, seo[p.key]?.title || "");
    setV("seo-d-" + p.key, seo[p.key]?.description || "");
  });
}

/* ---- Save ------------------------------------------------------------------*/
async function saveDoc(id, data, btnId) {
  const btn = $("#" + btnId); btn.setAttribute("aria-disabled", "true");
  try {
    await setDoc(doc(db, COLLECTIONS.CONTENT, id), { ...data, updatedAt: serverTimestamp() }, { merge: true });
    ADMIN.toast("Imehifadhiwa. Mabadiliko yanaonekana tovutini mara moja.", "success");
  } catch (err) { console.warn("[SAM] content save:", id, err?.code || err); ADMIN.toast("Imeshindikana kuhifadhi.", "error"); }
  finally { btn.removeAttribute("aria-disabled"); }
}

function saveHome() {
  const stats = {};
  let bad = false;
  ["s1", "s2", "s3", "s4"].forEach((k) => {
    const raw = v(k + "v");
    const parsed = raw ? parseStat(raw) : null;
    if (raw && !parsed) bad = true;
    stats[k] = { ...(parsed || { value: null, suffix: "" }), label: v(k + "l") };
    if (!raw) stats[k].value = null; // blank ⇒ keep site default
  });
  if (bad) { ADMIN.toast("Takwimu zianze na namba, mfano: 500+", "warning"); return; }
  saveDoc("home", {
    hero: { titlePre: v("h-titlePre"), titleEm: v("h-titleEm"), titleTail: v("h-titleTail"), sub: v("h-sub") },
    stats
  }, "save-home");
}

function saveAbout() {
  saveDoc("about", {
    story: { heading: v("a-heading"), p1: v("a-p1"), p2: v("a-p2") },
    mission: { title: v("a-mt"), text: v("a-mx") },
    vision: { title: v("a-vt"), text: v("a-vx") }
  }, "save-about");
}

function saveGlobal() {
  saveDoc("global", { footerAbout: v("g-footerAbout") }, "save-global");
}

function saveSeo() {
  const data = {};
  SEO_PAGES.forEach((p) => { data[p.key] = { title: v("seo-t-" + p.key), description: v("seo-d-" + p.key) }; });
  saveDoc("seo", data, "save-seo");
}

/* ---- Boot ------------------------------------------------------------------*/
function renderSeoRows() {
  $("#seo-rows").innerHTML = SEO_PAGES.map((p) => `
    <div class="seo-row">
      <b>${escapeHtml(p.label)}</b>
      <input class="input" id="seo-t-${p.key}" placeholder="Kichwa (title)" maxlength="70" />
      <input class="input" id="seo-d-${p.key}" placeholder="Maelezo (description)" maxlength="170" />
    </div>`).join("");
}

ADMIN.onReady(() => {
  renderSeoRows();
  $("#save-home").addEventListener("click", saveHome);
  $("#save-about").addEventListener("click", saveAbout);
  $("#save-global").addEventListener("click", saveGlobal);
  $("#save-seo").addEventListener("click", saveSeo);
  loadAll();
});
