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
        <p class="text-sm text-muted mt-1">Code review and story alignment audits</p>
      </div>
      <button id="new-audit-btn" class="btn btn-primary">
        ${icon("plus", 16)}
        New Audit
      </button>
    </div>
    <div id="session-list"></div>
  `;

  document.getElementById("new-audit-btn").addEventListener("click", async () => {
    try {
      const { id } = await api.createSession();
      location.hash = `#/wizard/${id}`;
    } catch (e) {
      showToast("Failed to create session: " + e.message);
    }
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
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <h2>Start your first audit</h2>
          <p>Create a new audit session to review code changes for quality, security, and best practices.</p>
          <button id="empty-cta" class="btn btn-primary">
            ${icon("plus", 16)}
            New Audit
          </button>
        </div>`;
      document.getElementById("empty-cta")?.addEventListener("click", async () => {
        try {
          const { id } = await api.createSession();
          location.hash = `#/wizard/${id}`;
        } catch (e) {
          showToast("Failed to create session: " + e.message);
        }
      });
      return;
    }

    listEl.innerHTML = sessions.map(s => {
      const cfg = STATUS_CONFIG[s.status] || STATUS_CONFIG.created;
      const pct = s.progress?.percentage ?? 0;
      return `
        <div class="card card-clickable ${cfg.accent} mb-3" data-id="${s.id}" data-status="${s.status}">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3" style="min-width:0">
              <div style="color:var(--text-muted);flex-shrink:0">${icon("file", 18)}</div>
              <div style="min-width:0">
                <div class="font-mono text-sm truncate">${escapeHtml(s.id)}</div>
                <div class="text-xs text-muted mt-1">
                  ${s.type} &middot; ${new Date(s.created).toLocaleDateString()}
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
    }).join("");

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
