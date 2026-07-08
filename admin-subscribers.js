/* =============================================================================
   SAM EMPIRE — admin-subscribers.js
   Read-mostly view over newsletter sign-ups collected by the public footer form
   (script.js → `subscribers` collection, admin-only read per firestore.rules).
   Supports search, CSV export, and delete.
   ============================================================================= */

import { ADMIN } from "/assets/js/admin-core.js";
import { db, COLLECTIONS, col } from "/assets/js/firebase.js";
import { getDocs, query, orderBy, doc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { $, escapeHtml, formatDate } from "/assets/js/utils.js";

let ALL = [];

async function load() {
  try {
    const snap = await getDocs(query(col(COLLECTIONS.SUBSCRIBERS), orderBy("createdAt", "desc")));
    ALL = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) { console.warn("[SAM] subscribers:", err?.code || err); ALL = []; }
  render();
}

function filtered() {
  const q = ($("#s-search").value || "").toLowerCase().trim();
  return q ? ALL.filter((s) => (s.email || "").toLowerCase().includes(q)) : ALL;
}

function render() {
  const rows = filtered();
  $("#s-total").textContent = `${rows.length} wasajili`;
  const tb = $("#s-tbody");
  if (!rows.length) { tb.innerHTML = `<tr><td colspan="4" class="text-center text-muted" style="padding:var(--s-8)">Hakuna wasajili bado.</td></tr>`; return; }
  tb.innerHTML = rows.map((s) => `
    <tr>
      <td class="fw-bold">${escapeHtml(s.email || "—")}</td>
      <td class="text-sm text-muted">${escapeHtml(s.source || "footer")}</td>
      <td class="text-xs text-faint">${escapeHtml(formatDate(s.createdAt) || "—")}</td>
      <td><button class="abtn-icon danger" data-del="${s.id}" title="Futa"><svg viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button></td>
    </tr>`).join("");
}

function removeRow(id) {
  ADMIN.confirm({ title: "Futa msajili?", message: "Kitendo hiki hakiwezi kutenduliwa.", confirmLabel: "Futa", danger: true, onConfirm: async () => {
    try { await deleteDoc(doc(db, COLLECTIONS.SUBSCRIBERS, id)); ALL = ALL.filter((x) => x.id !== id); render(); ADMIN.toast("Imefutwa.", "success"); }
    catch (err) { console.warn(err); ADMIN.toast("Imeshindikana kufuta.", "error"); }
  } });
}

function exportCsv() {
  const rows = filtered();
  if (!rows.length) { ADMIN.toast("Hakuna data ya kupakua.", "warning"); return; }
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = ["Email,Source,Date"].concat(rows.map((s) => [esc(s.email), esc(s.source || "footer"), esc(formatDate(s.createdAt) || "")].join(",")));
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `sam-empire-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(a.href);
}

ADMIN.onReady(() => {
  $("#s-search").addEventListener("input", render);
  $("#s-export").addEventListener("click", exportCsv);
  $("#s-tbody").addEventListener("click", (e) => { const b = e.target.closest("[data-del]"); if (b) removeRow(b.dataset.del); });
  load();
});
