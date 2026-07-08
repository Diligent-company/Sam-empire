/* =============================================================================
   SAM EMPIRE — articles.js
   Shared controller for blog.html and news.html. The page declares its source
   via <body data-collection="blog|news">. firebase.json rewrites /blog/** and
   /news/** to these shells, so this file renders BOTH:
     • LIST     (/blog or /news)            → grid of article cards
     • ARTICLE  (/blog/{slug} or /news/...) → full post + share + related
   Published-only reads (per firestore.rules), with a curated fallback.
   ============================================================================= */

import {
  $, $$, escapeHtml, stripTags, truncate, observeOnce, shareLinks, copyText, nativeShare
} from "/assets/js/utils.js";
import { plotPlaceholder } from "/assets/js/catalog.js";
import { db, COLLECTIONS, IS_CONFIGURED } from "/assets/js/firebase.js";
import { collection, query, where, orderBy, limit, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { trackShare } from "/assets/js/analytics.js";

const COL_KEY = (document.body.dataset.collection || "blog").toLowerCase();
const COL_NAME = COL_KEY === "news" ? COLLECTIONS.NEWS : COLLECTIONS.BLOG;
const BASE = "/" + COL_KEY;
const LABEL = COL_KEY === "news" ? "Habari" : "Blogu";

const FALLBACK = {
  blog: [
    { slug: "kigamboni-uwekezaji-2026", title: "Kwa Nini Kigamboni Ni Eneo Bora la Uwekezaji 2026", tag: "Uwekezaji", date: "2026-06-10",
      excerpt: "Ujenzi wa Daraja la Nyerere na miundombinu mipya umefanya thamani ya ardhi Kigamboni kupanda kwa kasi.",
      content: "<p>Kigamboni imebadilika kwa kasi katika miaka ya hivi karibuni. Ujenzi wa Daraja la Julius Nyerere umepunguza muda wa safari kwenda katikati ya jiji kutoka saa moja hadi dakika chache, jambo lililochochea ukuaji wa thamani ya ardhi.</p><h3>Sababu kuu za kuwekeza sasa</h3><p>Kwanza, miundombinu ya barabara inaendelea kuboreshwa. Pili, mahitaji ya makazi yanaongezeka huku watu wengi wakihamia eneo hili tulivu lenye ukaribu na bahari. Tatu, bei za viwanja bado ni nafuu ikilinganishwa na maeneo mengine ya Dar es Salaam.</p><p>Kuwekeza katika kiwanja chenye hati safi leo ni hatua ya busara kwa mustakabali wako wa kifedha.</p>" },
    { slug: "kuhakiki-hati-kiwanja", title: "Hatua 5 za Kuhakiki Hati ya Kiwanja Kabla ya Kununua", tag: "Ushauri", date: "2026-05-22",
      excerpt: "Usinunue kiwanja bila kuhakiki hati. Hapa kuna hatua muhimu za kukulinda dhidi ya udanganyifu.",
      content: "<p>Udanganyifu wa ardhi ni changamoto halisi. Kabla ya kununua kiwanja chochote, fuata hatua hizi:</p><h3>1. Thibitisha Hati Miliki</h3><p>Hakikisha kiwanja kina Title Deed halali iliyosajiliwa. Kagua jina la mmiliki na namba ya hati.</p><h3>2. Tembelea Eneo</h3><p>Nenda eneo halisi, ona mipaka (beacons) na thibitisha viwianishi vya GPS.</p><h3>3. Uliza Ofisi ya Ardhi</h3><p>Fanya utafutaji (search) katika ofisi ya Ardhi kuthibitisha umiliki na kama hakuna mzigo (encumbrance).</p><h3>4. Kagua Mipaka na Majirani</h3><p>Hakikisha hakuna mgogoro wa mipaka na majirani.</p><h3>5. Tumia Wataalamu</h3><p>Tumia kampuni inayoaminika kama SAM EMPIRE inayotoa uwazi kamili.</p>" },
    { slug: "malipo-kwa-awamu", title: "Malipo kwa Awamu: Jinsi ya Kumiliki Kiwanja Bila Msongo", tag: "Mwongozo", date: "2026-04-30",
      excerpt: "Mpango wa malipo kwa awamu unakuwezesha kumiliki ardhi hata kama huna fedha zote kwa mara moja.",
      content: "<p>Si kila mtu ana uwezo wa kulipa bei nzima ya kiwanja kwa mara moja. Ndiyo maana tunatoa mpango wa malipo kwa awamu.</p><h3>Jinsi unavyofanya kazi</h3><p>Unaanza kwa malipo ya awali (down payment), kisha unalipa kiasi kilichobaki kwa awamu kwa muda mliokubaliana — mara nyingi miezi 6 hadi 12.</p><p>Faida ni kwamba unaanza mchakato wa kumiliki mara moja, huku ukilipa taratibu kulingana na uwezo wako. Wasiliana nasi tukueleze mpango unaokufaa.</p>" }
  ],
  news: [
    { slug: "viwanja-vipya-kimbiji", title: "Viwanja Vipya Vyafunguliwa Kimbiji", tag: "Tangazo", date: "2026-06-18",
      excerpt: "Tumefungua awamu mpya ya viwanja vilivyopimwa Kimbiji, karibu na pwani.",
      content: "<p>SAM EMPIRE inafurahi kutangaza kufunguliwa kwa awamu mpya ya viwanja Kimbiji. Viwanja hivi vimepimwa rasmi, vina hati safi, na vipo katika eneo lenye mvuto wa kipekee karibu na bahari.</p><p>Hii ni fursa adimu kwa wawekezaji na familia zinazotafuta makazi ya kifahari. Wasiliana nasi mapema kupata nafasi.</p>" },
    { slug: "ofa-maalum-msimu", title: "Ofa Maalum ya Msimu kwa Viwanja Vilivyochaguliwa", tag: "Ofa", date: "2026-05-30",
      excerpt: "Pata punguzo maalum kwa viwanja vilivyochaguliwa kwa muda mfupi.",
      content: "<p>Kwa muda mfupi, tunatoa ofa maalum kwa viwanja vilivyochaguliwa katika maeneo ya Kibada, Mwasonga na Dege. Bei za punguzo zinapatikana kwa wanaonunua ndani ya kipindi cha ofa.</p><p>Tembelea ukurasa wa viwanja au wasiliana nasi kujua viwanja vinavyohusika na ofa hii.</p>" },
    { slug: "ushiriki-maonyesho", title: "SAM EMPIRE Yashiriki Maonyesho ya Ardhi Dar", tag: "Tukio", date: "2026-04-15",
      excerpt: "Tulishiriki maonyesho ya ardhi na nyumba, tukikutana na wateja wengi.",
      content: "<p>SAM EMPIRE ilishiriki maonyesho ya ardhi na nyumba jijini Dar es Salaam, ambapo tulipata fursa ya kukutana na wateja na kuelezea fursa za uwekezaji Kigamboni.</p><p>Asante kwa wote waliotutembelea. Tunaendelea kuwahudumia kwa uaminifu na ubora.</p>" }
  ]
};

let ARTICLES = [];

/* ---- Data --------------------------------------------------------------- */
function normalize(id, d) {
  const cover = d.cover || d.image || (Array.isArray(d.images) && (d.images[0]?.url || d.images[0])) || null;
  const content = d.content || d.body || "";
  return {
    id,
    slug: d.slug || id,
    title: d.title || "Makala",
    tag: d.category || d.tag || LABEL,
    date: d.createdAt?.toMillis ? d.createdAt.toMillis() : (d.date ? new Date(d.date).getTime() : 0),
    cover,
    content,
    excerpt: d.excerpt || d.summary || truncate(stripTags(content), 150)
  };
}

function fallbackNormalized() {
  return (FALLBACK[COL_KEY] || []).map((a, i) => normalize(a.slug, { ...a, createdAt: null, date: a.date }));
}

async function loadAll() {
  if (!IS_CONFIGURED) return fallbackNormalized();
  try {
    const snap = await getDocs(query(
      collection(db, COL_NAME),
      where("status", "==", "published"),
      orderBy("createdAt", "desc"),
      limit(50)
    ));
    const rows = snap.docs.map((d) => normalize(d.id, d.data()));
    return rows.length ? rows : fallbackNormalized();
  } catch (err) {
    console.warn(`[SAM] ${COL_KEY}:`, err?.code || err);
    return fallbackNormalized();
  }
}

function fmtDate(ms) {
  if (!ms) return "";
  try { return new Date(ms).toLocaleDateString("sw-TZ", { day: "numeric", month: "long", year: "numeric" }); }
  catch { return ""; }
}

/* ---- Cards / reveal ----------------------------------------------------- */
function articleCardHTML(a) {
  const img = a.cover || plotPlaceholder(a.tag || LABEL, "SAM EMPIRE");
  return `
  <article class="card post-card" data-reveal>
    <a class="post-card__media" href="${BASE}.html?slug=${encodeURIComponent(a.slug)}" aria-label="${escapeHtml(a.title)}">
      <img src="${img}" alt="${escapeHtml(a.title)}" loading="lazy" />
      <span class="post-card__tag badge badge-glass">${escapeHtml(a.tag)}</span>
    </a>
    <div class="card-body flex flex-col gap-3">
      <span class="post-card__date">${escapeHtml(fmtDate(a.date))}</span>
      <h3 class="h5"><a href="${BASE}.html?slug=${encodeURIComponent(a.slug)}">${escapeHtml(a.title)}</a></h3>
      <p class="text-sm text-muted">${escapeHtml(a.excerpt)}</p>
      <a class="text-gold text-sm" href="${BASE}.html?slug=${encodeURIComponent(a.slug)}" style="font-weight:700">Soma zaidi &rarr;</a>
    </div>
  </article>`;
}

function revealIn(container) {
  const nodes = $$("[data-reveal]", container);
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) { nodes.forEach((n) => n.classList.add("is-visible")); return; }
  observeOnce(nodes, (n) => n.classList.add("is-visible"), { threshold: 0.08 });
}

