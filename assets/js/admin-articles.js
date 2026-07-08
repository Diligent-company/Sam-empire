/* =============================================================================
   SAM EMPIRE — admin-articles.js
   Shared CRUD controller for admin/blog.html and admin/news.html, selected via
   <body data-collection="blog|news">. Publishing here (status: 'published')
   makes the article live on the public /blog or /news pages immediately, per
   firestore.rules (public reads require status == 'published').
   ============================================================================= */

import { ADMIN } from "/assets/js/admin-core.js";
import { db, COLLECTIONS, col, serverTimestamp } from "/assets/js/firebase.js";
import { getDocs, query, orderBy, limit, doc, addDoc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { uploadImage, deleteFile } from "/assets/js/storage.js";
import { $, escapeHtml, slugify, formatDate } from "/assets/js/utils.js";

const COL_KEY = (document.body.dataset.collection || "blog").toLowerCase();
const COL_NAME = COL_KEY === "news" ? COLLECTIONS.NEWS : COLLECTIONS.BLOG;

let ALL = [];
let editingId = null;
let cover = null; // { url, path }

async function load() {
  try {
    const snap = await getDocs(query(col(COL_NAME), orderBy("createdAt", "desc"), limit(300)));
    ALL = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) { console.warn(`[SAM] ${COL_KEY} list:`, err?.code || err); ALL = []; }
  render();
}

function pill(s) { return s === "published" ? `<span class="pill pill-success">Imechapishwa</span>` : `<span class="pill pill-muted">Rasimu</span>`; }

function render() {
  const q = ($("#art-search").value || "").toLowerCase().trim();
  const st = $("#art-status").value;
  const rows = ALL.filter((a) => {
    if (st && (a.status || "draft") !== st) return false;
    if (q && !`${a.title || ""} ${a.category || ""}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const tb = $("#art-tbody");
  if (!rows.length) { tb.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding:var(--s-8)">Hakuna makala bado.</td></tr>`; return; }
  tb.innerHTML = rows.map((a) => `
    <tr>
      <td>${a.cover ? `<img class="atable__thumb" src="${a.cover}" alt="" loading="lazy" />` : `<div class="atable__thumb" style="background:var(--surface-3)"></div>`}</td>
      <td class="fw-bold">${escapeHtml(a.title || "—")}</td>
      <td class="text-sm text-muted">${escapeHtml(a.category || "—")}</td>
      <td>${pill(a.status)}</td>
      <td class="text-xs text-faint">${escapeHtml(formatDate(a.createdAt) || "—")}</td>
      <td><div class="atable__actions">
        <button class="abtn-icon" data-edit="${a.id}" title="Hariri"><svg viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M4 20h4L20 8l-4-4L4 16v4z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg></button>
        <button class="abtn-icon" data-pub="${a.id}" title="Chapisha / Rasimu"><svg viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M12 3v12m0 0l4-4m-4 4l-4-4M5 21h14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <button class="abtn-icon danger" data-del="${a.id}" title="Futa"><svg viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      </div></td>
    </tr>`).join("");
}

/* ---- Editor --------------------------------------------------------------*/
function openEditor(id) {
  editingId = id;
  cover = null;
  const a = id ? ALL.find((x) => x.id === id) : null;
  $("#editor-title").textContent = id ? "Hariri Makala" : "Makala Mpya";
  $("#e-title").value = a?.title || "";
  $("#e-category").value = a?.category || "";
  $("#e-status").value = a?.status || "draft";
  $("#e-excerpt").value = a?.excerpt || "";
  $("#e-content").value = a?.content || "";
  const cp = $("#cover-preview");
  if (a?.cover) { cover = { url: a.cover, path: a.coverPath || null }; cp.src = a.cover; cp.hidden = false; }
  else { cp.hidden = true; cp.src = ""; }
  $("#list-view").hidden = true; $("#editor-view").hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function closeEditor() { $("#editor-view").hidden = true; $("#list-view").hidden = false; editingId = null; cover = null; }

async function handleCoverFile(file) {
  if (!file || !file.type.startsWith("image/")) return;
  const bar = $("#cover-upl"); bar.textContent = "Inapakia…";
  try {
    const rec = await uploadImage(file, `${COL_KEY}/covers`, { onProgress: (p) => { bar.textContent = `Inapakia… ${p}%`; } });
    if (cover?.path) deleteFile(cover.path).catch(() => {});
    cover = { url: rec.url, path: rec.path };
    const cp = $("#cover-preview"); cp.src = rec.url; cp.hidden = false;
    bar.textContent = "Imepakiwa.";
  } catch (err) { console.warn(err); bar.textContent = ""; ADMIN.toast(err?.message || "Upakiaji umeshindikana.", "error"); }
}

async function save() {
  const title = $("#e-title").value.trim();
  const content = $("#e-content").value.trim();
  if (!title) { ADMIN.toast("Weka kichwa cha habari.", "warning"); return; }
  if (!content) { ADMIN.toast("Andika maudhui ya makala.", "warning"); return; }

  const data = {
    title, slug: slugify(title),
    category: $("#e-category").value.trim() || (COL_KEY === "news" ? "Habari" : "Blogu"),
    status: $("#e-status").value,
    excerpt: $("#e-excerpt").value.trim(),
    content,
    cover: cover?.url || null, coverPath: cover?.path || null,
    updatedAt: serverTimestamp()
  };
  const btn = $("#e-save"); btn.setAttribute("aria-disabled", "true");
  try {
    if (editingId) await updateDoc(doc(db, COL_NAME, editingId), data);
    else await addDoc(col(COL_NAME), { ...data, createdAt: serverTimestamp() });
    ADMIN.toast("Makala imehifadhiwa.", "success");
    closeEditor(); load();
  } catch (err) { console.warn(err); ADMIN.toast("Imeshindikana kuhifadhi.", "error"); }
  finally { btn.removeAttribute("aria-disabled"); }
}

async function togglePublish(id) {
  const a = ALL.find((x) => x.id === id); if (!a) return;
  const next = a.status === "published" ? "draft" : "published";
  try { await updateDoc(doc(db, COL_NAME, id), { status: next, updatedAt: serverTimestamp() }); ADMIN.toast(next === "published" ? "Imechapishwa." : "Imerudi rasimu.", "success"); load(); }
  catch (err) { console.warn(err); ADMIN.toast("Imeshindikana.", "error"); }
}

function removeArticle(id) {
  const a = ALL.find((x) => x.id === id); if (!a) return;
  ADMIN.confirm({
    title: "Futa makala?", message: `Futa "${a.title}"? Kitendo hiki hakiwezi kutenduliwa.`, confirmLabel: "Futa", danger: true,
    onConfirm: async () => {
      try {
        await deleteDoc(doc(db, COL_NAME, id));
        if (a.coverPath) deleteFile(a.coverPath).catch(() => {});
        ADMIN.toast("Imefutwa.", "success"); load();
      } catch (err) { console.warn(err); ADMIN.toast("Imeshindikana kufuta.", "error"); }
    }
  });
}

function wire() {
  $("#art-search").addEventListener("input", render);
  $("#art-status").addEventListener("change", render);
  $("#art-add").addEventListener("click", () => openEditor(null));
  $("#e-cancel").addEventListener("click", closeEditor);
  $("#e-save").addEventListener("click", save);
  $("#art-tbody").addEventListener("click", (e) => {
    const ed = e.target.closest("[data-edit]"); if (ed) return openEditor(ed.dataset.edit);
    const pb = e.target.closest("[data-pub]"); if (pb) return togglePublish(pb.dataset.pub);
    const dl = e.target.closest("[data-del]"); if (dl) return removeArticle(dl.dataset.del);
  });
  const dz = $("#cover-drop"), file = $("#cover-file");
  dz.addEventListener("click", () => file.click());
  file.addEventListener("change", () => { handleCoverFile(file.files[0]); file.value = ""; });
  ["dragover", "dragenter"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("is-drag"); }));
  ["dragleave", "dragend", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("is-drag"); }));
  dz.addEventListener("drop", (e) => { if (e.dataTransfer?.files?.[0]) handleCoverFile(e.dataTransfer.files[0]); });
}

ADMIN.onReady(() => { wire(); load(); });
