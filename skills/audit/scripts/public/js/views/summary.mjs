// skills/audit/scripts/public/js/views/summary.mjs
import { api } from "../api.mjs";
import { showToast } from "../app.mjs";

export async function renderSummary(container, params) {
  const sessionId = params[0];
  let tasks = [];
  let notes = null;

  container.innerHTML = `
    <h1 class="text-2xl font-bold text-gray-900 mb-6">Summary & Sign-off</h1>
    <div id="summary-content"></div>
  `;

  try {
    tasks = await api.getTasks(sessionId);
    notes = await api.getNotes(sessionId);
  } catch (e) {
    showToast("Failed to load summary data: " + e.message);
    return;
  }

  const totalFindings = tasks.reduce((sum, t) => sum + (t.review?.findings?.length || 0), 0);
  const bySeverity = {};
  tasks.forEach(t => {
    (t.review?.findings || []).forEach(f => {
      bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
    });
  });

  const noteTasks = notes?.tasks || [];
  const confirmed = noteTasks.filter(t => t.status === "confirmed").length;
  const actionRequired = noteTasks.filter(t => t.status === "action-required").length;
  const deferred = noteTasks.filter(t => t.status === "deferred").length;

  const content = document.getElementById("summary-content");
  content.innerHTML = `
    <div class="grid grid-cols-4 gap-4 mb-6">
      <div class="card text-center"><div class="text-2xl font-bold text-gray-900">${totalFindings}</div><div class="text-sm text-gray-500">Total Findings</div></div>
      <div class="card text-center"><div class="text-2xl font-bold text-green-600">${confirmed}</div><div class="text-sm text-gray-500">Confirmed</div></div>
      <div class="card text-center"><div class="text-2xl font-bold text-red-600">${actionRequired}</div><div class="text-sm text-gray-500">Action Required</div></div>
      <div class="card text-center"><div class="text-2xl font-bold text-yellow-600">${deferred}</div><div class="text-sm text-gray-500">Deferred</div></div>
    </div>

    ${Object.keys(bySeverity).length > 0 ? `
    <div class="card mb-6">
      <div class="font-medium text-gray-900 mb-3">Findings by Severity</div>
      ${Object.entries(bySeverity).map(([sev, count]) => `
        <div class="flex justify-between py-1"><span class="badge severity-${sev}">${sev}</span><span>${count}</span></div>
      `).join("")}
    </div>` : ""}

    <div class="card mb-6">
      <div class="font-medium text-gray-900 mb-3">Overall Notes</div>
      <textarea id="summary-notes" class="w-full border rounded p-3 text-sm" rows="4" placeholder="Add your review notes...">${escapeHtml(notes?.summary?.notes || "")}</textarea>
      <button id="save-notes-btn" class="btn mt-2">Save Notes</button>
    </div>

    <div class="card mb-6">
      <div class="font-medium text-gray-900 mb-3">Sign-off</div>
      <div class="grid grid-cols-2 gap-4">
        <div><label class="text-sm font-medium">Name</label>
          <input id="signoff-name" class="w-full border rounded p-2 mt-1 text-sm" value="${escapeHtml(notes?.summary?.signoff?.name || "")}"></div>
        <div><label class="text-sm font-medium">Role</label>
          <input id="signoff-role" class="w-full border rounded p-2 mt-1 text-sm" value="${escapeHtml(notes?.summary?.signoff?.role || "")}"></div>
      </div>
      ${notes?.summary?.signoff?.date ? `<div class="text-sm text-gray-500 mt-2">Signed off: ${notes.summary.signoff.date}</div>` : ""}
      <button id="signoff-btn" class="btn btn-primary mt-3">Sign Off</button>
    </div>

    <div class="flex justify-between no-print">
      <button id="summary-back-btn" class="btn">Back to Review</button>
      <button id="export-pdf-btn" class="btn btn-primary">Export PDF</button>
    </div>
  `;

  document.getElementById("save-notes-btn").addEventListener("click", async () => {
    try {
      await api.updateSummary(sessionId, {
        notes: document.getElementById("summary-notes").value,
      });
      showToast("Notes saved", "success");
    } catch (e) { showToast("Failed to save: " + e.message); }
  });

  document.getElementById("signoff-btn").addEventListener("click", async () => {
    try {
      await api.updateSummary(sessionId, {
        signoff: {
          name: document.getElementById("signoff-name").value,
          role: document.getElementById("signoff-role").value,
          date: new Date().toISOString(),
        },
      });
      showToast("Signed off successfully", "success");
    } catch (e) { showToast("Sign-off failed: " + e.message); }
  });

  document.getElementById("summary-back-btn").addEventListener("click", () => {
    location.hash = `#/review/${sessionId}`;
  });

  document.getElementById("export-pdf-btn").addEventListener("click", () => {
    window.print();
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = String(str);
  return div.innerHTML;
}
