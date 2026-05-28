# Tasks Summary Endpoint

## Problem

`GET /api/sessions/:id/tasks` reads and merges every per-task YAML file. For a session with 10 tasks, that's 10 YAML reads on every call. Callers like progress polling (every 3s), the SKILL.md review loop, and wizard file mapping don't need the full task content (diff, review findings, positives) — they only need type, file, and status.

## Design

### New endpoint: `GET /api/sessions/:id/tasks/summary`

Returns a lightweight array from `index.yaml` only — no per-task YAML reads.

**Response:**
```json
[
  { "type": "code", "file": "code-tasks/foo.yaml", "status": "pending" },
  { "type": "story", "file": "story-tasks/bar.yaml", "status": "reviewed" }
]
```

### Server-side: `getTasksSummary()`

New function in `lib/task.mjs`. Reads `index.yaml`, maps codeTasks/storyTasks/projectTasks to `{ type, file, status }`.

### Client-side: `api.getTasksSummary()`

New method in `api.mjs`: `request("GET", /api/sessions/${id}/tasks/summary)`.

### Callers switching to summary

| Caller | Change |
|---|---|
| **SKILL.md** | `curl .../tasks` → `curl .../tasks/summary` for task dispatch loop |
| **progress.mjs** | Polling uses `api.getTasksSummary()`. Drops per-task score display during polling. |
| **wizard-stories.mjs** | Uses `api.getTasksSummary()` to get code task file list |
| **wizard-project.mjs** | Uses `api.getTasksSummary()` for task/file count |

### Callers keeping full `getTasks`

| Caller | Reason |
|---|---|
| **review.mjs** | Renders full findings, scores, details |
| **summary.mjs** | Aggregates finding severities from `review.findings` |

### Progress view score display

Progress view currently shows `t.review?.score` per task. With summary endpoint, scores won't be available during polling. The score column simply won't render — scores are visible on the review page. No data is lost, just deferred to the detail view.

## Finding Status: `well-done` and Auto-Review

### Problem 1: Story "met" findings show wrong actions

Story reviews use severity `met` / `partially-met` / `not-met` for findings. When severity is `met` (code meets acceptance criteria), the action bar shows "Need Fix" / "Won't Fix" / "Not an Issue" — meaningless for a positive result.

### Problem 2: Tasks with no findings stay "Unreviewed"

When a task has 0 findings (clean code, high score), there are no action buttons to click. The sidebar shows "Unreviewed" forever.

### Design

**New finding status: `well-done`** — means human confirmed the code is good. Applied automatically:

| Condition | Behavior |
|---|---|
| Finding severity is `met` | Auto-mark as `well-done`. Show green "Well Done" badge, no action buttons. |
| Task has 0 findings | Auto-mark task as fully reviewed in sidebar. Show "Clean code — no issues found" message. |
| All findings are `well-done` | Task is fully reviewed. Sidebar shows "Complete". |

**Sidebar consistency:** `well-done` findings count toward `humanDone` the same as `need-fix` / `wont-fix` / `not-an-issue`. The segmented progress bar gets a new green `seg-well-done` segment. Legend shows `N done` in accent/green color, matching the `N fix` / `N skip` / `N N/A` pattern.

**Finding status summary:**

| Status | Label | Color | Icon | Applied |
|---|---|---|---|---|
| (none) | Pending | gray dashed | — | default |
| `need-fix` | Need Fix | red | alert | manual |
| `wont-fix` | Won't Fix | amber | minus | manual |
| `not-an-issue` | Not an Issue | blue | x | manual |
| **`well-done`** | **Well Done** | **green** | **check** | **auto for `met`, persisted to notes** |

**Auto-persist logic:** On first render of the review page, for each finding with severity `met` that has no saved status in notes, call `api.updateTaskNote()` to write `well-done`. This ensures the status is persisted for PDF export. Subsequent page loads read the status from notes normally — no duplicate writes.

### Files to change

**Tasks summary endpoint (7 files):**

1. `skills/audit/scripts/lib/task.mjs` — add `getTasksSummary()`
2. `skills/audit/scripts/server/handlers/tasks.mjs` — register new route
3. `skills/audit/scripts/public/js/api.mjs` — add `getTasksSummary()`
4. `skills/audit/scripts/public/js/views/progress.mjs` — switch polling to summary
5. `skills/audit/scripts/public/js/views/wizard-stories.mjs` — switch to summary
6. `skills/audit/scripts/public/js/views/wizard-project.mjs` — switch to summary
7. `skills/audit/SKILL.md` — update curl commands to use summary endpoint

**Finding status auto-review (3 files):**

8. `skills/audit/scripts/public/js/components/task-detail.mjs` — auto-apply `well-done` for `met` findings, show "Clean code" for empty findings
9. `skills/audit/scripts/public/js/views/review.mjs` — count `well-done` in sidebar progress, add `seg-well-done` segment and legend
10. `skills/audit/scripts/public/js/constants.mjs` — update `aggregateFindings` to count `well-done`
11. `skills/audit/scripts/public/styles.css` — add `seg-well-done` progress bar style
