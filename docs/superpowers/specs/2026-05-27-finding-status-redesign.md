# Finding Status Redesign

Date: 2026-05-27

## Problem

Current finding actions (Acknowledge / Defer) have ambiguous semantics:
- "Minor issue, don't want to fix" — should I Ack or Defer?
- "Intentional design choice" — neither action fits
- "AI got this wrong" — no way to express false positive
- The word "Defer" implies "will fix later" but the system doesn't track when

## New Status Values

Replace `acknowledged` / `deferred` with three statuses:

| Status | Value | Meaning | Reason |
|---|---|---|---|
| **Need Fix** | `need-fix` | Problem confirmed, requires a fix | Optional note |
| **Won't Fix** | `wont-fix` | Known issue, accepting current state | Recommended: pick a reason |
| **Not an Issue** | `not-an-issue` | AI judgment is incorrect, not a real problem | Recommended: pick a reason |

## Reason Presets

**Won't Fix:**
- "Intentional design"
- "Acceptable risk"
- "Low priority"
- "Already addressed"
- Custom input

**Not an Issue:**
- "AI misunderstood context"
- "Not applicable"
- "Already handled elsewhere"
- "Feature, not a bug"
- Custom input

**Need Fix:** optional text note, no preset panel.

## UI Interaction

### Finding Card Actions (unreviewed state)

Replace current two-button action bar with three buttons:

```
[ Need Fix ]  [ Won't Fix ]  [ Not an Issue ]
```

- **Need Fix** — clicks immediately, marks finding. Optionally shows a `+ note` link to add a text note.
- **Won't Fix** — opens reason panel with presets + custom input. Submit confirms the action.
- **Not an Issue** — same pattern as Won't Fix, different presets.

### Finding Card Badges (reviewed state)

Replace current `Acknowledged` / `Deferred` badges:

| Status | Badge | Color |
|---|---|---|
| Need Fix | `Need Fix` | accent/green |
| Won't Fix | `Won't Fix: <reason>` | warning/amber |
| Not an Issue | `Not an Issue: <reason>` | info/blue |

Revert button (`undo2` icon) stays the same.

### Task Sidebar Progress (review.mjs)

Current: `ack` / `defer` / `pending` segmented bar.

New: `need-fix` / `wont-fix` / `not-an-issue` / `pending` — 4 segments.

Legend text:
- `X need fix` (accent color)
- `X won't fix` (warning color)
- `X not an issue` (info color)
- `X pending` (muted)

Human review status badge logic unchanged — still computes Unreviewed / In Progress / Complete based on total reviewed vs total findings.

## Backend Changes

### review-notes.yaml

`findings[].status` allowed values change from `acknowledged | deferred` to `need-fix | wont-fix | not-an-issue`.

`findings[].reason` stays as `string` — no structural change.

### notes.mjs handler

`POST /api/sessions/:id/notes` validation: update allowed status values from `["acknowledged", "deferred", "pending", ""]` to `["need-fix", "wont-fix", "not-an-issue", "pending", ""]`.

### Auto-acknowledge low severity

`review.mjs` `autoAcknowledgeLowSeverity()` currently marks low-severity findings as `acknowledged`. Change to `wont-fix` with reason `"Auto-marked: low severity"`.

## Files to Change

| File | Change |
|---|---|
| `scripts/public/js/components/task-detail.mjs` | 3-button action bar, new badges, new reason panels |
| `scripts/public/js/views/review.mjs` | Sidebar progress segments, auto-ack logic, status string references |
| `scripts/public/js/views/summary.mjs` | Stat cards (Acknowledged→Need Fix, Deferred→Won't Fix), progress bar segments |
| `scripts/public/styles.css` | New badge classes, reason panel styles for new action types |
| `scripts/server/handlers/notes.mjs` | Update allowed status values |
| `styles.css` (print section) | Update print badge classes |

## Summary Page Stat Cards

Replace:
- "Acknowledged" → "Need Fix" (with count)
- "Deferred" → "Won't Fix" (with count)
- "Pending" stays

Add: "Not an Issue" as 4th stat card.

Progress bar: 4 segments (need-fix / wont-fix / not-an-issue / pending).

## Migration

Existing `review-notes.yaml` files may contain `acknowledged` / `deferred` values. Two options:

1. **No migration** — old sessions keep old values, new sessions use new values. Front-end handles both old and new status strings.
2. **One-time migration** — on server start, scan existing notes and remap `acknowledged` → `wont-fix`, `deferred` → `need-fix`.

Recommendation: **Option 1**. The data is per-session and non-critical. Old sessions display with legacy badges, new sessions use the new system. Simpler and safer.
