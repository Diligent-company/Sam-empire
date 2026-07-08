/* =============================================================================
   SAM EMPIRE — admin-auth.js
   Admin login controller. Signs in with email/password, then verifies the user
   is an active admin (/admins/{uid}.active === true). Non-admins are signed out
   with a clear message. Handles ?denied / ?config / ?err / ?next query hints.
   ============================================================================= */

import { auth, db, COLLECTIONS, IS_CONFIGURED, onAuth } from "/assets/js/firebase.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { $, getParam, friendlyError, isEmail } from "/assets/js/utils.js";

const toast = (m, t) => window.SAM && window.SAM.toast && window.SAM.toast(m, t);
const nextUrl = () => getParam("next") || "/admin/index.html";

function showNotice(msg) { const n = $("#notice"); if (n) { n.textContent = msg; n.hidden = false; } }

async function isActiveAdmin(uid) {
  try {
    const snap = await getDoc(doc(db, COLLECTIONS.ADMINS, uid));
    return snap.exists() && snap.data().active === true;
  } catch (err) { console.warn("[SAM] admin check:", err?.code || err); return false; }
}

async function doLogin() {
  const email = $("#ad-email"), pass = $("#ad-pass"), btn = $("#ad-submit");
  if (!isEmail(email.value) || !pass.value) { toast("Weka barua pepe na nenosiri sahihi.", "warning"); return; }
  btn.setAttribute("aria-disabled", "true");
  const label = btn.innerHTML; btn.innerHTML = '<span class="spinner" style="width:18px;height:18px"></span> Inaingia…';
  try {
    const cred = await signInWithEmailAndPassword(auth, email.value.trim(), pass.value);
    if (await isActiveAdmin(cred.user.uid)) {
      toast("Karibu, msimamizi!", "success");
      location.replace(nextUrl());
    } else {
      await signOut(auth);
      btn.removeAttribute("aria-disabled"); btn.innerHTML = label;
      showNotice("Akaunti hii haina ruhusa ya usimamizi.");
      toast("Huna ruhusa ya kuingia hapa.", "error");
    }
  } catch (err) {
    btn.removeAttribute("aria-disabled"); btn.innerHTML = label;
    toast(friendlyError(err), "error");
  }
}

function boot() {
  if (getParam("denied")) showNotice("Akaunti yako haina ruhusa ya usimamizi.");
  if (getParam("err")) showNotice("Hitilafu imetokea. Jaribu kuingia tena.");
  if (getParam("config") || !IS_CONFIGURED) {
    showNotice("Firebase bado haijasanidiwa. Weka usanidi wa Firebase ili kutumia sehemu ya admin.");
    const f = $("#login-form"); if (f) f.querySelectorAll("input,button").forEach((el) => el.setAttribute("disabled", "true"));
    return;
  }

  $("#ad-submit")?.addEventListener("click", doLogin);
  $("#ad-pass")?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); doLogin(); } });
  $("#ad-email")?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); $("#ad-pass").focus(); } });
  $("#signout-other")?.addEventListener("click", async () => { try { await signOut(auth); } catch {} location.reload(); });

  // If already signed in: admins go straight in; non-admins are prompted to sign out.
  onAuth(async (user) => {
    if (!user) return;
    if (await isActiveAdmin(user.uid)) { location.replace(nextUrl()); }
    else { $("#login-form").hidden = true; $("#signed-in-other").hidden = false; }
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();
