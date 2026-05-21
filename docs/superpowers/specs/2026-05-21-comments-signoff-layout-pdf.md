# Comments & Sign-off Combined Layout + PDF Optimization

Date: 2026-05-21

## Summary

Merge Comments and Sign-off into a single "Review Summary" card. Optimize PDF export to show only essential content without interactive elements.

---

## 1. Combined Card Layout (Screen)

Merge the two separate "Comments" and "Sign-off" cards into one card titled "Review Summary".

Structure inside the card:

1. **Comments section** — "Comments" label + textarea + Save button
2. **Divider** — `<div style="border-top:1px solid var(--border);margin:12px 0;"></div>`
3. **Sign-off section** — "Sign-off" label + inputs (unsigned) or checkmark+status+Undo (signed)

The unsigned sign-off shows Name input (required) + Role input + "Sign Off" button.
The signed sign-off shows green checkmark avatar + "Signed off" text + date/name/role + Undo link + readonly inputs below.

### HTML Structure

```html
<div class="card mb-6" id="review-summary-card">
  <div class="font-medium mb-3">Review Summary</div>

  <!-- Comments -->
  <label>Comments</label>
  <textarea id="summary-notes" ...>...</textarea>
  <div class="flex justify-end mt-2">
    <button id="save-notes-btn" class="btn btn-sm no-print">Save</button>
  </div>

  <!-- Divider -->
  <div class="border-t my-3" style="border-color:var(--border)"></div>

  <!-- Sign-off (unsigned or signed) -->
  ...
</div>
```

---

## 2. PDF Export Optimization

When printing (`@media print`), strip all interactive elements and show only content.

### Hidden in PDF (`no-print` class on these elements)
- Save button
- Sign Off button
- Undo link
- Input error messages

### Textarea → plain text
The comments textarea gets print CSS that removes border, background, and makes it look like a plain paragraph:

```css
@media print {
  #summary-notes {
    border: none;
    background: transparent;
    resize: none;
    overflow: visible;
    -webkit-appearance: none;
  }
}
```

### Sign-off in PDF

**Unsigned state:** Show a single muted line "Not signed off".

**Signed state:** Show only the status line — hide the readonly input fields. Add a `print-only` class that is `display:none` on screen and `display:block` in print:

```css
.print-only { display: none; }
@media print { .print-only { display: block; } }
.screen-only { display: block; }
@media print { .screen-only { display: none; } }
```

The signed sign-off in PDF renders as:
- Checkmark icon + "Signed off on May 21, 2026 by Zhang San · Tech Lead"

The readonly name/role inputs get `screen-only` class (hidden in print).

### Card border in PDF
Remove the green border on the sign-off card in print — use the standard card print style (thin gray border, white background).

---

## Files

- `skills/audit/scripts/public/js/views/summary.mjs` — restructure HTML into combined card, add `no-print`/`screen-only`/`print-only` classes
- `skills/audit/scripts/public/styles.css` — add print CSS rules for textarea, sign-off card, and utility classes
