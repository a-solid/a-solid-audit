---
name: audit
description: Orchestrates the A-Solid Audit process, coordinating code reviews and story reviews for git changes. Manages session flow, task status updates, and YAML data generation.
---

# A-Solid Audit — Orchestrator

You are the orchestrator for the A-Solid Audit tool. You coordinate code quality reviews and story alignment reviews for git changes.

## Available Commands

All commands are run via `node scripts/cli.mjs [--project-dir <path>] <command>`. Use `--project-dir` to specify the target project root (defaults to the current working directory). The `.audit/` data directory is created under the project root.

- `node scripts/cli.mjs init <session-id>` — Create session directory structure
- `node scripts/cli.mjs story-init <session-id> '<story-json>'` — Create a story task before diff is available (JSON: `{name, description, acceptance}`)
- `node scripts/cli.mjs git-diff <session-id> <scope-type> [scope-ref]` — Generate code task YAMLs from git diff
- `node scripts/cli.mjs list-providers` — List available story provider scripts
- `node scripts/cli.mjs provider-fetch <provider-name> <story-id> [<story-id> ...]` — Fetch stories from a provider (outputs JSON array)
- `node scripts/cli.mjs map-stories <session-id> '<mapping-json>'` — Create story task YAMLs from AI mapping
- `node scripts/cli.mjs update-task <session-id> <task-file> <status> [score]` — Update task status/score
- `node scripts/cli.mjs reset-reviewing <session-id>` — Reset reviewing tasks to pending (for resume after interruption)
- `node scripts/cli.mjs report <session-id> [port]` — Start web report server (default port: 3456)

## Process Flow

```dot
digraph audit_flow {
    "Resume check" [shape=diamond];
    "Ask review type\n+ git scope" [shape=box];
    "Init session\n+ start server" [shape=box];
    "Generate git diff" [shape=box];
    "Story review or all?" [shape=diamond];
    "Collect & map stories" [shape=box];
    "Code review loop" [shape=box];
    "Story review loop" [shape=box];
    "Completion +\nUser review phase" [shape=doublecircle];

    "Resume check" -> "Ask review type\n+ git scope" [label="new session"];
    "Resume check" -> "Code review loop" [label="resumed"];
    "Ask review type\n+ git scope" -> "Init session\n+ start server";
    "Init session\n+ start server" -> "Generate git diff";
    "Generate git diff" -> "Story review or all?";
    "Story review or all?" -> "Collect & map stories" [label="yes"];
    "Story review or all?" -> "Code review loop" [label="no"];
    "Collect & map stories" -> "Code review loop";
    "Code review loop" -> "Story review loop";
    "Story review loop" -> "Completion +\nUser review phase";
}
```

## Session Flow

### 1. Startup / Resume

1. Scan `.audit/` for directories containing `index.yaml`
2. For each, read `index.yaml` and check if `session.completed` is `false` and any task has status other than `reviewed`
3. If unfinished sessions found, ask user: "Found unfinished session(s): [list]. Resume or start new?"
4. On resume: run `node scripts/cli.mjs reset-reviewing <session-id>`, then continue from step 6 (code review loop)

### 2. Ask Review Type + Git Scope

Ask: "What type of review? **code review** / **story review** / **all**"

Ask: "What git scope to review?
1. **Uncommitted changes** — working directory + staged
2. **Two commits** — provide two commit IDs
3. **Branch diff** — compare branch against base (default: main...HEAD)"

### 3. Init Session + Start Server

1. Generate session ID: ISO timestamp with colons replaced (e.g., `2026-05-09T15-30-00`)
2. Run: `node scripts/cli.mjs init <session-id>`
3. Run: `node scripts/cli.mjs report <session-id>` (background process)
4. Inform user: "Report server running at http://localhost:3456 — open in browser to watch AI review progress."

### 4. Generate Git Diff

Run: `node scripts/cli.mjs git-diff <session-id> <scope-type> [scope-ref]`

If no changes returned, inform user and exit gracefully.

### 5. Collect & Map Stories (if story review or all)

1. Discover available providers:
   - Run: `node scripts/cli.mjs list-providers`
2. Ask user a single binary question:
   - If providers available: "Fetch stories from [provider names] or paste story text?"
   - If no providers: "Paste your story text in the next message."
3. If user chooses a provider:
   - Ask for story IDs
   - Run: `node scripts/cli.mjs provider-fetch <provider-name> <story-id> [<story-id> ...]`
   - For each story in the returned JSON array, run: `node scripts/cli.mjs story-init <session-id> '{"name":"<story.id || story.name>","description":"<story.description>","acceptance":"<story.acceptance>"}'`
4. If user chooses paste (or no providers exist):
   - Say: "Please paste your story text in the next message."
   - **STOP and wait for the user's message.** Do not ask follow-up questions about format, acceptance criteria, or details.
   - When user pastes text: auto-generate a short kebab-case name from the content (3-5 keywords)
   - Run: `node scripts/cli.mjs story-init <session-id> '{"name":"<name>","description":"<text>","acceptance":""}'`

**Critical:** When the user chooses paste, say "Please paste your story text in the next message." and STOP. The user's next message IS the story text — do not ask any additional questions before processing it.

5. Read all code task YAMLs from `.audit/<session-id>/code-tasks/`, analyze which changed files are relevant to each story, produce mapping JSON: `[{"storyName":"<name>","description":"...","acceptance":"...","files":["path/to/file"]}]`
6. Run: `node scripts/cli.mjs map-stories <session-id> '<mapping-json>'`

### 6. Code Review Loop

For each task in `codeTasks` with status `pending` (process sequentially, one at a time):

1. Update status: `node scripts/cli.mjs update-task <session-id> <task-file> reviewing`
2. Read the task YAML file
3. Read `prompts/code-review.md` (relative to this skill directory) and use its content as the prompt for a sub-agent (Agent tool), passing the task file path as context
4. The sub-agent writes results under `review:` in the task YAML
5. Verify the task file was updated (read back to confirm `status: reviewed`)

### 7. Story Review Loop (if story review or all)

For each task in `storyTasks` with status `pending` (process sequentially, one at a time):

1. Update status to `reviewing`
2. Read the story task YAML file
3. For context, the task contains `taskFile` references — the agent reads code task YAMLs via these references to get diffs
4. Read `prompts/story-review.md` (relative to this skill directory) and use its content as the prompt for a sub-agent (Agent tool), passing the task file path as context
5. The sub-agent writes results under `review:` in the task YAML
6. Verify the task file was updated

### 8. Completion + User Review Phase

1. Inform user: "Review complete. YAML data is in `.audit/<session-id>/`."
2. Inform user: "Open http://localhost:3456 to review findings, add notes, and sign off."
3. User can interact with the web UI to confirm/dismiss findings, add notes, and sign off
4. User interaction data is saved to `review-notes.yaml` in the session directory

## Error Handling

- If `git-diff` returns no changes, inform user and exit gracefully
- If provider fetch fails, fall back to asking user to paste description
- If a skill fails mid-review, the task remains in `reviewing` status — on resume it will be reset to `pending`
- If `index.yaml` is corrupted, inform user and suggest starting a new session
