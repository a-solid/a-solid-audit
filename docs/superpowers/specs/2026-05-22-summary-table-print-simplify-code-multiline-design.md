# Summary Table + Print Simplification + Code Multiline

Date: 2026-05-22

## Overview

Three independent changes:
1. Replace the verbose Task Details section on the Summary page with a compact summary table including a Human Review status column
2. Simplify print.html to focus on findings only — remove positives, gaps, code snippets, and task summaries
3. Update prompt templates to use YAML `|` block scalar for the `code` field example, guiding AI agents to write multi-line code snippets properly

---

## Change 1: Summary Page — Task Details → Compact Table

### Current State

The Task Details card in `summary.mjs` renders every task fully expanded via `renderPrintTaskDetail()`: summary text, all findings (with code snippets, suggestions, file:line), positives, and gaps. With many tasks, this produces an extremely long page.

### Design

Replace the `Task Details` card with a compact table showing per-task aggregates:

| Task | Score | Critical | Major | Minor | Info | Total | Human Review |
|------|-------|----------|-------|-------|------|-------|-------------|
| task-name.js | 7/10 | 1 | 2 | 3 | 0 | 6 | Reviewed |
| another.js | 9/10 | 0 | 0 | 1 | 2 | 3 | Partial |
| third.js | 8/10 | 0 | 1 | 0 | 0 | 1 | Unreviewed |

**Columns:**
- **Task** — task name (or file path), clickable link back to the review page for that task
- **Score** — `score/10` colored with `scoreColor()`
- **Critical / Major / Minor / Info** — count of findings per severity, styled with severity color badges. Columns with 0 count show `0` in muted text.
- **Total** — total findings count
- **Human Review** — badge showing人工审核进度:
  - **Reviewed** (green) — all findings have a status (confirmed or deferred)
  - **Partial** (yellow/amber) — some findings reviewed, some not
  - **Unreviewed** (gray) — no findings have been reviewed

**Human Review logic:**
```
const noteTask = notes?.tasks?.find(t => t.file === task.file);
const totalFindings = task.review?.findings?.length || 0;
const reviewedCount = (noteTask?.findings || []).filter(f => f.status === "confirmed" || f.status === "deferred").length;

if (totalFindings === 0) status = "none";  // no badge needed
else if (reviewedCount === 0) status = "unreviewed";
else if (reviewedCount === totalFindings) status = "reviewed";
else status = "partial";
```

**Behavior:**
- Clicking a task name navigates to the review page: `#/review/${sessionId}`
- No expand/collapse — the table is always the final state
- The `print-task-detail.mjs` component is no longer used by summary.mjs (but stays for potential future use)

### Files

- `skills/audit/scripts/public/js/views/summary.mjs` — remove `renderPrintTaskDetail` import and Task Details card, replace with table rendering
- `skills/audit/scripts/public/styles.css` — add table styles (severity badges in cells, human review status badges)

---

## Change 2: print.html Content Simplification

### Current State

print.html renders every task with: summary, findings (severity + description + code snippet + suggestion + file:line), positives, and gaps. This is verbose for a printed report.

### Design

**Remove from each task card:**
- Task summary text
- Code snippets (`<pre class="finding-code">`)
- Positives section
- Gaps section

**Keep in each task card:**
- Task name + score
- Findings: severity badge + status badge + description + suggestion + file:line

**Keep globally:**
- Report header (title + session ID + date)
- Sign-off section
- Stats row
- Findings by Severity bars

The result is a focused problem report: what's wrong, how to fix it, where to find it.

### Files

- `skills/audit/scripts/public/print.html` — remove summary/positives/gaps/code rendering from the task card template in the inline JS

---

## Change 3: YAML code Field — Multiline Prompt Templates

### Current State

Both prompt templates show `code: "<code snippet>"` which looks like a single-line string. The YAML parser/serializer already supports multi-line via `|` literal block scalar, and the AI sometimes writes multi-line code — but the prompt example doesn't encourage it.

### Design

Update the finding schema example in both prompts to show `code` with the `|` format:

**code-review.md** — change:
```yaml
      code: "<code snippet>"
```
to:
```yaml
      code: |
        <multi-line code snippet>
```

**story-review.md** — same change.

The field rules already state "Multiline text uses `|` (literal block scalar), single-line uses plain scalar", so this just makes the example consistent with the rule.

### Files

- `skills/audit/prompts/code-review.md` — update code field example
- `skills/audit/prompts/story-review.md` — update code field example

---

## Implementation Notes

- All three changes are independent and can be implemented in any order
- UI changes (Change 1 and Change 2) must use the `ui-ux-pro-max` skill
- No database/schema changes — all data structures remain the same
- The YAML parser/serializer needs no changes — it already handles multi-line strings correctly
- The three rendering locations for `code` (task-detail.mjs, print-task-detail.mjs, print.html) already use `<pre><code>` with `white-space: pre`, so multi-line display works without changes
