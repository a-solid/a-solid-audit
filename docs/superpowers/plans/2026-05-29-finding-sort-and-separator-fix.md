# Finding Sort & Separator Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove fragile `---` YAML separator and sort findings by severity so critical issues appear first.

**Architecture:** One-line fix in backend (`task.mjs`), frontend sort with description-based note lookup (`task-detail.mjs`).

**Tech Stack:** Node.js, vanilla JS frontend.

---

### Task 1: Replace `---` separator with blank line

**Files:**
- Modify: `skills/audit/scripts/lib/task.mjs:68`

- [ ] **Step 1: Change the separator**

In `skills/audit/scripts/lib/task.mjs`, line 68, change:

```js
  fs.appendFileSync(taskPath, "\n---\n" + yamlText);
```

to:

```js
  fs.appendFileSync(taskPath, "\n\n" + yamlText);
```

- [ ] **Step 2: Verify syntax**

Run: `node -c skills/audit/scripts/lib/task.mjs`
Expected: no output (syntax OK)

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/lib/task.mjs
git commit -m "fix: replace YAML document separator with blank line in appendReview"
```

---

### Task 2: Sort findings by severity and fix note status lookup

**Files:**
- Modify: `skills/audit/scripts/public/js/components/task-detail.mjs`

- [ ] **Step 1: Add severity sort order and helper**

Add this after the `getSeverityIcon` function (after line 17, before `renderTaskDetail`):

```js
const SEVERITY_ORDER = {
  critical: 0,
  major: 1,
  high: 1,
  minor: 2,
  medium: 2,
  info: 3,
  low: 3,
  "not-met": 0,
  "partially-met": 1,
  met: 4,
  positive: 5,
};

function sortFindings(findings) {
  return [...findings].sort((a, b) => {
    const aOrder = SEVERITY_ORDER[a.severity] ?? 3;
    const bOrder = SEVERITY_ORDER[b.severity] ?? 3;
    return aOrder - bOrder;
  });
}

function getNoteStatus(noteTask, finding) {
  if (!noteTask?.findings) return null;
  const match = noteTask.findings.find(n => n.description === finding.description);
  return match?.status || null;
}

function getNoteReason(noteTask, finding) {
  if (!noteTask?.findings) return "";
  const match = noteTask.findings.find(n => n.description === finding.description);
  return match?.reason || "";
}
```

- [ ] **Step 2: Sort findings after extraction**

In `renderTaskDetail`, line 23, change:

```js
  const findings = task.review?.findings || [];
```

to:

```js
  const findings = sortFindings(task.review?.findings || []);
```

- [ ] **Step 3: Replace all index-based note lookups with description-based**

**Line 93** — change:
```js
                const status = noteTask?.findings?.[i]?.status || "well-done";
                const reason = noteTask?.findings?.[i]?.reason || "";
```
to:
```js
                const status = getNoteStatus(noteTask, f) || "well-done";
                const reason = getNoteReason(noteTask, f);
```

**Line 122** — change:
```js
                const status = noteTask?.findings?.[i]?.status || "well-done";
```
to:
```js
                const status = getNoteStatus(noteTask, f) || "well-done";
```

**Line 145** — change:
```js
              const status = noteTask?.findings?.[i]?.status || (f.severity === "met" || f.severity === "positive" ? "well-done" : null);
```
to:
```js
              const status = getNoteStatus(noteTask, f) || (f.severity === "met" || f.severity === "positive" ? "well-done" : null);
```

**Line 152** — change:
```js
              const reason = noteTask?.findings?.[i]?.reason || "";
```
to:
```js
              const reason = getNoteReason(noteTask, f);
```

- [ ] **Step 4: Verify syntax**

Run: `node -c skills/audit/scripts/public/js/components/task-detail.mjs`
Expected: no output (syntax OK)

- [ ] **Step 5: Commit**

```bash
git add skills/audit/scripts/public/js/components/task-detail.mjs
git commit -m "feat: sort findings by severity, use description-based note matching"
```

---

### Task 3: Manual smoke test

- [ ] **Step 1: Restart the server**

```bash
lsof -ti:3456 | xargs kill -9 2>/dev/null
node skills/audit/scripts/cli.mjs server 3457
```

- [ ] **Step 2: Create test session with mixed-severity findings**

```bash
mkdir -p .audit/test-sort/code-tasks

cat > .audit/test-sort/index.yaml << 'EOF'
session:
  id: test-sort
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

cat > .audit/test-sort/code-tasks/test.yaml << 'EOF'
name: test.mjs
language: javascript
diff: |
  diff --git a/test.mjs b/test.mjs
  +console.log("hello");
EOF
```

- [ ] **Step 3: POST a YAML review with findings in wrong order (info first, critical last)**

```bash
curl -s -X POST "http://localhost:3457/api/sessions/test-sort/tasks/review-yaml?file=code-tasks/test.yaml" \
  -H 'Content-Type: text/yaml' \
  --data-binary 'score: 4
review:
  summary: "Mixed severity test"
  findings:
    - severity: info
      description: "Info finding"
    - severity: minor
      description: "Minor finding"
    - severity: positive
      description: "Positive finding"
    - severity: critical
      description: "Critical finding"
    - severity: major
      description: "Major finding"
  positives:
    - "Good"'
```

- [ ] **Step 4: Verify separator is blank line, not ---**

```bash
grep -n "^---" .audit/test-sort/code-tasks/test.yaml
```

Expected: no output (no `---` found)

```bash
cat .audit/test-sort/code-tasks/test.yaml
```

Expected: blank line between task metadata and review content.

- [ ] **Step 5: Open browser at http://localhost:3457, click session, click task**

Verify findings are displayed in order: critical → major → minor → info → positive.

- [ ] **Step 6: Clean up**

```bash
rm -rf .audit/test-sort
```

Kill the test server.
