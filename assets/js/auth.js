/* =============================================================================
   SAM EMPIRE — auth.js
   Shared controller for login.html and register.html. Wires Firebase Auth
   (email/password + Google), password reset, and bootstraps the customer's
   users/{uid} profile document. Redirects to the account area (or ?next=) once
   authenticated. Detects which form is present, so one module serves both pages.
   ============================================================================= */

import { $, getParam, friendlyError, isEmail, isPhoneTz, normalizePhoneTz, SAM_BRAND } from "/assets/js/utils.js";
import { auth, db, COLLECTIONS, IS_CONFIGURED, serverTimestamp, onAuth } from "/assets/js/firebase.js";
import {
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  GoogleAuthProvider, signInWithPopup, sendPasswordResetEmail, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const toast = (m, t) => window.SAM && window.SAM.toast && window.SAM.toast(m, t);
const nextUrl = () => getParam("next") || "/account.html";

function busy(btn, on, label) {
  if (!btn) return;
  if (on) { btn.dataset._label = btn.innerHTML; btn.setAttribute("aria-disabled", "true"); btn.innerHTML = `<span class="spinner" style="width:18px;height:18px"></span> ${label || "Inasubiri…"}`; }
  else { btn.removeAttribute("aria-disabled"); if (btn.dataset._label) btn.innerHTML = btn.dataset._label; }
}

function setErr(input, on) { input && input.closest(".field")?.classList.toggle("is-error", on); }

async function ensureUserDoc(user, extra = {}) {
  try {
    const ref = doc(db, COLLECTIONS.USERS, user.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        displayName: user.displayName || extra.name || "",
        email: user.email || "",
        phone: extra.phone || "",
        role: "customer",
        createdAt: serverTimestamp()
      });
    } else if (extra.phone) {
      await setDoc(ref, { phone: extra.phone }, { merge: true });
    }
  } catch (err) { console.warn("[SAM] ensureUserDoc:", err?.code || err); }
}

/* ---- Handlers ----------------------------------------------------------- */
async function doLogin() {
  const email = $("#a-email"), pass = $("#a-password"), btn = $("#a-submit");
  let ok = true;
  if (!isEmail(email.value)) { setErr(email, true); ok = false; } else setErr(email, false);
  if (!pass.value || pass.value.length < 6) { setErr(pass, true); ok = false; } else setErr(pass, false);
  if (!ok) { toast("Tafadhali jaza barua pepe na nenosiri sahihi.", "warning"); return; }
  busy(btn, true, "Inaingia…");
  try {
    await signInWithEmailAndPassword(auth, email.value.trim(), pass.value);
    toast("Karibu tena!", "success");
    // onAuth redirect will take over.
  } catch (err) {
    busy(btn, false);
    toast(friendlyError(err), "error");
  }
}

async function doRegister() {
  const name = $("#a-name"), email = $("#a-email"), phone = $("#a-phone"), pass = $("#a-password"), btn = $("#a-submit");
  let ok = true;
  if (!name.value.trim() || name.value.trim().length > 120) { setErr(name, true); ok = false; } else setErr(name, false);
  if (!isEmail(email.value)) { setErr(email, true); ok = false; } else setErr(email, false);
  if (phone.value && !isPhoneTz(phone.value)) { setErr(phone, true); ok = false; } else setErr(phone, false);
  if (!pass.value || pass.value.length < 6) { setErr(pass, true); ok = false; } else setErr(pass, false);
  if (!ok) { toast("Tafadhali kamilisha taarifa zote sahihi (nenosiri herufi 6+).", "warning"); return; }
  busy(btn, true, "Inasajili…");
  try {
    const cred = await createUserWithEmailAndPassword(auth, email.value.trim(), pass.value);
    const display = name.value.trim();
    try { await updateProfile(cred.user, { displayName: display }); } catch {}
    await ensureUserDoc(cred.user, { name: display, phone: phone.value ? normalizePhoneTz(phone.value) : "" });
    toast("Akaunti imeundwa! Karibu SAM EMPIRE.", "success");
  } catch (err) {
    busy(btn, false);
    toast(friendlyError(err), "error");
  }
}

async function doGoogle() {
  const btn = $("#a-google");
  busy(btn, true, "Inaunganisha…");
  try {
    const cred = await signInWithPopup(auth, new GoogleAuthProvider());
    await ensureUserDoc(cred.user);
    toast("Umeingia kwa Google!", "success");
  } catch (err) {
    busy(btn, false);
    if (err?.code !== "auth/popup-closed-by-user") toast(friendlyError(err), "error");
  }
}

function doReset() {
  if (!window.SAM || !window.SAM.openModal) return;
  const email = document.createElement("input");
  email.className = "input"; email.type = "email"; email.placeholder = "barua@pepe.com"; email.autocomplete = "email";
  const wrap = document.createElement("div");
  wrap.className = "field";
  wrap.innerHTML = `<label class="label">Barua pepe ya akaunti</label>`;
  wrap.append(email);
  const body = document.createElement("div");
  body.append(
    Object.assign(document.createElement("p"), { className: "text-sm text-muted", textContent: "Tutakutumia kiungo cha kuweka upya nenosiri lako." }),
    wrap
  );
  window.SAM.openModal({
    title: "Umesahau Nenosiri?",
    body,
    actions: [
      { label: "Ghairi", class: "btn btn-ghost", onClick: (c) => c() },
      { label: "Tuma Kiungo", class: "btn btn-gold", onClick: async (close) => {
          if (!isEmail(email.value)) { toast("Weka barua pepe sahihi.", "warning"); return; }
          try { await sendPasswordResetEmail(auth, email.value.trim()); close(); toast("Kiungo kimetumwa! Angalia barua pepe yako.", "success"); }
          catch (err) { toast(friendlyError(err), "error"); }
        } }
    ]
  });
}

/* ---- Boot --------------------------------------------------------------- */
function boot() {
  const isRegister = !!$("#a-name");

  if (!IS_CONFIGURED) {
    const note = $("#auth-notice");
    if (note) note.hidden = false;
  }

  // Already signed in (or just authenticated) → leave the auth page.
  if (IS_CONFIGURED) onAuth((user) => { if (user) location.replace(nextUrl()); });

  $("#a-submit")?.addEventListener("click", isRegister ? doRegister : doLogin);
  $("#a-google")?.addEventListener("click", doGoogle);
  $("#a-reset")?.addEventListener("click", (e) => { e.preventDefault(); doReset(); });

  // Enter submits.
  ["#a-name", "#a-email", "#a-phone", "#a-password"].forEach((sel) => {
    $(sel)?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); (isRegister ? doRegister : doLogin)(); } });
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();
