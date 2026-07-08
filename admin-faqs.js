/* =============================================================================
   SAM EMPIRE — admin-faqs.js
   FAQ management: add/edit/delete questions, toggle their visibility on the
   public FAQ page (active), and reorder with up/down controls that persist the
   numeric `order` field the public faq.js sorts by.
   ============================================================================= */

import { ADMIN } from "/assets/js/admin-core.js";
import { db, COLLECTIONS, col, serverTimestamp } from "/assets/js/firebase.js";
import { getDocs, query, orderBy, doc, addDoc, updateDoc, deleteDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { $, el, escapeHtml, truncate } from "/assets/js/utils.js";

let ALL = [];

async function load() {
  try {
    const snap = await getDocs(query(col(COLLECTIONS.FAQS), orderBy("order", "asc")));
    ALL = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) { console.warn("[SAM] faqs:", err?.code || err); ALL = []; }
  render();
}

function render() {
  const tb = $("#f-tbody");
  if (!ALL.length) { tb.innerHTML = `<tr><td colspan="4" class="text-center text-muted" style="padding:var(--s-8)">Hakuna swali bado.</td></tr>`; return; }
  tb.innerHTML = ALL.map((f, i) => `
    <tr>
      <td><div class="flex gap-1">
        <button class="abtn-icon" data-up="${f.id}" ${i === 0 ? "disabled" : ""} title="Panda"><svg viewBox="0 0 24 24" width="13" height="13" fill="none"><path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <button class="abtn-icon" data-down="${f.id}" ${i === ALL.length - 1 ? "disabled" : ""} title="Shuka"><svg viewBox="0 0 24 24" width="13" height="13" fill="none"><path d="M12 5v14M5 12l7 7 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      </div></td>
      <td class="fw-bold">${escapeHtml(truncate(f.question || "", 80))}</td>
      <td>${f.active === false ? `<span class="pill pill-muted">Imefichwa</span>` : `<span class="pill pill-success">Inaonekana</span>`}</td>
      <td><div class="atable__actions">
        <button class="abtn-icon" data-edit="${f.id}" title="Hariri"><svg viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M4 20h4L20 8l-4-4L4 16v4z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg></button>
        <button class="abtn-icon" data-toggle="${f.id}" title="Onyesha / Ficha"><svg viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="2.5" stroke="currentColor" stroke-width="1.7"/></svg></button>
        <button class="abtn-icon danger" data-del="${f.id}" title="Futa"><svg viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      </div></td>
    </tr>`).join("");
}

function openEditor(id) {
  const f = id ? ALL.find((x) => x.id === id) : null;
  const q = el("input", { class: "input", value: f?.question || "" });
  const a = el("textarea", { class: "textarea", rows: "4", text: f?.answer || "" });
  const body = el("div", { class: "flex flex-col gap-4" });
  const wrap = (label, input) => { const w = el("div", { class: "field" }); w.append(el("label", { class: "label", text: label }), input); return w; };
  body.append(wrap("Swali", q), wrap("Jibu", a));
  ADMIN.modal({
    title: id ? "Hariri Swali" : "Ongeza Swali",
    body,
    actions: [
      { label: "Ghairi", class: "btn btn-ghost", onClick: (c) => c() },
      { label: "Hifadhi", class: "btn btn-gold", onClick: async (close) => {
          if (!q.value.trim() || !a.value.trim()) { ADMIN.toast("Jaza swali na jibu.", "warning"); return; }
          try {
            if (id) await updateDoc(doc(db, COLLECTIONS.FAQS, id), { question: q.value.trim(), answer: a.value.trim(), updatedAt: serverTimestamp() });
            else await addDoc(col(COLLECTIONS.FAQS), { question: q.value.trim(), answer: a.value.trim(), order: ALL.length, active: true, createdAt: serverTimestamp() });
            ADMIN.toast("Imehifadhiwa.", "success"); close(); load();
          } catch (err) { console.warn(err); ADMIN.toast("Imeshindikana.", "error"); }
        } }
    ]
  });
}

async function toggleActive(id) {
  const f = ALL.find((x) => x.id === id); if (!f) return;
  try { await updateDoc(doc(db, COLLECTIONS.FAQS, id), { active: f.active === false, updatedAt: serverTimestamp() }); ADMIN.toast("Imesasishwa.", "success"); load(); }
  catch (err) { console.warn(err); ADMIN.toast("Imeshindikana.", "error"); }
}

async function move(id, dir) {
  const i = ALL.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ALL.length) return;
  [ALL[i], ALL[j]] = [ALL[j], ALL[i]];
  render();
  try {
    const batch = writeBatch(db);
    ALL.forEach((f, idx) => batch.update(doc(db, COLLECTIONS.FAQS, f.id), { order: idx }));
    await batch.commit();
  } catch (err) { console.warn("[SAM] faq reorder:", err?.code || err); ADMIN.toast("Imeshindikana kupanga upya.", "error"); load(); }
}

function removeRow(id) {
  ADMIN.confirm({ title: "Futa swali?", message: "Kitendo hiki hakiwezi kutenduliwa.", confirmLabel: "Futa", danger: true, onConfirm: async () => {
    try { await deleteDoc(doc(db, COLLECTIONS.FAQS, id)); ALL = ALL.filter((x) => x.id !== id); render(); ADMIN.toast("Imefutwa.", "success"); }
    catch (err) { console.warn(err); ADMIN.toast("Imeshindikana kufuta.", "error"); }
  } });
}

ADMIN.onReady(() => {
  $("#f-add").addEventListener("click", () => openEditor(null));
  $("#f-tbody").addEventListener("click", (e) => {
    const ed = e.target.closest("[data-edit]"); if (ed) return openEditor(ed.dataset.edit);
    const tg = e.target.closest("[data-toggle]"); if (tg) return toggleActive(tg.dataset.toggle);
    const dl = e.target.closest("[data-del]"); if (dl) return removeRow(dl.dataset.del);
    const up = e.target.closest("[data-up]"); if (up) return move(up.dataset.up, -1);
    const dn = e.target.closest("[data-down]"); if (dn) return move(dn.dataset.down, 1);
  });
  load();
});
