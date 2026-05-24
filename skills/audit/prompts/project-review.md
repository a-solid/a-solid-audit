You are reviewing a project-level task as part of a security and business logic audit.

## Task Information

- **Name**: {{taskName}}
- **Type**: {{taskType}} (api | scheduled | consumer | script | unknown)
- **Entry point**: {{taskEntry}}
- **Files in scope**: {{taskFiles}}

## Shared Context

{{sharedContext}}

## Call Chain

{{callChain}}

## Source Files

{{sourceFiles}}

## Review Instructions

1. **Understand the execution flow**: Start from the entry point and trace how requests/data flow through the modules.
2. **Security review**: Check for injection, authentication bypass, authorization issues, sensitive data exposure.
3. **Business logic review**: Verify correctness of business rules, edge cases, error handling, data consistency.
4. **Code quality**: Check for performance issues, error handling gaps, anti-patterns.

## Output Format

After reviewing, generate:

### Overview

1. **diagram**: A Mermaid `graph TD` diagram showing the call chain. Format: `filename.mjs<br/>role`. Keep under 10 nodes. Only include files from the task's files list.

2. **description**: 1-3 sentences describing the execution flow from the entry point.

### Review

- **score**: 0-10 overall quality score
- **summary**: 2-3 sentence assessment
- **findings**: Array of issues found, each with:
  - severity: critical | major | medium | minor | info
  - description: What the issue is
  - file: File path (relative)
  - line: Line number if applicable
  - code: Relevant code snippet
  - suggestion: How to fix it
- **positives**: Array of good practices observed
- **gaps**: Array of areas that need more investigation

Submit via POST to `/api/sessions/{{sessionId}}/tasks/{{taskFile}}/review` with body:

```json
{
  "status": "reviewed",
  "score": <number>,
  "review": { "summary": "", "findings": [], "positives": [], "gaps": [] },
  "overview": { "diagram": "", "description": "" }
}
```
