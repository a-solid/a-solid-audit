# Finding Status Rename + Auto-Acknowledge Design

**Date:** 2026-05-26
**Status:** Approved

## Problem

Current finding statuses use `"confirmed"` and `"deferred"` — confusing terminology for an audit context. There's no explicit `"pending"` state (it's `null`). Low-severity findings require manual review despite being low-risk.

## Solution

Rename status values to audit-appropriate terms, add explicit `"pending"`, and auto-acknowledge info/low findings when a task is first viewed.

## Status Model

| Old value | New value | Meaning | Visual |
|-----------|-----------|---------|--------|
| `null` | `"pending"` | Awaiting human review | No badge, default card style |
| `"confirmed"` | `"acknowledged"` | Reviewer has seen and acknowledged | Green checkmark badge |
| `"deferred"` | `"deferred"` | Postponed/dismissed with reason | Amber X badge with reason text |

**No backward compatibility.** All old `"confirmed"` values in existing YAML notes become invalid — the UI simply won't match them. This is acceptable for in-development software.

## Auto-Acknowledge

When the user selects a task in the Tasks tab, before rendering:

1. Read the task's findings and their current statuses from notes.
2. For each finding where severity is `"info"` or `"low"` AND status is falsy (null/undefined/empty):
   - Set status to `"acknowledged"`.
3. If any findings were changed, call `updateTaskNote` API to persist.
4. Update local `notes` state.
5. Render — those findings now show as Acknowledged.

This only runs once per task — after the first view, the findings have a persisted status and won't be auto-acknowledged again.

## UI Text Changes

| Location | Old text | New text |
|----------|----------|----------|
| Finding card badge | "Confirmed" | "Acknowledged" |
| Finding card badge | "Dismissed" | "Deferred" |
| Toast on confirm | "Confirmed: ..." | "Acknowledged: ..." |
| Toast on dismiss | "Dismissed: ..." | "Deferred: ..." |
| Batch confirm button | "Confirm N selected" | "Acknowledge N selected" |
| Batch confirm toast | "N finding(s) confirmed" | "N finding(s) acknowledged" |
| Overview stats labels | "Confirmed" / "Dismissed" / "Unreviewed" | "Acknowledged" / "Deferred" / "Pending" |
| Summary stats | Same as above | Same as above |

## Files Changed

| File | Change |
|------|--------|
| `server/handlers/notes.mjs` | Add `"acknowledged"` to validation whitelist; change default finding status from `"confirmed"` to `"pending"` |
| `components/task-detail.mjs` | Update status comparisons (`"confirmed"` → `"acknowledged"`, `null` → `"pending"`); update badge text |
| `views/review.mjs` | Update all status strings; add auto-ack logic in `renderTasksTab`; update toast text |
| `views/summary.mjs` | Update status comparisons and stat labels |
