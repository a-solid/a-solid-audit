# PDF Export Optimization — Task Details in Report

Date: 2026-05-21

## Problem

The current PDF export (via `window.print()` on the Summary page) only includes aggregate statistics — total findings, severity bars, notes, and sign-off. Per-task details (scores, summaries, individual findings with confirm/dismiss status and reasons, positives, gaps) are not included in the exported PDF.

## Design

### Report Structure (top to bottom)

1. **Report header** — Session ID, date, review type
2. **Overview stats** — Existing stat cards (Total Findings, Confirmed, Action Required, Deferred, Unreviewed) + severity bar chart
3. **Overall Notes** — Existing free-text notes area
4. **Task details** (new section, rendered per task):
   - Task name + Score (X/10) + Status badge
   - Summary text
   - **Findings list** (sorted by severity: critical → info) — each finding shows:
     - Severity badge + Confirm/Dismiss status badge + reason (if dismissed)
     - Description text
     - Code snippet (if present)
     - Suggestion (if present)
     - File:line reference (if present)
   - **Positives** — bullet list
   - **Gaps** — bullet list
5. **Sign-off** — Existing name/role/date area

### Rendering Approach

- Add a print-only task detail section to the Summary view, rendered after the existing content and before sign-off
- Write a dedicated `renderPrintTaskDetail(task, notes)` function in a new component file `print-task-detail.mjs` that produces print-friendly HTML (no interactive elements, no dismiss panels, no buttons)
- Findings are sorted by severity order: critical, major, high, medium, minor, low, info
- Status badges use inline colors: green for Confirmed, amber for Dismissed (with reason text), gray for Unreviewed
- The section is always visible on the page (not print-only) so users can review the report before exporting

### Print CSS Extensions

Extend `@media print` block in `styles.css`:
- `page-break-inside: avoid` on each task detail card
- `page-break-before: always` option for task cards if needed
- Ensure finding severity colors render in print (some browsers strip backgrounds)
- Use `border-left` on findings instead of background colors for print visibility
- Ensure code snippets have proper borders in print

### Files

- Create: `skills/audit/scripts/public/js/components/print-task-detail.mjs` — print-friendly task detail renderer
- Modify: `skills/audit/scripts/public/js/views/summary.mjs` — add task details section
- Modify: `skills/audit/scripts/public/styles.css` — extend print CSS + add print-task-detail styles

## Scope

- No API changes — all data is already fetched in the Summary view
- No new dependencies — vanilla JS, `window.print()` remains the export mechanism
