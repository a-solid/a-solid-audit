// skills/audit/scripts/public/js/views/project-view.mjs
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
  created:    { badge: "badge-created" },
  ready:      { badge: "badge-ready" },
  paused:     { badge: "badge-ready" },
  reviewing:  { badge: "badge-reviewing" },
  completed:  { badge: "badge-completed" },
  scanning:   { badge: "badge-reviewing" },
  scanned:    { badge: "badge-ready" },
  grouping:   { badge: "badge-reviewing" },
};

function getLatestSession(sessions) {
  if (!sessions || sessions.length === 0) return null;
  return sessions.slice().sort((a, b) => new Date(b.created) - new Date(a.created))[0];
}

export async function renderProjectView(container, params) {
  const projectName = params[0];
  if (!projectName) { location.hash = "#/home"; return; }

  setBreadcrumb([
    { label: "Rounds", href: "#/home" },
    { label: projectName },
  ]);

  container.innerHTML = `
    <div class="info-banner info-banner-amber mb-4" style="display:flex;align-items:center;gap:8px">
      ${icon("eye", 16)}
      <span>Viewing findings from <strong>${escapeHtml(projectName)}</strong> (read-only)</span>
    </div>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl">${escapeHtml(projectName)}</h1>
        <p class="text-sm text-muted mt-1">Cross-project round viewer</p>
      </div>
      <a href="#/home" class="btn btn-ghost">${icon("arrowLeft", 14)} Back to Local</a>
    </div>
    <div id="round-list"></div>
  `;

  const listEl = document.getElementById("round-list");
  listEl.innerHTML = Array.from({ length: 3 }, () =>
    `<div class="skeleton skeleton-card"></div>`
  ).join("");

  try {
    const rounds = await api.getProjectRounds(projectName);

    if (rounds.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">${icon("folder", 48)}</div>
          <h2>No rounds in this project</h2>
          <p>This project has no audit rounds yet.</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = `<div class="session-grid">
      ${rounds.map(r => {
        const latest = getLatestSession(r.sessions);
        const status = latest ? latest.status : "created";
        const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.created;
        const sessionCount = r.sessions ? r.sessions.length : 0;
        const latestVersion = latest ? latest.version : null;
        return `
          <div class="session-card card card-clickable" data-name="${escapeHtml(r.name)}" tabindex="0" role="button" aria-label="${escapeHtml(r.name)}, ${status}">
            <div class="flex items-center justify-between">
              <div style="min-width:0;flex:1">
                <h3 class="text-base font-semibold truncate">${escapeHtml(r.name)}</h3>
                ${r.description ? `<p class="text-sm text-muted mt-1" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(r.description)}</p>` : ""}
                <div class="text-xs text-muted mt-2">
                  ${icon("clock", 12)} <span title="${new Date(r.created).toLocaleString()}">${relativeTime(r.created)}</span>
                </div>
              </div>
              <div class="flex items-center gap-4" style="flex-shrink:0;margin-left:16px">
                ${latestVersion != null ? `<span class="badge badge-created">v${latestVersion}</span>` : ""}
                <span class="text-sm text-muted">${sessionCount} session${sessionCount !== 1 ? "s" : ""}</span>
                <span class="badge ${cfg.badge}">${status}</span>
              </div>
            </div>
          </div>`;
      }).join("")}
    </div>`;

    listEl.querySelectorAll(".card-clickable").forEach(card => {
      const handler = () => {
        const name = card.dataset.name;
        location.hash = `#/project/${encodeURIComponent(projectName)}/round/${encodeURIComponent(name)}`;
      };
      card.addEventListener("click", handler);
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handler(); }
      });
    });
  } catch (e) {
    showToast("Failed to load project rounds: " + e.message);
  }
}
