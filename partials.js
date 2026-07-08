/* =============================================================================
   SAM EMPIRE — partials.js
   Single source of truth for the shared page "chrome" (loader, header, mobile
   drawer, footer, floating actions, cookie banner, toast portal). Content pages
   stay lean: they ship only their <main>, set <body data-page="..."> for the
   active nav state, and this module injects the rest before script.js boots.

   Load order on a content page:
     <script type="module" src="/assets/js/partials.js"></script>   ← injects chrome
     <script type="module" src="/assets/js/script.js"></script>     ← boots, sees chrome
     <script type="module" src="/assets/js/<page>.js"></script>     ← page logic

   Because ES modules are deferred and run in source order after parsing (but
   before DOMContentLoaded), the chrome exists by the time script.js initialises.
   ============================================================================= */

const NAV = [
  { href: "/", label: "Nyumbani", key: "home" },
  { href: "/properties.html", label: "Viwanja", key: "properties" },
  { href: "/locations.html", label: "Maeneo", key: "locations" },
  { href: "/about.html", label: "Kuhusu", key: "about" },
  { href: "/gallery.html", label: "Picha", key: "gallery" },
  { href: "/blog.html", label: "Blogu", key: "blog" },
  { href: "/contact.html", label: "Wasiliana", key: "contact" }
];

const DRAWER_NAV = [
  { href: "/", label: "Nyumbani" },
  { href: "/properties.html", label: "Viwanja" },
  { href: "/locations.html", label: "Maeneo" },
  { href: "/about.html", label: "Kuhusu Sisi" },
  { href: "/gallery.html", label: "Picha" },
  { href: "/videos.html", label: "Video" },
  { href: "/blog.html", label: "Blogu" },
  { href: "/faq.html", label: "Maswali" },
  { href: "/careers.html", label: "Ajira" },
  { href: "/contact.html", label: "Wasiliana" }
];

const WA_SVG = '<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 00-8.6 15l-1.3 4.7 4.8-1.3A10 10 0 1012 2zm0 18a8 8 0 01-4.1-1.1l-.3-.2-2.9.8.8-2.8-.2-.3A8 8 0 1112 20zm4.4-6c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.5.1l-.7.9c-.1.2-.3.2-.5.1a6.5 6.5 0 01-3.2-2.8c-.1-.2 0-.4.1-.5l.4-.5c.1-.1.1-.3 0-.4l-.8-1.9c-.2-.5-.4-.4-.5-.4h-.5c-.2 0-.5.1-.7.3-.7.7-.9 1.6-.6 2.6.5 1.7 1.6 3.1 3.2 4.1 1.6 1 2.9 1.2 3.9 1 .6-.1 1.4-.6 1.6-1.2.2-.5.2-1 .1-1.1z"/></svg>';

function loaderHTML() {
  return `
  <div class="loader" role="status" aria-label="Inapakia">
    <div class="loader__inner">
      <div class="loader__brand">SAM <span>EMPIRE</span></div>
      <div class="loader__tag">Muuzaji wa Viwanja Kigamboni</div>
      <div class="loader__bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
    </div>
  </div>`;
}

function headerHTML(active) {
  const links = NAV.map((n) =>
    `<a class="nav__link${n.key === active ? " is-active" : ""}" href="${n.href}">${n.label}</a>`).join("");
  return `
  <header class="site-header" id="site-header">
    <span class="scroll-progress" data-scroll-progress aria-hidden="true" style="position:absolute;left:0;bottom:0;height:2px;width:0;background:var(--grad-gold);transition:width .1s linear;"></span>
    <div class="container container-wide site-header__inner">
      <a class="brand" href="/" aria-label="SAM EMPIRE — Nyumbani">
        <img class="brand__mark" src="/assets/icons/logo.svg" alt="" width="42" height="42" />
        <span>
          <span class="brand__name" data-bind="brand.name">SAM EMPIRE</span>
          <span class="brand__tag" data-bind="brand.tagline">Muuzaji wa Viwanja Kigamboni</span>
        </span>
      </a>
      <nav class="nav" aria-label="Urambazaji mkuu">${links}</nav>
      <div class="header-actions">
        <button class="theme-toggle" data-theme-toggle aria-pressed="false" aria-label="Badilisha mwangaza / giza">
          <svg viewBox="0 0 24 24" fill="none" width="20" height="20" aria-hidden="true"><circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="2"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
        <a class="icon-btn btn-hide-sm" data-auth="user" href="/account.html" aria-label="Akaunti yangu" title="Akaunti" hidden>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true"><circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="2"/><path d="M4 21a8 8 0 0116 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </a>
        <a class="btn btn-outline-gold btn-sm btn-hide-sm" data-auth="guest" href="/login.html">Ingia</a>
        <a class="btn btn-gold btn-hide-sm" href="/properties.html">Viwanja Vyote</a>
        <button class="menu-toggle" aria-label="Fungua menyu" aria-controls="drawer" aria-expanded="false"><span></span></button>
      </div>
    </div>
  </header>`;
}

