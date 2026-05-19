// skills/audit/scripts/public/js/components/task-detail.mjs

export function renderTaskDetail(task) {
  if (!task) return `<div class="text-gray-400 text-sm">Select a task to view details.</div>`;

  const findings = task.review?.findings || [];
  const positives = task.review?.positives || [];
  const gaps = task.review?.gaps || [];

  return `
    <div class="space-y-4">
      <div>
        <div class="text-sm text-gray-500">Score</div>
        <div class="text-2xl font-bold ${task.review?.score >= 7 ? 'text-green-600' : task.review?.score >= 4 ? 'text-yellow-600' : 'text-red-600'}">${task.review?.score ?? "-"}/10</div>
      </div>
      ${task.review?.summary ? `<div><div class="text-sm text-gray-500 mb-1">Summary</div><div class="text-sm">${escapeHtml(task.review.summary)}</div></div>` : ""}
      ${findings.length > 0 ? `
        <div>
          <div class="text-sm font-medium text-gray-700 mb-2">Findings (${findings.length})</div>
          ${findings.map((f, i) => `
            <div class="border rounded p-3 mb-2">
              <div class="flex items-center justify-between mb-1">
                <span class="badge severity-${f.severity}">${f.severity}</span>
                <div class="flex gap-2">
                  <button class="text-xs text-green-600 btn-confirm" data-idx="${i}">Confirm</button>
                  <button class="text-xs text-red-600 btn-dismiss" data-idx="${i}">Dismiss</button>
                </div>
              </div>
              <div class="text-sm">${escapeHtml(f.description || "")}</div>
              ${f.code ? `<pre class="bg-gray-100 rounded p-2 mt-2 text-xs overflow-x-auto"><code>${escapeHtml(f.code)}</code></pre>` : ""}
              ${f.suggestion ? `<div class="text-sm text-blue-600 mt-1">Suggestion: ${escapeHtml(f.suggestion)}</div>` : ""}
              ${f.file ? `<div class="text-xs text-gray-400 mt-1">${escapeHtml(f.file)}${f.line ? ':' + f.line : ''}</div>` : ""}
            </div>
          `).join("")}
        </div>
      ` : ""}
      ${positives.length > 0 ? `
        <div><div class="text-sm font-medium text-green-700 mb-2">Positives</div>
          ${positives.map(p => `<div class="text-sm text-green-600 mb-1">${escapeHtml(p)}</div>`).join("")}</div>` : ""}
      ${gaps.length > 0 ? `
        <div><div class="text-sm font-medium text-red-700 mb-2">Gaps</div>
          ${gaps.map(g => `<div class="text-sm text-red-600 mb-1">${escapeHtml(g)}</div>`).join("")}</div>` : ""}
    </div>`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = String(str);
  return div.innerHTML;
}
