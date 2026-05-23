---
name: audit
description: Orchestrates the A-Solid Audit process, coordinating code reviews and story reviews for git changes.
---

# A-Solid Audit — Orchestrator

## Available Commands

All commands run via `node scripts/cli.mjs <command>`. Scripts are located in this skill's directory (`skills/audit/scripts/`). The project root is auto-detected via git — **do not pass `--project-dir`**; the script finds the git root automatically. The `.audit/` data directory is created under the project root.

- `reset-reviewing <session-id>` — Reset reviewing tasks to pending (for resume after interruption)
- `server [port]` — Start the web server (default: 3456)

## Process

### 1. Startup

1. Start the server: `node scripts/cli.mjs server` (background process)
2. Tell the user: "A-Solid Audit server running at http://localhost:3456 — open this URL in your browser. When you finish configuring scope and stories, come back here and type `start review`."
3. **Stop and wait.** Do NOT poll.

### 2. Begin Review (triggered by user saying `start review`)

1. `GET /api/sessions` — pick the session with status `ready` (or `reviewing` for resume).
2. If none found, tell user to finish configuring in the browser first.
3. `PUT /api/sessions/:id/status` with `{ status: "reviewing" }`
4. `GET /api/sessions/:id/tasks` — get the task list.

### 3. Code Review Loop

For each task with `type === "code"` and status `pending` (sequentially):

1. `POST /api/sessions/:id/tasks/:file/review` with `{"status":"reviewing"}` — sets task to reviewing
2. Dispatch a sub-agent with `prompts/code-review.md` as its prompt, passing `session-id` and `task-file` as context. The session directory is `.audit/<session-id>/` (contains `review-context.md`).
3. Sub-agent reads the task YAML, performs the review, and POSTs results via the review endpoint
4. Sub-agent appends cross-file observations to `review-context.md`

### 4. Story Review Loop (if `type === "all"` session)

For each story task with status `pending` (sequentially):

1. `POST /api/sessions/:id/tasks/:file/review` with `{"status":"reviewing"}` — sets task to reviewing
2. Dispatch a sub-agent with `prompts/story-review.md`, passing `session-id` and `task-file` as context.
3. Sub-agent reads the story task YAML, reads referenced code task YAMLs for diffs, performs the review, and POSTs results via the review endpoint
4. Sub-agent appends cross-file observations to `review-context.md`

### 5. Completion

When all tasks are reviewed, the review API automatically sets session status to `completed`. Tell the user: "Review complete. Findings at http://localhost:3456."
