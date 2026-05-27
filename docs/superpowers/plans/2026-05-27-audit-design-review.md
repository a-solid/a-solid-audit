# Audit Design Review — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix YAML parser correctness bugs, add structured error handling, split oversized files, and eliminate duplicate status tracking.

**Architecture:** Five independent tasks, each self-contained and committable. Tasks 1-2 fix bugs. Tasks 3-4 refactor backend. Task 5 splits frontend. No task depends on another.

**Tech Stack:** Node.js (ESM), vanilla JS frontend, custom YAML parser, raw `http` server.

---

### Task 1: YAML Parser Correctness

**Files:**
- Modify: `skills/audit/scripts/lib/yaml.mjs`

**1a. Fix list-item key-value splitting (line 133)**

- [ ] **Step 1: Replace the fragile regex at line 133 with split-on-first-colon logic**

The regex `/^(\S+): (.*)$/` at line 133 fails for keys with empty values. Replace it with the same split/join pattern used at lines 123-126.

Find in `yaml.mjs` around line 133:
```js
const kv = subLine.trim().match(/^(\S+): (.*)$/);
if (kv) {
  const [, subKey, subValRaw] = kv;
```

Replace with:
```js
const trimmed = subLine.trim();
const colonIdx = trimmed.indexOf(": ");
const kv = colonIdx > 0;
if (kv) {
  const subKey = trimmed.slice(0, colonIdx);
  const subValRaw = trimmed.slice(colonIdx + 2);
```

Note: the destructured `[, subKey, subValRaw]` must become two separate assignments. The rest of the block that uses `subKey` and `subValRaw` stays the same — those variable names are unchanged.

- [ ] **Step 2: Commit**

```bash
git add skills/audit/scripts/lib/yaml.mjs
git commit -m "fix: replace fragile regex in YAML list-item key-value parsing"
```

**1b. Add inline flow sequence parsing (lines 150-151, 230-240)**

- [ ] **Step 3: Add `parseFlowSequence` helper and integrate into `parseScalar`**

Add this function before `parseScalar` (around line 229):

```js
function parseFlowSequence(v) {
  const inner = v.slice(1, -1);
  return inner.split(", ").map(s => parseScalar(s.trim()));
}
```

In `parseScalar`, add before the final `return v` (around line 239):

```js
if (v.startsWith("[") && v.endsWith("]")) return parseFlowSequence(v);
```

This goes after the `'[]'` check (line 234) since that short-circuits to an empty array.

- [ ] **Step 4: Commit**

```bash
git add skills/audit/scripts/lib/yaml.mjs
git commit -m "fix: parse inline YAML flow sequences like [a, b, c]"
```

**1c. Fix hardcoded multiline indent offset (lines 142, 197)**

- [ ] **Step 5: Replace hardcoded `subIndent + 2` with dynamic indent detection**

There are two locations that use `substring(subIndent + 2)` to strip leading indent from multiline block content. Both need the same fix: detect the indent of the first non-blank content line and use that as the column offset.

First occurrence (line 142, inside list-item block parsing):
```js
blockLines.push(lines[i].substring(subIndent + 2));
```
Replace with:
```js
blockLines.push(lines[i].substring(getContentOffset(lines[i])));
```

Second occurrence (line 197, inside top-level block parsing):
```js
blockLines.push(lines[i].substring(kvIndent + 2));
```
Replace with:
```js
blockLines.push(lines[i].substring(getContentOffset(lines[i])));
```

Add this helper function near `getIndent` (after line 103):
```js
function getContentOffset(line) {
  return line.trim().length > 0 ? line.match(/^(\s*)/)[1].length : 0;
}
```

- [ ] **Step 6: Commit**

```bash
git add skills/audit/scripts/lib/yaml.mjs
git commit -m "fix: use dynamic indent detection for multiline YAML scalars"
```

**1d. Empty array consistency (lines 34-35)**

- [ ] **Step 7: Replace last-line mutation with inline `[]` pattern**

Find in `serializeYaml` (lines 34-35):
```js
if (data.length === 0) {
  lines[lines.length - 1] += " []";
  return;
}
```

Replace with:
```js
if (data.length === 0) {
  lines.push(pad + "[]");
  return;
}
```

Wait — this function is called from two contexts: as a top-level array and as a nested array value. When called from the `if (Array.isArray(v))` block at line 75-79, the parent already wrote `lines.push(pad + k + ":")`, so we need `lines.push(pad + "  []")` with `indent + 1` padding. But `indent` already reflects that — the caller passes `indent + 1`.

Actually, looking more carefully: `serializeYaml` doesn't know whether it was called from a key-value context (where the parent already wrote `key:`) or standalone. The `indent` parameter handles this. The current `lines[lines.length - 1] += " []"` appends to the `key:` line (e.g. `key: []`). The replacement `lines.push(pad + "[]")` would produce `  []` on its own line — which is a different YAML structure.

