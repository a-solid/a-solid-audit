# Smart Grouping for Project Scan

## Summary

Redesign the project scan chunking pipeline to use codegraph graph data + LLM-driven grouping. Replace the current per-entry-file chunking with a flow that collects dependency data via codegraph CLI, presents it to an LLM sub-agent for intelligent grouping, and lets users review/adjust groups in the web UI before generating review tasks.

## Motivation

The current `chunkFiles` creates one chunk per entry file (handler, controller, route). This produces:
- **Duplicate files across chunks** — shared services, DAOs, and models appear in multiple chunks
- **Incomplete context** — an OrderController chunk may not include all related controllers that share the same OrderService
- **Wasted AI review tokens** — the same service file gets reviewed multiple times
- **Inconsistent findings** — different reviews of the same file may produce contradictory conclusions

## Architecture

### Flow

```
Wizard Step 2: Configure
  → User enters project dir, sees CodeGraph status
  → Click "Next" triggers scan
  → Server runs scanProjectDir + codegraph data collection
  → Writes graph-data.json
  → Session status → "scanned"

Wizard Step 3: Group (NEW)
  → UI shows graph-data overview (file count, entry points, dependency summary)
  → UI shows "pending" state: "Go to AI terminal and type: group <session-id>"
  → User goes to Claude Code terminal, types command
  → Skill dispatches sub-agent with prompts/project-group.md
  → Sub-agent reads graph-data.json, analyzes dependencies, decides groups
  → Sub-agent writes groups.json
  → UI polls, detects groups.json, shows group cards
  → User can adjust groups in UI (move files between groups, merge, split)
  → User clicks "Confirm Groups"
  → Server generates project-tasks/*.yaml from confirmed groups
  → Session status → "ready"

Wizard Step 4: Ready (existing, unchanged)
  → Navigate to Progress page to start AI review
```

### Session Status Transitions

```
created → scanning → scanned → grouping → ready → reviewing → completed
                     ↑           ↑
                     │           └─ groups.json written by sub-agent
                     └─ graph-data.json written by server
```

New statuses: `scanned` (scan done, waiting for grouping), `grouping` (sub-agent is working).

## Changes

### 1. Backend: `skills/audit/scripts/lib/project-scan.mjs`

#### 1a. New function: `collectGraphData(projectDir, sid)`

Replaces the old `chunkFiles` + `setProjectScope` flow.

- Calls `codegraph query --json -k import -l 2000 "" -p "${projectDir}"` to get all import edges.
- Calls `codegraph query --json -k function -l 2000 "" -p "${projectDir}"` to get all function/method symbols.
- Builds the graph-data.json structure.
- Logs each CLI call and result count.
- Falls back gracefully if codegraph CLI is not available (returns files-only data without dependency info).

Output structure written to `.audit/<sid>/graph-data.json`:

```json
{
  "projectDir": "/path/to/project",
  "totalFiles": 36,
  "files": [
    {
      "path": "controllers/OrderController.java",
      "priority": "high",
      "entryType": "api"
    }
  ],
  "imports": {
    "controllers/OrderController.java": [
      "services/OrderService.java",
      "models/Order.java"
    ]
  },
  "symbols": {
    "services/OrderService.java": [
      {
        "name": "createOrder",
        "kind": "method",
        "signature": "(OrderDTO) -> Order"
      }
    ]
  },
  "entryFiles": [
    {
      "path": "controllers/OrderController.java",
      "type": "api"
    }
  ]
}
```

The `imports` map is source file → array of resolved import targets (relative paths, resolved against projectDir, non-node: only).

The `symbols` map is file → array of exported functions/methods with name, kind, and signature. This gives the LLM rich information to understand what each file does.

The `entryFiles` list comes from `classifyEntryType` (existing logic), filtering for non-"unknown" types.

#### 1b. Modify `setProjectScope` to support two modes

Add a `mode` parameter:

- `mode === "scan"` (new default for project sessions): runs `scanProjectDir` + `collectGraphData`, writes `graph-data.json`, sets status to `scanned`. Does NOT generate task yamls.
- `mode === "classic"`: runs the old `scanProjectDir` + `chunkFiles` + task generation flow (kept as fallback).

