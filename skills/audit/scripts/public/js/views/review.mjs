// skills/audit/scripts/public/js/views/review.mjs
import { api } from "../api.mjs";
import { renderTaskDetail } from "../components/task-detail.mjs";
import { showToast } from "../app.mjs";

export async function renderReview(container, params) {
  const sessionId = params[0];
  let tasks = [];
  let notes = null;
  let currentTab = "overview";
  let currentTaskIdx = 0;

  container.innerHTML = `
    <h1 class="text-2xl font-bold text-gray-900 mb-6">Review Findings</h1>
    <div class="tabs no-print">
      <div class="tab ${currentTab === 'overview' ? 'active' : ''}" data-tab="overview">Overview</div>
      <div class="tab" data-tab="tasks">Tasks</div>
    </div>
    <div id="review-content"></div>
    <div class="flex justify-between mt-6 no-print">
      <button id="review-home-btn" class="btn">Back to Home</button>
      <button id="review-summary-btn" class="btn btn-primary">Summary & Sign-off</button>
    </div>
  `;

  try {
    const session = await api.getSession(sessionId);
    tasks = await api.getTasks(sessionId);
    notes = await api.getNotes(sessionId);
  } catch (e) {
    showToast("Failed to load review data: " + e.message);
    return;
  }

  function renderContent() {
    const content = document.getElementById("review-content");
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

    el.innerHTML = `
      <div class="grid grid-cols-3 gap-4 mb-6">
        <div class="card text-center"><div class="text-3xl font-bold text-gray-900">${avgScore}/10</div><div class="text-sm text-gray-500">Avg Score</div></div>
        <div class="card text-center"><div class="text-3xl font-bold text-gray-900">${totalFindings}</div><div class="text-sm text-gray-500">Findings</div></div>
        <div class="card text-center"><div class="text-3xl font-bold text-gray-900">${tasks.length}</div><div class="text-sm text-gray-500">Tasks</div></div>
      </div>
      ${Object.keys(bySeverity).length > 0 ? `
        <div class="card mb-4">
          <div class="font-medium text-gray-900 mb-3">Findings by Severity</div>
          ${Object.entries(bySeverity).map(([sev, count]) => `
            <div class="flex items-center justify-between py-1">
              <span class="badge severity-${sev}">${sev}</span>
              <span class="font-medium">${count}</span>
            </div>`).join("")}
        </div>
      ` : ""}
      <div class="card">
        <div class="font-medium text-gray-900 mb-3">Needs Attention</div>
        ${tasks.filter(t => (t.review?.findings || []).some(f => f.severity === "critical" || f.severity === "high" || f.severity === "major")).map(t => `
          <div class="flex items-center justify-between py-2 border-b last:border-0">
            <span class="text-sm font-mono">${t.name || t.file}</span>
            <span class="text-sm text-red-600">${(t.review?.findings || []).filter(f => f.severity === "critical" || f.severity === "high" || f.severity === "major").length} high-severity</span>
          </div>`).join("")}
        ${tasks.filter(t => (t.review?.findings || []).some(f => f.severity === "critical" || f.severity === "high" || f.severity === "major")).length === 0 ? '<div class="text-sm text-gray-400">No high-severity findings.</div>' : ""}
      </div>`;
  }

  function renderTasksTab(el) {
    el.innerHTML = `
      <div class="grid grid-cols-3 gap-4">
        <div class="col-span-1 border rounded max-h-screen overflow-y-auto" id="task-sidebar"></div>
        <div class="col-span-2 card" id="task-detail-panel"></div>
      </div>`;

    const sidebar = document.getElementById("task-sidebar");
    sidebar.innerHTML = tasks.map((t, i) => `
      <div class="task-nav-item p-3 border-b cursor-pointer hover:bg-gray-50 ${i === currentTaskIdx ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''}" data-idx="${i}">
        <div class="text-sm font-mono truncate">${t.name || t.file}</div>
        <div class="flex items-center gap-2 mt-1">
          <span class="badge badge-${t.status}-task">${t.status}</span>
          <span class="text-xs text-gray-500">${t.review?.score ?? "-"}/10</span>
        </div>
      </div>
    `).join("");

    sidebar.querySelectorAll(".task-nav-item").forEach(item => {
      item.addEventListener("click", () => {
        currentTaskIdx = parseInt(item.dataset.idx);
        renderContent();
      });
    });

    document.getElementById("task-detail-panel").innerHTML = renderTaskDetail(tasks[currentTaskIdx]);
  }

  // Tab switching
  container.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      currentTab = tab.dataset.tab;
      container.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      renderContent();
    });
  });

  // Navigation
  document.getElementById("review-home-btn").addEventListener("click", () => {
    location.hash = "#/home";
  });
  document.getElementById("review-summary-btn").addEventListener("click", () => {
    location.hash = `#/summary/${sessionId}`;
  });

  // Keyboard shortcuts
  document.addEventListener("keydown", function shortcutHandler(e) {
    if (e.key === "j" || e.key === "ArrowDown") {
      e.preventDefault();
      currentTaskIdx = Math.min(currentTaskIdx + 1, tasks.length - 1);
      renderContent();
    } else if (e.key === "k" || e.key === "ArrowUp") {
      e.preventDefault();
      currentTaskIdx = Math.max(currentTaskIdx - 1, 0);
      renderContent();
    } else if (e.key === "o") { currentTab = "overview"; renderContent(); }
    else if (e.key === "s") { currentTab = "tasks"; renderContent(); }
  });

  renderContent();
}
