/* =============================================================================
   SAM EMPIRE — testimonials.js
   Renders approved customer testimonials from Firestore (per firestore.rules,
   only approved reviews are public), with a curated Swahili fallback.
   ============================================================================= */

import { $, escapeHtml, truncate, observeOnce } from "/assets/js/utils.js";
import { db, COLLECTIONS, IS_CONFIGURED } from "/assets/js/firebase.js";
import { collection, query, where, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const FALLBACK = [
  { name: "Juma Athumani", role: "Mfanyabiashara, Dar es Salaam", rating: 5, text: "Nilinunua kiwanja Kibada kwa njia rahisi kabisa. Hati nilipata ndani ya wiki mbili, na timu ilikuwa wazi kuhusu kila kitu. Nawapendekeza sana." },
  { name: "Neema Mushi", role: "Mwalimu, Kigamboni", rating: 5, text: "Mpango wa malipo kwa awamu ulinisaidia kumiliki kiwanja bila msongo. Walinionyesha mipaka na GPS papo hapo eneo. Huduma ya kuaminika kweli." },
  { name: "Salum Rashid", role: "Mwekezaji", rating: 5, text: "Niliwekeza viwanja viwili Mwasonga. Thamani imepanda ndani ya mwaka mmoja. SAM EMPIRE ni waaminifu na wataalamu wa kweli." },
  { name: "Grace Mwakalinga", role: "Mhasibu, Dar es Salaam", rating: 5, text: "Niliogopa udanganyifu wa ardhi, lakini SAM EMPIRE walinipa uwazi kamili — hati, ramani na ushauri. Sasa nina kiwanja changu Vijibweni." },
  { name: "Hamis Juma", role: "Mkulima, Mwera", rating: 4, text: "Nilinunua shamba Mwera kwa kilimo. Ardhi ni nzuri na mchakato ulikuwa wazi. Asante kwa huduma nzuri." },
  { name: "Asha Mbwana", role: "Mjasiriamali", rating: 5, text: "Huduma kwa mteja ni ya hali ya juu. Walinijibu maswali yangu yote kwa subira hadi nikaelewa kila kitu kabla ya kununua." }
];

function render(items) {
  const grid = $("#testimonials-grid");
  grid.innerHTML = items.map((t) => {
    const rating = Math.max(0, Math.min(5, t.rating || 5));
    const stars = "★".repeat(rating) + "☆".repeat(5 - rating);
    const initial = escapeHtml((t.name || "S").trim().charAt(0).toUpperCase());
    return `
      <div class="card" data-reveal>
        <div class="card-body quote">
          <div class="stars" aria-label="Nyota ${rating} kati ya 5">${stars}</div>
          <span class="quote__mark" aria-hidden="true">&ldquo;</span>
          <p class="quote__text">${escapeHtml(truncate(t.text || "", 260))}</p>
          <div class="quote__by">
            <span class="quote__avatar" aria-hidden="true">${initial}</span>
            <span><span class="quote__name">${escapeHtml(t.name || "Mteja")}</span><br/><span class="quote__role">${escapeHtml(t.role || "Mteja wa SAM EMPIRE")}</span></span>
          </div>
        </div>
      </div>`;
  }).join("");
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const nodes = Array.from(grid.querySelectorAll("[data-reveal]"));
  if (reduce) nodes.forEach((n) => n.classList.add("is-visible"));
  else observeOnce(nodes, (n) => n.classList.add("is-visible"), { threshold: 0.08 });
}

async function boot() {
  let items = FALLBACK;
  if (IS_CONFIGURED) {
    try {
      const snap = await getDocs(query(collection(db, COLLECTIONS.TESTIMONIALS), where("approved", "==", true), orderBy("createdAt", "desc")));
      const rows = snap.docs.map((d) => d.data());
      if (rows.length) items = rows;
    } catch (err) { console.warn("[SAM] testimonials:", err?.code || err); }
  }
  render(items);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();
