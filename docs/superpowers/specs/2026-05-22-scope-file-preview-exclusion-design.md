# Scope File Preview & Exclusion

Date: 2026-05-22

## Overview

Add a directory tree file preview to the Scope step (Step 2) of the audit wizard. After the user selects a scope method (Uncommitted/Commits/Branch), the file list loads automatically. Users can uncheck files or folders to exclude them from the review. When confirmed, only the checked files generate code tasks.

---

## Current Flow

1. Step 1: Choose review type (Code Only / Code + Story)
2. Step 2: Select scope method, configure ref, click "Confirm Scope" → server generates tasks for all diff files
3. Step 3 (or 4): Stories / Ready

## New Flow

1. Step 1: Choose review type (unchanged)
2. Step 2: Select scope method → **file preview tree loads automatically** → user unchecks files to exclude → click "Confirm Scope" with exclude list → server generates tasks only for included files
3. Step 3 (or 4): Stories / Ready (unchanged)

---

## Frontend Changes

### Step 2 UI

The scope tab bar and configuration area (Uncommitted banner, Commits dropdowns, Branch dropdowns) stay at the top. Below the configuration, a file preview section loads automatically.

**File Preview Section:**
- Header row: "Select All" checkbox + file count summary (e.g. "12 files selected")
- Directory tree with collapsible folders
- All files and folders default to checked (opt-in — uncheck to exclude)
- Checking/unchecking a folder recursively toggles all children
- Folder checkbox: indeterminate state when some but not all children are checked
- Each file shows: filename + change stats (`+N −M`)
- Loading state: spinner while fetching
- Error state: error message if preview fails

**Auto-load triggers:**
- **Uncommitted tab:** Load immediately when tab is active (no user input needed)
- **Commits tab:** Load after both commit dropdowns have values, re-load when either changes
- **Branch tab:** Load after both branch dropdowns have values, re-load when either changes
- **Tab switch:** Clear tree and re-load for the new scope method

**"Confirm Scope" button:**
- Collects all unchecked file paths into an `excludeFiles` array
- Sends `{ method, ref, excludeFiles }` to the scope API
- If all files are unchecked, show a warning toast ("No files selected") and don't submit

### New Component: `scope-file-tree.mjs`

A directory tree component for the scope step. Key features:
- Takes a flat array of `{ path, additions, deletions }` and builds a tree structure
- Renders collapsible folders with expand/collapse toggle
- Checkbox on each file and folder node
- Folder checkbox state: checked = all children checked, unchecked = all children unchecked, indeterminate = some children checked
- Each file row: checkbox + filename (mono font) + change stats (`+N −M`)
- Exposes `getExcludedFiles()` → returns array of unchecked file paths
- Exposes `getSelectedCount()` → returns `{ selected, total }`

### API Client Changes (`api.mjs`)

New method:
```javascript
previewScope: (method, ref) =>
  request("POST", "/api/git/preview", { method, ref }),
```

Modified method:
```javascript
setScope: (id, method, ref, excludeFiles) =>
  request("POST", `/api/sessions/${encodeURIComponent(id)}/scope`, { method, ref, excludeFiles }),
```

---

## Server Changes

### New API: `POST /api/git/preview`

Returns the file list with change stats for a given scope, without creating any tasks.

**Request:** `{ method: "uncommitted"|"commits"|"branch", ref: "..." }`
**Response:**
```json
{
  "files": [
    { "path": "src/api/auth.mjs", "additions": 45, "deletions": 12 },
    { "path": "src/api/user.mjs", "additions": 23, "deletions": 8 }
  ]
}
```

**Handler logic:**
1. Validate `method` and `ref` (same rules as scope endpoint)
2. Run `runGitDiff(method, ref, projectDir)`
3. Parse diff with `parseDiffByFile(diff)` — returns change stats
4. Return the file array

### Modified API: `POST /api/sessions/:id/scope`

Adds optional `excludeFiles` field.

**Request:** `{ method, ref, excludeFiles?: string[] }`

**Handler logic:**
1. Validate as before
2. Pass `excludeFiles` to `setScope()` in mapping.mjs

### `git.mjs` Changes

Modify `parseDiffByFile(diff)` to return change stats:

**Current return:** `{ filePath: diffText }`
**New return:** `{ filePath: { diff: diffText, additions: N, deletions: M } }`

Counting logic: for each file's diff, count lines starting with `+` (excluding `+++` headers) as additions, lines starting with `-` (excluding `---` headers) as deletions.

Update `setScope()` in mapping.mjs and any other callers to handle the new return format (access `.diff` instead of the raw string).

### `mapping.mjs` Changes

`setScope()` signature change:
```
setScope(projectDir, reportsDir, sessionId, method, ref, excludeFiles = [])
```

Logic:
1. Run diff and parse as before
2. Filter out files in `excludeFiles` before generating tasks
3. Only create task YAMLs for included files
4. Access diff text via `.diff` property from the new parseDiffByFile format

---

## Files

| File | Action | Purpose |
|------|--------|---------|
| `skills/audit/scripts/public/js/views/wizard.mjs` | Modify | Integrate file preview tree into Step 2 |
| `skills/audit/scripts/public/js/components/scope-file-tree.mjs` | Create | Directory tree component with checkboxes and change stats |
| `skills/audit/scripts/public/js/api.mjs` | Modify | Add previewScope, update setScope |
| `skills/audit/scripts/public/styles.css` | Modify | Add scope file tree styles |
| `skills/audit/scripts/server/router.mjs` | Modify | Register `POST /api/git/preview` route |
| `skills/audit/scripts/server/handlers/audit.mjs` | Modify | Add preview handler, update scope handler |
| `skills/audit/scripts/lib/git.mjs` | Modify | parseDiffByFile returns change stats |
| `skills/audit/scripts/lib/mapping.mjs` | Modify | setScope supports excludeFiles |

---

## Implementation Notes

- The scope file tree is a new component separate from the existing `file-tree.mjs` (which is a simple flat checkbox list used for story mapping). The new component adds folder hierarchy, expand/collapse, and indeterminate checkbox states.
- The `parseDiffByFile` return format change affects `mapping.mjs` — its call site needs updating to extract `.diff` from the new object format.
- `excludeFiles` is optional — if omitted or empty, all files are included (backward compatible).
- All UI changes must use the `ui-ux-pro-max` skill.
- No changes to the session state machine or the story/review flows.
