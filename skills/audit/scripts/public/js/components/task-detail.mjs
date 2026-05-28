// skills/audit/scripts/public/js/components/task-detail.mjs
import { icon, escapeHtml } from "../app.mjs";
import { scoreColor, ENTRY_TYPES } from "../constants.mjs";

function getSeverityIcon(severity) {
  const icons = {
    critical: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    major: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    high: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    minor: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    medium: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    info: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>',
    low: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>',
  };
  return icons[severity] || '';
}

export function renderTaskDetail(task, notes) {
  if (!task) return `<div class="text-muted text-sm flex items-center gap-2">${icon("chevronRight", 16)} Select a task to view details.</div>`;

  const score = task.review?.score;
  const findings = task.review?.findings || [];
  const positives = task.review?.positives || [];
  const gaps = task.review?.gaps || [];
  const circumference = 2 * Math.PI * 42;
  const clampedScore = score != null ? score : 0;
  const offset = circumference * (1 - clampedScore / 10);

  const noteTask = notes?.tasks?.find(t => t.file === task.file);

  return `
    <div class="space-y-4">
      <!-- Task header -->
      <div class="flex items-center gap-3 mb-2">
        <div class="score-ring" style="flex-shrink:0">
          <svg width="64" height="64" viewBox="0 0 96 96">
            <circle class="score-ring-bg" cx="48" cy="48" r="42" fill="none" stroke-width="5"/>
            <circle class="score-ring-fill" cx="48" cy="48" r="42" fill="none"
              stroke="${scoreColor(score)}"
              stroke-width="5"
              stroke-dasharray="${circumference}"
              stroke-dashoffset="${offset}"
              stroke-linecap="round"/>
          </svg>
          <div class="score-ring-text" style="font-size:18px;color:${scoreColor(score)}">${score ?? "-"}</div>
        </div>
        <div style="min-width:0;flex:1">
          <div class="font-mono text-sm truncate" title="${escapeHtml(task.name || task.file)}">${escapeHtml(task.name || task.file)}</div>
          <div class="text-xs text-muted mt-1">${score ?? "-"}/10 &middot; ${findings.length} findings</div>
        </div>
      </div>

      ${task.overview ? `
        <div class="task-overview">
          ${task.type && ENTRY_TYPES[task.type] ? `
            <div class="flex items-center gap-2 mb-3">
              <span class="badge entry-type-badge" style="background:${ENTRY_TYPES[task.type].color}20;color:${ENTRY_TYPES[task.type].color};border:1px solid ${ENTRY_TYPES[task.type].color}40">${ENTRY_TYPES[task.type].label}</span>
              ${task.entry ? `<span class="text-xs font-mono text-muted">${escapeHtml(task.entry)}</span>` : ""}
            </div>
          ` : ""}
          ${task.overview.diagram ? `
            <div class="overview-diagram" data-mermaid-source="${encodeURIComponent(task.overview.diagram)}">
              <div class="mermaid-placeholder text-sm text-muted">Loading diagram...</div>
            </div>
          ` : ""}
          ${task.overview.description ? `
            <div class="overview-description text-sm text-secondary mt-2">${escapeHtml(task.overview.description)}</div>
          ` : ""}
        </div>
      ` : ""}

      ${task.review?.summary ? `
        <div>
          <div class="text-xs text-muted font-semibold mb-1">SUMMARY</div>
          <div class="text-sm">${escapeHtml(task.review.summary)}</div>
        </div>
      ` : ""}

      ${findings.length > 0 ? `
        <div>
          <div class="text-xs text-muted font-semibold mb-3">FINDINGS (${findings.length})</div>
          <div class="space-y-3">
            ${findings.map((f, i) => {
              const status = noteTask?.findings?.[i]?.status || (f.severity === "met" ? "well-done" : null);
              const isNeedFix = status === "need-fix";
              const isWontFix = status === "wont-fix";
              const isNotAnIssue = status === "not-an-issue";
              const isWellDone = status === "well-done";
              const isReviewed = isNeedFix || isWontFix || isNotAnIssue || isWellDone;
              const isUnreviewed = !status;
              const reason = noteTask?.findings?.[i]?.reason || "";

              const statusBadge = isNeedFix ? `<span class="badge badge-need-fix">${icon("alertCircle", 10)} Need Fix</span>`
                : isWontFix ? `<span class="badge badge-wont-fix"${reason ? ` title="${escapeHtml(reason)}"` : ""}>${icon("minus", 10)} Won't Fix${reason ? ": " + escapeHtml(reason.length > 25 ? reason.slice(0, 25) + "..." : reason) : ""}</span>`
                : isNotAnIssue ? `<span class="badge badge-not-an-issue"${reason ? ` title="${escapeHtml(reason)}"` : ""}>${icon("x", 10)} Not an Issue${reason ? ": " + escapeHtml(reason.length > 25 ? reason.slice(0, 25) + "..." : reason) : ""}</span>`
                : isWellDone ? `<span class="badge" style="background:var(--accent);color:var(--btn-primary-text)">${icon("check", 10)} Well Done</span>`
                : `<span class="badge" style="background:transparent;color:var(--text-muted);border:1px dashed var(--border)">Pending</span>`;

              return `
              <div class="finding-card severity-${f.severity}${isReviewed ? " reviewed" : ""}" data-finding="${i}">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <span class="badge severity-${f.severity}">${getSeverityIcon(f.severity)} ${f.severity}</span>
                    ${statusBadge}
                  </div>
                  ${isReviewed ? `<button class="btn-revert" data-revert="${i}" title="Revert to pending">${icon("undo2", 12)} Revert</button>` : ""}
                </div>
                <div class="text-sm" style="margin-top:var(--space-2)">${escapeHtml(f.description || "")}</div>
                <div class="dismiss-panel hidden" data-dismiss-panel="${i}">
                  <div class="dismiss-reasons">
                    ${["Intentional design", "Acceptable risk", "Low priority", "Already addressed"].map(r =>
                      `<button class="dismiss-reason-btn" data-reason="${r}">${escapeHtml(r)}</button>`
                    ).join("")}
                  </div>
                  <div class="flex gap-2 mt-2">
                    <input class="dismiss-custom-input" placeholder="Other reason..." data-dismiss-custom="${i}">
                    <button class="btn btn-sm btn-primary dismiss-submit-btn" data-dismiss-submit="${i}">Submit</button>
                  </div>
                </div>
                <div class="dismiss-panel hidden" data-not-issue-panel="${i}">
                  <div class="dismiss-reasons">
                    ${["AI misunderstood context", "Not applicable", "Already handled elsewhere", "Feature, not a bug"].map(r =>
                      `<button class="not-issue-reason-btn" data-reason="${r}">${escapeHtml(r)}</button>`
                    ).join("")}
                  </div>
                  <div class="flex gap-2 mt-2">
                    <input class="dismiss-custom-input" placeholder="Other reason..." data-not-issue-custom="${i}">
                    <button class="btn btn-sm btn-primary not-issue-submit-btn" data-not-issue-submit="${i}">Submit</button>
                  </div>
                </div>
                ${isUnreviewed ? `
                  <div class="finding-action-bar">
                    <button class="btn-need-fix" data-need-fix="${i}" title="Mark as needing a fix">${icon("alertCircle", 14)} Need Fix</button>
                    <button class="btn-wont-fix" data-wont-fix="${i}" title="Accept, won't fix">${icon("minus", 14)} Won't Fix</button>
                    <button class="btn-not-an-issue" data-not-issue="${i}" title="Not a real issue">${icon("x", 14)} Not an Issue</button>
                  </div>
                ` : ""}
                ${(f.code || f.suggestion) ? `
                  <button class="finding-collapse-toggle mt-2" data-collapse-toggle="${i}">
                    <span class="toggle-icon">${icon("chevronRight", 12)}</span>
                    ${f.code && f.suggestion ? "Show details" : f.code ? "Show code" : "Show suggestion"}
                  </button>
                  <div class="finding-collapsible" data-collapsible="${i}">
                    ${f.code ? `
                      <pre class="mt-2 p-3" style="border-color:var(--border)"><code class="text-xs">${escapeHtml(f.code)}</code></pre>
                    ` : ""}
                    ${f.suggestion ? `
                      <div class="text-sm mt-2 flex items-start gap-2" style="color:var(--info)">
                        ${icon("zap", 14)}
                        <span>${escapeHtml(f.suggestion)}</span>
                      </div>
                    ` : ""}
                  </div>
                ` : ""}
                ${f.file ? `
                  <div class="text-xs text-muted mt-2 flex items-center gap-1" style="min-width:0">
                    ${icon("file", 12)}
                    <span class="font-mono truncate" title="${escapeHtml(f.file)}${f.line ? ":" + f.line : ""}">${escapeHtml(f.file)}${f.line ? ":" + f.line : ""}</span>
                  </div>
                ` : ""}
              </div>`;
            }).join("")}
          </div>
        </div>
      ` : `
        <div class="card" style="text-align:center;padding:var(--space-6);color:var(--accent)">
          ${icon("check", 20)}
          <div class="text-sm mt-2">Clean code — no issues found</div>
        </div>
      `}

      ${positives.length > 0 ? `
        <div>
          <div class="text-xs font-semibold mb-2 flex items-center gap-2" style="color:var(--accent)">
            ${icon("check", 14)}
            POSITIVES
          </div>
          ${positives.map(p => `<div class="text-sm mb-1" style="color:var(--accent)">${escapeHtml(p)}</div>`).join("")}
        </div>
      ` : ""}

      ${gaps.length > 0 ? `
        <div>
          <div class="text-xs font-semibold mb-2 flex items-center gap-2" style="color:var(--danger)">
            ${icon("alertTriangle", 14)}
            GAPS
          </div>
          ${gaps.map(g => `<div class="text-sm mb-1" style="color:var(--danger)">${escapeHtml(g)}</div>`).join("")}
        </div>
      ` : ""}
    </div>`;
}

