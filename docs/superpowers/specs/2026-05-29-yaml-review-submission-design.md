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

**New endpoint** `POST /api/sessions/:id/tasks/review-yaml` — accepts `Content-Type: text/yaml`:

Request body:
```yaml
file: <task-file>
score: 8
review:
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
1. Read raw body as text
2. Parse with existing `parseYaml` to extract `file` field (for routing)
3. Validate: `file` present, body is valid YAML
4. Re-serialize only the review/overview/score portion back to YAML text (preserving `|` block scalars)
5. Append `---\n` + review YAML to the task file
6. Set task status to `reviewed` in `index.yaml`
7. Check if all tasks reviewed → update session status

The `---\n` separator ensures the appended content is a valid multi-document YAML or at least visually separated from the task metadata.

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
curl -s -X POST http://localhost:3456/api/sessions/<session-id>/tasks/review-yaml \
  -H 'Content-Type: text/yaml' \
  --data-binary 'file: <task-file>
score: <0-10>
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

- **Parse-then-re-serialize**: The server parses YAML to validate and extract `file`, then needs to produce clean YAML text for append. If we skip re-serialization and append the raw body (minus the `file:` line), we avoid this risk but lose control over formatting.
- **Mitigation**: Append the raw body text directly after stripping the `file:` line. The sub-agent is trusted to produce valid YAML, same as it's trusted to produce valid JSON today.
