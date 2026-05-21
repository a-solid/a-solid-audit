# Review Page Fixes: Scrolling, Findings Default, Review Context

Date: 2026-05-21

## Summary

Three bug fixes for the review page:
1. Finding cards clipped at bottom — cannot scroll to see all content
2. Findings should default to confirmed state with active buttons
3. Review Context panel shows full file but silently drops edits to AI section

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

## 2. Findings Default to Confirmed

**Problem A:** Confirm/Dismiss buttons both appear as ghost-style in the default (unreviewed) state — no visual cue to click.

**Problem B:** `updateFindingStatus` in `review.mjs` line 51 implicitly defaults all unreviewed findings to `{ status: "confirmed" }` when saving. This silently marks findings the user never acted on.

### Fix A: Confirm button active by default

In `task-detail.mjs`, change the default (unreviewed) state of the Confirm button to show as solid/active instead of ghost. The Dismiss button stays as ghost (it's the alternative action).

Change the Confirm button classes for the unreviewed state:
- Remove `btn-ghost` when not confirmed
- Add active styling that matches the confirmed state (accent color border, accent-dim background)

The button should look "pre-selected" — users can click to confirm (no change) or click Dismiss to override.

### Fix B: Remove implicit default in updateFindingStatus

In `review.mjs` line 51, change the fallback from `{ status: "confirmed", reason: "" }` to just `null` or skip writing it. Only include findings the user has explicitly acted on in the saved notes array. This prevents silent auto-confirmation of unreviewed findings.

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

## Files

- **Modify:** `skills/audit/scripts/public/styles.css` — remove `max-height: 75vh` from `.sidebar-layout`
- **Modify:** `skills/audit/scripts/public/js/components/task-detail.mjs` — Confirm button active by default
- **Modify:** `skills/audit/scripts/public/js/views/review.mjs` — remove implicit confirmed default in `updateFindingStatus`
- **Modify:** `skills/audit/scripts/public/js/components/notes-panel.mjs` — extract only User Context section, update label
