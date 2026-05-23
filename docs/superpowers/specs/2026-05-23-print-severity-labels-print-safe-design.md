# Print-Safe Severity Labels and Badges

## Problem

In `print.html`, elements that rely on `background: #f1f5f9` for visual distinction — `.sev-label`, `.badge`, `.badge-sev`, and `.sev-track` — lose their background when browsers strip it during PDF export. This makes severity labels appear as plain uncontained text, causing misalignment and loss of visual structure.

## Solution

Add borders to all gray-background elements. Borders are never stripped by browsers during print, so elements remain visually distinct regardless of background preservation.

## Changes

**File:** `skills/audit/scripts/public/print.html` (inline CSS only)

| Selector | Change |
|---|---|
| `.sev-label` (line 58) | Add `border: 1px solid #94a3b8` |
| `.badge` (line 88) | Add `border: 1px solid #94a3b8` |
| `.badge-sev` (line 93) | Add `border: 1px solid #94a3b8` |
| `.sev-track` (line 63) | Add `border: 1px solid #cbd5e1` |

Existing `background: #f1f5f9` is kept. When `print-color-adjust: exact` works, the original look is preserved. When it doesn't, borders provide the fallback.

No HTML or JS changes.
