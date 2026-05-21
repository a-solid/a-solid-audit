# Review Sign-off Rename + Prominence + Dedicated Print Window

Date: 2026-05-21

## Summary

Three improvements to the summary/sign-off page:
1. Rename "Review Summary" card to "Review Sign-off"
2. Make signed-off info (person, date) more visually prominent
3. Replace `window.print()` with a dedicated print-optimized window for clean PDF export

---

## 1. Card Rename

Change the card title from "Review Summary" to "Review Sign-off" in:
- The card heading in `summary.mjs`
- The page breadcrumb (keep "Summary" as the breadcrumb label — it describes the page, not the card)
- The `renderSummaryCard` function and its wrapper div ID stays `review-summary-card` for now (cosmetic change only)

---

## 2. Sign-off Prominence

Current signed state uses `text-sm text-muted` for the sign-off line — too subtle.

Changes to the signed state rendering:
- Checkmark avatar: increase from 22px to 28px, keep green background
- Name/role/date text: change from `text-sm text-muted` to `text-sm font-medium` with `color:var(--text-primary)`
- Add a small label prefix "Signed off" before the name, using `text-xs text-muted` so it reads: "Signed off · Zhang San · Tech Lead · 5/21/2026"
- Undo link stays as-is (right-aligned, muted, underline)

---

## 3. Dedicated Print Window

### Problem

`window.print()` on the live SPA page produces awkward PDFs:
- Dark mode variables leak into print despite `@media print` overrides
- Glassmorphism, shadows, and interactive elements require extensive `no-print`/`print-only` hacks
- The SPA layout (sidebar, header, nav) isn't meaningful in a PDF

### Solution

When the user clicks "Export PDF", open a new browser window that renders a purpose-built, print-optimized HTML page. The page fetches the same data from the API and renders it in a clean, linear layout designed exclusively for print.

### Print Window Architecture

**New file: `skills/audit/scripts/public/print.html`**
A standalone HTML page (not part of the SPA router). It:
- Loads its own minimal CSS (inline `<style>`, no Tailwind dependency)
- Reads `sessionId` from the URL query string (`?session=abc`)
- Fetches tasks and notes from the API (`/api/sessions/:id/tasks`, `/api/sessions/:id/notes`)
- Renders: stats summary, severity breakdown, task details with findings, sign-off info
- Auto-triggers `window.print()` after DOM is ready

**Modified: `skills/audit/scripts/public/js/views/summary.mjs`**
The "Export PDF" button handler changes from `window.print()` to:
```js
window.open(`print.html?session=${sessionId}`, '_blank');
```

### Print Page Layout

The print page has this structure:

```
┌────────────────────────────────────────────┐
│  Code Review Report                        │
│  Session: {sessionName}                    │
│  Generated: {date}                         │
├────────────────────────────────────────────┤
│  Stats row: Total | Confirmed | Action     │
│  Required | Deferred | Unreviewed          │
├────────────────────────────────────────────┤
│  Severity breakdown (horizontal bars)      │
├────────────────────────────────────────────┤
│  ┌─ Task: auth-module ──────────────────┐  │
│  │  Score: 7/10                         │  │
│  │  Summary text...                     │  │
│  │                                      │  │
│  │  Finding 1 (critical) [Confirmed]    │  │
│  │    Description...                    │  │
│  │  Finding 2 (major) [Deferred]        │  │
│  │    Description...                    │  │
│  │                                      │  │
│  │  Positives: ...                      │  │
│  │  Gaps: ...                           │  │
│  └──────────────────────────────────────┘  │
│                                            │
│  ┌─ Review Sign-off ────────────────────┐  │
│  │  Comments: {notes text}              │  │
│  │  ✓ Signed off: Zhang San · Lead      │  │
│  │    Date: 5/21/2026                   │  │
│  │    (or "Not signed off")             │  │
│  └──────────────────────────────────────┘  │
└────────────────────────────────────────────┘
```

### Print Page Styling

The print page uses a self-contained `<style>` block with:
- White background, dark text, system font stack
- No CSS custom properties, no dark mode
- Thin gray borders for cards
- Severity colors for badges and bar fills
- `page-break-inside: avoid` on task cards
- `-webkit-print-color-adjust: exact` for accurate badge colors
- Max-width 800px, centered, generous padding
- `@media print` block that hides the "Loading..." state and removes the outer padding/margin

### Server Route

Add a static file route for `print.html` in the server's static file serving. Since the server already serves files from `skills/audit/scripts/public/`, no route changes are needed — `print.html` will be served automatically like other static files.

### Cleanup

After the dedicated print window is working:
- Keep the existing `@media print` CSS block in `styles.css` — it still provides a decent fallback if someone uses Ctrl+P on the main page
- Remove `print-only` class usage from `summary.mjs` (the "Not signed off" line) since the print page handles this independently
- Keep `no-print` classes on interactive elements (buttons, tabs, header) for Ctrl+P fallback

---

## Files

- **Create:** `skills/audit/scripts/public/print.html` — standalone print-optimized page
- **Modify:** `skills/audit/scripts/public/js/views/summary.mjs` — rename card title, improve sign-off prominence, change Export PDF handler to open new window
- **Keep:** `skills/audit/scripts/public/styles.css` — existing `@media print` block stays as fallback
- **Keep:** `skills/audit/scripts/public/js/components/print-task-detail.mjs` — reuse the rendering logic by extracting it, or duplicate the rendering in `print.html` (inline JS)
