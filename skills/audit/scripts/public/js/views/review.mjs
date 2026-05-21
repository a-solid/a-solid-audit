// skills/audit/scripts/public/js/views/review.mjs
import { api } from "../api.mjs";
import { renderTaskDetail } from "../components/task-detail.mjs";
import { showToast, setBreadcrumb, icon, escapeHtml, onNavigateCleanup } from "../app.mjs";
import { SEVERITY_LABELS, SEVERITY_COLORS } from "../constants.mjs";

export async function renderReview(container, params) {
  const sessionId = params[0];
  let tasks = [];
  let notes = null;
  let currentTab = "overview";
  let currentTaskIdx = 0;

  setBreadcrumb([
    { label: "Sessions", href: "#/home" },
    { label: "Review Findings" },
  ]);

  container.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-2xl">Review Findings</h1>
      <div class="flex gap-2 no-print">
        <button id="review-home-btn" class="btn btn-ghost" aria-label="Go home">${icon("arrowLeft", 14)} Home</button>
        <button id="review-summary-btn" class="btn btn-primary" aria-label="Go to summary">Summary & Sign-off</button>
      </div>
    </div>
    <div class="tabs no-print" id="review-tabs">
      <div class="tab ${currentTab === "overview" ? "active" : ""}" data-tab="overview">Overview</div>
      <div class="tab" data-tab="tasks">Tasks</div>
    </div>
    <div id="review-content">
      <div class="flex items-center justify-center" style="padding:var(--space-8)"><span class="spinner"></span></div>
    </div>
  `;

  let reviewContext = "";
  try {
    const session = await api.getSession(sessionId);
    tasks = await api.getTasks(sessionId);
    notes = await api.getNotes(sessionId);
    try { const ctx = await api.getReviewContext(sessionId); reviewContext = ctx.context || ""; } catch (e) { /* no context file */ }
  } catch (e) {
    showToast("Failed to load review data: " + e.message);
    return;
  }

  async function updateFindingStatus(sid, task, findingIdx, status, reason) {
    const findingsCount = (task.review?.findings || []).length;
    const noteFindings = Array.from({ length: findingsCount }, (_, i) => {
      const existing = notes?.tasks?.find(t => t.file === task.file)?.findings?.[i];
      return existing || null;
    });
    noteFindings[findingIdx] = { status, reason };
    try {
      await api.updateTaskNote(sid, task.file, { findings: noteFindings });
      // Update in-memory notes so re-renders reflect the change
      let noteTask = notes?.tasks?.find(t => t.file === task.file);
      if (!noteTask) {
        if (!notes) notes = { tasks: [] };
        noteTask = { file: task.file, findings: [] };
        notes.tasks.push(noteTask);
      }
      noteTask.findings = noteFindings;
      const desc = task.review?.findings?.[findingIdx]?.description || "";
      const snippet = desc.length > 40 ? desc.slice(0, 40) + "..." : desc;
      showToast(
        status === "confirmed"
          ? `Confirmed: ${snippet}`
          : `Dismissed: ${snippet}`,
        "success"
      );
      renderContent();
    } catch (e) {
      showToast("Failed to update: " + e.message);
    }
  }

  async function autoConfirmFindings(task) {
    const taskFindings = task.review?.findings || [];
    if (taskFindings.length === 0) return;
    const noteTask = notes?.tasks?.find(t => t.file === task.file);
    const existingFindings = noteTask?.findings || [];
    // Only confirm findings that have no status yet
    let changed = false;
    const noteFindings = taskFindings.map((_, i) => {
      const existing = existingFindings[i];
      if (existing) return existing;
      changed = true;
      return { status: "confirmed", reason: "" };
    });
    if (!changed) return;
    try {
      await api.updateTaskNote(sessionId, task.file, { findings: noteFindings });
      if (!noteTask) {
        if (!notes) notes = { tasks: [] };
        const nt = { file: task.file, findings: noteFindings };
        notes.tasks.push(nt);
      } else {
        noteTask.findings = noteFindings;
      }
    } catch (e) { /* best effort */ }
  }

  function renderContent() {
    const content = document.getElementById("review-content");
    if (!content) return;
    if (currentTab === "overview") renderOverview(content);
    else renderTasksTab(content);
  }

  function renderOverview(el) {
    const totalFindings = tasks.reduce((sum, t) => sum + (t.review?.findings?.length || 0), 0);
    const bySeverity = {};
    tasks.forEach(t => {
      (t.review?.findings || []).forEach(f => {
        bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
      });
    });
    const avgScore = tasks.length
      ? Math.round(tasks.reduce((s, t) => s + (t.review?.score || 0), 0) / tasks.length)
      : 0;

    const maxSevCount = Math.max(...Object.values(bySeverity), 1);

    el.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div class="stat-card">
          <div class="score-ring" style="margin:0 auto var(--space-2)">
            <svg width="80" height="80" viewBox="0 0 80 80">
              <circle class="score-ring-bg" cx="40" cy="40" r="34" fill="none" stroke-width="6"/>
              <circle class="score-ring-fill" cx="40" cy="40" r="34" fill="none"
                stroke="${avgScore >= 7 ? "var(--accent)" : avgScore >= 4 ? "var(--warning)" : "var(--danger)"}"
                stroke-width="6"
                stroke-dasharray="${2 * Math.PI * 34}"
                stroke-dashoffset="${2 * Math.PI * 34 * (1 - avgScore / 10)}"
                stroke-linecap="round"/>
            </svg>
            <div class="score-ring-text">${avgScore}</div>
          </div>
          <div class="stat-label">Avg Score</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${totalFindings}</div>
          <div class="stat-label">Findings</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${tasks.length}</div>
          <div class="stat-label">Tasks</div>
        </div>
      </div>

      ${totalFindings === 0 ? `
        <div class="card" style="text-align:center;padding:var(--space-8) var(--space-6)">
          <div style="margin-bottom:var(--space-4);color:var(--accent)">${icon("check", 48)}</div>
          <h2 class="text-lg" style="color:var(--text-secondary)">All Clear</h2>
          <p class="text-sm text-muted mt-2" style="max-width:320px;margin:0 auto">No findings were identified in this review.</p>
        </div>
      ` : `
        ${Object.keys(bySeverity).length > 0 ? `
          <div class="card mb-4">
            <div class="font-medium mb-4">Findings by Severity</div>
            ${Object.entries(bySeverity).map(([sev, count]) => `
              <div class="severity-bar-row">
                <span class="badge severity-${sev} severity-bar-label">${SEVERITY_LABELS[sev] || sev}</span>
                <div class="severity-bar-track">
                  <div class="severity-bar-fill" style="width:${(count / maxSevCount) * 100}%;background:${SEVERITY_COLORS[sev] || "var(--info)"}"></div>
                </div>
                <span class="severity-bar-count">${count}</span>
              </div>
            `).join("")}
          </div>
        ` : ""}

        <div class="card">
          <div class="font-medium mb-3">Needs Attention</div>
          ${(() => {
            const critical = tasks.filter(t =>
              (t.review?.findings || []).some(f => f.severity === "critical" || f.severity === "high" || f.severity === "major")
            );
            if (critical.length === 0) {
              return `<div class="flex items-center gap-2 text-sm text-muted">
                ${icon("check", 16)}
                <span>No high-severity findings.</span>
              </div>`;
            }
            return critical.map(t => {
              const taskIdx = tasks.indexOf(t);
              return `
              <div class="flex items-center justify-between py-2 border-b needs-attention-item" style="border-color:var(--border);cursor:pointer" data-task-idx="${taskIdx}">
                <span class="text-sm font-mono truncate">${escapeHtml(t.name || t.file)}</span>
                <span class="text-sm text-danger font-medium">${(t.review?.findings || []).filter(f => f.severity === "critical" || f.severity === "high" || f.severity === "major").length} high-severity</span>
              </div>`;
            }).join("");
          })()}
        </div>
      `}

    ${reviewContext ? `
      <div class="card mb-4">
        <div class="font-medium mb-3">Review Context</div>
        <div class="text-sm" style="white-space:pre-wrap;word-break:break-word">${escapeHtml(reviewContext)}</div>
      </div>
    ` : ""}
    `;

    // Wire up Needs Attention task clicks
    el.querySelectorAll(".needs-attention-item").forEach(item => {
      item.addEventListener("click", () => {
        currentTaskIdx = parseInt(item.dataset.taskIdx);
        currentTab = "tasks";
        updateTabUI();
        renderContent();
      });
    });
  }

  function renderTasksTab(el) {
    // Preserve sidebar scroll position across re-renders
    const savedScrollTop = document.getElementById("task-sidebar")?.scrollTop || 0;

    el.innerHTML = `
      <div class="sidebar-layout">
        <div class="sidebar-panel" id="task-sidebar"></div>
        <div class="detail-panel" id="task-detail-panel"></div>
      </div>`;

    const sidebar = document.getElementById("task-sidebar");
    sidebar.innerHTML = tasks.map((t, i) => {
      const score = t.review?.score;
      const dotClass = score >= 7 ? "score-dot-green" : score >= 4 ? "score-dot-amber" : "score-dot-red";
      return `
        <div class="task-nav-item ${i === currentTaskIdx ? "active" : ""}" data-idx="${i}">
          <div class="score-dot ${score ? dotClass : ""}" style="${!score ? "background:var(--text-muted)" : ""}"></div>
          <div style="min-width:0;flex:1">
            <div class="text-sm font-mono truncate">${escapeHtml(t.name || t.file)}</div>
            <div class="flex items-center gap-2 mt-1">
              <span class="badge badge-${t.status === "reviewing" ? "reviewing-task" : t.status}">${t.status}</span>
              <span class="text-xs text-muted">${score ?? "-"}/10</span>
            </div>
          </div>
        </div>`;
    }).join("");

    // Restore sidebar scroll position
    sidebar.scrollTop = savedScrollTop;

    sidebar.querySelectorAll(".task-nav-item").forEach(item => {
      item.addEventListener("click", async () => {
        const newIdx = parseInt(item.dataset.idx);
        if (newIdx !== currentTaskIdx) {
          currentTaskIdx = newIdx;
          await autoConfirmFindings(tasks[currentTaskIdx]);
        }
        renderContent();
      });
    });

    const detailPanel = document.getElementById("task-detail-panel");
    detailPanel.innerHTML = renderTaskDetail(tasks[currentTaskIdx], notes);

    // Reset detail panel scroll to top on task switch
    detailPanel.scrollTop = 0;

    // Wire up confirm/dismiss buttons
    detailPanel.querySelectorAll(".btn-confirm").forEach(btn => {
      btn.addEventListener("click", async () => {
        const idx = parseInt(btn.dataset.idx);
        await updateFindingStatus(sessionId, tasks[currentTaskIdx], idx, "confirmed", "");
      });
    });
    detailPanel.querySelectorAll(".btn-dismiss").forEach(btn => {
      btn.addEventListener("click", () => {
        const idx = btn.dataset.idx;
        // Close any other open dismiss panels
        detailPanel.querySelectorAll(".dismiss-panel").forEach(p => {
          if (p.dataset.dismissPanel !== idx) p.classList.add("hidden");
        });
        const panel = detailPanel.querySelector(`[data-dismiss-panel="${idx}"]`);
        panel.classList.toggle("hidden");
        // Auto-scroll dismiss panel into view
        if (!panel.classList.contains("hidden")) {
          requestAnimationFrame(() => {
            panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
          });
        }
      });
    });
    // Dismiss reason buttons
    detailPanel.querySelectorAll(".dismiss-reason-btn").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.closest("[data-dismiss-panel]").dataset.dismissPanel);
        const reason = btn.dataset.reason;
        await updateFindingStatus(sessionId, tasks[currentTaskIdx], idx, "deferred", reason);
      });
    });
    // Dismiss custom submit
    detailPanel.querySelectorAll(".dismiss-submit-btn").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.dismissSubmit);
        const input = detailPanel.querySelector(`[data-dismiss-custom="${idx}"]`);
        const reason = input?.value?.trim();
        if (!reason) { showToast("Enter a reason"); return; }
        await updateFindingStatus(sessionId, tasks[currentTaskIdx], idx, "deferred", reason);
      });
    });
    // Prevent dismiss custom input clicks from bubbling
    detailPanel.querySelectorAll(".dismiss-custom-input").forEach(input => {
      input.addEventListener("click", (e) => e.stopPropagation());
    });
    // Prevent clicks inside dismiss panels from closing them
    detailPanel.querySelectorAll(".dismiss-panel").forEach(panel => {
      panel.addEventListener("click", (e) => e.stopPropagation());
    });
  }

  // Tab switching
  const tabsEl = document.getElementById("review-tabs");
  tabsEl.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      currentTab = tab.dataset.tab;
      tabsEl.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      renderContent();
    });
  });

  // Navigation buttons
  document.getElementById("review-home-btn").addEventListener("click", () => {
    location.hash = "#/home";
  });
  document.getElementById("review-summary-btn").addEventListener("click", () => {
    location.hash = `#/summary/${sessionId}`;
  });

  // Keyboard shortcuts — register with cleanup
  function shortcutHandler(e) {
    if (e.target.matches("input, textarea, [contenteditable]")) return;
    if (currentTab !== "tasks") {
      if (e.key === "o") { currentTab = "overview"; renderContent(); updateTabUI(); }
      else if (e.key === "s") { currentTab = "tasks"; renderContent(); updateTabUI(); }
      return;
    }
    if (e.key === "j" || e.key === "ArrowDown") {
      e.preventDefault();
      currentTaskIdx = Math.min(currentTaskIdx + 1, tasks.length - 1);
      renderContent();
    } else if (e.key === "k" || e.key === "ArrowUp") {
      e.preventDefault();
      currentTaskIdx = Math.max(currentTaskIdx - 1, 0);
      renderContent();
    } else if (e.key === "o") { currentTab = "overview"; renderContent(); updateTabUI(); }
    else if (e.key === "s") { currentTab = "tasks"; renderContent(); updateTabUI(); }
  }

  function updateTabUI() {
    const tabsEl2 = document.getElementById("review-tabs");
    if (!tabsEl2) return;
    tabsEl2.querySelectorAll(".tab").forEach(t => {
      t.classList.toggle("active", t.dataset.tab === currentTab);
    });
  }

  document.addEventListener("keydown", shortcutHandler);
  onNavigateCleanup(() => {
    document.removeEventListener("keydown", shortcutHandler);
  });

  renderContent();
}
