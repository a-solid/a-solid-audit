// skills/audit/scripts/public/js/views/round-detail.mjs
import { api } from "../api.mjs";
import { showToast, setBreadcrumb, icon, escapeHtml, onNavigateCleanup } from "../app.mjs";

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
  created:    { color: "text-muted",   badge: "badge-created" },
  ready:      { color: "text-warning", badge: "badge-ready" },
  reviewing:  { color: "text-info",    badge: "badge-reviewing" },
  completed:  { color: "text-success", badge: "badge-completed" },
  scanning:   { color: "text-info",    badge: "badge-reviewing" },
  scanned:    { color: "text-warning", badge: "badge-ready" },
  grouping:   { color: "text-info",    badge: "badge-reviewing" },
};

function sessionTarget(status, roundName, version) {
  if (status === "completed") return `#/round/${encodeURIComponent(roundName)}/${version}/review`;
  if (["reviewing", "scanning", "grouping"].includes(status)) return `#/round/${encodeURIComponent(roundName)}/${version}/progress`;
  return `#/round/${encodeURIComponent(roundName)}/${version}/wizard`;
}

const TYPE_ICONS = {
  code: "code",
  all: "book-open",
  project: "folder-search",
};

export async function renderRoundDetail(container, params) {
  const roundName = params[0];
  if (!roundName) { location.hash = "#/home"; return; }

  setBreadcrumb([{ label: "Rounds", href: "#/home" }]);

  container.innerHTML = `<div class="skeleton skeleton-card"></div>`;

  let round;
  let latestNotes = null;
  let pollTimer = null;

  try {
    round = await api.getRound(roundName);
  } catch (e) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">${icon("alertTriangle", 56)}</div>
        <h2>Round not found</h2>
        <p>${escapeHtml(e.message)}</p>
        <a href="#/home" class="btn btn-primary">${icon("arrowLeft", 14)} Back to Rounds</a>
      </div>`;
    return;
  }

  setBreadcrumb([
    { label: "Rounds", href: "#/home" },
    { label: round.name },
  ]);

  async function loadNotes() {
    const completedSessions = (round.sessions || []).filter(s => s.status === "completed");
    if (completedSessions.length > 0) {
      const latest = completedSessions[completedSessions.length - 1];
      try {
        latestNotes = await api.getNotes(roundName, latest.id);
      } catch { latestNotes = null; }
    }
  }

  await loadNotes();

  function hasNeedFix() {
    if (!latestNotes) return false;
    return (latestNotes.tasks || []).some(t =>
      (t.findings || []).some(f => f.status === "need-fix")
    );
  }

  function render() {
    const sessions = [...(round.sessions || [])].sort((a, b) => (a.version || 1) - (b.version || 1));
    const latestSession = sessions[sessions.length - 1];
    const latestVersion = latestSession?.version || 0;
    const showReReview = latestSession?.status === "completed" && hasNeedFix();

    container.innerHTML = `
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-2xl">${escapeHtml(round.name)}</h1>
          ${round.description ? `<p class="text-sm text-muted mt-1">${escapeHtml(round.description)}</p>` : ""}
          <p class="text-xs text-muted mt-1">${sessions.length} session${sessions.length !== 1 ? "s" : ""} &middot; Created ${relativeTime(round.created)}</p>
        </div>
        <div class="flex items-center gap-2">
          <a href="#/round/${encodeURIComponent(roundName)}/summary" class="btn btn-ghost">
            ${icon("barChart", 14)} Round Summary
          </a>
          ${showReReview ? `
            <button id="re-review-btn" class="btn btn-primary">
              ${icon("refreshCw", 14)} Re-review
            </button>
          ` : ""}
        </div>
      </div>

      <div id="re-review-panel" style="display:none"></div>

      <div id="session-timeline">
        ${sessions.length === 0 ? `
          <div class="empty-state">
            <div class="empty-state-icon">${icon("layers", 48)}</div>
            <h2>No sessions yet</h2>
            <p>Create your first review session in this round.</p>
            <button id="new-session-btn" class="btn btn-primary">${icon("plus", 14)} New Session</button>
          </div>
        ` : `
          <div class="session-timeline">
            ${sessions.map(s => {
              const cfg = STATUS_CONFIG[s.status] || STATUS_CONFIG.created;
              const pct = s.progress?.percentage ?? 0;
              const typeIcon = TYPE_ICONS[s.type] || "code";
              const typeLabel = s.type === "project" ? "Project Scan" : s.type === "all" ? "Code + Story" : "Code Review";
              const version = s.id; // s.id is "v1", "v2", etc.
              return `
                <div class="session-timeline-item card card-clickable" data-version="${version}" data-status="${s.status}" tabindex="0" role="button" aria-label="v${s.version || 1} ${s.status}">
                  <div class="session-timeline-connector">
                    <div class="version-badge">v${s.version || 1}</div>
                    <div class="session-timeline-line"></div>
                  </div>
                  <div class="session-timeline-content">
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-3" style="min-width:0">
                        <div class="session-card-type-icon">${icon(typeIcon, 18)}</div>
                        <div style="min-width:0">
                          <div class="flex items-center gap-2">
                            <span class="font-medium">${typeLabel}</span>
                            <span class="badge ${cfg.badge}">${s.status}</span>
                          </div>
                          <div class="text-xs text-muted mt-1">
                            ${relativeTime(s.created)}
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
                        ${s.status === "reviewing" ? `<span class="spinner spinner-sm"></span>` : ""}
                        ${icon("chevronRight", 14)}
                      </div>
                    </div>
                  </div>
                </div>`;
            }).join("")}
          </div>
          ${latestVersion < 10 ? `
            <div style="margin-top:var(--space-4)">
              <button id="new-session-btn" class="btn btn-ghost" style="border-color:var(--border)">
                ${icon("plus", 14)} New Session
              </button>
            </div>
          ` : ""}
        `}
      </div>
    `;

    // Session card click handlers
    container.querySelectorAll(".session-timeline-item").forEach(item => {
      const handler = () => {
        const version = item.dataset.version;
        const status = item.dataset.status;
        location.hash = sessionTarget(status, roundName, version);
      };
      item.addEventListener("click", handler);
      item.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handler(); }
      });
    });

    // New session button
    const newSessionBtn = document.getElementById("new-session-btn");
    if (newSessionBtn) {
      newSessionBtn.addEventListener("click", async () => {
        newSessionBtn.disabled = true;
        newSessionBtn.innerHTML = '<span class="spinner spinner-sm"></span> Creating...';
        try {
          const { version } = await api.createRoundSession(roundName, { type: "code" });
          location.hash = `#/round/${encodeURIComponent(roundName)}/v${version}/wizard`;
        } catch (e) {
          showToast("Failed to create session: " + e.message);
          newSessionBtn.disabled = false;
          newSessionBtn.innerHTML = `${icon("plus", 14)} New Session`;
        }
      });
    }

    // Re-review button
    const reReviewBtn = document.getElementById("re-review-btn");
    if (reReviewBtn) {
      reReviewBtn.addEventListener("click", () => {
        renderReReviewPanel();
      });
    }
  }

  function renderReReviewPanel() {
    const panel = document.getElementById("re-review-panel");
    if (!panel || !latestNotes) return;

    const needFixFiles = [];
    const otherFiles = [];
    for (const task of latestNotes.tasks || []) {
      const findings = task.findings || [];
      const hasNeedFix = findings.some(f => f.status === "need-fix");
      // Extract source file paths from findings
      const files = [...new Set(findings.map(f => f.file).filter(Boolean))];
      if (hasNeedFix) {
        for (const f of files) needFixFiles.push(f);
      } else if (files.length > 0) {
        for (const f of files) otherFiles.push(f);
      }
    }

    panel.style.display = "block";
    panel.innerHTML = `
      <div class="card mb-4 re-review-panel">
        <h3 class="font-semibold mb-3">${icon("refreshCw", 16)} Re-review Files</h3>
        <p class="text-sm text-muted mb-3">Select files to include in the next review pass. Need-fix files are pre-selected.</p>

        ${needFixFiles.length > 0 ? `
          <div class="mb-3">
            <div class="text-xs font-semibold text-warning mb-2">FILES TO RE-REVIEW</div>
            ${needFixFiles.map(f => `
              <label class="re-review-file-item">
                <input type="checkbox" checked data-file="${escapeHtml(f)}" class="re-review-check" />
                <span class="text-sm">${escapeHtml(f)}</span>
                <span class="badge badge-created text-xs" style="margin-left:auto">need-fix</span>
              </label>
            `).join("")}
          </div>
        ` : ""}

        ${otherFiles.length > 0 ? `
          <div class="mb-3">
            <div class="text-xs font-semibold text-muted mb-2">PREVIOUSLY RESOLVED FILES</div>
            ${otherFiles.map(f => `
              <label class="re-review-file-item">
                <input type="checkbox" data-file="${escapeHtml(f)}" class="re-review-check" />
                <span class="text-sm text-muted">${escapeHtml(f)}</span>
                <span class="badge badge-completed text-xs" style="margin-left:auto">resolved</span>
              </label>
            `).join("")}
          </div>
        ` : ""}

        <div class="flex items-center gap-2 mt-4">
          <button id="start-re-review-btn" class="btn btn-primary">
            ${icon("zap", 14)} Start Re-review
          </button>
          <button id="cancel-re-review-btn" class="btn btn-ghost">Cancel</button>
        </div>
      </div>
    `;

    document.getElementById("cancel-re-review-btn").addEventListener("click", () => {
      panel.style.display = "none";
    });

    document.getElementById("start-re-review-btn").addEventListener("click", async () => {
      const btn = document.getElementById("start-re-review-btn");
      const checked = panel.querySelectorAll(".re-review-check:checked");
      const files = [...checked].map(c => c.dataset.file);

      if (files.length === 0) {
        showToast("Select at least one file to re-review", "warning");
        return;
      }

      btn.disabled = true;
      btn.innerHTML = '<span class="spinner spinner-sm"></span> Creating session...';
      try {
        const result = await api.reReview(roundName, { files });
        location.hash = `#/round/${encodeURIComponent(roundName)}/v${result.version}/progress`;
      } catch (e) {
        showToast("Failed to start re-review: " + e.message);
        btn.disabled = false;
        btn.innerHTML = `${icon("zap", 14)} Start Re-review`;
      }
    });
  }

  function startPolling() {
    pollTimer = setInterval(async () => {
      try {
        round = await api.getRound(roundName);
        const hasActive = round.sessions.some(s => ["reviewing", "scanning", "grouping"].includes(s.status));
        if (hasActive) {
          render();
        }
      } catch { /* ignore */ }
    }, 5000);
  }

  render();
  startPolling();

  onNavigateCleanup(() => {
    if (pollTimer) clearInterval(pollTimer);
  });
}
