# Remove Confirm All Button

## Problem

The "Confirm All" button in the findings section header adds unnecessary UI complexity. Findings confirmation is not mandatory — when the user clicks a bottom status button (Confirmed/Action Required/Deferred), any unmarked findings should be automatically handled.

## Design

Remove the "Confirm All" button entirely and integrate its behavior into the existing bottom status buttons.

## Changes

### 1. `report-template.html`

- **Delete** the "Confirm All" button HTML (~line 570-576)
- **Delete** `confirmingAll` and `confirmedAllAt` state initialization
- **Delete** `confirmAll()` method
- **Modify** `setTaskStatus()`: after setting `note.status`, iterate `note.findings` and set any finding with empty/unset status to `{ status: 'confirmed', reason: '' }`

### 2. `report-server.mjs`

- **Delete** `handleBatchConfirm()` function (~line 161-190)
- **Delete** `/api/notes/batch-confirm` route registration (~line 223)

## Behavior

- "Confirm All" button no longer appears in the findings section header
- Clicking any bottom status button (Confirmed/Action Required/Deferred) automatically sets unmarked findings to `confirmed`
- Previously manually-marked findings remain unchanged

## Scope

2 files, no new files, no new dependencies.