export async function renderMermaidDiagrams(container) {
  const els = container.querySelectorAll("[data-mermaid-source]");
  if (els.length === 0) return;
  if (typeof mermaid === "undefined") {
    console.error("[mermaid] mermaid global not found — CDN may have failed to load");
    return;
  }
  const theme = document.documentElement.dataset.theme === "light" ? "default" : "dark";
  mermaid.initialize({ startOnLoad: false, theme, securityLevel: "loose" });
  for (const el of els) {
    if (el.dataset.rendered) continue;
    el.dataset.rendered = "true";
    try {
      const src = decodeURIComponent(el.dataset.mermaidSource);
      const id = "mermaid-" + Math.random().toString(36).slice(2, 8);
      const result = await mermaid.render(id, src);
      el.innerHTML = result.svg;
      if (result.bindFunctions) result.bindFunctions(el);
    } catch (e) {
      console.error("[mermaid] render failed:", e);
      el.innerHTML = `<div style="padding:var(--space-3);background:var(--warning-dim);border:1px solid var(--warning);border-radius:var(--radius-md);color:var(--warning);font-size:var(--text-xs)">Diagram rendering failed. Showing source:</div><pre class="text-xs text-muted" style="margin-top:var(--space-2)">${escapeHtml(decodeURIComponent(el.dataset.mermaidSource))}</pre>`;
    }
  }
}
