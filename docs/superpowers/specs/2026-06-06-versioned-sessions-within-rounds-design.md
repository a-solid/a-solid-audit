# Versioned Sessions Within Rounds — Full Design

## Problem

Code review is iterative: after a first review pass, users fix some findings and want a second pass. The current round model supports multiple sessions but lacks versioning, re-review workflow, and cross-session aggregation. Users need to know which files were reviewed, which need fixes, and see a consolidated report across all review passes.

## Solution

**Round** (e.g. `july-release`) groups related review **sessions**. Each session represents one review pass with an auto-incrementing version number. Session 1 (v1) reviews all files. User marks findings. Re-review creates session 2 (v2) with only need-fix files (plus any user-selected files). Round-level summary merges the latest review data per file across all sessions.

This is a **breaking change** — no backward compatibility.

## Storage Layout

```
~/.audit/<project-name>/
  <round-id>/
    round.yaml                # { name, description, created }
    <session-id>/
      index.yaml              # session metadata with version field
      review-notes.yaml       # session-level findings + triage
      code-tasks/
      story-tasks/
      project-tasks/
      review-context.md
```

- `round.yaml`: round metadata (unchanged from current implementation)
- Each session has its own `review-notes.yaml` — findings and triage are session-scoped
- No round-level `review-notes.yaml`

## Session index.yaml

```yaml
session:
  id: 2026-06-06T15-08-10.317Z
  type: code
  status: completed
  version: 1
  scope:
    method: commits
    ref: HEAD~5
  roundId: 2026-06-06T15-08-06.516Z
  projectDir: /path/to/project
  created: "2026-06-06T15:08:10.319Z"
codeTasks:
  - file: code-tasks/auth-login.yaml
    name: src/auth/login.ts
    status: reviewed
  - file: code-tasks/api-route.yaml
    name: src/api/route.ts
    status: reviewed
```

Key: `version` field is auto-assigned when creating a session within a round. First session = version 1, re-review creates version 2, etc.

## review-notes.yaml (Session-Level)

Each session has its own `review-notes.yaml`:

```yaml
tasks:
  - file: code-tasks/auth-login.yaml
    findings:
      - status: need-fix
        reason: "race condition must be fixed"
        description: "Concurrent access to shared state without lock"
        severity: major
        file: src/auth/login.ts
        line: 42
      - status: wont-fix
        reason: "accepted risk"
        description: "Missing JSDoc on private method"
        severity: minor
  - file: code-tasks/api-route.yaml
    findings:
      - status: well-done
        reason: ""
        description: "Clean error handling pattern"
        severity: positive
summary:
  notes: ""
  signoff:
    name: ""
    role: ""
    date: ""
```

Findings include `description`, `severity`, `file`, and `line` — auto-populated from the review submission.

## Round API

### `POST /api/rounds`

Create a round. Body: `{ name, description? }`. Returns `{ id, name }`.

### `GET /api/rounds`

List all rounds with their sessions and version numbers.

### `GET /api/rounds/:roundId`

Round detail with sessions list. Each session shows version, status, progress.

### `POST /api/rounds/:roundId/sessions`

Create a session within a round. Body: `{ type?, scope? }`. Auto-assigns `version = max(versions) + 1`. Generates task YAMLs from scope. Returns session detail.

For v1 (first session in round): user configures scope in browser as today.

### `POST /api/rounds/:roundId/re-review`

Create a new versioned session for re-review. Body: `{ files?: string[] }` (optional manual file overrides).

Server-side logic:
1. Find the session with the highest `version` in the round
2. Read that session's `review-notes.yaml`
3. Identify files with any `need-fix` findings — these are auto-selected
4. If `files` is provided in the body, merge with auto-selected files (union)
5. Create a new session with `version = previous + 1`
6. Generate task YAMLs for the selected files using fresh diff (uncommitted changes, or original scope method)
7. Set session status to `reviewing`
8. Return `{ sessionId, version, taskCount, files }`

