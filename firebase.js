/* =============================================================================
   SAM EMPIRE — firebase.js
   Central Firebase initialisation for the entire platform (public + admin).
   Stack: Firebase Web SDK v10 (modular) loaded from the official CDN — no build
   step required, works directly on Firebase Hosting / any static host.

   ── HOW TO CONNECT YOUR PROJECT ──────────────────────────────────────────────
   1. Create a project at https://console.firebase.google.com
   2. Add a Web App, then copy its config into FIREBASE_CONFIG below.
   3. Enable: Authentication (Email/Password), Firestore, Storage, Analytics,
      and Cloud Messaging in the console.
   4. Deploy security rules from firestore.rules and storage.rules.
   These are the ONLY values you must edit by hand. Everything else in the app
   is managed from the Admin Dashboard. Do not commit real keys to a public repo
   if your Firestore rules are not locked down.
   ============================================================================= */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

/* -----------------------------------------------------------------------------
   1. CONFIGURATION  — replace with your own Firebase Web App credentials.
   A window-level override (window.SAM_FIREBASE_CONFIG) takes priority so the
   same build can be re-pointed to a different project without editing source.
   -------------------------------------------------------------------------- */
const DEFAULT_CONFIG = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "sam-empire.firebaseapp.com",
  projectId:         "sam-empire",
  storageBucket:     "sam-empire.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID",
  measurementId:     "YOUR_MEASUREMENT_ID"
};

export const FIREBASE_CONFIG = (typeof window !== "undefined" && window.SAM_FIREBASE_CONFIG)
  ? window.SAM_FIREBASE_CONFIG
  : DEFAULT_CONFIG;

/* VAPID public key for Web Push (Cloud Messaging → Web configuration). */
export const FCM_VAPID_KEY = (typeof window !== "undefined" && window.SAM_FCM_VAPID_KEY)
  ? window.SAM_FCM_VAPID_KEY
  : "YOUR_FCM_VAPID_PUBLIC_KEY";

/** True once a real (non-placeholder) config has been supplied. */
export const IS_CONFIGURED = !String(FIREBASE_CONFIG.apiKey).startsWith("YOUR_");

/* -----------------------------------------------------------------------------
   2. INITIALISE CORE SERVICES
   -------------------------------------------------------------------------- */
export const app = initializeApp(FIREBASE_CONFIG);

/* Firestore with offline persistence + multi-tab sync (works without network). */
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  ignoreUndefinedProperties: true
});

export const auth = getAuth(app);
export const storage = getStorage(app);

/* Keep users signed in across reloads. Wrapped so a misconfigured project
   never throws an uncaught error on page load. */
setPersistence(auth, browserLocalPersistence).catch((err) =>
  console.warn("[SAM] Auth persistence unavailable:", err?.code || err)
);

/* -----------------------------------------------------------------------------
   3. ANALYTICS (lazy, browser-only, guarded by isSupported)
   -------------------------------------------------------------------------- */
export let analytics = null;
export async function initAnalytics() {
  if (analytics || typeof window === "undefined" || !IS_CONFIGURED) return analytics;
  try {
    const mod = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js");
    if (await mod.isSupported()) analytics = mod.getAnalytics(app);
  } catch (err) {
    console.warn("[SAM] Analytics unavailable:", err?.message || err);
  }
  return analytics;
}

/* -----------------------------------------------------------------------------
   4. COLLECTION MAP — single source of truth for every Firestore path.
   Import COLLECTIONS anywhere to avoid magic strings.
   -------------------------------------------------------------------------- */
export const COLLECTIONS = Object.freeze({
  USERS:         "users",
  ADMINS:        "admins",
  ROLES:         "roles",
  PERMISSIONS:   "permissions",
  PROPERTIES:    "properties",
  LOCATIONS:     "locations",
  APPOINTMENTS:  "appointments",
  RESERVATIONS:  "reservations",
  MESSAGES:      "messages",
  LEADS:         "leads",
  GALLERY:       "gallery",
  VIDEOS:        "videos",
  DOCUMENTS:     "documents",
  SETTINGS:      "settings",
  TESTIMONIALS:  "testimonials",
  FAQS:          "faqs",
  BLOG:          "blog",
  NEWS:          "news",
  ANALYTICS:     "analytics",
  FAVORITES:     "favorites",
  NOTIFICATIONS: "notifications",
  ACTIVITY_LOGS: "activityLogs",
  BACKUPS:       "backups",
  SUBSCRIBERS:   "subscribers",
  PARTNERS:      "partners",
  CAREERS:       "careers",
  SAVED_SEARCHES:"savedSearches",
  CONTENT:       "content"
});

/** Get a typed collection reference: col(COLLECTIONS.PROPERTIES) */
export const col = (name) => collection(db, name);
/** Get a document reference: ref(COLLECTIONS.PROPERTIES, id) */
export const ref = (name, id) => doc(db, name, id);
/** Re-export for callers that need a server timestamp. */
export { serverTimestamp };

/* -----------------------------------------------------------------------------
   5. AUTH STATE — convenience promise + subscriber that also resolves admin role
   -------------------------------------------------------------------------- */
/** Resolves with the current user (or null) exactly once. */
export function currentUser() {
  return new Promise((resolve) => {
    const off = onAuthStateChanged(auth, (user) => { off(); resolve(user || null); });
  });
}

/** Subscribe to auth changes. Returns the unsubscribe function. */
export function onAuth(callback) {
  return onAuthStateChanged(auth, (user) => callback(user || null));
}

/* -----------------------------------------------------------------------------
   6. STARTUP GUARD — warn loudly (once) if the project is still on placeholders.
   -------------------------------------------------------------------------- */
if (typeof window !== "undefined" && !IS_CONFIGURED) {
  console.warn(
    "%c SAM EMPIRE %c Firebase is running on placeholder credentials.\n" +
    "Edit FIREBASE_CONFIG in assets/js/firebase.js with your project keys.",
    "background:#081F4D;color:#D4AF37;font-weight:700;padding:2px 6px;border-radius:4px",
    "color:#D7475A"
  );
}
