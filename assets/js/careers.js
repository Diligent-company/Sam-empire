/* =============================================================================
   SAM EMPIRE — careers.js
   Lists active job openings from the Firestore `careers` collection (per rules,
   only active==true are public) with a curated fallback. Applications are
   written to the `messages` collection (source: career), within validInbound()
   constraints, with a WhatsApp fallback when Firebase isn't configured.
   ============================================================================= */

import {
  $, $$, el, escapeHtml, observeOnce, isPhoneTz, normalizePhoneTz, isEmail, whatsappLink, SAM_BRAND
} from "/assets/js/utils.js";
import { col, serverTimestamp, COLLECTIONS, IS_CONFIGURED } from "/assets/js/firebase.js";
import { addDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { trackLead } from "/assets/js/analytics.js";

const CHECK = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M5 12l4 4L19 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const FALLBACK = [
  { title: "Wakala wa Mauzo (Sales Agent)", type: "Muda wote", location: "Kigamboni", summary: "Kuwahudumia wateja, kuonyesha viwanja, na kukamilisha mauzo kwa uadilifu.", requirements: ["Uzoefu wa mauzo ni nyongeza", "Ujuzi mzuri wa mawasiliano", "Anayejua eneo la Kigamboni", "Mwenye leseni ya udereva ni nyongeza"] },
  { title: "Afisa Masoko (Marketing Officer)", type: "Muda wote", location: "Dar es Salaam", summary: "Kusimamia masoko ya mtandaoni, mitandao ya kijamii na kampeni za matangazo.", requirements: ["Ujuzi wa mitandao ya kijamii", "Ubunifu wa maudhui", "Uzoefu wa digital marketing", "Elimu ya masoko ni nyongeza"] },
  { title: "Afisa Uhusiano wa Wateja", type: "Muda wote", location: "Kigamboni", summary: "Kujibu maswali ya wateja, kufuatilia maombi, na kuhakikisha huduma bora.", requirements: ["Subira na uchangamfu", "Ujuzi wa Kiswahili na Kiingereza", "Uwezo wa kutumia kompyuta", "Mtu wa kuaminika"] },
  { title: "Msaidizi wa Upimaji (Field Assistant)", type: "Mkataba", location: "Kigamboni", summary: "Kusaidia katika ziara za viwanja, upimaji wa mipaka na kumbukumbu za GPS.", requirements: ["Tayari kufanya kazi nje (field)", "Umakini katika kazi", "Uzoefu wa upimaji ni nyongeza", "Mwenye afya njema"] }
];

let JOBS = [];

function jobCard(job, i) {
  return `
  <article class="card job-card" data-reveal>
    <div class="card-body">
      <div class="job-meta">
        <span class="job-chip"><svg viewBox="0 0 24 24" width="14" height="14" fill="none"><rect x="3" y="7" width="18" height="13" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2" stroke="currentColor" stroke-width="1.6"/></svg>${escapeHtml(job.type)}</span>
        <span class="job-chip"><svg viewBox="0 0 24 24" width="14" height="14" fill="none"><path d="M12 21s-7-5.3-7-11a7 7 0 0114 0c0 5.7-7 11-7 11z" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="10" r="2" stroke="currentColor" stroke-width="1.6"/></svg>${escapeHtml(job.location)}</span>
      </div>
      <h3 class="h4 mt-3">${escapeHtml(job.title)}</h3>
      <p class="text-sm text-muted mt-2">${escapeHtml(job.summary)}</p>
      <ul class="req-list">
        ${(job.requirements || []).map((r) => `<li>${CHECK}<span>${escapeHtml(r)}</span></li>`).join("")}
      </ul>
      <button class="btn btn-gold btn-sm mt-5" data-apply="${i}" type="button">Omba Nafasi Hii</button>
    </div>
  </article>`;
}

function render() {
  const list = $("#careers-list");
  if (!JOBS.length) {
    list.innerHTML = `<div class="notice" style="grid-column:1/-1;border:1px dashed var(--border-strong);border-radius:var(--r-lg);padding:var(--s-8);text-align:center;color:var(--text-muted)">Hakuna nafasi za ajira kwa sasa. Tuma maombi ya jumla hapa chini.</div>`;
    return;
  }
  list.innerHTML = JOBS.map(jobCard).join("");
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const nodes = $$("[data-reveal]", list);
  if (reduce) nodes.forEach((n) => n.classList.add("is-visible"));
  else observeOnce(nodes, (n) => n.classList.add("is-visible"), { threshold: 0.08 });
}

function makeField(labelHtml, input, hint) {
  const wrap = el("div", { class: "field" });
  wrap.append(el("label", { class: "label", html: labelHtml }), input);
  if (hint) wrap.append(el("p", { class: "hint", text: hint }));
  input._field = wrap;
  return wrap;
}

function openApply(position) {
  const SAM = window.SAM;
  if (!SAM || !SAM.openModal) return;
  const name = el("input", { class: "input", type: "text", maxLength: "120", placeholder: "Jina lako kamili", autocomplete: "name" });
  const phone = el("input", { class: "input", type: "tel", placeholder: "07XX XXX XXX", autocomplete: "tel" });
  const email = el("input", { class: "input", type: "email", placeholder: "barua@pepe.com (hiari)", autocomplete: "email" });
  const note = el("textarea", { class: "textarea", maxLength: "2000", placeholder: "Eleza kwa ufupi uzoefu wako na kwa nini unafaa nafasi hii." });

  const body = el("div", { class: "flex flex-col gap-4" });
  body.append(
    el("p", { class: "text-sm text-muted", text: `Nafasi: ${position}` }),
    makeField('Jina <span class="req">*</span>', name),
    makeField('Simu <span class="req">*</span>', phone),
    makeField("Barua pepe", email),
    makeField("Maelezo", note)
  );

  const setErr = (i, on) => i._field && i._field.classList.toggle("is-error", on);

  const submit = async (close) => {
    let ok = true;
    const nm = name.value.trim();
    if (!nm || nm.length > 120) { setErr(name, true); ok = false; } else setErr(name, false);
    if (!isPhoneTz(phone.value)) { setErr(phone, true); ok = false; } else setErr(phone, false);
    if (email.value && !isEmail(email.value)) { setErr(email, true); ok = false; } else setErr(email, false);
    if (!ok) { SAM.toast && SAM.toast("Tafadhali jaza taarifa sahihi.", "warning"); return; }

    const phoneNorm = normalizePhoneTz(phone.value);
    const message = `[Ajira: ${position}] ${note.value.trim()}`.slice(0, 5000);

    if (!IS_CONFIGURED) {
      const lines = [`*Maombi ya Ajira* — SAM EMPIRE`, `Nafasi: ${position}`, `Jina: ${nm}`, `Simu: ${phoneNorm}`, email.value ? `Barua pepe: ${email.value}` : "", note.value.trim() ? `Maelezo: ${note.value.trim()}` : ""].filter(Boolean).join("\n");
      window.open(whatsappLink(lines), "_blank", "noopener");
      close(); SAM.toast && SAM.toast("Tunakupeleka WhatsApp kukamilisha maombi.", "info");
      return;
    }
    try {
      await addDoc(col(COLLECTIONS.MESSAGES), {
        name: nm, phone: phoneNorm, email: email.value.trim() || "",
        message, source: "career", status: "new",
        createdAt: serverTimestamp(), locale: SAM_BRAND.locale
      });
      trackLead("career");
      close(); SAM.toast && SAM.toast("Maombi yako yamepokelewa! Tutawasiliana nawe.", "success");
    } catch (err) {
      console.warn("[SAM] career apply:", err?.code || err);
      SAM.toast && SAM.toast("Samahani, imeshindikana. Jaribu tena au tumia WhatsApp.", "error");
    }
  };

  [name, phone, email].forEach((i) => i.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); submit(window.SAM.closeModal); } }));

  SAM.openModal({
    title: "Omba Nafasi",
    body,
    actions: [
      { label: "Ghairi", class: "btn btn-ghost", onClick: (c) => c() },
      { label: "Tuma Maombi", class: "btn btn-gold", onClick: (c) => submit(c) }
    ]
  });
  setTimeout(() => name.focus(), 60);
}

function wire() {
  $("#careers-list").addEventListener("click", (e) => {
    const b = e.target.closest("[data-apply]");
    if (b) openApply(JOBS[parseInt(b.dataset.apply, 10)].title);
  });
  $("#general-apply")?.addEventListener("click", () => openApply("Maombi ya Jumla"));
}

async function boot() {
  let rows = FALLBACK;
  if (IS_CONFIGURED) {
    try {
      const { collection, query, where, orderBy, getDocs } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
      const { db } = await import("/assets/js/firebase.js");
      const snap = await getDocs(query(collection(db, COLLECTIONS.CAREERS), where("active", "==", true), orderBy("createdAt", "desc")));
      const data = snap.docs.map((d) => d.data());
      if (data.length) rows = data;
    } catch (err) { console.warn("[SAM] careers:", err?.code || err); }
  }
  JOBS = rows;
  render();
  wire();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();
