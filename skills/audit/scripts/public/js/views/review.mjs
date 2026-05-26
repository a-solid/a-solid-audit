// skills/audit/scripts/public/js/views/review.mjs
import { api } from "../api.mjs";
import { renderTaskDetail, renderMermaidDiagrams } from "../components/task-detail.mjs";
import { showToast, setBreadcrumb, icon, escapeHtml, onNavigateCleanup, initTabKeyboard } from "../app.mjs";
import { SEVERITY_LABELS, SEVERITY_COLORS } from "../constants.mjs";

export async function renderReview(container, params) {
  const sessionId = params[0];
  let tasks = [];
  let notes = null;
  let currentTab = "overview";
  let currentTaskIdx = 0;
  let preserveDetailScroll = false;
  let batchMode = false;

  const shortId = sessionId ? sessionId.slice(0, 7) : "";
  setBreadcrumb([
    { label: "Sessions", href: "#/home" },
    ...(shortId ? [{ label: shortId, href: `#/review/${sessionId}` }] : []),
    { label: "Review" },
  ]);

  container.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-2xl">Review Findings</h1>
      <div class="flex gap-2 no-print">
        <button id="review-home-btn" class="btn btn-ghost" aria-label="Go home">${icon("arrowLeft", 14)} Home</button>
        <button id="review-summary-btn" class="btn btn-primary" aria-label="Go to summary">Summary & Sign-off</button>
      </div>
    </div>
    <div class="tabs no-print" id="review-tabs" role="tablist">
      <div class="tab ${currentTab === "overview" ? "active" : ""}" data-tab="overview" role="tab" tabindex="0" aria-selected="${currentTab === "overview"}" aria-controls="review-content">Overview</div>
      <div class="tab" data-tab="tasks" role="tab" tabindex="-1" aria-selected="${currentTab !== "overview"}" aria-controls="review-content">Tasks</div>
    </div>
    <div id="review-content" role="tabpanel">
      <div class="flex items-center justify-center" style="padding:var(--space-8)"><span class="spinner"></span></div>
    </div>
  `;

  let reviewContext = "";
  try { tasks = await api.getTasks(sessionId); } catch (e) {
    showToast("Failed to load tasks: " + e.message);
    return;
  }
  try { notes = await api.getNotes(sessionId); } catch (e) {
    showToast("Notes unavailable — finding statuses may not display", "warning");
  }
  try { await api.getSession(sessionId); } catch (e) { /* session info optional */ }
  try { const ctx = await api.getReviewContext(sessionId); reviewContext = ctx.context || ""; } catch (e) { /* no context file */ }

  async function updateFindingStatus(sid, task, findingIdx, status, reason) {
    const findingsCount = (task.review?.findings || []).length;
    const noteFindings = Array.from({ length: findingsCount }, (_, i) => {
      const existing = notes?.tasks?.find(t => t.file === task.file)?.findings?.[i];
      return existing || null;
    });
    noteFindings[findingIdx] = { status, reason };
    try {
      await api.updateTaskNote(sid, task.file, { findings: noteFindings });
      let noteTask = notes?.tasks?.find(t => t.file === task.file);
      if (!noteTask) {
        if (!notes) notes = { tasks: [] };
        noteTask = { file: task.file, findings: [] };
        notes.tasks.push(noteTask);
      }
      noteTask.findings = noteFindings;
      const desc = task.review?.findings?.[findingIdx]?.description || "";
      const snippet = desc.length > 60 ? desc.slice(0, 60) + "..." : desc;
      showToast(
        status === "acknowledged"
          ? `Acknowledged: ${snippet}`
          : `Deferred: ${snippet}`,
        "success"
      );
      // Brief visual transition before re-render
      const findingCard = document.querySelector(`[data-finding="${findingIdx}"]`);
      if (findingCard) {
        findingCard.style.transition = "opacity 150ms ease";
        findingCard.style.opacity = status === "acknowledged" ? "0.6" : "0.3";
      }
      preserveDetailScroll = true;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          renderContent();
        });
      });
    } catch (e) {
      showToast("Failed to update: " + e.message);
    }
  }

  async function confirmSelectedFindings(task, selectedIndices) {
    const taskFindings = task.review?.findings || [];
    if (taskFindings.length === 0 || selectedIndices.length === 0) return 0;
    const noteTask = notes?.tasks?.find(t => t.file === task.file);
    const existingFindings = noteTask?.findings || [];
    const selectedSet = new Set(selectedIndices);
    let changed = false;
    const saveFindings = taskFindings.map((_, i) => {
      const existing = existingFindings[i];
      if (existing) return existing;
      if (selectedSet.has(i)) {
        changed = true;
        return { status: "acknowledged", reason: "" };
      }
      return null;
    });
    if (!changed) return 0;
    try {
      await api.updateTaskNote(sessionId, task.file, { findings: saveFindings });
      if (!noteTask) {
        if (!notes) notes = { tasks: [] };
        const nt = { file: task.file, findings: saveFindings };
        notes.tasks.push(nt);
      } else {
        noteTask.findings = saveFindings;
      }
      return selectedIndices.filter(i => !existingFindings[i]).length;
    } catch (e) { return 0; }
  }

  async function autoAcknowledgeLowSeverity(task) {
    const taskFindings = task.review?.findings || [];
    if (taskFindings.length === 0) return;
    const noteTask = notes?.tasks?.find(t => t.file === task.file);
    const existingFindings = noteTask?.findings || [];
    const LOW_SEVS = ["info", "low"];
    let changed = false;
    const saveFindings = taskFindings.map((f, i) => {
      const existing = existingFindings[i];
      if (existing) return existing;
      if (LOW_SEVS.includes(f.severity)) {
        changed = true;
        return { status: "acknowledged", reason: "" };
      }
      return null;
    });
    if (!changed) return;
    try {
      await api.updateTaskNote(sessionId, task.file, { findings: saveFindings });
      if (!noteTask) {
        if (!notes) notes = { tasks: [] };
        const nt = { file: task.file, findings: saveFindings };
        notes.tasks.push(nt);
      } else {
        noteTask.findings = saveFindings;
      }
    } catch (e) {
      // Silently fail — auto-ack is best-effort
    }
  }

  async function renderContent() {
    const content = document.getElementById("review-content");
    if (!content) return;
    if (currentTab === "overview") renderOverview(content);
    else await renderTasksTab(content);
  }

  function getSeverityIcon(sev) {
    const m = {
      critical: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
      major: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
      high: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
      minor: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
      medium: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
      info: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>',
      low: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>',
    };
    return m[sev] || '';
  }

  function renderOverview(el) {
    if (tasks.length === 0) {
      el.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">${icon("search", 56)}</div>
          <h2>No tasks yet</h2>
          <p>Tasks will appear here once the AI review begins.</p>
          <a href="#/progress/${sessionId}" class="btn btn-ghost">${icon("arrowLeft", 14)} Back to Progress</a>
        </div>`;
      return;
    }
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

    let confirmed = 0;
    let deferred = 0;
    let totalFindingsFromAll = 0;
    const noteTasks = notes?.tasks || [];
    tasks.forEach(t => {
      const taskFindings = t.review?.findings || [];
      totalFindingsFromAll += taskFindings.length;
      const noteTask = noteTasks.find(nt => nt.file === t.file);
      (noteTask?.findings || []).forEach(f => {
        if (!f) return;
        if (f.status === "acknowledged") confirmed++;
        else if (f.status === "deferred") deferred++;
      });
    });
    const unreviewedCount = totalFindingsFromAll - confirmed - deferred;
    const findingsTotal = totalFindingsFromAll || 1;
    const confirmPct = Math.round(confirmed / findingsTotal * 100);
    const dismissPct = Math.round(deferred / findingsTotal * 100);
    const unreviewedPct = 100 - confirmPct - dismissPct;

    el.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div class="stat-card">
          <div class="stat-value" style="color:${avgScore >= 7 ? "var(--accent)" : avgScore >= 4 ? "var(--warning)" : "var(--danger)"}">${avgScore}/10</div>
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

      <div class="quick-stats-row">
        <div class="quick-stat">
          <div class="quick-stat-value quick-stat-value-confirmed">${confirmPct}%</div>
          <div class="quick-stat-label">Acknowledged</div>
        </div>
        <div class="quick-stat">
          <div class="quick-stat-value quick-stat-value-dismissed">${dismissPct}%</div>
          <div class="quick-stat-label">Deferred</div>
        </div>
        <div class="quick-stat">
          <div class="quick-stat-value quick-stat-value-unreviewed">${unreviewedPct}%</div>
          <div class="quick-stat-label">Pending</div>
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
            ${Object.entries(bySeverity).map(([sev, count]) => {
              const pct = totalFindings > 0 ? Math.round(count / totalFindings * 100) : 0;
              return `
              <div class="severity-bar-row">
                <span class="badge severity-${sev} severity-bar-label">${SEVERITY_LABELS[sev] || sev}</span>
                <div class="severity-bar-track">
                  <div class="severity-bar-fill" style="width:${(count / maxSevCount) * 100}%;background:${SEVERITY_COLORS[sev] || "var(--info)"}"></div>
                </div>
                <span class="severity-bar-count">${count}</span>
                <span class="severity-bar-pct">${pct}%</span>
              </div>`;
            }).join("")}
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
              const highSevCount = (t.review?.findings || []).filter(f => f.severity === "critical" || f.severity === "high" || f.severity === "major").length;
              const highSevs = ["critical", "high", "major"];
              const highestSev = (t.review?.findings || [])
                .filter(f => highSevs.includes(f.severity))
                .sort((a, b) => highSevs.indexOf(a.severity) - highSevs.indexOf(b.severity))[0]?.severity || "critical";
              return `
              <div class="flex items-center justify-between py-2 border-b needs-attention-item" style="border-color:var(--border);cursor:pointer" data-task-idx="${taskIdx}" role="link" tabindex="0" aria-label="${escapeHtml(t.name || t.file)}, ${highSevCount} high-severity findings">
                <span class="flex items-center gap-2 text-sm font-mono truncate">${getSeverityIcon(highestSev)}${escapeHtml(t.name || t.file)}</span>
                <span class="text-sm text-danger font-medium">${highSevCount} high-severity</span>
              </div>`;
            }).join("");
          })()}
        </div>
      `}

    ${reviewContext ? `
      <div class="card mb-4 mt-6">
        <div class="font-medium mb-3">Review Context</div>
        <div class="text-sm" style="white-space:pre-wrap;word-break:break-word">${escapeHtml(reviewContext)}</div>
      </div>
    ` : ""}
    `;

    // Wire up Needs Attention item clicks + keyboard
    function handleAttentionClick(e) {
      const item = e.currentTarget;
      currentTaskIdx = parseInt(item.dataset.taskIdx);
      currentTab = "tasks";
      updateTabUI();
      renderContent();
    }
    el.querySelectorAll(".needs-attention-item").forEach(item => {
      item.addEventListener("click", handleAttentionClick);
      item.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleAttentionClick(e);
        }
      });
    });
  }

  async function renderTasksTab(el) {
    // Preserve sidebar scroll position across re-renders
    const savedScrollTop = document.getElementById("task-sidebar")?.scrollTop || 0;
    const savedDetailScroll = preserveDetailScroll
      ? (document.getElementById("task-detail-panel")?.scrollTop || 0)
      : 0;

    const currentTask = tasks[currentTaskIdx];
    await autoAcknowledgeLowSeverity(currentTask);
    const currentScore = currentTask?.review?.score;
    el.innerHTML = `
      <div class="mobile-task-nav" aria-label="Task navigation">
        <button class="btn btn-ghost btn-sm mobile-task-prev" aria-label="Previous task" ${currentTaskIdx <= 0 ? "disabled" : ""}>${icon("chevronLeft", 14)}</button>
        <div class="mobile-task-info">
          <span class="font-mono text-sm truncate">${escapeHtml(currentTask?.name || currentTask?.file || "Select task")}</span>
          <span class="text-xs text-muted">${currentScore ?? "-"}/10</span>
        </div>
        <button class="btn btn-ghost btn-sm mobile-task-next" aria-label="Next task" ${currentTaskIdx >= tasks.length - 1 ? "disabled" : ""}>${icon("chevronRight", 14)}</button>
      </div>
      <div class="sidebar-layout">
        <div class="sidebar-panel" id="task-sidebar"></div>
        <div class="detail-panel" id="task-detail-panel"></div>
      </div>`;

    const sidebar = document.getElementById("task-sidebar");
    const reviewed = [];
    const pending = [];
    tasks.forEach((t, i) => {
      if (t.status === "reviewed") reviewed.push({ t, i });
      else pending.push({ t, i });
    });
    const sorted = [...reviewed, ...pending];
    sidebar.innerHTML = sorted.map(({ t, i }, sortedIdx) => {
      const score = t.review?.score;
      const dotClass = score >= 7 ? "score-dot-green" : score >= 4 ? "score-dot-amber" : "score-dot-red";
      const reviewedCount = (t.review?.findings || []).filter(f => f.status === "acknowledged" || f.status === "deferred").length;
      const totalCount = (t.review?.findings || []).length;
      const progressPct = totalCount > 0 ? (reviewedCount / totalCount * 100) : 0;
      const separator = sortedIdx === reviewed.length ? `<div class="task-sidebar-separator">Pending</div>` : "";
      return `${separator}
        <div class="task-nav-item ${i === currentTaskIdx ? "active" : ""}" data-idx="${i}" tabindex="0" role="button" aria-label="${escapeHtml(t.name || t.file)}, score ${score ?? '-'}">
          <div class="score-dot ${score ? dotClass : ""}" style="${!score ? "background:var(--text-muted)" : ""}"></div>
          <div style="min-width:0;flex:1">
            <div class="text-sm font-mono truncate" title="${escapeHtml(t.name || t.file)}">${escapeHtml(t.name || t.file)}</div>
            <div class="flex items-center gap-2 mt-1">
              <span class="badge badge-${t.status === "reviewing" ? "reviewing-task" : t.status}">${t.status}</span>
              <span class="text-xs text-muted">${score ?? "-"}/10</span>
            </div>
            <div class="task-nav-progress"><div class="task-nav-progress-fill" style="width:${progressPct}%"></div></div>
          </div>
        </div>`;
    }).join("");

    // Restore sidebar scroll position
    sidebar.scrollTop = savedScrollTop;

    async function handleTaskNav(e) {
      const item = e.currentTarget;
      const newIdx = parseInt(item.dataset.idx);
      if (newIdx !== currentTaskIdx) {
        currentTaskIdx = newIdx;
        batchMode = false;
      }
      renderContent();
    }

    sidebar.querySelectorAll(".task-nav-item").forEach(item => {
      item.addEventListener("click", handleTaskNav);
      item.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleTaskNav(e);
        }
      });
    });

    // Mobile task nav
    el.querySelector(".mobile-task-prev")?.addEventListener("click", () => {
      if (currentTaskIdx > 0) { currentTaskIdx--; batchMode = false; renderContent(); }
    });
    el.querySelector(".mobile-task-next")?.addEventListener("click", () => {
      if (currentTaskIdx < tasks.length - 1) { currentTaskIdx++; batchMode = false; renderContent(); }
    });

    const detailPanel = document.getElementById("task-detail-panel");
    detailPanel.innerHTML = renderTaskDetail(tasks[currentTaskIdx], notes, batchMode);
    if (batchMode) detailPanel.classList.add("batch-mode");
    await renderMermaidDiagrams(detailPanel);

    // Restore detail panel scroll (only if not task switch)
    detailPanel.scrollTop = preserveDetailScroll ? savedDetailScroll : 0;
    preserveDetailScroll = false;

    // Wire up confirm/dismiss buttons
    detailPanel.querySelectorAll(".btn-confirm").forEach(btn => {
      btn.addEventListener("click", async () => {
        const idx = parseInt(btn.dataset.idx);
        await updateFindingStatus(sessionId, tasks[currentTaskIdx], idx, "acknowledged", "");
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
    // Collapse toggles
    detailPanel.querySelectorAll(".finding-collapse-toggle").forEach(btn => {
      btn.addEventListener("click", () => {
        const idx = btn.dataset.collapseToggle;
        const collapsible = detailPanel.querySelector(`[data-collapsible="${idx}"]`);
        const isOpen = collapsible.classList.toggle("open");
        btn.classList.toggle("open", isOpen);
        const label = btn.querySelector(".toggle-icon").nextSibling;
        if (label) {
          const finding = tasks[currentTaskIdx].review?.findings?.[parseInt(idx)];
          const hasBoth = finding?.code && finding?.suggestion;
          label.textContent = isOpen
            ? (hasBoth ? "Hide details" : finding?.code ? "Hide code" : "Hide suggestion")
            : (hasBoth ? "Show details" : finding?.code ? "Show code" : "Show suggestion");
        }
      });
    });

    // Batch mode: toggle, action bar, select all/deselect all
    const batchSelectBtn = detailPanel.querySelector("#batch-select-btn");
    const batchCancelBtn = detailPanel.querySelector("#batch-cancel-btn");

    if (batchSelectBtn) {
      batchSelectBtn.addEventListener("click", () => {
        batchMode = true;
        preserveDetailScroll = true;
        requestAnimationFrame(() => requestAnimationFrame(() => renderContent()));
      });
    }

    if (batchCancelBtn) {
      batchCancelBtn.addEventListener("click", () => {
        batchMode = false;
        preserveDetailScroll = true;
        requestAnimationFrame(() => requestAnimationFrame(() => renderContent()));
      });
    }

    // Render batch action bar if in batch mode
    if (batchMode) {
      const HIGH_SEVS = ["critical", "major", "high"];
      const bar = document.createElement("div");
      bar.className = "batch-action-bar";
      bar.id = "batch-action-bar";
      bar.innerHTML = `
        <div class="batch-action-bar-left">
          <button class="btn btn-sm btn-ghost" id="batch-select-all-btn">Select All</button>
          <button class="btn btn-sm btn-ghost" id="batch-deselect-all-btn">Deselect All</button>
        </div>
        <div class="flex items-center gap-2">
          <button class="btn btn-sm batch-confirm-btn" id="batch-confirm-btn" disabled>${icon("check", 14)} Acknowledge 0 selected</button>
        </div>
      `;
      detailPanel.appendChild(bar);

      function updateBatchBar() {
        const checked = detailPanel.querySelectorAll(".finding-checkbox:not(:disabled):checked");
        const count = checked.length;
        const confirmBtn = document.getElementById("batch-confirm-btn");
        if (!confirmBtn) return;
        confirmBtn.disabled = count === 0;

        const highCount = Array.from(checked).filter(cb =>
          HIGH_SEVS.includes(cb.dataset.severity)
        ).length;
        const highNote = highCount > 0
          ? `<span class="batch-high-sev-note">${icon("alertTriangle", 12)} ${highCount} high-severity</span>`
          : "";
        confirmBtn.innerHTML = `${icon("check", 14)} Acknowledge ${count} selected ${highNote}`;
      }

      // Wire checkbox changes
      detailPanel.querySelectorAll(".finding-checkbox").forEach(cb => {
        cb.addEventListener("change", updateBatchBar);
      });

      // Select All / Deselect All
      document.getElementById("batch-select-all-btn")?.addEventListener("click", () => {
        detailPanel.querySelectorAll(".finding-checkbox:not(:disabled)").forEach(cb => {
          cb.checked = true;
        });
        updateBatchBar();
      });
      document.getElementById("batch-deselect-all-btn")?.addEventListener("click", () => {
        detailPanel.querySelectorAll(".finding-checkbox:not(:disabled)").forEach(cb => {
          cb.checked = false;
        });
        updateBatchBar();
      });

      // Batch confirm execute
      document.getElementById("batch-confirm-btn")?.addEventListener("click", async () => {
        const confirmBtn = document.getElementById("batch-confirm-btn");
        const checkedIndices = Array.from(detailPanel.querySelectorAll(".finding-checkbox:not(:disabled):checked"))
          .map(cb => parseInt(cb.dataset.findingIdx));
        if (checkedIndices.length === 0) return;

        confirmBtn.disabled = true;
        confirmBtn.innerHTML = `<span class="spinner spinner-sm"></span> Acknowledging...`;

        const count = await confirmSelectedFindings(tasks[currentTaskIdx], checkedIndices);
        batchMode = false;
        if (count > 0) {
          showToast(`${count} finding(s) acknowledged`, "success");
        } else {
          showToast("No findings were acknowledged", "info");
        }
        preserveDetailScroll = true;
        requestAnimationFrame(() => requestAnimationFrame(() => renderContent()));
      });

      // Initial bar state
      updateBatchBar();
    }
  }

  // Tab switching — click + keyboard
  const tabsEl = document.getElementById("review-tabs");
  tabsEl.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      currentTab = tab.dataset.tab;
      updateTabUI();
      renderContent();
    });
  });
  initTabKeyboard(tabsEl);

  // Navigation buttons
  document.getElementById("review-home-btn").addEventListener("click", () => {
    location.hash = "#/home";
  });
  document.getElementById("review-summary-btn").addEventListener("click", () => {
    location.hash = `#/summary/${sessionId}`;
  });

  // Keyboard shortcuts overlay
  function toggleKbOverlay() {
    const existing = document.getElementById("kb-overlay");
    if (existing) { existing.remove(); return; }
    const overlay = document.createElement("div");
    overlay.id = "kb-overlay";
    overlay.className = "kb-overlay";
    overlay.innerHTML = `
      <div class="kb-overlay-card">
        <div class="kb-overlay-title">Keyboard Shortcuts</div>
        <div class="kb-row"><span>j / ↓</span><span class="kb-key">Next task</span></div>
        <div class="kb-row"><span>k / ↑</span><span class="kb-key">Previous task</span></div>
        <div class="kb-row"><span>o</span><span class="kb-key">Overview tab</span></div>
        <div class="kb-row"><span>s</span><span class="kb-key">Tasks tab</span></div>
        <div class="kb-row"><span>?</span><span class="kb-key">Show shortcuts</span></div>
        <div class="kb-row"><span>Esc</span><span class="kb-key">Close panel</span></div>
      </div>
    `;
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
  }

  // Keyboard shortcuts — register with cleanup
  function shortcutHandler(e) {
    if (e.target.matches("input, textarea, [contenteditable]")) return;
    if (e.key === "?") {
      e.preventDefault();
      toggleKbOverlay();
      return;
    }
    if (e.key === "Escape") {
      const overlay = document.getElementById("kb-overlay");
      if (overlay) overlay.remove();
      return;
    }
    if (currentTab !== "tasks") {
      if (e.key === "o") { currentTab = "overview"; renderContent(); updateTabUI(); }
      else if (e.key === "s") { currentTab = "tasks"; renderContent(); updateTabUI(); }
      return;
    }
    if (e.key === "j" || e.key === "ArrowDown") {
      e.preventDefault();
      currentTaskIdx = Math.min(currentTaskIdx + 1, tasks.length - 1);
      renderContent();
      requestAnimationFrame(() => {
        const activeItem = document.querySelector("#task-sidebar .task-nav-item.active");
        if (activeItem) activeItem.scrollIntoView({ block: "nearest", behavior: "smooth" });
      });
    } else if (e.key === "k" || e.key === "ArrowUp") {
      e.preventDefault();
      currentTaskIdx = Math.max(currentTaskIdx - 1, 0);
      renderContent();
      requestAnimationFrame(() => {
        const activeItem = document.querySelector("#task-sidebar .task-nav-item.active");
        if (activeItem) activeItem.scrollIntoView({ block: "nearest", behavior: "smooth" });
      });
    } else if (e.key === "o") { currentTab = "overview"; renderContent(); updateTabUI(); }
    else if (e.key === "s") { currentTab = "tasks"; renderContent(); updateTabUI(); }
  }

  function updateTabUI() {
    const tabsEl2 = document.getElementById("review-tabs");
    if (!tabsEl2) return;
    tabsEl2.querySelectorAll(".tab").forEach(t => {
      const isActive = t.dataset.tab === currentTab;
      t.classList.toggle("active", isActive);
      t.setAttribute("aria-selected", isActive);
      t.setAttribute("tabindex", isActive ? "0" : "-1");
    });
  }

  document.addEventListener("keydown", shortcutHandler);
  onNavigateCleanup(() => {
    document.removeEventListener("keydown", shortcutHandler);
    document.getElementById("kb-overlay")?.remove();
  });

  renderContent();

  // Keyboard shortcut hint button
  const hint = document.createElement("div");
  hint.className = "kb-hint";
  hint.innerHTML = `<button class="kb-hint-btn" title="Keyboard shortcuts">?</button>`;
  hint.querySelector("button").addEventListener("click", toggleKbOverlay);
  container.appendChild(hint);
}
