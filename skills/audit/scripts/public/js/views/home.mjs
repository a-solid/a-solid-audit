// skills/audit/scripts/public/js/views/home.mjs
import { api } from "../api.mjs";
import { showToast, setBreadcrumb, icon, escapeHtml } from "../app.mjs";

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
            ${icon("inbox", 56)}
          </div>
          <h2>Start your first audit</h2>
          <p>Create a new audit session to review code changes for quality, security, and best practices.</p>
          <button id="empty-cta" class="btn btn-primary">
            ${icon("plus", 16)}
            New Audit
          </button>
        </div>`;
      document.getElementById("empty-cta")?.addEventListener("click", () => {
        location.hash = "#/wizard/new";
      });
      return;
    }

    listEl.innerHTML = `<div class="session-grid">
      ${sessions.map(s => {
      const cfg = STATUS_CONFIG[s.status] || STATUS_CONFIG.created;
      const pct = s.progress?.percentage ?? 0;
      const isProject = s.type === "project";
      const sessionIcon = isProject ? icon("search", 18) : icon("file", 18);
      const typeLabel = isProject ? "Project Scan" : s.type === "all" ? "Code + Story" : "Code Review";
      return `
        <div class="card card-clickable ${cfg.accent}" data-id="${s.id}" data-status="${s.status}" data-type="${s.type}">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3" style="min-width:0">
              <div style="color:${isProject ? "var(--info)" : "var(--text-muted)"};flex-shrink:0">${sessionIcon}</div>
              <div style="min-width:0">
                <div class="font-mono text-sm truncate">${escapeHtml(s.id)}</div>
                <div class="text-xs text-muted mt-1">
                  ${typeLabel} &middot; ${new Date(s.created).toLocaleDateString()}
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
