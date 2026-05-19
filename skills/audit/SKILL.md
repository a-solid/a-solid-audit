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
2. Tell the user: "A-Solid Audit server running at http://localhost:3456 — open this URL in your browser."
3. The server serves all sessions in `.audit/`. The user creates a new audit, configures scope, and adds stories in the browser.

### 2. Poll for Ready

After telling the user to open the browser:

1. Poll `GET /api/sessions` every 3-5 seconds to discover the session the user creates.
2. Once a session is found, poll `GET /api/sessions/:id` every 3-5 seconds.
3. Wait until `session.status === "ready"`.
4. If a session already has status `reviewing` (resumed session), skip to step 4.

### 3. Begin Review

1. When status is `ready`, run: `node scripts/cli.mjs update-session-status <session-id> reviewing`
   (Or use `PUT /api/sessions/:id/status` with `{ status: "reviewing" }`)
2. Read `GET /api/sessions/:id/tasks` to get the code task list.
3. Confirm codeTasks is non-empty. If empty, tell user to check scope.

### 4. Code Review Loop

For each task in codeTasks with status `pending` (process sequentially, one at a time):

1. Update status: `node scripts/cli.mjs update-task <session-id> <task-file> reviewing`
2. Read the task YAML file from `.audit/<session-id>/<task-file>`
3. Read `prompts/code-review.md` (relative to this skill directory) and use its content as the prompt for a sub-agent (Agent tool), passing the task file path as context
4. The sub-agent writes results under `review:` in the task YAML
5. Verify the task file was updated (read back to confirm `status: reviewed`)

### 5. Story Review Loop (if storyTasks exist)

For each task in storyTasks with status `pending` (process sequentially, one at a time):

1. Update status to `reviewing`
2. Read the story task YAML file
3. For context, the task contains `taskFile` references — the agent reads code task YAMLs via these references to get diffs
4. Read `prompts/story-review.md` (relative to this skill directory) and use its content as the prompt for a sub-agent (Agent tool), passing the task file path as context
5. The sub-agent writes results under `review:` in the task YAML
6. Verify the task file was updated

### 6. Completion

1. When all tasks are reviewed, the `update-task` command automatically sets session status to `completed`.
2. Inform user: "Review complete. Findings are available in the browser at http://localhost:3456."
3. The user reviews findings, confirms/dismisses, and signs off in the browser. No further CLI interaction needed.

## Error Handling

- If the server fails to start, check that port 3456 is available.
- If a provider fetch fails, the frontend shows the error and offers manual input fallback.
- If a skill fails mid-review, the task remains in `reviewing` status — on resume it will be reset to `pending`.
- If `index.yaml` is corrupted, inform the user and suggest starting a new session.
