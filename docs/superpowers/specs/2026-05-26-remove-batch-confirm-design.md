# Remove Batch Confirm Feature Design

**Date:** 2026-05-26
**Status:** Approved

## Problem

The inline batch mode adds significant complexity (state flag, checkboxes, sticky bar, two UI modes) for marginal benefit. With auto-acknowledge handling info/low findings, users only need to manually acknowledge a few high-severity findings — one at a time, where they can read the code snippet and suggestion.

## Solution

Remove the entire batch confirm feature. Users acknowledge findings one at a time using the existing per-card confirm/dismiss buttons.

## Removed Code

### task-detail.mjs
- `batchMode` parameter from `renderTaskDetail` signature (revert to `(task, notes)`)
- Batch Select / Cancel button in FINDINGS header
- Checkbox `<input>` on each finding card
- `finding-card-body` wrapper div around card content
- `disabled-checkbox` class on reviewed cards
- `LOW_SEVS` and `preChecked` variables

### review.mjs
- `batchMode` state variable
- `confirmSelectedFindings` function
- All batch button wiring (batchSelectBtn, batchCancelBtn)
- Entire `if (batchMode) { ... }` block (action bar, updateBatchBar, Select All/Deselect All, batch confirm)
- `batchMode = false` resets on task switch and mobile nav
- `renderTaskDetail` call reverts to two arguments

### styles.css
- Entire `/* ─── Inline Batch Mode ─── */` block (checkbox, batch-mode, checkboxIn animation, finding-card-body, disabled-checkbox, batch-action-bar and all sub-rules, slideUp animation)

### app.mjs
- `checkSquare` icon entry (only used by Batch Select button)

## Preserved

- Per-card confirm/dismiss buttons and all existing wiring
- `updateFindingStatus` function
- `autoAcknowledgeLowSeverity` function
- All dismiss reason functionality
- Overview stats (Acknowledged/Deferred/Pending labels)

## Files Changed

| File | Change |
|------|--------|
| `skills/audit/scripts/public/js/components/task-detail.mjs` | Remove batch mode support |
| `skills/audit/scripts/public/js/views/review.mjs` | Remove batch state, action bar, confirmSelectedFindings |
| `skills/audit/scripts/public/styles.css` | Remove batch/checkbox CSS |
| `skills/audit/scripts/public/js/app.mjs` | Remove checkSquare icon |
