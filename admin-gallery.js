/* =============================================================================
   SAM EMPIRE — admin-gallery.js
   Uploads images into the public `gallery` collection (through the storage
   pipeline: compress → watermark → thumbnail), tagged with a category the
   admin types before uploading. Supports filtering and deleting existing items.
   ============================================================================= */

import { ADMIN } from "/assets/js/admin-core.js";
import { db, COLLECTIONS, col, serverTimestamp } from "/assets/js/firebase.js";
import { getDocs, query, orderBy, doc, addDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { uploadImage, deleteFile } from "/assets/js/storage.js";
import { $, escapeHtml } from "/assets/js/utils.js";

let ALL = [];

async function load() {
  try {
    const snap = await getDocs(query(col(COLLECTIONS.GALLERY), orderBy("createdAt", "desc")));
    ALL = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) { console.warn("[SAM] gallery:", err?.code || err); ALL = []; }
  populateFilter();
  render();
}

function populateFilter() {
  const cats = Array.from(new Set(ALL.map((g) => g.category).filter(Boolean)));
  const cur = $("#g-filter").value;
  $("#g-filter").innerHTML = `<option value="">Kategoria zote</option>` + cats.map((c) => `<option value="${escapeHtml(c)}"${c === cur ? " selected" : ""}>${escapeHtml(c)}</option>`).join("");
}

function render() {
  const cat = $("#g-filter").value;
  const rows = cat ? ALL.filter((g) => g.category === cat) : ALL;
  $("#g-total").textContent = `${rows.length} picha`;
  const grid = $("#g-grid");
  if (!rows.length) { grid.innerHTML = `<p class="text-muted">Hakuna picha bado. Pakia kwa juu.</p>`; return; }
  grid.innerHTML = rows.map((g) => `
    <div class="media-item">
      <img src="${g.thumbUrl || g.url}" alt="${escapeHtml(g.caption || "")}" loading="lazy" />
      <button class="media-item__del" data-del="${g.id}" title="Futa" type="button"><svg viewBox="0 0 24 24" width="14" height="14" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      <span class="media-item__cap">${escapeHtml(g.category || "Viwanja")}</span>
    </div>`).join("");
}

async function handleFiles(files) {
  const list = Array.from(files || []).filter((f) => f.type.startsWith("image/"));
  if (!list.length) return;
  const category = $("#g-category").value.trim() || "Viwanja";
  for (const file of list) {
    const row = document.createElement("div");
    row.innerHTML = `<div class="text-xs text-muted">${escapeHtml(file.name)}</div><div class="upl__bar" style="height:4px;background:var(--surface-3);border-radius:99px;overflow:hidden;margin-top:4px"><i style="display:block;height:100%;width:0;background:var(--grad-gold);transition:width .2s"></i></div>`;
    $("#g-upl").appendChild(row);
    const fill = row.querySelector("i");
    try {
      const rec = await uploadImage(file, "gallery", { onProgress: (p) => { fill.style.width = p + "%"; } });
      await addDoc(col(COLLECTIONS.GALLERY), {
        url: rec.url, thumbUrl: rec.thumbUrl || rec.url, path: rec.path, thumbPath: rec.thumbPath || null,
        category, caption: "", createdAt: serverTimestamp()
      });
    } catch (err) { console.warn("[SAM] gallery upload:", err); ADMIN.toast(err?.message || "Upakiaji umeshindikana.", "error"); }
    finally { row.remove(); }
  }
  load();
}

function removeItem(id) {
  const g = ALL.find((x) => x.id === id); if (!g) return;
  ADMIN.confirm({ title: "Futa picha?", message: "Kitendo hiki hakiwezi kutenduliwa.", confirmLabel: "Futa", danger: true, onConfirm: async () => {
    try {
      await deleteDoc(doc(db, COLLECTIONS.GALLERY, id));
      if (g.path) deleteFile(g.path).catch(() => {});
      if (g.thumbPath) deleteFile(g.thumbPath).catch(() => {});
      ALL = ALL.filter((x) => x.id !== id); render(); ADMIN.toast("Imefutwa.", "success");
    } catch (err) { console.warn(err); ADMIN.toast("Imeshindikana kufuta.", "error"); }
  } });
}

function wire() {
  $("#g-filter").addEventListener("change", render);
  $("#g-grid").addEventListener("click", (e) => { const b = e.target.closest("[data-del]"); if (b) removeItem(b.dataset.del); });
  const dz = $("#g-dropzone"), file = $("#g-file");
  dz.addEventListener("click", () => file.click());
  file.addEventListener("change", () => { handleFiles(file.files); file.value = ""; });
  ["dragover", "dragenter"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("is-drag"); }));
  ["dragleave", "dragend", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("is-drag"); }));
  dz.addEventListener("drop", (e) => { if (e.dataTransfer?.files) handleFiles(e.dataTransfer.files); });
}

ADMIN.onReady(() => { wire(); load(); });
