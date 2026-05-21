# Full Project Scan Mode — Design Spec

## Overview

Add a new "Full Project Scan" review type to A-Solid Audit that scans the entire project codebase (or selected directories/files) for latent issues — security vulnerabilities, business logic errors, performance problems, dead code, and more. Unlike the existing diff-based review, this mode analyzes full file contents regardless of recent changes.

The scan follows a 3-phase AI pipeline: business context discovery → per-module review → cross-module analysis.

## Session Type & Status

**New session type:** `scan` (alongside `code` and `all`)

**Status rename:** `scoped` → `configured` (globally, for all session types). The status means "tasks have been generated, session is ready for review context and final confirmation." This name works for git-scoped sessions (scope set) and scan sessions (files selected and grouped).

State machine: `created → configured → ready → reviewing → completed`

## Wizard Flow

When user selects "Full Project Scan":

- **Step 1 — Review Type**: Three cards — "Code Review Only", "Code + Story Alignment", "Full Project Scan"
- **Step 2 — Scan Scope**: Replaces the git scope step
  - Toggle: "Scan entire project" (default) vs "Select directories/files"
  - Editable ignore list (textarea, one per line): `node_modules`, `.git`, `vendor`, `dist`, `build`, `__pycache__`, `.next`, `coverage`, `*.min.js`, `*.min.css`
  - Select mode: file/directory tree (reuse `file-tree.mjs`) to pick specific paths
  - "Confirm Scope" button → calls `POST /api/sessions/:id/scan-scope`
  - Shows count of discovered files and modules
- **Step 3 — Ready**: Review context input + confirmation
  - Free text area for project background, business rules, key constraints
  - URL input field (one per line) for documentation/wiki pages
  - If URLs provided, a sub-agent fetches and summarizes each URL's content
  - Combined context is written to `review-context.md`
  - Summary: type, file count, module count, scan phases

No story step for scan sessions — the wizard is 3 steps total.

## AI Review Pipeline

### Phase 1 — Business Context Discovery

A sub-agent scans key project files to understand the project:

- Reads: `README.md`, `package.json`/`Cargo.toml`/`go.mod`, entry points, config files, top-level directory listing
- Generates structured business context summary:
  - Project purpose and domain
  - Architecture and key patterns
  - Tech stack and key dependencies
  - Key data flows
  - Business-critical components
  - Known constraints or risks
- Output: written to `business-context.md` in the session directory

This context feeds into all subsequent review agents alongside the user-provided `review-context.md`.

### Phase 2 — Per-Module Review

Files grouped by directory/module (see Backend section). For each scan task:

- AI receives: module task YAML + business context + user context + full file contents
- Evaluates each finding across categories:
  1. **Security** — injection, auth, data exposure, input validation
  2. **Business Logic** — logic flaws, race conditions, state machine errors, edge cases
  3. **Error Handling** — missing catches, silent failures, resource leaks
  4. **Performance** — N+1 queries, memory leaks, unnecessary computation
  5. **Code Quality** — dead code, duplication, overly complex logic
  6. **Best Practices** — language-specific conventions, anti-patterns

Findings include a `category` field for grouping/filtering in the report.

### Phase 3 — Cross-Module Analysis

After all per-module reviews complete:

- Sub-agent receives: business context + summaries of all module reviews (scores, finding counts, top findings)
- Looks for cross-cutting issues:
  - Contract mismatches between modules
  - Inconsistent error handling patterns across layers
  - Security boundary gaps
  - Architectural concerns
  - Missing integrations or disconnected flows
- Output: a special `cross-module.yaml` task with categorized findings

## Backend

### New Module: `lib/scanner.mjs`

File traversal and module grouping:

1. Walk project directory, applying ignore list filters
2. If `paths` specified, only include matching paths
3. Filter out binary files (images, fonts, lock files, archives, minified files)
4. Group files by top-level directory (e.g., `src/handlers/` + `src/lib/` → one task under `src`)
5. Split directories exceeding ~2000 lines into sub-directory tasks
6. Generate scan task YAMLs for each module group

### Scan Task YAML Structure

```yaml
name: "src/handlers"
type: "scan"
status: "pending"
files:
  - path: "src/handlers/users.mjs"
    language: "javascript"
  - path: "src/handlers/auth.mjs"
    language: "javascript"
review:
  score: 0
  summary: ""
  findings:
    - severity: critical
      category: security
      description: "SQL injection vulnerability..."
      file: "src/handlers/users.mjs"
      line: 42
      code: "..."
      suggestion: "Use parameterized queries"
  positives: []
```

### Cross-Module Task

Special task created after all per-module reviews complete:

```yaml
name: "Cross-Module Analysis"
type: "cross-module"
status: "pending"
modules:
  - name: "src/handlers"
    score: 6
    findings: 5
  - name: "src/lib"
    score: 8
    findings: 2
review:
  score: 0
  summary: ""
  findings: []
  positives: []
```

### New API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/sessions/:id/scan-scope` | Set scan scope, traverse files, generate scan task YAMLs |
| POST | `/api/sessions/:id/fetch-url` | Fetch and summarize a URL, return content for context |
| GET | `/api/sessions/:id/business-context` | Read generated business context (if exists) |

**POST /api/sessions/:id/scan-scope** request body:

```json
{
  "paths": ["src/", "lib/"],
  "ignore": ["node_modules", ".git", "dist"],
  "type": "scan"
}
```

Empty `paths` = full project scan. Returns: `{ scope: { method: "scan", paths: [...], ignore: [...] }, taskCount: 12, fileCount: 87 }`.

