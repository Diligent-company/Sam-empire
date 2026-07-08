/* =============================================================================
   SAM EMPIRE — admin-backup.js
   Data portability utility. Export lets the admin pick collections and
   downloads a single JSON snapshot (documents keyed by their Firestore ID, so
   re-importing preserves the same IDs). Import restores from such a file via
   batched writes (merge), chunked at 400 ops to stay under Firestore's batch
   limit. Every export/import is logged to `backups` for an audit trail.
   ============================================================================= */

import { ADMIN } from "/assets/js/admin-core.js";
import { db, COLLECTIONS, col, serverTimestamp } from "/assets/js/firebase.js";
import { getDocs, doc, writeBatch, addDoc, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { $, escapeHtml, formatDateTime } from "/assets/js/utils.js";

const EXPORTABLE = [
  { key: "PROPERTIES", label: "Viwanja" }, { key: "LOCATIONS", label: "Maeneo" },
  { key: "BLOG", label: "Blogu" }, { key: "NEWS", label: "Habari" },
  { key: "TESTIMONIALS", label: "Ushuhuda" }, { key: "FAQS", label: "Maswali" },
  { key: "GALLERY", label: "Picha" }, { key: "VIDEOS", label: "Video" },
  { key: "CAREERS", label: "Ajira" }, { key: "SETTINGS", label: "Mipangilio" },
  { key: "LEADS", label: "Miongozo (CRM)" }, { key: "SUBSCRIBERS", label: "Wasajili" }
];

function renderChecks() {
  $("#bk-checks").innerHTML = EXPORTABLE.map((c) => `
    <label class="check"><input type="checkbox" value="${c.key}" checked />${c.label}</label>`).join("");
}

async function logHistory(type, summary) {
  try { await addDoc(col(COLLECTIONS.BACKUPS), { type, summary, admin: ADMIN.user?.email || "", createdAt: serverTimestamp() }); }
  catch (err) { console.warn("[SAM] backup log:", err?.code || err); }
}

async function loadHistory() {
  try {
    const snap = await getDocs(query(col(COLLECTIONS.BACKUPS), orderBy("createdAt", "desc"), limit(20)));
    const rows = snap.docs.map((d) => d.data());
    const tb = $("#bk-history");
    if (!rows.length) { tb.innerHTML = `<tr><td colspan="4" class="text-center text-muted" style="padding:var(--s-6)">Hakuna historia bado.</td></tr>`; return; }
    tb.innerHTML = rows.map((r) => `<tr><td class="text-xs text-faint">${escapeHtml(formatDateTime(r.createdAt) || "—")}</td><td class="text-sm">${escapeHtml((r.summary?.collections || []).join(", "))}</td><td class="mono">${r.summary?.docCount ?? "—"}</td><td>${r.type === "export" ? `<span class="pill pill-new">Pakua</span>` : `<span class="pill pill-success">Rejesha</span>`}</td></tr>`).join("");
  } catch (err) { console.warn("[SAM] backup history:", err?.code || err); }
}

/* ---- Export ---------------------------------------------------------------*/
async function runExport() {
  const chosen = Array.from(document.querySelectorAll("#bk-checks input:checked")).map((i) => i.value);
  if (!chosen.length) { ADMIN.toast("Chagua angalau sehemu moja.", "warning"); return; }
  const status = $("#bk-export-status");
  status.textContent = "Inatayarisha…";
  const out = { exportedAt: new Date().toISOString(), version: 1, collections: {} };
  let docCount = 0;
  try {
    for (const key of chosen) {
      const name = COLLECTIONS[key];
      const snap = await getDocs(col(name));
      const items = {};
      snap.docs.forEach((d) => { items[d.id] = d.data(); });
      out.collections[name] = items;
      docCount += snap.docs.length;
    }
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `sam-empire-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(a.href);
    status.textContent = `Nakala imepakuliwa (${docCount} nyaraka).`;
    await logHistory("export", { collections: chosen.map((k) => EXPORTABLE.find((c) => c.key === k)?.label || k), docCount });
    loadHistory();
  } catch (err) {
    console.warn("[SAM] export:", err);
    status.textContent = ""; ADMIN.toast("Imeshindikana kupakua nakala.", "error");
  }
}

/* ---- Import ---------------------------------------------------------------*/
let importPayload = null;

function handleFile(file) {
  const status = $("#bk-import-status");
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed.collections) throw new Error("Muundo wa faili si sahihi.");
      importPayload = parsed;
      const names = Object.keys(parsed.collections);
      const count = names.reduce((n, k) => n + Object.keys(parsed.collections[k]).length, 0);
      status.textContent = `Tayari kurejesha: ${names.join(", ")} (${count} nyaraka).`;
      $("#bk-import").disabled = false;
    } catch (err) {
      importPayload = null; $("#bk-import").disabled = true;
      status.textContent = "Faili si sahihi. Hakikisha ni nakala rudufu ya SAM EMPIRE.";
    }
  };
  reader.readAsText(file);
}

async function runImport() {
  if (!importPayload) return;
  ADMIN.confirm({
    title: "Rejesha data?",
    message: "Hii itaandika juu ya nyaraka zenye ID sawa katika sehemu zilizochaguliwa. Hatua hii haiwezi kutenduliwa. Endelea?",
    confirmLabel: "Rejesha", danger: true,
    onConfirm: async () => {
      const status = $("#bk-import-status");
      status.textContent = "Inarejesha…";
      let total = 0;
      try {
        for (const [collName, items] of Object.entries(importPayload.collections)) {
          const ids = Object.keys(items);
          for (let i = 0; i < ids.length; i += 400) {
            const chunk = ids.slice(i, i + 400);
            const batch = writeBatch(db);
            chunk.forEach((id) => batch.set(doc(db, collName, id), items[id], { merge: true }));
            await batch.commit();
            total += chunk.length;
          }
        }
        status.textContent = `Data imerejeshwa (${total} nyaraka).`;
        ADMIN.toast("Data imerejeshwa kikamilifu.", "success");
        await logHistory("restore", { collections: Object.keys(importPayload.collections), docCount: total });
        loadHistory();
      } catch (err) {
        console.warn("[SAM] import:", err);
        status.textContent = ""; ADMIN.toast("Imeshindikana kurejesha data.", "error");
      }
    }
  });
}

ADMIN.onReady(() => {
  renderChecks();
  $("#bk-export").addEventListener("click", runExport);
  $("#bk-file").addEventListener("change", (e) => handleFile(e.target.files[0]));
  $("#bk-import").addEventListener("click", runImport);
  loadHistory();
});
