// skills/audit/scripts/public/js/app.mjs
import { api } from "./api.mjs";
import { renderHome } from "./views/home.mjs";
import { renderWizard } from "./views/wizard.mjs";
import { renderProgress } from "./views/progress.mjs";
import { renderReview } from "./views/review.mjs";
import { renderSummary } from "./views/summary.mjs";
import { renderSettings } from "./views/settings.mjs";
import { initNotesPanel } from "./components/notes-panel.mjs";
import { initTheme } from "./theme.mjs";

initTheme();

const container = document.getElementById("app");
const breadcrumbEl = document.getElementById("breadcrumb");
let currentCleanup = null;

// ─── Shared Utilities ───

const ESCAPE_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, c => ESCAPE_MAP[c]);
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
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
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
  inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
  "book-open": '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  "folder-search": '<path d="M2 6a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v4"/><path d="M14.5 19l-2.5-2.5"/><circle cx="19" cy="17" r="3"/>',
  "shield-alert": '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
  "alert-triangle": '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  "minus-circle": '<circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
};

export function icon(name, size = 16) {
  const path = ICONS[name] || ICONS.shield;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

// Initialize header settings button after icon function is defined
const settingsBtn = document.getElementById("header-settings-btn");
if (settingsBtn) settingsBtn.innerHTML = icon("settings", 16);

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

const TOAST_DURATIONS = { error: 6000, warning: 5000, success: 3000 };

export function showToast(message, type = "error") {
  const toastContainer = document.getElementById("toast-container");
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.textContent = message;
  el.style.cursor = "pointer";
  toastContainer.appendChild(el);

  let dismissed = false;
  let timer = null;

  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    clearTimeout(timer);
    el.style.opacity = "0";
    el.style.transform = "translateX(16px)";
    el.style.transition = "all 200ms ease";
    setTimeout(() => el.remove(), 200);
  }

  function startTimer() {
    clearTimeout(timer);
    timer = setTimeout(dismiss, TOAST_DURATIONS[type] || 4000);
  }

  el.addEventListener("click", dismiss);
  el.addEventListener("mouseenter", () => clearTimeout(timer));
  el.addEventListener("mouseleave", () => {
    if (!dismissed) startTimer();
  });
  startTimer();
}

// ─── Active Session Polling ───

let activePollTimer = null;

async function checkActiveSessions() {
  try {
    const sessions = await api.listSessions();
    const hasActive = sessions.some(s => s.status === "reviewing");
    const dot = document.getElementById("active-dot");
    if (dot) dot.style.display = hasActive ? "block" : "none";
  } catch { /* ignore */ }
}

function startActivePolling() {
  checkActiveSessions();
  activePollTimer = setInterval(checkActiveSessions, 30000);
}

// ─── Router ───

const routes = {
  home: renderHome,
  wizard: renderWizard,
  progress: renderProgress,
  review: renderReview,
  summary: renderSummary,
  settings: renderSettings,
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
  if (activePollTimer) {
    clearInterval(activePollTimer);
    activePollTimer = null;
  }

  const { view, params } = parseHash();
  notesPanel.updateSession(getSessionIdFromHash());
  window.scrollTo({ top: 0 });
  const render = routes[view];
  if (!render) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">${icon("alertTriangle", 56)}</div>
        <h2>Page Not Found</h2>
        <p>The page you requested does not exist.</p>
        <a href="#/home" class="btn btn-primary">${icon("arrowLeft", 14)} Back to Home</a>
      </div>`;
    return;
  }

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

  startActivePolling();
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

// Shared tab keyboard navigation (arrow keys + enter/space)
export function initTabKeyboard(tabContainer) {
  tabContainer.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("keydown", (e) => {
      const tabList = Array.from(tabContainer.querySelectorAll(".tab"));
      const idx = tabList.indexOf(tab);
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const next = e.key === "ArrowRight"
          ? tabList[(idx + 1) % tabList.length]
          : tabList[(idx - 1 + tabList.length) % tabList.length];
        next.focus();
        next.click();
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        tab.click();
      }
    });
  });
}

window.addEventListener("hashchange", navigate);
window.addEventListener("load", navigate);
