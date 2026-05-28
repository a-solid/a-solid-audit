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

## Files to change

1. `skills/audit/scripts/lib/task.mjs` — add `getTasksSummary()`
2. `skills/audit/scripts/server/handlers/tasks.mjs` — register new route
3. `skills/audit/scripts/public/js/api.mjs` — add `getTasksSummary()`
4. `skills/audit/scripts/public/js/views/progress.mjs` — switch polling to summary
5. `skills/audit/scripts/public/js/views/wizard-stories.mjs` — switch to summary
6. `skills/audit/scripts/public/js/views/wizard-project.mjs` — switch to summary
7. `skills/audit/SKILL.md` — update curl commands to use summary endpoint
