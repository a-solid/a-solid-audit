# Overview Task Navigation & Dismiss Input Fix

Date: 2026-05-21

## Problem

1. **Overview task click has no action** — The "Needs Attention" section on the Overview tab lists tasks with high-severity findings, but clicking them does nothing.
2. **Dismiss custom input closes unexpectedly** — When typing a custom dismiss reason, the dismiss panel closes and input is lost. Root cause: click events on the input bubble up and trigger the dismiss panel toggle or other handlers.
3. **Long dismiss reasons break badge layout** — Reasons longer than 30 characters are truncated in the HTML but lack CSS overflow protection, potentially causing layout issues.

## Design

### 1. Overview task click navigates to Tasks tab

**File:** `review.mjs` (`renderOverview` section)

- Add click handler to each task card in the "Needs Attention" section
- On click: set `currentTab = "tasks"`, set `currentTaskIdx` to the matching task index, update tab UI highlighting, call `renderContent()`
- Add `cursor: pointer` style to signal clickability
- Reuse existing tab-switch and task-selection logic — no new routes or components

### 2. Fix dismiss custom input closing bug

**File:** `review.mjs` (event binding section)

- Add `stopPropagation()` on click events within the dismiss panel (input, submit button, reason buttons) to prevent bubbling to parent handlers that might toggle the panel closed
- Ensure the input remains focused and the panel stays open while the user is interacting with it

### 3. Long dismiss reason display optimization

**File:** `task-detail.mjs` (badge rendering), `styles.css`

- Truncate reason text in badge to 20 characters (reduced from 30)
- Add `title` attribute with full reason text for native browser tooltip on hover
- Add CSS: `max-width`, `overflow: hidden`, `text-overflow: ellipsis`, `white-space: nowrap` on the dismiss reason badge to prevent overflow

## Scope

- Only touches `review.mjs`, `task-detail.mjs`, and `styles.css`
- No new files, no API changes, no route changes
