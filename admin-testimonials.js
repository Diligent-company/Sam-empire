/* =============================================================================
   SAM EMPIRE — admin-testimonials.js
   Manage customer testimonials: add on the customer's behalf (e.g. from a phone
   call or WhatsApp message), edit, approve/reject, delete. Only approved==true
   testimonials are publicly readable per firestore.rules, so this page is the
   moderation gate for what appears on /testimonials.html.
   ============================================================================= */

import { ADMIN } from "/assets/js/admin-core.js";
import { db, COLLECTIONS, col, serverTimestamp } from "/assets/js/firebase.js";
import { getDocs, query, orderBy, limit, doc, addDoc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { $, el, escapeHtml, truncate } from "/assets/js/utils.js";

let ALL = [];

async function load() {
  try {
    const snap = await getDocs(query(col(COLLECTIONS.TESTIMONIALS), orderBy("createdAt", "desc"), limit(500)));
    ALL = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) { console.warn("[SAM] testimonials:", err?.code || err); ALL = []; }
  render();
}

function render() {
  const st = $("#t-status").value;
  const rows = ALL.filter((t) => st === "approved" ? t.approved === true : st === "pending" ? t.approved !== true : true);
  const tb = $("#t-tbody");
  if (!rows.length) { tb.innerHTML = `<tr><td colspan="5" class="text-center text-muted" style="padding:var(--s-8)">Hakuna ushuhuda.</td></tr>`; return; }
  tb.innerHTML = rows.map((t) => `
    <tr>
      <td><div class="fw-bold">${escapeHtml(t.name || "—")}</div><div class="text-xs text-faint">${escapeHtml(t.role || "")}</div></td>
      <td class="mono">${"★".repeat(t.rating || 5)}</td>
      <td class="text-sm text-muted">${escapeHtml(truncate(t.text || "", 90))}</td>
      <td>${t.approved ? `<span class="pill pill-success">Imeidhinishwa</span>` : `<span class="pill pill-warn">Inasubiri</span>`}</td>
      <td><div class="atable__actions">
        <button class="abtn-icon" data-edit="${t.id}" title="Hariri"><svg viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M4 20h4L20 8l-4-4L4 16v4z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg></button>
        <button class="abtn-icon" data-approve="${t.id}" title="Idhinisha / Ondoa Idhini"><svg viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M5 12l4 4L19 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <button class="abtn-icon danger" data-del="${t.id}" title="Futa"><svg viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      </div></td>
    </tr>`).join("");
}

function openEditor(id) {
  const t = id ? ALL.find((x) => x.id === id) : null;
  const name = el("input", { class: "input", value: t?.name || "", placeholder: "Jina la mteja" });
  const role = el("input", { class: "input", value: t?.role || "", placeholder: "Mfano: Mfanyabiashara, Dar es Salaam" });
  const rating = el("select", { class: "select" });
  [5, 4, 3, 2, 1].forEach((n) => rating.append(el("option", { value: n, text: "★".repeat(n) + ` (${n})`, selected: (t?.rating || 5) === n })));
  const text = el("textarea", { class: "textarea", rows: "5", text: t?.text || "", placeholder: "Andika ushuhuda wa mteja…" });
  const approved = el("input", { type: "checkbox" }); approved.checked = !!t?.approved;

  const body = el("div", { class: "flex flex-col gap-4" });
  const f = (label, input) => { const w = el("div", { class: "field" }); w.append(el("label", { class: "label", text: label }), input); return w; };
  const approveField = el("label", { class: "check", style: "display:flex;align-items:center;gap:8px;font-weight:600;color:var(--text-muted)" });
  approveField.append(approved, document.createTextNode("Chapisha (approved) kwenye tovuti"));
  body.append(f("Jina", name), f("Wadhifa / Mahali", role), f("Nyota", rating), f("Maandishi", text), approveField);

  ADMIN.modal({
    title: id ? "Hariri Ushuhuda" : "Ongeza Ushuhuda",
    body,
    actions: [
      { label: "Ghairi", class: "btn btn-ghost", onClick: (c) => c() },
      { label: "Hifadhi", class: "btn btn-gold", onClick: async (close) => {
          if (!name.value.trim() || !text.value.trim()) { ADMIN.toast("Weka jina na maandishi.", "warning"); return; }
          const data = { name: name.value.trim(), role: role.value.trim(), rating: Number(rating.value), text: text.value.trim(), approved: approved.checked, updatedAt: serverTimestamp() };
          try {
            if (id) await updateDoc(doc(db, COLLECTIONS.TESTIMONIALS, id), data);
            else await addDoc(col(COLLECTIONS.TESTIMONIALS), { ...data, createdAt: serverTimestamp() });
            ADMIN.toast("Imehifadhiwa.", "success"); close(); load();
          } catch (err) { console.warn(err); ADMIN.toast("Imeshindikana.", "error"); }
        } }
    ]
  });
}

async function toggleApprove(id) {
  const t = ALL.find((x) => x.id === id); if (!t) return;
  try { await updateDoc(doc(db, COLLECTIONS.TESTIMONIALS, id), { approved: !t.approved, updatedAt: serverTimestamp() }); ADMIN.toast("Imesasishwa.", "success"); load(); }
  catch (err) { console.warn(err); ADMIN.toast("Imeshindikana.", "error"); }
}

function removeRow(id) {
  ADMIN.confirm({ title: "Futa ushuhuda?", message: "Kitendo hiki hakiwezi kutenduliwa.", confirmLabel: "Futa", danger: true, onConfirm: async () => {
    try { await deleteDoc(doc(db, COLLECTIONS.TESTIMONIALS, id)); ALL = ALL.filter((x) => x.id !== id); render(); ADMIN.toast("Imefutwa.", "success"); }
    catch (err) { console.warn(err); ADMIN.toast("Imeshindikana kufuta.", "error"); }
  } });
}

ADMIN.onReady(() => {
  $("#t-status").addEventListener("change", render);
  $("#t-add").addEventListener("click", () => openEditor(null));
  $("#t-tbody").addEventListener("click", (e) => {
    const ed = e.target.closest("[data-edit]"); if (ed) return openEditor(ed.dataset.edit);
    const ap = e.target.closest("[data-approve]"); if (ap) return toggleApprove(ap.dataset.approve);
    const dl = e.target.closest("[data-del]"); if (dl) return removeRow(dl.dataset.del);
  });
  load();
});
