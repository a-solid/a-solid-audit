# UI Polish, JIRA Integration & Sign-off Improvements

Date: 2026-05-21

## Summary

Six targeted UI improvements to the A-Solid Audit wizard: expand defaults, JIRA story integration, badge alignment, sign-off redesign, FAB panel rename, and Chinese-to-English text migration.

---

## 1. Review Context Default Expanded

**Current:** Review Context panel in Step 4 defaults to collapsed (`contextExpanded = false`).

**Change:** Default `contextExpanded` to `true`. The `#context-panel` initial inline style becomes `display:block` and the chevron starts rotated (expanded state). Saved state in localStorage still overrides this on subsequent visits.

**Files:** `wizard.mjs` (~line 14, ~line 465, ~line 494)

---

## 2. Auto-Expand New Story

**Current:** After adding a story, all accordion items are collapsed (state resets on re-render).

**Change:** After `api.createStory()` succeeds, set `expandedIndex` to the new story's index before re-rendering. The accordion renders with the new story already expanded, so the user can immediately start mapping files.

**Files:** `wizard.mjs` (~line 310, in the createStory callback)

---

## 3. JIRA Story Integration

**Current:** Backend has a JIRA provider (`lib/providers/jira.mjs`) and API endpoint (`POST /api/providers/:name/fetch`), but the frontend story source dropdown only shows "Manual Input".

**Change:**

1. On Step 3 load, call `api.listProviders()`. If the JIRA provider is available (executable + env configured), add "JIRA" as a second dropdown option.
2. When "JIRA" is selected, show a single JIRA key input (e.g. `PROJ-123`) and a "Fetch" button. Hide the manual input form.
3. On "Fetch", call `api.fetchFromProvider('jira', [key])`. The response returns `{ id, name, description, acceptance }`.
4. Auto-fill the existing story form fields (Story Name, Description, Acceptance Criteria) with the fetched data. Show the form with all fields editable so the user can review and adjust before saving.
5. Save uses the existing `api.createStory()` flow. No new backend endpoints needed.

**Files:** `wizard.mjs` (Step 3 render area, ~lines 259-311), `api.mjs` (already has `listProviders` and `fetchFromProvider`)

---

## 4. File Mapping Badge Right-Aligned

**Current:** In the accordion header, the file count badge flows directly after the story name span. Different name lengths push badges to different positions.

**Change:** Add `flex-grow: 1` to the story name `<span>` so it fills available space between the clipboard icon and the badge. The badge naturally aligns to a consistent right position across all accordion items, regardless of name length.

**Files:** `wizard.mjs` (~line 336, add inline style or class `style="flex-grow:1"`)

---

## 5. Summary & Sign-off Page Redesign

### Layout Reorder

Move the Sign-off card to between Overall Notes and Task Details. New order:

1. Stat cards (Total Findings, Confirmed, Action Required, Deferred, Unreviewed)
2. Findings by Severity chart
3. Overall Notes (textarea + Save Notes button)
4. **Sign-off** (moved here)
5. Task Details

### Sign-off Interaction

**Before sign-off:**
- Card with neutral border. Name input (required) + Role input (optional) in 2-column grid.
- Green "Sign Off" button. Inline validation: name required, red border + error message if empty.

**After sign-off:**
- Card transforms: green border (all sides) with 3px green left accent stripe.
- Green circle checkmark avatar appears with "Signed off" text.
- Subtitle line: date, name, role (e.g. "May 21, 2026 · Zhang San · Tech Lead").
- Inputs become read-only and visually muted (reduced opacity, no pointer events).
- "Undo" link in top-right corner.

**Undo action:**
- Clears the sign-off object via `api.updateSummary()`.
- Restores editable inputs, pre-filled with previous name/role values.
- Card returns to neutral border style.

**Files:** `summary.mjs` (reorder HTML blocks ~lines 112-152, rewrite sign-off conditional rendering, add undo handler)

---

## 6. FAB Panel Rename + Chinese Text Migration

### FAB Panel

**Current:** Panel title is "Review Notes", textarea placeholder is "Add review context, key concerns, known issues...".

**Change:**
- Title: **"Review Context"**
- Add subtitle below title: "This content will be referenced during code review as context."
- Placeholder: keep as-is (already English).

### Chinese-to-English

**Current:** One Chinese placeholder in `wizard.mjs` line 465: `项目背景、关键需求、关注领域、已知问题...`

**Change:** Replace with `"Project background, key requirements, areas of concern, known issues..."`

**Files:** `notes-panel.mjs` (~lines 15-20, title + add subtitle), `wizard.mjs` (~line 465, placeholder text)
