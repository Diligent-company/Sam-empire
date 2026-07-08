/* =============================================================================
   SAM EMPIRE — admin-settings.js
   Edits the single settings/public document that script.js's live-settings
   binding reads on every public page (brand name/tagline, contact channels,
   socials, Maps API key). World-readable, admin-write per firestore.rules —
   this page additionally restricts the ability to SAVE to superadmins, since
   these values affect every page on the site.
   ============================================================================= */

import { ADMIN } from "/assets/js/admin-core.js";
import { db, COLLECTIONS, serverTimestamp } from "/assets/js/firebase.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { $ } from "/assets/js/utils.js";

const v = (id) => $("#" + id).value.trim();
const setV = (id, val) => { const e = $("#" + id); if (e) e.value = val || ""; };

async function load() {
  try {
    const snap = await getDoc(doc(db, COLLECTIONS.SETTINGS, "public"));
    const d = snap.exists() ? snap.data() : {};
    const b = d.brand || {}, s = d.socials || {}, m = d.maps || {};
    setV("st-name", b.name); setV("st-tagline", b.tagline); setV("st-phone", b.phone);
    setV("st-whatsapp", b.whatsapp); setV("st-email", b.email); setV("st-sales", b.salesEmail); setV("st-support", b.supportEmail);
    setV("st-city", b.city); setV("st-region", b.region);
    setV("so-facebook", s.facebook); setV("so-instagram", s.instagram); setV("so-youtube", s.youtube);
    setV("so-tiktok", s.tiktok); setV("so-x", s.x); setV("so-linkedin", s.linkedin); setV("so-telegram", s.telegram);
    setV("st-mapskey", m.apiKey);
  } catch (err) { console.warn("[SAM] settings load:", err?.code || err); }
}

async function save() {
  const data = {
    brand: {
      name: v("st-name"), tagline: v("st-tagline"), phone: v("st-phone"), whatsapp: v("st-whatsapp"),
      email: v("st-email"), salesEmail: v("st-sales"), supportEmail: v("st-support"), city: v("st-city"), region: v("st-region")
    },
    socials: {
      facebook: v("so-facebook"), instagram: v("so-instagram"), youtube: v("so-youtube"),
      tiktok: v("so-tiktok"), x: v("so-x"), linkedin: v("so-linkedin"), telegram: v("so-telegram")
    },
    maps: { apiKey: v("st-mapskey") },
    updatedAt: serverTimestamp()
  };
  const btn = $("#st-save"); btn.setAttribute("aria-disabled", "true");
  try {
    await setDoc(doc(db, COLLECTIONS.SETTINGS, "public"), data, { merge: true });
    ADMIN.toast("Mipangilio imehifadhiwa. Tovuti nzima itaonyesha mabadiliko haya.", "success");
  } catch (err) { console.warn(err); ADMIN.toast("Imeshindikana kuhifadhi. Hakikisha una ruhusa ya superadmin.", "error"); }
  finally { btn.removeAttribute("aria-disabled"); }
}

ADMIN.onReady(() => {
  if (!ADMIN.isSuper) {
    $("#not-super").hidden = false;
    $("#settings-form").hidden = true;
    return;
  }
  $("#st-save").addEventListener("click", save);
  load();
});
