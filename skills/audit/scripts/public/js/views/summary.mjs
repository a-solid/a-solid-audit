// skills/audit/scripts/public/js/views/summary.mjs
import { api } from "../api.mjs";
import { showToast, setBreadcrumb, icon, escapeHtml } from "../app.mjs";
import { SEVERITY_LABELS, SEVERITY_COLORS, scoreColor, aggregateFindings } from "../constants.mjs";

export async function renderSummary(container, params) {
  const sessionId = params[0];
  let tasks = [];
  let notes = null;

  const shortId = sessionId ? sessionId.slice(0, 7) : "";
  setBreadcrumb([
    { label: "Sessions", href: "#/home" },
    ...(shortId ? [{ label: shortId, href: `#/review/${sessionId}` }] : []),
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
    const [taskRes, notesRes] = await Promise.allSettled([
      api.getTasks(sessionId),
      api.getNotes(sessionId),
    ]);
    if (taskRes.status === "ok") tasks = taskRes.value;
    else { showToast("Failed to load tasks: " + taskRes.reason?.message); return; }
    if (notesRes.status === "ok") notes = notesRes.value;
    else showToast("Notes unavailable — sign-off section may not display", "warning");
  } catch (e) {
    showToast("Failed to load data: " + e.message);
    return;
  }

  const { totalFindings, bySeverity, needFix: needFixCount, wontFix: wontFixCount, notAnIssue: notAnIssueCount, pendingCount: pending, reviewed: reviewedCount } = aggregateFindings(tasks, notes);
  const noteTasks = notes?.tasks || [];

  const maxSevCount = Math.max(...Object.values(bySeverity), 1);

  const content = document.getElementById("summary-content");
  content.innerHTML = `
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
      <div class="stat-card">
        <div class="stat-value">${totalFindings}</div>
        <div class="stat-label">Total</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color:var(--danger)">${needFixCount}</div>
        <div class="stat-label">Need Fix</div>
      </div>
      <div class="stat-card">
        <div class="stat-value stat-value-warning">${wontFixCount}</div>
        <div class="stat-label">Won't Fix</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color:var(--info)">${notAnIssueCount}</div>
        <div class="stat-label">Not an Issue</div>
      </div>
    </div>

    <div class="card mb-6">
      <div class="font-medium mb-2">Review Progress</div>
      <div class="review-progress-bar">
        ${(() => {
          const t = Math.max(totalFindings, 1);
          const nPct = Math.round(needFixCount / t * 100);
          const wPct = Math.round(wontFixCount / t * 100);
          const niPct = Math.round(notAnIssueCount / t * 100);
          const pPct = 100 - nPct - wPct - niPct;
          return `${needFixCount > 0 ? `<div class="review-progress-seg seg-need-fix" style="width:${nPct}%"></div>` : ""}${wontFixCount > 0 ? `<div class="review-progress-seg seg-wont-fix" style="width:${wPct}%"></div>` : ""}${notAnIssueCount > 0 ? `<div class="review-progress-seg seg-not-an-issue" style="width:${niPct}%"></div>` : ""}<div class="review-progress-seg seg-pending" style="width:${pPct}%"></div>`;
        })()}
      </div>
      <div class="review-progress-label">
        <span>${Math.round(reviewedCount / Math.max(totalFindings, 1) * 100)}% reviewed</span>
        <span>${pending} remaining</span>
      </div>
    </div>

    ${pending > 0 ? `
      <div class="review-progress-warning">
        ${pending} finding${pending !== 1 ? "s" : ""} still pending review — complete all reviews before sign-off
      </div>
    ` : ""}

    ${Object.keys(bySeverity).length > 0 ? `
    <div class="card mb-6">
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
    </div>` : ""}

    <div id="review-summary-card-wrapper"></div>

    <div class="card mb-6">
      <div class="font-medium mb-4">Task Overview</div>
      ${renderTaskTable(tasks, notes)}
    </div>
  `;

  function renderSummaryCard(signoff, currentNotes) {
    const wrapper = document.getElementById("review-summary-card-wrapper");
    if (!wrapper) return;
    wrapper.innerHTML = `
      <div class="card mb-6" id="review-summary-card"${signoff?.date ? ' style="border-color:var(--success);border-left:3px solid var(--success)"' : ""}>
        <div class="font-medium mb-3">Review Sign-off</div>

        <textarea id="summary-notes" class="w-full" rows="4" placeholder="Add your review notes...">${escapeHtml(currentNotes || "")}</textarea>

        <div class="border-t my-4" style="border-color:var(--border)"></div>

        ${signoff?.date ? `
        <div class="signoff-signed">
          <div class="signoff-signed-left">
            <div class="signoff-avatar">${icon("check", 16)}</div>
          </div>
          <div class="signoff-signed-body">
            <div class="signoff-signed-name">${escapeHtml(signoff.name || "unknown")}</div>
            <div class="signoff-signed-meta">${signoff.role ? escapeHtml(signoff.role) + " &middot; " : ""}${new Date(signoff.date).toLocaleDateString()}</div>
          </div>
          <button id="signoff-undo-btn" class="btn btn-ghost btn-sm no-print" style="margin-left:auto;font-size:12px;color:var(--text-muted);text-decoration:underline;padding:2px 6px">Undo</button>
        </div>` : `
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label for="signoff-name">Name</label>
            <input id="signoff-name" class="mt-1" value="${escapeHtml(signoff?.name || "")}">
            <div id="signoff-name-error" class="text-danger text-xs mt-1 hidden">Name is required</div>
          </div>
          <div>
            <label for="signoff-role">Role</label>
            <input id="signoff-role" class="mt-1" value="${escapeHtml(signoff?.role || "")}">
          </div>
        </div>
        <div class="flex justify-end mt-3">
          <div id="signoff-name-error-bar" class="text-danger text-xs mr-auto hidden" style="align-self:center">Name is required</div>
          <button id="save-btn" class="btn btn-primary no-print">
            ${icon("check", 14)}
            Save
          </button>
        </div>`}
        <div class="print-only text-sm text-muted mt-2">${signoff?.date ? "" : "Not signed off"}</div>
      </div>
    `;
    wireSummaryCardHandlers(signoff, currentNotes);
  }

  function wireSummaryCardHandlers(signoff, currentNotes) {
    document.getElementById("save-btn")?.addEventListener("click", async () => {
      const nameInput = document.getElementById("signoff-name");
      const name = nameInput?.value.trim() || "";
      const nameError = document.getElementById("signoff-name-error");
      const nameErrorBar = document.getElementById("signoff-name-error-bar");

      if (nameInput && !name) {
        if (nameError) nameError.classList.remove("hidden");
        if (nameErrorBar) nameErrorBar.classList.remove("hidden");
        nameInput.style.borderColor = "var(--danger)";
        nameInput.focus();
        return;
      }
      if (nameError) nameError.classList.add("hidden");
      if (nameErrorBar) nameErrorBar.classList.add("hidden");
      if (nameInput) nameInput.style.borderColor = "";

      const role = document.getElementById("signoff-role")?.value.trim() || "";
      const notesText = document.getElementById("summary-notes").value;
      try {
        const update = { notes: notesText };
        if (nameInput) {
          update.signoff = { name, role, date: new Date().toISOString() };
        }
        await api.updateSummary(sessionId, update);
        showToast(nameInput ? "Signed off successfully" : "Saved", "success");
        renderSummaryCard(nameInput ? { name, role, date: new Date().toISOString() } : signoff, notesText);
      } catch (e) { showToast("Save failed: " + e.message); }
    });

    document.getElementById("signoff-undo-btn")?.addEventListener("click", async () => {
      try {
        await api.updateSummary(sessionId, { signoff: null });
        const notesText = document.getElementById("summary-notes").value;
        showToast("Sign-off cleared", "success");
        renderSummaryCard({ name: "", role: "", date: "" }, notesText);
      } catch (e) { showToast("Failed to undo sign-off: " + e.message); }
    });

    document.getElementById("signoff-name")?.addEventListener("input", () => {
      const nameError = document.getElementById("signoff-name-error");
      const nameErrorBar = document.getElementById("signoff-name-error-bar");
      if (nameError) nameError.classList.add("hidden");
      if (nameErrorBar) nameErrorBar.classList.add("hidden");
      const nameInput = document.getElementById("signoff-name");
      if (nameInput) nameInput.style.borderColor = "";
    });

    // Auto-save notes: debounce + blur
    let notesTimer = null;
    const notesEl = document.getElementById("summary-notes");
    if (notesEl) {
      notesEl.addEventListener("input", () => {
        clearTimeout(notesTimer);
        notesTimer = setTimeout(async () => {
          try {
            await api.updateSummary(sessionId, { notes: notesEl.value });
          } catch (e) { /* next save will retry */ }
        }, 1500);
      });
      notesEl.addEventListener("blur", () => {
        clearTimeout(notesTimer);
        api.updateSummary(sessionId, { notes: notesEl.value }).catch(() => {});
      });
    }
  }

  function renderTaskTable(taskList, notesData) {
    const noteTasks = notesData?.tasks || [];
    const severities = ["critical", "major", "minor", "info"];

    return `
    <div style="overflow-x:auto">
      <table class="summary-table">
        <thead>
          <tr>
            <th>Task</th>
            <th>Score</th>
            ${severities.map(s => `<th>${s.charAt(0).toUpperCase() + s.slice(1)}</th>`).join("")}
            <th>Total</th>
            <th>Human Review</th>
          </tr>
        </thead>
        <tbody>
          ${taskList.map((task, taskIdx) => {
            const findings = task.review?.findings || [];
            const totalFindings = findings.length;
            const bySev = {};
            severities.forEach(s => { bySev[s] = 0; });
            findings.forEach(f => {
              const normalized = f.severity === "high" ? "major" : f.severity === "medium" ? "minor" : f.severity === "low" ? "info" : f.severity;
              if (bySev[normalized] !== undefined) bySev[normalized]++;
            });

            const noteTask = noteTasks.find(t => t.file === task.file);
            const reviewedCount = (noteTask?.findings || []).filter(f => f && ["need-fix", "wont-fix", "not-an-issue"].includes(f.status)).length;
            let reviewStatus = "none";
            if (totalFindings > 0) {
              if (reviewedCount === 0) reviewStatus = "unreviewed";
              else if (reviewedCount >= totalFindings) reviewStatus = "reviewed";
              else reviewStatus = "partial";
            }

            const score = task.review?.score;
            return `
            <tr>
              <td><a class="task-name-link" href="#/review/${sessionId}?task=${taskIdx}">${escapeHtml(task.name || task.file)}</a></td>
              <td><span style="color:${scoreColor(score)};font-weight:600;font-family:var(--font-mono)">${score ?? "-"}/10</span></td>
              ${severities.map(s => {
                const count = bySev[s];
                return `<td><span class="sev-count ${count > 0 ? "sev-count-" + s : "sev-count-zero"}">${count}</span></td>`;
              }).join("")}
              <td><span class="total-count">${totalFindings}</span></td>
              <td>${reviewStatus === "none" ? '<span style="color:var(--text-muted)">—</span>' : `<span class="human-review-badge human-review-${reviewStatus}">${reviewStatus === "reviewed" ? "Reviewed" : reviewStatus === "partial" ? "Partial" : "Pending"}</span>`}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>`;
  }

  renderSummaryCard(notes?.summary?.signoff, notes?.summary?.notes);

  document.getElementById("summary-back-btn").addEventListener("click", () => {
    location.hash = `#/review/${sessionId}`;
  });

  document.getElementById("export-pdf-btn").addEventListener("click", () => {
    window.open(`print.html?session=${sessionId}`, "_blank");
  });
}
