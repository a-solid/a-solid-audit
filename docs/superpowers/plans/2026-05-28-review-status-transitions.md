# Review Status Transition Fix

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix broken `validateTransition` in reviews.mjs, and switch SKILL.md + prompt files from generic HTTP descriptions to curl commands.

**Architecture:** reviews.mjs reads task status from index.yaml via `getTask()` instead of the task file (which no longer has status). SKILL.md and all three prompt files switch to concrete curl commands for all API calls.

**Tech Stack:** Node.js ESM, curl CLI.

---

## File Structure

| File | Change | Responsibility |
|------|--------|---------------|
| `skills/audit/scripts/server/handlers/reviews.mjs` | Modify lines 4, 54-55 | Read status from index.yaml, not task file |
| `skills/audit/SKILL.md` | Modify throughout | Replace HTTP descriptions with curl commands |
| `skills/audit/prompts/code-review.md` | Modify lines 29-51, 82-84 | Switch to curl for review submission and notes |
| `skills/audit/prompts/story-review.md` | Modify lines 31-53, 76-80 | Switch to curl for review submission and notes |
| `skills/audit/prompts/project-review.md` | Modify lines 67-98, 143-145 | Switch to curl for review submission and notes |

---

### Task 1: Fix reviews.mjs — read status from index.yaml

**Files:**
- Modify: `skills/audit/scripts/server/handlers/reviews.mjs:4, 54-55`

- [ ] **Step 1: Update imports and status lookup**

Replace the import on line 4 and lines 54-55. Current file has:

```javascript
// line 4
import { readYaml } from "../../lib/yaml.mjs";

// lines 54-55
const currentTask = readYaml(taskPath);
validateTransition(currentTask.status, status);
```

Replace line 4 with:
```javascript
import { getTask } from "../../lib/task.mjs";
```

Replace lines 54-55 with:
```javascript
const currentTask = getTask(reportsDir, safeSid, safeTaskFile);
if (!currentTask) return errorResponse(res, "Task not found", "NOT_FOUND", 404);
validateTransition(currentTask.status, status);
```

- [ ] **Step 2: Verify server starts**

Run:
```bash
node skills/audit/scripts/server/index.mjs /tmp/test-reviews 3457 &
sleep 2
curl -s http://localhost:3457/api/sessions
kill %1
rm -rf /tmp/test-reviews
```
Expected: `[]`

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/server/handlers/reviews.mjs
git commit -m "fix: reviews.mjs reads task status from index.yaml via getTask"
```

---

### Task 2: Update SKILL.md — use curl commands

**Files:**
- Modify: `skills/audit/SKILL.md`

- [ ] **Step 1: Rewrite SKILL.md with curl commands**

Replace the entire file content after the frontmatter (lines 6 onward) with:

```markdown
# A-Solid Audit — Orchestrator

## Available Commands

All commands run via `node scripts/cli.mjs <command>`. Scripts are located in this skill's directory (`skills/audit/scripts/`). The project root is auto-detected via git — **do not pass `--project-dir`**; the script finds the git root automatically. The `.audit/` data directory is created under the project root.

- `reset-reviewing <session-id>` — Reset reviewing tasks to pending (for resume after interruption)
- `server [port]` — Start the web server (default: 3456)

## Autonomy

This skill operates with **high autonomy**. Do not ask for permission between individual task reviews. Only pause at defined checkpoints: startup (wait for user), begin review (wait for `start review`), and project grouping (wait for user to confirm groups).

## Process

### 1. Startup

1. Start the server: `node scripts/cli.mjs server` (background process)
2. Verify the server is running:
   ```bash
   curl -s http://localhost:3456/api/sessions
   ```
   If this fails, the server didn't start.
3. Tell the user: "A-Solid Audit server running at http://localhost:3456 — open this URL in your browser. When you finish configuring scope and stories, come back here and type `start review <session-id>`."
4. **Stop and wait.** Do NOT poll.

### 2. Begin Review (triggered by user saying `start review <session-id>`)

