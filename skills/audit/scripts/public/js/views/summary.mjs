// skills/audit/scripts/public/js/views/summary.mjs
import { api } from "../api.mjs";
import { showToast, setBreadcrumb, icon, escapeHtml } from "../app.mjs";
import { renderPrintTaskDetail } from "../components/print-task-detail.mjs";

const SEVERITY_LABELS = {
  'partially-met': 'Partial',
  'not-met': 'Not Met',
  'met': 'Met',
};

export async function renderSummary(container, params) {
  const sessionId = params[0];
  let tasks = [];
  let notes = null;

  setBreadcrumb([
    { label: "Sessions", href: "#/home" },
    { label: "Review", href: `#/review/${sessionId}` },
    { label: "Summary" },
  ]);

  container.innerHTML = `
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl">Summary & Sign-off</h1>
      <div class="flex gap-2 no-print">
        <button id="summary-back-btn" class="btn btn-ghost" aria-label="Go back to review">${icon("arrowLeft", 14)} Review</button>
        <button id="export-pdf-btn" class="btn btn-primary" aria-label="Export PDF">${icon("download", 14)} Export PDF</button>
      </div>
    </div>
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
  // Count from per-finding statuses (what the UI actually writes)
  let confirmed = 0;
  let actionRequired = 0;
  let deferred = 0;
  noteTasks.forEach(t => {
    (t.findings || []).forEach(f => {
      if (f.status === "confirmed") confirmed++;
      else if (f.status === "deferred") deferred++;
    });
  });
  // Any confirmed critical/major finding = action required
  tasks.forEach(t => {
    const noteTask = noteTasks.find(nt => nt.file === t.file);
    const taskFindings = t.review?.findings || [];
    const noteFindings = noteTask?.findings || [];
    taskFindings.forEach((f, i) => {
      const noteF = noteFindings[i];
      if (noteF?.status === "confirmed" && (f.severity === "critical" || f.severity === "major" || f.severity === "high")) {
        actionRequired++;
      }
    });
  });
  const reviewed = confirmed + deferred + actionRequired;
  const unreviewed = totalFindings - reviewed;

  const maxSevCount = Math.max(...Object.values(bySeverity), 1);
  const sevColors = {
    critical: "var(--danger)", major: "var(--danger)", high: "var(--danger)",
    medium: "var(--warning)", minor: "var(--warning)",
    low: "var(--info)", info: "var(--info)",
  };

  const content = document.getElementById("summary-content");
  content.innerHTML = `
    <div class="grid grid-cols-5 gap-4 mb-6">
      <div class="stat-card">
        <div class="stat-value">${totalFindings}</div>
        <div class="stat-label">Total Findings</div>
      </div>
      <div class="stat-card">
        <div class="stat-value stat-value-success">${confirmed}</div>
        <div class="stat-label">Confirmed</div>
      </div>
      <div class="stat-card">
        <div class="stat-value stat-value-danger">${actionRequired}</div>
        <div class="stat-label">Action Required</div>
      </div>
      <div class="stat-card">
        <div class="stat-value stat-value-warning">${deferred}</div>
        <div class="stat-label">Deferred</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color:var(--text-muted)">${unreviewed}</div>
        <div class="stat-label">Unreviewed</div>
      </div>
    </div>

    ${Object.keys(bySeverity).length > 0 ? `
    <div class="card mb-6">
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
    </div>` : ""}

    <div class="card mb-6">
      <div class="font-medium mb-3">Overall Notes</div>
      <textarea id="summary-notes" class="w-full" rows="4" placeholder="Add your review notes...">${escapeHtml(notes?.summary?.notes || "")}</textarea>
      <div class="flex justify-end mt-2">
        <button id="save-notes-btn" class="btn btn-sm">Save Notes</button>
      </div>
    </div>

    <div class="card mb-6">
      <div class="font-medium mb-4">Task Details</div>
      <div class="space-y-4">
        ${tasks.map(t => renderPrintTaskDetail(t, notes)).join("")}
      </div>
    </div>

    <div class="card mb-6">
      <div class="font-medium mb-3">Sign-off</div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label>Name</label>
          <input id="signoff-name" class="mt-1" value="${escapeHtml(notes?.summary?.signoff?.name || "")}">
          <div id="signoff-name-error" class="text-danger text-xs mt-1 hidden">Name is required</div>
        </div>
        <div>
          <label>Role</label>
          <input id="signoff-role" class="mt-1" value="${escapeHtml(notes?.summary?.signoff?.role || "")}">
        </div>
      </div>
      ${notes?.summary?.signoff?.date ? `
        <div class="info-banner info-banner-green mt-3">
          ${icon("check", 16)}
          <span>Signed off on ${new Date(notes.summary.signoff.date).toLocaleDateString()} by ${escapeHtml(notes.summary.signoff.name || "unknown")}</span>
        </div>
      ` : ""}
      ${!notes?.summary?.signoff?.date ? `
        <button id="signoff-btn" class="btn btn-primary mt-3">
          ${icon("check", 14)}
          Sign Off
        </button>
      ` : ""}
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

  document.getElementById("signoff-btn")?.addEventListener("click", async () => {
    const name = document.getElementById("signoff-name").value.trim();
    const nameError = document.getElementById("signoff-name-error");
    if (!name) {
      if (nameError) nameError.classList.remove("hidden");
      document.getElementById("signoff-name").style.borderColor = "var(--danger)";
      document.getElementById("signoff-name").focus();
      return;
    }
    if (nameError) nameError.classList.add("hidden");
    document.getElementById("signoff-name").style.borderColor = "";
    const role = document.getElementById("signoff-role").value.trim();
    try {
      await api.updateSummary(sessionId, {
        signoff: { name, role, date: new Date().toISOString() },
      });
      showToast("Signed off successfully", "success");
      location.hash = `#/summary/${sessionId}`;
    } catch (e) { showToast("Sign-off failed: " + e.message); }
  });

  document.getElementById("signoff-name")?.addEventListener("input", () => {
    const nameError = document.getElementById("signoff-name-error");
    if (nameError) nameError.classList.add("hidden");
    document.getElementById("signoff-name").style.borderColor = "";
  });

  document.getElementById("summary-back-btn").addEventListener("click", () => {
    location.hash = `#/review/${sessionId}`;
  });

  document.getElementById("export-pdf-btn").addEventListener("click", () => {
    window.print();
  });
}
