// skills/audit/scripts/public/js/views/progress.mjs
import { api } from "../api.mjs";
import { showToast } from "../app.mjs";

export async function renderProgress(container, params) {
  const sessionId = params[0];
  let pollFailures = 0;
  let pollTimer = null;

  container.innerHTML = `
    <h1 class="text-2xl font-bold text-gray-900 mb-2">AI Review in Progress</h1>
    <p class="text-sm text-gray-500 mb-6">Keep the Claude Code terminal open.</p>
    <div class="card mb-4">
      <div id="progress-overview"></div>
      <div class="progress-bar mt-3"><div id="progress-fill" class="progress-fill" style="width:0%"></div></div>
      <div id="progress-text" class="text-sm text-gray-500 mt-2"></div>
    </div>
    <div id="task-list" class="space-y-2"></div>
    <div id="poll-warning" class="hidden mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
      <span class="text-sm text-yellow-700">Connection issues detected.</span>
      <button id="manual-refresh-btn" class="btn text-sm ml-2">Refresh</button>
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
      document.getElementById("progress-text").textContent = `${reviewed}/${total} tasks reviewed`;

      document.getElementById("progress-overview").innerHTML = `
        <span class="badge badge-${session.status}">${session.status}</span>
        <span class="text-sm text-gray-500 ml-3">${session.type} review</span>`;

      document.getElementById("task-list").innerHTML = tasks.map(t => `
        <div class="card flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="badge badge-${t.status}-task">${t.status}</span>
            <span class="text-sm font-mono">${t.name || t.file}</span>
          </div>
          <span class="text-sm text-gray-500">${t.review?.score ? 'Score: ' + t.review.score : ''}</span>
        </div>
      `).join("");

      // Auto-navigate when all reviewed
      if (reviewed === total && total > 0 && session.status === "completed") {
        clearInterval(pollTimer);
        location.hash = `#/review/${sessionId}`;
        return;
      }

      // If still waiting for AI review to begin
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
    poll();
    pollTimer = setInterval(poll, 3000);
  });

  await poll();
  pollTimer = setInterval(poll, 3000);

  // Cleanup on navigation away
  window.addEventListener("hashchange", () => clearInterval(pollTimer), { once: true });
}
