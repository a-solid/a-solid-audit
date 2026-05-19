// skills/audit/scripts/public/js/views/home.mjs
import { api } from "../api.mjs";
import { showToast } from "../app.mjs";

export async function renderHome(container) {
  container.innerHTML = `
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold text-gray-900">Audit Sessions</h1>
      <button id="new-audit-btn" class="btn btn-primary">New Audit</button>
    </div>
    <div id="session-list"></div>
  `;

  document.getElementById("new-audit-btn").addEventListener("click", async () => {
    try {
      const { id } = await api.createSession();
      location.hash = `#/wizard/${id}`;
    } catch (e) {
      showToast("Failed to create session: " + e.message);
    }
  });

  try {
    const sessions = await api.listSessions();
    const listEl = document.getElementById("session-list");

    if (sessions.length === 0) {
      listEl.innerHTML = `<div class="empty-state">
        <div class="empty-state-icon">No sessions yet</div>
        <p>Click "New Audit" to create your first audit session.</p>
      </div>`;
      return;
    }

    listEl.innerHTML = sessions.map(s => {
      const statusClass = `badge-${s.status}`;
      return `
        <div class="card mb-3 cursor-pointer hover:border-blue-300" data-id="${s.id}" data-status="${s.status}">
          <div class="flex items-center justify-between">
            <div>
              <div class="font-medium text-gray-900">${s.id}</div>
              <div class="text-sm text-gray-500 mt-1">
                ${s.type} &middot; ${new Date(s.created).toLocaleDateString()}
              </div>
            </div>
            <div class="flex items-center gap-3">
              <span class="badge ${statusClass}">${s.status}</span>
              ${s.progress ? `
                <div class="w-24">
                  <div class="progress-bar"><div class="progress-fill" style="width:${s.progress.percentage}%"></div></div>
                  <div class="text-xs text-gray-400 mt-1">${s.progress.reviewed}/${s.progress.total}</div>
                </div>
              ` : ""}
            </div>
          </div>
        </div>`;
    }).join("");

    // Click handlers: navigate based on status
    listEl.querySelectorAll(".card").forEach(card => {
      card.addEventListener("click", () => {
        const id = card.dataset.id;
        const status = card.dataset.status;
        if (status === "completed") {
          location.hash = `#/review/${id}`;
        } else if (status === "created") {
          location.hash = `#/wizard/${id}`;
        } else {
          location.hash = `#/progress/${id}`;
        }
      });
    });
  } catch (e) {
    showToast("Failed to load sessions: " + e.message);
  }
}
