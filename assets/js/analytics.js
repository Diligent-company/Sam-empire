/* =============================================================================
   SAM EMPIRE — analytics.js
   Two layers, both 100% Firebase / no backend:

   1) PUBLIC TRACKING (anonymous visitors)
        • Firebase Analytics (GA4) events: page_view, view_item, search, share,
          generate_lead, schedule_visit …  — consent-gated.
        • A private, per-browser visitor/session model in LocalStorage (used for
          "recently viewed", personalisation and a local activity tally).
        ⚠ By design this layer writes NOTHING to Firestore. The security rules make
        the `analytics` collection admin-only, which keeps anonymous visitors from
        inflating counters (no spam vector) — GA4 is the correct home for raw hits.

   2) ADMIN AGGREGATIONS (signed-in admins only)
        • Real metrics read from collections admins are authorised to read
          (leads, appointments, reservations, properties, users, subscribers).
        • Powers the dashboard cards, the activity/traffic chart, the lead funnel,
          top-performing properties and most-popular locations.
   ============================================================================= */

import {
  db, col, COLLECTIONS, IS_CONFIGURED, initAnalytics
} from "./firebase.js";
import {
  getDocs, getCountFromServer, query, where, orderBy, limit, Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { store, uid, toDate } from "./utils.js";

/* -----------------------------------------------------------------------------
   1. CONSENT  — GA events only fire after the visitor accepts analytics cookies.
   script.js calls setConsent() from the cookie banner.
   -------------------------------------------------------------------------- */
let _consent = store.get("consent", null) === "accepted";
let _ga = null;          // GA4 instance (lazy)
let _logEvent = null;    // imported logEvent fn (lazy)
const _queue = [];       // events captured before consent / before GA loads

export function getConsent() { return _consent; }

export async function setConsent(granted) {
  _consent = !!granted;
  store.set("consent", granted ? "accepted" : "declined");
  if (_consent) { await _ensureGA(); _flush(); }
}

async function _ensureGA() {
  if (!IS_CONFIGURED || _ga) return _ga;
  try {
    _ga = await initAnalytics();
    if (_ga && !_logEvent) {
      const mod = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js");
      _logEvent = mod.logEvent;
    }
  } catch (e) { /* analytics unsupported (e.g. private mode) — silently ignore */ }
  return _ga;
}

function _flush() {
  if (!_ga || !_logEvent) return;
  while (_queue.length) { const [name, params] = _queue.shift(); try { _logEvent(_ga, name, params); } catch {} }
}

/** Low-level event sender (queues until consent + GA are ready). */
export async function trackEvent(name, params = {}) {
  if (!_consent) return;                 // respect the visitor's choice
  _queue.push([name, params]);
  await _ensureGA();
  _flush();
}

/* -----------------------------------------------------------------------------
   2. VISITOR / SESSION MODEL  (LocalStorage — private to this browser)
   -------------------------------------------------------------------------- */
const SESSION_TTL = 30 * 60 * 1000; // 30 minutes

export function visitorId() {
  let id = store.get("visitorId");
  if (!id) { id = uid("v"); store.set("visitorId", id); store.set("firstSeen", Date.now()); }
  return id;
}

export function sessionId() {
  const now = Date.now();
  let s = store.get("session", null);
  if (!s || (now - s.ts) > SESSION_TTL) {
    s = { id: uid("s"), start: now, ts: now, views: 0 };
    store.set("visits", (store.get("visits", 0) || 0) + 1); // total sessions this browser
  }
  s.ts = now; s.views = (s.views || 0) + 1;
  store.set("session", s);
  return s.id;
}

/** This browser's own counters (useful for a small "you've viewed N plots" UI). */
export function localStats() {
  return {
    visitorId: visitorId(),
    firstSeen: store.get("firstSeen", Date.now()),
    sessions: store.get("visits", 1),
    pageViews: store.get("pageViews", 0),
    viewedProperties: (store.get("recent:properties", []) || []).length
  };
}

/* -----------------------------------------------------------------------------
   3. PUBLIC EVENT HELPERS  (called from pages / script.js)
   -------------------------------------------------------------------------- */
export function trackPageView(pageKey = location.pathname) {
  visitorId(); sessionId();
  store.set("pageViews", (store.get("pageViews", 0) || 0) + 1);
  return trackEvent("page_view", {
    page_path: location.pathname,
    page_title: document.title,
    page_key: pageKey
  });
}

export function trackPropertyView(prop) {
  if (!prop) return;
  store.pushUnique("recent:properties", prop.id, 30);
  return trackEvent("view_item", {
    item_id: prop.id,
    item_name: prop.name || prop.title || "",
    item_category: prop.type || "land",
    location: prop.locationName || prop.location || "",
    price: Number(prop.price) || 0,
    currency: prop.currency || "TZS"
  });
}

export function trackLocationView(loc) {
  if (!loc) return;
  return trackEvent("select_content", {
    content_type: "location",
    item_id: loc.id || loc.slug || "",
    item_name: loc.name || ""
  });
}

export function trackSearch(term, filters = {}) {
  return trackEvent("search", { search_term: String(term || "").slice(0, 100), ...flatten(filters) });
}

export function trackLead(kind, propertyId = "") {
  return trackEvent("generate_lead", { lead_type: kind, item_id: propertyId });
}

export function trackAppointment(propertyId = "") {
  return trackEvent("schedule_visit", { item_id: propertyId });
}

export function trackShare(channel, url = location.href) {
  return trackEvent("share", { method: channel, content_id: url });
}

export function trackWishlist(propertyId, added) {
  return trackEvent(added ? "add_to_wishlist" : "remove_from_wishlist", { item_id: propertyId });
}

function flatten(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v == null || v === "") continue;
    out[`f_${k}`] = typeof v === "object" ? JSON.stringify(v).slice(0, 100) : String(v).slice(0, 100);
  }
  return out;
}

