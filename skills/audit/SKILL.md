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
2. Tell the user: "A-Solid Audit server running at http://localhost:3456 — open this URL in your browser. When you finish configuring scope and stories, come back here and type `start review <session-id>`."
3. **Stop and wait.** Do NOT poll.

### 2. Begin Review (triggered by user saying `start review <session-id>`)

1. Parse `<session-id>` from the user's message.
2. `GET /api/sessions/:id` — confirm the session exists and has status `ready` (or `reviewing` for resume).
3. If not found or wrong status, tell user to finish configuring in the browser first.
4. `PUT /api/sessions/:id/status` with `{ status: "reviewing" }`
5. `GET /api/sessions/:id/tasks` — get the task list.

### 3. Code Review Loop

For each task with `type === "code"` and status `pending`, dispatch up to **3 sub-agents in parallel**:

1. Set the next N pending tasks to `reviewing`: `POST /api/sessions/:id/tasks/:file/review` with `{"status":"reviewing"}`
2. Dispatch each as a sub-agent with `prompts/code-review.md` as its prompt, passing `session-id` and `task-file` as context
3. Sub-agent reads the task YAML, performs the review, and POSTs results via the review endpoint
4. Sub-agent appends cross-file observations via `POST /api/sessions/:id/review-notes` (atomic append)
5. As each sub-agent completes, dispatch the next pending task (maintaining up to 3 in flight)

### 4. Story Review Loop (if `type === "all"` session)

For each story task with status `pending`, same parallel pattern (up to 2):

1. `POST /api/sessions/:id/tasks/:file/review` with `{"status":"reviewing"}`
2. Dispatch sub-agent with `prompts/story-review.md`, passing `session-id` and `task-file` as context
3. Sub-agent reads the story task YAML, reads referenced code task YAMLs for diffs, performs the review, and POSTs results
4. Sub-agent appends cross-file observations via `POST /api/sessions/:id/review-notes`

### 5. Project Scan Loop (if `type === "project"` session)

For each project task with status `pending`, same parallel pattern (up to 2):

1. `POST /api/sessions/:id/tasks/:file/review` with `{"status":"reviewing"}`
2. Dispatch sub-agent with `prompts/project-review.md`, passing `session-id` and `task-file` as context
3. Sub-agent reads the task YAML (contains `files[]`, `type`, `entry`), reads source files from the project directory, performs security and quality review, and POSTs results
4. Sub-agent generates an `overview` with a Mermaid diagram of the call chain and a description of execution flow
5. Sub-agent appends cross-file observations via `POST /api/sessions/:id/review-notes`

### 4.5. Project Grouping (if type === "project" and status === "scanned")

When user types "group <session-id>":

1. `GET /api/sessions/<session-id>` — confirm status is `scanned`
2. `PUT /api/sessions/<session-id>/status` with `{ status: "grouping" }`
3. Dispatch a sub-agent with `prompts/project-group.md`, passing session-id as context. The sub-agent:
   - Reads `.audit/<session-id>/graph-data.json`
   - Analyzes the dependency graph
   - Groups files into logical modules
   - Writes `.audit/<session-id>/groups.json`
4. After sub-agent completes, the web UI will poll and detect `groups.json`
5. User reviews and adjusts groups in the browser UI
6. User clicks "Confirm Groups" which triggers task generation
7. Tell user: "Grouping complete. Review and adjust groups at http://localhost:3456."

### 6. Completion

When all tasks are reviewed, the review API automatically sets session status to `completed`. Tell the user: "Review complete. Findings at http://localhost:3456."