#### 1c. New function: `generateTasksFromGroups(reportsDir, sid)`

Reads `.audit/<sid>/groups.json`, validates it, and generates:
- `.audit/<sid>/project-tasks/group-001.yaml` etc.
- `.audit/<sid>/project-map.yaml` (updated with group info)
- Updates `index.yaml` with projectTasks list

### 2. Backend: `skills/audit/scripts/server/handlers/project-scan.mjs`

#### 2a. Modify `POST /api/sessions/:id/scan`

After scanning and writing `graph-data.json`, set session status to `scanned` (not `ready`).

#### 2b. New endpoint: `GET /api/sessions/:id/graph-data`

Returns the contents of `graph-data.json`. Used by the Group step UI to show the overview.

#### 2c. New endpoint: `GET /api/sessions/:id/groups`

Returns the contents of `groups.json` if it exists, or `{ status: "pending" }` if not yet created.

#### 2d. New endpoint: `PUT /api/sessions/:id/groups`

Accepts the user-adjusted groups and writes them to `groups.json`. Called when user clicks "Confirm Groups" in the UI after making adjustments.

#### 2e. New endpoint: `POST /api/sessions/:id/groups/confirm`

Reads `groups.json`, calls `generateTasksFromGroups`, sets session status to `ready`.

#### 2f. Modify `GET /api/sessions/:id/scan/status`

Add `scanned` and `grouping` status handling:

- `scanned`: `{ status: "scanned", totalFiles, entryFiles, hasGraph }`
- `grouping`: `{ status: "grouping", progress: "AI is analyzing dependencies..." }`

### 3. Backend: `skills/audit/scripts/lib/session.mjs`

Add `scanned` and `grouping` to `VALID_STATUSES`:

```javascript
const VALID_STATUSES = ["created", "scanned", "scoped", "ready", "scanning", "grouping", "reviewing", "completed"];
```

### 4. Frontend: `skills/audit/scripts/public/js/api.mjs`

Add new API methods:

```javascript
getGraphData: (id) =>
  request("GET", `/api/sessions/${encodeURIComponent(id)}/graph-data`),
getGroups: (id) =>
  request("GET", `/api/sessions/${encodeURIComponent(id)}/groups`),
updateGroups: (id, groups) =>
  request("PUT", `/api/sessions/${encodeURIComponent(id)}/groups`, { groups }),
confirmGroups: (id) =>
  request("POST", `/api/sessions/${encodeURIComponent(id)}/groups/confirm`),
```

### 5. Frontend: `skills/audit/scripts/public/js/views/wizard.mjs`

#### 5a. Step labels change for project type

From: `["Review Type", "Configure", "Ready"]`
To: `["Review Type", "Configure", "Group", "Ready"]`

#### 5b. New function: `renderGroupStep()`

Group step UI:

**Pending state** (groups.json not yet written):
```
┌─────────────────────────────────────────────────┐
│  Scan Complete                                    │
│  36 files found, 8 entry points                   │
│                                                   │
│  ┌──────────────────────────────────────────┐     │
│  │  Entry Points                            │     │
│  │  • OrderController.java (api)            │     │
│  │  • OrderAdminController.java (api)       │     │
│  │  • PaymentController.java (api)          │     │
│  │  • ... 5 more                            │     │
│  └──────────────────────────────────────────┘     │
│                                                   │
│  Go to your AI terminal and type:                 │
│  ┌──────────────────────────────────────────┐     │
│  │ group <session-id>                       │     │
│  └──────────────────────────────────────────┘     │
│                                                   │
│  [Spinner] Waiting for grouping...                │
└─────────────────────────────────────────────────┘
```

The UI polls `GET /api/sessions/:id/groups` every 3 seconds until groups appear.

**Groups loaded state**:
```
┌─────────────────────────────────────────────────┐
│  Groups Generated                                 │
│                                                   │
│  ┌──────────────────────────────────────────┐     │
│  │ 📦 Order Management (6 files)            │     │
│  │ OrderController, OrderAdminController,   │     │
│  │ OrderService, Order, OrderDAO, AuditLog   │     │
│  │ "Shared OrderService — grouped as        │     │
│  │  order management module"                │     │
│  └──────────────────────────────────────────┘     │
│                                                   │
│  ┌──────────────────────────────────────────┐     │
│  │ 📦 Payment Processing (4 files)          │     │
│  │ PaymentController, PaymentService, ...   │     │
│  └──────────────────────────────────────────┘     │
│                                                   │
│            [Confirm Groups]                       │
└─────────────────────────────────────────────────┘
```

