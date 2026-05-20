# UI/UX Review Fixes Design

**Date**: 2026-05-21
**Scope**: All pages — Review Findings, Summary, Progress, Home, Wizard
**Approach**: Batch fix all 15 issues in one pass

## Issue Inventory

| # | Priority | Issue | Pages |
|---|----------|-------|-------|
| 1 | CRITICAL | Severity bar label overflow ("partially-met") | Review, Summary |
| 2 | CRITICAL | Confirm/Dismiss no current state indicator | Review (Tasks tab) |
| 3 | CRITICAL | Dismiss panel clipped by container, no auto-scroll | Review (Tasks tab) |
| 4 | HIGH | Summary `grid-cols-5` not responsive | Summary |
| 5 | HIGH | Review overview `grid-cols-3` cramped on mobile | Review (Overview) |
| 6 | HIGH | No empty state when no findings exist | Review (Overview) |
| 7 | HIGH | Task sidebar loses scroll position on switch | Review (Tasks tab) |
| 8 | MEDIUM | Task sidebar no press feedback transition | Review (Tasks tab) |
| 9 | MEDIUM | Severity badge "PARTIALLY-MET" uppercase looks odd | Review, Summary |
| 10 | MEDIUM | Toast messages not specific to finding | Review (Tasks tab) |
| 11 | MEDIUM | Icon-only buttons lack aria-label | All pages |
| 12 | MEDIUM | Notes FAB overlaps dismiss panel | Review (Tasks tab) |
| 13 | MEDIUM | Wizard step indicator no animation | Wizard |
| 14 | MEDIUM | Sign-off validation toast-only, no inline error | Summary |
| 15 | LOW | View transition doesn't scroll to top | All pages |

---

## Section 1: Finding Status Feedback (#2, #3, #10)

### Status indicators on Confirm/Dismiss

**Change `renderTaskDetail` signature** to accept notes: `renderTaskDetail(task, notes)`.

For each finding, look up its status from `notes.tasks.find(t => t.file === task.file)?.findings?.[i]`.

**Confirmed state**:
- Show green badge: `✓ Confirmed`
- Confirm button becomes outlined/disabled (current action shown by badge)
- Dismiss button stays active ("Dismiss") — clicking it re-opens the dismiss panel and changes status to deferred

**Dismissed state**:
- Show amber badge: `✗ Dismissed` with reason text if present
- Dismiss button becomes outlined/disabled
- Confirm button stays active ("Confirm") — clicking it changes status back to confirmed

**Default state** (no status yet):
- Show both Confirm and Dismiss buttons as active/ghost style

**Implementation**: The "active" button for the current action gets a filled style (green border for Confirm, amber border for Dismiss). The other button stays ghost. This makes the current state visible at a glance while allowing easy switching.

### Auto-scroll dismiss panel

After toggling dismiss panel visibility in `review.mjs`, call:
```js
requestAnimationFrame(() => {
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});
```

### Specific toasts

Include truncated finding description (first ~40 chars) in toast messages:
- `"Confirmed: Use of eval() in auth module..."`
- `"Dismissed: Use of eval() in auth module..."`

---

## Section 2: Severity Label Overflow (#1, #9)

### CSS fix

Change `.severity-bar-label` from `width: 72px` to `min-width: 72px`, add `white-space: nowrap`.

### Label shortening

Map severity values to shorter display labels in both `review.mjs` and `summary.mjs`:
- `partially-met` → `Partial`
- `not-met` → `Not Met`
- `met` → `Met`
- All others (`critical`, `major`, `high`, `medium`, `minor`, `low`, `info`) remain as-is

Severity bar track stays `flex: 1` to absorb width changes.

---

## Section 3: Responsive & Layout (#4, #5, #7, #15)

### Summary grid-cols-5 responsive

Add `grid-cols-5` to the responsive media query in `styles.css`:
```css
@media (max-width: 768px) {
  .grid-cols-2, .grid-cols-3, .grid-cols-4, .grid-cols-5 { grid-template-columns: 1fr; }
}
```

### Review overview stat cards

Add text-center to stat cards on mobile via existing responsive collapse (already stacks to 1fr). No additional change needed beyond the `grid-cols-3` responsive rule already in place.

### Sidebar scroll preservation

In `renderTasksTab`, before re-rendering content:
1. Save `document.getElementById("task-sidebar")?.scrollTop`
2. After re-render, restore: `sidebar.scrollTop = savedScroll`
3. Also scroll detail panel to top: `detailPanel.scrollTop = 0`

### Page scroll on navigation

In `app.mjs` `navigate()` function, add `window.scrollTo({ top: 0, behavior: 'instant' })` before rendering the new view.

---

## Section 4: Interaction & Polish (#6, #8, #11, #12, #13, #14)

### Empty findings state

In `renderOverview`, when `totalFindings === 0`, show:
```html
<div class="card" style="text-align:center;padding:var(--space-8)">
  [green checkmark icon]
  <h2>All Clear</h2>
  <p>No findings were identified in this review.</p>
</div>
```

### Task sidebar feedback

Add to `.task-nav-item.active` CSS:
```css
border-left-width transition: 150ms
```
Add subtle `padding-left` shift on active state for visual feedback.

### Aria-labels

Add `aria-label` to icon-only and primarily-icon buttons:
- Back buttons: `aria-label="Go back"`
- Confirm: `aria-label="Confirm finding"`
- Dismiss: `aria-label="Dismiss finding"`
- Notes FAB: `aria-label="Review notes"`
- Export PDF: `aria-label="Export PDF"`
- Home: `aria-label="Go home"`

### Notes FAB overlap

Add `padding-bottom: 60px` to `.detail-panel` to ensure dismiss panel content isn't hidden behind the fixed FAB. This gives consistent bottom breathing room.

### Wizard step animation

Add a CSS class for wizard content transition:
```css
.wizard-content-enter {
  animation: fadeIn 200ms var(--ease-spring);
}
```
Apply this class to the wizard content div on each step change. No DOM stabilization refactor needed.

### Sign-off validation

In `summary.mjs`, instead of toast-only validation:
1. Add red border to name input when empty on submit
2. Show inline error message: `<span class="text-danger text-xs">Name is required</span>` below the input
3. Clear error state when user types in the field

---

## Files Changed

| File | Changes |
|------|---------|
| `styles.css` | Severity bar label, grid-cols-5 responsive, task-nav-item feedback, wizard content animation, detail-panel bottom padding |
| `task-detail.mjs` | Accept notes param, render status badges, conditional buttons, aria-labels |
| `review.mjs` | Pass notes to renderTaskDetail, auto-scroll dismiss panel, specific toasts, severity label mapping, sidebar scroll preservation, empty findings state, aria-labels |
| `summary.mjs` | Severity label mapping, responsive grid-cols-5, inline sign-off validation, aria-labels |
| `app.mjs` | Scroll to top on navigation |