/* -----------------------------------------------------------------------------
   4. ADMIN AGGREGATIONS  (require an authenticated admin to satisfy rules)
   These read real data and never depend on anonymous writes.
   -------------------------------------------------------------------------- */
function startOfDay(d = new Date()) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function daysAgo(n) { const x = startOfDay(); x.setDate(x.getDate() - n); return x; }
const tsFrom = (date) => Timestamp.fromDate(date);

/** Count documents in a collection, optionally constrained. Uses server-side
    aggregation (1 read) instead of fetching every doc. */
export async function countDocs(collectionName, constraints = []) {
  if (!IS_CONFIGURED) return 0;
  try {
    const snap = await getCountFromServer(query(col(collectionName), ...constraints));
    return snap.data().count;
  } catch (e) { console.warn("[SAM] countDocs", collectionName, e?.code); return 0; }
}

/**
 * High-level dashboard summary. Returns real counts an admin can read.
 * @returns {Promise<object>}
 */
export async function getDashboardMetrics() {
  if (!IS_CONFIGURED) return EMPTY_METRICS();
  const since7 = tsFrom(daysAgo(7));
  const since30 = tsFrom(daysAgo(30));
  const [
    properties, published, locations, users, subscribers,
    leadsTotal, leads7, leadsNew, appointments, apptPending,
    reservations, sold
  ] = await Promise.all([
    countDocs(COLLECTIONS.PROPERTIES),
    countDocs(COLLECTIONS.PROPERTIES, [where("status", "==", "published")]),
    countDocs(COLLECTIONS.LOCATIONS),
    countDocs(COLLECTIONS.USERS),
    countDocs(COLLECTIONS.SUBSCRIBERS),
    countDocs(COLLECTIONS.LEADS),
    countDocs(COLLECTIONS.LEADS, [where("createdAt", ">=", since7)]),
    countDocs(COLLECTIONS.LEADS, [where("status", "==", "new")]),
    countDocs(COLLECTIONS.APPOINTMENTS),
    countDocs(COLLECTIONS.APPOINTMENTS, [where("status", "in", ["new", "pending", "confirmed"])]),
    countDocs(COLLECTIONS.RESERVATIONS),
    countDocs(COLLECTIONS.LEADS, [where("status", "==", "sold")])
  ]);

  const conversion = leadsTotal ? Math.round((sold / leadsTotal) * 1000) / 10 : 0;
  return {
    properties, published, draft: Math.max(0, properties - published),
    locations, users, subscribers,
    leadsTotal, leads7, leadsNew, leadsLast30: await countDocs(COLLECTIONS.LEADS, [where("createdAt", ">=", since30)]),
    appointments, apptPending,
    reservations, sold, conversion
  };
}

