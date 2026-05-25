# UI/UX Audit Fixes — Design Spec

**Date:** 2026-05-25
**Scope:** A-Solid Audit web application — all 6 views + shared components
**Approach:** Surgical fixes (Approach A) — each fix is isolated, minimal refactoring
**Batches:** Batch 1 (Critical + High, 13 items) first; Batch 2 (Medium, 7 items) follows

---

## Batch 1: Critical + High Priority

### Critical Fixes

#### #1 — Review overview confirmed/dismissed counts use wrong data source

**File:** `skills/audit/scripts/public/js/views/review.mjs`
**Lines:** 150-152
**Problem:** `renderOverview` reads `f.status` from `task.review.findings`, but finding status is stored in `notes.tasks[].findings[].status`. The confirmed/dismissed/unreviewed percentages always show 0%.

**Fix:** Cross-reference `notes` data the same way `summary.mjs:44-55` already does:
- Iterate `tasks`, for each task find the matching `noteTask` by file
- Count confirmed/dismissed from `noteTask.findings[].status`
- Derive unreviewed as `totalFindings - confirmed - deferred`

**No new files touched.**

---

#### #2 — Home page completed sessions need summary link

**File:** `skills/audit/scripts/public/js/views/home.mjs`
**Lines:** 117-131 (card click handlers)
**Problem:** Completed sessions only navigate to `#/review/{id}`. Users cannot reach summary/sign-off directly from home.

**Fix:** Change completed session card click to navigate to `#/summary/{id}` instead of `#/review/{id}`. Summary already has a "Review" button to navigate back. Add a secondary "Findings" link visible on completed cards that goes to `#/review/{id}`.

**Changes:**
- `home.mjs:121`: Change completed card click from `#/review` to `#/summary`
- Add a small link/button inside completed session cards for direct review access

---

#### #3 — Wizard navigation guard for unsaved changes

**File:** `skills/audit/scripts/public/js/views/wizard.mjs`
**Problem:** If a user is mid-wizard (step > 1 with data entered) and navigates away (breadcrumb click, browser back, tab close), all progress can be lost. New sessions (step 1) have no localStorage.

**Fix:**
- Track a `dirty` flag set to `true` when any form field changes (scope selection, story input, context text)
- Register `window.onbeforeunload` handler when `dirty && step > 1`
- Use `onNavigateCleanup` to remove the handler on normal navigation
- For existing sessions, localStorage already preserves state; ensure `save()` is called on every field change, not just on step transitions

**Changes:**
- Add `dirty` variable and set it on all form change events
- Add `beforeunload` handler registration/removal
- Ensure `save()` is called on input/change events for all form fields

---

#### #4 — Settings PLACEHOLDER constant + password save logic

**File:** `skills/audit/scripts/public/js/views/settings.mjs`
**Problem:** `PLACEHOLDER` constant is referenced but needs verification it's defined and has a clear sentinel value. On save, password fields containing the placeholder must be excluded from the payload.

**Fix:**
- Verify `PLACEHOLDER` is defined (e.g., `"••••••••"`) as a module-level constant in `settings.mjs`
- On save, check `value !== PLACEHOLDER` before including in payload (already partially done at line ~`jiraToken !== PLACEHOLDER ? jiraToken : undefined`)
- Add a `type="password"` toggle (eye icon) for each password field so users can verify their input

**Changes:**
- Ensure `const PLACEHOLDER = "••••••••"` at module top
- Verify all password field save logic excludes the placeholder
- Optional: add show/hide toggle for password fields

---

#### #5 — Remove auto-confirm, add explicit "Confirm All" button

**File:** `skills/audit/scripts/public/js/views/review.mjs`
**Lines:** 89-113, 315-325
**Problem:** When a user clicks a task in the sidebar, ALL unreviewed findings in the *previous* task get auto-confirmed silently. This is destructive and surprising — the user didn't ask to confirm anything.

**Fix:**
- Remove the `autoConfirmFindings` call from `handleTaskNav` (line 320)
- Add a "Confirm All" button in the task detail panel header, next to the score ring, that explicitly confirms all unreviewed findings for the current task
- The button should only appear when there are unreviewed findings
- On click, show a brief confirmation (inline, not modal) before proceeding

**Changes:**
- Remove `autoConfirmFindings` call from `handleTaskNav`
- Add "Confirm All Findings" button to `renderTaskDetail` output
- Wire the button to call the existing `autoConfirmFindings` logic but only for the current task with user intent

---

### High Priority Fixes

#### #6 — Mobile task picker for review page

**File:** `skills/audit/scripts/public/js/views/review.mjs`, `styles.css`
**Problem:** The 300px fixed sidebar becomes a cramped 280px stacked panel on mobile. No task context is visible in the detail panel when the sidebar is scrolled away.

**Fix:**
- On mobile (<768px), add a task navigation bar at the top of the detail panel showing: `[< Task Name (score) >]` with prev/next arrows
- This replaces reliance on the sidebar for task switching on small screens
- Add task name + score to the detail panel header so context is always visible
- Keep the sidebar as a scrollable list but reduce its mobile max-height to 200px

**Changes:**
- `review.mjs`: In `renderTasksTab`, add a mobile-only nav bar above the detail panel content with prev/next buttons and current task name
- `styles.css`: Add mobile task nav styles, hidden on desktop

---

#### #7 — Wizard type cards responsive

**File:** `skills/audit/scripts/public/js/views/wizard.mjs`
**Lines:** 275
**Problem:** `grid-cols-3` is always active, making cards too narrow on mobile.

