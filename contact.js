/* =============================================================================
   SAM EMPIRE — contact.js
   Contact page: validates the enquiry form and writes it to the `messages`
   collection (rules-compliant inbound keys only). Falls back to a pre-filled
   WhatsApp message when Firebase isn't configured yet, and upgrades the office
   map when a Maps key is present.
   ============================================================================= */

import { $, isPhoneTz, normalizePhoneTz, isEmail, whatsappLink, SAM_BRAND } from "/assets/js/utils.js";
import { col, serverTimestamp, COLLECTIONS, IS_CONFIGURED } from "/assets/js/firebase.js";
import { addDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { trackLead } from "/assets/js/analytics.js";

function setErr(input, on) { input.closest(".field")?.classList.toggle("is-error", on); }

async function submit() {
  const name = $("#c-name"), phone = $("#c-phone"), email = $("#c-email"), subject = $("#c-subject"), message = $("#c-message");
  const btn = $("#c-submit");

  let ok = true;
  const nm = name.value.trim();
  if (!nm || nm.length > 120) { setErr(name, true); ok = false; } else setErr(name, false);
  if (!isPhoneTz(phone.value)) { setErr(phone, true); ok = false; } else setErr(phone, false);
  if (email.value && !isEmail(email.value)) { setErr(email, true); ok = false; } else setErr(email, false);
  const msg = message.value.trim();
  if (!msg) { setErr(message, true); ok = false; } else setErr(message, false);

  const toast = window.SAM && window.SAM.toast;
  if (!ok) { toast && toast("Tafadhali jaza taarifa zinazohitajika.", "warning"); return; }

  const fullMessage = `[${subject.value}] ${msg}`.slice(0, 5000);
  const phoneNorm = normalizePhoneTz(phone.value);

  if (!IS_CONFIGURED) {
    const lines = [`*Ujumbe kutoka tovuti* — SAM EMPIRE`, `Mada: ${subject.value}`, `Jina: ${nm}`, `Simu: ${phoneNorm}`, email.value ? `Barua pepe: ${email.value}` : "", `Ujumbe: ${msg}`].filter(Boolean).join("\n");
    window.open(whatsappLink(lines), "_blank", "noopener");
    toast && toast("Tunakupeleka WhatsApp kukamilisha ujumbe.", "info");
    return;
  }

  btn.setAttribute("aria-disabled", "true");
  btn.innerHTML = '<span class="spinner" style="width:18px;height:18px"></span> Inatuma…';
  try {
    await addDoc(col(COLLECTIONS.MESSAGES), {
      name: nm, phone: phoneNorm, email: email.value.trim() || "",
      message: fullMessage, source: "contact", status: "new",
      createdAt: serverTimestamp(), locale: SAM_BRAND.locale
    });
    trackLead("contact");
    ["#c-name", "#c-phone", "#c-email", "#c-message"].forEach((s) => { const e = $(s); if (e) e.value = ""; });
    toast && toast("Ujumbe wako umepokelewa! Tutawasiliana nawe hivi karibuni.", "success");
  } catch (err) {
    console.warn("[SAM] contact submit:", err?.code || err);
    toast && toast("Samahani, imeshindikana kutuma. Jaribu tena au tumia WhatsApp.", "error");
  } finally {
    btn.removeAttribute("aria-disabled");
    btn.innerHTML = 'Tuma Ujumbe <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
}

function initMap() {
  const key = (typeof window !== "undefined" && window.SAM_MAPS_KEY) || "";
  const mount = $("#contact-map");
  if (!key || !mount) return;
  window.__samContactMap = function () {
    try {
      const center = SAM_BRAND.mapCenter || { lat: -6.85, lng: 39.32 };
      const map = new google.maps.Map(mount, {
        center, zoom: 13, mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
        styles: [
          { elementType: "geometry", stylers: [{ color: "#0b1a38" }] },
          { elementType: "labels.text.fill", stylers: [{ color: "#cbd5e8" }] },
          { featureType: "water", stylers: [{ color: "#06294f" }] }
        ]
      });
      new google.maps.Marker({ position: center, map, title: "SAM EMPIRE — Kigamboni",
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: "#D4AF37", fillOpacity: 1, strokeColor: "#081F4D", strokeWeight: 2 } });
      const fb = $("#contact-map-fallback"); if (fb) fb.style.display = "none";
    } catch (e) { console.warn("[SAM] contact map:", e); }
  };
  const s = document.createElement("script");
  s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=__samContactMap&loading=async`;
  s.async = true; s.onerror = () => console.warn("[SAM] Maps failed; keeping fallback.");
  document.head.appendChild(s);
}

function boot() {
  $("#c-submit")?.addEventListener("click", submit);
  $("#c-name")?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); $("#c-phone").focus(); } });
  $("#c-phone")?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } });
  initMap();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();
