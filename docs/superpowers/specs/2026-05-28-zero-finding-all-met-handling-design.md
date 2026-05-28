# Zero-Finding & All-Met Task Handling — Design

## Problem

The audit system handles three types of "positive" outcomes inconsistently across its three rendering surfaces (frontend, PDF export, review-notes.yml):

1. **Zero-finding tasks** — code/project tasks with no issues found (high score, empty findings array)
2. **All-met story tasks** — story tasks where every finding has `severity: "met"` (all acceptance criteria satisfied)
3. **Mixed scenarios** — sessions where some tasks have findings and others don't

### Current Bugs

| # | Area | Bug |
|---|------|-----|
| 1 | PDF | `print.html` does not count `wellDone` — stats row shows Need Fix / Won't Fix / Not an Issue / Pending but omits Well Done |
| 2 | PDF | `reviewedCount` in `print.html` excludes `wellDone` — all-met tasks show as "0 reviewed, all pending" |
| 3 | PDF | `well-done` status badge missing — met findings show as "Pending" in PDF |
| 4 | Frontend | `met` severity has no color in `SEVERITY_COLORS` — severity bars for met findings use default `var(--info)` |
| 5 | Frontend | All-met story tasks show individual met findings with action buttons (Need Fix / Won't Fix / Not an Issue) even though there's nothing to fix |
| 6 | Summary | Zero-finding story tasks show "—" in Human Review column even when all ACs are met |

## Design

### Section 1: Data Layer

#### 1.1 Add `met` to `SEVERITY_COLORS`

In `constants.mjs`, add:

```js
SEVERITY_COLORS.met = "var(--accent)"
```

This makes met findings use the accent (green) color consistently across severity bars and badges.

#### 1.2 PDF stats alignment

In `print.html`, recalculate stats to include `wellDone`:

```js
// Add wellDone counting alongside existing counters
let wellDoneCount = 0;
// ... in the forEach loop:
if (status === "well-done") wellDoneCount++;
// reviewedCount = needFixCount + wontFixCount + notAnIssueCount + wellDoneCount;
```

Stats row becomes: Total | Need Fix | Won't Fix | Not an Issue | Well Done (5 boxes, matching summary view).

#### 1.3 PDF `well-done` status badge

In `print.html`, add `well-done` to the status badge logic:

```js
const statusBadge = status === "need-fix" ? '...'
  : status === "wont-fix" ? '...'
  : status === "not-an-issue" ? '...'
  : status === "well-done" ? '<span class="badge badge-status badge-well-done">Well Done</span>'
  : '<span class="badge badge-status badge-unreviewed">Pending</span>';
```

Add CSS:

```css
.badge-well-done { color: #16a34a; }
```

### Section 2: Frontend Rendering

#### 2.1 All-met story task detail

In `task-detail.mjs`, when ALL findings have `severity === "met"`:

- Show a positive summary card: green check icon + "All acceptance criteria met" message
- List the met criteria as collapsed detail (optional expand)
- Do NOT show action buttons (Need Fix / Won't Fix / Not an Issue)
- Keep the Revert button for individual findings if they were manually marked

Detection logic:

```js
const allMet = findings.length > 0 && findings.every(f => f.severity === "met");
```

When `allMet` is true, render a compact positive card instead of the normal finding cards.

#### 2.2 Overview severity bars — exclude `met`

In `review.mjs` overview, the severity bar section should filter out `met` from `bySeverity` before rendering. Met is not a problem severity — it's a positive outcome.

```js
const problemSeverities = Object.fromEntries(
  Object.entries(bySeverity).filter(([sev]) => sev !== "met")
);
```

Use `problemSeverities` for the severity bars section. If `problemSeverities` is empty but there are met findings, show "All findings met" message instead.

#### 2.3 Summary task table — all-met review status

In `summary.mjs`, the `renderTaskTable` function currently sets `reviewStatus = "none"` when `totalFindings === 0`. Fix:

- For zero-finding tasks (code/project): keep showing "—" — nothing to review
- For all-met tasks (findings exist, all severity "met" and all status "well-done"): show "Reviewed" badge
- The fix: check if findings exist and all have been reviewed (including well-done), regardless of severity

#### 2.4 Review progress bar for all-met

Already working — when all findings are `well-done`, the progress bar is 100% green via `seg-well-done`. No change needed.

### Section 3: PDF Export (`print.html`)

#### 3.1 `met` severity styling

Add CSS for met findings:

```css
.finding.met { border-left-color: #16a34a; }
.sev-label.sev-met { border-left-color: #16a34a; color: #166534; }
.sev-fill.sev-met { background: #16a34a; }
```

#### 3.2 Zero-finding task cards

When a task has 0 findings, render:

```html
<div class="task-card">
  <div class="task-header">
    <span class="task-name">...</span>
    <span class="task-score">...</span>
  </div>
  <div style="color:#16a34a;text-align:center;padding:12px">✓ Clean code — no issues found</div>
</div>
```

#### 3.3 All-met task cards

When all findings are `severity: "met"`, render a compact card:

```html
<div class="task-card">
  <div class="task-header">
    <span class="task-name">...</span>
    <span class="task-score">...</span>
  </div>
  <div style="color:#16a34a;padding:8px 0">✓ All acceptance criteria met (N/N)</div>
</div>
```

Optionally include the criteria list as collapsed detail.

#### 3.4 Stats row redesign

Replace 5-box stats row: Total | Need Fix | Won't Fix | Not an Issue | Well Done

Remove the Pending box (derivable from total minus reviewed).

## Files to Change

| File | Changes |
|------|---------|
| `skills/audit/scripts/public/js/constants.mjs` | Add `met` to `SEVERITY_COLORS` |
| `skills/audit/scripts/public/js/views/review.mjs` | Filter `met` from severity bars in overview |
| `skills/audit/scripts/public/js/components/task-detail.mjs` | All-met positive summary card |
| `skills/audit/scripts/public/js/views/summary.mjs` | Fix review status for all-met tasks |
| `skills/audit/scripts/public/print.html` | Well Done stats, met styling, status badge, zero/all-met cards |

## Not Changing

- `notes.mjs` — the `autoPersistWellDone` function works correctly
- `aggregateFindings` — already handles well-done correctly
- Story/code review prompts — they already produce the correct data format