function drawerHTML() {
  const links = DRAWER_NAV.map((n) => `<a class="drawer__link" href="${n.href}">${n.label}</a>`).join("");
  return `
  <aside class="drawer" id="drawer" aria-label="Menyu ya simu" aria-hidden="true">
    <nav aria-label="Urambazaji wa simu">${links}</nav>
    <div class="flex flex-col gap-3 mt-6">
      <a class="btn btn-gold btn-block" data-auth="user" href="/account.html" hidden>Akaunti Yangu</a>
      <a class="btn btn-gold btn-block" data-auth="guest" href="/login.html">Ingia / Jisajili</a>
      <a class="btn btn-whatsapp btn-block" data-action="whatsapp" data-message="Habari SAM EMPIRE!" target="_blank" rel="noopener">WhatsApp</a>
      <a class="btn btn-outline btn-block" data-action="call">Piga Simu</a>
    </div>
  </aside>`;
}

function footerHTML() {
  return `
  <footer class="site-footer">
    <div class="container container-wide">
      <div class="footer__top">
        <div class="footer__brand">
          <a class="brand" href="/" aria-label="SAM EMPIRE">
            <img class="brand__mark" src="/assets/icons/logo.svg" alt="" width="42" height="42" />
            <span>
              <span class="brand__name" data-bind="brand.name">SAM EMPIRE</span>
              <span class="brand__tag" data-bind="brand.tagline">Muuzaji wa Viwanja Kigamboni</span>
            </span>
          </a>
          <p class="footer__about" data-content="global:footerAbout">Tunauza viwanja vilivyopimwa na kuidhinishwa na serikali Kigamboni — hati safi, bei nafuu, na huduma ya kuaminika.</p>
          <div class="socials">
            <a class="social" data-social="facebook" href="#" aria-label="Facebook" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M14 9h3V6h-3c-2.2 0-4 1.8-4 4v2H8v3h2v7h3v-7h2.5l.5-3H13v-2c0-.6.4-1 1-1z"/></svg></a>
            <a class="social" data-social="instagram" href="#" aria-label="Instagram" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="2"/><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor"/></svg></a>
            <a class="social" data-social="youtube" href="#" aria-label="YouTube" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M22 12s0-3-.4-4.4a2.5 2.5 0 00-1.8-1.8C18.4 5.4 12 5.4 12 5.4s-6.4 0-7.8.4A2.5 2.5 0 002.4 7.6C2 9 2 12 2 12s0 3 .4 4.4a2.5 2.5 0 001.8 1.8c1.4.4 7.8.4 7.8.4s6.4 0 7.8-.4a2.5 2.5 0 001.8-1.8C22 15 22 12 22 12zm-12 3V9l5 3-5 3z"/></svg></a>
            <a class="social" data-social="tiktok" href="#" aria-label="TikTok" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M16 3c.3 2.1 1.6 3.6 3.7 3.8V9c-1.3 0-2.6-.4-3.7-1.1V15a5.2 5.2 0 11-5.2-5.2c.3 0 .5 0 .8.1v2.3a2.9 2.9 0 00-.8-.1 2.9 2.9 0 102.9 2.9V3H16z"/></svg></a>
          </div>
        </div>
        <div class="footer__col">
          <h4>Viungo</h4>
          <nav class="footer__links" aria-label="Viungo">
            <a href="/properties.html">Viwanja</a>
            <a href="/locations.html">Maeneo</a>
            <a href="/about.html">Kuhusu Sisi</a>
            <a href="/gallery.html">Picha</a>
            <a href="/videos.html">Video</a>
            <a href="/blog.html">Blogu</a>
          </nav>
        </div>
        <div class="footer__col footer__col--links2">
          <h4>Maeneo</h4>
          <nav class="footer__links" aria-label="Maeneo">
            <a href="/locations.html?slug=vijibweni">Vijibweni</a>
            <a href="/locations.html?slug=kibada">Kibada</a>
            <a href="/locations.html?slug=mwasonga">Mwasonga</a>
            <a href="/locations.html?slug=kimbiji">Kimbiji</a>
            <a href="/locations.html?slug=dege">Dege</a>
            <a href="/locations.html?slug=vikindu">Vikindu</a>
          </nav>
        </div>
        <div class="footer__col">
          <h4>Wasiliana Nasi</h4>
          <div class="footer__contact">
            <a class="footer__contact-item" data-action="call">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>
              <span data-bind="brand.phone">+255 689 621 263</span>
            </a>
            <a class="footer__contact-item" data-action="email">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M4 7l8 6 8-6" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>
              <span data-bind="brand.email">info@samempire.co.tz</span>
            </a>
            <div class="footer__contact-item">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true"><path d="M12 21s-7-5.3-7-11a7 7 0 0114 0c0 5.7-7 11-7 11z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="10" r="2.4" stroke="currentColor" stroke-width="1.8"/></svg>
              <span><span data-bind="brand.city">Kigamboni</span>, <span data-bind="brand.region">Dar es Salaam</span></span>
            </div>
          </div>
          <form class="newsletter" data-newsletter aria-label="Jiunge na jarida">
            <input class="input" type="email" name="email" placeholder="Barua pepe yako" autocomplete="email" required aria-label="Barua pepe" />
            <button class="btn btn-gold" type="submit">Jiunge</button>
          </form>
        </div>
      </div>
      <div class="footer__bottom">
        <span>&copy; <span data-year>2026</span> SAM EMPIRE. Haki zote zimehifadhiwa.</span>
        <nav class="flex gap-4 wrap" aria-label="Sera">
          <a href="/privacy.html">Sera ya Faragha</a>
          <a href="/terms.html">Vigezo &amp; Masharti</a>
          <a href="/faq.html">Maswali</a>
        </nav>
      </div>
    </div>
  </footer>`;
}

