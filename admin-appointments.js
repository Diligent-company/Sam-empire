/* =============================================================================
   SAM EMPIRE — admin-appointments.js
   Manages site-visit appointment requests: list, filter, view detail, update
   status, quick-contact, and delete. Admin-only writes per firestore.rules.
   ============================================================================= */

import { ADMIN } from "/assets/js/admin-core.js";
import { db, COLLECTIONS, col, serverTimestamp } from "/assets/js/firebase.js";
import { getDocs, query, orderBy, limit, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { $, el, escapeHtml, formatDateTime, relativeTime, whatsappLink, normalizePhoneTz } from "/assets/js/utils.js";

const STATUS = { new: ["Mpya", "pill-new"], confirmed: ["Imethibitishwa", "pill-warn"], completed: ["Imekamilika", "pill-success"], cancelled: ["Imeghairiwa", "pill-danger"] };
let ROWS = [];

async function load() {
  try {
    const snap = await getDocs(query(col(COLLECTIONS.APPOINTMENTS), orderBy("createdAt", "desc"), limit(1000)));
    ROWS = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) { console.warn("[SAM] appointments:", err?.code || err); ROWS = []; }
  render();
}

function pill(s) { const [lbl, cls] = STATUS[s] || STATUS.new; return `<span class="pill ${cls}">${lbl}</span>`; }

function filtered() {
  const q = ($("#a-search").value || "").toLowerCase().trim();
  const st = $("#a-status").value;
  return ROWS.filter((r) => {
    if (st && (r.status || "new") !== st) return false;
    if (q && !`${r.name || ""} ${r.phone || ""} ${r.propertyCode || ""}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

function render() {
  const rows = filtered();
  const tb = $("#appt-tbody");
  $("#a-total").textContent = `${rows.length} miadi`;
  if (!rows.length) { tb.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding:var(--s-8)">Hakuna miadi.</td></tr>`; return; }
  tb.innerHTML = rows.map((r) => `
    <tr>
      <td><div class="fw-bold">${escapeHtml(r.name || "—")}</div><div class="text-xs text-faint">${escapeHtml(r.phone || "")}</div></td>
      <td class="mono">${escapeHtml(r.propertyCode || r.propertyId || "—")}</td>
      <td>${escapeHtml(r.date || "—")}${r.time ? " · " + escapeHtml(r.time) : ""}</td>
      <td>${pill(r.status || "new")}</td>
      <td class="text-xs text-faint">${escapeHtml(relativeTime(r.createdAt) || "")}</td>
      <td><div class="atable__actions">
        <button class="abtn-icon" data-view="${r.id}" title="Angalia"><svg viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="2.5" stroke="currentColor" stroke-width="1.7"/></svg></button>
        <button class="abtn-icon danger" data-del="${r.id}" title="Futa"><svg viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      </div></td>
    </tr>`).join("");
}

function openView(id) {
  const r = ROWS.find((x) => x.id === id); if (!r) return;
  const phone = normalizePhoneTz(r.phone || "");
  const body = el("div", { class: "flex flex-col gap-3" });
  const info = [
    ["Simu", r.phone || "—"], ["Kiwanja", r.propertyCode || r.propertyId || "—"],
    ["Tarehe", r.date || "—"], ["Saa", r.time || "—"], ["Imeombwa", formatDateTime(r.createdAt) || "—"]
  ].map(([k, v]) => `<div class="flex-between"><span class="text-faint text-sm">${k}</span><span class="fw-bold text-sm">${escapeHtml(String(v))}</span></div>`).join("");
  const sel = Object.entries(STATUS).map(([k, v]) => `<option value="${k}"${(r.status || "new") === k ? " selected" : ""}>${v[0]}</option>`).join("");
  body.innerHTML = `
    ${r.notes ? `<div class="panel"><div class="panel__body"><span class="text-faint text-sm">Dokezo</span><p class="mt-1">${escapeHtml(r.notes)}</p></div></div>` : ""}
    <div class="flex flex-col gap-2">${info}</div>
    <div class="flex gap-2 wrap">
      <a class="btn btn-outline btn-sm" href="tel:${phone}">Piga Simu</a>
      <a class="btn btn-whatsapp btn-sm" href="${whatsappLink(`Habari ${r.name || ""}, kuhusu miadi ya ziara ya kiwanja SAM EMPIRE.`, phone)}" target="_blank" rel="noopener">WhatsApp</a>
    </div>
    <div class="field"><label class="label">Hali</label><select class="select" id="appt-status">${sel}</select></div>`;
  ADMIN.modal({
    title: r.name || "Miadi",
    body,
    actions: [{ label: "Funga", class: "btn btn-ghost", onClick: (c) => c() }, { label: "Hifadhi", class: "btn btn-gold", onClick: async (close) => {
      const status = $("#appt-status").value;
      try { await updateDoc(doc(db, COLLECTIONS.APPOINTMENTS, id), { status, updatedAt: serverTimestamp() }); r.status = status; ADMIN.toast("Imesasishwa.", "success"); close(); render(); }
      catch (err) { console.warn(err); ADMIN.toast("Imeshindikana.", "error"); }
    } }]
  });
}

function removeRow(id) {
  ADMIN.confirm({ title: "Futa miadi?", message: "Kitendo hiki hakiwezi kutenduliwa.", confirmLabel: "Futa", danger: true, onConfirm: async () => {
    try { await deleteDoc(doc(db, COLLECTIONS.APPOINTMENTS, id)); ROWS = ROWS.filter((x) => x.id !== id); render(); ADMIN.toast("Umefutwa.", "success"); }
    catch (err) { console.warn(err); ADMIN.toast("Imeshindikana.", "error"); }
  } });
}

ADMIN.onReady(() => {
  $("#a-search").addEventListener("input", render);
  $("#a-status").addEventListener("change", render);
  $("#appt-tbody").addEventListener("click", (e) => {
    const v = e.target.closest("[data-view]"); if (v) return openView(v.dataset.view);
    const d = e.target.closest("[data-del]"); if (d) return removeRow(d.dataset.del);
  });
  load();
});
