// skills/audit/scripts/public/js/views/progress.mjs
import { api } from "../api.mjs";
import { showToast, setBreadcrumb, icon, escapeHtml, onNavigateCleanup } from "../app.mjs";

export async function renderProgress(container, params) {
  const sessionId = params[0];
  let pollFailures = 0;
  let pollTimer = null;

  setBreadcrumb([
    { label: "Sessions", href: "#/home" },
    { label: "In Progress" },
  ]);

  container.innerHTML = `
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl">AI Review in Progress</h1>
        <p class="text-sm text-muted mt-1">Keep the AI terminal open.</p>
      </div>
      <div class="flex items-center gap-2">
        <div id="session-badge"></div>
        <button id="view-findings-btn" class="btn btn-ghost btn-sm hidden" aria-label="View findings">${icon("eye", 14)} Findings</button>
        <button id="view-summary-btn" class="btn btn-ghost btn-sm hidden" aria-label="View summary">${icon("barChart", 14)} Summary</button>
      </div>
    </div>

    <div class="card mb-4">
      <div class="flex items-center justify-between mb-3">
        <div id="progress-text" class="text-sm text-secondary"></div>
        <div id="progress-pct" class="text-sm font-mono font-semibold"></div>
      </div>
      <div class="progress-bar progress-bar-lg">
        <div id="progress-fill" class="progress-fill" style="width:0%"></div>
      </div>
    </div>

    <div id="task-list" class="space-y-2"></div>

    <div id="poll-warning" class="hidden mt-4">
      <div class="info-banner info-banner-amber">
        ${icon("alertTriangle", 16)}
        <span>Connection issues detected.</span>
        <button id="manual-refresh-btn" class="btn btn-sm ml-3" aria-label="Refresh">Refresh</button>
      </div>
    </div>
  `;

  async function poll() {
    try {
      const session = await api.getSession(sessionId);
      const tasks = await api.getTasks(sessionId);
      pollFailures = 0;
      document.getElementById("poll-warning").classList.add("hidden");

      const total = tasks.length;
      const reviewed = tasks.filter(t => t.status === "reviewed").length;
      const pct = total ? Math.round((reviewed / total) * 100) : 0;

      document.getElementById("progress-fill").style.width = pct + "%";
      document.getElementById("progress-text").textContent = `${reviewed} of ${total} tasks reviewed`;
      document.getElementById("progress-pct").textContent = pct + "%";
      document.getElementById("session-badge").innerHTML = `<span class="badge badge-${escapeHtml(session.status)}">${escapeHtml(session.status)}</span>`;

      // Show findings/summary buttons once tasks are reviewed
      const findingsBtn = document.getElementById("view-findings-btn");
      const summaryBtn = document.getElementById("view-summary-btn");
      if (reviewed > 0) {
        findingsBtn.classList.remove("hidden");
        summaryBtn.classList.remove("hidden");
      }

      document.getElementById("task-list").innerHTML = tasks.map(t => {
        const isReviewing = t.status === "reviewing";
        const isReviewed = t.status === "reviewed";
        const scoreColor = t.review?.score >= 7 ? "text-success" : t.review?.score >= 4 ? "text-warning" : "text-danger";
        return `
          <div class="card flex items-center justify-between" style="padding:var(--space-3) var(--space-4)">
            <div class="flex items-center gap-3" style="min-width:0">
              ${isReviewing
                ? `<span class="spinner spinner-sm" style="flex-shrink:0"></span>`
                : isReviewed
                  ? `<span style="color:var(--accent);flex-shrink:0">${icon("check", 16)}</span>`
                  : `<span style="color:var(--text-muted);flex-shrink:0">${icon("clock", 16)}</span>`
              }
              <span class="text-sm font-mono truncate">${escapeHtml(t.name || t.file)}</span>
            </div>
            <div class="flex items-center gap-3" style="flex-shrink:0">
              ${t.review?.score ? `<span class="text-sm font-mono ${scoreColor}">${t.review.score}/10</span>` : ""}
              <span class="badge badge-${t.status === "reviewing" ? "reviewing-task" : escapeHtml(t.status)}">${escapeHtml(t.status)}</span>
            </div>
          </div>`;
      }).join("");

      if (reviewed === total && total > 0 && session.status === "completed") {
        clearInterval(pollTimer);
        location.hash = `#/review/${sessionId}`;
        return;
      }

      if (session.status === "scoped") {
        document.getElementById("progress-text").textContent = "Waiting for AI review to begin...";
      }
    } catch (e) {
      pollFailures++;
      if (pollFailures >= 3) {
        document.getElementById("poll-warning").classList.remove("hidden");
        clearInterval(pollTimer);
      }
    }
  }

  document.getElementById("manual-refresh-btn").addEventListener("click", () => {
    pollFailures = 0;
    if (pollTimer) clearInterval(pollTimer);
    poll();
    pollTimer = setInterval(poll, 3000);
  });

  document.getElementById("view-findings-btn").addEventListener("click", () => {
    if (pollTimer) clearInterval(pollTimer);
    location.hash = `#/review/${sessionId}`;
  });
  document.getElementById("view-summary-btn").addEventListener("click", () => {
    if (pollTimer) clearInterval(pollTimer);
    location.hash = `#/summary/${sessionId}`;
  });

  await poll();
  pollTimer = setInterval(poll, 3000);

  // Cleanup on navigation
  onNavigateCleanup(() => {
    if (pollTimer) clearInterval(pollTimer);
  });
}
