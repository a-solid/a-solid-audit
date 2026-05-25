# Fix Project Scan Flow

**Date:** 2026-05-25
**Status:** Approved

## Problem

The project scan flow has four issues:

1. **No default projectDir** — The wizard Configure step leaves the project directory empty even though the server knows the project directory.
2. **Progress page dead-end** — After scan completes, the Progress page shows "Scan Complete" with nowhere to go. The scan/group/confirm flow should happen entirely in the wizard.
3. **project-tasks empty** — Because the Group step was never rendered in the wizard, `groups/confirm` was never called, so no task YAML files were generated.
4. **Missing scan trigger in Group step** — The wizard Group step polls for groups but never triggers the scan itself. The scan was triggered from the Progress page, creating a confusing navigation flow.

## Desired Flow

Wizard-only configuration matching the code/story pattern:

1. **Step 1: Review Type** — User selects "Project Scan" (shared step)
2. **Step 2: Configure** — User sets projectDir (defaulted to current project) and optional review context
3. **Step 3: Scan + Group** — Triggers scan on entry, shows scan progress, then shows grouping UI after scan completes. User confirms groups.
4. **Step 4: Ready** — Final confirmation, user navigates to Progress or types `start review`

The Progress page only handles the `reviewing` state for project sessions — no scan or group handling.

## Changes

### 1. Return projectDir in session creation response

**File:** `skills/audit/scripts/server/handlers/sessions.mjs`

In `POST /api/sessions`, the server resolves `projectDir` via `resolveProjectDir`. Include it in the response so the wizard can prefill it.

**Before:**
```javascript
jsonResponse(res, { id: result.id }, 201);
```

**After:**
```javascript
import { resolveProjectDir } from "../../lib/paths.mjs";
// ...in the handler:
const defaultProjectDir = resolveProjectDir();
jsonResponse(res, { id: result.id, projectDir: defaultProjectDir }, 201);
```

**Wizard change** (`wizard.mjs`): In `renderStep1`, capture the `projectDir` from the create response. In `renderProjectConfigure`, if the input is empty and `projectDir` is available, prefill it.

### 2. Group step triggers scan on entry

**File:** `skills/audit/scripts/public/js/views/wizard.mjs`

In `renderGroupStep()`, add scan trigger logic at the beginning:

- Check if graph-data already exists by calling `GET /api/sessions/:id/scan/status`
- If status is not `scanned` or `done`, call `POST /api/sessions/:id/scan` to trigger the scan
- Show scan progress UI (spinner + "Scanning project files..." + scan log)
- When scan completes (status becomes `scanned`), transition to the existing pending/grouping UI
- The rest of the function (poll for groups, show cards, confirm) stays the same

State flow within the step:
```
[Enter] → check scan status
  → not scanned? → trigger POST /scan → show progress → poll until scanned
  → scanned? → show "type group <id>" prompt → poll for groups.json
  → groups found? → show cards → confirm button
```

### 3. Remove scan/group handling from Progress page for project sessions

**File:** `skills/audit/scripts/public/js/views/progress.mjs`

Remove the block at line 145 that handles `created`/`scanning`/`scanned`/`grouping` states for project sessions. Also remove the auto-trigger at line 183 that starts the scan when a project session becomes `ready`.

The Progress page should only handle:
- `ready` state: show waiting message for review to start
- `reviewing` state: show task progress with polling
- `completed` state: redirect to findings

For project sessions in `created`/`scanning`/`scanned`/`grouping` states, show a message directing the user back to the wizard: "This session is still being configured. Go to the wizard to continue."

### 4. Wizard state restore for scanned sessions

**File:** `skills/audit/scripts/public/js/views/wizard.mjs`

When restoring wizard state from server (line ~185), if session is `project` type and status is `scanned` or `grouping`, jump to step 3 (Scan+Group) instead of step 2.

**Current:**
```javascript
} else if (session?.type === "project") {
  reviewType = "project";
  step = 2;
  save();
}
```

**After:**
```javascript
} else if (session?.type === "project") {
  reviewType = "project";
  if (["scanned", "grouping"].includes(session.status)) {
    step = 3;
  } else {
    step = 2;
  }
  save();
}
```

### 5. Project Ready step navigates to progress

**File:** `skills/audit/scripts/public/js/views/wizard.mjs`

The `renderProjectReady()` function's "Prepare Scan" button currently just shows a confirmation. Since scan+group is now handled in the previous step, the Ready step should:

- Show a summary of the configured groups (group count, file count)
- Have a "Start Review" button that clears localStorage and shows the confirmation with a link to Progress
- The confirmation message should say: "Session is prepared. Go to the Progress page or type `start review`."

## Files Changed

| File | Change |
|------|--------|
| `skills/audit/scripts/server/handlers/sessions.mjs` | Return `projectDir` in create response |
| `skills/audit/scripts/public/js/views/wizard.mjs` | Scan trigger in Group step; state restore for scanned; prefill projectDir; update Ready step |
| `skills/audit/scripts/public/js/views/progress.mjs` | Remove scan/group handling for project sessions |

## Not Changed

- `skills/audit/scripts/lib/project-scan.mjs` — No changes needed, functions work correctly
- `skills/audit/scripts/server/handlers/project-scan.mjs` — Endpoints work correctly, no changes needed
- `skills/audit/scripts/public/js/api.mjs` — All API methods already exist
- `skills/audit/scripts/public/styles.css` — No style changes needed
