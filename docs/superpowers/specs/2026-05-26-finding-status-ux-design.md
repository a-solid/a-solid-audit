# Finding Status UX Redesign

Date: 2026-05-26

## Problem

The finding status confirmation UI has three pain points:

1. **Buttons too small and unclear** — 28px icon-only check/X buttons don't meet 44px touch target minimum and their purpose is ambiguous
2. **No undo** — once acknowledged or deferred, there's no way to reverse the decision
3. **Jarring transitions** — status change is an instant opacity snap with no smooth visual transition

Additionally, the distinction between "Acknowledge" and "Defer" is not documented, causing confusion about when to use each.

## Status Definitions

- **Pending** (default): The finding has not been reviewed yet.
- **Acknowledge**: I agree this is a real issue that should be tracked, fixed, or addressed. Use when the finding is valid and actionable.
- **Defer**: I want to skip this finding. Use when the finding is a false positive, acceptable risk, out of scope, already addressed, or intentional design. A reason is required.

## Approach: Inline Action Bar

### Finding Card States

**Pending state:**
- Severity badge + dashed "Pending" badge at top
- Finding description, code/suggestion, file path as before
- Bottom action bar with two labeled buttons:
  - "Acknowledge" — full-width, green border/fill, 36px height
  - "Defer" — compact width, amber text, outlined
- Both buttons meet 44px touch target (36px visual + padding)

**Acknowledged state:**
- Green left border, green gradient background
- Solid "Acknowledged" badge replaces dashed "Pending"
- Action bar replaced with: subtle "Revert" link (top-right corner)
- Description and file info remain fully visible

**Deferred state:**
- Amber left border, amber gradient background
- "Deferred: {reason}" badge showing the defer reason
- Card content at 0.7 opacity (de-emphasized but readable)
- "Revert" link in top-right corner

### Revert Behavior

- Clicking "Revert" on an acknowledged or deferred card resets it to pending
- No confirmation dialog needed (revert is non-destructive)
- API call: `POST /api/sessions/:id/notes` with `{ status: null, reason: "" }` for that finding index
- Smooth 200ms transition back to pending state

### Transitions

All state changes use CSS transitions:
- `border-color`: 200ms ease-out
- `background`: 200ms ease-out
- `opacity`: 200ms ease-out
- Badge changes: crossfade via opacity (old badge fades out, new fades in)
- Respect `prefers-reduced-motion`: disable transitions when set

### Defer Flow (unchanged interaction, improved styling)

- Clicking "Defer" opens the reason panel below the action bar within the card
- 5 preset reason buttons: "False positive", "Acceptable risk", "Out of scope", "Already addressed", "Intentional design"
- Custom reason text input + Submit button
- Same slide-down animation, now with improved spacing and 36px button height

## Sidebar Progress

**Current:** Single-color progress bar showing % reviewed.

**New:** Segmented progress bar with 3 colors:
- Green segment: acknowledged count
- Amber segment: deferred count
- Gray segment: pending count
- Mini legend below: "4 ack · 2 defer · 4 pending"
- Fraction label stays: "6/10"

## Overview Tab Stats

**Current:** Three cards showing Acknowledged%, Deferred%, Pending%.

**New:**
- Four stat cards: Total (18) / Acknowledged (7) / Deferred (3) / Pending (8) — absolute counts, not percentages
- Below stats: unified stacked progress bar (green/amber/gray segments)
- Label: "56% reviewed · 8 remaining"
- Keep severity bar chart and Needs Attention list unchanged

## Summary & Sign-off Page

- Same four stat cards + stacked progress bar as overview tab (consistency)
- Warning banner when pending findings remain: "8 findings still pending review — complete all reviews before sign-off"
- Task overview table unchanged

## Files to Modify

| File | Changes |
|------|---------|
| `scripts/public/js/components/task-detail.mjs` | Replace icon buttons with action bar, add revert button, add transition classes |
| `scripts/public/js/views/review.mjs` | Update `updateFindingStatus` for revert, update sidebar progress rendering, update overview stats rendering |
| `scripts/public/js/views/summary.mjs` | Update stat cards to 4-count layout + progress bar + warning banner |
| `scripts/public/styles.css` | New action bar styles, segmented progress bar, revert button, transition classes, updated dismiss panel |

## Out of Scope

- Keyboard shortcuts for finding actions (separate enhancement)
- Batch operations on findings
- Filtering findings by status
- Print layout changes
