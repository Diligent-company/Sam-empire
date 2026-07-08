/* =============================================================================
   SAM EMPIRE — admin-dashboard.js
   Populates the admin dashboard: metric tiles, a 30-day activity line chart, the
   lead-status funnel, and the top-properties / popular-locations lists. All data
   comes from the admin analytics aggregations (Firestore count/read), which only
   admins are authorised to run.
   ============================================================================= */

import { ADMIN } from "/assets/js/admin-core.js";
import { getDashboardMetrics, getActivitySeries, getLeadFunnel, getTopPropertiesByInterest, getPopularLocations } from "/assets/js/analytics.js";
import { $, formatNumber, escapeHtml } from "/assets/js/utils.js";

const GOLD = "#D4AF37", NAVY = "#1E4E96", GREY = "#94a3b8";
const STAGE_LABELS = { new: "Mpya", contacted: "Imefuatiliwa", interested: "Ana Nia", negotiating: "Majadiliano", reserved: "Imehifadhiwa", sold: "Imeuzwa", lost: "Imepotea" };

function setText(id, v) { const e = $("#" + id); if (e) e.textContent = v; }

function isDark() { return document.documentElement.getAttribute("data-theme") === "dark"; }
function gridColor() { return isDark() ? "rgba(255,255,255,0.08)" : "rgba(8,31,77,0.08)"; }
function tickColor() { return isDark() ? "#94a3b8" : "#64748b"; }

async function renderMetrics() {
  const m = await getDashboardMetrics();
  setText("m-properties", formatNumber(m.properties));
  setText("m-published", `${formatNumber(m.published)} hai · ${formatNumber(m.draft)} rasimu`);
  setText("m-leadsNew", formatNumber(m.leadsNew));
  setText("m-leadsTotal", `${formatNumber(m.leadsTotal)} jumla`);
  setText("m-appts", formatNumber(m.apptPending));
  setText("m-reservations", formatNumber(m.reservations));
  setText("m-subscribers", formatNumber(m.subscribers));
  setText("m-sold", formatNumber(m.sold));
  setText("m-conversion", `${m.conversion}% ubadilishaji`);
}

async function renderActivity() {
  if (!window.Chart) return;
  const data = await getActivitySeries(30);
  const ctx = $("#chart-activity");
  if (!ctx) return;
  new window.Chart(ctx, {
    type: "line",
    data: {
      labels: data.labels,
      datasets: [
        { label: "Miongozo", data: data.leads, borderColor: GOLD, backgroundColor: "rgba(212,175,55,0.12)", fill: true, tension: 0.35, borderWidth: 2, pointRadius: 0 },
        { label: "Miadi", data: data.appointments, borderColor: NAVY, backgroundColor: "transparent", tension: 0.35, borderWidth: 2, pointRadius: 0 },
        { label: "Wateja Wapya", data: data.users, borderColor: GREY, backgroundColor: "transparent", tension: 0.35, borderWidth: 2, borderDash: [4, 4], pointRadius: 0 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { intersect: false, mode: "index" },
      plugins: { legend: { labels: { usePointStyle: true, boxWidth: 8, color: tickColor() } } },
      scales: {
        x: { grid: { color: gridColor() }, ticks: { color: tickColor(), maxTicksLimit: 8 } },
        y: { grid: { color: gridColor() }, ticks: { color: tickColor(), precision: 0 }, beginAtZero: true }
      }
    }
  });
}

async function renderFunnel() {
  if (!window.Chart) return;
  const rows = await getLeadFunnel();
  const ctx = $("#chart-funnel");
  if (!ctx) return;
  new window.Chart(ctx, {
    type: "bar",
    data: {
      labels: rows.map((r) => STAGE_LABELS[r.status] || r.status),
      datasets: [{ label: "Miongozo", data: rows.map((r) => r.count), backgroundColor: rows.map((r) => r.status === "sold" ? "#1a8f4c" : r.status === "lost" ? "#c0392b" : GOLD), borderRadius: 6, maxBarThickness: 30 }]
    },
    options: {
      indexAxis: "y", responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: gridColor() }, ticks: { color: tickColor(), precision: 0 }, beginAtZero: true },
        y: { grid: { display: false }, ticks: { color: tickColor() } }
      }
    }
  });
}

async function renderTopProps() {
  const rows = await getTopPropertiesByInterest(6);
  const el = $("#top-props");
  if (!rows.length) { el.innerHTML = `<p class="text-muted text-sm">Bado hakuna data ya kutosha.</p>`; return; }
  const max = Math.max(...rows.map((r) => r.leads), 1);
  el.innerHTML = rows.map((r) => `
    <div>
      <div class="flex-between text-sm"><span class="fw-bold">${escapeHtml(r.propertyName)}</span><span class="mono text-faint">${formatNumber(r.leads)}</span></div>
      <div style="height:8px;border-radius:99px;background:var(--surface-3);margin-top:4px;overflow:hidden"><div style="height:100%;width:${(r.leads / max) * 100}%;background:var(--grad-gold);border-radius:99px"></div></div>
    </div>`).join("");
}

async function renderPopLocs() {
  const rows = await getPopularLocations(8);
  const el = $("#pop-locs");
  if (!rows.length) { el.innerHTML = `<p class="text-muted text-sm">Bado hakuna data ya kutosha.</p>`; return; }
  el.innerHTML = `<div class="atable-wrap"><table class="atable"><thead><tr><th>Eneo</th><th>Viwanja</th><th>Miongozo</th></tr></thead><tbody>${rows.map((r) => `<tr><td class="fw-bold">${escapeHtml(r.location)}</td><td>${formatNumber(r.plots)}</td><td>${formatNumber(r.leads)}</td></tr>`).join("")}</tbody></table></div>`;
}

ADMIN.onReady(() => {
  renderMetrics();
  renderActivity();
  renderFunnel();
  renderTopProps();
  renderPopLocs();
});