To match the existing inline pattern used at line 76-77 (`lines.push(pad + k + ": []")`), we should make this consistent. The simplest fix: remove the empty-array branch from `serializeYaml` entirely and handle it only at the call site in the map-serialization block (lines 75-79), which already does `lines.push(pad + k + ": []")`.

Find in `serializeYaml` (lines 33-36):
```js
if (data.length === 0) {
  lines[lines.length - 1] += " []";
  return;
}
```

Replace with:
```js
if (data.length === 0) {
  lines.push(pad + "[]");
  return;
}
```

This handles the case where `serializeYaml` is called directly with an empty array. The map-value case at lines 75-79 already handles its own empty arrays inline with `key: []`.

- [ ] **Step 8: Commit**

```bash
git add skills/audit/scripts/lib/yaml.mjs
git commit -m "fix: consistent empty array serialization in YAML writer"
```

---

### Task 2: Structured Error Handling

**Files:**
- Create: `skills/audit/scripts/lib/errors.mjs`
- Modify: `skills/audit/scripts/lib/session.mjs`
- Modify: `skills/audit/scripts/lib/task.mjs`
- Modify: `skills/audit/scripts/server/index.mjs`
- Modify: `skills/audit/scripts/server/handlers/sessions.mjs`
- Modify: `skills/audit/scripts/server/handlers/reviews.mjs`
- Modify: `skills/audit/scripts/server/handlers/notes.mjs`
- Modify: `skills/audit/scripts/server/handlers/stories.mjs`
- Modify: `skills/audit/scripts/server/handlers/tasks.mjs`
- Modify: `skills/audit/scripts/server/handlers/project-scan.mjs`
- Modify: `skills/audit/scripts/server/handlers/audit.mjs`

**2a. Create `AppError` class and fix `readBody`**

- [ ] **Step 1: Create `lib/errors.mjs`**

Create `skills/audit/scripts/lib/errors.mjs`:
```js
export class AppError extends Error {
  constructor(message, code, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
```

- [ ] **Step 2: Replace plain `Error` throws in `lib/session.mjs`**

Add import at top:
```js
import { AppError } from "./errors.mjs";
```

Replace these throws:

Line 36 (in `sanitizePath`):
```js
throw new Error("Invalid path segment: " + s);
```
→
```js
throw new AppError("Invalid path segment: " + s, "VALIDATION_ERROR", 400);
```

Line 43 (in `sanitizeFilePath`):
```js
throw new Error("Invalid file path: " + s);
```
→
```js
throw new AppError("Invalid file path: " + s, "VALIDATION_ERROR", 400);
```

Line 108 (in `updateSessionStatus`, invalid status):
```js
throw new Error("Invalid status: " + newStatus);
```
→
```js
throw new AppError("Invalid status: " + newStatus, "VALIDATION_ERROR", 400);
```

Line 111 (in `updateSessionStatus`, not found):
```js
throw new Error("Session not found: " + safeSid);
```
→
```js
throw new AppError("Session not found: " + safeSid, "NOT_FOUND", 404);
```

Line 119 (in `updateSessionStatus`, invalid transition):
```js
throw new Error(`Cannot transition from "${current}" to "${newStatus}" (type: ${type}). Allowed: ${allowed.join(", ") || "none"}`);
```
→
```js
throw new AppError(`Cannot transition from "${current}" to "${newStatus}" (type: ${type}). Allowed: ${allowed.join(", ") || "none"}`, "CONFLICT", 409);
```

Line 133 (in `updateSession`, not found):
```js
throw new Error("Session not found: " + safeSid);
```
→
```js
throw new AppError("Session not found: " + safeSid, "NOT_FOUND", 404);
```

