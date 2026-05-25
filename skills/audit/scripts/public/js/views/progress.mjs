// skills/audit/scripts/public/js/views/progress.mjs
import { api } from "../api.mjs";
import { showToast, setBreadcrumb, icon, escapeHtml, onNavigateCleanup, renderTerminalCard } from "../app.mjs";
import { ENTRY_TYPES } from "../constants.mjs";

export async function renderProgress(container, params) {
  const sessionId = params[0];
  let pollFailures = 0;
  let pollTimer = null;
  let pollInterval = 3000;
  let lastReviewedCount = 0;
  let stableCount = 0;
  let scanStarted = false;
  let logEventSource = null;

  const shortId = sessionId ? sessionId.slice(0, 7) : "";
  setBreadcrumb([
    { label: "Sessions", href: "#/home" },
    ...(shortId ? [{ label: shortId, href: `#/progress/${sessionId}` }] : []),
    { label: "Progress" },
  ]);

  container.innerHTML = `
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl" id="progress-heading">Loading...</h1>
        <p class="text-sm text-muted mt-1" id="progress-subtitle"></p>
      </div>
      <div class="flex items-center gap-2">
        <div id="session-badge"></div>
        <button id="view-findings-btn" class="btn btn-ghost btn-sm hidden" aria-label="View findings">${icon("eye", 14)} Findings</button>
        <button id="view-summary-btn" class="btn btn-ghost btn-sm hidden" aria-label="View summary">${icon("barChart", 14)} Summary</button>
        <button id="cancel-scan-btn" class="btn btn-ghost btn-sm hidden" style="color:var(--danger);border-color:rgba(239,68,68,0.3)" aria-label="Cancel scan">${icon("x", 14)} Cancel</button>
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
      <p class="text-sm text-muted mb-4" style="max-width:400px;margin:0 auto">Discovering entry points and analyzing call chains. This may take a minute for large projects.</p>
      <div id="scan-status" class="text-sm text-muted mb-4 hidden"></div>
      <div class="scan-log-section">
        <button id="scan-log-toggle" class="scan-log-toggle">
          <span class="toggle-icon">${icon("chevronRight", 10)}</span> Scan Log
        </button>
        <div id="scan-log-panel" class="scan-log-panel"></div>
      </div>
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

  function updateHeading(isProject, phase) {
    const heading = document.getElementById("progress-heading");
    const subtitle = document.getElementById("progress-subtitle");
    if (!heading) return;
    if (isProject) {
      if (phase === "scanning") {
        heading.textContent = "Scanning Project";
        subtitle.textContent = "Discovering entry points and call chains...";
      } else if (phase === "scanned") {
        heading.textContent = "Scan Complete";
        subtitle.textContent = "Ready for file grouping.";
      } else if (phase === "grouping") {
        heading.textContent = "Grouping Files";
        subtitle.textContent = "AI is analyzing dependencies...";
      } else if (phase === "reviewing") {
        heading.textContent = "AI Review in Progress";
        subtitle.textContent = "Reviewing scanned entry points.";
      } else {
        heading.textContent = "Project Scan";
        subtitle.textContent = "";
      }
    } else {
      heading.textContent = "AI Review in Progress";
      subtitle.textContent = "Keep the AI terminal open.";
    }
  }

  function startLogStream() {
    if (logEventSource) return;
    const logPanel = document.getElementById("scan-log-panel");
    const logToggle = document.getElementById("scan-log-toggle");
    if (!logPanel) return;

    logEventSource = new EventSource(`/api/sessions/${sessionId}/scan/logs`);

    logEventSource.onmessage = (e) => {
      try {
        const entry = JSON.parse(e.data);
        const div = document.createElement("div");
        div.className = "scan-log-entry";
        div.innerHTML = `<span class="log-time">${escapeHtml(entry.timestamp)}</span>${escapeHtml(entry.message)}`;
        logPanel.appendChild(div);
        logPanel.scrollTop = logPanel.scrollHeight;

        // Auto-expand on first entry
        if (!logPanel.classList.contains("open")) {
          logPanel.classList.add("open");
          if (logToggle) logToggle.classList.add("open");
        }
      } catch {}
    };

    logEventSource.onerror = () => {
      logEventSource?.close();
      logEventSource = null;
    };
  }

  function stopLogStream() {
    if (logEventSource) {
      logEventSource.close();
      logEventSource = null;
    }
  }

  async function poll() {
    try {
      const session = await api.getSession(sessionId);
      pollFailures = 0;
      document.getElementById("poll-warning").classList.add("hidden");

      const scanOverlay = document.getElementById("scan-overlay");

      if (session.type === "project" && ["created", "scanning", "scanned", "grouping", "ready"].includes(session.status)) {
        if (session.status === "scanning") {
          scanOverlay.classList.remove("hidden");
          updateHeading(true, session.status);
          document.getElementById("task-list").innerHTML = "";
          document.getElementById("progress-text").textContent = "";
          document.getElementById("progress-pct").textContent = "";
          document.getElementById("progress-fill").style.width = "0%";
          document.getElementById("session-badge").innerHTML = `<span class="badge badge-${escapeHtml(session.status)}">${escapeHtml(session.status)}</span>`;
          const scanStatusEl = document.getElementById("scan-status");
          scanStatusEl.classList.remove("hidden");
          scanStatusEl.innerHTML = `<span class="spinner spinner-sm"></span> Scanning in progress...`;
          document.getElementById("start-scan-btn").classList.add("hidden");
          pollTimer = setTimeout(poll, 3000);
          return;
        }

        if (session.status === "grouping") {
          scanOverlay.classList.remove("hidden");
          updateHeading(true, "grouping");
          document.getElementById("task-list").innerHTML = "";
          document.getElementById("progress-text").textContent = "";
          document.getElementById("progress-pct").textContent = "";
          document.getElementById("progress-fill").style.width = "0%";
          document.getElementById("session-badge").innerHTML = `<span class="badge badge-${escapeHtml(session.status)}">${escapeHtml(session.status)}</span>`;
          const scanStatusEl = document.getElementById("scan-status");
          scanStatusEl.classList.remove("hidden");
          scanStatusEl.innerHTML = `<span class="spinner spinner-sm"></span> Grouping in progress...`;
          document.getElementById("start-scan-btn").classList.add("hidden");
          pollTimer = setTimeout(poll, 3000);
          return;
        }

        // scanned or ready — show terminal card
        scanOverlay.classList.remove("hidden");
        const phase = session.status === "scanned" ? "scanned" : "ready";
        updateHeading(true, phase);
        document.getElementById("task-list").innerHTML = "";
        document.getElementById("progress-text").textContent = "";
        document.getElementById("progress-pct").textContent = "";
        document.getElementById("progress-fill").style.width = "0%";
        document.getElementById("session-badge").innerHTML = `<span class="badge badge-${escapeHtml(session.status)}">${escapeHtml(session.status)}</span>`;
        document.getElementById("start-scan-btn").classList.add("hidden");
        const scanStatusEl = document.getElementById("scan-status");
        scanStatusEl.classList.remove("hidden");
        scanStatusEl.innerHTML = "";
        const cmd = session.status === "scanned" ? `group ${escapeHtml(sessionId)}` : "start review";
        renderTerminalCard(scanStatusEl, cmd);
        pollTimer = setTimeout(poll, 5000);
        return;
      }

      if (scanOverlay) scanOverlay.classList.add("hidden");

      updateHeading(session.type === "project", "reviewing");

      const cancelBtn = document.getElementById("cancel-scan-btn");
      if (cancelBtn) {
        const showCancel = session.status === "scoped";
        cancelBtn.classList.toggle("hidden", !showCancel);
      }

      let tasks = [];
      try { tasks = await api.getTasks(sessionId); } catch (e) {
        document.getElementById("task-list").innerHTML = `<div class="text-sm text-muted" style="padding:var(--space-4)">Failed to load tasks. Retrying...</div>`;
      }

      if (tasks.length > 0) {
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
              <span class="text-sm font-mono truncate">${t.type && ENTRY_TYPES[t.type] ? `<span class="badge entry-type-badge" style="color:${ENTRY_TYPES[t.type].color};border:1px solid ${ENTRY_TYPES[t.type].color};opacity:0.9;margin-right:6px">${ENTRY_TYPES[t.type].label}</span>` : ""}${escapeHtml(t.name || t.file)}</span>
            </div>
            <div class="flex items-center gap-3" style="flex-shrink:0">
              ${t.review?.score ? `<span class="text-sm font-mono ${scoreColor}">${t.review.score}/10</span>` : ""}
              <span class="badge badge-${t.status === "reviewing" ? "reviewing-task" : escapeHtml(t.status)}">${escapeHtml(t.status)}</span>
            </div>
          </div>`;
      }).join("");

      if (reviewed === total && total > 0 && session.status === "completed") {
        const cancelBtn2 = document.getElementById("cancel-scan-btn");
        if (cancelBtn2) cancelBtn2.classList.add("hidden");
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
      } // end tasks.length > 0

    } catch (e) {
      pollFailures++;
      if (pollFailures >= 3) {
        document.getElementById("poll-warning").classList.remove("hidden");
        return; // Stop polling
      }
    }

    // Schedule next poll (skip if tab is hidden)
    if (!document.hidden) {
      pollTimer = setTimeout(poll, pollInterval);
    }
  }

  // Resume polling when tab becomes visible
  document.addEventListener("visibilitychange", function onVisChange() {
    if (!document.hidden && !pollTimer) {
      pollFailures = 0;
      pollInterval = 3000;
      poll();
    }
    if (document.hidden) {
      if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
    }
  });
  onNavigateCleanup(() => {
    document.removeEventListener("visibilitychange", onVisChange);
  });

  document.getElementById("start-scan-btn").addEventListener("click", async () => {
    if (scanStarted) return;
    scanStarted = true;
    const startBtn = document.getElementById("start-scan-btn");
    const scanStatusEl = document.getElementById("scan-status");
    startBtn.disabled = true;
    startBtn.textContent = "Starting scan...";
    scanStatusEl.classList.remove("hidden");
    scanStatusEl.textContent = "Initiating scan...";
    try {
      await api.startScan(sessionId);
      scanStatusEl.textContent = "Scanning in progress...";
      startLogStream();
      pollInterval = 3000;
      pollTimer = setTimeout(poll, pollInterval);
    } catch (e) {
      scanStarted = false;
      startBtn.disabled = false;
      startBtn.innerHTML = `${icon("search", 14)} Retry Scan`;
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
  document.getElementById("cancel-scan-btn").addEventListener("click", async () => {
    const cancelBtn = document.getElementById("cancel-scan-btn");
    if (cancelBtn.dataset.confirmPending === "true") {
      cancelBtn.dataset.confirmPending = "";
      try {
        await api.patchSession(sessionId, { status: "created" });
        if (pollTimer) clearTimeout(pollTimer);
        showToast("Scan cancelled", "success");
        location.hash = `#/wizard/${sessionId}`;
      } catch (e) {
        showToast("Failed to cancel: " + e.message);
        cancelBtn.innerHTML = `${icon("x", 14)} Cancel`;
      }
    } else {
      cancelBtn.dataset.confirmPending = "true";
      cancelBtn.innerHTML = `${icon("x", 14)} Sure?`;
      setTimeout(() => {
        cancelBtn.dataset.confirmPending = "";
        cancelBtn.innerHTML = `${icon("x", 14)} Cancel`;
      }, 3000);
    }
  });

  await poll();

  // Scan log toggle
  document.getElementById("scan-log-toggle")?.addEventListener("click", () => {
    const panel = document.getElementById("scan-log-panel");
    const toggle = document.getElementById("scan-log-toggle");
    panel?.classList.toggle("open");
    toggle?.classList.toggle("open");
  });

  // Cleanup on navigation
  onNavigateCleanup(() => {
    if (pollTimer) clearTimeout(pollTimer);
    stopLogStream();
  });
}
