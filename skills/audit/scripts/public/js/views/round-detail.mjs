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
  paused:     { color: "text-warning", badge: "badge-ready" },
};

function sessionTarget(status, roundName, version) {
  if (status === "completed") return `#/round/${encodeURIComponent(roundName)}/${version}/review`;
  if (["reviewing", "scanning", "grouping", "paused"].includes(status)) return `#/round/${encodeURIComponent(roundName)}/${version}/progress`;
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
      const latest = completedSessions.reduce((a, b) => (a.version || 0) > (b.version || 0) ? a : b);
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
            ${icon("fileText", 14)} View Report
          </a>
          ${latestVersion < 10 ? `
            <button id="new-session-btn" class="btn btn-ghost">
              ${icon("plus", 14)} Start New Review
            </button>
          ` : ""}
          ${showReReview ? `
            <button id="re-review-btn" class="btn btn-primary">
              ${icon("refreshCw", 14)} Fix &amp; Re-check
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

    // Build task-level info from notes
    const taskMap = new Map();
    for (const task of latestNotes.tasks || []) {
      const findings = task.findings || [];
      if (findings.length === 0) continue;
      const needFixCount = findings.filter(f => f.status === "need-fix").length;
      const totalFindings = findings.length;
      const sourceFiles = [...new Set(findings.map(f => f.file).filter(Boolean))];
      const isStory = task.file.startsWith("story-tasks/");
      taskMap.set(task.file, {
        file: task.file,
        sourceFiles,
        isStory,
        needFixCount,
        totalFindings,
        hasNeedFix: needFixCount > 0,
        score: task.review?.score ?? null,
      });
    }

    const needFixTasks = [];
    const resolvedTasks = [];
    for (const [, t] of taskMap) {
      if (t.hasNeedFix) needFixTasks.push(t);
      else resolvedTasks.push(t);
    }
    needFixTasks.sort((a, b) => a.file.localeCompare(b.file));
    resolvedTasks.sort((a, b) => a.file.localeCompare(b.file));

    function shortName(taskFile) {
      const base = taskFile.split("/").pop().replace(/\.yaml$/, "");
      return base;
    }

    function taskLabel(t) {
      const name = shortName(t.file);
      const typeTag = t.isStory ? " (story)" : "";
      return `${escapeHtml(name)}${typeTag}`;
    }

    function taskSourceLine(t) {
      if (t.sourceFiles.length === 0) return "";
      return `<div class="text-xs text-muted">${t.sourceFiles.map(f => escapeHtml(f)).join(", ")}</div>`;
    }

    // Fetch previous review context
    const completedSessions = (round.sessions || [])
      .filter(s => s.status === "completed")
      .sort((a, b) => (b.version || 0) - (a.version || 0));
    const prevVersion = completedSessions[0]?.id;
    let previousContext = "";
    if (prevVersion) {
      api.getReviewContext(roundName, prevVersion).then(ctx => {
        previousContext = ctx.context || "";
        const ta = document.getElementById("re-review-context");
        if (ta && !ta.value) ta.value = previousContext;
      }).catch(() => {});
    }

    // ---- Step 1: Task selection + context ----
    panel.style.display = "block";
    panel.innerHTML = `
      <div class="card mb-4 re-review-panel">
        <h3 class="font-semibold mb-3">${icon("refreshCw", 16)} Select Tasks to Re-check</h3>
        <p class="text-sm text-muted mb-3">Select tasks to include in the next review pass. Tasks with need-fix findings are pre-selected.</p>

        ${needFixTasks.length > 0 ? `
          <div class="mb-3">
            <div class="text-xs font-semibold text-warning mb-2">NEED-FIX TASKS</div>
            ${needFixTasks.map(t => `
              <label class="re-review-file-item">
                <input type="checkbox" checked data-task="${escapeHtml(t.file)}" class="re-review-check" />
                <div style="min-width:0;flex:1">
                  <div class="text-sm">${taskLabel(t)}</div>
                  ${taskSourceLine(t)}
                </div>
                <span class="text-xs" style="margin-left:auto;white-space:nowrap">${t.needFixCount} need-fix, ${t.totalFindings} findings${t.score !== null ? ` — Score: ${escapeHtml(String(t.score))}` : ""}</span>
              </label>
            `).join("")}
          </div>
        ` : ""}

        ${resolvedTasks.length > 0 ? `
          <div class="mb-3">
            <div class="text-xs font-semibold text-muted mb-2">RESOLVED TASKS</div>
            ${resolvedTasks.map(t => `
              <label class="re-review-file-item">
                <input type="checkbox" data-task="${escapeHtml(t.file)}" class="re-review-check" />
                <div style="min-width:0;flex:1">
                  <div class="text-sm text-muted">${taskLabel(t)}</div>
                  ${taskSourceLine(t)}
                </div>
                <span class="text-xs text-muted" style="margin-left:auto;white-space:nowrap">${t.totalFindings} findings${t.score !== null ? ` — Score: ${escapeHtml(String(t.score))}` : ""}</span>
              </label>
            `).join("")}
          </div>
        ` : ""}

        <details class="mb-3" style="border-top:1px solid var(--border);padding-top:var(--space-3)">
          <summary class="text-sm cursor-pointer" style="color:var(--text-muted)">Review Context (optional)</summary>
          <textarea id="re-review-context" class="form-input mt-2" rows="4" placeholder="Additional instructions or context for this re-check..." style="width:100%;resize:vertical;font-size:var(--text-sm)"></textarea>
        </details>

        <div class="flex items-center gap-2 mt-4">
          <button id="re-review-next-btn" class="btn btn-primary">
            ${icon("arrowRight", 14)} Next
          </button>
          <button id="cancel-re-review-btn" class="btn btn-ghost">Cancel</button>
        </div>
      </div>
    `;

    document.getElementById("cancel-re-review-btn").addEventListener("click", () => {
      panel.style.display = "none";
    });

    document.getElementById("re-review-next-btn").addEventListener("click", () => {
      const checked = panel.querySelectorAll(".re-review-check:checked");
      const tasks = [...checked].map(c => c.dataset.task);

      if (tasks.length === 0) {
        showToast("Select at least one task to re-check", "warning");
        return;
      }

      const reviewContext = (document.getElementById("re-review-context")?.value || "").trim();
      const codeCount = tasks.filter(t => !t.startsWith("story-tasks/")).length;
      const storyCount = tasks.filter(t => t.startsWith("story-tasks/")).length;

      // ---- Step 2: Confirmation ----
      panel.innerHTML = `
        <div class="card mb-4 re-review-panel">
          <h3 class="font-semibold mb-3">${icon("refreshCw", 16)} Confirm Re-check</h3>

          <div class="card" style="background:var(--bg-surface)">
            <div class="text-sm mb-2">
              <span class="text-muted">Type:</span>
              <span class="font-medium">${round.sessions?.find(s => s.status === "completed")?.type === "all" ? "Code + Story" : "Code Review"}</span>
            </div>
            <div class="text-sm mb-2">
              <span class="text-muted">Tasks:</span>
              <span class="font-medium">${codeCount} code task${codeCount !== 1 ? "s" : ""}${storyCount > 0 ? ` + ${storyCount} story task${storyCount !== 1 ? "s" : ""}` : ""}</span>
            </div>
            <div class="text-sm">
              <span class="text-muted">Scope:</span>
              <span class="font-medium">Uncommitted changes + original task diffs</span>
            </div>
            ${reviewContext ? `
              <div class="text-sm mt-2" style="border-top:1px solid var(--border);padding-top:var(--space-2)">
                <span class="text-muted">Context:</span>
                <div class="mt-1" style="white-space:pre-wrap;max-height:80px;overflow-y:auto">${escapeHtml(reviewContext)}</div>
              </div>
            ` : ""}
          </div>

          <div class="flex items-center gap-2 mt-4">
            <button id="start-re-review-btn" class="btn btn-primary">
              ${icon("zap", 14)} Start Re-check
            </button>
            <button id="back-re-review-btn" class="btn btn-ghost">${icon("arrowLeft", 14)} Back</button>
          </div>
        </div>
      `;

      document.getElementById("back-re-review-btn").addEventListener("click", () => {
        renderReReviewPanel();
      });

      document.getElementById("start-re-review-btn").addEventListener("click", async () => {
        const btn = document.getElementById("start-re-review-btn");
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner spinner-sm"></span> Creating session...';
        try {
          const result = await api.reReview(roundName, { tasks, reviewContext: reviewContext || undefined });
          await api.advance(roundName, `v${result.version}`, { action: "start" });
          location.hash = `#/round/${encodeURIComponent(roundName)}/v${result.version}/progress`;
        } catch (e) {
          showToast("Failed to start re-check: " + e.message);
          btn.disabled = false;
          btn.innerHTML = `${icon("zap", 14)} Start Re-check`;
        }
      });
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
