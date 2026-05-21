// skills/audit/scripts/public/js/views/review.mjs
import { api } from "../api.mjs";
import { renderTaskDetail } from "../components/task-detail.mjs";
import { showToast, setBreadcrumb, icon, escapeHtml, onNavigateCleanup } from "../app.mjs";

const SEVERITY_LABELS = {
  'partially-met': 'Partial',
  'not-met': 'Not Met',
  'met': 'Met',
};

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
        <button id="review-home-btn" class="btn btn-ghost">${icon("arrowLeft", 14)} Home</button>
        <button id="review-summary-btn" class="btn btn-primary">Summary & Sign-off</button>
      </div>
    </div>
    <div class="tabs no-print" id="review-tabs">
      <div class="tab ${currentTab === "overview" ? "active" : ""}" data-tab="overview">Overview</div>
      <div class="tab" data-tab="tasks">Tasks</div>
    </div>
    <div id="review-content"></div>
  `;

  try {
    const session = await api.getSession(sessionId);
    tasks = await api.getTasks(sessionId);
    notes = await api.getNotes(sessionId);
  } catch (e) {
    showToast("Failed to load review data: " + e.message);
    return;
  }

  async function updateFindingStatus(sid, task, findingIdx, status, reason) {
    const findingsCount = (task.review?.findings || []).length;
    const noteFindings = Array.from({ length: findingsCount }, (_, i) => {
      const existing = notes?.tasks?.find(t => t.file === task.file)?.findings?.[i];
      return existing || { status: "confirmed", reason: "" };
    });
    noteFindings[findingIdx] = { status, reason };
    try {
      await api.updateTaskNote(sid, task.file, { findings: noteFindings });
      const desc = task.review?.findings?.[findingIdx]?.description || "";
      const snippet = desc.length > 40 ? desc.slice(0, 40) + "..." : desc;
      showToast(
        status === "confirmed"
          ? `Confirmed: ${snippet}`
          : `Dismissed: ${snippet}`,
        "success"
      );
    } catch (e) {
      showToast("Failed to update: " + e.message);
    }
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
    const sevColors = {
      critical: "var(--danger)", major: "var(--danger)", high: "var(--danger)",
      medium: "var(--warning)", minor: "var(--warning)",
      low: "var(--info)", info: "var(--info)",
    };

    el.innerHTML = `
      <div class="grid grid-cols-3 gap-4 mb-6">
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

      ${Object.keys(bySeverity).length > 0 ? `
        <div class="card mb-4">
          <div class="font-medium mb-4">Findings by Severity</div>
          ${Object.entries(bySeverity).map(([sev, count]) => `
            <div class="severity-bar-row">
              <span class="badge severity-${sev} severity-bar-label">${SEVERITY_LABELS[sev] || sev}</span>
              <div class="severity-bar-track">
                <div class="severity-bar-fill" style="width:${(count / maxSevCount) * 100}%;background:${sevColors[sev] || "var(--info)"}"></div>
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
          return critical.map(t => `
            <div class="flex items-center justify-between py-2 border-b" style="border-color:var(--border)">
              <span class="text-sm font-mono truncate">${escapeHtml(t.name || t.file)}</span>
              <span class="text-sm text-danger font-medium">${(t.review?.findings || []).filter(f => f.severity === "critical" || f.severity === "high" || f.severity === "major").length} high-severity</span>
            </div>
          `).join("");
        })()}
      </div>`;
  }

  function renderTasksTab(el) {
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

    sidebar.querySelectorAll(".task-nav-item").forEach(item => {
      item.addEventListener("click", () => {
        currentTaskIdx = parseInt(item.dataset.idx);
        renderContent();
      });
    });

    const detailPanel = document.getElementById("task-detail-panel");
    detailPanel.innerHTML = renderTaskDetail(tasks[currentTaskIdx], notes);

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
      btn.addEventListener("click", async () => {
        const idx = parseInt(btn.closest("[data-dismiss-panel]").dataset.dismissPanel);
        const reason = btn.dataset.reason;
        await updateFindingStatus(sessionId, tasks[currentTaskIdx], idx, "deferred", reason);
      });
    });
    // Dismiss custom submit
    detailPanel.querySelectorAll(".dismiss-submit-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const idx = parseInt(btn.dataset.dismissSubmit);
        const input = detailPanel.querySelector(`[data-dismiss-custom="${idx}"]`);
        const reason = input?.value?.trim();
        if (!reason) { showToast("Enter a reason"); return; }
        await updateFindingStatus(sessionId, tasks[currentTaskIdx], idx, "deferred", reason);
      });
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