Line 149 (in `initSession` — uses `sanitizePath` which already throws `AppError` now, but the function itself doesn't throw directly. No change needed.)

Line 184 (in `resetReviewing`, not found):
```js
throw new Error("Session not found: " + safeSid);
```
→
```js
throw new AppError("Session not found: " + safeSid, "NOT_FOUND", 404);
```

- [ ] **Step 3: Replace plain `Error` throws in `lib/task.mjs`**

Add import at top:
```js
import { AppError } from "./errors.mjs";
```

Line 12 (invalid status):
```js
throw new Error("Invalid status: " + status + ". Allowed: " + ALLOWED_STATUSES.join(", "));
```
→
```js
throw new AppError("Invalid status: " + status + ". Allowed: " + ALLOWED_STATUSES.join(", "), "VALIDATION_ERROR", 400);
```

Line 20 (task file not found):
```js
throw new Error("Task file not found: " + taskPath);
```
→
```js
throw new AppError("Task file not found", "NOT_FOUND", 404);
```

Line 21 (session not found):
```js
throw new Error("Session not found: " + safeSid);
```
→
```js
throw new AppError("Session not found: " + safeSid, "NOT_FOUND", 404);
```

Line 56 (in `getTasks`, not found):
```js
throw new Error("Session not found: " + safeSid);
```
→
```js
throw new AppError("Session not found: " + safeSid, "NOT_FOUND", 404);
```

Line 93 (in `getTask`, not found):
```js
throw new Error("Session not found: " + safeSid);
```
→
```js
throw new AppError("Session not found: " + safeSid, "NOT_FOUND", 404);
```

- [ ] **Step 4: Fix `readBody` double-fire in `server/index.mjs`**

Find in `readBody` (lines 29-34):
```js
const chunks = [];
let size = 0;
req.on("data", (c) => {
  size += c.length;
  if (size > maxBytes) {
    req.destroy();
    reject(new Error("Request body too large"));
    return;
  }
  chunks.push(c);
});
```

Replace with:
```js
const chunks = [];
let size = 0;
let destroyed = false;
req.on("data", (c) => {
  if (destroyed) return;
  size += c.length;
  if (size > maxBytes) {
    destroyed = true;
    req.destroy();
    reject(new Error("Request body too large"));
    return;
  }
  chunks.push(c);
});
```

- [ ] **Step 5: Add `AppError` import and unified catch in `server/index.mjs`**

Add import at top of `server/index.mjs`:
```js
import { AppError } from "../lib/errors.mjs";
```

In `startServer`, find the catch block (lines 64-69):
```js
} catch (e) {
  if (e instanceof SyntaxError) {
    return errorResponse(res, "Invalid JSON", "PARSE_ERROR", 400);
  }
  console.error(e);
  errorResponse(res, "Internal server error", "INTERNAL_ERROR", 500);
}
```

Replace with:
```js
} catch (e) {
  if (e instanceof AppError) return errorResponse(res, e.message, e.code, e.status);
  if (e instanceof SyntaxError) return errorResponse(res, "Invalid JSON", "PARSE_ERROR", 400);
  console.error(e);
  errorResponse(res, "Internal server error", "INTERNAL_ERROR", 500);
}
```

- [ ] **Step 6: Simplify handler catch blocks**

Now that `AppError` is caught centrally, every handler's catch block can be simplified. Remove the per-handler string-matching catches. For each handler file:

**`server/handlers/sessions.mjs`:** Remove all `if (e.message.includes(...))` checks. Each catch block becomes just `throw e` (or can be removed entirely if the only catch was string-matching). The `AppError` will bubble to the central handler.

For `registerSessionRoutes`, each catch block changes from:
```js
} catch (e) {
  if (e.message.includes("Invalid path")) return errorResponse(res, e.message, "VALIDATION_ERROR", 400);
  throw e;
}
```
to:
```js
} catch (e) {
  throw e;
}
```

But since the central catch handles everything, you can also just remove the try/catch entirely and let errors propagate. However, some handlers have pre-validation checks (e.g. missing body fields) that use `return errorResponse(...)` directly — those should stay.

The pattern for each handler:

1. **Keep** direct `return errorResponse(...)` calls for request-level validation (missing fields, bad format).
2. **Remove** `try/catch` blocks where the only catches are `e.message.includes(...)` string matching — let `AppError` propagate.
3. **Keep** `try/catch` where there's a `JSON.parse(await readBody(req))` call — `SyntaxError` is caught centrally, but having it locally is fine too.

Apply this to all 7 handler files. The specific catch blocks to simplify:

**sessions.mjs** — all catch blocks:
- GET `:id` catch: remove `e.message.includes("Invalid path")` check, just `throw e`
- PUT `:id/status` catch: remove all `e.message.includes(...)` checks, just `throw e`
- PATCH `:id` catch: remove `e.message.includes("not found")` check, just `throw e`
- GET `:id/review-context` catch: remove `e.message.includes("Invalid path")` check, just `throw e`
- PUT `:id/review-context` catch: remove `e.message.includes("Invalid path")` check, just `throw e`
- POST `:id/review-notes` catch: remove `e.message.includes("Invalid path")` check, just `throw e`

**reviews.mjs** — the catch block:
- Remove all `e.message.includes(...)` checks, just `throw e`

**notes.mjs** — all catch blocks:
- GET `:id/notes` catch: remove `e.message.includes("Invalid path")` check, just `throw e`
- POST `:id/notes` catch: remove `e.message.includes("Invalid path")` check, just `throw e`
- POST `:id/summary` catch: remove `e.message.includes("Invalid path")` check, just `throw e`

**stories.mjs** — catch blocks:
- POST `providers/:name/fetch`: the catch has `e.message.includes("Provider not found")` and `e.message.includes("Provider") && e.message.includes("failed")`. These come from `providers.mjs` which throws plain `Error`. Two options:
  a) Add `AppError` to `providers.mjs` too (small scope)
  b) Keep these two string checks since they're from an external interface

  Go with (b) — `providers.mjs` is a plugin boundary where errors come from arbitrary executables. Keep the existing catches here.

