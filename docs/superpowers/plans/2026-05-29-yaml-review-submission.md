# YAML Review Submission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change review submission from JSON to YAML so multi-line `code` fields are preserved natively, with direct append to task YAML files.

**Architecture:** New `POST /api/sessions/:id/tasks/review-yaml?file=<task>` endpoint accepts `text/yaml` body, validates it with the existing `parseYaml`, then appends raw text to the task YAML file. Initial task YAML generation stops writing empty `review` defaults. All three prompt files switch to YAML curl examples.

**Tech Stack:** Node.js, custom YAML parser/serializer, existing HTTP router.

---

### Task 1: Add `appendReview` to task.mjs

**Files:**
- Modify: `skills/audit/scripts/lib/task.mjs`

- [ ] **Step 1: Add the `appendReview` function**

Add after the existing `updateTask` function (after line 56):

```js
export function appendReview(reportsDir, sid, taskFile, yamlText) {
  const safeSid = sanitizePath(sid);
  const sessionDir = path.join(reportsDir, safeSid);
  const safeTaskFile = sanitizeFilePath(taskFile);
  const taskPath = path.join(sessionDir, safeTaskFile);
  const indexPath = path.join(sessionDir, "index.yaml");

  if (!fs.existsSync(taskPath)) throw new AppError("Task file not found", "NOT_FOUND", 404);
  if (!fs.existsSync(indexPath)) throw new AppError("Session not found: " + safeSid, "NOT_FOUND", 404);

  fs.appendFileSync(taskPath, "\n---\n" + yamlText);

  // Update status in index.yaml
  const index = readYaml(indexPath);
  const allTaskGroups = ["codeTasks", "storyTasks", "projectTasks"];
  for (const group of allTaskGroups) {
    const ref = (index[group] || []).find(t => t.file === safeTaskFile);
    if (ref) {
      ref.status = "reviewed";
      break;
    }
  }
  writeIndexYaml(indexPath, index);

  // Check if all tasks are reviewed
  const allReviewed = allTaskGroups.every(group =>
    (index[group] || []).every(t => t.status === "reviewed")
  );
  if (allReviewed) {
    updateSessionStatus(reportsDir, safeSid, "completed");
  }

  return { file: safeTaskFile, status: "reviewed" };
}
```

- [ ] **Step 2: Verify syntax**