1. Parse `<session-id>` from the user's message.
2. Confirm the session exists and has status `ready` (or `reviewing` for resume):
   ```bash
   curl -s http://localhost:3456/api/sessions/<session-id>
   ```
3. If not found or wrong status, tell user to finish configuring in the browser first.
4. Transition to reviewing:
   ```bash
   curl -s -X PUT http://localhost:3456/api/sessions/<session-id>/status \
     -H 'Content-Type: application/json' \
     -d '{"status":"reviewing"}'
   ```
5. Get the task list:
   ```bash
   curl -s http://localhost:3456/api/sessions/<session-id>/tasks
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

When user types "group <session-id>":

1. Confirm status is `scanned`:
   ```bash
   curl -s http://localhost:3456/api/sessions/<session-id>
   ```
2. Transition to grouping:
   ```bash
   curl -s -X PUT http://localhost:3456/api/sessions/<session-id>/status \
     -H 'Content-Type: application/json' \
     -d '{"status":"grouping"}'
   ```
3. Dispatch a sub-agent with `prompts/project-group.md`, passing session-id as context. The sub-agent:
   - Reads `.audit/<session-id>/graph-data.json`
   - Analyzes the dependency graph
   - Groups files into logical modules
   - Writes `.audit/<session-id>/groups.json`
4. After sub-agent completes, the web UI will poll and detect `groups.json`
5. User reviews and adjusts groups in the browser UI
6. User clicks "Confirm Groups" which triggers task generation
7. Tell user: "Grouping complete. Review and adjust groups at http://localhost:3456."

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
```

- [ ] **Step 2: Commit**

```bash
git add skills/audit/SKILL.md
git commit -m "docs: switch SKILL.md API calls to curl commands"
```

---

### Task 3: Update code-review.md — use curl commands

**Files:**
- Modify: `skills/audit/prompts/code-review.md`

- [ ] **Step 1: Replace the Submitting Results section (lines 26-74)**

Replace lines 26-74 (from `## Submitting Results` through `## Review Context File`) with:

```markdown
## Submitting Results

Submit your review via curl. You will receive `session-id` and `task-file` as context.

```bash
curl -s -X POST http://localhost:3456/api/sessions/<session-id>/tasks/review \
  -H 'Content-Type: application/json' \
  -d '{
    "file": "<task-file>",
    "status": "reviewed",
    "score": <0-10>,
    "review": {
      "summary": "<2-3 sentence summary>",
      "findings": [
        {
          "severity": "<critical|major|minor|info>",
          "description": "<specific finding>",
          "file": "<file path>",
          "line": <line number>,
          "code": "<multi-line code snippet>",
          "suggestion": "<fix recommendation>"
        }
      ],
      "positives": ["<what was done well>"]
    }
  }'
```

### Score Guide

- **0-2:** Severe, systemic problems — critical security vulnerabilities or data loss
- **3-4:** Critical issues — exploitable security vulnerability or major logic bugs
- **5-6:** Significant concerns — should address before merge
- **7-8:** Minor issues — suggestions for improvement
- **9-10:** Clean code — excellent quality

### Severity Definitions

- **Critical:** Security vulnerability, data loss risk, production-breaking bug
- **Major:** Logic error, significant performance issue, missing error handling
- **Minor:** Code style, naming, minor optimization
- **Info:** Suggestions, alternative approaches

### Field Rules

- `description` is required for each finding
- `file`, `line`, `code`, `suggestion` are optional — include when helpful
- Provide `suggestion` for critical and major findings
- `findings` and `positives` arrays may be empty — omit or send `[]`

## Review Context File

Read `review-context.md` from the session directory (`.audit/<session-id>/review-context.md`). The `## User Context` section has project background and focus areas — use it to prioritize your review.

After reviewing, append cross-file observations:

```bash
curl -s -X POST http://localhost:3456/api/sessions/<session-id>/review-notes \
  -H 'Content-Type: application/json' \
  -d '{"notes": "- <your observation>"}'
```