**POST /api/sessions/:id/fetch-url** request body:

```json
{ "url": "https://docs.example.com/architecture" }
```

Returns: `{ content: "summarized content..." }`. The AI agent handles fetching and summarization.

### Modified Files

- `lib/session.mjs` — rename `"scoped"` to `"configured"` in `VALID_STATUSES` and transitions
- `lib/yaml.mjs` — add `writeScanTaskYaml` (with `files` array, no `diff`) and `writeCrossModuleTaskYaml`
- `lib/mapping.mjs` — status string `"scoped"` → `"configured"`
- `server/handlers/audit.mjs` — add scan scope route
- `server/handlers/sessions.mjs` — add URL fetch route, business context route
- `server/handlers/tasks.mjs` — handle `scan` and `cross-module` task types
- `SKILL.md` — add scan session flow section

### Status Rename (scoped → configured)

All occurrences of `"scoped"` as a session status value must be updated:

- `lib/session.mjs`: `VALID_STATUSES` array and `transitions` object
- `lib/mapping.mjs`: `setScope` writes `status: "scoped"` → `"configured"`
- `server/handlers/audit.mjs`: error messages referencing "scoped"
- Frontend: `views/wizard.mjs` checks for `session.status === "scoped"` → `"configured"`
- Any localStorage restore logic checking for scoped status

## Frontend Changes

### Wizard Step 1 — Third Review Type Card

Add "Full Project Scan" card:

```
+---------------------------------------------+
| 🔍 Full Project Scan                        |
| Scan the entire codebase for latent issues: |
| security, logic errors, performance, etc.   |
+---------------------------------------------+
```

### Wizard Step 2 — Scan Scope UI (scan type only)

- Toggle: "Scan entire project" vs "Select directories/files"
- Full project mode: editable ignore list (textarea)
- Select mode: file/directory tree for picking paths
- "Confirm Scope" button → `POST /api/sessions/:id/scan-scope`
- Display discovered file/module counts after scope confirmation

### Wizard Step 3 — Enhanced Context Input (scan type)

- Free text area for project background
- URL input field (one per line)
- "Fetch URLs" button → calls `POST /api/sessions/:id/fetch-url` for each
- Fetched content merged with free text into `review-context.md`
- Summary: review type, file count, module count, phases

### Review UI — Category Support

- Finding cards show category badge (color-coded)
- Category filter dropdown/bar in the review view
- Categories: Security, Business Logic, Error Handling, Performance, Code Quality, Best Practices
- Cross-module findings displayed as a special task in the task list

### Constants Update

Add to `constants.mjs`:

```js
export const FINDING_CATEGORIES = {
  security: { label: "Security", color: "red" },
  "business-logic": { label: "Business Logic", color: "orange" },
  "error-handling": { label: "Error Handling", color: "yellow" },
  performance: { label: "Performance", color: "blue" },
  "code-quality": { label: "Code Quality", color: "purple" },
  "best-practices": { label: "Best Practices", color: "gray" },
};
```

## SKILL.md Orchestrator — Scan Flow

Add to SKILL.md after the existing Code Review and Story Review sections:

### Scan Review Flow (if `type === "scan"`)

1. **Fetch session** — type `scan`, status `ready`
2. **Phase 1 — Business Context Discovery**
   - Read key project files: `README.md`, package manifest, entry points, directory listing
   - Dispatch sub-agent with `prompts/scan-business-context.md`
   - Sub-agent writes `business-context.md` in the session directory
3. **Phase 2 — Per-Module Review**
   - For each task with `type === "scan"` and status `pending`:
     - `node scripts/cli.mjs update-task <session-id> <task-file> reviewing`
     - Read the task YAML for the file list
     - Read `business-context.md` + `review-context.md`
     - Dispatch sub-agent with `prompts/scan-review.md`, passing task file path and session directory
     - Sub-agent reads full file contents, reviews, writes results under `review:`, sets `status: reviewed`
     - Verify the file was updated
4. **Phase 3 — Cross-Module Analysis**
   - Collect summaries from all module reviews (scores, finding counts)
   - Dispatch sub-agent with `prompts/cross-module-review.md`
   - Sub-agent writes `cross-module.yaml` task with findings
   - Set task status to `reviewed`
5. **Completion** — session transitions to `completed`

## New Files

| File | Purpose |
|------|---------|
| `lib/scanner.mjs` | File traversal, binary detection, module grouping, scan task YAML generation |
| `prompts/scan-business-context.md` | Phase 1 prompt: generate business context from key project files |
| `prompts/scan-review.md` | Phase 2 prompt: per-module scan with 6 finding categories |
| `prompts/cross-module-review.md` | Phase 3 prompt: cross-module analysis |

## Modified Files Summary

| File | Change |
|------|--------|
| `lib/session.mjs` | Status `"scoped"` → `"configured"` |
| `lib/mapping.mjs` | Status string update |
| `lib/yaml.mjs` | Add `writeScanTaskYaml`, `writeCrossModuleTaskYaml` |
| `server/handlers/audit.mjs` | Add scan scope route |
| `server/handlers/sessions.mjs` | Add URL fetch + business context routes |
| `server/handlers/tasks.mjs` | Handle `scan`/`cross-module` task types |
| `SKILL.md` | Add scan session flow section |
| `public/js/views/wizard.mjs` | Third review type card, scan scope step, context URLs |
| `public/js/views/review.mjs` | Category badges and filtering |
| `public/js/constants.mjs` | Finding category definitions |
