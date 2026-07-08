/* =============================================================================
   SAM EMPIRE — admin-careers.js
   Manage job openings shown on /careers.html. Only active==true jobs are
   publicly readable per firestore.rules, so the toggle here is the publish gate.
   ============================================================================= */

import { ADMIN } from "/assets/js/admin-core.js";
import { db, COLLECTIONS, col, serverTimestamp } from "/assets/js/firebase.js";
import { getDocs, query, orderBy, doc, addDoc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { $, el, escapeHtml } from "/assets/js/utils.js";

let ALL = [];

async function load() {
  try {
    const snap = await getDocs(query(col(COLLECTIONS.CAREERS), orderBy("createdAt", "desc")));
    ALL = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) { console.warn("[SAM] careers:", err?.code || err); ALL = []; }
  render();
}

function render() {
  const tb = $("#j-tbody");
  if (!ALL.length) { tb.innerHTML = `<tr><td colspan="5" class="text-center text-muted" style="padding:var(--s-8)">Hakuna nafasi bado.</td></tr>`; return; }
  tb.innerHTML = ALL.map((j) => `
    <tr>
      <td class="fw-bold">${escapeHtml(j.title || "—")}</td>
      <td class="text-sm text-muted">${escapeHtml(j.type || "—")}</td>
      <td class="text-sm text-muted">${escapeHtml(j.location || "—")}</td>
      <td>${j.active === false ? `<span class="pill pill-muted">Imefungwa</span>` : `<span class="pill pill-success">Wazi</span>`}</td>
      <td><div class="atable__actions">
        <button class="abtn-icon" data-edit="${j.id}" title="Hariri"><svg viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M4 20h4L20 8l-4-4L4 16v4z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg></button>
        <button class="abtn-icon" data-toggle="${j.id}" title="Fungua / Funga"><svg viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M12 3v12m0 0l4-4m-4 4l-4-4M5 21h14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <button class="abtn-icon danger" data-del="${j.id}" title="Futa"><svg viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      </div></td>
    </tr>`).join("");
}

function openEditor(id) {
  const j = id ? ALL.find((x) => x.id === id) : null;
  const title = el("input", { class: "input", value: j?.title || "" });
  const type = el("input", { class: "input", value: j?.type || "Muda wote" });
  const location = el("input", { class: "input", value: j?.location || "Kigamboni" });
  const summary = el("textarea", { class: "textarea", rows: "3", text: j?.summary || "" });
  const requirements = el("textarea", { class: "textarea", rows: "5", text: (j?.requirements || []).join("\n"), placeholder: "Mstari mmoja kwa kila sharti" });
  const body = el("div", { class: "flex flex-col gap-4" });
  const wrap = (label, input) => { const w = el("div", { class: "field" }); w.append(el("label", { class: "label", text: label }), input); return w; };
  body.append(wrap("Jina la Nafasi", title), wrap("Aina (Muda wote / Mkataba)", type), wrap("Eneo", location), wrap("Muhtasari", summary), wrap("Vigezo (mstari kwa mstari)", requirements));
  ADMIN.modal({
    title: id ? "Hariri Nafasi" : "Ongeza Nafasi",
    body,
    actions: [
      { label: "Ghairi", class: "btn btn-ghost", onClick: (c) => c() },
      { label: "Hifadhi", class: "btn btn-gold", onClick: async (close) => {
          if (!title.value.trim()) { ADMIN.toast("Weka jina la nafasi.", "warning"); return; }
          const data = {
            title: title.value.trim(), type: type.value.trim() || "Muda wote", location: location.value.trim() || "Kigamboni",
            summary: summary.value.trim(), requirements: requirements.value.split("\n").map((s) => s.trim()).filter(Boolean),
            updatedAt: serverTimestamp()
          };
          try {
            if (id) await updateDoc(doc(db, COLLECTIONS.CAREERS, id), data);
            else await addDoc(col(COLLECTIONS.CAREERS), { ...data, active: true, createdAt: serverTimestamp() });
            ADMIN.toast("Imehifadhiwa.", "success"); close(); load();
          } catch (err) { console.warn(err); ADMIN.toast("Imeshindikana.", "error"); }
        } }
    ]
  });
}

async function toggleActive(id) {
  const j = ALL.find((x) => x.id === id); if (!j) return;
  try { await updateDoc(doc(db, COLLECTIONS.CAREERS, id), { active: j.active === false, updatedAt: serverTimestamp() }); ADMIN.toast("Imesasishwa.", "success"); load(); }
  catch (err) { console.warn(err); ADMIN.toast("Imeshindikana.", "error"); }
}

function removeRow(id) {
  ADMIN.confirm({ title: "Futa nafasi?", message: "Kitendo hiki hakiwezi kutenduliwa.", confirmLabel: "Futa", danger: true, onConfirm: async () => {
    try { await deleteDoc(doc(db, COLLECTIONS.CAREERS, id)); ALL = ALL.filter((x) => x.id !== id); render(); ADMIN.toast("Imefutwa.", "success"); }
    catch (err) { console.warn(err); ADMIN.toast("Imeshindikana kufuta.", "error"); }
  } });
}

ADMIN.onReady(() => {
  $("#j-add").addEventListener("click", () => openEditor(null));
  $("#j-tbody").addEventListener("click", (e) => {
    const ed = e.target.closest("[data-edit]"); if (ed) return openEditor(ed.dataset.edit);
    const tg = e.target.closest("[data-toggle]"); if (tg) return toggleActive(tg.dataset.toggle);
    const dl = e.target.closest("[data-del]"); if (dl) return removeRow(dl.dataset.del);
  });
  load();
});
