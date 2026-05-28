# Review Status Transition Fix

**Goal:** Fix the broken `validateTransition` in reviews.mjs (reads status from task file which no longer has it), add `reviewing` status to AI agent flow, and switch prompts to use curl commands.

**Architecture:** Three changes: (1) reviews.mjs reads current status from index.yaml via getTask, (2) all three AI agent prompts send `status: "reviewing"` before starting work and `status: "reviewed"` on completion, (3) prompts use curl instead of generic HTTP examples.

**Tech Stack:** Node.js ESM backend, curl CLI for AI agents.

---

## Problem

After the index.yaml task status refactor, `reviews.mjs:54` reads `readYaml(taskPath).status` — but task files no longer contain a `status` field. So `validateTransition(undefined, "reviewed")` fails because `ALLOWED_TRANSITIONS[undefined]` is undefined.

Additionally, AI agent prompts only send `status: "reviewed"`, never `"reviewing"`. The `reviewing` state is defined in the state machine but never used, so tasks jump directly from `pending` to `reviewed` with no intermediate "AI Analyzing" state visible in the UI.

Finally, the prompts show generic JSON POST examples. AI agents (especially Claude) execute curl more reliably than node.js HTTP calls.

## Changes

### 1. Fix reviews.mjs — read current status from index.yaml

File: `skills/audit/scripts/server/handlers/reviews.mjs`

Replace the direct `readYaml(taskPath).status` with a call to `getTask()` which already reads status from index.yaml refs. Also import `getTask` from the task module.

The `validateTransition` function stays the same — it's the source of the current status that changes.

### 2. Update AI agent prompts — add reviewing + switch to curl

Files:
- `skills/audit/prompts/code-review.md`
- `skills/audit/prompts/story-review.md`
- `skills/audit/prompts/project-review.md`

For each prompt:
- Add a step before review work begins: send `status: "reviewing"` via curl
- Replace the JSON POST examples with curl commands
- Keep the JSON body structure documentation as reference

The reviewing call is lightweight (no score/review data needed):
```bash
curl -s -X POST http://localhost:3456/api/sessions/<session-id>/tasks/review \
  -H 'Content-Type: application/json' \
  -d '{"file": "<task-file>", "status": "reviewing"}'
```

The reviewed call includes full review data (same as before, just in curl format).

### 3. No frontend changes needed

The frontend already handles the `reviewing` state — `review.mjs:355` shows "AI Analyzing" badge for tasks with `status === "reviewing"`.

## State Machine After Fix

```
pending → reviewing → reviewed
```

- `pending`: task created, not yet picked up
- `reviewing`: AI agent started work (sends on first step)
- `reviewed`: AI agent completed review (sends with full results)

ALLOWED_TRANSITIONS in reviews.mjs already supports this:
```javascript
pending: ["reviewing"],
reviewing: ["reviewed"],
reviewed: [],
```

No changes to the state machine definition needed.
