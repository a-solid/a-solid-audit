# Floating Notes Panel + File Mapping Accordion + Step-Line Fix

**Date:** 2026-05-20

## 1. Step-Line Visual Fix

### Problem
The wizard step indicator has a gap between the step dot and the connecting line. The line doesn't span dot-to-dot because each step is a `flex:1` div containing the dot + label side-by-side, and the line sits between those divs.

### Fix
Flatten the structure so dots and lines are siblings at the same flex level. Labels render in a separate row below.

```
Before: [ dot label | ---line--- | dot label | ---line--- | dot label ]
After:  [ dot ---line--- dot ---line--- dot ]
        [ label     label     label ]
```

### HTML Change
Replace the current `.step > .step-dot + .step-label` wrapping with a flat layout:
- Dots and lines are direct children of `.steps`, all `flex` siblings
- Lines use `flex:1` to fill space between dots
- Labels are in a second row below, aligned under their respective dots

### Files
- Modify: `skills/audit/scripts/public/js/views/wizard.mjs` — restructure `render()` step indicator HTML
- Modify: `skills/audit/scripts/public/styles.css` — update `.steps`, `.step`, `.step-line` CSS

---

## 2. Floating Notes Panel

### Problem
Users cannot edit `review-context.md` during the review process. The wizard only allows context input before review starts. The existing spec proposed a read-only display + append-only input, but the user wants direct full editing.

### Solution
A global floating button + expandable panel with a single editable textarea. Loads the full `review-context.md` content, user edits freely, save overwrites the entire content.

### Design
- **Floating button**: Fixed bottom-right corner, 44x44px, circular, green accent, message-square icon
- **Panel**: Slides up from the button when clicked, ~400px wide, ~450px max-height
- **Content**: Single textarea pre-filled with current `review-context.md` content
- **Save**: Auto-saves on blur via existing `PUT /api/sessions/:id/review-context` (overwrites full content)
- **Session awareness**: Reads session ID from URL hash (`#/progress/:id`, `#/review/:id`, etc.). Hidden when no session ID in URL
- **Close**: X button in panel header, or click outside

### Files
- Create: `skills/audit/scripts/public/js/components/notes-panel.mjs` — Panel component
- Modify: `skills/audit/scripts/public/js/app.mjs` — Mount floating button globally, detect session ID from URL
- Modify: `skills/audit/scripts/public/styles.css` — Add floating panel styles

---

## 3. File Mapping Accordion

### Problem
Current file mapping in wizard Step 3 uses a select dropdown to choose a story, then a separate "Save Mappings" button. For multiple stories this is clunky — users must switch one at a time.

### Solution
Replace the select+button pattern with an accordion. Each story is a clickable header. Clicking expands to show the file tree for that story. File selections auto-save individually per story on change.

### Design
- Stories listed as accordion headers (click to expand/collapse)
- Each expanded section shows the file tree with checkboxes
- Checkbox changes auto-save via `api.mapStories()` — no separate save button needed
- Only one story expanded at a time (standard accordion behavior)
- Badge on each header showing how many files are mapped
- Header shows story name + file count badge + chevron indicator

### Files
- Modify: `skills/audit/scripts/public/js/views/wizard.mjs` — Replace `renderStep3()` file mapping section with accordion
- Modify: `skills/audit/scripts/public/styles.css` — Add accordion styles
