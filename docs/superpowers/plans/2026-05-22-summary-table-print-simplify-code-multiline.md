# Summary Table + Print Simplification + Code Multiline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the verbose Task Details on the Summary page with a compact table, simplify print.html to focus on findings, and update prompt templates to encourage multi-line code snippets.

**Architecture:** Three independent changes. The summary table replaces `renderPrintTaskDetail()` calls with inline table HTML using existing severity colors and a new Human Review status badge. print.html removes positives/gaps/code/summary from its inline template. Prompt templates get `|` block scalar examples for the `code` field.

**Tech Stack:** Vanilla JS (ES modules), CSS custom properties, YAML (custom parser/serializer), Markdown prompts.

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `skills/audit/scripts/public/js/views/summary.mjs` | Modify | Replace Task Details card with compact table |
| `skills/audit/scripts/public/styles.css` | Modify | Add summary table and human review badge styles |
| `skills/audit/scripts/public/print.html` | Modify | Remove summary/positives/gaps/code from task cards |
| `skills/audit/prompts/code-review.md` | Modify | Update code field example to use `\|` block scalar |
| `skills/audit/prompts/story-review.md` | Modify | Update code field example to use `\|` block scalar |

---

### Task 1: Add Summary Table Styles

**Files:**
- Modify: `skills/audit/scripts/public/styles.css` (after line 908, before the `@media print` block)

- [ ] **Step 1: Add summary table CSS**

Add the following styles after the `.print-badge-unreviewed` rule (line 908) and before the `/* ─── Print ─── */` comment:

```css
/* ─── Summary Task Table ─── */
.summary-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: var(--text-sm);
}
.summary-table thead th {
  text-align: left;
  padding: var(--space-2) var(--space-3);
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}
.summary-table thead th:not(:first-child) {
  text-align: center;
}
.summary-table tbody td {
  padding: var(--space-3);
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}
.summary-table tbody td:not(:first-child) {
  text-align: center;
}
.summary-table tbody tr:last-child td {
  border-bottom: none;
}
.summary-table .task-name-link {
  color: var(--text-primary);
  text-decoration: none;
  font-weight: 500;
  cursor: pointer;
  transition: color var(--duration-fast);
}
.summary-table .task-name-link:hover {
  color: var(--accent);
  text-decoration: underline;
}
.summary-table .sev-count {
  display: inline-block;
  min-width: 22px;
  padding: 2px 6px;
  border-radius: var(--radius-full);
  font-size: var(--text-xs);
  font-weight: 600;
  font-family: var(--font-mono);
}
.summary-table .sev-count-zero {
  color: var(--text-muted);
  background: transparent;
}
.summary-table .sev-count-critical {
  color: #fca5a5;
  background: rgba(239, 68, 68, 0.15);
}
.summary-table .sev-count-major {
  color: #fca5a5;
  background: rgba(239, 68, 68, 0.12);
}
.summary-table .sev-count-minor {
  color: #fcd34d;
  background: rgba(245, 158, 11, 0.15);
}
.summary-table .sev-count-info {
  color: var(--info-hover);
  background: rgba(59, 130, 246, 0.15);
}
.summary-table .total-count {
  font-weight: 600;
  font-family: var(--font-mono);
}
.summary-table .human-review-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: var(--radius-full);
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
.human-review-reviewed {
  background: var(--success-dim);
  color: var(--accent);
}
.human-review-partial {
  background: var(--warning-dim);
  color: var(--warning);
}
.human-review-unreviewed {
  background: var(--bg-surface);
  color: var(--text-muted);
}
```

- [ ] **Step 2: Verify no syntax errors**

Run: `node -e "const c = require('fs').readFileSync('skills/audit/scripts/public/styles.css','utf8'); console.log('CSS loaded, length:', c.length)"`

Expected: `CSS loaded, length: <number>`

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/public/styles.css
git commit -m "style: add summary table and human review badge CSS"
```

---

### Task 2: Replace Summary Page Task Details with Compact Table

**Files:**
- Modify: `skills/audit/scripts/public/js/views/summary.mjs`

- [ ] **Step 1: Remove renderPrintTaskDetail import and replace Task Details card**

In `summary.mjs`, make these changes:

**Change A:** Remove the import on line 4. Replace:
```javascript
import { renderPrintTaskDetail } from "../components/print-task-detail.mjs";
```
with nothing (remove the line entirely).

**Change B:** Add `SEVERITY_ORDER` to the constants import on line 5. Replace:
```javascript
import { SEVERITY_LABELS, SEVERITY_COLORS } from "../constants.mjs";
```
with:
```javascript
import { SEVERITY_LABELS, SEVERITY_COLORS, scoreColor } from "../constants.mjs";
```

**Change C:** Replace the entire Task Details card (lines 113-118):
```javascript
    <div class="card mb-6">
      <div class="font-medium mb-4">Task Details</div>
      <div class="space-y-4">
        ${tasks.map(t => renderPrintTaskDetail(t, notes)).join("")}
      </div>
    </div>
```

with:
```javascript
    <div class="card mb-6">
      <div class="font-medium mb-4">Task Overview</div>
      ${renderTaskTable(tasks, notes)}
    </div>
