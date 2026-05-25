// skills/audit/scripts/public/js/views/home.mjs
import { api } from "../api.mjs";
import { showToast, setBreadcrumb, icon, escapeHtml } from "../app.mjs";

function relativeTime(dateStr) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

const STATUS_CONFIG = {
  created:    { color: "text-muted",   accent: "",                    badge: "badge-created" },
  scoped:     { color: "text-info",    accent: "card-accent-info",    badge: "badge-scoped" },
  ready:      { color: "text-warning", accent: "card-accent-warning", badge: "badge-ready" },
  reviewing:  { color: "text-info",    accent: "card-accent-info",    badge: "badge-reviewing" },
  completed:  { color: "text-success", accent: "card-accent-success", badge: "badge-completed" },
};

export async function renderHome(container) {
  setBreadcrumb([]);

  container.innerHTML = `
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl">Sessions</h1>
        <p class="text-sm text-muted mt-1">Code reviews, story alignment, and project scans</p>
      </div>
      <button id="new-audit-btn" class="btn btn-primary">
        ${icon("plus", 16)}
        New Audit
      </button>
    </div>
    <div id="session-list"></div>
  `;

  document.getElementById("new-audit-btn").addEventListener("click", () => {
    location.hash = "#/wizard/new";
  });

  const listEl = document.getElementById("session-list");
  listEl.innerHTML = Array.from({ length: 3 }, () =>
    `<div class="skeleton skeleton-card"></div>`
  ).join("");

  try {
    const sessions = await api.listSessions();

    if (sessions.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              <line x1="8" y1="11" x2="14" y2="11"/>
              <line x1="8" y1="14" x2="14" y2="14"/>
              <line x1="8" y1="8" x2="12" y2="8"/>
            </svg>
          </div>
          <h2>No audit sessions yet</h2>
          <p>Start by auditing specific code changes, or scan an entire project for comprehensive analysis.</p>
          <div class="empty-state-cta-row">
            <a href="#/wizard/new?type=code" class="btn btn-primary">${icon("code", 16)} Code Review</a>
            <a href="#/wizard/new?type=project" class="btn btn-ghost" style="border-color:var(--border)">${icon("folder-search", 16)} Project Scan</a>
          </div>
        </div>
      `;
      return;
    }

    listEl.innerHTML = `<div class="session-grid">
      ${sessions.map(s => {
      const cfg = STATUS_CONFIG[s.status] || STATUS_CONFIG.created;
      const pct = s.progress?.percentage ?? 0;
      const isProject = s.type === "project";
      const typeIcon = s.type === "code" ? icon("code", 18)
        : s.type === "all" ? icon("book-open", 18)
        : icon("folder-search", 18);
      const typeLabel = isProject ? "Project Scan" : s.type === "all" ? "Code + Story" : "Code Review";
      const progressLabel = s.totalTasks ? `${s.reviewedTasks || 0}/${s.totalTasks}` : '';
      return `
        <div class="session-card card card-clickable ${cfg.accent}" data-id="${s.id}" data-status="${s.status}" data-type="${s.type}">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3" style="min-width:0">
              <div class="session-card-type-icon">${typeIcon}</div>
              <div style="min-width:0">
                <div class="font-mono text-sm truncate">${escapeHtml(s.id)}</div>
                <div class="text-xs text-muted mt-1">
                  ${typeLabel} &middot; <span class="session-time" title="${new Date(s.created).toLocaleString()}">${relativeTime(s.created)}</span>
                </div>
              </div>
            </div>
            <div class="flex items-center gap-4" style="flex-shrink:0">
              ${s.progress ? `
                <div style="width:100px">
                  <div class="progress-bar progress-bar-lg">
                    <div class="progress-fill${s.status === "completed" ? " progress-fill-success" : ""}" style="width:${pct}%"></div>
                  </div>
                  <div class="text-xs text-muted mt-1 text-right">${s.progress.reviewed}/${s.progress.total}</div>
                </div>
              ` : ""}
              ${progressLabel ? `<span class="session-progress-label">${progressLabel}</span>` : ''}
              <span class="badge ${cfg.badge}">${s.status}</span>
            </div>
          </div>
        </div>`;
    }).join("")}
    </div>`;

    listEl.querySelectorAll(".card-clickable").forEach(card => {
      card.addEventListener("click", () => {
        const id = card.dataset.id;
        const status = card.dataset.status;
        if (status === "completed") location.hash = `#/review/${id}`;
        else if (status === "created" || status === "scoped") location.hash = `#/wizard/${id}`;
        else location.hash = `#/progress/${id}`;
      });
    });
  } catch (e) {
    showToast("Failed to load sessions: " + e.message);
  }
}
