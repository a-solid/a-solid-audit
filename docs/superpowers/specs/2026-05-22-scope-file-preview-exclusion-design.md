# Scope File Preview & Exclusion

## Problem

When setting scope in the wizard, users click "Confirm Scope" blind — they cannot see which files will be included in the review. If a generated file or config change is in the diff, they must delete the task after the fact. There is no way to exclude files before task generation.

## Solution

Add a two-step scope flow: **Preview** → **Confirm**. After selecting scope type/ref, a "Preview" button runs a lightweight diff preview that returns the file list with change stats. Users can uncheck files they want to exclude, then click "Confirm Scope" to generate tasks only for selected files.

## UX Design (per ui-ux-pro-max guidelines)

### Interaction Flow

1. User selects scope type (Uncommitted / Commits / Branch) — unchanged
2. User clicks **"Preview"** button (replaces current "Confirm Scope" button)
3. Loading state: spinner + "Loading files..."
4. File list appears below the scope selector:
   - Summary bar: `12 files · +128 −45` with **Select All / Deselect All** links
   - File rows: checkbox + file path (mono, truncate with tooltip) + `+N −N` stats
   - All files checked by default
5. User unchecks unwanted files
6. User clicks **"Confirm Scope"** (appears after preview loads)
7. Frontend sends `excludeFiles` array to backend
8. Backend generates tasks only for non-excluded files

### UI Layout

```
┌─────────────────────────────────────────┐
│ Select Scope                            │
│ [Uncommitted] [Commits] [Branch]        │
│                                         │
│ (scope-specific controls)               │
│                                         │
│ ┌─ diff preview (after Preview click) ─┐│
│ │ 12 files · +128 −45                  ││
│ │ Select All  Deselect All             ││
│ │ ─────────────────────────────────────││
│ │ ☑ src/auth/LoginService.java  +45 −12││
│ │ ☑ src/config/AppConfig.java     +3  −0││
│ │ ☑ package-lock.json          +80  −33││
│ │ ☐ generated/Proto.java        +200 −0 ││
│ └──────────────────────────────────────┘│
│                                         │
│ [← Back]              [Confirm Scope →] │
└─────────────────────────────────────────┘
```

### UX Rules Applied

- **Progressive disclosure**: File list only appears after Preview, not overwhelming upfront
- **Touch targets**: Checkbox rows have ≥44px height (via padding)
- **Truncation strategy**: Long file paths truncate with ellipsis + `title` attribute for full path on hover
- **Loading feedback**: Spinner during preview load (per performance §3)
- **State clarity**: Preview button disabled during load, Confirm Scope disabled until preview loads
- **Form feedback**: Selected count updates in real-time as files are checked/unchecked

## API Changes

### New: `POST /api/sessions/:id/diff-preview`

Runs git diff but does NOT generate task YAMLs. Returns file list with stats.

**Request:** `{ method: string, ref: string }`
**Response:**
```json
{
  "files": [
    { "path": "src/auth/LoginService.java", "additions": 45, "deletions": 12, "language": "java" },
    { "path": "package-lock.json", "additions": 80, "deletions": 33, "language": "json" }
  ],
  "totalAdditions": 125,
  "totalDeletions": 45
}
```

### Modified: `POST /api/sessions/:id/scope`

Add optional `excludeFiles` field to the request body.

**Request:** `{ method: string, ref: string, excludeFiles?: string[] }`

Files in `excludeFiles` are skipped during task YAML generation.

## Code Changes

### Backend: `skills/audit/scripts/server/handlers/audit.mjs`

- Add `POST /api/sessions/:id/diff-preview` route handler
- Factor out diff computation from `setScope` into a shared `previewDiff` function in `lib/git.mjs`
- Modify scope route to accept and pass `excludeFiles` to `setScope`

### Backend: `skills/audit/scripts/lib/git.mjs`

- Export new `previewDiff(scopeType, scopeRef, projectDir)` function that runs git diff and returns `{ files, totalAdditions, totalDeletions }` using existing `parseDiffByFile`

### Backend: `skills/audit/scripts/lib/mapping.mjs`

- `setScope` accepts optional `excludeFiles` parameter
- Filter `filesMap` entries before generating task YAMLs

### Frontend: `skills/audit/scripts/public/js/api.mjs`

- Add `previewDiff(id, method, ref)` method
- Modify `setScope` to accept optional `excludeFiles`

### Frontend: `skills/audit/scripts/public/js/views/wizard.mjs`

- `renderStep2`: Replace "Confirm Scope" with "Preview" + file list + "Confirm Scope" two-step flow
- Add file list rendering with checkboxes, select all/deselect all
- Track excluded files in wizard state

### Frontend: `skills/audit/scripts/public/styles.css`

- Add styles for diff preview file list rows (checkbox + path + stats)
- Ensure row height ≥44px for touch targets

## What Doesn't Change

- Scope type selection (tabs: Uncommitted / Commits / Branch)
- Story collection (step 3)
- Review context (step 4)
- `renderFileTree` component (used in story mapping, not scope preview)