```

**Change D:** Add the `renderTaskTable` function before the closing `}` of `renderSummary`. Place it after line 217 (the `renderSummaryCard` call):

```javascript
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
          ${taskList.map(task => {
            const findings = task.review?.findings || [];
            const totalFindings = findings.length;
            const bySev = {};
            severities.forEach(s => { bySev[s] = 0; });
            findings.forEach(f => {
              const normalized = f.severity === "high" ? "major" : f.severity === "medium" ? "minor" : f.severity === "low" ? "info" : f.severity;
              if (bySev[normalized] !== undefined) bySev[normalized]++;
            });

            const noteTask = noteTasks.find(t => t.file === task.file);
            const reviewedCount = (noteTask?.findings || []).filter(f => f.status === "confirmed" || f.status === "deferred").length;
            let reviewStatus = "none";
            if (totalFindings > 0) {
              if (reviewedCount === 0) reviewStatus = "unreviewed";
              else if (reviewedCount >= totalFindings) reviewStatus = "reviewed";
              else reviewStatus = "partial";
            }

            const score = task.review?.score;
            return `
            <tr>
              <td><a class="task-name-link" href="#/review/${sessionId}">${escapeHtml(task.name || task.file)}</a></td>
              <td><span style="color:${scoreColor(score)};font-weight:600;font-family:var(--font-mono)">${score ?? "-"}/10</span></td>
              ${severities.map(s => {
                const count = bySev[s];
                return `<td><span class="sev-count ${count > 0 ? "sev-count-" + s : "sev-count-zero"}">${count}</span></td>`;
              }).join("")}
              <td><span class="total-count">${totalFindings}</span></td>
              <td>${reviewStatus === "none" ? '<span style="color:var(--text-muted)">—</span>' : `<span class="human-review-badge human-review-${reviewStatus}">${reviewStatus === "reviewed" ? "Reviewed" : reviewStatus === "partial" ? "Partial" : "Unreviewed"}</span>`}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>`;
  }
```

- [ ] **Step 2: Start the dev server and verify**

Run: `cd skills/audit/scripts && node server.mjs`

Open the summary page in a browser. Verify:
- The Task Details card is replaced with a compact table
- Each task shows name, score, severity counts, total, and human review status
- Clicking a task name navigates to the review page
- Human Review badges show correct status (Reviewed/Partial/Unreviewed)
- Severity count badges use correct colors (red for critical/major, amber for minor, blue for info)
- Zero counts are styled in muted text

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/public/js/views/summary.mjs
git commit -m "feat: replace summary Task Details with compact overview table"
```

---

### Task 3: Simplify print.html Content

**Files:**
- Modify: `skills/audit/scripts/public/print.html`

- [ ] **Step 1: Remove task summary from task cards**

In `print.html`, find and remove line 271:
```javascript
${t.review?.summary ? `<div class="task-summary">${esc(t.review.summary)}</div>` : ""}
```

- [ ] **Step 2: Remove code snippets from findings**

In `print.html`, find and remove line 290:
```javascript
${f.code ? `<pre class="finding-code">${esc(f.code)}</pre>` : ""}
```

- [ ] **Step 3: Remove positives section from task cards**

In `print.html`, find and remove lines 297-300:
```javascript
${positives.length > 0 ? `
  <div class="section-label">Positives</div>
  ${positives.map(p => `<div class="section-item">&bull; ${esc(p)}</div>`).join("")}
` : ""}
```

- [ ] **Step 4: Remove gaps section from task cards**

In `print.html`, find and remove lines 302-305:
```javascript
${gaps.length > 0 ? `
  <div class="section-label">Gaps</div>
  ${gaps.map(g => `<div class="section-item">&bull; ${esc(g)}</div>`).join("")}
` : ""}
```

- [ ] **Step 5: Remove unused CSS for finding-code**

In `print.html`, remove the `.finding-code` CSS rule (lines 101-106):
```css
.finding-code {
  font-family: "SF Mono", "Fira Code", "Cascadia Code", monospace;
  font-size: 11px; background: #f8fafc; padding: 4px 6px; border-radius: 3px;
  border: 1px solid #e2e8f0;
  margin-top: 4px; overflow-x: auto; white-space: pre; line-height: 1.4; color: #1a1a2e;
}
```

- [ ] **Step 6: Remove unused variables**

In the task rendering map function, remove the `positives` and `gaps` variable declarations. Find and remove:
```javascript
const positives = t.review?.positives || [];
const gaps = t.review?.gaps || [];
```

- [ ] **Step 7: Test print output**

Run: `cd skills/audit/scripts && node server.mjs`

Open a session's print page: `http://localhost:3000/print.html?session=<id>`
Verify:
- Task cards show only task name, score, and findings
- No task summary text
- No code snippets in findings
- No positives or gaps sections
- Findings still show: severity badge, status, description, suggestion, file:line
- `window.print()` still triggers automatically

- [ ] **Step 8: Commit**

```bash
git add skills/audit/scripts/public/print.html
git commit -m "refactor: simplify print.html — remove summary, code, positives, gaps"
```

---

### Task 4: Update Prompt Templates for Multi-line Code

**Files:**
- Modify: `skills/audit/prompts/code-review.md`
- Modify: `skills/audit/prompts/story-review.md`

- [ ] **Step 1: Update code-review.md**

In `skills/audit/prompts/code-review.md`, replace line 36:
```yaml
      code: "<code snippet>"
```
with:
```yaml
      code: |
        <multi-line code snippet>
```

- [ ] **Step 2: Update story-review.md**

In `skills/audit/prompts/story-review.md`, replace line 38:
```yaml
      code: "<code snippet>"
```
with:
```yaml
      code: |
        <multi-line code snippet>
```

- [ ] **Step 3: Commit**

```bash
git add skills/audit/prompts/code-review.md skills/audit/prompts/story-review.md
git commit -m "docs: update prompt templates to show multi-line code with YAML block scalar"
```
