// skills/audit/scripts/public/js/app.mjs
import { api } from "./api.mjs";
import { renderHome } from "./views/home.mjs";
import { renderWizard } from "./views/wizard.mjs";
import { renderProgress } from "./views/progress.mjs";
import { renderReview } from "./views/review.mjs";
import { renderSummary } from "./views/summary.mjs";
import { initNotesPanel } from "./components/notes-panel.mjs";
import { initTheme } from "./theme.mjs";

initTheme();

const container = document.getElementById("app");
const breadcrumbEl = document.getElementById("breadcrumb");
let currentCleanup = null;

// ─── Shared Utilities ───

export function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = String(str ?? "");
  return div.innerHTML;
}

const ICONS = {
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  chevronRight: '<polyline points="9 18 15 12 9 6"/>',
  chevronLeft: '<polyline points="15 18 9 12 15 6"/>',
  arrowLeft: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
  alertTriangle: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  loader: '<line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/>',
  gitBranch: '<line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
  gitCommit: '<circle cx="12" cy="12" r="4"/><line x1="1.05" y1="12" x2="7" y2="12"/><line x1="17.01" y1="12" x2="22.96" y2="12"/>',
  zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  barChart: '<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>',
  clipboard: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>',
  messageSquare: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  chevronDown: '<polyline points="6 9 12 15 18 9"/>',
  sun: '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
  moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
};

export function icon(name, size = 16) {
  const path = ICONS[name] || ICONS.shield;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

// ─── Notes Panel ───
const notesPanelRoot = document.getElementById("notes-panel-root");
const notesPanel = initNotesPanel(notesPanelRoot);

function getSessionIdFromHash() {
  const hash = location.hash.slice(1) || "";
  const parts = hash.split("/").filter(Boolean);
  if (parts.length >= 2 && ["wizard", "progress", "review", "summary"].includes(parts[0])) {
    return parts[1];
  }
  return null;
}

// ─── Breadcrumb ───

export function setBreadcrumb(items) {
  if (!items || items.length === 0) {
    breadcrumbEl.innerHTML = "";
    return;
  }
  breadcrumbEl.innerHTML = items.map((item, i) => {
    const isLast = i === items.length - 1;
    if (isLast) {
      return `<span class="breadcrumb-current">${escapeHtml(item.label)}</span>`;
    }
    return `<a href="${item.href}">${escapeHtml(item.label)}</a><span class="breadcrumb-sep">/</span>`;
  }).join("");
}

// ─── Toast ───

export function showToast(message, type = "error") {
  const toastContainer = document.getElementById("toast-container");
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.textContent = message;
  toastContainer.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateX(16px)";
    el.style.transition = "all 200ms ease";
    setTimeout(() => el.remove(), 200);
  }, 4000);
}

// ─── Router ───

const routes = {
  home: renderHome,
  wizard: renderWizard,
  progress: renderProgress,
  review: renderReview,
  summary: renderSummary,
};

function parseHash() {
  const hash = location.hash.slice(1) || "/home";
  const [view, ...rest] = hash.split("/").filter(Boolean);
  return { view: view || "home", params: rest };
}

async function navigate() {
  // Cleanup previous view's listeners
  if (currentCleanup) {
    currentCleanup();
    currentCleanup = null;
  }

  const { view, params } = parseHash();
  notesPanel.updateSession(getSessionIdFromHash());
  window.scrollTo({ top: 0 });
  const render = routes[view];
  if (!render) { location.hash = "#/home"; return; }

  // View transition
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (prefersReduced) {
    container.innerHTML = "";
    try {
      await render(container, params);
    } catch (e) {
      handleError(e);
    }
  } else {
    container.classList.add("fade-out");
    await new Promise(r => setTimeout(r, 120));
    container.innerHTML = "";
    container.classList.remove("fade-out");
    container.classList.add("fade-in");
    try {
      await render(container, params);
    } catch (e) {
      handleError(e);
    }
    setTimeout(() => container.classList.remove("fade-in"), 200);
  }
}

function handleError(e) {
  if (e.message?.includes("Failed to fetch") || e.message?.includes("NetworkError")) {
    showToast("Network error — check that the server is running", "error");
  } else {
    showToast(e.message, "error");
  }
}

// Allow views to register cleanup functions
export function onNavigateCleanup(fn) {
  currentCleanup = fn;
}

window.addEventListener("hashchange", navigate);
window.addEventListener("load", navigate);
