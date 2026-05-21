// skills/audit/scripts/public/js/components/print-task-detail.mjs
import { escapeHtml } from "../app.mjs";

const SEVERITY_ORDER = ["critical", "major", "high", "medium", "minor", "low", "info"];

export function renderPrintTaskDetail(task, notes) {
  const score = task.review?.score;
  const rawFindings = task.review?.findings || [];
  const findings = rawFindings
    .map((f, origIdx) => ({ ...f, _origIdx: origIdx }))
    .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));
  const positives = task.review?.positives || [];
  const gaps = task.review?.gaps || [];
  const noteTask = notes?.tasks?.find(t => t.file === task.file);

  const scoreColor = score >= 7 ? "var(--accent)" : score >= 4 ? "var(--warning)" : "var(--danger)";

  return `
    <div class="print-task-card">
      <div class="print-task-header">
        <div class="flex items-center gap-3">
          <span class="text-lg font-semibold">${escapeHtml(task.name || task.file)}</span>
          <span class="badge" style="background:var(--bg-surface);color:var(--text-secondary)">${escapeHtml(task.status)}</span>
        </div>
        <span class="text-lg font-semibold" style="color:${scoreColor}">${score ?? "-"}/10</span>
      </div>

      ${task.review?.summary ? `
        <div class="text-sm mb-4">${escapeHtml(task.review.summary)}</div>
      ` : ""}

      ${findings.length > 0 ? `
        <div class="text-xs text-muted font-semibold mb-2">FINDINGS (${findings.length})</div>
        <div class="space-y-2 mb-4">
          ${findings.map(f => {
            const origIdx = f._origIdx;
            const status = noteTask?.findings?.[origIdx]?.status || null;
            const isConfirmed = status === "confirmed";
            const isDismissed = status === "deferred";
            const reason = noteTask?.findings?.[origIdx]?.reason || "";

            return `
            <div class="print-finding-card severity-border-${f.severity}">
              <div class="flex items-center gap-2 mb-1">
                <span class="badge severity-${f.severity}">${f.severity}</span>
                ${isConfirmed ? `<span class="badge print-badge-confirmed">Confirmed</span>` : ""}
                ${isDismissed ? `<span class="badge print-badge-dismissed">Dismissed${reason ? ": " + escapeHtml(reason) : ""}</span>` : ""}
                ${!isConfirmed && !isDismissed ? `<span class="badge print-badge-unreviewed">Unreviewed</span>` : ""}
              </div>
              <div class="text-sm">${escapeHtml(f.description || "")}</div>
              ${f.code ? `<pre class="mt-1 p-2 text-xs" style="border:1px solid var(--border);border-radius:var(--radius-md);overflow-x:auto"><code>${escapeHtml(f.code)}</code></pre>` : ""}
              ${f.suggestion ? `<div class="text-sm mt-1" style="color:var(--info)">Suggestion: ${escapeHtml(f.suggestion)}</div>` : ""}
              ${f.file ? `<div class="text-xs text-muted mt-1">${escapeHtml(f.file)}${f.line ? ":" + f.line : ""}</div>` : ""}
            </div>`;
          }).join("")}
        </div>
      ` : ""}

      ${positives.length > 0 ? `
        <div class="mb-3">
          <div class="text-xs font-semibold mb-1" style="color:var(--accent)">POSITIVES</div>
          ${positives.map(p => `<div class="text-sm" style="color:var(--accent)">• ${escapeHtml(p)}</div>`).join("")}
        </div>
      ` : ""}

      ${gaps.length > 0 ? `
        <div>
          <div class="text-xs font-semibold mb-1" style="color:var(--danger)">GAPS</div>
          ${gaps.map(g => `<div class="text-sm" style="color:var(--danger)">• ${escapeHtml(g)}</div>`).join("")}
        </div>
      ` : ""}
    </div>`;
}