This atomically appends to the `## Review Notes` section.
```

- [ ] **Step 2: Commit**

```bash
git add skills/audit/prompts/code-review.md
git commit -m "docs: switch code-review.md API calls to curl commands"
```

---

### Task 4: Update story-review.md — use curl commands

**Files:**
- Modify: `skills/audit/prompts/story-review.md`

- [ ] **Step 1: Replace the Submitting Results section (lines 27-69)**

Replace lines 27-69 (from `## Submitting Results` through `## Review Context File`) with:

```markdown
## Submitting Results

Submit your review via curl. You will receive `session-id` and `task-file` as context.

```bash
curl -s -X POST http://localhost:3456/api/sessions/<session-id>/tasks/review \
  -H 'Content-Type: application/json' \
  -d '{
    "file": "<task-file>",
    "status": "reviewed",
    "score": <0-10>,
    "review": {
      "summary": "<2-3 sentence summary>",
      "findings": [
        {
          "severity": "<met|partially-met|not-met>",
          "description": "<evaluation of implementation>",
          "criteria": "<original AC text>",
          "file": "<file path>",
          "code": "<multi-line code snippet>",
          "suggestion": "<what should be added or changed>"
        }
      ],
      "gaps": ["<missing implementation>"],
      "positives": ["<what was done well>"]
    }
  }'
```

### Score Guide

- **0-2:** Major gaps — most AC items not implemented or fundamentally wrong
- **3-4:** Significant gaps — key AC items missing
- **5-6:** Partial alignment — some AC met, some missing
- **7-8:** Minor gaps — mostly aligned with small discrepancies
- **9-10:** Full alignment — all AC met

### Field Rules

- `description` is required for each finding
- `suggestion` is required for `not-met` and `partially-met`, optional for `met`
- `criteria`, `file`, `code` are optional — include when helpful
- `findings`, `gaps`, `positives` arrays may be empty — omit or send `[]`

## Review Context File

Read `review-context.md` from the session directory (`.audit/<session-id>/review-context.md`). The `## User Context` section has project background and focus areas — use it to prioritize your review.

After reviewing, append cross-file observations:

```bash
curl -s -X POST http://localhost:3456/api/sessions/<session-id>/review-notes \
  -H 'Content-Type: application/json' \
  -d '{"notes": "- <your observation>"}'
```

This atomically appends to the `## Review Notes` section.
```

- [ ] **Step 2: Commit**

```bash
git add skills/audit/prompts/story-review.md
git commit -m "docs: switch story-review.md API calls to curl commands"
```

---

### Task 5: Update project-review.md — use curl commands

**Files:**
- Modify: `skills/audit/prompts/project-review.md`

- [ ] **Step 1: Replace the Submit Results section (lines 65-98) and Update Review Context section (lines 138-145)**

Replace lines 65-98 (from `### 6. Submit Results` through the scoring/finding guidelines) with:

```markdown
### 6. Submit Results

Submit your review via curl:

```bash
curl -s -X POST http://localhost:3456/api/sessions/<session-id>/tasks/review \
  -H 'Content-Type: application/json' \
  -d '{
    "file": "<task-file>",
    "status": "reviewed",
    "score": <0-10>,
    "review": {
      "summary": "<2-3 sentence summary of findings>",
      "findings": [
        {
          "severity": "critical|major|minor|info",
          "category": "security|bug|logic|performance|best-practice",
          "description": "<what the issue is and why it matters>",
          "file": "<relative file path>",
          "line": <line number>,
          "code": "<relevant code snippet>",
          "suggestion": "<how to fix it>"
        }
      ],
      "positives": ["<things done well>"],
      "overview": {
        "diagram": "<Mermaid graph TD diagram of the call chain>",
        "description": "<1-3 sentence execution flow description>"
      }
    }
  }'
```

**Scoring guide**:
- 9-10: No issues found, excellent code quality
- 7-8: Only minor/info findings
- 5-6: Some major findings but no critical security vulnerabilities
- 3-4: Critical security issue or multiple major bugs
- 0-2: Severe, systemic problems throughout the chunk

**Finding guidelines**:
- Every finding MUST include `file`, `line`, and `code` fields
- Every finding MUST include a `category` field
- Be specific — cite exact line numbers and code snippets
- Do NOT report stylistic preferences — only report genuine security, bug, logic, or performance issues
- `critical` is reserved for exploitable security vulnerabilities or data loss scenarios
```

