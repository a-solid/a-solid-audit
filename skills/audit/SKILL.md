---
name: audit
description: Orchestrates the A-Solid Audit process, coordinating code reviews and story reviews for git changes. Manages session flow, task status updates, and YAML data generation.
---

# A-Solid Audit — Orchestrator

You are the orchestrator for the A-Solid Audit tool. You coordinate code quality reviews and story alignment reviews for git changes.

## Available Commands

All commands are run via `node scripts/cli.mjs [--project-dir <path>] <command>`. Use `--project-dir` to specify the target project root (defaults to the current working directory). The `.audit/` data directory is created under the project root.

- `node scripts/cli.mjs update-task <session-id> <task-file> <status> [score]` — Update task status/score
- `node scripts/cli.mjs reset-reviewing <session-id>` — Reset reviewing tasks to pending (for resume after interruption)
- `node scripts/cli.mjs server [port]` — Start the multi-session web server (default port: 3456)

## Process Flow

### 1. Startup

1. Start the server: `node scripts/cli.mjs server` (background process)
2. Tell the user: "A-Solid Audit server running at http://localhost:3456 — open this URL in your browser. When you finish configuring scope and stories, come back here and type `start review`."
3. **Stop and wait.** Do NOT poll. The user will return to the terminal when ready.

### 2. Begin Review (triggered by user saying `start review`)

1. Call `GET /api/sessions` to find sessions. Pick the one with status `ready` (or `reviewing` for a resumed session).
2. If no session is `ready`, tell the user: "No ready session found. Please finish configuring in the browser first."
3. If a session is `ready`, update its status via API: `PUT /api/sessions/:id/status` with `{ status: "reviewing" }`
4. Read `GET /api/sessions/:id/tasks` to get the task list. Filter for `type === "code"` to get code tasks.
5. Confirm there are code tasks. If none, tell user to check scope.

### 3. Code Review Loop

For each task with `type === "code"` and status `pending` (process sequentially, one at a time):

1. Update status: `node scripts/cli.mjs update-task <session-id> <task-file> reviewing`
2. Read the task YAML file from `.audit/<session-id>/<task-file>`
3. Read `prompts/code-review.md` (relative to this skill directory) and use its content as the prompt for a sub-agent (Agent tool), passing the task file path and the session directory path (`.audit/<session-id>/`) as context. The session directory always contains `review-context.md`.
4. The sub-agent writes results under `review:` in the task YAML
5. Verify the task file was updated (read back to confirm `status: reviewed`)

### 4. Story Review Loop (if tasks with `type === "story"` exist)

For each story task with status `pending` (process sequentially, one at a time):

1. Update status: `node scripts/cli.mjs update-task <session-id> <task-file> reviewing`
2. Read the story task YAML file from `.audit/<session-id>/<task-file>`
3. For context, the task contains `taskFile` references — the agent reads code task YAMLs via these references to get diffs
4. Read `prompts/story-review.md` (relative to this skill directory) and use its content as the prompt for a sub-agent (Agent tool), passing the task file path and the session directory path (`.audit/<session-id>/`) as context. The session directory always contains `review-context.md`.
5. The sub-agent writes results under `review:` in the task YAML
6. Verify the task file was updated

### 5. Completion

1. When all tasks are reviewed, the `update-task` command automatically sets session status to `completed`.
2. Inform user: "Review complete. Findings are available in the browser at http://localhost:3456."
3. The user reviews findings, confirms/dismisses, and signs off in the browser. No further CLI interaction needed.

## Error Handling

- If the server fails to start, check that port 3456 is available.
- If a provider fetch fails, the frontend shows the error and offers manual input fallback.
- If a skill fails mid-review, the task remains in `reviewing` status — on resume it will be reset to `pending`.
- If `index.yaml` is corrupted, inform the user and suggest starting a new session.
