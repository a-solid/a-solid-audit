// skills/audit/scripts/public/js/views/progress.mjs
import { api } from "../api.mjs";
import { showToast, setBreadcrumb, icon, escapeHtml, onNavigateCleanup } from "../app.mjs";
import { ENTRY_TYPES } from "../constants.mjs";

export async function renderProgress(container, params) {
  const sessionId = params[0];
  let pollFailures = 0;
  let pollTimer = null;
  let pollInterval = 3000;
  let lastReviewedCount = 0;
  let stableCount = 0;

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
        <div id="progress-text" class="text-sm text-secondary" aria-live="polite" aria-atomic="true"></div>
        <div id="progress-pct" class="text-sm font-mono font-semibold" aria-live="polite" aria-atomic="true"></div>
      </div>
      <div class="progress-bar progress-bar-lg">
        <div id="progress-fill" class="progress-fill" style="width:0%"></div>
      </div>
    </div>

    <div id="task-list" class="space-y-2" role="list" aria-label="Task progress"></div>

    <div id="scan-overlay" class="hidden card" style="text-align:center;padding:var(--space-8) var(--space-6);margin-bottom:var(--space-4)">
      <div style="margin-bottom:var(--space-4);color:var(--info)">${icon("search", 48)}</div>
      <h2 class="text-lg mb-2">Project Scan</h2>
      <p class="text-sm text-muted mb-4" style="max-width:400px;margin:0 auto">Discover entry points and call chains. This may take a minute for large projects.</p>
      <div id="scan-status" class="text-sm text-muted mb-4 hidden"></div>
      <button id="start-scan-btn" class="btn btn-primary">${icon("search", 14)} Start Scan</button>
    </div>

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
      pollFailures = 0;
      document.getElementById("poll-warning").classList.add("hidden");

      // Handle project sessions in created/scanning state
      const scanOverlay = document.getElementById("scan-overlay");
      const scanStatusEl = document.getElementById("scan-status");
      const startBtn = document.getElementById("start-scan-btn");

      if (session.type === "project" && (session.status === "created" || session.status === "scanning")) {
        scanOverlay.classList.remove("hidden");
        document.getElementById("task-list").innerHTML = "";
        document.getElementById("progress-text").textContent = "Project scan not started";
        document.getElementById("progress-pct").textContent = "";
        document.getElementById("progress-fill").style.width = "0%";
        document.getElementById("session-badge").innerHTML = `<span class="badge badge-${escapeHtml(session.status)}">${escapeHtml(session.status)}</span>`;

        if (session.status === "scanning") {
          startBtn.classList.add("hidden");
          scanStatusEl.classList.remove("hidden");
          try {
            const scanStatus = await api.getScanStatus(sessionId);
            scanStatusEl.textContent = scanStatus.progress || "Scanning...";
          } catch { scanStatusEl.textContent = "Scanning..."; }
        }

        pollTimer = setTimeout(poll, 3000);
        return;
      }

      if (scanOverlay) scanOverlay.classList.add("hidden");

      const tasks = await api.getTasks(sessionId);

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
          <div class="card flex items-center justify-between" role="listitem" style="padding:var(--space-3) var(--space-4)">
            <div class="flex items-center gap-3" style="min-width:0">
              ${isReviewing
                ? `<span class="spinner spinner-sm" style="flex-shrink:0"></span>`
                : isReviewed
                  ? `<span style="color:var(--accent);flex-shrink:0">${icon("check", 16)}</span>`
                  : `<span style="color:var(--text-muted);flex-shrink:0">${icon("clock", 16)}</span>`
              }
              <span class="text-sm font-mono truncate">${t.type && ENTRY_TYPES[t.type] ? `<span class="badge entry-type-badge" style="background:${ENTRY_TYPES[t.type].color}20;color:${ENTRY_TYPES[t.type].color};border:1px solid ${ENTRY_TYPES[t.type].color}40;margin-right:6px">${ENTRY_TYPES[t.type].label}</span>` : ""}${escapeHtml(t.name || t.file)}</span>
            </div>
            <div class="flex items-center gap-3" style="flex-shrink:0">
              ${t.review?.score ? `<span class="text-sm font-mono ${scoreColor}">${t.review.score}/10</span>` : ""}
              <span class="badge badge-${t.status === "reviewing" ? "reviewing-task" : escapeHtml(t.status)}">${escapeHtml(t.status)}</span>
            </div>
          </div>`;
      }).join("");

      if (reviewed === total && total > 0 && session.status === "completed") {
        location.hash = `#/review/${sessionId}`;
        return; // Stop polling
      }

      if (session.status === "scoped") {
        document.getElementById("progress-text").textContent = "Waiting for AI review to begin...";
      }

      // Adaptive backoff: increase interval when progress is stable
      if (reviewed === lastReviewedCount) {
        stableCount++;
      } else {
        stableCount = 0;
        lastReviewedCount = reviewed;
      }
      if (stableCount > 3) {
        pollInterval = Math.min(pollInterval + 1000, 8000);
      } else {
        pollInterval = 3000;
      }

    } catch (e) {
      pollFailures++;
      if (pollFailures >= 3) {
        document.getElementById("poll-warning").classList.remove("hidden");
        return; // Stop polling
      }
    }

    // Schedule next poll
    pollTimer = setTimeout(poll, pollInterval);
  }

  document.getElementById("start-scan-btn").addEventListener("click", async () => {
    const startBtn = document.getElementById("start-scan-btn");
    const scanStatusEl = document.getElementById("scan-status");
    startBtn.disabled = true;
    startBtn.textContent = "Starting scan...";
    scanStatusEl.classList.remove("hidden");
    scanStatusEl.textContent = "Initiating scan...";
    try {
      await api.startScan(sessionId);
      scanStatusEl.textContent = "Scanning in progress...";
      pollInterval = 3000;
      pollTimer = setTimeout(poll, pollInterval);
    } catch (e) {
      startBtn.disabled = false;
      startBtn.innerHTML = `${icon("search", 14)} Start Scan`;
      scanStatusEl.textContent = "Scan failed: " + e.message;
      showToast("Scan failed: " + e.message, "error");
    }
  });

  document.getElementById("manual-refresh-btn").addEventListener("click", () => {
    pollFailures = 0;
    if (pollTimer) clearTimeout(pollTimer);
    pollInterval = 3000;
    poll();
  });

  document.getElementById("view-findings-btn").addEventListener("click", () => {
    if (pollTimer) clearTimeout(pollTimer);
    location.hash = `#/review/${sessionId}`;
  });
  document.getElementById("view-summary-btn").addEventListener("click", () => {
    if (pollTimer) clearTimeout(pollTimer);
    location.hash = `#/summary/${sessionId}`;
  });

  await poll();

  // Cleanup on navigation
  onNavigateCleanup(() => {
    if (pollTimer) clearTimeout(pollTimer);
  });
}