Then replace lines 138-145 (the `### 8. Update Review Context` section) with:

```markdown
### 8. Update Review Context

Append cross-file observations:

```bash
curl -s -X POST http://localhost:3456/api/sessions/<session-id>/review-notes \
  -H 'Content-Type: application/json' \
  -d '{"notes": "- <your observation>"}'
```

This atomically appends to the `## Review Notes` section. Focus on:
- How files in this chunk relate to previously reviewed chunks
- Shared patterns (e.g., "all handlers in this chunk use the same auth middleware")
- Potential cross-chunk concerns (e.g., "this chunk writes to table X, which chunk-003 reads from")
```

- [ ] **Step 2: Commit**

```bash
git add skills/audit/prompts/project-review.md
git commit -m "docs: switch project-review.md API calls to curl commands"
```

---

### Task 6: End-to-end verification

- [ ] **Step 1: Test the review API with status transition**

```bash
node -e "
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createSession, updateSessionStatus } from './skills/audit/scripts/lib/session.mjs';
import { updateTask, getTask } from './skills/audit/scripts/lib/task.mjs';
import { readYaml, writeYaml } from './skills/audit/scripts/lib/yaml.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'test-review-'));
const { id } = createSession(tmp, '2026-05-28-review-test', { type: 'code' });
const sessionDir = path.join(tmp, id);

// Create task file and index entry
const tasksDir = path.join(sessionDir, 'code-tasks');
fs.writeFileSync(path.join(tasksDir, 'a.yaml'), 'name: test.js\nlanguage: javascript\ndiff: \"+hello\"\nreview:\n  score: 0\n  summary: \"\"\n  findings: []\n  positives: []\n', 'utf-8');
const idx = readYaml(path.join(sessionDir, 'index.yaml'));
idx.codeTasks = [{ file: 'code-tasks/a.yaml', status: 'pending' }];
writeYaml(path.join(sessionDir, 'index.yaml'), idx);

// Transition session to reviewing
updateSessionStatus(tmp, id, 'ready');
updateSessionStatus(tmp, id, 'reviewing');

// Test pending -> reviewing
const r1 = updateTask(tmp, id, 'code-tasks/a.yaml', 'reviewing');
console.log('pending->reviewing:', r1.status === 'reviewing' ? 'PASS' : 'FAIL');

// Test reviewing -> reviewed
const r2 = updateTask(tmp, id, 'code-tasks/a.yaml', 'reviewed', 8, { summary: 'good', findings: [], positives: [] });
console.log('reviewing->reviewed:', r2.status === 'reviewed' ? 'PASS' : 'FAIL');

// Verify getTask reads from index
const task = getTask(tmp, id, 'code-tasks/a.yaml');
console.log('getTask status:', task.status === 'reviewed' ? 'PASS' : 'FAIL');

fs.rmSync(tmp, { recursive: true });
console.log('All review transition tests PASSED.');
"
```
Expected: all three assertions print `PASS`.

- [ ] **Step 2: Verify server starts and review endpoint works**

```bash
node skills/audit/scripts/server/index.mjs /tmp/test-review-e2e 3458 &
sleep 2
# Create session
SID=$(curl -s -X POST http://localhost:3458/api/sessions -H 'Content-Type: application/json' -d '{"type":"code"}' | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
echo "Session: $SID"
# Confirm server returns session
curl -s "http://localhost:3458/api/sessions/$SID"
kill %1
rm -rf /tmp/test-review-e2e
```
Expected: session JSON returned without error.

---

## Self-Review

**Spec coverage:**
- reviews.mjs reads status from index.yaml → Task 1
- SKILL.md uses curl → Task 2
- code-review.md uses curl → Task 3
- story-review.md uses curl → Task 4
- project-review.md uses curl → Task 5
- Manual verification → Task 6

**Placeholder scan:** No TBD/TODO found. All steps have complete code.

**Type consistency:** `getTask` returns `{ type, file, status, ...task }` — `status` field matches `validateTransition`'s expected string input.