- GET `:id/stories`: remove `e.message.includes("Invalid path")` check, just `throw e`
- POST `:id/stories`: remove `e.message.includes("Invalid path")` check, just `throw e`
- DELETE `:id/stories/:name`: remove `e.message.includes("Invalid path")` check, just `throw e`
- PUT `:id/stories/map`: remove `e.message.includes("Invalid path")` check, just `throw e`

**tasks.mjs** — the catch block:
- Remove all `e.message.includes(...)` checks, just `throw e`

**project-scan.mjs** — catch blocks:
- POST `:id/scan`: remove `e.message.includes("not found")` and `e.message.includes("Invalid path")` checks, just `throw e`
- GET `:id/scan/status`: remove `e.message.includes("Invalid path")` check, just `throw e`
- GET `:id/project-map`: remove `e.message.includes("Invalid path")` check, just `throw e`
- GET `:id/scan/logs`: the catch uses `res.writeHead` directly (SSE endpoint). Keep as-is — it's not using `errorResponse`.
- GET `:id/graph-data`: remove `e.message.includes("Invalid path")` check, just `throw e`
- GET `:id/groups`: remove `e.message.includes("Invalid path")` check, just `throw e`
- PUT `:id/groups`: remove `e.message.includes("Invalid path")` check, just `throw e`
- POST `:id/groups/confirm`: remove `e.message.includes("not found")` and `e.message.includes("Invalid path")` checks, just `throw e`

**audit.mjs** — catch blocks:
- GET `commits`, GET `branches`, POST `preview`: these catch generic errors and wrap them. Keep as-is — they're wrapping git errors, not `AppError`.
- POST `:id/scope`: has `e.message.includes("No diff found")` and `e.message.includes("not found")`. The "No diff found" comes from `mapping.mjs` (plain `Error`). Add `AppError` to `mapping.mjs` for the "not found" case and keep the "No diff found" string check.

Actually, let's keep `audit.mjs` as-is for now. The "No diff found" error from `mapping.mjs` is a plain `Error` and the handler converts it. Not worth the scope creep.

- [ ] **Step 7: Commit**

```bash
git add skills/audit/scripts/lib/errors.mjs skills/audit/scripts/lib/session.mjs skills/audit/scripts/lib/task.mjs skills/audit/scripts/server/index.mjs skills/audit/scripts/server/handlers/sessions.mjs skills/audit/scripts/server/handlers/reviews.mjs skills/audit/scripts/server/handlers/notes.mjs skills/audit/scripts/server/handlers/stories.mjs skills/audit/scripts/server/handlers/tasks.mjs skills/audit/scripts/server/handlers/project-scan.mjs
git commit -m "refactor: structured AppError class, fix readBody double-fire, simplify handler catch blocks"
```

---

### Task 3: Split `project-scan.mjs`

**Files:**
- Create: `skills/audit/scripts/lib/gitignore.mjs`
- Create: `skills/audit/scripts/lib/scan-log.mjs`
- Modify: `skills/audit/scripts/lib/project-scan.mjs`
- Modify: `skills/audit/scripts/server/handlers/project-scan.mjs`

- [ ] **Step 1: Create `lib/gitignore.mjs`**

Move these functions from `project-scan.mjs` to a new file `skills/audit/scripts/lib/gitignore.mjs`:

```js
// skills/audit/scripts/lib/gitignore.mjs
import fs from "node:fs";
import path from "node:path";

export function parseGitignore(projectDir) {
  const gitignorePath = path.join(projectDir, ".gitignore");
  if (!fs.existsSync(gitignorePath)) return [];
  const content = fs.readFileSync(gitignorePath, "utf-8");
  return content.split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith("#"));
}

export function buildGitignoreMatcher(patterns) {
  const matchers = [];
  for (const raw of patterns) {
    const negated = raw.startsWith("!");
    const pat = negated ? raw.slice(1) : raw;
    const dirOnly = pat.endsWith("/");
    let re = gitignorePatternToRegex(pat, dirOnly);
    if (re) matchers.push({ re, negated });
  }
  return (relativePath, isDir) => {
    let result = false;
    for (const { re, negated } of matchers) {
      if (re.test(relativePath)) {
        result = !negated;
      }
    }
    return result;
  };
}

function gitignorePatternToRegex(pattern, dirOnly) {
  let pat = pattern.replace(/\/$/, "");
  const anchored = pat.startsWith("/");
  if (anchored) pat = pat.slice(1);

  let regex = "";
  const segments = pat.split("/");

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg === "**") {
      regex += "(?:.+/)?";
    } else {
      regex += globToRegex(seg);
      if (i < segments.length - 1) {
        regex += "/";
      }
    }
  }

  if (!anchored && !pat.includes("/")) {
    regex = "(?:.+/)?" + regex;
  } else if (!anchored) {
    regex = "(?:.+/)?(?:" + globToRegex(segments[0]);
    for (let i = 1; i < segments.length; i++) {
      if (segments[i] === "**") {
        regex += "(?:.+/)?";
      } else {
        regex += "/" + globToRegex(segments[i]);
      }
    }
    regex += ")";
  }

  try {
    return new RegExp("(?:^|/)" + regex + (dirOnly ? "/.*" : "(?:$|/.*)"), "i");
  } catch {
    return null;
  }
}

function globToRegex(glob) {
  return glob.replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]");
}
```

