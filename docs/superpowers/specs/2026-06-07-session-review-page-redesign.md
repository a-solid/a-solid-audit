# Session Review Page Redesign — Design Spec

## Problem

The current session review page (`#/review/:id`) has too much UI: overview tab with stats cards, severity bars, progress charts, a two-pane task sidebar + detail layout, and a separate summary page with sign-off. Since summary and sign-off now live at the round level, the session pages should focus on one thing: **triaging findings**.

## Solution

Replace the review page with a flat findings-centric list. Remove the summary page entirely. Low-severity findings (minor/info/low) are auto-dismissed. User only sees high/major/critical findings and marks each Need Fix or Won't Fix.

This is a **breaking change** — no backward compatibility.

## Changes

### Remove

- `#/summary/:id` route and `summary.mjs` view
- Overview tab (stats cards, severity bars, progress charts)
- Sign-off functionality
- Task sidebar + detail two-pane layout
- `print.html` (session-level PDF export)
- "Summary & Sign-off" button from review page header

### Keep

- Finding triage: Need Fix, Won't Fix, Not an Issue
- Keyboard shortcuts (j/k navigation, 1/2/3 for actions)
- Breadcrumb navigation with round context
- Auto-persist well-done findings

### New

- Flat list of high/major/critical findings across all tasks
- Compact progress indicator: "N need-fix · N won't fix · N done"
- Inline action buttons (no expand/collapse panels)
- Auto-dismiss banner for low-severity findings

## Page Layout

```
┌─────────────────────────────────────────┐
│ ← Back to Round     Session v1    ?     │
├─────────────────────────────────────────┤
│ 3 need-fix · 2 won't fix · 5 done      │  (compact bar)
├─────────────────────────────────────────┤
│                                         │
│ ┌─ CRITICAL ──────────────────────────┐ │
│ │ src/auth/login.ts:42                │ │
│ │ Race condition in concurrent access │ │
│ │ [Need Fix] [Won't Fix]              │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─ MAJOR ─────────────────────────────┐ │
│ │ src/api/route.ts:15                 │ │
│ │ Missing input validation on POST    │ │
│ │ ✓ Need Fix                          │ │  (triaged, muted)
│ └─────────────────────────────────────┘ │
│                                         │
│ ── 2 minor/info auto-dismissed         │
│                                         │
└─────────────────────────────────────────┘
```

### Finding Card

Each finding card shows:
- Severity badge (CRITICAL / MAJOR / HIGH)
- File path + line number
- Finding description
- Code snippet (if present, collapsible — collapsed by default)
- Suggestion (if present, shown below description)
- Action buttons: [Need Fix] [Won't Fix] [Not an Issue]
- When triaged: status shown with checkmark, card opacity reduced

### Won't Fix / Not an Issue Flow

Clicking Won't Fix or Not an Issue shows an inline reason picker (3 preset reasons + custom input), same as current implementation but inline within the card.

### Keyboard Shortcuts

- `j` / `↓` — next finding
- `k` / `↑` — previous finding
- `1` — Need Fix
- `2` — Won't Fix (opens reason picker)
- `3` — Not an Issue (opens reason picker)
- `Enter` — confirm reason (when picker open)
- `Escape` — close reason picker
- `?` — show shortcuts overlay

### Progress Indicator

A single compact bar at the top:
- Segmented: need-fix (red) | won't fix (amber) | not-an-issue (blue) | well-done (green) | pending (gray)
- Text: "3 need-fix · 2 won't fix · 5 done"

### Auto-dismiss Banner

Below the findings list, a muted line: "N minor/info findings auto-dismissed as Won't Fix"

### Empty State

If all findings are positive or no findings: "No action needed — all clear." with a checkmark icon.

### Completion

When all findings are triaged, show a subtle "All findings reviewed" message and the "Back to Round" button becomes more prominent.

## Files Changed

| File | Action |
|---|---|
| `js/views/review.mjs` | **Rewrite** — flat findings list, remove tabs/sidebar |
| `js/views/summary.mjs` | **Delete** |
| `js/app.mjs` | Remove summary route/import, remove progress auto-redirect to summary |
| `js/views/progress.mjs` | Redirect to review (not summary) on completion |
| `print.html` | **Delete** |
| `styles.css` | Add finding-card styles, remove unused summary/signoff styles |

## Navigation Flow

```
Review completes
  → Progress auto-redirects to #/review/:id
  → User sees flat findings list
  → Marks each finding
  → Clicks "Back to Round" → #/rounds/:roundId
  → Round detail shows re-review button if need-fix findings exist
```

## Non-Goals

- Migrating or preserving existing triage data
- Round-level PDF export (can be added later)
- Per-finding code diff viewing (users can open files directly)