Each group card shows:
- Group name (assigned by LLM)
- File count
- Entry files highlighted
- LLM's rationale (collapsible)
- Expand to see all files with checkboxes (user can move files)

**Adjustment mode**: Clicking a group card expands it to show files. User can uncheck files to remove them, or drag files between groups. Changes saved via `PUT /api/sessions/:id/groups`.

**Confirm button**: Calls `POST /api/sessions/:id/groups/confirm`, then navigates to the Ready step.

### 6. Frontend: `skills/audit/scripts/public/styles.css`

Add styles for:
- Group card (`.group-card`) with collapsible body
- Entry file highlight (`.entry-file-badge`)
- Rationale text (`.group-rationale`)
- Group file list with checkboxes (reuse existing `.scope-tree` patterns)

### 7. Prompt: `skills/audit/prompts/project-group.md`

New prompt file for the grouping sub-agent. It instructs the agent to:

1. Read `.audit/<session-id>/graph-data.json`
2. Read `.audit/<session-id>/review-context.md` for user-provided context
3. Analyze the dependency graph
4. Identify logical modules based on shared dependencies
5. Consider business semantics when naming groups
6. Write `.audit/<session-id>/groups.json`

The prompt includes:
- Input format description (graph-data.json schema)
- Output format description (groups.json schema)
- Grouping guidelines (shared services → merge, logical module names, control group size)
- Constraints (every file must belong to exactly one group, preserve entry file associations)

### 8. SKILL.md update

Add new section between current sections 4 and 5:

```
### 4.5. Project Grouping (if type === "project" and status === "scanned")

When user types "group <session-id>":
1. GET /api/sessions/<session-id> — confirm status is "scanned"
2. PUT /api/sessions/<session-id>/status with { status: "grouping" }
3. Dispatch a sub-agent with prompts/project-group.md, passing session-id as context
4. Sub-agent reads graph-data.json, analyzes dependencies, writes groups.json
5. PUT /api/sessions/<session-id>/status with { status: "scanned" } (back to scanned, ready for UI)
6. Tell user: "Grouping complete. Review and adjust groups at http://localhost:3456."
```

### 9. Existing `chunkFiles` code

Keep the existing `chunkFiles`, `resolveImports`, `resolveImportsViaCodegraph` functions in `project-scan.mjs` as they are. They remain available for:
- Non-codegraph projects (fallback mode)
- The `mode === "classic"` path
- Any future use

The new `collectGraphData` + `generateTasksFromGroups` path runs alongside, not replacing the old code.

## Files Changed

| File | Type of Change |
|------|---------------|
| `skills/audit/scripts/lib/project-scan.mjs` | Add collectGraphData, generateTasksFromGroups, modify setProjectScope |
| `skills/audit/scripts/lib/session.mjs` | Add scanned, grouping to VALID_STATUSES |
| `skills/audit/scripts/server/handlers/project-scan.mjs` | Add graph-data, groups endpoints; modify scan endpoint |
| `skills/audit/scripts/public/js/api.mjs` | Add getGraphData, getGroups, updateGroups, confirmGroups |
| `skills/audit/scripts/public/js/views/wizard.mjs` | Add Group step with pending/loaded/adjust states |
| `skills/audit/scripts/public/styles.css` | Add group-card styles |
| `skills/audit/prompts/project-group.md` | New prompt for grouping sub-agent |
| `skills/audit/SKILL.md` | Add section 4.5 for grouping flow |

## Out of Scope

- Function-level call graph analysis in the grouping prompt (the prompt can use symbol names for context but grouping is at file level)
- Drag-and-drop file moving between groups (use checkbox-based move for simplicity)
- Automatic re-grouping when files change (user can re-run the group command)
- Groups visualization as a graph (list view is sufficient)
