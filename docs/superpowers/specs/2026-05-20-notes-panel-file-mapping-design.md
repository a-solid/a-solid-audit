# Floating Notes Panel + File Mapping Accordion

**Date:** 2026-05-20

## 1. Floating Notes Panel

### Problem
Users cannot add notes to `review-context.md` during the review process. The wizard only allows context input before review starts.

### Solution
A global floating button + expandable panel accessible from any view. Shows the full `review-context.md` content with a textarea to append notes. Auto-saves via existing `PUT /api/sessions/:id/review-context` endpoint.

### Design
- **Floating button**: Fixed bottom-right corner, 44x44px, circular, green accent, message-square icon
- **Panel**: Slides up from the button when clicked, ~400px wide, ~500px max-height
- **Content**: Read-only display of current `review-context.md` content (scrollable), plus a textarea at bottom for new notes
- **Save**: "Add Note" button appends to the Review Notes section via `PUT /api/sessions/:id/review-context`
- **Session awareness**: Panel reads the session ID from the current URL hash (`#/progress/:id`, `#/review/:id`, etc.). Hidden when no session ID is in the URL (e.g., Home view)

### Files
- Create: `skills/audit/scripts/public/js/components/notes-panel.mjs` — Panel component
- Modify: `skills/audit/scripts/public/js/app.mjs` — Mount floating button globally, detect session ID from URL
- Modify: `skills/audit/scripts/public/styles.css` — Add floating panel styles

---

## 2. File Mapping Accordion

### Problem
Current file mapping in wizard Step 3 uses a select dropdown to choose a story, then a separate "Save Mappings" button. For multiple stories this is clunky — users must switch one at a time.

### Solution
Replace the select+button pattern with an accordion. Each story is a clickable header. Clicking expands to show the file tree for that story. File selections are saved individually per story on change.

### Design
- Stories listed as accordion headers (click to expand/collapse)
- Each expanded section shows the file tree with checkboxes
- Checkbox changes auto-save via `api.mapStories()` — no separate save button needed
- Only one story expanded at a time (standard accordion behavior)
- Visual indicator: dot or badge showing how many files are mapped per story

### Files
- Modify: `skills/audit/scripts/public/js/views/wizard.mjs` — Replace `renderStep3()` file mapping section
- Modify: `skills/audit/scripts/public/styles.css` — Add accordion styles
