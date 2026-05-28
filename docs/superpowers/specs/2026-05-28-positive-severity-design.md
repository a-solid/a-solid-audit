# Positive Severity for Code/Project Reviews — Design

## Problem

Code review and project review tasks can have zero findings when the code is clean. This creates inconsistencies:

1. Frontend needs `findings.length === 0` special branches in every rendering layer (task detail, overview, summary, PDF)
2. `autoPersistWellDone` needs to create empty entries for zero-finding tasks just to show "Complete" in sidebar
3. Story reviews always have findings (met/partially-met/not-met per AC), but code/project reviews don't — inconsistent data model
4. High-score tasks have no evidence supporting the score — users can't see why the code got a 9/10

## Design

### New Severity: `positive`

Add `positive` as a severity type for code review and project review tasks. It represents something the LLM thinks was done well.

| severity | Meaning | Task types | autoAcknowledge | Frontend |
|----------|---------|-----------|-----------------|----------|
| critical/major/minor/info | Problem | code/project | info/low → wont-fix | Action buttons |
| met/partially-met/not-met | AC evaluation | story | met → well-done | Positive card for all-met |
| **positive** | Good practice | code/project | **Skip** | Green card, no action buttons |

### Prompt Changes

#### code-review.md

Add `positive` to the severity options and require at least one finding:

```markdown
### Severity Definitions

- **Critical:** Security vulnerability, data loss risk, production-breaking bug
- **Major:** Logic error, significant performance issue, missing error handling
- **Minor:** Code style, naming, minor optimization
- **Info:** Suggestions, alternative approaches
- **Positive:** Good practices, well-designed patterns, clean code — use for high-quality code (score 7+)

### Field Rules

- Every task MUST include at least one finding
- For high-quality code (score 7+), include at least one `positive` severity finding describing what was done well
- Be specific — reference a pattern, naming convention, or design choice
- `description` is required for each finding
```

Remove the line: `findings` and `positives` arrays may be empty — omit or send `[]`

Replace with: `findings` array must contain at least one entry. `positives` array may be empty — findings with `positive` severity serve this purpose.

#### project-review.md

Same changes as code-review.md:
- Add `positive` to severity definitions
- Require at least one finding
- For clean code (score 9-10), include at least one `positive` finding

#### story-review.md

No changes — already always generates findings per AC.

### Frontend Changes

#### constants.mjs

```js
SEVERITY_LABELS.positive = "Positive"
SEVERITY_COLORS.positive = "var(--accent)"
```

#### task-detail.mjs

1. **All-positive tasks**: When `findings.every(f => f.severity === "positive")`, show a positive summary card (same pattern as all-met):
   - Green check icon + "Clean code — no issues found" header card
   - Individual positive findings listed as read-only cards (no action buttons)
   - Revert button available

2. **Single positive finding rendering**: A finding with `severity === "positive"` shows as a green badge, auto-set to "Well Done" status. No action buttons. Only the Revert button is shown.

3. **getSeverityIcon**: Add `positive` → check icon (same as met display)

#### review.mjs

1. **autoAcknowledgeLowSeverity**: Keep `LOW_SEVS = ["info", "low"]` — `positive` is NOT low severity and should NOT be auto-marked as wont-fix.

2. **autoPersistWellDone**: Extend to handle `positive`:
   ```js
   if ((findings[i].severity === "met" || findings[i].severity === "positive") && !noteFindings[i]?.status) {
     noteFindings[i] = { status: "well-done" };
   }
   ```

3. **Zero-finding task entry creation**: The block at line 117-119 (`if (findings.length === 0 && !noteTask)`) becomes unnecessary since there should always be at least one finding. Keep as a safety fallback.

4. **Overview severity bars**: `positive` is filtered from problem severity bars (same as `met`). If there are positive findings, show them as a separate "Positive" row in green.

5. **getSeverityIcon** (in review.mjs): Add `positive` mapping.

6. **Sidebar badge logic**: Findings with `severity === "positive"` and status `"well-done"` should count toward "Complete" status. This already works since `autoPersistWellDone` sets well-done.

#### summary.mjs

No changes needed — the current logic already handles well-done findings correctly. With positive severity findings always present, `totalFindings > 0` for all tasks, eliminating the `reviewStatus = "none"` branch for actual reviews.

### PDF Changes (print.html)

1. **CSS**: Add `.finding.positive { border-left-color: #16a34a; }` and `.sev-fill.sev-positive { background: #16a34a; }`

2. **All-positive task cards**: When all findings are `positive`, show "Clean code — no issues found" with positive findings listed (same pattern as all-met)

3. **Severity bars**: Filter `positive` from problem severity bars, show separately in green (same as met handling)

4. **Stats**: No change — well-done count already handles positive findings via autoPersistWellDone

### Files to Change

| File | Changes |
|------|---------|
| `skills/audit/prompts/code-review.md` | Add positive severity, require min 1 finding |
| `skills/audit/prompts/project-review.md` | Add positive severity, require min 1 finding |
| `skills/audit/scripts/public/js/constants.mjs` | Add positive to SEVERITY_LABELS and SEVERITY_COLORS |
| `skills/audit/scripts/public/js/components/task-detail.mjs` | All-positive card, positive finding rendering |
| `skills/audit/scripts/public/js/views/review.mjs` | autoPersistWellDone extension, severity bar filter, getSeverityIcon |
| `skills/audit/scripts/public/print.html` | CSS, all-positive cards, severity bar filter |

### Not Changing

- `story-review.md` — already generates findings per AC
- `summary.mjs` — already handles well-done findings correctly
- `notes.mjs` — server-side logic unchanged
- `aggregateFindings` — already counts well-done; positive findings get well-done status via autoPersist
