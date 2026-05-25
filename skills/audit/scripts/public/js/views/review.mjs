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
        status === "confirmed"
          ? `Confirmed: ${snippet}`
          : `Dismissed: ${snippet}`,
        "success"
      );
      // Brief visual transition before re-render
      const findingCard = document.querySelector(`[data-finding="${findingIdx}"]`);
      if (findingCard) {
        findingCard.style.transition = "opacity 150ms ease";
        findingCard.style.opacity = status === "confirmed" ? "0.6" : "0.3";
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
    let changed = false;
    const saveFindings = taskFindings.map((_, i) => {
      const existing = existingFindings[i];
      if (existing) return existing;
      if (selectedIndices.includes(i)) {
        changed = true;
        return { status: "confirmed", reason: "" };
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
        if (f.status === "confirmed") confirmed++;
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
          <div class="quick-stat-label">Confirmed</div>
        </div>
        <div class="quick-stat">
          <div class="quick-stat-value quick-stat-value-dismissed">${dismissPct}%</div>
          <div class="quick-stat-label">Dismissed</div>
        </div>
        <div class="quick-stat">
          <div class="quick-stat-value quick-stat-value-unreviewed">${unreviewedPct}%</div>
          <div class="quick-stat-label">Unreviewed</div>
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
      const reviewedCount = (t.review?.findings || []).filter(f => f.status === "confirmed" || f.status === "deferred").length;
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
      if (currentTaskIdx > 0) { currentTaskIdx--; renderContent(); }
    });
    el.querySelector(".mobile-task-next")?.addEventListener("click", () => {
      if (currentTaskIdx < tasks.length - 1) { currentTaskIdx++; renderContent(); }
    });

    const detailPanel = document.getElementById("task-detail-panel");
    detailPanel.innerHTML = renderTaskDetail(tasks[currentTaskIdx], notes);
    await renderMermaidDiagrams(detailPanel);

    // Add "Confirm All" button if there are unreviewed findings
    const detailTask = tasks[currentTaskIdx];
    const currentFindings = detailTask?.review?.findings || [];
    const currentNoteTask = notes?.tasks?.find(t => t.file === detailTask?.file);
    const unreviewedIndices = [];
    currentFindings.forEach((f, i) => {
      if (!currentNoteTask?.findings?.[i]?.status) unreviewedIndices.push(i);
    });
    const unreviewedCount = unreviewedIndices.length;

    if (unreviewedCount > 0) {
      const slot = detailPanel.querySelector("#confirm-all-slot");
      if (slot) {
        slot.innerHTML = `<button class="btn btn-sm" style="color:var(--accent);border-color:var(--accent);background:var(--accent-dim);width:100%" id="confirm-all-findings-btn">${icon("check", 14)} Confirm All ${unreviewedCount} Findings</button>`;

        document.getElementById("confirm-all-findings-btn")?.addEventListener("click", () => {
          renderConfirmAllPanel(slot, detailTask, currentFindings, currentNoteTask, unreviewedIndices);
        });
      }
    }

    function renderConfirmAllPanel(slot, task, findings, noteTask, indices) {
      const HIGH_SEVS = ["critical", "major", "high"];
      // Build severity summary
      const sevCounts = {};
      indices.forEach(i => {
        const sev = findings[i]?.severity || "info";
        sevCounts[sev] = (sevCounts[sev] || 0) + 1;
      });
      const sevOrder = ["critical", "major", "high", "minor", "medium", "info", "low"];
      const colors = {
        critical: "var(--danger)", major: "var(--danger)", high: "var(--danger)",
        minor: "var(--warning)", medium: "var(--warning)",
        info: "var(--info)", low: "var(--info)"
      };
      const pillsHtml = sevOrder
        .filter(s => sevCounts[s])
        .map(s => `<span class="confirm-all-sev-pill" style="background:${colors[s]}20;color:${colors[s]}">${sevCounts[s]} ${s}</span>`)
        .join("");

      // Build finding rows
      const rowsHtml = indices.map(i => {
        const f = findings[i];
        const sev = f.severity || "info";
        const isHigh = HIGH_SEVS.includes(sev);
        const sevClass = `sev-${sev}`;
        return `<label class="confirm-all-row"${isHigh ? ` data-high-sev="${sev}"` : ""}>
          <input type="checkbox" checked data-confirm-idx="${i}" class="confirm-all-checkbox">
          <span class="confirm-all-row-sev ${sevClass}">${sev}</span>
          <span class="confirm-all-row-text">${escapeHtml(f.description || "")}</span>
        </label>`;
      }).join("");

      const hasHighSev = indices.some(i => HIGH_SEVS.includes(findings[i]?.severity));
      const highSevTotal = indices.filter(i => HIGH_SEVS.includes(findings[i]?.severity)).length;

      slot.innerHTML = `
        <div class="confirm-all-panel">
          <div class="confirm-all-panel-header">
            <span class="confirm-all-panel-title">Select findings to confirm</span>
            <div class="confirm-all-sev-pills">${pillsHtml}</div>
          </div>
          ${hasHighSev ? `<div class="confirm-all-warning" id="confirm-all-high-sev-warning">
            <span class="confirm-all-warning-icon">${icon("alertTriangle", 14)}</span>
            <span id="confirm-all-warning-text">${highSevTotal} high-severity findings selected — critical and major items usually need individual review</span>
          </div>` : ""}
          <div class="confirm-all-list">${rowsHtml}</div>
          <div class="confirm-all-actions">
            <button class="btn btn-sm btn-confirm-selected" style="color:var(--accent);border-color:var(--accent);background:var(--accent-dim)" id="confirm-all-execute-btn">${icon("check", 14)} Confirm ${indices.length} selected</button>
            <button class="btn btn-sm btn-ghost" id="confirm-all-cancel-btn">Cancel</button>
          </div>
        </div>`;

      // Wire up checkbox changes
      const checkboxes = slot.querySelectorAll(".confirm-all-checkbox");
      const executeBtn = document.getElementById("confirm-all-execute-btn");
      const warningEl = document.getElementById("confirm-all-high-sev-warning");
      const warningText = document.getElementById("confirm-all-warning-text");

      function updateState() {
        const checked = slot.querySelectorAll(".confirm-all-checkbox:checked");
        const count = checked.length;
        executeBtn.disabled = count === 0;
        executeBtn.innerHTML = `${icon("check", 14)} Confirm ${count} selected`;

        if (warningEl) {
          const highChecked = Array.from(checked).filter(cb =>
            HIGH_SEVS.includes(findings[parseInt(cb.dataset.confirmIdx)]?.severity)
          ).length;
          if (highChecked === 0) {
            warningEl.style.display = "none";
          } else {
            warningEl.style.display = "flex";
            warningText.textContent = `${highChecked} high-severity findings selected — critical and major items usually need individual review`;
          }
        }
      }

      checkboxes.forEach(cb => cb.addEventListener("change", updateState));

      // Cancel — collapse back to button
      document.getElementById("confirm-all-cancel-btn")?.addEventListener("click", () => {
        slot.innerHTML = `<button class="btn btn-sm" style="color:var(--accent);border-color:var(--accent);background:var(--accent-dim);width:100%" id="confirm-all-findings-btn">${icon("check", 14)} Confirm All ${indices.length} Findings</button>`;
        document.getElementById("confirm-all-findings-btn")?.addEventListener("click", () => {
          renderConfirmAllPanel(slot, task, findings, noteTask, indices);
        });
      });

      // Execute
      executeBtn?.addEventListener("click", async () => {
        const checkedIndices = Array.from(slot.querySelectorAll(".confirm-all-checkbox:checked"))
          .map(cb => parseInt(cb.dataset.confirmIdx));
        if (checkedIndices.length === 0) return;

        executeBtn.disabled = true;
        executeBtn.innerHTML = `<span class="spinner spinner-sm"></span> Confirming...`;

        const count = await confirmSelectedFindings(task, checkedIndices);
        if (count > 0) {
          showToast(`${count} finding(s) confirmed`, "success");
        } else {
          showToast("No findings were confirmed");
        }
        preserveDetailScroll = true;
        requestAnimationFrame(() => requestAnimationFrame(() => renderContent()));
      });
    }

    // Restore detail panel scroll (only if not task switch)
    detailPanel.scrollTop = preserveDetailScroll ? savedDetailScroll : 0;
    preserveDetailScroll = false;

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
