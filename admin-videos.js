/* =============================================================================
   SAM EMPIRE — admin-videos.js
   Manage the video library: add/edit/delete entries pointing to a YouTube video
   (by ID or full URL — either works, since the public videos.js extracts the ID)
   or a direct file URL already uploaded elsewhere. No re-encoding is done here.
   ============================================================================= */

import { ADMIN } from "/assets/js/admin-core.js";
import { db, COLLECTIONS, col, serverTimestamp } from "/assets/js/firebase.js";
import { getDocs, query, orderBy, doc, addDoc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { $, el, escapeHtml } from "/assets/js/utils.js";

let ALL = [];

function extractYouTubeId(input) {
  if (!input) return "";
  const m = input.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : (/^[A-Za-z0-9_-]{6,}$/.test(input.trim()) ? input.trim() : "");
}

async function load() {
  try {
    const snap = await getDocs(query(col(COLLECTIONS.VIDEOS), orderBy("createdAt", "desc")));
    ALL = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) { console.warn("[SAM] videos:", err?.code || err); ALL = []; }
  render();
}

function render() {
  const tb = $("#v-tbody");
  if (!ALL.length) { tb.innerHTML = `<tr><td colspan="4" class="text-center text-muted" style="padding:var(--s-8)">Hakuna video bado.</td></tr>`; return; }
  tb.innerHTML = ALL.map((v) => `
    <tr>
      <td class="fw-bold">${escapeHtml(v.title || "—")}</td>
      <td class="text-sm text-muted">${escapeHtml(v.category || "—")}</td>
      <td class="text-xs mono">${v.youtubeId ? "YouTube · " + escapeHtml(v.youtubeId) : v.url ? "Faili" : "—"}</td>
      <td><div class="atable__actions">
        <button class="abtn-icon" data-edit="${v.id}" title="Hariri"><svg viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M4 20h4L20 8l-4-4L4 16v4z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg></button>
        <button class="abtn-icon danger" data-del="${v.id}" title="Futa"><svg viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      </div></td>
    </tr>`).join("");
}

function openEditor(id) {
  const v = id ? ALL.find((x) => x.id === id) : null;
  const title = el("input", { class: "input", value: v?.title || "" });
  const category = el("input", { class: "input", value: v?.category || "", placeholder: "Ziara, Mwongozo, Ushuhuda…" });
  const duration = el("input", { class: "input", value: v?.duration || "", placeholder: "Mfano: 2:45" });
  const source = el("input", { class: "input", value: v?.url || (v?.youtubeId ? `https://youtu.be/${v.youtubeId}` : ""), placeholder: "Kiungo cha YouTube au faili la video (.mp4)" });
  const body = el("div", { class: "flex flex-col gap-4" });
  const wrap = (label, input, hint) => { const w = el("div", { class: "field" }); w.append(el("label", { class: "label", text: label }), input); if (hint) w.append(el("p", { class: "hint", text: hint })); return w; };
  body.append(
    wrap("Kichwa", title), wrap("Kategoria", category), wrap("Muda (hiari)", duration),
    wrap("Chanzo cha Video", source, "Bandika kiungo cha YouTube (kitatambuliwa kiotomatiki) au kiungo cha moja kwa moja cha faili la video.")
  );
  ADMIN.modal({
    title: id ? "Hariri Video" : "Ongeza Video",
    body,
    actions: [
      { label: "Ghairi", class: "btn btn-ghost", onClick: (c) => c() },
      { label: "Hifadhi", class: "btn btn-gold", onClick: async (close) => {
          if (!title.value.trim() || !source.value.trim()) { ADMIN.toast("Jaza kichwa na chanzo cha video.", "warning"); return; }
          const yt = extractYouTubeId(source.value.trim());
          const data = {
            title: title.value.trim(), category: category.value.trim() || "Video", duration: duration.value.trim(),
            youtubeId: yt || null, url: yt ? "" : source.value.trim(),
            updatedAt: serverTimestamp()
          };
          try {
            if (id) await updateDoc(doc(db, COLLECTIONS.VIDEOS, id), data);
            else await addDoc(col(COLLECTIONS.VIDEOS), { ...data, createdAt: serverTimestamp() });
            ADMIN.toast("Imehifadhiwa.", "success"); close(); load();
          } catch (err) { console.warn(err); ADMIN.toast("Imeshindikana.", "error"); }
        } }
    ]
  });
}

function removeRow(id) {
  ADMIN.confirm({ title: "Futa video?", message: "Kitendo hiki hakiwezi kutenduliwa.", confirmLabel: "Futa", danger: true, onConfirm: async () => {
    try { await deleteDoc(doc(db, COLLECTIONS.VIDEOS, id)); ALL = ALL.filter((x) => x.id !== id); render(); ADMIN.toast("Imefutwa.", "success"); }
    catch (err) { console.warn(err); ADMIN.toast("Imeshindikana kufuta.", "error"); }
  } });
}

ADMIN.onReady(() => {
  $("#v-add").addEventListener("click", () => openEditor(null));
  $("#v-tbody").addEventListener("click", (e) => {
    const ed = e.target.closest("[data-edit]"); if (ed) return openEditor(ed.dataset.edit);
    const dl = e.target.closest("[data-del]"); if (dl) return removeRow(dl.dataset.del);
  });
  load();
});
