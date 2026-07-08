/* =============================================================================
   SAM EMPIRE — admin-properties.js
   Property management: list every plot (published + draft), create/edit via a
   full in-page editor, delete, toggle publish state, and upload images through
   the Phase-2 storage pipeline (auto compress → gold watermark → thumbnail).
   All writes are admin-only per firestore.rules.
   ============================================================================= */

import { ADMIN } from "/assets/js/admin-core.js";
import { db, COLLECTIONS, col, serverTimestamp } from "/assets/js/firebase.js";
import {
  collection, getDocs, query, orderBy, limit, doc, addDoc, updateDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { uploadImage, deleteFile } from "/assets/js/storage.js";
import { KIGAMBONI_LOCATIONS, plotPlaceholder } from "/assets/js/catalog.js";
import { $, $$, escapeHtml, formatMoney, formatNumber, slugify, propertyCode } from "/assets/js/utils.js";

let ALL = [];
let editingId = null;
let editorImages = [];

/* ---- List --------------------------------------------------------------- */
async function loadList() {
  try {
    const snap = await getDocs(query(col(COLLECTIONS.PROPERTIES), orderBy("createdAt", "desc"), limit(500)));
    ALL = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) { console.warn("[SAM] properties list:", err?.code || err); ALL = []; }
  renderTable();
}

function availPill(a) {
  const t = String(a || "available").toLowerCase();
  if (t === "sold") return `<span class="pill pill-danger">Imeuzwa</span>`;
  if (t === "reserved") return `<span class="pill pill-warn">Imehifadhiwa</span>`;
  return `<span class="pill pill-success">Inapatikana</span>`;
}
function pubPill(s) {
  return s === "published" ? `<span class="pill pill-success">Hai</span>` : `<span class="pill pill-muted">Rasimu</span>`;
}

function renderTable() {
  const q = ($("#p-search").value || "").toLowerCase().trim();
  const st = $("#p-status").value;
  const rows = ALL.filter((p) => {
    if (st && (p.status || "draft") !== st) return false;
    if (q && !`${p.title || ""} ${p.code || ""} ${p.location || ""}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const tb = $("#props-tbody");
  if (!rows.length) { tb.innerHTML = `<tr><td colspan="7" class="text-center text-muted" style="padding:var(--s-8)">Hakuna kiwanja. Bofya “Ongeza Kiwanja”.</td></tr>`; return; }
  tb.innerHTML = rows.map((p) => {
    const thumb = (p.images && p.images[0] && (p.images[0].thumb || p.images[0].url)) || plotPlaceholder(p.location || "KGB", p.code || "");
    return `
    <tr>
      <td><img class="atable__thumb" src="${thumb}" alt="" loading="lazy" /></td>
      <td><div class="fw-bold">${escapeHtml(p.title || "—")}</div><div class="text-xs text-faint mono">${escapeHtml(p.code || "")}</div></td>
      <td>${escapeHtml(p.location || "—")}</td>
      <td class="mono">${formatMoney(Number(p.price || 0))}</td>
      <td>${availPill(p.availability)}</td>
      <td>${pubPill(p.status)}</td>
      <td><div class="atable__actions">
        <button class="abtn-icon" data-edit="${p.id}" title="Hariri"><svg viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M4 20h4L20 8l-4-4L4 16v4z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg></button>
        <button class="abtn-icon" data-pub="${p.id}" title="Chapisha / Rasimu"><svg viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M12 3v12m0 0l4-4m-4 4l-4-4M5 21h14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <button class="abtn-icon danger" data-del="${p.id}" title="Futa"><svg viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      </div></td>
    </tr>`;
  }).join("");
}

/* ---- Editor ------------------------------------------------------------- */
const val = (id) => $("#" + id).value.trim();
const num = (id) => Number($("#" + id).value) || 0;
const chk = (id) => $("#" + id).checked;
const setV = (id, v) => { const e = $("#" + id); if (e) e.value = v == null ? "" : v; };
const setC = (id, v) => { const e = $("#" + id); if (e) e.checked = !!v; };

function populateLocations() {
  $("#e-location").innerHTML = `<option value="">— Chagua eneo —</option>` +
    KIGAMBONI_LOCATIONS.map((l) => `<option value="${l.slug}" data-name="${escapeHtml(l.name)}">${escapeHtml(l.name)}</option>`).join("");
}

function openEditor(id) {
  editingId = id;
  editorImages = [];
  const p = id ? ALL.find((x) => x.id === id) : null;
  $("#editor-title").textContent = id ? "Hariri Kiwanja" : "Ongeza Kiwanja";

  // Reset then fill.
  ["e-title", "e-code", "e-price", "e-oldPrice", "e-downPayment", "e-installments", "e-size", "e-lat", "e-lng",
   "e-roadAccess", "e-landUse", "e-utilities", "e-schools", "e-hospitals", "e-markets", "e-transport",
   "e-description", "e-features"].forEach((k) => setV(k, ""));
  setV("e-sizeUnit", "m²"); setV("e-ownership", "Hati Miliki (Title Deed)");
  ["e-featured", "e-gov", "e-verified", "e-new", "e-hot"].forEach((k) => setC(k, false));
  $("#e-type").value = "Makazi"; $("#e-availability").value = "available"; $("#e-status").value = "draft"; $("#e-location").value = "";

  if (p) {
    setV("e-title", p.title || ""); setV("e-code", p.code || "");
    $("#e-location").value = p.locationSlug || "";
    $("#e-type").value = p.type || "Makazi";
    $("#e-availability").value = p.availability || "available";
    $("#e-status").value = p.status || "draft";
    setV("e-price", p.price || ""); setV("e-oldPrice", p.oldPrice || "");
    setV("e-downPayment", p.downPayment || ""); setV("e-installments", p.installmentMonths || "");
    setV("e-size", p.size || ""); setV("e-sizeUnit", p.sizeUnit || "m²");
    setV("e-lat", p.gps?.lat ?? ""); setV("e-lng", p.gps?.lng ?? "");
    setC("e-featured", p.featured); setC("e-gov", p.governmentApproved); setC("e-verified", p.verified); setC("e-new", p.isNew); setC("e-hot", p.hot);
    setV("e-ownership", p.ownership || "Hati Miliki (Title Deed)"); setV("e-roadAccess", p.roadAccess || ""); setV("e-landUse", p.landUse || "");
    setV("e-utilities", (p.utilities || []).join(", "));
    setV("e-schools", p.amenities?.schools || ""); setV("e-hospitals", p.amenities?.hospitals || "");
    setV("e-markets", p.amenities?.markets || ""); setV("e-transport", p.amenities?.transport || "");
    setV("e-description", p.description || "");
    setV("e-features", (p.features || []).join("\n"));
    editorImages = Array.isArray(p.images) ? p.images.slice() : [];
  }
  renderEditorImages();
  $("#list-view").hidden = true;
  $("#editor-view").hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function closeEditor() {
  $("#editor-view").hidden = true;
  $("#list-view").hidden = false;
  editingId = null; editorImages = [];
}

function renderEditorImages() {
  $("#e-images").innerHTML = editorImages.map((im, i) => `
    <div class="img-thumb"><img src="${im.thumb || im.url}" alt="" />
      <button data-img-remove="${i}" type="button" aria-label="Ondoa"><svg viewBox="0 0 24 24" width="13" height="13" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
    </div>`).join("");
}

async function save() {
  const title = val("e-title");
  const price = num("e-price");
  const locSlug = $("#e-location").value;
  if (!title) { ADMIN.toast("Weka jina la kiwanja.", "warning"); return; }
  if (!locSlug) { ADMIN.toast("Chagua eneo.", "warning"); return; }
  if (price <= 0) { ADMIN.toast("Weka bei sahihi.", "warning"); return; }

  const loc = KIGAMBONI_LOCATIONS.find((l) => l.slug === locSlug);
  let code = val("e-code");
  if (!code) { code = propertyCode(); setV("e-code", code); }
  const lat = $("#e-lat").value, lng = $("#e-lng").value;

  const data = {
    title, code, slug: slugify(`${title}-${code}`),
    location: loc ? loc.name : "Kigamboni", locationSlug: locSlug,
    type: $("#e-type").value, availability: $("#e-availability").value, status: $("#e-status").value,
    price, oldPrice: num("e-oldPrice") || null, downPayment: num("e-downPayment") || null,
    installmentMonths: num("e-installments") || null, currency: "TZS",
    size: num("e-size") || null, sizeUnit: val("e-sizeUnit") || "m²",
    featured: chk("e-featured"), governmentApproved: chk("e-gov"), verified: chk("e-verified"), isNew: chk("e-new"), hot: chk("e-hot"),
    ownership: val("e-ownership"), landUse: val("e-landUse") || $("#e-type").value, roadAccess: val("e-roadAccess"),
    utilities: val("e-utilities") ? val("e-utilities").split(",").map((s) => s.trim()).filter(Boolean) : [],
    gps: (lat && lng) ? { lat: Number(lat), lng: Number(lng) } : null,
    amenities: { schools: val("e-schools"), hospitals: val("e-hospitals"), markets: val("e-markets"), transport: val("e-transport") },
    description: val("e-description"),
    features: val("e-features") ? val("e-features").split("\n").map((s) => s.trim()).filter(Boolean) : [],
    images: editorImages,
    updatedAt: serverTimestamp()
  };

  const btn = $("#e-save"); btn.setAttribute("aria-disabled", "true");
  try {
    if (editingId) await updateDoc(doc(db, COLLECTIONS.PROPERTIES, editingId), data);
    else await addDoc(col(COLLECTIONS.PROPERTIES), { ...data, createdAt: serverTimestamp() });
    ADMIN.toast("Kiwanja kimehifadhiwa.", "success");
    closeEditor();
    loadList();
  } catch (err) {
    console.warn("[SAM] save property:", err?.code || err);
    ADMIN.toast("Imeshindikana kuhifadhi kiwanja.", "error");
  } finally { btn.removeAttribute("aria-disabled"); }
}

async function togglePublish(id) {
  const p = ALL.find((x) => x.id === id); if (!p) return;
  const next = p.status === "published" ? "draft" : "published";
  try {
    await updateDoc(doc(db, COLLECTIONS.PROPERTIES, id), { status: next, updatedAt: serverTimestamp() });
    ADMIN.toast(next === "published" ? "Kimechapishwa." : "Kimerudishwa rasimu.", "success");
    loadList();
  } catch (err) { console.warn(err); ADMIN.toast("Imeshindikana.", "error"); }
}

function removeProp(id) {
  const p = ALL.find((x) => x.id === id); if (!p) return;
  ADMIN.confirm({
    title: "Futa kiwanja?",
    message: `Una uhakika unataka kufuta “${p.title}”? Kitendo hiki hakiwezi kutenduliwa.`,
    confirmLabel: "Futa", danger: true,
    onConfirm: async () => {
      try {
        await deleteDoc(doc(db, COLLECTIONS.PROPERTIES, id));
        // Best-effort media cleanup.
        (p.images || []).forEach((im) => { if (im.path) deleteFile(im.path).catch(() => {}); if (im.thumbPath) deleteFile(im.thumbPath).catch(() => {}); });
        ADMIN.toast("Kiwanja kimefutwa.", "success");
        loadList();
      } catch (err) { console.warn(err); ADMIN.toast("Imeshindikana kufuta.", "error"); }
    }
  });
}

/* ---- Image upload ------------------------------------------------------- */
async function handleFiles(files) {
  const list = Array.from(files || []).filter((f) => f.type.startsWith("image/"));
  if (!list.length) return;
  const folder = `properties/${val("e-code") || "new"}`;
  for (const file of list) {
    const bar = document.createElement("div");
    bar.className = "upl";
    bar.innerHTML = `<div class="text-xs text-muted">${escapeHtml(file.name)}</div><div class="upl__bar"><i></i></div>`;
    $("#e-upl").appendChild(bar);
    const fill = bar.querySelector("i");
    try {
      const rec = await uploadImage(file, folder, { onProgress: (p) => { fill.style.width = p + "%"; } });
      editorImages.push({ url: rec.url, thumb: rec.thumbUrl || rec.url, path: rec.path, thumbPath: rec.thumbPath || null });
      renderEditorImages();
    } catch (err) {
      console.warn("[SAM] upload:", err);
      ADMIN.toast(err?.message || "Upakiaji umeshindikana.", "error");
    } finally { bar.remove(); }
  }
}

/* ---- Wiring ------------------------------------------------------------- */
function wire() {
  $("#p-search").addEventListener("input", renderTable);
  $("#p-status").addEventListener("change", renderTable);
  $("#p-add").addEventListener("click", () => openEditor(null));
  $("#e-cancel").addEventListener("click", closeEditor);
  $("#e-save").addEventListener("click", save);

  $("#props-tbody").addEventListener("click", (e) => {
    const ed = e.target.closest("[data-edit]"); if (ed) return openEditor(ed.dataset.edit);
    const pb = e.target.closest("[data-pub]"); if (pb) return togglePublish(pb.dataset.pub);
    const dl = e.target.closest("[data-del]"); if (dl) return removeProp(dl.dataset.del);
  });

  $("#e-images").addEventListener("click", (e) => {
    const b = e.target.closest("[data-img-remove]"); if (!b) return;
    const i = parseInt(b.dataset.imgRemove, 10);
    const im = editorImages[i];
    if (im?.path) deleteFile(im.path).catch(() => {});
    if (im?.thumbPath) deleteFile(im.thumbPath).catch(() => {});
    editorImages.splice(i, 1);
    renderEditorImages();
  });

  const dz = $("#e-dropzone"), file = $("#e-file");
  dz.addEventListener("click", () => file.click());
  file.addEventListener("change", () => { handleFiles(file.files); file.value = ""; });
  ["dragover", "dragenter"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("is-drag"); }));
  ["dragleave", "dragend", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("is-drag"); }));
  dz.addEventListener("drop", (e) => { if (e.dataTransfer?.files) handleFiles(e.dataTransfer.files); });
}

ADMIN.onReady(() => {
  populateLocations();
  wire();
  loadList();
});
