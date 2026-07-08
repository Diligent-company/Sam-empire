/* =============================================================================
   SAM EMPIRE — account.js
   Customer dashboard. Guards on auth state, then loads the signed-in customer's
   favourites (synced two-way between the local wishlist and the Firestore
   `favorites` collection), saved searches, reservation requests, and profile.
   All reads/writes are owner-scoped per firestore.rules.
   ============================================================================= */

import { $, $$, escapeHtml, formatNumber, store } from "/assets/js/utils.js";
import { auth, db, COLLECTIONS, serverTimestamp, onAuth } from "/assets/js/firebase.js";
import {
  collection, query, where, orderBy, getDocs, doc, getDoc, setDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { signOut, updateProfile } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { fetchAllPublished, propertyCardHTML } from "/assets/js/catalog.js";

const toast = (m, t) => window.SAM && window.SAM.toast && window.SAM.toast(m, t);
let USER = null;
let CATALOG = [];
let started = false;

/* ---- Section navigation ------------------------------------------------- */
function wireNav() {
  $$(".dash-nav button[data-sec]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const sec = btn.dataset.sec;
      $$(".dash-nav button[data-sec]").forEach((b) => b.classList.toggle("is-active", b === btn));
      $$(".dash-sec").forEach((s) => s.classList.toggle("is-active", s.id === "sec-" + sec));
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
  $("#dash-signout")?.addEventListener("click", async () => {
    try { await signOut(auth); } catch {}
    location.href = "/";
  });
}

/* ---- Favourites (two-way sync) ------------------------------------------ */
async function loadFavorites() {
  const uid = USER.uid;
  let cloudPids = [];
  try {
    const snap = await getDocs(query(collection(db, COLLECTIONS.FAVORITES), where("userId", "==", uid)));
    cloudPids = snap.docs.map((d) => d.data().propertyId).filter(Boolean);
  } catch (err) { console.warn("[SAM] favorites read:", err?.code || err); }

  const localIds = store.get("wishlist", []);
  // Upload any local favourites missing from the cloud.
  const toUpload = localIds.filter((id) => !cloudPids.includes(id));
  await Promise.all(toUpload.map((pid) => syncFav(pid, true)));

  const merged = Array.from(new Set([...cloudPids, ...localIds]));
  store.set("wishlist", merged);
  renderFavorites();
  window.SAM && window.SAM.refreshWishUI && window.SAM.refreshWishUI();
}

async function syncFav(pid, added) {
  const uid = USER.uid;
  const ref = doc(db, COLLECTIONS.FAVORITES, `${uid}_${pid}`);
  try {
    if (added) await setDoc(ref, { userId: uid, propertyId: pid, createdAt: serverTimestamp() });
    else await deleteDoc(ref);
  } catch (err) { console.warn("[SAM] favorites write:", err?.code || err); }
}

function renderFavorites() {
  const ids = store.get("wishlist", []);
  const items = ids.map((id) => CATALOG.find((p) => p.id === id)).filter(Boolean);
  const grid = $("#fav-grid"), empty = $("#fav-empty");
  $("#stat-fav").textContent = formatNumber(items.length);
  if (!items.length) { grid.innerHTML = ""; empty.hidden = false; return; }
  empty.hidden = true;
  grid.innerHTML = items.map(propertyCardHTML).join("");
  $$("[data-reveal]", grid).forEach((n) => n.classList.add("is-visible"));
  window.SAM && window.SAM.refreshWishUI && window.SAM.refreshWishUI();
}

/* ---- Saved searches ----------------------------------------------------- */
function searchQueryString(params = {}) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v) sp.set(k, v); });
  const s = sp.toString();
  return s ? "?" + s : "";
}

async function loadSearches() {
  const list = $("#search-list"), empty = $("#search-empty");
  let rows = [];
  try {
    const snap = await getDocs(query(collection(db, COLLECTIONS.SAVED_SEARCHES), where("userId", "==", USER.uid), orderBy("createdAt", "desc")));
    rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) { console.warn("[SAM] searches:", err?.code || err); }

  $("#stat-search").textContent = formatNumber(rows.length);
  if (!rows.length) { list.innerHTML = ""; empty.hidden = false; return; }
  empty.hidden = true;
  list.innerHTML = rows.map((r) => {
    const label = r.name || r.label || "Utafutaji";
    const summary = [r.params?.location, r.params?.type, r.params?.price && "bei", r.params?.size && "ukubwa"].filter(Boolean).join(" · ") || "Vigezo vyote";
    return `
      <div class="list-row">
        <div><strong>${escapeHtml(label)}</strong><br/><span class="text-xs text-faint">${escapeHtml(summary)}</span></div>
        <div class="flex gap-2">
          <a class="btn btn-outline-gold btn-sm" href="/properties.html${escapeHtml(searchQueryString(r.params || {}))}">Tumia</a>
          <button class="btn btn-ghost btn-sm" data-del-search="${escapeHtml(r.id)}" type="button" style="color:var(--c-danger)">Futa</button>
        </div>
      </div>`;
  }).join("");
}

