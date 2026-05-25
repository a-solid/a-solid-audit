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
    <div class="tabs no-print" id="review-tabs" role="tablist">
      <div class="tab ${currentTab === "overview" ? "active" : ""}" data-tab="overview" role="tab" tabindex="0" aria-selected="${currentTab === "overview"}" aria-controls="review-content">Overview</div>
      <div class="tab" data-tab="tasks" role="tab" tabindex="-1" aria-selected="${currentTab !== "overview"}" aria-controls="review-content">Tasks</div>
    </div>
    <div id="review-content" role="tabpanel">
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

  async function autoConfirmFindings(task) {
    const taskFindings = task.review?.findings || [];
    if (taskFindings.length === 0) return 0;
    const noteTask = notes?.tasks?.find(t => t.file === task.file);
    const existingFindings = noteTask?.findings || [];
    let changed = false;
    const noteFindings = taskFindings.map((_, i) => {
      const existing = existingFindings[i];
      if (existing) return existing;
      changed = true;
      return { status: "confirmed", reason: "" };
    });
    if (!changed) return 0;
    try {
      await api.updateTaskNote(sessionId, task.file, { findings: noteFindings });
      if (!noteTask) {
        if (!notes) notes = { tasks: [] };
        const nt = { file: task.file, findings: noteFindings };
        notes.tasks.push(nt);
      } else {
        noteTask.findings = noteFindings;
      }
      return noteFindings.filter((f, i) => !existingFindings[i] && f).length;
    } catch (e) { return 0; }
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
              const highSevCount = (t.review?.findings || []).filter(f => f.severity === "critical" || f.severity === "high" || f.severity === "major").length;
              return `
              <div class="flex items-center justify-between py-2 border-b needs-attention-item" style="border-color:var(--border);cursor:pointer" data-task-idx="${taskIdx}" role="link" tabindex="0" aria-label="${escapeHtml(t.name || t.file)}, ${highSevCount} high-severity findings">
                <span class="text-sm font-mono truncate">${escapeHtml(t.name || t.file)}</span>
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

  function renderTasksTab(el) {
    // Preserve sidebar scroll position across re-renders
    const savedScrollTop = document.getElementById("task-sidebar")?.scrollTop || 0;
    const savedDetailScroll = preserveDetailScroll
      ? (document.getElementById("task-detail-panel")?.scrollTop || 0)
      : 0;

    el.innerHTML = `
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
        const confirmedCount = await autoConfirmFindings(tasks[currentTaskIdx]);
        if (confirmedCount > 0) {
          showToast(`${confirmedCount} finding(s) auto-confirmed`, "success");
        }
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

    const detailPanel = document.getElementById("task-detail-panel");
    detailPanel.innerHTML = renderTaskDetail(tasks[currentTaskIdx], notes);
    renderMermaidDiagrams(detailPanel);

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
  });

  renderContent();
}
