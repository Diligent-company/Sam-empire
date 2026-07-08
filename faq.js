/* =============================================================================
   SAM EMPIRE — faq.js
   Renders the FAQ accordion from the Firestore `faqs` collection (ordered),
   with a curated Swahili fallback when none exist yet. Single-open accordion
   with measured panel heights.
   ============================================================================= */

import { $, $$, escapeHtml } from "/assets/js/utils.js";
import { db, COLLECTIONS, IS_CONFIGURED } from "/assets/js/firebase.js";
import { collection, query, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const FALLBACK = [
  { q: "Je, viwanja vyenu vina hati halali?", a: "Ndiyo. Kila kiwanja kina Title Deed iliyosajiliwa na kuidhinishwa na mamlaka husika za ardhi. Tunakuonyesha hati na nyaraka zote muhimu kabla ya wewe kufanya malipo yoyote." },
  { q: "Naweza kulipa kwa awamu?", a: "Ndiyo. Tunatoa mpango wa malipo kwa awamu unaonyumbulika. Unaanza na malipo ya awali (down payment), kisha unalipa kiasi kilichobaki kwa muda mliokubaliana, bila riba kubwa." },
  { q: "Je, nitaona kiwanja kabla ya kununua?", a: "Bila shaka. Tunapanga ziara ya bure eneo la kiwanja ambapo utaona mipaka halisi (beacons) na viwianishi vya GPS pamoja na mwakilishi wetu." },
  { q: "Mchakato wa uhamisho wa umiliki ukoje?", a: "Baada ya malipo kukamilika, tunasimamia uhamisho rasmi wa hati (transfer) hadi jina lako, ikihusisha taratibu zote za kisheria za ardhi katika ofisi za Ardhi." },
  { q: "Mnauza maeneo gani ya Kigamboni?", a: "Tunauza viwanja katika maeneo yote muhimu ya Kigamboni: Vijibweni, Kibada, Mwasonga, Kimbiji, Dege, Vikindu, Mwera, Cheka, Ungindoni, Puna, Mwembe Mdogo na maeneo ya karibu na Daraja la Nyerere." },
  { q: "Je, kuna gharama za ziada zaidi ya bei ya kiwanja?", a: "Tunakuwa wazi kuhusu gharama. Mbali na bei ya kiwanja, kunaweza kuwa na gharama za kisheria za uhamisho wa hati. Tutakueleza gharama zote mapema kabla ya muamala." },
  { q: "Je, ninaweza kumiliki kiwanja nikiwa nje ya nchi?", a: "Ndiyo, tunaweza kukusaidia kukamilisha mchakato hata ukiwa nje ya nchi kupitia mawasiliano ya mtandaoni, malipo salama, na uwakilishi wa kisheria unaoaminika." },
  { q: "Muda gani huchukua kupata hati baada ya malipo?", a: "Muda hutofautiana kulingana na taratibu za ofisi za Ardhi, lakini tunafanya kila tunaloweza kuharakisha mchakato na tunakupa taarifa za hatua kwa hatua." },
  { q: "Je, viwanja vinafaa kwa ujenzi wa nyumba au biashara?", a: "Tunauza viwanja vya makazi, biashara, kilimo na maeneo ya pwani. Kila kiwanja kinaonyesha matumizi yaliyokusudiwa (land use), na tunakushauri kulingana na mahitaji yako." },
  { q: "Nawezaje kuanza?", a: "Ni rahisi! Tazama viwanja kwenye tovuti yetu, kisha bonyeza 'Panga Ziara' au tuwasiliane kwa WhatsApp/simu. Tutakusindikiza hatua kwa hatua hadi umiliki kamili." }
];

function render(items) {
  const acc = $("#faq-list");
  acc.innerHTML = items.map((f, i) => `
    <div class="accordion__item${i === 0 ? " is-open" : ""}">
      <button class="accordion__head" aria-expanded="${i === 0 ? "true" : "false"}" type="button">
        <span>${escapeHtml(f.q)}</span>
        <span class="accordion__icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span>
      </button>
      <div class="accordion__panel"><div class="accordion__panel-inner">${escapeHtml(f.a)}</div></div>
    </div>`).join("");
  wire(acc);
}

function wire(root) {
  const setOpen = (item, open) => {
    const panel = $(".accordion__panel", item), head = $(".accordion__head", item);
    item.classList.toggle("is-open", open);
    head && head.setAttribute("aria-expanded", String(open));
    if (panel) panel.style.maxHeight = open ? panel.scrollHeight + "px" : "0px";
  };
  $$(".accordion__item", root).forEach((item) => {
    setOpen(item, item.classList.contains("is-open"));
    $(".accordion__head", item).addEventListener("click", () => {
      const willOpen = !item.classList.contains("is-open");
      $$(".accordion__item", root).forEach((sib) => { if (sib !== item) setOpen(sib, false); });
      setOpen(item, willOpen);
    });
  });
  window.addEventListener("resize", () => {
    const open = $(".accordion__item.is-open", root);
    if (open) { const p = $(".accordion__panel", open); if (p) p.style.maxHeight = p.scrollHeight + "px"; }
  });
}

async function boot() {
  let items = FALLBACK;
  if (IS_CONFIGURED) {
    try {
      const snap = await getDocs(query(collection(db, COLLECTIONS.FAQS), orderBy("order", "asc")));
      const rows = snap.docs.map((d) => d.data()).filter((d) => d.active !== false).map((d) => ({ q: d.question || d.q, a: d.answer || d.a })).filter((x) => x.q && x.a);
      if (rows.length) items = rows;
    } catch (err) { console.warn("[SAM] faqs:", err?.code || err); }
  }
  render(items);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();
