/* =============================================================================
   SAM EMPIRE — admin-messages.js
   Inbox for contact-form and career enquiries (the `messages` collection).
   List, filter (status + source), open detail (auto-marks read), reply via
   mailto/WhatsApp, mark handled, and delete. Admin-only writes per the rules.
   ============================================================================= */

import { ADMIN } from "/assets/js/admin-core.js";
import { db, COLLECTIONS, col, serverTimestamp } from "/assets/js/firebase.js";
import { getDocs, query, orderBy, limit, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { $, el, escapeHtml, truncate, formatDateTime, relativeTime, whatsappLink, normalizePhoneTz } from "/assets/js/utils.js";

const STATUS = { new: ["Mpya", "pill-new"], read: ["Imesomwa", "pill-muted"], handled: ["Imeshughulikiwa", "pill-success"] };
const SOURCE = { contact: "Fomu ya Mawasiliano", career: "Ajira" };
let ROWS = [];

async function load() {
  try {
    const snap = await getDocs(query(col(COLLECTIONS.MESSAGES), orderBy("createdAt", "desc"), limit(1000)));
    ROWS = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) { console.warn("[SAM] messages:", err?.code || err); ROWS = []; }
  render();
}

function pill(s) { const [lbl, cls] = STATUS[s] || STATUS.new; return `<span class="pill ${cls}">${lbl}</span>`; }

function filtered() {
  const q = ($("#m-search").value || "").toLowerCase().trim();
  const st = $("#m-status").value, src = $("#m-source").value;
  return ROWS.filter((r) => {
    if (st && (r.status || "new") !== st) return false;
    if (src && r.source !== src) return false;
    if (q && !`${r.name || ""} ${r.email || ""} ${r.phone || ""} ${r.message || ""}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

function render() {
  const rows = filtered();
  const tb = $("#msg-tbody");
  $("#m-total").textContent = `${rows.length} ujumbe`;
  if (!rows.length) { tb.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding:var(--s-8)">Hakuna ujumbe.</td></tr>`; return; }
  tb.innerHTML = rows.map((r) => `
    <tr class="${(r.status || "new") === "new" ? "row-unread" : ""}">
      <td><div class="fw-bold">${escapeHtml(r.name || "—")}</div><div class="text-xs text-faint">${escapeHtml(r.email || r.phone || "")}</div></td>
      <td class="text-sm">${escapeHtml(SOURCE[r.source] || r.source || "—")}</td>
      <td><div class="msg-preview">${escapeHtml(truncate(r.message || "", 80))}</div></td>
      <td>${pill(r.status || "new")}</td>
      <td class="text-xs text-faint">${escapeHtml(relativeTime(r.createdAt) || "")}</td>
      <td><div class="atable__actions">
        <button class="abtn-icon" data-view="${r.id}" title="Fungua"><svg viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M4 5h16v14H4z" stroke="currentColor" stroke-width="1.7"/><path d="M4 6l8 6 8-6" stroke="currentColor" stroke-width="1.7"/></svg></button>
        <button class="abtn-icon danger" data-del="${r.id}" title="Futa"><svg viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      </div></td>
    </tr>`).join("");
}

async function setStatus(id, status) {
  const r = ROWS.find((x) => x.id === id); if (!r || r.status === status) return;
  r.status = status;
  try { await updateDoc(doc(db, COLLECTIONS.MESSAGES, id), { status, updatedAt: serverTimestamp() }); }
  catch (err) { console.warn("[SAM] msg status:", err?.code || err); }
}

function openView(id) {
  const r = ROWS.find((x) => x.id === id); if (!r) return;
  if ((r.status || "new") === "new") { setStatus(id, "read").then(render); }
  const phone = normalizePhoneTz(r.phone || "");
  const body = el("div", { class: "flex flex-col gap-3" });
  const info = [
    ["Barua pepe", r.email || "—"], ["Simu", r.phone || "—"],
    ["Chanzo", SOURCE[r.source] || r.source || "—"], ["Muda", formatDateTime(r.createdAt) || "—"]
  ].map(([k, v]) => `<div class="flex-between"><span class="text-faint text-sm">${k}</span><span class="fw-bold text-sm">${escapeHtml(String(v))}</span></div>`).join("");
  const mailHref = r.email ? `mailto:${encodeURIComponent(r.email)}?subject=${encodeURIComponent("SAM EMPIRE — Majibu")}&body=${encodeURIComponent(`Habari ${r.name || ""},\n\n`)}` : null;
  body.innerHTML = `
    <div class="panel"><div class="panel__body"><span class="text-faint text-sm">Ujumbe</span><p class="mt-1" style="white-space:pre-wrap">${escapeHtml(r.message || "—")}</p></div></div>
    <div class="flex flex-col gap-2">${info}</div>
    <div class="flex gap-2 wrap">
      ${mailHref ? `<a class="btn btn-outline btn-sm" href="${mailHref}">Jibu kwa Barua Pepe</a>` : ""}
      ${phone ? `<a class="btn btn-whatsapp btn-sm" href="${whatsappLink(`Habari ${r.name || ""}, ni kutoka SAM EMPIRE kuhusu ujumbe wako.`, phone)}" target="_blank" rel="noopener">WhatsApp</a>` : ""}
    </div>`;
  ADMIN.modal({
    title: r.name || "Ujumbe",
    body,
    actions: [
      { label: "Futa", class: "btn btn-ghost", onClick: (c) => { c(); removeRow(id); } },
      { label: (r.status === "handled" ? "Rudisha Mpya" : "Weka Imeshughulikiwa"), class: "btn btn-gold", onClick: async (close) => {
          const next = r.status === "handled" ? "read" : "handled";
          await setStatus(id, next); ADMIN.toast("Imesasishwa.", "success"); close(); render();
        } }
    ]
  });
}

function removeRow(id) {
  ADMIN.confirm({ title: "Futa ujumbe?", message: "Kitendo hiki hakiwezi kutenduliwa.", confirmLabel: "Futa", danger: true, onConfirm: async () => {
    try { await deleteDoc(doc(db, COLLECTIONS.MESSAGES, id)); ROWS = ROWS.filter((x) => x.id !== id); render(); ADMIN.toast("Umefutwa.", "success"); }
    catch (err) { console.warn(err); ADMIN.toast("Imeshindikana.", "error"); }
  } });
}

ADMIN.onReady(() => {
  ["#m-search", "#m-status", "#m-source"].forEach((s) => $(s).addEventListener("input", render));
  $("#msg-tbody").addEventListener("click", (e) => {
    const v = e.target.closest("[data-view]"); if (v) return openView(v.dataset.view);
    const d = e.target.closest("[data-del]"); if (d) return removeRow(d.dataset.del);
  });
  load();
});
