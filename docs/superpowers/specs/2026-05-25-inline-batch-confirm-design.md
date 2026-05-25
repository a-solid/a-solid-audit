# Inline Batch Mode for Confirming Findings

**Date:** 2026-05-25
**Status:** Approved

## Problem

The current "Confirm All Findings" button expands into a separate selection panel that duplicates finding descriptions, causes layout shift, and forces users to re-review findings out of their original context.

## Solution

Replace the expandable panel with inline batch mode: checkboxes appear directly on existing finding cards, with a sticky action bar for batch confirmation. No layout jump, no duplicated information.

## Design

### Entry Point

- Remove `#confirm-all-slot` and the full-width "Confirm All N Findings" button entirely.
- Add a "Batch Select" button to the right of the FINDINGS section header (`FINDINGS (8)`).
- The button only appears when there are unreviewed findings.

### Batch Mode Activation

When the user clicks "Batch Select":

- Button text changes to "Cancel"; clicking again exits batch mode.
- Each finding card gets a checkbox on the left side (slide-in, 150ms).
- The per-card confirm/dismiss icon buttons are hidden during batch mode.
- Pre-selection rules:
  - Low-severity findings (minor, medium, info, low) are **pre-checked**.
  - High-severity findings (critical, major, high) are **unchecked** — user must opt in.
  - Already confirmed findings: disabled checkbox, checked, non-interactive.
  - Already dismissed findings: disabled checkbox, unchecked, non-interactive.

### Batch Action Bar

A sticky bar at the bottom of the detail panel (`position: sticky; bottom: 0`):

```
[Select All] [Deselect All]     [Confirm 5 selected]
```

- "Select All" / "Deselect All" toggles — only affects unreviewed findings.
- "Confirm N selected" button: disabled when count is 0, shows spinner during API call.
- If any high-severity findings are selected, append inline text: "Confirm 5 selected (2 high-severity)".
- Bar uses `backdrop-filter: blur()` and a border-top for visual separation.

### Exit

- "Cancel" button in the FINDINGS header exits batch mode, removes checkboxes.
- After successful batch confirm: exits batch mode, findings update their confirmed status.
- No confirmation dialog — the explicit checkbox selection is the review step.

### Removed Code

- `#confirm-all-slot` div from `task-detail.mjs` template.
- `renderConfirmAllPanel()` function and all wiring in `review.mjs` (lines ~404-509).
- All `.confirm-all-*` CSS rules from `styles.css`.

## Files Changed

| File | Change |
|------|--------|
| `skills/audit/scripts/public/js/components/task-detail.mjs` | Remove `#confirm-all-slot`; add checkbox markup and batch-mode class to finding cards |
| `skills/audit/scripts/public/js/views/review.mjs` | Remove `renderConfirmAllPanel`; add batch mode state, toggle logic, sticky action bar |
| `skills/audit/scripts/public/styles.css` | Remove `.confirm-all-*`; add `.finding-checkbox`, `.batch-action-bar`, batch-mode card styles |
