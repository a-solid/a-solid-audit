# Review Status Transition Fix

**Goal:** Fix the broken `validateTransition` in reviews.mjs, and switch SKILL.md + prompt files to use curl commands instead of generic HTTP descriptions.

**Architecture:** Two changes: (1) reviews.mjs reads current task status from index.yaml instead of task file, (2) SKILL.md and all prompt files use concrete curl commands for API calls.

**Tech Stack:** Node.js ESM backend, curl CLI for AI agent instructions.

---

## Problem

### Bug: reviews.mjs reads status from task file

After the index.yaml task status refactor, `reviews.mjs:54` reads `readYaml(taskPath).status` — but task files no longer contain a `status` field. So `validateTransition(undefined, "reviewed")` fails because `ALLOWED_TRANSITIONS[undefined]` is undefined.

The fix: use `getTask()` from task.mjs which already reads status from index.yaml refs.

### Improvement: switch to curl commands

SKILL.md and prompt files currently use generic HTTP descriptions like `GET /api/sessions/:id` or JSON POST examples without curl syntax. AI agents (especially Claude) execute curl more reliably than interpreting abstract HTTP descriptions or using node.js HTTP libraries.

The reviewing state is already handled correctly by SKILL.md (the orchestrator sends `status: "reviewing"` at lines 40, 51, 77 before dispatching sub-agents). The prompt files (code-review.md, story-review.md, project-review.md) only need to send `status: "reviewed"` on completion — which they already do. No reviewing state changes needed in prompts.

## Changes

### 1. Fix reviews.mjs — read current status from index.yaml

File: `skills/audit/scripts/server/handlers/reviews.mjs`

Replace the direct `readYaml(taskPath).status` with a call to `getTask()` which reads status from index.yaml. Import `getTask` from the task module.

Current code (lines 54-55):
```javascript
const currentTask = readYaml(taskPath);
validateTransition(currentTask.status, status);
```

Replace with:
```javascript
const currentTask = getTask(reportsDir, safeSid, safeTaskFile);
if (!currentTask) return errorResponse(res, "Task not found", "NOT_FOUND", 404);
validateTransition(currentTask.status, status);
```

Also update imports: add `getTask` from `../../lib/task.mjs`, remove unused `readYaml` import.

### 2. Update SKILL.md — use curl commands

File: `skills/audit/SKILL.md`

Replace all generic HTTP descriptions with concrete curl commands. For example:

Before:
```
1. `GET /api/sessions/:id` — confirm status is `scanned`
2. `PUT /api/sessions/<session-id>/status` with `{ status: "grouping" }`
```

After:
```
1. `curl -s http://localhost:3456/api/sessions/<session-id>` — confirm status is `scanned`
2. `curl -s -X PUT http://localhost:3456/api/sessions/<session-id>/status -H 'Content-Type: application/json' -d '{"status":"grouping"}'`
```

All API call descriptions in the file get the same treatment.

### 3. Update prompt files — use curl commands

Files:
- `skills/audit/prompts/code-review.md`
- `skills/audit/prompts/story-review.md`
- `skills/audit/prompts/project-review.md`

Replace the JSON POST examples with curl commands. Keep the JSON body structure documentation as reference (show the JSON structure inline in the curl `-d` argument).

For example, in code-review.md, the "Submitting Results" section changes from:
```
POST to `http://localhost:3456/api/sessions/<session-id>/tasks/review` with JSON:
```json
{
  "file": "<task-file>",
  ...
}
```

To:
```bash
curl -s -X POST http://localhost:3456/api/sessions/<session-id>/tasks/review \
  -H 'Content-Type: application/json' \
  -d '{
    "file": "<task-file>",
    ...
  }'
```

Same for the review-notes POST endpoint.

### 4. No frontend changes needed

The frontend already handles the `reviewing` state — `review.mjs:355` shows "AI Analyzing" badge for tasks with `status === "reviewing"`.

## State Machine (unchanged)

```
pending → reviewing → reviewed
```

The orchestrator (SKILL.md) already sends `reviewing` before dispatching sub-agents. Sub-agents send `reviewed` on completion. The state machine definition in reviews.mjs already supports this. Only the status source was broken.