- [ ] **Step 2: Create `lib/scan-log.mjs`**

Move scan log state from `project-scan.mjs` to a new file `skills/audit/scripts/lib/scan-log.mjs`:

```js
// skills/audit/scripts/lib/scan-log.mjs
const scanLogs = new Map();

export function pushLog(sid, level, message) {
  const entry = { timestamp: new Date().toISOString().slice(11, 19), level, message };
  console.log(`[project-scan] ${entry.timestamp} [${level}] ${message}`);
  if (!scanLogs.has(sid)) scanLogs.set(sid, []);
  scanLogs.get(sid).push(entry);
}

export function getScanLogs(sid) {
  return scanLogs.get(sid) || [];
}

export function clearScanLogs(sid) {
  scanLogs.delete(sid);
}
```

- [ ] **Step 3: Update `project-scan.mjs` imports and remove moved functions**

At the top of `skills/audit/scripts/lib/project-scan.mjs`, add:
```js
import { parseGitignore, buildGitignoreMatcher } from "./gitignore.mjs";
import { pushLog, getScanLogs, clearScanLogs } from "./scan-log.mjs";
```

Remove these functions from `project-scan.mjs`:
- `parseGitignore` (lines 47-53)
- `buildGitignoreMatcher` (lines 56-77)
- `gitignorePatternToRegex` (lines 79-129)
- `globToRegex` (lines 131-134)
- The `scanLogs` Map declaration and `pushLog`, `getScanLogs`, `clearScanLogs` functions (lines 177-191)

Keep the `pushLog` calls throughout the rest of the file — they'll use the imported version.

Also re-export `getScanLogs` and `clearScanLogs` from `project-scan.mjs` for backward compatibility, OR update the one consumer directly (the `project-scan` handler). Since there's only one consumer, update it directly.

- [ ] **Step 4: Update `server/handlers/project-scan.mjs` import**

Change:
```js
import { setProjectScope, getProjectMap, getScanLogs, clearScanLogs, generateTasksFromGroups } from "../../lib/project-scan.mjs";
```
to:
```js
import { setProjectScope, getProjectMap, generateTasksFromGroups } from "../../lib/project-scan.mjs";
import { getScanLogs, clearScanLogs } from "../../lib/scan-log.mjs";
```

- [ ] **Step 5: Commit**

```bash
git add skills/audit/scripts/lib/gitignore.mjs skills/audit/scripts/lib/scan-log.mjs skills/audit/scripts/lib/project-scan.mjs skills/audit/scripts/server/handlers/project-scan.mjs
git commit -m "refactor: extract gitignore and scan-log from project-scan.mjs"
```

---

### Task 4: Eliminate Duplicate Status Tracking

**Files:**
- Modify: `skills/audit/scripts/lib/yaml.mjs`
- Modify: `skills/audit/scripts/lib/session.mjs`
- Modify: `skills/audit/scripts/lib/task.mjs`
- Modify: `skills/audit/scripts/lib/mapping.mjs`

- [ ] **Step 1: Stop writing `status` per task in `writeIndexYaml`**

In `yaml.mjs`, find `writeIndexYaml` (line 287). The function currently maps tasks to `{ file, status }` entries. Change each mapping to omit `status`:

```js
codeTasks: (data.codeTasks || data.tasks || []).map(t => ({ file: t.file })),
storyTasks: (data.storyTasks || []).map(t => ({ file: t.file })),
projectTasks: (data.projectTasks || []).map(t => {
  const entry = { file: t.file };
  if (t.type) entry.type = t.type;
  if (t.entry) entry.entry = t.entry;
  return entry;
}),
```

- [ ] **Step 2: Update `getSession` to read status from task files**

In `session.mjs`, find `getSession` (line 79). Currently it reads status from index entries. Change it to read from each task file:

