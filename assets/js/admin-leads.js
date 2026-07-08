/* =============================================================================
   SAM EMPIRE — admin-leads.js
   CRM board. Loads all leads, groups them into the pipeline columns, supports
   drag-and-drop between stages (writes the new status), and opens a detail modal
   for each lead with quick contact actions, an internal note, and a status
   selector. Admin-only writes per firestore.rules.
   ============================================================================= */

import { ADMIN } from "/assets/js/admin-core.js";
import { db, COLLECTIONS, col, serverTimestamp } from "/assets/js/firebase.js";
import { getDocs, query, orderBy, limit, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { $, $$, el, escapeHtml, formatDateTime, relativeTime, whatsappLink, normalizePhoneTz } from "/assets/js/utils.js";

const STAGES = [
  { key: "new", label: "Mpya" },
  { key: "contacted", label: "Imefuatiliwa" },
  { key: "interested", label: "Ana Nia" },
  { key: "negotiating", label: "Majadiliano" },
  { key: "reserved", label: "Imehifadhiwa" },
  { key: "sold", label: "Imeuzwa" },
  { key: "lost", label: "Imepotea" }
];
const SOURCE_LABEL = { contact: "Fomu", property_inquiry: "Kiwanja", reservation: "Uhifadhi", schedule_visit: "Ziara", career: "Ajira", "": "—" };

let LEADS = [];

async function load() {
  try {
    const snap = await getDocs(query(col(COLLECTIONS.LEADS), orderBy("createdAt", "desc"), limit(1000)));
    LEADS = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) { console.warn("[SAM] leads:", err?.code || err); LEADS = []; }
  populateSources();
  render();
}

function populateSources() {
  const set = new Set(LEADS.map((l) => l.source).filter(Boolean));
  $("#l-source").innerHTML = `<option value="">Vyanzo vyote</option>` + Array.from(set).map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(SOURCE_LABEL[s] || s)}</option>`).join("");
}

function filtered() {
  const q = ($("#l-search").value || "").toLowerCase().trim();
  const src = $("#l-source").value;
  return LEADS.filter((l) => {
    if (src && l.source !== src) return false;
    if (q && !`${l.name || ""} ${l.phone || ""} ${l.propertyCode || ""}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

function cardHTML(l) {
  const when = relativeTime(l.createdAt) || "";
  return `
  <div class="kcard" draggable="true" data-id="${l.id}" data-status="${l.status || "new"}">
    <div class="kcard__name">${escapeHtml(l.name || "—")}</div>
    <div class="kcard__meta">${escapeHtml(l.phone || "")}${l.propertyCode ? " · " + escapeHtml(l.propertyCode) : ""}</div>
    <div class="kcard__meta">${escapeHtml(SOURCE_LABEL[l.source] || l.source || "")} · ${escapeHtml(when)}</div>
  </div>`;
}

function render() {
  const rows = filtered();
  const board = $("#kanban");
  board.innerHTML = STAGES.map((s) => {
    const items = rows.filter((l) => (l.status || "new") === s.key);
    return `
    <div class="kcol" data-status="${s.key}">
      <div class="kcol__head">${s.label}<span class="kcol__count">${items.length}</span></div>
      <div class="kcol__body" data-drop="${s.key}">${items.map(cardHTML).join("")}</div>
    </div>`;
  }).join("");
  $("#l-total").textContent = `${rows.length} miongozo`;
  wireDnD();
}

/* ---- Drag & drop -------------------------------------------------------- */
let dragId = null;
function wireDnD() {
  $$(".kcard").forEach((card) => {
    card.addEventListener("dragstart", () => { dragId = card.dataset.id; card.classList.add("dragging"); });
    card.addEventListener("dragend", () => { card.classList.remove("dragging"); dragId = null; $$(".kcol").forEach((c) => c.classList.remove("drop-hover")); });
    card.addEventListener("click", () => openLead(card.dataset.id));
  });
  $$(".kcol").forEach((colEl) => {
    const body = $(".kcol__body", colEl);
    colEl.addEventListener("dragover", (e) => { e.preventDefault(); colEl.classList.add("drop-hover"); });
    colEl.addEventListener("dragleave", () => colEl.classList.remove("drop-hover"));
    colEl.addEventListener("drop", (e) => {
      e.preventDefault(); colEl.classList.remove("drop-hover");
      const status = body.dataset.drop;
      if (dragId) changeStatus(dragId, status);
    });
  });
}

async function changeStatus(id, status) {
  const lead = LEADS.find((l) => l.id === id);
  if (!lead || lead.status === status) return;
  const prev = lead.status;
  lead.status = status; render(); // optimistic
  try {
    await updateDoc(doc(db, COLLECTIONS.LEADS, id), { status, updatedAt: serverTimestamp() });
    ADMIN.toast(`Hali imebadilishwa: ${STAGES.find((s) => s.key === status)?.label}`, "success");
  } catch (err) {
    console.warn(err); lead.status = prev; render();
    ADMIN.toast("Imeshindikana kubadilisha hali.", "error");
  }
}

/* ---- Detail modal ------------------------------------------------------- */
function openLead(id) {
  const l = LEADS.find((x) => x.id === id); if (!l) return;
  const phone = normalizePhoneTz(l.phone || "");
  const body = el("div", { class: "flex flex-col gap-3" });

  const info = [
    ["Simu", l.phone || "—"], ["Barua pepe", l.email || "—"],
    ["Kiwanja", l.propertyCode || l.propertyId || "—"], ["Chanzo", SOURCE_LABEL[l.source] || l.source || "—"],
    ["Muda", formatDateTime(l.createdAt) || "—"]
  ].map(([k, v]) => `<div class="flex-between"><span class="text-faint text-sm">${k}</span><span class="fw-bold text-sm">${escapeHtml(String(v))}</span></div>`).join("");

  const statusSel = STAGES.map((s) => `<option value="${s.key}"${(l.status || "new") === s.key ? " selected" : ""}>${s.label}</option>`).join("");

  body.innerHTML = `
    ${l.message ? `<div class="panel"><div class="panel__body"><span class="text-faint text-sm">Ujumbe</span><p class="mt-1">${escapeHtml(l.message)}</p></div></div>` : ""}
    <div class="flex flex-col gap-2">${info}</div>
    <div class="flex gap-2 wrap">
      <a class="btn btn-outline btn-sm" href="tel:${phone}">Piga Simu</a>
      <a class="btn btn-whatsapp btn-sm" href="${whatsappLink(`Habari ${l.name || ""}, ni kutoka SAM EMPIRE.`, phone)}" target="_blank" rel="noopener">WhatsApp</a>
      ${l.email ? `<a class="btn btn-ghost btn-sm" href="mailto:${escapeHtml(l.email)}">Barua Pepe</a>` : ""}
    </div>
    <div class="field"><label class="label">Hali</label><select class="select" id="lead-status">${statusSel}</select></div>
    <div class="field"><label class="label">Dokezo la Ndani</label><textarea class="textarea" id="lead-note" rows="3" placeholder="Andika dokezo…">${escapeHtml(l.adminNotes || "")}</textarea></div>`;

  ADMIN.modal({
    title: l.name || "Mwongozo",
    body,
    actions: [
      { label: "Futa", class: "btn btn-ghost", onClick: (close) => { close(); removeLead(id); } },
      { label: "Hifadhi", class: "btn btn-gold", onClick: async (close) => {
          const status = $("#lead-status").value, note = $("#lead-note").value.trim();
          try {
            await updateDoc(doc(db, COLLECTIONS.LEADS, id), { status, adminNotes: note, updatedAt: serverTimestamp() });
            Object.assign(l, { status, adminNotes: note });
            ADMIN.toast("Mwongozo umesasishwa.", "success"); close(); render();
          } catch (err) { console.warn(err); ADMIN.toast("Imeshindikana.", "error"); }
        } }
    ]
  });
}

function removeLead(id) {
  ADMIN.confirm({
    title: "Futa mwongozo?", message: "Kitendo hiki hakiwezi kutenduliwa.", confirmLabel: "Futa", danger: true,
    onConfirm: async () => {
      try { await deleteDoc(doc(db, COLLECTIONS.LEADS, id)); LEADS = LEADS.filter((l) => l.id !== id); render(); ADMIN.toast("Umefutwa.", "success"); }
      catch (err) { console.warn(err); ADMIN.toast("Imeshindikana kufuta.", "error"); }
    }
  });
}

ADMIN.onReady(() => {
  $("#l-search").addEventListener("input", render);
  $("#l-source").addEventListener("change", render);
  load();
});
