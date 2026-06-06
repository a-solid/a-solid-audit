---
name: audit
description: Runs code review, story review, and project scan audits. Invoke when the user wants to audit their codebase or git changes.
---

# A-Solid Audit — Orchestrator

## Platform Notes

On Windows PowerShell, `curl` is an alias for `Invoke-WebRequest`. Always use **`curl.exe`** (or `Invoke-RestMethod`) instead of bare `curl` to avoid the alias conflict.

## Available Commands

All commands run via `node scripts/cli.mjs <command>`. Scripts are located in this skill's directory (`skills/audit/scripts/`). The project root is auto-detected via git — **do not pass `--project-dir`**; the script finds the git root automatically. The `.audit/` data directory is created under the project root.

- `reset-reviewing <session-id>` — Reset reviewing tasks to pending (for resume after interruption)
- `server [port]` — Start the web server (default: 3456)

## Autonomy

This skill operates with **high autonomy**. Do not ask for permission between individual task reviews. The AI drives the entire flow — use `/wait` to block at checkpoints until the user acts in the browser. No manual text input from the user is needed.

## Process

### 1. Startup

1. Start the server: `node scripts/cli.mjs server` (background process)
2. Verify the server is running:
   ```bash
   curl -s http://localhost:3456/api/sessions
   ```
   If this fails, the server didn't start.
3. Tell the user: "A-Solid Audit server running at http://localhost:3456 — open this URL in your browser to configure the audit."
4. Create a session via the API or let the user create one in the browser. If creating via API:
   ```bash
   curl -s -X POST http://localhost:3456/api/sessions -H 'Content-Type: application/json' -d '{"type":"code"}'
   ```
   Note the `id` from the response.
5. **Wait for user to finish configuring** by calling the long-poll endpoint:
   ```bash
   curl -s -X POST http://localhost:3456/api/sessions/<session-id>/wait -H 'Content-Type: application/json' -d '{"reason":"ready"}'
   ```
   This blocks until the user clicks "Start Review" in the browser, or times out after 10 minutes.
6. When the response arrives with `{"action":"start"}`, proceed to the review loop.

### 2. Begin Review (after /wait resolves with action "start")

1. The session should now have status `reviewing` (the browser sets this when the user clicks Start Review).
2. Confirm the session status:
   ```bash
   curl -s http://localhost:3456/api/sessions/<session-id>
   ```
3. Get the task list:
   ```bash
   curl -s http://localhost:3456/api/sessions/<session-id>/tasks/summary
   ```

### 3. Code Review Loop

For each task with `type === "code"` and status `pending`, dispatch up to **3 sub-agents in parallel**:

1. Set the next N pending tasks to `reviewing`:
   ```bash
   curl -s -X POST http://localhost:3456/api/sessions/<session-id>/tasks/review \
     -H 'Content-Type: application/json' \
     -d '{"file":"<task-file>","status":"reviewing"}'
   ```
2. Dispatch each as a sub-agent with `prompts/code-review.md` as its prompt, passing `session-id` and `task-file` as context
3. Sub-agent reads the task YAML, performs the review, and POSTs results via the review endpoint
4. Sub-agent appends cross-file observations via review-notes endpoint (atomic append)
5. As each sub-agent completes, dispatch the next pending task (maintaining up to 3 in flight)
6. **If a sub-agent fails**: mark the task back to `pending` via the review endpoint, log the error, and continue with remaining tasks

### 4. Story Review Loop (if `type === "all"` session)

For each story task with status `pending`, same parallel pattern (up to 2):

1. Set task to `reviewing`:
   ```bash
   curl -s -X POST http://localhost:3456/api/sessions/<session-id>/tasks/review \
     -H 'Content-Type: application/json' \
     -d '{"file":"<task-file>","status":"reviewing"}'
   ```
2. Dispatch sub-agent with `prompts/story-review.md`, passing `session-id` and `task-file` as context
3. Sub-agent reads the story task YAML, reads referenced code task YAMLs for diffs, performs the review, and POSTs results
4. Sub-agent appends cross-file observations via review-notes endpoint
5. **If a sub-agent fails**: mark the task back to `pending`, log the error, and continue

### 5. Project Grouping (if type === "project" and status === "scanned")

When the scan completes and status is `scanned`:

1. Transition to grouping:
   ```bash
   curl -s -X PUT http://localhost:3456/api/sessions/<session-id>/status \
     -H 'Content-Type: application/json' \
     -d '{"status":"grouping"}'
   ```
2. Dispatch a sub-agent with `prompts/project-group.md`, passing session-id as context. The sub-agent:
   - Reads the session's `graph-data.json`
   - Analyzes the dependency graph
   - Groups files into logical modules
   - Writes `groups.json`
3. After sub-agent completes, **wait for the user to confirm groups**:
   ```bash
   curl -s -X POST http://localhost:3456/api/sessions/<session-id>/wait \
     -H 'Content-Type: application/json' \
     -d '{"reason":"grouping"}'
   ```
   This blocks until the user reviews and confirms groups in the browser.
4. When the response arrives with `{"action":"confirm-groups"}`, the groups are confirmed and tasks are generated. Proceed to the review loop.

### 6. Project Scan Review Loop (if `type === "project"` session)

For each project task with status `pending`, same parallel pattern (up to 2):

1. Set task to `reviewing`:
   ```bash
   curl -s -X POST http://localhost:3456/api/sessions/<session-id>/tasks/review \
     -H 'Content-Type: application/json' \
     -d '{"file":"<task-file>","status":"reviewing"}'
   ```
2. Dispatch sub-agent with `prompts/project-review.md`, passing `session-id` and `task-file` as context
3. Sub-agent reads the task YAML (contains `files[]`, `type`, `entry`), reads source files from the project directory, performs security and quality review, and POSTs results
4. Sub-agent generates an `overview` with a Mermaid diagram of the call chain and a description of execution flow
5. Sub-agent appends cross-file observations via review-notes endpoint
6. **If a sub-agent fails**: mark the task back to `pending`, log the error, and continue

### 7. Completion

When all tasks are reviewed, the review API automatically sets session status to `completed`. Tell the user: "Review complete. Findings at http://localhost:3456." If any tasks failed and remain `pending`, report them: "N tasks failed to review. You can retry with `start review <session-id>`."