```js
export function getSession(reportsDir, sid) {
  const safeSid = sanitizePath(sid);
  const sessionDir = path.join(reportsDir, safeSid);
  const indexPath = path.join(sessionDir, "index.yaml");
  if (!fs.existsSync(indexPath)) return null;
  const index = readYaml(indexPath);

  const codeTasks = [];
  const storyTasks = [];
  const projectTasks = [];
  const counts = { reviewed: 0, reviewing: 0, pending: 0 };

  for (const ref of index.codeTasks || []) {
    const taskPath = path.join(sessionDir, ref.file);
    const status = fs.existsSync(taskPath) ? (readYaml(taskPath).status || "pending") : "pending";
    counts[status] = (counts[status] || 0) + 1;
    codeTasks.push({ ...ref, status });
  }
  for (const ref of index.storyTasks || []) {
    const taskPath = path.join(sessionDir, ref.file);
    const status = fs.existsSync(taskPath) ? (readYaml(taskPath).status || "pending") : "pending";
    counts[status] = (counts[status] || 0) + 1;
    storyTasks.push({ ...ref, status });
  }
  for (const ref of index.projectTasks || []) {
    const taskPath = path.join(sessionDir, ref.file);
    const taskData = fs.existsSync(taskPath) ? readYaml(taskPath) : {};
    const status = taskData.status || "pending";
    counts[status] = (counts[status] || 0) + 1;
    projectTasks.push({ ...ref, status });
  }

  const allTasks = [...codeTasks, ...storyTasks, ...projectTasks];
  return {
    ...index.session,
    status: index.session.status || "created",
    codeTasks,
    storyTasks,
    projectTasks,
    progress: {
      total: allTasks.length,
      ...counts,
      percentage: allTasks.length ? Math.round((counts.reviewed / allTasks.length) * 100) : 0,
    },
  };
}
```

- [ ] **Step 3: Update `listSessions` to read status from task files**

In `session.mjs`, find `listSessions` (line 53). Currently it reads status from index entries. Change to read from task files:

```js
export function listSessions(reportsDir) {
  if (!fs.existsSync(reportsDir)) return [];
  const entries = fs.readdirSync(reportsDir).filter(e => {
    const full = path.join(reportsDir, e);
    if (!fs.statSync(full).isDirectory()) return false;
    return fs.existsSync(path.join(full, "index.yaml"));
  });
  return entries.map(id => {
    const index = readYaml(path.join(reportsDir, id, "index.yaml"));
    const sessionDir = path.join(reportsDir, id);
    const taskRefs = [
      ...(index.codeTasks || []),
      ...(index.storyTasks || []),
      ...(index.projectTasks || []),
    ];
    let reviewed = 0;
    for (const ref of taskRefs) {
      const taskPath = path.join(sessionDir, ref.file);
      if (fs.existsSync(taskPath) && readYaml(taskPath).status === "reviewed") {
        reviewed++;
      }
    }
    return {
      id: index.session.id,
      type: index.session.type,
      status: index.session.status || "created",
      created: index.session.created,
      progress: {
        total: taskRefs.length,
        reviewed,
        percentage: taskRefs.length ? Math.round((reviewed / taskRefs.length) * 100) : 0,
      },
    };
  }).sort((a, b) => b.id.localeCompare(a.id));
}
```

- [ ] **Step 4: Remove index sync from `updateTask`**

In `task.mjs`, find `updateTask` (line 9). Remove the second `readYaml(indexPath)` + `writeIndexYaml(indexPath, index)` block that syncs task status back to the index. The function should only update the task file and check completion:

```js
export function updateTask(reportsDir, sid, taskFile, status, score, reviewData, overview) {
  if (!ALLOWED_STATUSES.includes(status)) {
    throw new AppError("Invalid status: " + status + ". Allowed: " + ALLOWED_STATUSES.join(", "), "VALIDATION_ERROR", 400);
  }

  const safeSid = sanitizePath(sid);
  const sessionDir = path.join(reportsDir, safeSid);
  const safeTaskFile = sanitizeFilePath(taskFile);
  const taskPath = path.join(sessionDir, safeTaskFile);
  const indexPath = path.join(sessionDir, "index.yaml");

  if (!fs.existsSync(taskPath)) throw new AppError("Task file not found", "NOT_FOUND", 404);
  if (!fs.existsSync(indexPath)) throw new AppError("Session not found: " + safeSid, "NOT_FOUND", 404);

  const task = readYaml(taskPath);
  task.status = status;
  if (score !== undefined && score !== null) task.review.score = parseInt(score, 10);
  if (reviewData) {
    task.review = { ...task.review, ...reviewData };
  }
  if (overview && (overview.diagram || overview.description)) {
    task.overview = overview;
  }
  writeYaml(taskPath, task);

  // Check if all tasks are reviewed
  const index = readYaml(indexPath);
  let allReviewed = true;
  for (const taskGroup of ["codeTasks", "storyTasks", "projectTasks"]) {
    for (const ref of index[taskGroup] || []) {
      const tp = path.join(sessionDir, ref.file);
      if (!fs.existsSync(tp) || readYaml(tp).status !== "reviewed") {
        allReviewed = false;
        break;
      }
    }
    if (!allReviewed) break;
  }
  if (allReviewed) {
    updateSessionStatus(reportsDir, safeSid, "completed");
  }

  return { file: safeTaskFile, status };
}
```