### `GET /api/rounds/:roundId/summary`

Round-level summary that merges all sessions. For each file that appears in any session:
- Find the latest session that contains this file
- Return that session's review data (score, findings) and review-notes findings (with triage status)
- Result: one entry per file with the most recent review and triage

Response structure:
```json
{
  "files": [
    {
      "name": "src/auth/login.ts",
      "latestVersion": 2,
      "latestSessionId": "...",
      "review": { "score": 7, "summary": "..." },
      "findings": [
        { "status": "need-fix", "description": "...", "severity": "major" }
      ]
    }
  ],
  "stats": {
    "totalFiles": 5,
    "totalFindings": 12,
    "needFix": 3,
    "wontFix": 2,
    "notAnIssue": 4,
    "wellDone": 3
  }
}
```

## Re-Review UI Flow

When user clicks "Re-review" on the round detail page:

1. Browser fetches latest session's review-notes: `GET /api/sessions/:latestId/notes`
2. Browser shows two sections:
   - **"Files to re-review"** — files with need-fix findings, pre-checked
   - **"Previously resolved files"** — files with all-findings-resolved, unchecked but selectable
3. User can check/uncheck files, then clicks "Start re-review"
4. Browser calls `POST /api/rounds/:roundId/re-review` with `{ files: [...] }` (all checked files)
5. Server creates new session, generates tasks
6. Browser redirects to the new session's progress page

## Review Prompt Context

When the AI reviews files in session v2, it receives `round-id` and `session-id` as context. The prompt instructs it to:

1. Read the prior session's `review-notes.yaml` (session v1 in the same round)
2. For the current task file, check prior findings:
   - `wont-fix` / `not-an-issue` / `well-done` — do not re-raise
   - `need-fix` — re-evaluate: was the fix applied?
   - `pending` — review normally
3. Submit review as usual

## Auto-Populate review-notes.yaml

When a code review sub-agent submits findings via `review-yaml`, the server auto-populates the session's `review-notes.yaml` with finding descriptions, severity, file, and line — same as current implementation but at session level instead of round level.

## SKILL.md Flow

1. Start server
2. Create round: `POST /api/rounds { name }`
3. Create v1 session: `POST /api/rounds/:roundId/sessions { type: "code" }` (or let user configure in browser)
4. Wait for user to configure scope and start review: `curl localhost:3456/wait`
5. AI reviews tasks, auto-populates session review-notes
6. After review completes, user marks findings in browser
7. If changes needed: user clicks "Re-review" in browser → creates v2 session → AI reviews v2 tasks
8. Repeat until all findings resolved
9. User clicks "Generate Summary" on round page → round-level summary aggregates all sessions

## Files Changed (from current state)

| File | Change |
|---|---|
| `skills/audit/scripts/server/handlers/rounds.mjs` | Add `POST /api/rounds/:roundId/sessions`, `POST /api/rounds/:roundId/re-review`, `GET /api/rounds/:roundId/summary` |
| `skills/audit/scripts/server/handlers/notes.mjs` | Move back to session-level (undo round-level delegation) |
| `skills/audit/scripts/server/handlers/reviews.mjs` | Auto-populate session-level review-notes with finding descriptions |
| `skills/audit/scripts/lib/session.mjs` | Add `version` field to session creation |
| `skills/audit/scripts/lib/mapping.mjs` | Scope generation for re-review (subset of files) |
| `skills/audit/prompts/code-review.md` | Read prior session's review-notes for context |
| `skills/audit/SKILL.md` | Update flow with versioned sessions and re-review |
| `skills/audit/scripts/public/js/api.mjs` | Add round session creation and re-review methods |
| Frontend views | Re-review UI, round summary page |

## Non-Goals

- Migrating existing sessions
- Round-level dashboard/analytics beyond the summary
- Cross-round correlation