function EMPTY_METRICS() {
  return { properties: 0, published: 0, draft: 0, locations: 0, users: 0, subscribers: 0,
    leadsTotal: 0, leads7: 0, leadsNew: 0, leadsLast30: 0, appointments: 0, apptPending: 0,
    reservations: 0, sold: 0, conversion: 0 };
}

/**
 * Daily inbound-activity series for the last N days, by type.
 * Buckets leads + appointments + reservations + new users by day.
 * @returns {Promise<{labels:string[], leads:number[], appointments:number[], users:number[]}>}
 */
export async function getActivitySeries(days = 14) {
  const labels = [], leads = [], appointments = [], users = [];
  const start = daysAgo(days - 1);
  const buckets = {};
  for (let i = 0; i < days; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    buckets[key] = { leads: 0, appointments: 0, users: 0 };
    labels.push(new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(d));
  }
  if (IS_CONFIGURED) {
    const sinceTs = tsFrom(start);
    const bucketize = async (coll, field) => {
      try {
        const snap = await getDocs(query(col(coll), where("createdAt", ">=", sinceTs), orderBy("createdAt", "asc"), limit(2000)));
        snap.forEach((doc) => {
          const d = toDate(doc.data().createdAt);
          if (!d) return;
          const key = d.toISOString().slice(0, 10);
          if (buckets[key]) buckets[key][field]++;
        });
      } catch (e) { console.warn("[SAM] activity series", coll, e?.code); }
    };
    await Promise.all([
      bucketize(COLLECTIONS.LEADS, "leads"),
      bucketize(COLLECTIONS.APPOINTMENTS, "appointments"),
      bucketize(COLLECTIONS.USERS, "users")
    ]);
  }
  for (const key of Object.keys(buckets)) {
    leads.push(buckets[key].leads);
    appointments.push(buckets[key].appointments);
    users.push(buckets[key].users);
  }
  return { labels, leads, appointments, users };
}

/**
 * Lead funnel by status (New → Contacted → … → Sold/Lost).
 * @returns {Promise<{status:string,count:number}[]>}
 */
export async function getLeadFunnel() {
  const stages = ["new", "contacted", "interested", "negotiating", "reserved", "sold", "lost"];
  const out = await Promise.all(stages.map(async (status) => ({
    status,
    count: await countDocs(COLLECTIONS.LEADS, [where("status", "==", status)])
  })));
  return out;
}

/**
 * Properties ranked by genuine buyer interest (lead count), not raw views.
 * @returns {Promise<{propertyId,propertyName,leads}[]>}
 */
export async function getTopPropertiesByInterest(topN = 6) {
  if (!IS_CONFIGURED) return [];
  const tally = {};
  try {
    const snap = await getDocs(query(col(COLLECTIONS.LEADS), orderBy("createdAt", "desc"), limit(1000)));
    snap.forEach((doc) => {
      const d = doc.data();
      if (!d.propertyId) return;
      tally[d.propertyId] = tally[d.propertyId] || { propertyId: d.propertyId, propertyName: d.propertyName || d.propertyCode || d.propertyId, leads: 0 };
      tally[d.propertyId].leads++;
    });
  } catch (e) { console.warn("[SAM] top properties", e?.code); }
  return Object.values(tally).sort((a, b) => b.leads - a.leads).slice(0, topN);
}

/**
 * Most popular locations by combined supply (plots) and demand (leads).
 * @returns {Promise<{location,plots,leads,score}[]>}
 */
export async function getPopularLocations(topN = 8) {
  if (!IS_CONFIGURED) return [];
  const map = {};
  try {
    const [props, leads] = await Promise.all([
      getDocs(query(col(COLLECTIONS.PROPERTIES), limit(2000))),
      getDocs(query(col(COLLECTIONS.LEADS), orderBy("createdAt", "desc"), limit(1000)))
    ]);
    props.forEach((doc) => {
      const name = doc.data().locationName || doc.data().location || "Other";
      map[name] = map[name] || { location: name, plots: 0, leads: 0 };
      map[name].plots++;
    });
    leads.forEach((doc) => {
      const name = doc.data().locationName || doc.data().location;
      if (!name) return;
      map[name] = map[name] || { location: name, plots: 0, leads: 0 };
      map[name].leads++;
    });
  } catch (e) { console.warn("[SAM] popular locations", e?.code); }
  return Object.values(map)
    .map((r) => ({ ...r, score: r.plots + r.leads * 3 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}