- [ ] **Step 5: Update `resetReviewing` to not write status to index**

In `session.mjs`, find `resetReviewing` (line 180). Remove the `t.status = "pending"` mutation and the final `writeIndexYaml` call:

```js
export function resetReviewing(reportsDir, sid) {
  const safeSid = sanitizePath(sid);
  const sessionDir = path.join(reportsDir, safeSid);
  const indexPath = path.join(sessionDir, "index.yaml");
  if (!fs.existsSync(indexPath)) throw new AppError("Session not found: " + safeSid, "NOT_FOUND", 404);

  let resetCount = 0;

  for (const taskGroup of ["codeTasks", "storyTasks", "projectTasks"]) {
    const index = readYaml(indexPath);
    const tasks = index[taskGroup] || [];
    for (const ref of tasks) {
      const taskPath = path.join(sessionDir, ref.file);
      if (fs.existsSync(taskPath)) {
        const task = readYaml(taskPath);
        if (task.status === "reviewing") {
          task.status = "pending";
          writeYaml(taskPath, task);
          resetCount++;
        }
      }
    }
  }

  return resetCount;
}
```

- [ ] **Step 6: Update `mapping.mjs` — remove status from task entries**

In `mapping.mjs`, find `setScope` (line 9). Change the task entries from `{ file: ..., status: "pending" }` to just `{ file: ... }`:

Find:
```js
tasks.push({ file: "code-tasks/" + tf, status: "pending" });
```
Replace with:
```js
tasks.push({ file: "code-tasks/" + tf });
```

- [ ] **Step 7: Verify server starts and API responds**

Run:
```bash
cd skills/audit/scripts && node cli.mjs server 3457 &
sleep 2
curl -s http://localhost:3457/api/sessions | head -c 200
kill %1
```
Expected: JSON array response (may be empty `[]`)

- [ ] **Step 8: Commit**

```bash
git add skills/audit/scripts/lib/yaml.mjs skills/audit/scripts/lib/session.mjs skills/audit/scripts/lib/task.mjs skills/audit/scripts/lib/mapping.mjs
git commit -m "refactor: derive task status from task files, eliminate index.yaml duplication"
```

---

### Task 5: Split `wizard.mjs`

**Files:**
- Create: `skills/audit/scripts/public/js/views/wizard-scope.mjs`
- Create: `skills/audit/scripts/public/js/views/wizard-stories.mjs`
- Create: `skills/audit/scripts/public/js/views/wizard-project.mjs`
- Modify: `skills/audit/scripts/public/js/views/wizard.mjs`

This is a pure extraction — no behavioral changes. The wizard shell keeps state management and step routing. Sub-modules receive state and callbacks.

- [ ] **Step 1: Create `views/wizard-scope.mjs`**

Extract `renderStep2()`, `renderScopeContent()`, and `loadFilePreview()` from `wizard.mjs` into a new file. The module exports a single function:

```js
// skills/audit/scripts/public/js/views/wizard-scope.mjs
import { api } from "../api.mjs";
import { showToast, icon, escapeHtml, initTabKeyboard } from "../app.mjs";
import { renderScopeFileTree } from "../components/scope-file-tree.mjs";

export function renderScopeStep(content, { sessionId, scopeMethod, scopeRef, excludedFiles, scopeTreeInstance, previewGeneration, onScopeChange, onConfirm, onBack }) {
```

The function contains the full step 2 rendering logic. State mutations (`scopeMethod`, `scopeRef`, etc.) are communicated back via the `onScopeChange` callback. The `scopeTreeInstance` and `previewGeneration` refs are managed by the caller.

Actually, since the wizard shell manages state through closures, the cleanest approach is to have each sub-module export a function that receives the content element and the wizard's state/callbacks. The sub-module reads state and calls callbacks — it doesn't own state.

The interface for each sub-module:
```js
export function renderScopeStep(content, state)
```

Where `state` is an object with all the wizard's mutable state and helper functions (`sessionId`, `scopeMethod`, `scopeRef`, `excludedFiles`, `save`, `setDirty`, `goBack`, `render`, etc.).

