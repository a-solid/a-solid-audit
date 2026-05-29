# YAML Review Submission

## Problem

Sub-agents submit review results as JSON in curl POST bodies. JSON requires `\n` escaping for multi-line strings, and LLMs frequently produce flat single-line `code` fields instead of preserving original formatting. The YAML storage layer already supports `|` block scalars, but the JSON intermediary breaks multi-line content.

## Solution

Change the review submission format from JSON to YAML. Sub-agents POST raw YAML text with `Content-Type: text/yaml`. The server validates basic field presence, then appends the review content directly to the task YAML file. No read-parse-merge-rewrite cycle.

### Data flow

```
Before:  sub-agent → JSON body → parse → readYaml → merge → writeYaml (full rewrite)
After:   sub-agent → YAML body → validate → appendFile (append text)
```

### Endpoint changes

**Existing endpoint** `POST /api/sessions/:id/tasks/review` — remains for the "set reviewing" status transition (JSON body with `{ file, status: "reviewing" }`).

**New endpoint** `POST /api/sessions/:id/tasks/review-yaml?file=<task-file>` — accepts `Content-Type: text/yaml`. The task file is identified by the `file` query parameter, not in the body.

Request body (pure review content, no routing info):
```yaml
review:
  score: 8
  summary: "..."
  findings:
    - severity: critical
      code: |
        function validate(input) {
          if (!input) return null;
          return input.trim();
        }
      suggestion: "Fix it"
  positives:
    - "Clean code"
overview:
  diagram: "graph TD ..."
  description: "..."
```

Server behavior:
1. Extract `file` from query parameter
2. Read raw body as text
3. Parse with existing `parseYaml` to validate — body is valid YAML, `review.score` is a number
4. Append `\n---\n` + raw body text to the task file
5. Set task status to `reviewed` in `index.yaml`
6. Check if all tasks reviewed → update session status

No re-serialization — the raw body text is appended as-is. This preserves the sub-agent's original `|` block scalars and formatting exactly.

### Task YAML generation changes

Remove `review` field from initial task YAML generation in `writeCodeTaskYaml`, `writeStoryTaskYaml`, `writeProjectTaskYaml`. Before:

```yaml
name: skills/audit/scripts/lib/git.mjs
language: javascript
diff: |
  diff --git ...
review:
  score: 0
  summary: ""
  findings: []
  positives: []
```

After:

```yaml
name: skills/audit/scripts/lib/git.mjs
language: javascript
diff: |
  diff --git ...
```

Review content is appended later when POSTed.

### Prompt changes

All three review prompts (`code-review.md`, `story-review.md`, `project-review.md`) replace the JSON curl example with YAML format:

```bash
curl -s -X POST "http://localhost:3456/api/sessions/<session-id>/tasks/review-yaml?file=<task-file>" \
  -H 'Content-Type: text/yaml' \
  --data-binary 'score: <0-10>
review:
  summary: "<summary>"
  findings:
    - severity: <severity>
      description: "<description>"
      code: |
        <actual code on multiple lines>
      suggestion: "<suggestion>"
  positives:
    - "<what was done well>"
overview:
  diagram: "<Mermaid diagram>"
  description: "<execution flow>"'
```

### `updateTask` simplification

The `updateTask` function in `task.mjs` no longer needs to merge review data. A new `appendReview` function handles the YAML append:

```js
function appendReview(reportsDir, sid, taskFile, yamlText) {
  const taskPath = buildTaskPath(reportsDir, sid, taskFile);
  fs.appendFileSync(taskPath, "\n---\n" + yamlText);
}
```

Status update logic (index.yaml + session completion check) is shared between `updateTask` (for reviewing status) and the new review-yaml handler.

### What stays the same

- `yaml.mjs` — no changes, `parseYaml` and `writeYaml` are unchanged
- Frontend — reads task YAML via GET, data shape includes review after append, rendering unchanged
- `reviewing` status transition — still uses existing JSON endpoint
- Review notes endpoint — unchanged

### What changes

| File | Change |
|------|--------|
| `reviews.mjs` | New handler for `/review-yaml` route |
| `task.mjs` | New `appendReview` function |
| `yaml.mjs` | Remove `review` defaults from `writeCodeTaskYaml`, `writeStoryTaskYaml`, `writeProjectTaskYaml` |
| `prompts/code-review.md` | Replace JSON curl example with YAML |
| `prompts/story-review.md` | Replace JSON curl example with YAML |
| `prompts/project-review.md` | Replace JSON curl example with YAML |

### Risks

- **Raw text append**: No re-serialization means malformed YAML from a sub-agent is stored as-is. Mitigated by the parse step — if `parseYaml` fails on the body, the request is rejected before append.
- **Duplicate runs**: If a sub-agent posts review twice, the task file gets two review blocks. The last one wins when `parseYaml` reads the file (YAML multi-document behavior in our parser picks the last value for duplicate keys). Could add a guard checking if review already exists.
