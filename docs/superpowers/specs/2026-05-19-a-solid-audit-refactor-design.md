# A-Solid Audit Refactor Design

Date: 2026-05-19

## Overview

Refactor A-Solid Audit from CLI-first to Web-first. Users configure scope, manage stories, review findings, and sign off in the browser. Claude Code terminal starts the server and executes AI review when the user clicks "Start AI Review" in the browser (skill polls for readiness).

## Architecture

Single HTTP server (Node.js, zero external dependencies) serves static frontend files and REST APIs. Data stored as YAML files in `.audit/` directory. AI review executed by Claude Code skill sub-agents, not the server.

### Server Lifecycle

- **Scope**: One server per project. Started by the skill, bound to a single `project-dir` (the project root). No directory switching via HTTP.
- **Startup**: Skill starts server on `/audit` invocation. Server scans `.audit/` to discover all sessions.
- **Multi-session**: Server serves all sessions in the project. Users can browse history and create new audits without restarting.
- **Skill-to-server handoff for AI review**: Skill polls `GET /api/sessions/:id` every few seconds to detect when session status becomes `ready` (user finished wizard). When `ready`, skill begins AI review loop. This replaces the "type go in terminal" pattern — user never leaves the browser.
- **Shutdown**: Server stops when the Claude Code session ends (skill process exits). No explicit stop endpoint. Server is stateless — all data is in YAML files, so restart is safe.

### Start flow

1. User runs `/audit` in Claude Code
2. Audit skill creates session, starts server, tells user to open browser URL
3. User configures everything in the browser (scope, stories, file mapping)
4. User clicks "Start AI Review" in browser. Frontend sets session status to `ready` via `PUT /api/sessions/:id/status`
5. Skill detects `ready` status via polling, begins code/story review loops, writes results to YAML
6. Frontend polls task progress during AI review, shows live updates
7. User reviews findings, confirms/dismisses, signs off in browser
8. User exports PDF from browser

## File Structure

```
skills/audit/
  SKILL.md                          # Updated: simplified flow
  prompts/
    code-review.md                  # Unchanged
    story-review.md                 # Unchanged
  scripts/
    cli.mjs                         # Slimmed: keep core ops for skill
    server/
      index.mjs                     # Entry: create HTTP server
      router.mjs                    # Route table: URL -> handler
      handlers/
        sessions.mjs                # Session list, session detail, status update
        audit.mjs                   # New audit, scope selection, git info
        stories.mjs                 # Story CRUD, provider fetch, file mapping
        tasks.mjs                   # Task list, task detail, progress
        notes.mjs                   # Confirm/dismiss, notes, sign-off
      static.mjs                    # Serve CSS/JS/images
    lib/
      yaml.mjs                      # YAML read/write (extracted from scripts/)
      git.mjs                       # Git operations (extended with branch/commit list)
      session.mjs                   # Session init/reset
      task.mjs                      # Task status updates
      mapping.mjs                   # Story-to-file mapping logic
      providers/
        jira.mjs                    # JIRA provider (unchanged)
    public/
      index.html                    # SPA entry
      styles.css                    # Global styles
      js/
        app.mjs                     # View routing, global state
        api.mjs                     # Fetch wrapper: all API calls
        views/
          home.mjs                  # History audit list, session navigation
          wizard.mjs                # New audit wizard (scope -> story -> mapping -> ready)
          progress.mjs              # AI review progress
          review.mjs                # Result review (confirm/dismiss/notes)
          summary.mjs               # Summary + Sign-off + PDF export
        components/
          task-detail.mjs           # Task detail rendering
          story-card.mjs            # Story display component
          file-tree.mjs             # File list/selection component
```

Existing `report-template.html` (1565 lines) is replaced by the split frontend files. Existing `scripts/*.mjs` modules are extracted into `scripts/lib/` for shared use between CLI and server.

## API Design

### Error Response Format

All API errors return JSON with a consistent shape:

```json
{ "error": "Human-readable message", "code": "VALIDATION_ERROR" }
```

Error codes: `VALIDATION_ERROR` (400), `NOT_FOUND` (404), `CONFLICT` (409), `PROVIDER_ERROR` (502).

### Session Management

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/sessions` | List all sessions (id, type, status, created, progress %) |
| `GET` | `/api/sessions/:id` | Single session detail (metadata + progress stats) |
| `POST` | `/api/sessions` | Create new session. Server generates session ID. Returns `{ id }`. |
| `PUT` | `/api/sessions/:id/status` | Update session status (body: `{ status }`). Skill polls for `ready`. |

### Session Status Lifecycle

```
created -> scoped -> ready -> reviewing -> completed
```

- `created`: session initialized, no scope set
- `scoped`: scope selected, code task YAMLs generated
- `ready`: user clicked "Start AI Review", signal for skill to begin
- `reviewing`: skill is running AI review loops
- `completed`: all reviews done, user in review/sign-off phase

### Audit Wizard

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/git/commits` | Latest 10 commits (hash, message, date, author) |
| `GET` | `/api/git/branches` | Local branch list |
| `POST` | `/api/sessions/:id/scope` | Set scope, generate code task YAMLs. Body: `{ method, ref }`. Sets status to `scoped`. |

