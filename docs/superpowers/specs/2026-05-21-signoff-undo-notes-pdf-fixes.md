# Sign-off Undo Fix, Notes Rename & PDF FAB Hide

Date: 2026-05-21

## Summary

Three targeted fixes: sign-off undo bug, Overall Notes rename, and PDF export FAB visibility.

---

## 1. Sign-off Undo Bug Fix

**Bug:** The undo button sends `{ signoff: null }` via `api.updateSummary()`, but the server handler uses `if (body.signoff)` which treats `null` as falsy — the assignment is silently skipped.

**Fix:** In `skills/audit/scripts/server/handlers/notes.mjs` line 114, change:

```js
if (body.signoff) Object.assign(notes.summary.signoff, body.signoff);
```

to:

```js
if (body.signoff !== undefined) {
  if (body.signoff === null) {
    notes.summary.signoff = { name: "", role: "", date: "" };
  } else {
    Object.assign(notes.summary.signoff, body.signoff);
  }
}
```

No frontend changes needed — the undo handler already sends the correct payload.

---

## 2. Overall Notes → Comments

Rename "Overall Notes" heading to "Comments" in the Summary & Sign-off page.

**Files:** `skills/audit/scripts/public/js/views/summary.mjs` — change the section heading text from "Overall Notes" to "Comments".

Keep the section as its own card adjacent to Sign-off (no card merge).

---

## 3. PDF Export FAB Hide

The floating notes button and panel appear in PDF exports because they lack the `no-print` CSS class.

**Fix:** In `skills/audit/scripts/public/js/components/notes-panel.mjs`, add `no-print` class to both the FAB button and the panel div.

Change:
```html
<button id="notes-fab" class="notes-fab" ...>
<div id="notes-panel" class="notes-panel" ...>
```

to:
```html
<button id="notes-fab" class="notes-fab no-print" ...>
<div id="notes-panel" class="notes-panel no-print" ...>
```

The `no-print` class is already defined in `styles.css` with `display: none !important` inside `@media print`.
