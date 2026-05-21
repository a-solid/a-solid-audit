# PDF Export Optimization — Task Details Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-task detail sections (findings with confirm/dismiss status, positives, gaps) to the PDF export on the Summary page.

**Architecture:** Create a new `print-task-detail.mjs` component that renders print-friendly HTML for each task. Integrate it into the Summary view between Overall Notes and Sign-off. Extend print CSS for pagination and print-safe colors.

**Tech Stack:** Vanilla JS (ES modules), CSS `@media print`, `window.print()` — no new dependencies.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `skills/audit/scripts/public/js/components/print-task-detail.mjs` | Create | Render print-friendly task detail HTML |
| `skills/audit/scripts/public/js/views/summary.mjs` | Modify | Add task details section to summary content |
| `skills/audit/scripts/public/styles.css` | Modify | Add print-task-detail styles + extend print CSS |

---

### Task 1: Create print-task-detail.mjs component

**Files:**
- Create: `skills/audit/scripts/public/js/components/print-task-detail.mjs`

- [ ] **Step 1: Create the component file**

```js
// skills/audit/scripts/public/js/components/print-task-detail.mjs
import { icon, escapeHtml } from "../app.mjs";

const SEVERITY_ORDER = ["critical", "major", "high", "medium", "minor", "low", "info"];

export function renderPrintTaskDetail(task, notes) {
  const score = task.review?.score;
  const findings = (task.review?.findings || []).slice().sort((a, b) => {
    return SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
  });
  const positives = task.review?.positives || [];
  const gaps = task.review?.gaps || [];
  const noteTask = notes?.tasks?.find(t => t.file === task.file);

  const scoreColor = score >= 7 ? "var(--accent)" : score >= 4 ? "var(--warning)" : "var(--danger)";

  return `
    <div class="print-task-card">
      <div class="print-task-header">
        <div class="flex items-center gap-3">
          <span class="text-lg font-semibold">${escapeHtml(task.name || task.file)}</span>
          <span class="badge" style="background:var(--bg-surface);color:var(--text-secondary)">${task.status}</span>
        </div>
        <span class="text-lg font-semibold" style="color:${scoreColor}">${score ?? "-"}/10</span>
      </div>

      ${task.review?.summary ? `
        <div class="text-sm mb-4">${escapeHtml(task.review.summary)}</div>
      ` : ""}

      ${findings.length > 0 ? `
        <div class="text-xs text-muted font-semibold mb-2">FINDINGS (${findings.length})</div>
        <div class="space-y-2 mb-4">
          ${findings.map((f, i) => {
            const origIdx = (task.review?.findings || []).indexOf(f);
            const status = noteTask?.findings?.[origIdx]?.status || null;
            const isConfirmed = status === "confirmed";
            const isDismissed = status === "deferred";
            const reason = noteTask?.findings?.[origIdx]?.reason || "";

            return `
            <div class="print-finding-card">
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
```

- [ ] **Step 2: Commit**

```bash
git add skills/audit/scripts/public/js/components/print-task-detail.mjs
git commit -m "feat: add print-task-detail component for PDF export"
```

---

### Task 2: Integrate task details into Summary view

**Files:**
- Modify: `skills/audit/scripts/public/js/views/summary.mjs`

- [ ] **Step 1: Add import and render task details section**

Add import at top of `summary.mjs` (after line 3):

```js
import { renderPrintTaskDetail } from "../components/print-task-detail.mjs";
```

In the `content.innerHTML` template literal, insert a task details section between the Overall Notes card (ends at line 127) and the Sign-off card (starts at line 129). Add the following block between those two cards:

```js
    <div class="card mb-6">
      <div class="font-medium mb-4">Task Details</div>
      <div class="space-y-4">
        ${tasks.map(t => renderPrintTaskDetail(t, notes)).join("")}
      </div>
    </div>
```

The full insertion point is after line 127 (`</div>` closing the Overall Notes card) and before line 129 (`<div class="card mb-6">` opening the Sign-off card).

- [ ] **Step 2: Verify in browser**

1. Start the server
2. Open a session that has reviewed tasks with findings
3. Go to Summary page
4. Verify task details section appears between Overall Notes and Sign-off
5. Verify findings show severity, status (Confirmed/Dismissed/Unreviewed), reason, description, code, suggestion, file ref
6. Click Export PDF — verify all task details appear in the print preview

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/public/js/views/summary.mjs
git commit -m "feat: add task details section to summary for PDF export"
```

---

### Task 3: Add print CSS and component styles

**Files:**
- Modify: `skills/audit/scripts/public/styles.css`

- [ ] **Step 1: Add print-task-detail component styles**

Add these styles before the `/* ─── Print ─── */` comment (before line 870):

```css
/* ─── Print Task Detail ─── */
.print-task-card {
  padding: var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  page-break-inside: avoid;
}
.print-task-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-3);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--border);
}
.print-finding-card {
  padding: var(--space-3);
  border-left: 3px solid var(--border);
  background: var(--bg-surface);
  border-radius: var(--radius-md);
}
.print-finding-card + .print-finding-card { margin-top: var(--space-2); }
.print-badge-confirmed {
  background: var(--success-dim); color: var(--accent);
}
.print-badge-dismissed {
  background: var(--warning-dim); color: var(--warning);
}
.print-badge-unreviewed {
  background: var(--bg-surface); color: var(--text-muted);
}
```

- [ ] **Step 2: Extend print media query**

Replace the existing `@media print` block (lines 871-880) with:

```css
@media print {
  .no-print { display: none !important; }
  body { background: white; color: black; }
  .card, .stat-card, .sidebar-panel, .detail-panel, .finding-card {
    background: white; border-color: #e5e7eb; color: black;
  }
  .text-primary, .text-secondary { color: black; }
  pre { border-color: #e5e7eb; }

  .print-task-card {
    background: white; border-color: #d1d5db; color: black;
    page-break-inside: avoid;
  }
  .print-task-header { border-bottom-color: #d1d5db; }
  .print-finding-card {
    background: #f9fafb; border-left-color: #9ca3af;
  }
  .badge { border: 1px solid #d1d5db; }
  .badge.severity-critical, .badge.severity-major, .badge.severity-high {
    color: #991b1b; border-color: #fca5a5; background: #fef2f2;
  }
  .badge.severity-medium, .badge.severity-minor {
    color: #92400e; border-color: #fcd34d; background: #fffbeb;
  }
  .badge.severity-low, .badge.severity-info {
    color: #1e40af; border-color: #93c5fd; background: #eff6ff;
  }
  .print-badge-confirmed { color: #166534; border-color: #86efac; background: #f0fdf4; }
  .print-badge-dismissed { color: #92400e; border-color: #fcd34d; background: #fffbeb; }
  .print-badge-unreviewed { color: #6b7280; border-color: #d1d5db; background: #f9fafb; }
}
```

- [ ] **Step 3: Verify PDF export**

1. Open Summary page in browser
2. Click Export PDF
3. Verify: task cards have white backgrounds, severity badges have colored text/borders in print, confirmed/dismissed badges are distinguishable, page breaks don't cut task cards in half

- [ ] **Step 4: Commit**

```bash
git add skills/audit/scripts/public/styles.css
git commit -m "feat: add print-task-detail styles and print CSS for PDF export"
```