### Story Management

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/providers` | List available story providers |
| `POST` | `/api/providers/:name/fetch` | Fetch stories from provider (body: `{ ids: [...] }`). Returns story array or 502 with `PROVIDER_ERROR`. |
| `GET` | `/api/sessions/:id/stories` | All story tasks in session |
| `POST` | `/api/sessions/:id/stories` | Create story task (body: `{ name, description, acceptance }`) |
| `PUT` | `/api/sessions/:id/stories/map` | Replace all file-story mappings (body: `{ mappings: [{ storyName, files: [...] }] }`) |

### Task & Review

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/sessions/:id/tasks` | All tasks (code + story). Task `:file` param is URL-encoded task file path. |
| `GET` | `/api/sessions/:id/tasks/:file` | Single task detail. `:file` is URL-encoded (e.g. `code-tasks%2Fsrc%2Fmain.mjs`). |
| `GET` | `/api/sessions/:id/notes` | Get review notes |
| `POST` | `/api/sessions/:id/notes` | Update task review (body: `{ file, status?, notes?, findings? }`) |
| `POST` | `/api/sessions/:id/summary` | Update summary notes + sign-off |

### Static Files

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | `index.html` |
| `GET` | `/js/*`, `/styles.css` | Static assets |

Existing API endpoints (`/api/session`, `/api/tasks`, `/api/notes`, `/api/summary`) are replaced by the new `:id`-scoped routes above.

## Frontend Views

Single-page app using hash-based routing (`#/home`, `#/wizard`, `#/progress/:id`, `#/review/:id`, `#/summary/:id`). JS modules loaded via ES module `<script type="module">`. No bundler, no framework — vanilla JS with Alpine.js for reactive bindings where useful (loaded from CDN).

### State Management

- **Session state**: fetched from server via API calls. Not cached locally — always reflects YAML truth.
- **Wizard state**: saved to `localStorage` under key `audit-wizard-<sessionId>` so user can resume after refresh. Cleared when wizard completes.
- **View routing**: hash-based. `window.onhashchange` triggers view render. User can bookmark or refresh any view.

### JS Module Structure

```
public/js/
  app.mjs              # Router, global init, shared state store
  api.mjs              # Fetch wrapper: all API calls in one place
  views/
    home.mjs           # Renders home view, fetches session list
    wizard.mjs         # 4-step wizard, manages wizard-local state
    progress.mjs       # Polls task progress, renders live updates
    review.mjs         # Task list + detail, confirm/dismiss
    summary.mjs        # Sign-off form + PDF export
  components/
    task-detail.mjs    # Renders single task's findings (used by review view)
    story-card.mjs     # Story display card (used by wizard + review)
    file-tree.mjs      # File list with checkboxes (used by wizard)
```

Each view module exports a `render(container, params)` function. `app.mjs` calls the active view's render on hash change. Views import `api.mjs` for data and component modules for shared UI pieces.

### View 1: Home (`#/home`)

- Project path display (read-only, set at server startup)
- History audit list: session ID, created time, scope type, status badge, progress percentage
- Click row -> navigate by status:
  - `scoped`/`ready`/`reviewing` -> `#/progress/:id`
  - `completed` -> `#/review/:id`
  - `created` -> `#/wizard/:id` (resume incomplete wizard)
- "New Audit" button -> `POST /api/sessions` -> navigate to `#/wizard/:id`

### View 2: New Audit Wizard (`#/wizard/:id`, 4 steps)

**Step 1 - Review Type**
- Two options: Code Review Only / Code + Story Alignment
- Selection saved to wizard state. Determines whether Step 3 is shown.
- "Next" enabled only after selection.

**Step 2 - Scope Selection**
- Three tabs: Uncommitted / Commits / Branch
- Uncommitted: show changed file count from working directory
- Commits: list latest 10 commits, user picks start and end (two dropdowns)
- Branch: two dropdowns for base and compare branch, default main...HEAD
- On confirm -> `POST /api/sessions/:id/scope` -> server generates code task YAMLs
- "Next" enabled only after scope is set.

**Step 3 - Story Collection & File Mapping** (skipped if Code Review Only)
- **3a - Story collection** (top section):
  - Choose provider (JIRA etc.) or Manual Input
  - JIRA: enter ticket ID -> fetch -> display description and AC
  - Manual: text inputs for description and AC
  - Add multiple stories, shown as card list
- **3b - File mapping** (bottom section, appears after at least one story added):
  - Left: diff file list with checkboxes (files from scope)
  - Right: added story cards
  - User selects files and associates to story (click to assign)
  - Many-to-many: one file can map to multiple stories
  - "Save Mapping" button -> `PUT /api/sessions/:id/stories/map`

