# Finding Sort & Separator Fix

## Problem

Two issues:

1. `appendReview` writes `"\n---\n"` as a separator between task metadata and review content. The `---` is a YAML document separator that the custom parser doesn't properly handle — it works by accident. This risks breaking `score` and `review` field parsing.
2. Findings are displayed in their original order with no severity sorting. Critical issues can appear after minor ones.

## Solution

### Fix 1: Replace `---` with blank line

Change `appendReview` in `task.mjs` from `"\n---\n"` to `"\n\n"`. A blank line between YAML key-value blocks is unambiguous and avoids multi-document parsing issues entirely.

### Fix 2: Sort findings by severity in frontend

In `task-detail.mjs`, sort the `findings` array by severity before rendering:

- **Code/project reviews:** critical → major → minor → info → positive
- **Story reviews:** not-met → partially-met → met

The sort happens after extracting findings from the task data and before any rendering.

Since note statuses are currently matched by array index (`noteTask?.findings?.[i]?.status`), sorting would break the mapping. Change the lookup to match by description instead:

Before:
```js
const status = noteTask?.findings?.[i]?.status || ...;
```

After:
```js
const status = noteTask?.findings?.find(n => n.description === f.description)?.status || ...;
```

This applies to all three rendering paths (all-met, all-positive, normal mixed findings).

### What changes

| File | Change |
|------|--------|
| `task.mjs` | `"\n---\n"` → `"\n\n"` in `appendReview` |
| `task-detail.mjs` | Add severity sort, change note status lookup from index to description matching |

### What stays the same

- Prompt files — no changes needed
- API endpoints — no changes needed
- Backend data flow — no changes needed
- YAML parser — no changes needed
