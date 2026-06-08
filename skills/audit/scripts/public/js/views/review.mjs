// skills/audit/scripts/public/js/views/review.mjs
import { api } from "../api.mjs";
import { showToast, setBreadcrumb, icon, escapeHtml, onNavigateCleanup } from "../app.mjs";
import { aggregateFindings } from "../constants.mjs";

const HIGH_SEVERITIES = ["critical", "high", "major"];
const LOW_SEVERITIES = ["minor", "info", "low", "medium"];
const WONT_FIX_REASONS = ["Acceptable risk", "Out of scope", "Will address later"];
const NOT_ISSUE_REASONS = ["False positive", "Already handled", "By design"];

export async function renderReview(container, params) {
  const roundName = params[0];
  const version = params[1];
  let tasks = [];
  let notes = null;
  let currentIdx = 0;

  setBreadcrumb([
    { label: "Rounds", href: "#/home" },
    { label: roundName, href: `#/round/${encodeURIComponent(roundName)}` },
    { label: version },
    { label: "Findings" },
  ]);

  container.innerHTML = `<div class="flex items-center justify-center" style="padding:var(--space-8)"><span class="spinner"></span></div>`;

  try {
    const [taskRes, notesRes] = await Promise.allSettled([
      api.getTasks(roundName, version),
      api.getNotes(roundName, version),
    ]);
    if (taskRes.status === "fulfilled") tasks = taskRes.value;
    else { showToast("Failed to load tasks: " + taskRes.reason?.message); return; }
    if (notesRes.status === "fulfilled") notes = notesRes.value;
    else showToast("Notes unavailable", "warning");
  } catch (e) {
    showToast("Failed to load: " + e.message);
    return;
  }

  // Auto-persist well-done findings and auto-dismiss low severity
  await autoPersist();
  await autoDismissLow();

  // Build flat findings list
  const findings = buildFindingsList(tasks, notes);

  async function autoPersist() {
    for (const task of tasks) {
      if (task.status !== "reviewed") continue;
      const findings = task.review?.findings || [];
      const noteTask = notes?.tasks?.find(nt => nt.file === task.file);
      const noteFindings = noteTask?.findings || [];
      let changed = false;
      const saveFindings = findings.map((f, i) => {
        if ((f.severity === "met" || f.severity === "positive") && !noteFindings[i]?.status) {
          changed = true;
          return { status: "well-done" };
        }
        return noteFindings[i] || null;
      });
      if (findings.length === 0 && !noteTask) changed = true;
      if (changed) {
        await api.updateTaskNote(roundName, version, task.file, { findings: saveFindings });
        let existing = notes?.tasks?.find(nt => nt.file === task.file);
        if (!existing) {
          if (!notes) notes = { tasks: [] };
          notes.tasks.push({ file: task.file, findings: saveFindings });
        } else {
          existing.findings = saveFindings;
        }
      }
    }
  }

  async function autoDismissLow() {
    for (const task of tasks) {
      if (task.status !== "reviewed") continue;
      const findings = task.review?.findings || [];
      const noteTask = notes?.tasks?.find(nt => nt.file === task.file);
      const existing = noteTask?.findings || [];
      let changed = false;
      const saveFindings = findings.map((f, i) => {
        if (existing[i]?.status) return existing[i];
        if (LOW_SEVERITIES.includes(f.severity)) {
          changed = true;
          return { status: "wont-fix", reason: "Auto-dismissed: low severity" };
        }
        return null;
      });
      if (changed) {
        await api.updateTaskNote(roundName, version, task.file, { findings: saveFindings });
        if (!noteTask) {
          if (!notes) notes = { tasks: [] };
          notes.tasks.push({ file: task.file, findings: saveFindings });
        } else {
          noteTask.findings = saveFindings;
        }
      }
    }
  }

  function buildFindingsList(taskList, notesData) {
    const list = [];
    let autoResolvedCount = 0;
    let manualResolvedCount = 0;
    for (const task of taskList) {
      if (task.status !== "reviewed") continue;
      const findings = task.review?.findings || [];
      const noteTask = notesData?.tasks?.find(nt => nt.file === task.file);
      for (let i = 0; i < findings.length; i++) {
        const f = findings[i];
        const triageStatus = noteTask?.findings?.[i]?.status || null;
        const reason = noteTask?.findings?.[i]?.reason || null;
        const isAuto = (f.severity === "met" || f.severity === "positive") ||
                       (LOW_SEVERITIES.includes(f.severity) && triageStatus === "wont-fix");
        if (triageStatus) {
          if (isAuto) autoResolvedCount++;
          else manualResolvedCount++;
        }
        list.push({
          file: task.file,
          fileName: task.name || task.file,
          severity: f.severity,
          description: f.description || "",
          line: f.line || null,
          code: f.code || null,
          suggestion: f.suggestion || null,
          status: triageStatus,
          reason: reason,
          findingIdx: i,
        });
      }
    }
    // Sort: pending first, then need-fix, then others; within same status, by severity
    const sevOrder = { critical: 0, high: 1, major: 2, medium: 3, minor: 4, info: 5, low: 6, positive: 7, met: 8 };
    const statusOrder = (s) => s === null ? 0 : s === "need-fix" ? 1 : 2;
    list.sort((a, b) => statusOrder(a.status) - statusOrder(b.status) || (sevOrder[a.severity] ?? 9) - (sevOrder[b.severity] ?? 9));
    return { items: list, autoResolvedCount, manualResolvedCount };
  }

  async function updateStatus(taskFile, findingIdx, status, reason) {
    const task = tasks.find(t => t.file === taskFile);
    if (!task) return;
    const findingsCount = (task.review?.findings || []).length;
    if (!notes) notes = { tasks: [] };
    let noteTask = notes.tasks.find(t => t.file === taskFile);
    if (!noteTask) {
      noteTask = { file: taskFile, findings: [] };
      notes.tasks.push(noteTask);
    }
    // Ensure findings array is long enough
    while (noteTask.findings.length < findingsCount) noteTask.findings.push(null);
    // Update only the target index — avoids overwriting concurrent changes to other indices
    noteTask.findings[findingIdx] = status ? { status, reason: reason || "" } : null;
    const noteFindings = [...noteTask.findings];
    try {
      await api.updateTaskNote(roundName, version, taskFile, { findings: noteFindings });
      const f = findings.items.find(fi => fi.file === taskFile && fi.findingIdx === findingIdx);
      if (f) f.status = status;
      showToast(status ? `${status === "need-fix" ? "Need Fix" : status === "wont-fix" ? "Won't Fix" : "Not an Issue"}` : "Reverted", "success");
      render();
    } catch (e) {
      // Revert local state on failure
      noteTask.findings[findingIdx] = null;
      showToast("Failed: " + e.message);
    }
  }

  function renderDashboardStrip(stats) {
    const sevColors = {
      critical: "var(--danger)",
      high: "var(--danger)",
      major: "var(--danger)",
      medium: "var(--warning)",
      minor: "var(--warning)",
      low: "var(--info)",
      info: "var(--info)",
      met: "var(--accent)",
      positive: "var(--accent)",
      "partially-met": "var(--warning)",
      "not-met": "var(--danger)",
    };
    const sevLabels = ["critical", "high", "major", "medium", "minor", "low", "info"];
    const sevPills = sevLabels.map(s => {
      const count = stats.bySeverity[s] || 0;
      const bg = sevColors[s] || "var(--text-muted)";
      return `<span class="findings-pill findings-pill-severity ${count === 0 ? "findings-pill-zero" : ""}" style="background:${bg}">${s.toUpperCase()} ${count}</span>`;
    }).join("");

    const statusDefs = [
      { key: "needFix", label: "NEED FIX", cls: "pill-need-fix" },
      { key: "wontFix", label: "WON'T FIX", cls: "pill-wont-fix" },
      { key: "notAnIssue", label: "NOT AN ISSUE", cls: "pill-not-an-issue" },
      { key: "wellDone", label: "WELL DONE", cls: "pill-well-done" },
      { key: "pendingCount", label: "PENDING", cls: "pill-pending" },
    ];
    const statusPills = statusDefs.map(d => {
      const count = stats[d.key] || 0;
      return `<span class="findings-pill findings-pill-status ${d.cls} ${count === 0 ? "findings-pill-zero" : ""}">${d.label} ${count}</span>`;
    }).join("");

    return `
      <div class="findings-dashboard mb-4">
        <div class="findings-dashboard-group">
          <span class="findings-dashboard-label">Severity</span>
          ${sevPills}
        </div>
        <div class="findings-dashboard-group">
          <span class="findings-dashboard-label">Status</span>
          ${statusPills}
        </div>
      </div>`;
  }

  function renderAllClearCard(findings, autoResolvedCount, manualResolvedCount) {
    const total = findings.items.length;
    const parts = [];
    if (autoResolvedCount > 0) parts.push(`${autoResolvedCount} auto-resolved`);
    if (manualResolvedCount > 0) parts.push(`${manualResolvedCount} manual`);
    const subtitle = parts.join(" · ") || `${total} resolved`;

    function renderAccordionItem(f) {
      const sevLabel = f.severity.toUpperCase();
      const sevColor = `var(--${f.severity === "critical" ? "danger" : f.severity === "high" || f.severity === "major" ? "danger" : "warning"})`;
      const statusLabel = f.status === "need-fix" ? "Need Fix" : f.status === "wont-fix" ? "Won't Fix" : f.status === "not-an-issue" ? "Not an Issue" : f.status === "well-done" ? "Well Done" : "";
      const statusPill = f.status ? `finding-status-pill finding-status-pill-${f.status}` : "";

      return `
        <div class="finding-accordion">
          <details>
            <summary>
              <span class="accordion-chevron">${icon("chevronRight", 14)}</span>
              <span class="finding-severity-badge" style="background:${sevColor}">${sevLabel}</span>
              <span class="finding-file-ref">${escapeHtml(f.fileName)}${f.line ? `:${f.line}` : ""}</span>
              <span class="accordion-desc-trunc">${escapeHtml(f.description)}</span>
              <span class="${statusPill}">${statusLabel}</span>
            </summary>
            <div class="finding-accordion-body">
              <div class="finding-description">${escapeHtml(f.description)}</div>
              ${f.suggestion ? `<div class="finding-suggestion"><span class="text-xs text-muted">Suggestion:</span> ${escapeHtml(f.suggestion)}</div>` : ""}
              ${f.code ? `
                <details class="finding-code-details">
                  <summary class="finding-code-toggle">Show code</summary>
                  <pre class="finding-code-block"><code>${escapeHtml(f.code)}</code></pre>
                </details>
              ` : ""}
              ${f.reason ? `<div class="finding-reason-text">${escapeHtml(f.reason)}</div>` : ""}
            </div>
          </details>
        </div>`;
    }

    return `
      <div class="findings-all-clear">
        ${icon("check", 32)}
        <h2>All Findings Resolved</h2>
        <p>${subtitle}</p>
        <a href="#/round/${encodeURIComponent(roundName)}" class="btn btn-primary btn-sm">${icon("arrowLeft", 14)} Back to Round</a>
      </div>
      ${total > 0 ? `
        <div style="margin-top:var(--space-3)">
          <div class="text-xs text-muted mb-2">${total} resolved findings — click to expand</div>
          ${findings.items.map(f => renderAccordionItem(f)).join("")}
        </div>
      ` : ""}`;
  }

  function render() {
    const { items, autoResolvedCount, manualResolvedCount } = findings;
    const stats = aggregateFindings(tasks, notes);
    const allDone = items.length > 0 && items.every(f => f.status);
    const pendingItems = items.filter(f => !f.status);
    const triagedItems = items.filter(f => f.status);

    container.innerHTML = `
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-3">
          <a href="#/round/${encodeURIComponent(roundName)}" class="btn btn-ghost" aria-label="Back to round">${icon("arrowLeft", 14)} Back to Round</a>
          <h1 class="text-2xl">Findings</h1>
        </div>
        <button id="kb-hint-btn" class="btn btn-ghost btn-sm" title="Keyboard shortcuts">?</button>
      </div>

      ${items.length === 0 ? `
        <div class="empty-state">
          <div class="empty-state-icon">${icon("check", 48)}</div>
          <h2>No findings</h2>
          <p>No findings were identified in this review.</p>
          <a href="#/round/${encodeURIComponent(roundName)}" class="btn btn-primary mt-4">${icon("arrowLeft", 14)} Back to Round</a>
        </div>
      ` : `
        ${renderDashboardStrip(stats)}

        <div class="findings-progress mb-4">
          <div class="findings-progress-bar">
            ${stats.needFix > 0 ? `<div class="review-progress-seg seg-need-fix" style="flex:${stats.needFix}"></div>` : ""}
            ${stats.wontFix > 0 ? `<div class="review-progress-seg seg-wont-fix" style="flex:${stats.wontFix}"></div>` : ""}
            ${stats.notAnIssue > 0 ? `<div class="review-progress-seg seg-not-an-issue" style="flex:${stats.notAnIssue}"></div>` : ""}
            ${stats.wellDone > 0 ? `<div class="review-progress-seg seg-well-done" style="flex:${stats.wellDone}"></div>` : ""}
            ${stats.pendingCount > 0 ? `<div class="review-progress-seg seg-pending" style="flex:${stats.pendingCount}"></div>` : ""}
          </div>
          <div class="findings-progress-text">
            <span>${stats.needFix} need-fix</span>
            <span>${stats.wontFix} won't fix</span>
            <span>${stats.reviewed} done</span>
            ${stats.pendingCount > 0 ? `<span>${stats.pendingCount} pending</span>` : ""}
          </div>
        </div>

        ${allDone ? renderAllClearCard(findings, autoResolvedCount, manualResolvedCount) : ""}

        <div id="findings-list">
          ${pendingItems.map((f, idx) => renderFindingCard(f, idx, false)).join("")}
          ${triagedItems.length > 0 && pendingItems.length > 0 ? `<div class="findings-section-label">Reviewed</div>` : ""}
          ${!allDone ? triagedItems.map((f, idx) => renderFindingCard(f, pendingItems.length + idx, true)).join("") : ""}
        </div>
      `}
    `;

    wireHandlers();
  }

  function renderFindingCard(f, idx, isTriaged) {
    const sevLabel = f.severity.toUpperCase();
    const sevColor = `var(--${f.severity === "critical" ? "danger" : f.severity === "high" || f.severity === "major" ? "danger" : "warning"})`;
    const statusLabel = f.status === "need-fix" ? "Need Fix" : f.status === "wont-fix" ? "Won't Fix" : f.status === "not-an-issue" ? "Not an Issue" : f.status === "well-done" ? "Well Done" : "";
    const statusPill = f.status ? `finding-status-pill finding-status-pill-${f.status}` : "";

    if (isTriaged) {
      return `
        <div class="finding-accordion" data-idx="${idx}" data-file="${escapeHtml(f.file)}" data-fidx="${f.findingIdx}">
          <details>
            <summary>
              <span class="accordion-chevron">${icon("chevronRight", 14)}</span>
              <span class="finding-severity-badge" style="background:${sevColor}">${sevLabel}</span>
              <span class="finding-file-ref">${escapeHtml(f.fileName)}${f.line ? `:${f.line}` : ""}</span>
              <span class="accordion-desc-trunc">${escapeHtml(f.description)}</span>
              <span class="${statusPill}">${statusLabel}</span>
            </summary>
            <div class="finding-accordion-body">
              <div class="finding-description">${escapeHtml(f.description)}</div>
              ${f.suggestion ? `<div class="finding-suggestion"><span class="text-xs text-muted">Suggestion:</span> ${escapeHtml(f.suggestion)}</div>` : ""}
              ${f.code ? `
                <details class="finding-code-details">
                  <summary class="finding-code-toggle">Show code</summary>
                  <pre class="finding-code-block"><code>${escapeHtml(f.code)}</code></pre>
                </details>
              ` : ""}
              ${f.reason ? `<div class="finding-reason-text">${escapeHtml(f.reason)}</div>` : ""}
              <div class="finding-actions">
                <button class="btn btn-sm btn-revert" data-action="revert" data-idx="${idx}">Undo</button>
              </div>
            </div>
          </details>
        </div>`;
    }

    return `
      <div class="finding-card" data-idx="${idx}" data-file="${escapeHtml(f.file)}" data-fidx="${f.findingIdx}" tabindex="0" role="article" aria-label="${sevLabel} finding in ${escapeHtml(f.fileName)}">
        <div class="finding-card-header">
          <span class="finding-severity-badge" style="background:${sevColor}">${sevLabel}</span>
          <span class="finding-file-ref">${escapeHtml(f.fileName)}${f.line ? `:${f.line}` : ""}</span>
        </div>
        <div class="finding-description">${escapeHtml(f.description)}</div>
        ${f.suggestion ? `<div class="finding-suggestion"><span class="text-xs text-muted">Suggestion:</span> ${escapeHtml(f.suggestion)}</div>` : ""}
        ${f.code ? `
          <details class="finding-code-details">
            <summary class="finding-code-toggle">Show code</summary>
            <pre class="finding-code-block"><code>${escapeHtml(f.code)}</code></pre>
          </details>
        ` : ""}
        <div class="finding-actions">
          <button class="btn btn-sm btn-need-fix" data-action="need-fix" data-idx="${idx}">${icon("zap", 12)} Need Fix</button>
          <button class="btn btn-sm btn-wont-fix-trigger" data-action="wont-fix" data-idx="${idx}">Won't Fix</button>
          <button class="btn btn-sm btn-not-issue-trigger" data-action="not-an-issue" data-idx="${idx}">Not an Issue</button>
        </div>
        <div class="finding-reason-panel hidden" data-reason-panel="${idx}"></div>
      </div>`;
  }

  function showReasonPanel(idx, type) {
    const panel = container.querySelector(`[data-reason-panel="${idx}"]`);
    if (!panel) return;
    const reasons = type === "wont-fix" ? WONT_FIX_REASONS : NOT_ISSUE_REASONS;
    const action = type === "wont-fix" ? "Won't Fix" : "Not an Issue";
    panel.classList.remove("hidden");
    panel.innerHTML = `
      <div class="finding-reason-content">
        <div class="finding-reason-presets">
          ${reasons.map(r => `<button class="btn btn-sm btn-ghost reason-pick" data-reason="${escapeHtml(r)}">${escapeHtml(r)}</button>`).join("")}
        </div>
        <div class="finding-reason-custom">
          <input type="text" class="reason-custom-input" placeholder="Custom reason..." />
          <button class="btn btn-sm btn-primary reason-custom-submit">Submit</button>
        </div>
      </div>`;

    panel.querySelectorAll(".reason-pick").forEach(btn => {
      btn.addEventListener("click", async () => {
        const f = findings.items[idx];
        await updateStatus(f.file, f.findingIdx, type, btn.dataset.reason);
      });
    });
    const submitBtn = panel.querySelector(".reason-custom-submit");
    const input = panel.querySelector(".reason-custom-input");
    submitBtn.addEventListener("click", async () => {
      const reason = input?.value?.trim();
      if (!reason) { showToast("Enter a reason"); return; }
      const f = findings.items[idx];
      await updateStatus(f.file, f.findingIdx, type, reason);
    });
    input?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); submitBtn.click(); }
    });
    input?.focus();
  }

  function wireHandlers() {
    container.querySelectorAll(".btn-need-fix").forEach(btn => {
      btn.addEventListener("click", async () => {
        const idx = parseInt(btn.dataset.idx);
        const f = findings.items[idx];
        await updateStatus(f.file, f.findingIdx, "need-fix", "");
      });
    });
    container.querySelectorAll(".btn-wont-fix-trigger").forEach(btn => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.dataset.idx);
        container.querySelectorAll(".finding-reason-panel").forEach(p => p.classList.add("hidden"));
        showReasonPanel(idx, "wont-fix");
      });
    });
    container.querySelectorAll(".btn-not-issue-trigger").forEach(btn => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.dataset.idx);
        container.querySelectorAll(".finding-reason-panel").forEach(p => p.classList.add("hidden"));
        showReasonPanel(idx, "not-an-issue");
      });
    });
    container.querySelectorAll(".btn-revert").forEach(btn => {
      btn.addEventListener("click", async () => {
        const idx = parseInt(btn.dataset.idx);
        const f = findings.items[idx];
        await updateStatus(f.file, f.findingIdx, null, "");
      });
    });
    document.getElementById("kb-hint-btn")?.addEventListener("click", toggleKbOverlay);
  }

  function toggleKbOverlay() {
    const existing = document.getElementById("kb-overlay");
    if (existing) { existing.remove(); return; }
    const overlay = document.createElement("div");
    overlay.id = "kb-overlay";
    overlay.className = "kb-overlay";
    overlay.innerHTML = `
      <div class="kb-overlay-card">
        <div class="kb-overlay-title">Keyboard Shortcuts</div>
        <div class="kb-row"><span>j / ↓</span><span class="kb-key">Next finding</span></div>
        <div class="kb-row"><span>k / ↑</span><span class="kb-key">Previous finding</span></div>
        <div class="kb-row"><span>1</span><span class="kb-key">Need Fix</span></div>
        <div class="kb-row"><span>2</span><span class="kb-key">Won't Fix</span></div>
        <div class="kb-row"><span>3</span><span class="kb-key">Not an Issue</span></div>
        <div class="kb-row"><span>Enter</span><span class="kb-key">Confirm reason</span></div>
        <div class="kb-row"><span>Esc</span><span class="kb-key">Close</span></div>
      </div>`;
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }

  function shortcutHandler(e) {
    if (e.target.matches("input, textarea, [contenteditable]")) return;
    if (e.key === "?") { e.preventDefault(); toggleKbOverlay(); return; }
    if (e.key === "Escape") {
      const overlay = document.getElementById("kb-overlay");
      if (overlay) overlay.remove();
      container.querySelectorAll(".finding-reason-panel").forEach(p => p.classList.add("hidden"));
      return;
    }
    const cards = [...container.querySelectorAll(".finding-card, .finding-accordion")];
    if (cards.length === 0) return;
    if (e.key === "j" || e.key === "ArrowDown") {
      e.preventDefault();
      currentIdx = Math.min(currentIdx + 1, cards.length - 1);
      cards[currentIdx]?.focus();
      cards[currentIdx]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    } else if (e.key === "k" || e.key === "ArrowUp") {
      e.preventDefault();
      currentIdx = Math.max(currentIdx - 1, 0);
      cards[currentIdx]?.focus();
      cards[currentIdx]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    } else if (e.key === "1") {
      const btn = cards[currentIdx]?.querySelector(".btn-need-fix");
      btn?.click();
    } else if (e.key === "2") {
      const btn = cards[currentIdx]?.querySelector(".btn-wont-fix-trigger");
      btn?.click();
    } else if (e.key === "3") {
      const btn = cards[currentIdx]?.querySelector(".btn-not-issue-trigger");
      btn?.click();
    } else if (e.key === "Enter") {
      const submitBtn = cards[currentIdx]?.querySelector(".reason-custom-submit:not(:disabled)");
      submitBtn?.click();
    }
  }

  document.addEventListener("keydown", shortcutHandler);
  onNavigateCleanup(() => {
    document.removeEventListener("keydown", shortcutHandler);
    document.getElementById("kb-overlay")?.remove();
  });

  render();
}