**Step 4 - Ready**
- Summary: scope info, file count, story count (if any)
- "Start AI Review" button -> `PUT /api/sessions/:id/status` with `{ status: "ready" }` -> navigate to `#/progress/:id`
- Note displayed: "AI review runs in Claude Code terminal. Keep terminal open."

### View 3: AI Review Progress (`#/progress/:id`)

- Overall progress bar (X/Y tasks reviewed)
- Task list: file name, status (pending/reviewing/reviewed), score
- Auto-poll every 3 seconds via `GET /api/sessions/:id/tasks`
- Auto-navigate to `#/review/:id` when all tasks have status `reviewed`
- Header: "AI Review in progress. Keep Claude Code terminal open."
- If session status is still `scoped` (not yet `ready`): show "Waiting for AI review to begin..." with manual refresh option

### View 4: Result Review (`#/review/:id`)

- **Overview tab**: grade, score, findings by severity, needs-attention cards
- **Tasks tab**: task list + detail panel
  - Click task -> show findings, severity, code snippet, suggestion
  - Per-finding: confirm / dismiss (with reason dropdown)
  - Per-task: add notes
- Keyboard shortcuts: arrow keys / J K to navigate tasks, O for overview, S for summary

### View 5: Summary + Sign-off (`#/summary/:id`)

- Summary stats: total findings by severity, confirmed/dismissed breakdown
- Notes: overall review notes text input
- Sign-off: Name + Role inputs + Sign-off button (records date)
- Export PDF: browser-side generation (overview, findings, code snippets, sign-off page)

## Data Model

Existing YAML format extended with one new field: `session.status`.

### index.yaml

```yaml
session:
  id: "2026-05-19T10-30-00"
  status: "scoped"
  type: "code"
  scope:
    method: "commits"
    ref: "abc123 def456"
  created: "2026-05-19T10-30-00"
  completed: false
codeTasks:
  - file: "code-tasks/path.to.file.yaml"
    status: "pending"
storyTasks:
  - file: "story-tasks/story-name.yaml"
    status: "pending"
```

New field: `session.status` with values `created | scoped | ready | reviewing | completed`. The old `session.completed` boolean is replaced by `status == "completed"`.

`scope.commits` and `scope.branches` are NOT persisted. The wizard fetches commit/branch lists at runtime via `GET /api/git/commits` and `GET /api/git/branches`. Only `scope.method` and `scope.ref` are stored — these are sufficient to reconstruct the scope.

### Code task YAML (unchanged)

### Story task YAML (unchanged, already supports many-to-many files array)

### Review notes YAML (unchanged)

## SKILL.md Flow

Simplified. Skill no longer handles interactive questions. Polls server for session readiness.

1. **Startup**: start server, tell user to open browser URL. Server creates session on first `POST /api/sessions` from browser.
2. **Poll for ready**: skill polls `GET /api/sessions/:id` every 5 seconds, waiting for `session.status == "ready"`. If user resumes an unfinished session with status `reviewing`, skip to step 4.
3. **Begin review**: when status is `ready`, update status to `reviewing`. Confirm codeTasks are non-empty.
4. **Code Review Loop**: for each pending codeTask, update task status to reviewing, read task YAML, dispatch sub-agent with code-review.md prompt, write results. Update task status to reviewed.
5. **Story Review Loop** (if storyTasks exist): same pattern with story-review.md prompt.
6. **Completion**: set session status to `completed`. Tell user to review findings in browser.

## Error Handling

### Server
- **Path validation**: reject `..`, null bytes, absolute paths in URL params. Return `400 VALIDATION_ERROR`.
- **Body validation**: check required fields exist and have correct types. Return `400 VALIDATION_ERROR` with field name in message.
- **Session state guards**: each mutating endpoint checks session exists and is in the correct status for the operation (e.g., scope can only be set on `created` sessions). Return `409 CONFLICT` if wrong state.
- **Provider failures**: catch provider script errors, return `502 PROVIDER_ERROR` with original error message. Frontend shows failure and offers manual input fallback.
- **Git errors**: if `git diff` returns no changes or fails, return `400 VALIDATION_ERROR` with details. Frontend shows message and lets user pick a different scope.

### Frontend
- **Network errors**: display error toast with message, never silent. Toast auto-dismisses after 5 seconds.
- **Polling resilience**: Progress view tolerates single poll failures. After 3 consecutive failures, show warning banner with manual refresh button.
- **State conflicts**: if session status changes externally (e.g., AI review completes while user is on progress page), hash router re-renders the correct view on next poll.
- **Wizard state recovery**: on page refresh during wizard, restore state from `localStorage`. If session status has moved past `created`, redirect to appropriate view.

### AI Review Recovery
- Existing behavior: `reviewing` tasks reset to `pending` on skill resume
- New: if user refreshes browser during AI review, Progress view recovers from current YAML state via `GET /api/sessions/:id/tasks`

## PDF Export

Browser-side generation. Frontend JS library (loaded via CDN, e.g., jsPDF or html2pdf) renders overview, findings with code snippets, and sign-off page to PDF. No server involvement.
