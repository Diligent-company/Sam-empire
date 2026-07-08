/* =============================================================================
   SAM EMPIRE — admin-core.js
   Runs on every admin page (except the admin login). Verifies the signed-in user
   is an active admin (a document at /admins/{uid} with active === true, per
   firestore.rules), injects the console chrome (sidebar + topbar) around the
   page's #admin-content, and exposes shared helpers on window.ADMIN.

   Non-admins and signed-out users are redirected to the admin login; content
   stays hidden until verification succeeds, so nothing leaks.
   ============================================================================= */

import { auth, db, COLLECTIONS, IS_CONFIGURED, onAuth } from "/assets/js/firebase.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { $, $$, escapeHtml, store } from "/assets/js/utils.js";

const ic = {
  dash: '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="9" rx="1.5" stroke="currentColor" stroke-width="1.8"/><rect x="14" y="3" width="7" height="5" rx="1.5" stroke="currentColor" stroke-width="1.8"/><rect x="14" y="12" width="7" height="9" rx="1.5" stroke="currentColor" stroke-width="1.8"/><rect x="3" y="16" width="7" height="5" rx="1.5" stroke="currentColor" stroke-width="1.8"/></svg>',
  plot: '<svg viewBox="0 0 24 24" fill="none"><path d="M3 21h18M5 21V9l7-5 7 5v12" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  crm: '<svg viewBox="0 0 24 24" fill="none"><path d="M16 11a4 4 0 10-8 0M4 21a8 8 0 0116 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="7" r="3" stroke="currentColor" stroke-width="1.8"/></svg>',
  cal: '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M3 9h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M4 7l8 6 8-6" stroke="currentColor" stroke-width="1.8"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none"><circle cx="9" cy="8" r="3.2" stroke="currentColor" stroke-width="1.8"/><path d="M3 20a6 6 0 0112 0M16 5.5a3 3 0 010 5.8M21 20a6 6 0 00-4-5.7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 21s-7-5.3-7-11a7 7 0 0114 0c0 5.7-7 11-7 11z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="10" r="2.4" stroke="currentColor" stroke-width="1.8"/></svg>',
  doc: '<svg viewBox="0 0 24 24" fill="none"><path d="M6 3h9l4 4v14a0 0 0 010 0H6a0 0 0 010 0V3z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 12h6M9 16h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  help: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M9.5 9a2.5 2.5 0 013.9-2c1.6 1 1 3-1 3.5V13M12 16.5v.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  img: '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.8"/><circle cx="8.5" cy="9.5" r="1.5" stroke="currentColor" stroke-width="1.6"/><path d="M4 17l5-5 4 4 3-2 4 3" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  video: '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="14" height="14" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M17 10l4-2v8l-4-2" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  brief: '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="7" width="18" height="13" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2" stroke="currentColor" stroke-width="1.8"/></svg>',
  cog: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  backup: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3v12m0 0l-4-4m4 4l4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  logout: '<svg viewBox="0 0 24 24" fill="none"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};

const NAV = [
  { group: "Muhtasari" },
  { key: "dashboard", label: "Dashibodi", href: "/admin/index.html", icon: ic.dash },
  { group: "Mauzo" },
  { key: "properties", label: "Viwanja", href: "/admin/properties.html", icon: ic.plot },
  { key: "leads", label: "Miongozo (CRM)", href: "/admin/leads.html", icon: ic.crm },
  { key: "appointments", label: "Miadi", href: "/admin/appointments.html", icon: ic.cal },
  { group: "Mawasiliano" },
  { key: "messages", label: "Ujumbe", href: "/admin/messages.html", icon: ic.mail },
  { key: "subscribers", label: "Wasajili", href: "/admin/subscribers.html", icon: ic.users },
  { group: "Maudhui" },
  { key: "content", label: "Maudhui ya Kurasa", href: "/admin/content.html", icon: ic.doc },
  { key: "locations", label: "Maeneo", href: "/admin/locations.html", icon: ic.pin },
  { key: "blog", label: "Blogu", href: "/admin/blog.html", icon: ic.doc },
  { key: "news", label: "Habari", href: "/admin/news.html", icon: ic.doc },
  { key: "testimonials", label: "Ushuhuda", href: "/admin/testimonials.html", icon: ic.star },
  { key: "faqs", label: "Maswali", href: "/admin/faqs.html", icon: ic.help },
  { key: "gallery", label: "Picha", href: "/admin/gallery.html", icon: ic.img },
  { key: "videos", label: "Video", href: "/admin/videos.html", icon: ic.video },
  { key: "careers", label: "Ajira", href: "/admin/careers.html", icon: ic.brief },
  { group: "Mfumo" },
  { key: "settings", label: "Mipangilio", href: "/admin/settings.html", icon: ic.cog },
  { key: "backup", label: "Nakala Rudufu", href: "/admin/backup.html", icon: ic.backup }
];

function sidebarHTML(active) {
  const items = NAV.map((n) => n.group
    ? `<div class="admin-nav__group">${n.group}</div>`
    : `<a href="${n.href}" class="${n.key === active ? "is-active" : ""}">${n.icon}<span>${n.label}</span></a>`
  ).join("");
  return `
  <aside class="admin-side" id="admin-side">
    <div class="admin-brand">
      <img src="/assets/icons/logo.svg" alt="" />
      <div><b>SAM EMPIRE</b><span>Admin</span></div>
    </div>
    <nav class="admin-nav" aria-label="Admin">${items}</nav>
    <div class="admin-side__foot">
      <a href="/" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M4 12a8 8 0 1016 0 8 8 0 00-16 0zM4 12h16M12 4a12 12 0 010 16M12 4a12 12 0 000 16" stroke="currentColor" stroke-width="1.6"/></svg><span>Tazama Tovuti</span></a>
      <a href="#" id="admin-signout">${ic.logout}<span>Toka</span></a>
    </div>
  </aside>`;
}

function topbarHTML(title) {
  return `
  <div class="admin-topbar">
    <button class="icon-btn-plain" id="admin-side-toggle" aria-label="Menyu"><svg viewBox="0 0 24 24" width="20" height="20" fill="none"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
    <h1 id="admin-title">${escapeHtml(title)}</h1>
    <div class="admin-topbar__spacer"></div>
    <button class="icon-btn-plain" data-theme-toggle aria-label="Mwangaza / Giza"><svg viewBox="0 0 24 24" width="18" height="18" fill="none"><circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="2"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
    <div class="admin-user"><span class="admin-user__avatar" id="admin-avatar">A</span></div>
  </div>`;
}

export const ADMIN = { user: null, doc: null, isSuper: false, ready: false };

function reveal(user) {
  ADMIN.ready = true;
  const gate = $("#admin-gate"); if (gate) gate.classList.add("admin-hidden");
  const shell = $("#admin-shell"); if (shell) shell.hidden = false;
  const initial = (user.displayName || user.email || "A").trim().charAt(0).toUpperCase();
  const av = $("#admin-avatar"); if (av) av.textContent = initial;
  document.dispatchEvent(new CustomEvent("admin:ready", { detail: ADMIN }));
}

function wireChrome() {
  const side = $("#admin-side");
  $("#admin-side-toggle")?.addEventListener("click", () => {
    if (window.matchMedia("(max-width: 900px)").matches) side.classList.toggle("is-open");
    else { $("#admin-shell").classList.toggle("is-collapsed"); store.set("admin:collapsed", $("#admin-shell").classList.contains("is-collapsed")); }
  });
  if (store.get("admin:collapsed", false) && !window.matchMedia("(max-width: 900px)").matches) {
    $("#admin-shell").classList.add("is-collapsed");
  }
  document.addEventListener("click", (e) => {
    if (window.matchMedia("(max-width: 900px)").matches && side.classList.contains("is-open")) {
      if (!side.contains(e.target) && !e.target.closest("#admin-side-toggle")) side.classList.remove("is-open");
    }
  });
  $("#admin-signout")?.addEventListener("click", async (e) => {
    e.preventDefault();
    try { await signOut(auth); } catch {}
    location.replace("/admin/login.html");
  });
}

function injectShell() {
  const active = document.body.dataset.page || "";
  const title = document.body.dataset.title || "Admin";
  const shell = $("#admin-shell");
  if (shell) shell.insertAdjacentHTML("afterbegin", sidebarHTML(active));
  const main = $(".admin-main");
  if (main) main.insertAdjacentHTML("afterbegin", topbarHTML(title));
  wireChrome();
}

/* Shared helpers for admin controllers. */
ADMIN.toast = (m, t) => window.SAM && window.SAM.toast && window.SAM.toast(m, t);
ADMIN.modal = (cfg) => window.SAM && window.SAM.openModal && window.SAM.openModal(cfg);
ADMIN.confirm = (cfg = {}) => {
  if (!(window.SAM && window.SAM.confirmDialog)) return Promise.resolve(false);
  return window.SAM.confirmDialog(cfg.message || "Una uhakika?", {
    title: cfg.title || "Thibitisha",
    confirmLabel: cfg.confirmLabel || "Sawa",
    cancelLabel: cfg.cancelLabel || "Ghairi",
    danger: !!cfg.danger
  }).then((ok) => { if (ok && typeof cfg.onConfirm === "function") cfg.onConfirm(); return ok; });
};
ADMIN.onReady = (cb) => { if (ADMIN.ready) cb(ADMIN); else document.addEventListener("admin:ready", () => cb(ADMIN), { once: true }); };

function boot() {
  injectShell();
  if (!IS_CONFIGURED) {
    // No backend configured → cannot verify admin. Send to login which explains.
    location.replace("/admin/login.html?config=1");
    return;
  }
  onAuth(async (user) => {
    if (!user) { location.replace("/admin/login.html?next=" + encodeURIComponent(location.pathname)); return; }
    try {
      const snap = await getDoc(doc(db, COLLECTIONS.ADMINS, user.uid));
      if (!snap.exists() || snap.data().active !== true) {
        try { await signOut(auth); } catch {}
        location.replace("/admin/login.html?denied=1");
        return;
      }
      ADMIN.user = user;
      ADMIN.doc = snap.data();
      ADMIN.isSuper = (snap.data().role === "superadmin");
      reveal(user);
    } catch (err) {
      console.warn("[SAM] admin verify:", err?.code || err);
      location.replace("/admin/login.html?err=1");
    }
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();