**Fix:** Change from `grid-cols-3` to `grid-cols-1` with the existing `sm:grid-cols-3` breakpoint class.

**Changes:**
- `wizard.mjs:275`: Replace `grid-cols-3` with `grid-cols-1` and add `sm:grid-cols-3`
- Verify the CSS already has the `sm:grid-cols-3` media query (it does at `styles.css:1942`)

---

#### #8 — Cancel/abort button on progress scan

**File:** `skills/audit/scripts/public/js/views/progress.mjs`
**Problem:** No way to cancel a running or stuck scan. The only escape is navigating away.

**Fix:**
- Add a "Cancel" button (ghost, danger-tinted) next to the progress bar, visible only during active scanning
- On click, show a brief inline confirmation: "Cancel scan? Current progress will be lost. [Confirm]"
- Call `api.patchSession(sessionId, { status: 'created' })` to reset session state
- Navigate back to `#/wizard/{sessionId}` for re-configuration

**Changes:**
- `progress.mjs`: Add cancel button in the header area, wire to reset session and redirect

---

#### #9 — Smart toast duration by severity

**File:** `skills/audit/scripts/public/js/views/app.mjs`
**Lines:** showToast function
**Problem:** Fixed 4000ms auto-dismiss is too short for error messages with actionable info.

**Fix:**
- Error toasts: 6000ms
- Warning toasts: 5000ms
- Success toasts: 3000ms
- Pause auto-dismiss timer on mouse hover (resume on mouse leave)

**Changes:**
- `app.mjs`: Add duration map by type, implement hover-pause behavior

---

#### #10 — Breadcrumb includes session context

**File:** Multiple view files
**Problem:** Breadcrumbs like `Sessions / Review Findings` don't show which session. When multiple tabs are open, this is ambiguous.

**Fix:** Include the session ID (first 7 chars) in the breadcrumb:
- Progress: `Sessions / abc1234 / In Progress`
- Review: `Sessions / abc1234 / Review`
- Summary: `Sessions / abc1234 / Summary`
- Wizard: `Sessions / abc1234 / Configure` (or "New Audit" for new sessions)

**Changes:**
- Each view's `setBreadcrumb` call: add session ID segment
- Add a `truncate` style to the session ID breadcrumb item for consistency

---

#### #11 — Inline theme icon to avoid FOUC

**File:** `skills/audit/scripts/public/index.html`, `skills/audit/scripts/public/js/theme.mjs`
**Problem:** Theme toggle button is empty HTML; icon is injected by JS, causing a brief empty button on load.

**Fix:** Embed the default theme icon (moon for dark, sun for light) directly in the HTML button. The early theme detection script (`document.documentElement.dataset.theme=...`) runs before paint, so we can use it to set the correct icon.

**Changes:**
- `index.html:27`: Add inline SVG to the theme button based on a small script or default to moon icon
- `theme.mjs`: Swap icon on theme change as it already does

---

#### #12 — Per-API-call error boundaries

**File:** Multiple view files
**Problem:** Each view wraps all API calls in one `try/catch`. If one call fails (e.g., notes fails but tasks succeed), the entire view shows an error.

**Fix:** Wrap each API call individually. On partial failure, render the view with a degraded section showing "Failed to load [section]" with a retry button. Non-critical data (notes, review context) should never block the main view.

**Changes per view:**
- `review.mjs`: Fetch tasks first (critical). If notes fails, render without finding statuses. If reviewContext fails, omit the context card.
- `progress.mjs`: Fetch session first (critical). If tasks fails, show session status without task list.
- `summary.mjs`: Fetch tasks first. If notes fails, show task table without sign-off section.

---

#### #13 — Settings grid responsive

**File:** `skills/audit/scripts/public/js/views/settings.mjs`
**Problem:** DB section uses `grid-cols-5` — 5 equal columns for host/port/db/user/password. Cramped on tablets.

**Fix:** `grid-cols-1` base, `sm:grid-cols-2`, `md:grid-cols-5`. Same responsive pattern already used in the codebase.

**Changes:**
- `settings.mjs` DB section: Replace `grid-cols-5` with `grid-cols-1 sm:grid-cols-2 md:grid-cols-5`

---

## Batch 2: Medium Priority (Deferred)

These will be addressed in a follow-up PR after Batch 1 lands:

| # | Issue | File |
|---|-------|------|
| 14 | Mermaid diagram no error state on failure | task-detail.mjs |
| 15 | Notes FAB overlaps keyboard hint button | styles.css |
| 16 | Wizard back buttons don't warn on unsaved changes | wizard.mjs |
| 17 | Score ring minimum clamp at 0.3 is misleading | task-detail.mjs |
| 18 | Progress polling should use SSE instead of setTimeout recursion | progress.mjs |
| 19 | Empty state for review page when no tasks exist | review.mjs |
| 20 | print.html has no session validation | print.html + server |

---

## Files Modified (Batch 1)

| File | Changes |
|------|---------|
| `public/js/views/review.mjs` | #1, #5, #6, #10, #12 |
| `public/js/views/home.mjs` | #2, #10 |
| `public/js/views/wizard.mjs` | #3, #7 |
| `public/js/views/progress.mjs` | #8, #10, #12 |
| `public/js/views/settings.mjs` | #4, #13 |
| `public/js/views/summary.mjs` | #10, #12 |
| `public/js/views/app.mjs` | #9 |
| `public/index.html` | #11 |
| `public/js/theme.mjs` | #11 |
| `public/styles.css` | #6 (mobile task nav styles) |
