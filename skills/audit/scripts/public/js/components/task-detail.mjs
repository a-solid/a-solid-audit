// skills/audit/scripts/public/js/components/task-detail.mjs
import { icon, escapeHtml } from "../app.mjs";

export function renderTaskDetail(task) {
  if (!task) return `<div class="text-muted text-sm flex items-center gap-2">${icon("chevronRight", 16)} Select a task to view details.</div>`;

  const score = task.review?.score;
  const findings = task.review?.findings || [];
  const positives = task.review?.positives || [];
  const gaps = task.review?.gaps || [];

  const scoreColor = score >= 7 ? "var(--accent)" : score >= 4 ? "var(--warning)" : "var(--danger)";
  const circumference = 2 * Math.PI * 42;
  const offset = circumference * (1 - (score || 0) / 10);

  return `
    <div class="space-y-4">
      <!-- Score ring -->
      <div class="flex items-center gap-4 mb-4">
        <div class="score-ring">
          <svg width="96" height="96" viewBox="0 0 96 96">
            <circle class="score-ring-bg" cx="48" cy="48" r="42" fill="none" stroke-width="5"/>
            <circle class="score-ring-fill" cx="48" cy="48" r="42" fill="none"
              stroke="${scoreColor}"
              stroke-width="5"
              stroke-dasharray="${circumference}"
              stroke-dashoffset="${offset}"
              stroke-linecap="round"/>
          </svg>
          <div class="score-ring-text" style="color:${scoreColor}">${score ?? "-"}</div>
        </div>
        <div>
          <div class="text-xs text-muted">Score</div>
          <div class="text-lg font-semibold" style="color:${scoreColor}">${score ?? "-"}/10</div>
        </div>
      </div>

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
            ${findings.map((f, i) => `
              <div class="finding-card severity-${f.severity}" data-finding="${i}">
                <div class="flex items-center justify-between mb-2">
                  <span class="badge severity-${f.severity}">${f.severity}</span>
                  <div class="flex gap-2">
                    <button class="btn btn-sm btn-ghost btn-confirm" data-idx="${i}" style="color:var(--accent)">
                      ${icon("check", 12)} Confirm
                    </button>
                    <button class="btn btn-sm btn-ghost btn-dismiss" data-idx="${i}" style="color:var(--text-muted)">
                      ${icon("x", 12)} Dismiss
                    </button>
                  </div>
                </div>
                <div class="text-sm">${escapeHtml(f.description || "")}</div>
                <div class="dismiss-panel hidden" data-dismiss-panel="${i}">
                  <div class="dismiss-reasons">
                    ${["False positive", "Acceptable risk", "Out of scope", "Already addressed", "Intentional design"].map(r =>
                      `<button class="dismiss-reason-btn" data-reason="${r}">${escapeHtml(r)}</button>`
                    ).join("")}
                  </div>
                  <div class="flex gap-2 mt-2">
                    <input class="dismiss-custom-input" placeholder="Other reason..." data-dismiss-custom="${i}">
                    <button class="btn btn-sm btn-primary dismiss-submit-btn" data-dismiss-submit="${i}">Submit</button>
                  </div>
                </div>
                ${f.code ? `
                  <pre class="mt-2 p-3" style="border-color:var(--border)"><code class="text-xs">${escapeHtml(f.code)}</code></pre>
                ` : ""}
                ${f.suggestion ? `
                  <div class="text-sm mt-2 flex items-start gap-2" style="color:var(--info)">
                    ${icon("zap", 14)}
                    <span>${escapeHtml(f.suggestion)}</span>
                  </div>
                ` : ""}
                ${f.file ? `
                  <div class="text-xs text-muted mt-2 flex items-center gap-1">
                    ${icon("file", 12)}
                    <span class="font-mono">${escapeHtml(f.file)}${f.line ? ":" + f.line : ""}</span>
                  </div>
                ` : ""}
              </div>
            `).join("")}
          </div>
        </div>
      ` : ""}

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