function extrasHTML() {
  return `
  <div class="fab-stack">
    <a class="fab fab-whatsapp" data-action="whatsapp" data-message="Habari SAM EMPIRE!" target="_blank" rel="noopener" aria-label="WhatsApp" title="WhatsApp">${WA_SVG}</a>
    <button class="fab fab-top" aria-label="Rudi juu" title="Rudi juu">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
  </div>
  <div class="cookie" role="dialog" aria-label="Idhini ya vidakuzi">
    <p class="cookie__text">Tovuti hii inatumia vidakuzi kuboresha matumizi yako. Kwa kuendelea, unakubali matumizi yake.</p>
    <div class="cookie__actions">
      <button class="btn btn-gold btn-sm" data-consent="accept">Kubali</button>
      <button class="btn btn-ghost btn-sm" data-consent="decline">Kataa</button>
    </div>
  </div>
  <div class="toast-stack" id="toast-stack" aria-live="polite"></div>`;
}

/** Build an interior page banner. */
export function pageBanner({ title, sub = "", crumbs = [] }) {
  const trail = [`<a href="/">Nyumbani</a>`]
    .concat(crumbs.map((c, i) =>
      i === crumbs.length - 1 && !c.href
        ? `<span class="is-current">${c.label}</span>`
        : `<a href="${c.href}">${c.label}</a>`))
    .join("");
  return `
  <section class="page-banner">
    <div class="container container-wide page-banner__inner">
      <nav class="crumbs" aria-label="Njia ya ukurasa">${trail}</nav>
      <h1 class="mt-3">${title}</h1>
      ${sub ? `<p class="mt-3">${sub}</p>` : ""}
    </div>
  </section>`;
}

/** Inject all shared chrome around the page's existing <main>. */
export function mountChrome() {
  const active = document.body.dataset.page || "";
  const main = document.querySelector("main");

  // Loader + header + drawer go before <main>.
  document.body.insertAdjacentHTML("afterbegin",
    loaderHTML() + `<a class="skip-link" href="#main">Rukia maudhui makuu</a>` + headerHTML(active) + drawerHTML());

  // Footer + extras go after <main> (or at end of body as a fallback).
  if (main) main.insertAdjacentHTML("afterend", footerHTML() + extrasHTML());
  else document.body.insertAdjacentHTML("beforeend", footerHTML() + extrasHTML());
}

// Auto-mount as soon as this module evaluates (DOM is already parsed for
// deferred modules). Pages need only include the script tag.
mountChrome();
