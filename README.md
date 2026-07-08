<div align="center">

# SAM EMPIRE
### Premium Real Estate Management System

**_Muuzaji wa Viwanja Kigamboni_**

A production-ready, Firebase-powered platform for selling surveyed land plots (_viwanja_) in Kigamboni, Dar es Salaam — Tanzania.

`Dark Blue #081F4D` · `Luxury Gold #D4AF37` · `White #FFFFFF`

</div>

---

## Table of Contents

1. [Overview](#1-overview)
2. [Technology Stack](#2-technology-stack)
3. [Folder Structure](#3-folder-structure)
4. [Installation](#4-installation)
5. [Firebase Setup](#5-firebase-setup)
6. [First Admin Account](#6-first-admin-account)
7. [Configuration](#7-configuration)
8. [Deployment](#8-deployment)
9. [What's Included](#9-whats-included)
10. [Customization](#10-customization)
11. [Security](#11-security)
12. [Backup & Restore](#12-backup--restore)
13. [Maintenance](#13-maintenance)
14. [Known Limitations](#14-known-limitations)
15. [Company Contact](#15-company-contact)

---

## 1. Overview

SAM EMPIRE is a static-first web application: every page is plain HTML/CSS/JS and all dynamic behaviour is provided by **Firebase** (Authentication, Firestore, Storage, Hosting, Analytics). There is **no Node/PHP backend and no paid server** required — it deploys straight to Firebase Hosting's free tier.

It ships as two surfaces that share one design system and one Firebase project:

- **Public website** (project root) — luxury marketing site, property catalogue with filters/sort/compare, the 12 Kigamboni location pages, gallery, videos, blog/news, FAQ, testimonials, careers, customer accounts with two-way-synced favourites and saved searches, wishlist/compare, site-visit booking, and reservations.
- **Admin console** (`/admin/`) — a complete CMS and CRM. Non-technical staff manage every piece of content — properties, the 12 locations' editorial copy, blog/news articles, testimonials, FAQs, gallery, videos, careers, newsletter subscribers, brand/contact/social settings, and data backups — without touching code.

The visual identity is a **land-title / survey** theme: hairline gold rules, a monospaced font for plot codes and GPS coordinates, and an embossed gold "Serikali Imeidhinisha" (Government-Approved) seal — chosen to distinguish SAM EMPIRE from generic real-estate templates.

---

## 2. Technology Stack

| Layer | Technology |
|---|---|
| Markup / styling | HTML5, CSS3 (custom-property design system) |
| Scripting | JavaScript ES6+ modules (no bundler, no build step) |
| Auth | Firebase Authentication — Email/Password + Google sign-in |
| Database | Cloud Firestore (persistent local cache, multi-tab) |
| Files / media | Firebase Storage (client-side compress → watermark → thumbnail pipeline before upload) |
| Hosting | Firebase Hosting |
| Analytics | Firebase Analytics (consent-gated) + a lightweight admin-only Firestore aggregation layer for the dashboard |
| Maps | Google Maps JavaScript API (optional — pages degrade to a styled fallback without a key) |
| Charts | Chart.js (loaded from cdnjs, admin dashboard only) |
| Fonts | Google Fonts — Playfair Display, Plus Jakarta Sans, Space Mono |
| Offline / PWA | Service Worker + Web App Manifest |
| Local fallback | `localStorage` (theme, wishlist/compare, recently-viewed, settings cache) |

The Firebase Web SDK is loaded as **v10.12.2 modular** directly from the official `gstatic` CDN, so the project runs from any static host with zero tooling.

---

## 3. Folder Structure

```
sam-empire/
├── index.html                          Homepage
├── properties.html                     Catalogue (filters, sort, pagination, compare)
├── property-details.html               Single property (rewrite target of /property/**)
├── locations.html                      Overview + single-area (rewrite target of /location/**)
├── about.html · contact.html · faq.html · gallery.html · videos.html
├── blog.html · news.html               (rewrite targets of /blog/** and /news/**)
├── testimonials.html · careers.html
├── privacy.html · terms.html
├── login.html · register.html · account.html   Customer auth + dashboard
├── 404.html · offline.html
│
├── admin/                              Admin console — every page is guarded by admin-core.js
│   ├── login.html                      Admin sign-in (verifies /admins/{uid} membership)
│   ├── index.html                      Dashboard — metrics, activity chart, lead funnel
│   ├── properties.html                 Property CRUD + image upload/watermark/thumbnail
│   ├── leads.html                      CRM kanban (drag-and-drop pipeline)
│   ├── appointments.html · messages.html
│   ├── subscribers.html · locations.html
│   ├── blog.html · news.html           Article CRUD (shared controller, cover upload)
│   ├── testimonials.html · faqs.html · gallery.html · videos.html · careers.html
│   ├── settings.html                   Brand/contact/socials/Maps key (superadmin gate in UI)
│   └── backup.html                     JSON export/import of any collection
│
├── assets/
│   ├── css/
│   │   ├── style.css                   Design tokens + all public-site components
│   │   ├── responsive.css · animations.css
│   │   └── admin.css                   Admin console layout + components
│   ├── js/
│   │   ├── firebase.js                 Firebase init, COLLECTIONS map, IS_CONFIGURED flag
│   │   ├── utils.js                    Shared helpers, SAM_BRAND constants
│   │   ├── storage.js                  Upload pipeline (resize/watermark/thumbnail)
│   │   ├── analytics.js                Public tracking + admin dashboard aggregations
│   │   ├── catalog.js                  Shared property-listing engine (12 locations, demo data)
│   │   ├── script.js                   Public site boot: nav, wishlist/compare, modals, toasts,
│   │   │                               live settings binding, newsletter, dark mode, PWA
│   │   ├── partials.js                 Injects shared header/drawer/footer/FABs on content pages
│   │   ├── auth.js · account.js        Customer login/register + dashboard
│   │   ├── home.js · properties.js · property.js · locations.js
│   │   ├── contact.js · faq.js · gallery.js · videos.js · articles.js
│   │   ├── testimonials.js · careers.js
│   │   ├── admin-core.js               Admin guard + console shell (sidebar/topbar) — imported
│   │   │                               by every admin page
│   │   └── admin-*.js                  One controller per admin page (auth, dashboard,
│   │                                   properties, leads, appointments, messages, locations,
│   │                                   articles, testimonials, faqs, gallery, videos, careers,
│   │                                   subscribers, settings, backup)
│   └── icons/                          Logo + full PWA icon set
│
├── manifest.json · service-worker.js · offline.html      PWA
├── robots.txt · sitemap.xml                              SEO (admin/ disallowed, all public
│                                                          pages + 12 location URLs listed)
├── firebase.json               Hosting config: clean URLs, rewrites, cache/security headers
├── firestore.rules             Firestore security rules
├── firestore.indexes.json      Composite indexes
├── storage.rules               Storage security rules (admin check mirrors the Firestore
│                                /admins/{uid} doc — see §11 Security)
└── README.md                   This file
```

---

## 4. Installation

You need only the [Firebase CLI](https://firebase.google.com/docs/cli) and a Google account. There is nothing to compile.

```bash
# 1. Install the Firebase CLI (one time)
npm install -g firebase-tools

# 2. Sign in
firebase login

# 3. From the project root, link it to your Firebase project
firebase use --add        # choose / create your project, alias it "default"
```

To preview locally before deploying:

```bash
# Serve the static site on http://localhost:5000
firebase hosting:channel:deploy preview   # or:
firebase emulators:start                  # full emulator suite: Auth, Firestore, Storage, Hosting
```

---

## 5. Firebase Setup

1. Create a project at **https://console.firebase.google.com**.
2. **Add a Web App** and copy its config object.
3. In **Build → Authentication → Sign-in method**, enable **Email/Password** and **Google**.
4. Create a **Cloud Firestore** database (start in *production* mode — the rules in this repo secure it).
5. Enable **Storage**.
6. Enable **Analytics** (optional but recommended — the public site is written to no-op cleanly if it's off).
7. Deploy the security rules and indexes shipped with this project:

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage
```

---

## 6. First Admin Account

Admin access is gated by an `admins/{uid}` Firestore document with `active: true` (see `firestore.rules`, and `storage.rules` mirrors the same check for uploads). Because that document itself is admin-write-only, the **very first** admin has to be created by hand:

1. Register a normal account on the public site at `/register.html` (or create a user directly in the Firebase Auth console).
2. In the Firestore console, create a document at `admins/{that user's UID}` with:
   ```json
   { "active": true, "role": "superadmin", "name": "Owner", "createdAt": <a timestamp> }
   ```
3. Sign in at `/admin/login.html` with that account's email/password.

No custom auth claims or Cloud Functions are needed — both Firestore and Storage rules check this same document directly. Every subsequent admin is added the same way, and can be deactivated by flipping `active` to `false` (no need to delete the user).

`role: "superadmin"` additionally unlocks the **Settings** page in the admin UI (a client-side convenience gate — the Firestore rule itself allows any active admin to write `settings/public`).

---

## 7. Configuration

All credentials live in **one file**: `assets/js/firebase.js`. Replace the placeholder values in `DEFAULT_CONFIG`:

```js
const DEFAULT_CONFIG = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "sam-empire.firebaseapp.com",
  projectId:         "sam-empire",
  storageBucket:     "sam-empire.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID",
  measurementId:     "YOUR_MEASUREMENT_ID"
};
```

**Optional — re-point without editing source.** Define a global before the module loads (handy for staging vs. production, or for reselling the platform):

```html
<script>
  window.SAM_FIREBASE_CONFIG = { /* …client config… */ };
</script>
```

While the config is still on its placeholder values, `IS_CONFIGURED` is `false`: the public site keeps working with demo/fallback content and routes every form through a pre-filled WhatsApp message instead of Firestore, and the admin console redirects to a "not configured" notice — so the UI is always reviewable before Firebase is wired up.

**Google Maps** is optional. Set `window.SAM_MAPS_KEY = "…"` in a small inline script, or — once Firebase is connected — paste the key into **Admin → Settings → Ramani**; it's cached to `localStorage` and applied on the next page load for every map on the site. Without a key, maps show a styled fallback with a "Open in Google Maps" link instead of an embedded map.

**Everything else is editable from the Admin console**: company name/tagline, phone/WhatsApp/emails, social links, and the Maps key live under **Settings** (`settings/public`, world-readable, admin-writable) and are bound live into every public page via `[data-bind]` attributes — no redeploy needed to change a phone number.

---

## 8. Deployment

```bash
# Deploy everything (hosting + rules + indexes + storage)
firebase deploy

# Or target hosting only
firebase deploy --only hosting
```

`firebase.json` is pre-configured with:

- **Clean URLs** and rewrites for `/property/**` → `property-details.html`, `/location/**` → `locations.html`, `/blog/**` → `blog.html`, `/news/**` → `news.html`.
- **Cache headers** — immutable long-cache for JS/CSS/images, `must-revalidate` for HTML/JSON, and `no-cache` for `service-worker.js` (so updates ship instantly).
- **Security headers** — HSTS, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, and a `Permissions-Policy`.

After a successful deploy your site is live at `https://<project-id>.web.app` and `https://<project-id>.firebaseapp.com`. To use a custom domain, add it under **Hosting → Add custom domain** in the Firebase console.

`robots.txt` disallows `/admin/`, and `sitemap.xml` lists every public page plus all 12 `/location/{slug}` URLs — update it if you add new blog/news posts you want indexed individually.

---

## 9. What's Included

**Public site**
- Homepage, full property catalogue with filters/sort/pagination/compare, single-property pages with gallery/lightbox/map/share/QR, and 12 dedicated Kigamboni location pages (each with admin-editable tagline/intro/highlights layered over a Swahili baseline).
- Content pages: About, Contact (writes to `messages`), FAQ, Gallery, Videos, Blog, News, Testimonials, Careers (with an application form), Privacy, Terms.
- Customer accounts: register/login (email+password or Google), password reset, and a dashboard with two-way-synced favourites, saved searches, reservation history, and profile editing.
- Dark mode, PWA install + offline page, cookie consent, WhatsApp deep-links throughout, newsletter capture.

**Admin console** (`/admin/`)
- Dashboard with live metrics, a 30-day activity chart, and a lead-funnel chart (Chart.js).
- Full property CRUD with drag-and-drop image upload (auto compress → gold watermark → thumbnail).
- CRM: drag-and-drop lead kanban across 7 pipeline stages, appointments table, and a message inbox — each with quick call/WhatsApp/email actions.
- Content management for locations, blog, news, testimonials (with approve/reject), FAQs (with reordering), gallery, videos, careers (with active/inactive toggle), and newsletter subscribers (with CSV export).
- Settings (brand, contact, socials, Maps key) and a Backup page that exports any combination of collections to a JSON file and can restore from one.

---

## 10. Customization

**Re-branding for resale** is fast because the design system is fully tokenised in `assets/css/style.css`:

```css
:root {
  --c-navy: #081F4D;   /* primary  */
  --c-gold: #D4AF37;   /* secondary */
  /* …radii, spacing, shadows, typography all here… */
}
```

To rebrand a reseller deployment: change the colour tokens, swap the logo/icons in `assets/icons/`, update the company name/tagline (either in `assets/js/utils.js`'s `SAM_BRAND` for the shipped defaults, or live via **Admin → Settings**), and point `assets/js/catalog.js`'s `KIGAMBONI_LOCATIONS` at a different set of areas if reselling outside Kigamboni. No component CSS needs editing.

- **Dark mode** is built in via `[data-theme="dark"]`; the saved choice persists in `localStorage` under the key `sam:theme`.
- **Typography** is centralised in three font variables (`--font-display`, `--font-body`, `--font-mono`).
- **Components** (buttons, badges, cards, forms, tables, modals, toasts, kanban, admin tables, etc.) are reusable classes documented inline in `style.css` and `admin.css`.

---

## 11. Security

- **Firestore rules** (`firestore.rules`) — public read is limited to *published* marketing content; inbound documents (leads, messages, appointments) can be *created* by visitors but only read/updated/deleted by admins, with a strict field whitelist (`validInbound()`); per-user data (profile, favourites, saved searches) is owner-scoped; every admin collection requires an active `admins/{uid}` record; default is **deny**.
- **Storage rules** (`storage.rules`) — public read for marketing media, admin-only writes validated by content-type and file size. Admin status is checked with the cross-service `firestore.get()` rules function against the **same** `/admins/{uid}` document Firestore rules use — this project ships with no Cloud Functions, so a custom auth claim (which nothing would ever set) is deliberately not used.
- **Client hardening** — input sanitisation and form validation throughout, session persistence via `browserLocalPersistence`, and graceful fallback so a misconfigured project never throws in front of a visitor.
- The admin console's route guard (`admin-core.js`) is a **UI convenience only** — the real enforcement is always the Firestore/Storage rules above.

> A Firebase Web API key is not a secret by itself, but your Firestore/Storage rules are what actually protect the data — make sure they're deployed before going live.

---

## 12. Backup & Restore

**Admin → Backup** (`/admin/backup.html`) lets you:

- **Export** any combination of collections (properties, locations, blog, news, testimonials, FAQs, gallery, videos, careers, settings, leads, subscribers) to a single downloadable JSON file, documents keyed by their Firestore ID.
- **Import** a previously exported file to restore data via batched, chunked writes (merge) — with a confirmation step, since it overwrites documents sharing the same ID.
- Every export/import is logged to the `backups` collection for an audit trail, visible at the bottom of the same page.

For a full project-level backup outside the app, you can also use Firebase's native export:

```bash
gcloud firestore export gs://<your-bucket>/backups/$(date +%F)
```

A lightweight client cache (wishlist, recently-viewed properties, cached settings, theme) is kept in `localStorage` as an additional resilience layer, independent of Firestore.

---

## 13. Maintenance

- **Service-worker updates** — bump the cache version constant in `service-worker.js` whenever shell assets change, so returning visitors pick up the new files promptly.
- **Offline page** — `offline.html` is served automatically when a navigation fails while offline.
- **SEO** — keep `sitemap.xml` in step with new blog/news posts if you want them indexed as individual URLs (the list currently covers all static pages and all 12 location pages).
- **Content** — everything editable day-to-day (properties, articles, testimonials, FAQs, media, careers, brand/contact details) lives in the Admin console; no redeploy is needed for content changes, only for code/design changes.

---

## 14. Known Limitations

- **Push notifications are not wired up.** `service-worker.js` has a `push` event listener that *would* display a notification if one arrived, but no client code ever requests notification permission or registers an FCM token, and there's no Cloud Function to send one. The `notifications` collection referenced in `COLLECTIONS` is reserved for this but currently unused. Treat this as a clearly-labelled future addition, not a working feature.
- **Google Maps and Chart.js are loaded from external CDNs** (`maps.googleapis.com`, `cdnjs.cloudflare.com`) — both degrade gracefully (styled fallback / no chart) if blocked or offline, but require those domains to be reachable for the enhanced experience.
- **The 12 Kigamboni locations are a fixed list** in `assets/js/catalog.js`; the admin Locations page edits their editorial copy but doesn't add or remove areas from that list.

---

## 15. Company Contact

| | |
|---|---|
| **Company** | SAM EMPIRE |
| **Tagline** | Muuzaji wa Viwanja Kigamboni |
| **Phone** | +255 689 621 263 |
| **WhatsApp** | https://wa.me/255689621263 |
| **Email** | info@samempire.co.tz · sales@samempire.co.tz · support@samempire.co.tz *(editable in Admin → Settings)* |
| **Market** | Kigamboni, Dar es Salaam, Tanzania |

---

<div align="center">

**SAM EMPIRE** — built to sell land, and built to be sold.

_© SAM EMPIRE. Production-ready. Deployable to Firebase Hosting today._

</div>