- [ ] **Step 2: Move `renderStep2`, `renderScopeContent`, `loadFilePreview` to `wizard-scope.mjs`**

Move these three functions into `renderScopeStep` or as internal helpers within `wizard-scope.mjs`. The function signature:

```js
export function renderScopeStep(content, {
  sessionId, scopeMethod, scopeRef, excludedFiles,
  save, setDirty, goBack, render, onScopeTreeUpdate
}) {
  // ... exact same code as renderStep2 + renderScopeContent + loadFilePreview
  // Replace closure variable reads with destructured params
  // Replace closure variable writes with callback calls
}
```

Since `scopeMethod`, `scopeRef`, and `excludedFiles` are reassigned inside the step (e.g. `scopeMethod = tab.dataset.method`), the sub-module needs a way to update the parent's state. Two options:
a) Pass a `setState` callback: `setState({ scopeMethod, scopeRef, excludedFiles })`
b) Use a mutable state object: pass the wizard's state object directly

Go with (b) — pass a mutable state object. The wizard already uses local variables; wrap them in an object that both the wizard and sub-modules mutate.

- [ ] **Step 3: Create `views/wizard-stories.mjs`**

Extract `renderStep3()` and `loadAccordionFileTree()` into `wizard-stories.mjs`:

```js
// skills/audit/scripts/public/js/views/wizard-stories.mjs
import { api } from "../api.mjs";
import { showToast, icon, escapeHtml } from "../app.mjs";
import { renderFileTree } from "../components/file-tree.mjs";

export function renderStoriesStep(content, state) {
  // ... renderStep3 + loadAccordionFileTree code
}
```

- [ ] **Step 4: Create `views/wizard-project.mjs`**

Extract `renderProjectConfigure()`, `renderGroupStep()`, `renderProjectReady()`, and `renderCodegraphStatus()` into `wizard-project.mjs`:

```js
// skills/audit/scripts/public/js/views/wizard-project.mjs
import { api } from "../api.mjs";
import { showToast, icon, escapeHtml, onNavigateCleanup, renderTerminalCard } from "../app.mjs";

export function renderCodegraphStatus(containerId, projectDir) {
  // ... exact same code
}

export function renderProjectConfigure(content, state) {
  // ... renderProjectConfigure code
}

export function renderGroupStep(content, state) {
  // ... renderGroupStep code
}

export function renderProjectReady(content, state) {
  // ... renderProjectReady code
}
```

- [ ] **Step 5: Slim down `wizard.mjs` to a shell**

The wizard shell keeps:
- State variables and `save`/`setDirty`/`goBack` helpers
- `render()` function (step routing)
- `renderStep1()` (type selection — small, keep inline)
- `renderStep4()` (ready step for code/all — keep inline since it's shared between code and all flows)
- `formatScopeDisplay()` helper
- Cleanup registration

Replace the extracted function bodies with delegation calls:

```js
import { renderScopeStep } from "./wizard-scope.mjs";
import { renderStoriesStep } from "./wizard-stories.mjs";
import { renderProjectConfigure, renderGroupStep, renderProjectReady, renderCodegraphStatus } from "./wizard-project.mjs";
```

In `render()`, change the step dispatch from calling local functions to calling the imported ones:

```js
if (step === 2 && reviewType === "project") renderProjectConfigure(content, state);
else if (step === 2) renderScopeStep(content, state);
else if (step === 3 && reviewType === "project") renderGroupStep(content, state);
else if (step === 3 && reviewType === "all") renderStoriesStep(content, state);
// ... etc
```

The `state` object is created in `renderWizard`:
```js
const state = {
  sessionId, isNew, step, reviewType, scopeMethod, scopeRef,
  stories, storyMappings, excludedFiles, contextExpanded,
  scopeTreeInstance, previewGeneration, pendingExpandIndex,
  defaultProjectDir, dirty,
  save, setDirty, goBack, render, schedulePoll, clearPoll,
};
```

Since the sub-modules mutate `state` properties directly (e.g. `state.scopeMethod = ...`), the wizard sees the changes when it re-reads those properties.

- [ ] **Step 6: Verify the app loads in browser**

Start the server, open `http://localhost:3456`, create a new audit session, and walk through each wizard step:
1. Code review → scope selection → ready
2. Code + story → scope → stories → ready
3. Project scan → configure → group → ready

Check browser console for errors.

- [ ] **Step 7: Commit**

```bash
git add skills/audit/scripts/public/js/views/wizard.mjs skills/audit/scripts/public/js/views/wizard-scope.mjs skills/audit/scripts/public/js/views/wizard-stories.mjs skills/audit/scripts/public/js/views/wizard-project.mjs
git commit -m "refactor: split wizard.mjs into scope, stories, and project sub-modules"
```