/* ---- List view ---------------------------------------------------------- */
function showList() {
  $("#c-h1").textContent = COL_KEY === "news" ? "Habari na Matangazo" : "Blogu ya SAM EMPIRE";
  $("#c-sub").textContent = COL_KEY === "news"
    ? "Habari mpya, matangazo na matukio kutoka SAM EMPIRE."
    : "Makala, ushauri na miongozo kuhusu ununuzi wa viwanja na uwekezaji Kigamboni.";
  $("#c-crumbs").innerHTML = `<a href="/">Nyumbani</a><span class="is-current">${LABEL}</span>`;

  const grid = $("#articles-grid");
  if (!ARTICLES.length) {
    $("#list-view").hidden = false;
    grid.innerHTML = `<div class="notice" style="grid-column:1/-1;border:1px dashed var(--border-strong);border-radius:var(--r-lg);padding:var(--s-8);text-align:center;color:var(--text-muted)">Hakuna makala kwa sasa. Rudi hivi karibuni.</div>`;
    return;
  }
  grid.innerHTML = ARTICLES.map(articleCardHTML).join("");
  $("#list-view").hidden = false;
  revealIn(grid);
}

/* ---- Article view ------------------------------------------------------- */
function showArticle(slug) {
  const a = ARTICLES.find((x) => x.slug === slug || x.id === slug);
  if (!a) { $("#content-missing").hidden = false; return; }

  document.title = `${a.title} — SAM EMPIRE`;
  const dsc = $('meta[name="description"]'); if (dsc) dsc.setAttribute("content", a.excerpt);
  const ogt = $("#og-title"); if (ogt) ogt.setAttribute("content", `${a.title} — SAM EMPIRE`);
  const ogd = $("#og-desc"); if (ogd) ogd.setAttribute("content", a.excerpt);
  if (a.cover) { const ogi = $('meta[property="og:image"]'); if (ogi) ogi.setAttribute("content", a.cover); }

  $("#c-h1").textContent = a.title;
  $("#c-sub").textContent = `${a.tag} · ${fmtDate(a.date)}`;
  $("#c-crumbs").innerHTML = `<a href="/">Nyumbani</a><a href="${BASE}.html">${LABEL}</a><span class="is-current">${escapeHtml(truncate(a.title, 40))}</span>`;

  const cover = a.cover || plotPlaceholder(a.tag || LABEL, "SAM EMPIRE");
  const related = ARTICLES.filter((x) => x.slug !== a.slug).slice(0, 3);

  $("#article-root").innerHTML = `
    <article class="container container-narrow section">
      <img src="${cover}" alt="${escapeHtml(a.title)}" style="width:100%;aspect-ratio:16/8;object-fit:cover;border-radius:var(--r-xl);border:1px solid var(--border)" />
      <div class="article-body mt-8">${a.content || `<p>${escapeHtml(a.excerpt)}</p>`}</div>

      <div class="divider"></div>
      <div class="flex-between wrap gap-3">
        <a class="btn btn-ghost btn-sm" href="${BASE}.html">&larr; ${escapeHtml(LABEL)} zote</a>
        <div class="flex gap-2" id="article-share">
          <button class="icon-action" data-ch="whatsapp" aria-label="WhatsApp" title="WhatsApp"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2a10 10 0 00-8.6 15l-1.3 4.7 4.8-1.3A10 10 0 1012 2z"/></svg></button>
          <button class="icon-action" data-ch="facebook" aria-label="Facebook" title="Facebook"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M14 9h3V6h-3c-2.2 0-4 1.8-4 4v2H8v3h2v7h3v-7h2.5l.5-3H13v-2c0-.6.4-1 1-1z"/></svg></button>
          <button class="icon-action" data-ch="x" aria-label="X" title="X"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M17 3h3l-7 8 8 10h-6l-5-6-5 6H2l8-9L2 3h6l4 5 5-5z"/></svg></button>
          <button class="icon-action" id="article-copy" aria-label="Nakili kiungo" title="Nakili"><svg viewBox="0 0 24 24" width="18" height="18" fill="none"><rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M5 15V5a2 2 0 012-2h10" stroke="currentColor" stroke-width="1.8"/></svg></button>
        </div>
      </div>
    </article>

    ${related.length ? `
    <section class="section bg-soft" style="background:var(--surface-3)">
      <div class="container container-wide">
        <h2 class="h3 mb-6">Soma Pia</h2>
        <div class="grid grid-3" id="related-articles">${related.map(articleCardHTML).join("")}</div>
      </div>
    </section>` : ""}`;

  $("#article-view").hidden = false;
  wireShare(a);
  revealIn($("#article-root"));
}

function wireShare(a) {
  const url = location.href;
  const links = shareLinks({ url, title: `${a.title} — SAM EMPIRE`, text: a.excerpt });
  $$("#article-share [data-ch]").forEach((b) => b.addEventListener("click", () => {
    const ch = b.dataset.ch; if (links[ch]) { window.open(links[ch], "_blank", "noopener"); trackShare(ch, url); }
  }));
  $("#article-copy")?.addEventListener("click", async () => {
    const ok = await copyText(url);
    window.SAM && window.SAM.toast && window.SAM.toast(ok ? "Kiungo kimenakiliwa!" : "Imeshindikana.", ok ? "success" : "error");
    if (ok) trackShare("copy", url);
  });
}

/* ---- Boot --------------------------------------------------------------- */
function parseSlug() {
  const m = location.pathname.match(/\/(?:blog|news)\/([^/?#]+)/);
  if (m && m[1]) return decodeURIComponent(m[1]);
  const sp = new URLSearchParams(location.search);
  return sp.get("slug") || null;
}

async function boot() {
  ARTICLES = await loadAll();
  const slug = parseSlug();
  if (slug) showArticle(slug);
  else showList();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();
