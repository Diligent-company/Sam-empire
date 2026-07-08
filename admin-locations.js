/* =============================================================================
   SAM EMPIRE — admin-locations.js
   The 12 Kigamboni areas are a fixed list (KIGAMBONI_LOCATIONS in catalog.js),
   so this page doesn't create/delete rows — it lets an admin author a richer
   tagline/intro/highlights for each area, saved to locations/{slug}. The public
   /location/{slug} page (locations.js) reads this doc and layers it over its
   built-in Swahili baseline, falling back gracefully if a field is left blank.
   ============================================================================= */

import { ADMIN } from "/assets/js/admin-core.js";
import { db, COLLECTIONS, serverTimestamp } from "/assets/js/firebase.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { KIGAMBONI_LOCATIONS } from "/assets/js/catalog.js";
import { $, el, escapeHtml } from "/assets/js/utils.js";

const OVERRIDES = {};

async function loadAll() {
  await Promise.all(KIGAMBONI_LOCATIONS.map(async (l) => {
    try {
      const snap = await getDoc(doc(db, COLLECTIONS.LOCATIONS, l.slug));
      OVERRIDES[l.slug] = snap.exists() ? snap.data() : {};
    } catch (err) { console.warn("[SAM] location load:", l.slug, err?.code || err); OVERRIDES[l.slug] = {}; }
  }));
  render();
}

function render() {
  $("#loc-tbody").innerHTML = KIGAMBONI_LOCATIONS.map((l) => `
    <tr>
      <td class="fw-bold">${escapeHtml(l.name)}</td>
      <td class="mono text-xs">${escapeHtml(l.code)}</td>
      <td class="text-sm text-muted">${escapeHtml(OVERRIDES[l.slug]?.tagline || "— (msingi)")}</td>
      <td><button class="abtn-icon" data-edit="${l.slug}" title="Hariri"><svg viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M4 20h4L20 8l-4-4L4 16v4z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg></button></td>
    </tr>`).join("");
}

function openEditor(slug) {
  const l = KIGAMBONI_LOCATIONS.find((x) => x.slug === slug);
  const d = OVERRIDES[slug] || {};
  const tagline = el("input", { class: "input", value: d.tagline || "", placeholder: "Mfano: Lango la Kigamboni" });
  const intro = el("textarea", { class: "textarea", rows: "5", placeholder: "Maelezo marefu ya eneo…", text: d.intro || "" });
  const highlights = el("textarea", { class: "textarea", rows: "4", placeholder: "Mstari mmoja kwa kila kipengele", text: (d.highlights || []).join("\n") });

  const body = el("div", { class: "flex flex-col gap-4" });
  const f1 = el("div", { class: "field" }); f1.append(el("label", { class: "label", text: "Kauli Mbiu (tagline)" }), tagline);
  const f2 = el("div", { class: "field" }); f2.append(el("label", { class: "label", text: "Utangulizi (intro)" }), intro);
  const f3 = el("div", { class: "field" }); f3.append(el("label", { class: "label", text: "Vipengele Muhimu (mstari kwa mstari)" }), highlights);
  body.append(f1, f2, f3);

  ADMIN.modal({
    title: `Hariri: ${l.name}`,
    body,
    actions: [
      { label: "Ghairi", class: "btn btn-ghost", onClick: (c) => c() },
      { label: "Hifadhi", class: "btn btn-gold", onClick: async (close) => {
          const payload = {
            tagline: tagline.value.trim(), intro: intro.value.trim(),
            highlights: highlights.value.split("\n").map((s) => s.trim()).filter(Boolean),
            updatedAt: serverTimestamp()
          };
          try {
            await setDoc(doc(db, COLLECTIONS.LOCATIONS, slug), payload, { merge: true });
            OVERRIDES[slug] = payload;
            ADMIN.toast("Eneo limehifadhiwa.", "success"); close(); render();
          } catch (err) { console.warn(err); ADMIN.toast("Imeshindikana kuhifadhi.", "error"); }
        } }
    ]
  });
}

ADMIN.onReady(() => {
  $("#loc-tbody").addEventListener("click", (e) => { const b = e.target.closest("[data-edit]"); if (b) openEditor(b.dataset.edit); });
  loadAll();
});