Run: `node -c skills/audit/scripts/lib/task.mjs`
Expected: no output (syntax OK)

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/lib/task.mjs
git commit -m "feat: add appendReview function for YAML review submission"
```

---

### Task 2: Add review-yaml endpoint to reviews.mjs

**Files:**
- Modify: `skills/audit/scripts/server/handlers/reviews.mjs`

- [ ] **Step 1: Add the new route handler**

Add `appendReview` to the import from `task.mjs` (line 4):

```js
import { updateTask, appendReview } from "../../lib/task.mjs";
```

Add `parseYaml` import — insert after the existing `readYaml` import (line 7):

```js
import { readYaml, parseYaml } from "../../lib/yaml.mjs";
```

Wait — `parseYaml` is not exported. It's a local function in `yaml.mjs`. Check: the existing `readYaml` calls `parseYaml` internally. We need to either export `parseYaml` or use `readYaml` on a temp file. The simplest approach: export `parseYaml` from `yaml.mjs`.

**Correction:** First export `parseYaml` from `yaml.mjs`.

In `yaml.mjs`, the `parseYaml` function is at line 95. It's not exported. Change line 95 from:

```js
function parseYaml(content) {
```

to:

```js
export function parseYaml(content) {
```

Now in `reviews.mjs`, update the import (line 7):

```js
import { readYaml, parseYaml } from "../../lib/yaml.mjs";
```

Then add the new route handler inside `registerReviewRoutes`, after the existing POST handler (after line 67):

```js
  // POST /api/sessions/:id/tasks/review-yaml?file=<task-file> — body: raw YAML text
  router.post("/api/sessions/:id/tasks/review-yaml", async (req, res, params, query) => {
    try {
      const raw = await readBody(req);
      if (!raw || !raw.trim()) {
        return errorResponse(res, "Empty body", "VALIDATION_ERROR", 400);
      }

      const taskFile = query.get("file");
      if (!taskFile) {
        return errorResponse(res, "Missing query parameter: file", "VALIDATION_ERROR", 400);
      }

      const parsed = parseYaml(raw);
      if (!parsed || typeof parsed.score !== "number") {
        return errorResponse(res, "Invalid YAML: missing or non-numeric score", "VALIDATION_ERROR", 400);
      }

      const result = appendReview(reportsDir, params.id, taskFile, raw.trim());

      const safeSid = sanitizePath(params.id);
      const index = readYaml(path.join(reportsDir, safeSid, "index.yaml"));
      jsonResponse(res, { ok: true, file: result.file, status: result.status, sessionStatus: index.session.status });
    } catch (e) {
      if (e instanceof AppError) return errorResponse(res, e.message, e.code, e.status);
      console.error(e);
      errorResponse(res, "Internal server error", "INTERNAL_ERROR", 500);
    }
  });
```

- [ ] **Step 2: Verify syntax**

Run: `node -c skills/audit/scripts/lib/yaml.mjs && node -c skills/audit/scripts/server/handlers/reviews.mjs`
Expected: no output (syntax OK)

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/lib/yaml.mjs skills/audit/scripts/server/handlers/reviews.mjs
git commit -m "feat: add review-yaml endpoint for YAML review submission"
```

---

### Task 3: Remove review defaults from task YAML writers

**Files:**
- Modify: `skills/audit/scripts/lib/yaml.mjs` (lines 268-295)

- [ ] **Step 1: Remove `review` from `writeCodeTaskYaml`**

Change lines 268-276 from:

```js
export function writeCodeTaskYaml(filePath, data) {
  writeYaml(filePath, {
    name: data.name,
    language: data.language || "unknown",
    diff: data.diff || "",
    review: data.review || { score: 0, summary: "", findings: [], positives: [] },
  });
}
```

to:

```js
export function writeCodeTaskYaml(filePath, data) {
  writeYaml(filePath, {
    name: data.name,
    language: data.language || "unknown",
    diff: data.diff || "",
  });
}
```

- [ ] **Step 2: Remove `review` from `writeStoryTaskYaml`**

Change lines 278-285 from:

```js
export function writeStoryTaskYaml(filePath, data) {
  writeYaml(filePath, {
    name: data.name,
    description: data.description || "",
    acceptance: data.acceptance || "",
    files: data.files || [],
    review: data.review || { score: 0, summary: "", findings: [], gaps: [], positives: [] },
  });
}
```

to:

```js
export function writeStoryTaskYaml(filePath, data) {
  writeYaml(filePath, {
    name: data.name,
    description: data.description || "",
    acceptance: data.acceptance || "",
    files: data.files || [],
  });
}
```

- [ ] **Step 3: Remove `review` from `writeProjectTaskYaml`**

Change lines 287-295 from:

```js
export function writeProjectTaskYaml(filePath, data) {
  writeYaml(filePath, {
    name: data.name,
    type: data.type || "unknown",
    entry: data.entry || null,
    files: data.files || [],
    review: data.review || { score: 0, summary: "", findings: [], positives: [] },
  });
}
```

to:

```js
export function writeProjectTaskYaml(filePath, data) {
  writeYaml(filePath, {
    name: data.name,
    type: data.type || "unknown",
    entry: data.entry || null,
    files: data.files || [],
  });
}
```

- [ ] **Step 4: Verify syntax**

Run: `node -c skills/audit/scripts/lib/yaml.mjs`
Expected: no output (syntax OK)

- [ ] **Step 5: Commit**

```bash
git add skills/audit/scripts/lib/yaml.mjs
git commit -m "feat: remove review defaults from task YAML writers"
```

---

### Task 4: Update code-review.md prompt

**Files:**
- Modify: `skills/audit/prompts/code-review.md`

- [ ] **Step 1: Replace JSON curl example with YAML**

Change lines 29-51 from:

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

to:

```bash
curl -s -X POST "http://localhost:3456/api/sessions/<session-id>/tasks/review-yaml?file=<task-file>" \
  -H 'Content-Type: text/yaml' \
  --data-binary 'score: <0-10>
review:
  summary: "<2-3 sentence summary>"
  findings:
    - severity: <critical|major|minor|info|positive>
      description: "<specific finding>"
      file: "<file path>"
      line: <line number>
      code: |
        <actual code snippet, preserved with line breaks>
      suggestion: "<fix recommendation>"
  positives:
    - "<what was done well>"'
```

- [ ] **Step 2: Update field rules to note code should use `|` for multi-line**

Change line 72 from:

```
- `file`, `line`, `code`, `suggestion` are optional — include when helpful
```

to:

```
- `file`, `line`, `code`, `suggestion` are optional — include when helpful
- Use YAML `|` block scalar for multi-line `code` values — do NOT flatten code into a single line
```

- [ ] **Step 3: Commit**

```bash
git add skills/audit/prompts/code-review.md
git commit -m "feat: switch code-review prompt to YAML submission format"
```

---

### Task 5: Update story-review.md prompt

**Files:**
- Modify: `skills/audit/prompts/story-review.md`

- [ ] **Step 1: Replace JSON curl example with YAML**

Change lines 32-54 from:

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

to:

```bash
curl -s -X POST "http://localhost:3456/api/sessions/<session-id>/tasks/review-yaml?file=<task-file>" \
  -H 'Content-Type: text/yaml' \
  --data-binary 'score: <0-10>
review:
  summary: "<2-3 sentence summary>"
  findings:
    - severity: <met|partially-met|not-met>
      description: "<evaluation of implementation>"
      criteria: "<original AC text>"
      file: "<file path>"
      code: |
        <actual code snippet, preserved with line breaks>
      suggestion: "<what should be added or changed>"
  gaps:
    - "<missing implementation>"
  positives:
    - "<what was done well>"'
```

- [ ] **Step 2: Update field rules to note code should use `|` for multi-line**

Change line 68 from:

```
- `criteria`, `file`, `code` are optional — include when helpful
```

to:

```
- `criteria`, `file`, `code` are optional — include when helpful
- Use YAML `|` block scalar for multi-line `code` values — do NOT flatten code into a single line
```

- [ ] **Step 3: Commit**

```bash
git add skills/audit/prompts/story-review.md
git commit -m "feat: switch story-review prompt to YAML submission format"
```

---

### Task 6: Update project-review.md prompt

**Files:**
- Modify: `skills/audit/prompts/project-review.md`

- [ ] **Step 1: Replace JSON curl example with YAML**

Change lines 70-96 from:

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
          "severity": "critical|major|minor|info|positive",
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

to:

```bash
curl -s -X POST "http://localhost:3456/api/sessions/<session-id>/tasks/review-yaml?file=<task-file>" \
  -H 'Content-Type: text/yaml' \
  --data-binary 'score: <0-10>
review:
  summary: "<2-3 sentence summary of findings>"
  findings:
    - severity: <critical|major|minor|info|positive>
      category: <security|bug|logic|performance|best-practice>
      description: "<what the issue is and why it matters>"
      file: "<relative file path>"
      line: <line number>
      code: |
        <actual code snippet, preserved with line breaks>
      suggestion: "<how to fix it>"
  positives:
    - "<things done well>"
overview:
  diagram: "<Mermaid graph TD diagram of the call chain>"
  description: "<1-3 sentence execution flow description>"'
```

- [ ] **Step 2: Update finding guidelines to note code should use `|`**

Change lines 106-108 from:

```
- Every finding MUST include `file`, `line`, and `code` fields
- Every finding MUST include a `category` field
- Be specific — cite exact line numbers and code snippets
```

to:

```
- Every finding MUST include `file`, `line`, and `code` fields
- Every finding MUST include a `category` field
- Use YAML `|` block scalar for multi-line `code` values — do NOT flatten code into a single line
- Be specific — cite exact line numbers and code snippets
```

- [ ] **Step 3: Commit**

```bash
git add skills/audit/prompts/project-review.md
git commit -m "feat: switch project-review prompt to YAML submission format"
```

---

### Task 7: Manual smoke test

- [ ] **Step 1: Start the server**

```bash
node skills/audit/scripts/cli.mjs server 3457
```

- [ ] **Step 2: Create a test session with a task file**

```bash
# Create a minimal test session
mkdir -p .audit/test-session/code-tasks
cat > .audit/test-session/index.yaml << 'EOF'
session:
  id: test-session
  type: code
  status: reviewing
  scope:
    method: ""
    ref: ""
  created: "2026-05-29T00:00:00.000Z"
codeTasks:
  - file: "code-tasks/test.yaml"
    status: "reviewing"
storyTasks: []
projectTasks: []
EOF

cat > .audit/test-session/code-tasks/test.yaml << 'EOF'
name: test-file.mjs
language: javascript
diff: |
  diff --git a/test.mjs b/test.mjs
  +console.log("hello");
EOF
```

- [ ] **Step 3: POST a YAML review with multi-line code**

```bash
curl -s -X POST "http://localhost:3457/api/sessions/test-session/tasks/review-yaml?file=code-tasks/test.yaml" \
  -H 'Content-Type: text/yaml' \
  --data-binary 'score: 8
review:
  summary: "Clean code with minor suggestions"
  findings:
    - severity: minor
      description: "Consider adding error handling"
      file: "test.mjs"
      line: 1
      code: |
        console.log("hello");
        // Missing: no error handling for write failures
      suggestion: "Wrap in try/catch"
  positives:
    - "Simple and clear"'
```

- [ ] **Step 4: Verify the task file has appended review with multi-line code preserved**

```bash
cat .audit/test-session/code-tasks/test.yaml
```

Expected output should contain `---` separator followed by the review YAML with `code: |` block scalar preserving line breaks.

- [ ] **Step 5: Verify the API response and status**

Expected response:
```json
{"ok":true,"file":"code-tasks/test.yaml","status":"reviewed","sessionStatus":"completed"}
```

- [ ] **Step 6: Clean up test data**

```bash
rm -rf .audit/test-session
```

Kill the test server.

- [ ] **Step 7: Final commit if any fixes were needed**

---

## Self-Review

**Spec coverage:**
- New `/review-yaml` endpoint → Task 2
- `appendReview` function → Task 1
- Remove review defaults from YAML writers → Task 3
- Prompt changes (all 3) → Tasks 4, 5, 6
- `parseYaml` export → Task 2
- Smoke test → Task 7

**Placeholder scan:** No TBDs, no "implement later", all code blocks are complete.

**Type consistency:** `appendReview` takes `(reportsDir, sid, taskFile, yamlText)` — same pattern as `updateTask`. Route handler passes `params.id` (from router), `query.get("file")` (from searchParams), and `raw` (from readBody). All match.