async function deleteSearch(id) {
  try { await deleteDoc(doc(db, COLLECTIONS.SAVED_SEARCHES, id)); toast("Utafutaji umefutwa.", "success"); loadSearches(); }
  catch (err) { console.warn("[SAM] del search:", err?.code || err); toast("Imeshindikana kufuta.", "error"); }
}

/* ---- Requests (reservations owned by the user) -------------------------- */
async function loadRequests() {
  const list = $("#req-list"), empty = $("#req-empty");
  let rows = [];
  try {
    const snap = await getDocs(query(collection(db, COLLECTIONS.RESERVATIONS), where("userId", "==", USER.uid), orderBy("createdAt", "desc")));
    rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) { console.warn("[SAM] reservations:", err?.code || err); }

  if (!rows.length) { list.innerHTML = ""; empty.hidden = false; return; }
  empty.hidden = true;
  const statusBadge = (s) => {
    const t = String(s || "new").toLowerCase();
    const map = { new: ["Mpya", "badge-new"], confirmed: ["Imethibitishwa", "badge-verified"], sold: ["Imekamilika", "badge-available"], cancelled: ["Imeghairiwa", "badge-sold"] };
    const [lbl, cls] = map[t] || ["Inasubiri", "badge-reserved"];
    return `<span class="badge ${cls}">${lbl}</span>`;
  };
  list.innerHTML = rows.map((r) => `
    <div class="list-row">
      <div><strong>${escapeHtml(r.propertyCode || r.propertyId || "Kiwanja")}</strong><br/><span class="text-xs text-faint">${escapeHtml(r.date || "Ombi la kuhifadhi")}</span></div>
      ${statusBadge(r.status)}
    </div>`).join("");
}

/* ---- Profile ------------------------------------------------------------ */
async function loadProfile() {
  $("#p-email").value = USER.email || "";
  $("#p-name").value = USER.displayName || "";
  try {
    const snap = await getDoc(doc(db, COLLECTIONS.USERS, USER.uid));
    if (snap.exists()) {
      const d = snap.data();
      if (d.displayName) $("#p-name").value = d.displayName;
      if (d.phone) $("#p-phone").value = d.phone;
    }
  } catch (err) { console.warn("[SAM] profile:", err?.code || err); }
}

async function saveProfile() {
  const name = $("#p-name").value.trim(), phone = $("#p-phone").value.trim();
  if (!name || name.length > 120) { toast("Weka jina sahihi.", "warning"); return; }
  const btn = $("#p-save");
  btn.setAttribute("aria-disabled", "true");
  try {
    await setDoc(doc(db, COLLECTIONS.USERS, USER.uid), { displayName: name, phone }, { merge: true });
    try { await updateProfile(auth.currentUser, { displayName: name }); } catch {}
    $$("[data-user-name]").forEach((n) => (n.textContent = name));
    setAvatar(name);
    toast("Wasifu umehifadhiwa!", "success");
  } catch (err) { console.warn("[SAM] save profile:", err?.code || err); toast("Imeshindikana kuhifadhi.", "error"); }
  finally { btn.removeAttribute("aria-disabled"); }
}

/* ---- Helpers ------------------------------------------------------------ */
function setAvatar(name) {
  const initial = (name || USER.email || "S").trim().charAt(0).toUpperCase();
  const av = $("#u-avatar"); if (av) av.textContent = initial;
}
function memberSince() {
  try {
    const t = USER.metadata && USER.metadata.creationTime ? new Date(USER.metadata.creationTime) : null;
    if (t) $("#stat-since").textContent = t.toLocaleDateString("sw-TZ", { month: "short", year: "numeric" });
  } catch {}
}

/* ---- Boot --------------------------------------------------------------- */
async function initDashboard(user) {
  if (started) return; started = true;
  USER = user;
  $("#dash-gate").hidden = true;
  $("#dash-main").hidden = false;

  setAvatar(user.displayName);
  memberSince();

  CATALOG = await fetchAllPublished(120);
  await loadFavorites();
  loadSearches();
  loadRequests();
  loadProfile();

  // Delegated actions.
  $("#search-list").addEventListener("click", (e) => { const b = e.target.closest("[data-del-search]"); if (b) deleteSearch(b.dataset.delSearch); });
  $("#p-save").addEventListener("click", saveProfile);

  // Keep favourites synced when the heart is toggled anywhere on the page.
  document.addEventListener("sam:wishlist", (e) => {
    const d = e.detail || {};
    if (d.id != null && typeof d.added === "boolean") { syncFav(d.id, d.added); }
    renderFavorites();
  });
}

function showGate() {
  if (started) return;
  $("#dash-gate").hidden = false;
  $("#dash-main").hidden = true;
}

function boot() {
  wireNav();
  onAuth((user) => { if (user) initDashboard(user); else showGate(); });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();
