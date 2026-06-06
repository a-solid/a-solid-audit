# Review Rounds — Iterative Code Review with Finding Persistence

## Problem

Currently, each code review session is isolated. When a user reviews code, marks findings as `wont-fix` or `not-an-issue`, then fixes other findings and wants to re-review, they must start a completely new session and re-triage everything. There is no mechanism to carry forward triage decisions across review iterations.

Additionally, `review-notes.yaml` findings currently only store `status` and `reason` — no description of what the finding was about, making it hard for the AI to correlate prior findings with new reviews.

## Solution

Introduce a **round** as a first-class entity that groups related review sessions. A round has a shared `review-notes.yaml` that accumulates findings and triage decisions across sessions. When a new session starts within a round, the AI receives the round's prior findings as context, and tasks with all-findings-resolved are automatically excluded.

This is a **breaking change** — sessions always belong to a round. No backward compatibility with the old layout.

## Storage Layout

```
~/.audit/<project-name>/
  <round-id>/
    round.yaml              # { name, description, created, type }
    review-notes.yaml       # accumulated findings across all sessions
    <session-id>/
      index.yaml            # session metadata
      code-tasks/           # task YAMLs
      story-tasks/
      project-tasks/
      review-context.md
```

- `round.yaml`: round metadata (name, description, created timestamp, type)
- `review-notes.yaml`: shared across all sessions in the round
- Session directories unchanged internally

## Round API

### `POST /api/rounds`

Create a new round. Body: `{ name: string, description?: string, type?: string }`.

Generates a `<round-id>` (ISO timestamp with colons replaced by dashes) under the project directory. Creates `round.yaml`. Returns `{ id, name }`.

### `GET /api/rounds`

List all rounds. Scans project directory for subdirectories containing `round.yaml`.

### `GET /api/rounds/:roundId`

Get round details: metadata, list of sessions, and the review-notes.

### `GET /api/rounds/:roundId/notes`

Get the round's `review-notes.yaml`.

### `POST /api/rounds/:roundId/notes`

Update findings in the round's `review-notes.yaml`. Same schema as the current session-level notes endpoint.

### Session Creation Change

`POST /api/sessions` now requires `roundId` in the body. The session directory is created under `<project>/<roundId>/<sessionId>/`.

## Finding Descriptions in review-notes.yaml

Current finding entry: `{ status, reason }`

New finding entry: `{ status, reason, description, severity?, file?, line? }`

When a code review sub-agent submits findings via `review-yaml`, the server auto-populates the round's `review-notes.yaml` with finding descriptions from the review data. This gives the AI enough context to correlate findings across sessions.

## Task Exclusion Logic

When `setScope` creates tasks for a new session, it checks the round's `review-notes.yaml`:

- For each file that would become a task, look up prior findings
- If **all** findings for that file are marked `wont-fix`, `not-an-issue`, or `well-done` → exclude the task
- If any finding is `need-fix` or `pending` → include the task

This means the user only re-reviews files that had unresolved issues.

## Code Review Prompt Update

The code review prompt (`prompts/code-review.md`) receives `round-id` as additional context.

New instructions:

1. Before reviewing, read `review-notes.yaml` from the round directory (`.audit/<project>/<round-id>/review-notes.yaml`)
2. For the current task file, look at prior findings:
   - `wont-fix` / `not-an-issue` / `well-done` → do not re-raise these. Confirm they still apply if code hasn't changed.
   - `need-fix` → re-evaluate: was the fix applied? Is the finding still relevant?
   - `pending` → full review as new finding
3. Submit review as usual. The server updates the round's `review-notes.yaml` automatically.

## Auto-Update of Round-Level review-notes.yaml

When the review-yaml endpoint receives findings:

1. Append review to session's task YAML (unchanged)
2. **New:** update the round's `review-notes.yaml`:
   - For each finding in the review, create an entry with `{ status: "pending", reason: "", description, severity, file, line }`
   - If a prior entry exists for the same file + description, update it (new status: `pending`, reset reason)

The browser UI for toggling finding status now writes to the round's `review-notes.yaml` instead of the session's.

## SKILL.md Flow Update

1. Start the server
2. Create a round: `POST /api/rounds { name: "..." }`
3. Create a session within the round: `POST /api/sessions { type: "code", roundId: "..." }`
4. Configure scope, start review
5. AI runs review loop — reads round's `review-notes.yaml` for context
6. After review, user marks findings in browser (writes to round-level notes)
7. If changes needed: code fixes → create new session in same round → re-review only unresolved tasks
8. `/wait` flow unchanged

## Files Changed

| File | Change |
|---|---|
| `skills/audit/scripts/server/handlers/rounds.mjs` | New — round API handlers |
| `skills/audit/scripts/server/index.mjs` | Register round routes |
| `skills/audit/scripts/lib/paths.mjs` | Update `resolveReportsDir` for round layout |
| `skills/audit/scripts/lib/session.mjs` | `createSession` accepts `roundId`, creates under round dir |
| `skills/audit/scripts/server/handlers/sessions.mjs` | Session creation requires `roundId`, review-notes endpoint moves to round |
| `skills/audit/scripts/server/handlers/notes.mjs` | Notes read/write from round-level `review-notes.yaml` |
| `skills/audit/scripts/server/handlers/reviews.mjs` | After review submission, update round-level `review-notes.yaml` with finding descriptions |
| `skills/audit/scripts/lib/task.mjs` | `setScope` excludes fully-resolved tasks based on round notes |
| `skills/audit/prompts/code-review.md` | Add `round-id` context, instructions to read prior findings |
| `skills/audit/prompts/story-review.md` | Same as code-review |
| `skills/audit/prompts/project-review.md` | Same as code-review |
| `skills/audit/SKILL.md` | Update flow to include round creation, remove session-level notes references |
| `skills/audit/scripts/public/js/api.mjs` | Add round API methods |
| `skills/audit/scripts/public/js/views/wizard.mjs` | Add round selection/creation step |
| `skills/audit/scripts/public/js/views/summary.mjs` | Finding status toggles write to round-level notes |

## Non-Goals

- Migrating existing sessions to the new layout (breaking change, clean start)
- Round-level dashboard/analytics (future)
- Cross-round finding correlation (each round is independent)
