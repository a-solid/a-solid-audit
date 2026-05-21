# Review Page Fixes: Scrolling, Findings Default, Stats Bug, Review Context

Date: 2026-05-21

## Summary

Four bug fixes for the review/summary pages:
1. Finding cards clipped at bottom — cannot scroll to see all content
2. Findings should default to confirmed state with active buttons
3. Unreviewed stat goes negative — double-counting actionRequired in formula
4. Review Context panel shows full file but silently drops edits to AI section

---

## 1. Finding Card Scroll Fix

**Problem:** `.sidebar-layout` has `max-height: 75vh` and `overflow: hidden`, trapping the detail panel in a fixed-height box. Bottom findings are hard to reach.

**Fix:** In `styles.css`, remove `max-height` and `overflow: hidden` from `.sidebar-layout`. The detail panel already has `overflow-y: auto`, so content will scroll within the panel as it grows. The page itself will also scroll if needed.

```css
/* Before */
.sidebar-layout {
  display: grid; grid-template-columns: 300px 1fr;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  min-height: 480px;
  max-height: 75vh;
  background: var(--bg-surface-solid);
}

/* After */
.sidebar-layout {
  display: grid; grid-template-columns: 300px 1fr;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden; /* keep for border-radius clipping */
  min-height: 480px;
  background: var(--bg-surface-solid);
}
```

Keep `overflow: hidden` for border-radius clipping. The detail panel's own `overflow-y: auto` handles scrolling within the panel. Without `max-height`, the panel grows with content and the page scrolls as needed.

---

## 2. Findings Default to Confirmed on Task View

**Problem A:** Confirm/Dismiss buttons both appear as ghost-style in the default (unreviewed) state — no visual cue to click.

**Problem B:** `updateFindingStatus` in `review.mjs` line 51 implicitly defaults all unreviewed findings to `{ status: "confirmed" }` when saving any single finding. This silently marks findings the user never acted on — correct intent but wrong timing.

### New behavior

When a user clicks a task in the left sidebar to view its findings, **all findings for that task are automatically marked as confirmed** and persisted to the API. This happens upfront on first view — not hidden inside a later save call. The Confirm buttons show as active (already confirmed). The user can then selectively change individual findings to Dismissed with a reason.

### Fix A: Auto-confirm on task select

In `review.mjs`, when the user clicks a task in the sidebar (the click handler that sets `currentTaskIdx` and calls `renderContent()`), add a step that checks if this task has any findings in notes. If not, auto-confirm all findings by writing `{ findings: [...] }` with all set to `{ status: "confirmed", reason: "" }` via `api.updateTaskNote()`. Update the in-memory notes object immediately so the UI renders confirmed state.

### Fix B: Confirm button active by default

In `task-detail.mjs`, change the Confirm button in the unreviewed state to show as solid/active — same styling as the confirmed state (accent border, accent-dim background). This visual matches the auto-confirmed behavior: findings are confirmed unless the user dismisses them.

### Fix C: Clean up updateFindingStatus

In `review.mjs` line 51, remove the implicit `{ status: "confirmed", reason: "" }` fallback. Since all findings are now confirmed on task view, this fallback is no longer needed. The function should only read existing statuses from notes data.

---

## 3. Review Context Panel

**Problem:** `notes-panel.mjs` loads the entire `review-context.md` file into the textarea, but on save the server only persists the `## User Context` section. Edits to the `## Review Notes` section are silently lost. Also inconsistent with wizard.mjs which correctly extracts only User Context.

**Fix:** In `notes-panel.mjs`:

1. When loading content (`loadContent`), extract only the `## User Context` section — same regex approach as wizard.mjs:
```js
const match = data.context.match(/## User Context\n([\s\S]*?)(?=\n## Review Notes|$)/);
loadedContent = match ? match[1].trim() : data.context.trim();
```

2. Update the panel subtitle from "Referenced during code review as context" to something like "Project context for AI reviewers" — makes clear this is user-editable context, not a general notes area.

3. No changes needed to the server API or SKILL.md — the current behavior is correct (save only User Context, preserve Review Notes).

---

## 4. Unreviewed Stat Goes Negative

**Problem:** In `summary.mjs` lines 46-69, the stats formula double-counts `actionRequired`:

```
confirmed = all findings with status "confirmed"
deferred  = all findings with status "deferred"
actionRequired = subset of confirmed that are critical/major/high

unreviewed = totalFindings - confirmed - deferred - actionRequired
```

Since `actionRequired` is a subset of `confirmed`, high-severity findings get subtracted twice. For example, if there are 3 confirmed findings (2 high + 1 low): `unreviewed = total - 3 - 0 - 2 = total - 5`, but there are only 3 confirmed findings total — the stat goes negative.

**Fix:** Remove `actionRequired` from the unreviewed formula. `actionRequired` is a display-only stat (shows how many of the confirmed findings are high severity) — it should not affect the unreviewed count.

```js
// Before (line 69)
const reviewed = confirmed + deferred + actionRequired;
const unreviewed = totalFindings - reviewed;

// After
const unreviewed = totalFindings - confirmed - deferred;
```

Also fix the same bug in `print.html` which has the identical formula.

The "Action Required" stat card still displays `actionRequired` correctly — it just no longer contributes to the unreviewed calculation.

---

## Files

- **Modify:** `skills/audit/scripts/public/styles.css` — remove `max-height: 75vh` from `.sidebar-layout`
- **Modify:** `skills/audit/scripts/public/js/views/review.mjs` — auto-confirm all findings on task select, clean up updateFindingStatus fallback
- **Modify:** `skills/audit/scripts/public/js/components/task-detail.mjs` — Confirm button active by default
- **Modify:** `skills/audit/scripts/public/js/views/summary.mjs` — fix unreviewed stat formula
- **Modify:** `skills/audit/scripts/public/print.html` — fix same unreviewed stat formula
- **Modify:** `skills/audit/scripts/public/js/components/notes-panel.mjs` — extract only User Context section, update label
