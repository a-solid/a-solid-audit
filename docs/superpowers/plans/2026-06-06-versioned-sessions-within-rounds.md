# Versioned Sessions Within Rounds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add version numbers to sessions within rounds, move review-notes back to session level, add re-review and round summary endpoints.

**Architecture:** Sessions within a round get auto-incrementing version numbers. Review-notes.yaml lives per-session. Re-review reads the latest session's notes to identify need-fix files and creates a new versioned session. Round summary merges latest per-file data across all sessions.

**Tech Stack:** Node.js (no dependencies), custom router, YAML read/write, vanilla browser JS.

---

## File Structure

| File | Responsibility |
|---|---|
| `skills/audit/scripts/server/handlers/rounds.mjs` | Modify — remove round-level notes, add `POST sessions`, `POST re-review`, `GET summary` |
| `skills/audit/scripts/server/handlers/notes.mjs` | Modify — move back to session-level notes |
| `skills/audit/scripts/server/handlers/reviews.mjs` | Modify — auto-populate session-level notes (not round-level) |
| `skills/audit/scripts/lib/session.mjs` | Modify — add `version` field, remove `roundId` from session metadata (it's implicit from directory) |
| `skills/audit/scripts/lib/mapping.mjs` | Modify — remove task exclusion (re-review handles this), update for re-review scope |
| `skills/audit/prompts/code-review.md` | Modify — read prior session's notes |
| `skills/audit/SKILL.md` | Modify — update flow |
| `skills/audit/scripts/public/js/api.mjs` | Modify — add re-review and round summary methods |

---

### Task 1: Move notes back to session level

**Files:**
- Modify: `skills/audit/scripts/server/handlers/notes.mjs`

- [ ] **Step 1: Rewrite notes.mjs to work at session level**

Replace the entire file with:

```js
// skills/audit/scripts/server/handlers/notes.mjs
import fs from "node:fs";
import path from "node:path";
import { sanitizePath, resolveSessionPath } from "../../lib/session.mjs";
import { readYaml, writeYaml } from "../../lib/yaml.mjs";
import { jsonResponse, readBody, errorResponse } from "../index.mjs";

const NOTES_FILE = "review-notes.yaml";
const VALID_STATUSES = ["pending", "need-fix", "wont-fix", "not-an-issue", "well-done"];

function resolveSessionDir(reportsDir, sid) {
  const safeSid = sanitizePath(sid);
  const indexPath = resolveSessionPath(reportsDir, safeSid);
  if (!indexPath) return null;
  return path.dirname(indexPath);
}

function readNotes(sessionDir) {
  const p = path.join(sessionDir, NOTES_FILE);
  if (!fs.existsSync(p)) return { tasks: [], summary: { notes: "", signoff: { name: "", role: "", date: "" } } };
  return readYaml(p);
}

function writeNotes(sessionDir, data) {
  writeYaml(path.join(sessionDir, NOTES_FILE), data);
}

export function registerNoteRoutes(router, reportsDir) {
  // GET /api/sessions/:id/notes
  router.get("/api/sessions/:id/notes", (req, res, params) => {
    const sessionDir = resolveSessionDir(reportsDir, params.id);
    if (!sessionDir) return errorResponse(res, "Session not found", "NOT_FOUND", 404);
    jsonResponse(res, readNotes(sessionDir));
  });

  // POST /api/sessions/:id/notes — update task review
  router.post("/api/sessions/:id/notes", async (req, res, params) => {
    const sessionDir = resolveSessionDir(reportsDir, params.id);
    if (!sessionDir) return errorResponse(res, "Session not found", "NOT_FOUND", 404);

    const body = JSON.parse(await readBody(req));
    if (!body || typeof body.file !== "string" || !body.file) {
      return errorResponse(res, "Missing required field: file", "VALIDATION_ERROR", 400);
    }
    if (body.findings !== undefined && !Array.isArray(body.findings)) {
      return errorResponse(res, "findings must be an array", "VALIDATION_ERROR", 400);
    }
    if (body.findings) {
      for (let i = 0; i < body.findings.length; i++) {
        const s = body.findings[i]?.status;
        if (s && !VALID_STATUSES.includes(s)) {
          return errorResponse(res, "Invalid status at findings[" + i + "]: " + s, "VALIDATION_ERROR", 400);
        }
      }
    }

    const safeFile = body.file;
    const notes = readNotes(sessionDir);
    let entry = notes.tasks.find(t => t.file === safeFile);
    if (!entry) {
      entry = { file: safeFile, findings: [] };
      notes.tasks.push(entry);
    }

    if (body.findings !== undefined) entry.findings = body.findings;

    writeNotes(sessionDir, notes);
    jsonResponse(res, { ok: true });
  });

  // POST /api/sessions/:id/summary — update summary + sign-off
  router.post("/api/sessions/:id/summary", async (req, res, params) => {
    const sessionDir = resolveSessionDir(reportsDir, params.id);
    if (!sessionDir) return errorResponse(res, "Session not found", "NOT_FOUND", 404);

    const body = JSON.parse(await readBody(req));
    if (!body) return errorResponse(res, "Empty request body", "VALIDATION_ERROR", 400);

    const notes = readNotes(sessionDir);
    if (!notes.summary) notes.summary = { notes: "", signoff: { name: "", role: "", date: "" } };
    if (body.notes !== undefined) notes.summary.notes = body.notes;
    if (body.signoff !== undefined) {
      if (body.signoff === null) {
        notes.summary.signoff = { name: "", role: "", date: "" };
      } else {
        Object.assign(notes.summary.signoff, body.signoff);
      }
    }

    writeNotes(sessionDir, notes);
    jsonResponse(res, { ok: true });
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add skills/audit/scripts/server/handlers/notes.mjs
git commit -m "refactor: move review-notes back to session level"
```

---

### Task 2: Update reviews.mjs — auto-populate session-level notes

**Files:**
- Modify: `skills/audit/scripts/server/handlers/reviews.mjs`

- [ ] **Step 1: Change round-notes auto-populate to session-level notes**

In the `POST /api/sessions/:id/tasks/review-yaml` handler, find the block that auto-populates round-level notes (starts with `// Auto-populate round-level review-notes.yaml`). Replace the entire block with session-level notes population:

Find and replace the block from `// Auto-populate round-level review-notes.yaml` through the closing `}` of that if-block, with:

```js
// Auto-populate session-level review-notes.yaml with finding descriptions
const notesPath = path.join(sessionDir, "review-notes.yaml");
let sessionNotes;
if (fs.existsSync(notesPath)) {
  sessionNotes = readYaml(notesPath);
} else {
  sessionNotes = { tasks: [], summary: { notes: "", signoff: { name: "", role: "", date: "" } } };
}

const reviewFindings = parsed.review?.findings || [];
let noteEntry = sessionNotes.tasks.find(t => t.file === safeFile);
if (!noteEntry) {
  noteEntry = { file: safeFile, findings: [] };
  sessionNotes.tasks.push(noteEntry);
}

for (const f of reviewFindings) {
  noteEntry.findings.push({
    status: "pending",
    reason: "",
    description: f.description || "",
    severity: f.severity || "",
    file: f.file || "",
    line: f.line || null,
  });
}

writeYaml(notesPath, sessionNotes);
```

Also remove the `writeYaml` import if it was only added for round-level notes — but keep it since it's used here.

- [ ] **Step 2: Commit**

```bash
git add skills/audit/scripts/server/handlers/reviews.mjs
git commit -m "refactor: auto-populate session-level review-notes with finding descriptions"
```

---

### Task 3: Add version field to session creation

**Files:**
- Modify: `skills/audit/scripts/lib/session.mjs`

- [ ] **Step 1: Add `version` to session creation in `createSession`**

In the `createSession` function, find the `writeIndexYaml` call. Add `version: options.version || 1` to the session object. The relevant block becomes:

```js
writeIndexYaml(path.join(sessionDir, "index.yaml"), {
  session: {
    id: safeSid,
    type: options.type || "code",
    status: "created",
    version: options.version || 1,
    scope: options.type === "project" ? null : { method: "", ref: "" },
    projectDir: options.projectDir || null,
    roundId: options.roundId || null,
    created: new Date().toISOString(),
  },
  codeTasks: [],
  storyTasks: [],
  projectTasks: [],
});
```

- [ ] **Step 2: Add `version` to `listSessions` return**

In `listSessions`, add `version: index.session.version || 1` to the returned object, after `roundId`:

```js
return {
  id: index.session.id,
  type: index.session.type,
  status: index.session.status || "created",
  created: index.session.created,
  roundId: index.session.roundId || null,
  version: index.session.version || 1,
  progress: { ... },
};
```

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/lib/session.mjs
git commit -m "feat: add version field to session metadata"
```

---

### Task 4: Add re-review endpoint to rounds.mjs

**Files:**
- Modify: `skills/audit/scripts/server/handlers/rounds.mjs`

- [ ] **Step 1: Add imports for re-review**

Add these imports at the top (after existing imports):

```js
import { runGitDiff, parseDiffByFile, detectLanguage, taskFileName } from "../../lib/git.mjs";
import { writeCodeTaskYaml, writeIndexYaml, readYaml as readYamlLib } from "../../lib/yaml.mjs";
import { sessionId, createSession, resolveSessionPath, listSessions } from "../../lib/session.mjs";
import { resolveProjectDir } from "../../lib/paths.mjs";
```

Note: `readYaml` is already imported. Use `readYamlLib` alias for the additional import if needed, or just use the existing `readYaml`.

Actually, `readYaml` is already imported. Just add the new imports:

```js
import { runGitDiff, parseDiffByFile, detectLanguage, taskFileName } from "../../lib/git.mjs";
import { writeCodeTaskYaml, writeIndexYaml } from "../../lib/yaml.mjs";
import { sessionId, createSession, resolveSessionPath, listSessions } from "../../lib/session.mjs";
import { resolveProjectDir } from "../../lib/paths.mjs";
```

- [ ] **Step 2: Remove round-level notes endpoints**

Remove these functions and routes from rounds.mjs:
- `readRoundNotes` function
- `writeRoundNotes` function
- `GET /api/rounds/:roundId/notes` route
- `POST /api/rounds/:roundId/notes` route
- `POST /api/rounds/:roundId/summary` route

Also remove the `VALID_STATUSES` constant since it's no longer needed here.

In `GET /api/rounds/:roundId`, remove the `notes` field from the response.

In `GET /api/rounds`, keep the sessions listing as-is.

- [ ] **Step 3: Add `POST /api/rounds/:roundId/sessions` endpoint**

Add before the closing `}` of `registerRoundRoutes`:

```js
  // POST /api/rounds/:roundId/sessions — create session within round
  router.post("/api/rounds/:roundId/sessions", async (req, res, params) => {
    const roundDir = findRoundDir(projectDir, params.roundId);
    if (!roundDir) return errorResponse(res, "Round not found", "NOT_FOUND", 404);

    let body = {};
    try { body = JSON.parse(await readBody(req)); } catch {}

    const reportsDir = resolveReportsDir(projectDir);
    const sessions = listSessions(reportsDir, params.roundId);
    const maxVersion = sessions.reduce((max, s) => Math.max(max, s.version || 1), 0);
    const nextVersion = maxVersion + 1;

    const sid = sessionId();
    const options = {
      type: body.type || "code",
      projectDir: resolveProjectDir(),
      roundId: params.roundId,
      version: nextVersion,
    };

    const result = createSession(reportsDir, sid, options);
    jsonResponse(res, { id: result.id, version: nextVersion, roundId: params.roundId }, 201);
  });
```

- [ ] **Step 4: Add `POST /api/rounds/:roundId/re-review` endpoint**

```js
  // POST /api/rounds/:roundId/re-review — create new versioned session with need-fix files
  router.post("/api/rounds/:roundId/re-review", async (req, res, params) => {
    const roundDir = findRoundDir(projectDir, params.roundId);
    if (!roundDir) return errorResponse(res, "Round not found", "NOT_FOUND", 404);

    let body = {};
    try { body = JSON.parse(await readBody(req)); } catch {}

    const reportsDir = resolveReportsDir(projectDir);
    const sessions = listSessions(reportsDir, params.roundId);
    if (sessions.length === 0) {
      return errorResponse(res, "No sessions in this round", "NOT_FOUND", 404);
    }

    // Find latest session
    const latest = sessions.reduce((a, b) => (a.version || 1) > (b.version || 1) ? a : b);
    const latestIndexPath = resolveSessionPath(reportsDir, latest.id);
    if (!latestIndexPath) return errorResponse(res, "Latest session not found", "NOT_FOUND", 404);
    const latestDir = path.dirname(latestIndexPath);

    // Read latest session's review-notes to find need-fix files
    const notesPath = path.join(latestDir, "review-notes.yaml");
    const needFixFiles = new Set(); // source file paths (e.g. src/auth/login.ts)
    if (fs.existsSync(notesPath)) {
      const notes = readYaml(notesPath);
      for (const task of notes.tasks || []) {
        const hasNeedFix = (task.findings || []).some(f => f.status === "need-fix");
        if (hasNeedFix && task.file) {
          // Extract source file name from task entry's findings
          for (const f of task.findings || []) {
            if (f.file) needFixFiles.add(f.file);
          }
        }
      }
    }

    // Merge with user-specified files
    if (Array.isArray(body.files)) {
      for (const f of body.files) needFixFiles.add(f);
    }

    if (needFixFiles.size === 0) {
      return errorResponse(res, "No files to re-review", "VALIDATION_ERROR", 400);
    }

    // Create new session
    const maxVersion = sessions.reduce((max, s) => Math.max(max, s.version || 1), 0);
    const nextVersion = maxVersion + 1;
    const sid = sessionId();
    const result = createSession(reportsDir, sid, {
      type: "code",
      projectDir: resolveProjectDir(),
      roundId: params.roundId,
      version: nextVersion,
    });

    // Generate task YAMLs from uncommitted diff for the need-fix files
    const diff = runGitDiff("uncommitted", "", projectDir);
    const filesMap = parseDiffByFile(diff);
    const tasksDir = path.join(result.dir, "code-tasks");
    fs.mkdirSync(tasksDir, { recursive: true });
    const tasks = [];

    for (const filePath of needFixFiles) {
      const fileData = filesMap[filePath];
      if (!fileData) continue;
      const diffText = fileData.diff;
      const hasChanges = diffText.split("\n").some(
        l => (l.startsWith("+") && !l.startsWith("+++")) || (l.startsWith("-") && !l.startsWith("---"))
      );
      if (!hasChanges) continue;

      const tf = taskFileName(filePath);
      const task = {
        name: filePath, status: "pending", language: detectLanguage(filePath),
        diff: diffText, review: { score: 0, summary: "", findings: [], positives: [] },
      };
      writeCodeTaskYaml(path.join(tasksDir, tf), task);
      tasks.push({ file: "code-tasks/" + tf, name: filePath, status: "pending" });
    }

    // Update index.yaml with tasks
    const indexPath = path.join(result.dir, "index.yaml");
    const index = readYaml(indexPath);
    writeIndexYaml(indexPath, {
      session: { ...index.session, status: "ready" },
      codeTasks: tasks,
      storyTasks: [],
      projectTasks: [],
    });

    jsonResponse(res, {
      ok: true,
      sessionId: sid,
      version: nextVersion,
      taskCount: tasks.length,
      files: tasks.map(t => t.name),
    });
  });
```

- [ ] **Step 5: Add `GET /api/rounds/:roundId/summary` endpoint**

```js
  // GET /api/rounds/:roundId/summary — round-level summary
  router.get("/api/rounds/:roundId/summary", (req, res, params) => {
    const roundDir = findRoundDir(projectDir, params.roundId);
    if (!roundDir) return errorResponse(res, "Round not found", "NOT_FOUND", 404);

    const reportsDir = resolveReportsDir(projectDir);
    const sessions = listSessions(reportsDir, params.roundId);
    if (sessions.length === 0) {
      return jsonResponse(res, { files: [], stats: { totalFiles: 0, totalFindings: 0, needFix: 0, wontFix: 0, notAnIssue: 0, wellDone: 0 } });
    }

    // For each file, find latest session that has it
    const fileMap = new Map(); // fileName -> { latestVersion, sessionId, review, findings }

    // Process sessions from oldest to newest so later versions overwrite
    const sorted = [...sessions].sort((a, b) => (a.version || 1) - (b.version || 1));

    for (const session of sorted) {
      const indexPath = resolveSessionPath(reportsDir, session.id);
      if (!indexPath) continue;
      const sessionDir = path.dirname(indexPath);
      const index = readYaml(indexPath);

      // Read tasks
      const allTaskRefs = [...(index.codeTasks || []), ...(index.storyTasks || []), ...(index.projectTasks || [])];
      for (const ref of allTaskRefs) {
        const taskPath = path.join(sessionDir, ref.file);
        if (!fs.existsSync(taskPath)) continue;
        const task = readYaml(taskPath);

        fileMap.set(ref.name || ref.file, {
          name: ref.name || ref.file,
          latestVersion: session.version || 1,
          sessionId: session.id,
          review: task.review || { score: 0, summary: "", findings: [] },
        });
      }

      // Read review-notes for this session
      const notesPath = path.join(sessionDir, "review-notes.yaml");
      if (fs.existsSync(notesPath)) {
        const notes = readYaml(notesPath);
        for (const noteTask of notes.tasks || []) {
          // Match noteTask.file to the task ref
          const matchingRef = allTaskRefs.find(r => r.file === noteTask.file);
          if (matchingRef) {
            const name = matchingRef.name || matchingRef.file;
            const existing = fileMap.get(name);
            if (existing && existing.sessionId === session.id) {
              existing.findings = noteTask.findings || [];
            }
          }
        }
      }
    }

    const files = [...fileMap.values()];
    const stats = { totalFiles: files.length, totalFindings: 0, needFix: 0, wontFix: 0, notAnIssue: 0, wellDone: 0, pending: 0 };

    for (const f of files) {
      for (const finding of f.findings || []) {
        stats.totalFindings++;
        const s = finding.status || "pending";
        if (s === "need-fix") stats.needFix++;
        else if (s === "wont-fix") stats.wontFix++;
        else if (s === "not-an-issue") stats.notAnIssue++;
        else if (s === "well-done") stats.wellDone++;
        else stats.pending++;
      }
    }

    jsonResponse(res, { files, stats });
  });
```

- [ ] **Step 6: Commit**

```bash
git add skills/audit/scripts/server/handlers/rounds.mjs
git commit -m "feat: add re-review, round sessions, and round summary endpoints"
```

---

### Task 5: Update session creation handler to pass version

**Files:**
- Modify: `skills/audit/scripts/server/handlers/sessions.mjs`

- [ ] **Step 1: Pass version from body to createSession**

In the `POST /api/sessions` handler, the body can now include `version`. Update the options:

```js
options = {
  type: body.type || "code",
  projectDir: body.projectDir || null,
  roundId: body.roundId || null,
  version: body.version || undefined,
};
```

And update the response to include version:

```js
jsonResponse(res, { id: result.id, projectDir: resolveProjectDir(), roundId: options.roundId, version: options.version || 1 }, 201);
```

- [ ] **Step 2: Commit**

```bash
git add skills/audit/scripts/server/handlers/sessions.mjs
git commit -m "feat: pass version field through session creation"
```

---

### Task 6: Update code-review prompt — read prior session notes

**Files:**
- Modify: `skills/audit/prompts/code-review.md`

- [ ] **Step 1: Update the "Prior Findings" section**

Find the `## Prior Findings (Round Context)` section and replace it with:

```markdown
## Prior Findings (Prior Session Context)

If `round-id` is provided and this is not version 1, read the prior session's `review-notes.yaml`.

1. Find the session directory for the current session (`.audit/<project>/<round-id>/<session-id>/`)
2. Look at the session's `version` in `index.yaml`
3. If version > 1, find another session in the same round directory with version = current - 1
4. Read that prior session's `review-notes.yaml`

For the current task file, check prior findings:
- Findings marked `wont-fix`, `not-an-issue`, or `well-done` — do NOT re-raise these. If the code hasn't changed, acknowledge they remain resolved.
- Findings marked `need-fix` — re-evaluate whether the fix was applied and the finding is still relevant.
- Findings marked `pending` — treat as new findings, review normally.

Use this context to avoid repeating already-triaged findings.
```

- [ ] **Step 2: Commit**

```bash
git add skills/audit/prompts/code-review.md
git commit -m "feat: update code review prompt to read prior session notes"
```

---

### Task 7: Update SKILL.md — versioned sessions flow

**Files:**
- Modify: `skills/audit/SKILL.md`

- [ ] **Step 1: Update the session creation step**

In section 1, step 5, change from creating via `POST /api/sessions` to `POST /api/rounds/:roundId/sessions`:

```markdown
5. Create a session within the round:
   ```bash
   curl -s -X POST http://localhost:3456/api/rounds/<round-id>/sessions -H 'Content-Type: application/json' -d '{"type":"code"}'
   ```
   Note the `id` and `version` from the response.
```

- [ ] **Step 2: Add re-review flow after the review loop**

After section 7 (Completion), add:

```markdown
### 8. Re-Review (if findings need fixes)

If the user marks findings as `need-fix` and wants to re-review after code changes:

1. The user clicks "Re-review" in the browser (on the round detail page)
2. The browser calls `POST /api/rounds/<round-id>/re-review` with selected files
3. A new session is created with `version = previous + 1` containing only the need-fix files
4. Wait for the new session to be ready: `curl http://localhost:3456/wait`
5. Proceed with the review loop on the new session's tasks
6. After completion, the round summary aggregates the latest review per file

Alternatively, trigger via API:
```bash
curl -s -X POST http://localhost:3456/api/rounds/<round-id>/re-review -H 'Content-Type: application/json' -d '{}'
```

To include additional files beyond need-fix ones:
```bash
curl -s -X POST http://localhost:3456/api/rounds/<round-id>/re-review -H 'Content-Type: application/json' -d '{"files":["src/extra-file.ts"]}'
```
```

- [ ] **Step 3: Commit**

```bash
git add skills/audit/SKILL.md
git commit -m "docs: update SKILL.md with versioned sessions and re-review flow"
```

---

### Task 8: Update frontend API client

**Files:**
- Modify: `skills/audit/scripts/public/js/api.mjs`

- [ ] **Step 1: Update round API methods**

Replace the existing round methods with:

```js
  // Rounds
  listRounds: () => request("GET", "/api/rounds"),
  getRound: (id) => request("GET", `/api/rounds/${encodeURIComponent(id)}`),
  createRound: (data) => request("POST", "/api/rounds", data),
  createRoundSession: (roundId, options = {}) =>
    request("POST", `/api/rounds/${encodeURIComponent(roundId)}/sessions`, options),
  reReview: (roundId, data = {}) =>
    request("POST", `/api/rounds/${encodeURIComponent(roundId)}/re-review`, data),
  getRoundSummary: (roundId) =>
    request("GET", `/api/rounds/${encodeURIComponent(roundId)}/summary`),
```

Remove the old `getRoundNotes`, `updateRoundNote`, `updateRoundSummary` methods (round-level notes no longer exist).

- [ ] **Step 2: Commit**

```bash
git add skills/audit/scripts/public/js/api.mjs
git commit -m "feat: update frontend API with versioned session and re-review methods"
```

---

### Task 9: Remove task exclusion from mapping.mjs

**Files:**
- Modify: `skills/audit/scripts/lib/mapping.mjs`

- [ ] **Step 1: Remove the resolvedFiles exclusion logic**

Find and remove the `resolvedFiles` block that was added for task exclusion (the block that reads round-notes and builds a set of resolved files). Also remove the `resolvedFiles.has(...)` check in the task loop.

The `setScope` function should no longer import or use `resolveSessionPath` for exclusion — it only uses it for session path resolution. Keep the `resolveSessionPath` import and usage for path resolution, but remove the exclusion logic.

- [ ] **Step 2: Commit**

```bash
git add skills/audit/scripts/lib/mapping.mjs
git commit -m "refactor: remove task exclusion from setScope (handled by re-review)"
```

---

### Task 10: Smoke test — full versioned session flow

- [ ] **Step 1: Start server**

```bash
node skills/audit/scripts/cli.mjs server 3456
```

- [ ] **Step 2: Create round**

```bash
curl -s -X POST http://localhost:3456/api/rounds -H 'Content-Type: application/json' -d '{"name":"july-release"}'
```

Note the round `id`.

- [ ] **Step 3: Create v1 session via round endpoint**

```bash
curl -s -X POST http://localhost:3456/api/rounds/<round-id>/sessions -H 'Content-Type: application/json' -d '{"type":"code"}'
```

Expected: `{ id: "...", version: 1, roundId: "..." }`

- [ ] **Step 4: Verify session has version=1**

```bash
curl -s http://localhost:3456/api/sessions/<session-id>
```

Expected: response includes `version: 1`.

- [ ] **Step 5: Get round summary (empty)**

```bash
curl -s http://localhost:3456/api/rounds/<round-id>/summary
```

Expected: `{ files: [], stats: { totalFiles: 0, ... } }`

- [ ] **Step 6: Create v2 session (re-review — will fail gracefully if no diff)**

```bash
curl -s -X POST http://localhost:3456/api/rounds/<round-id>/re-review -H 'Content-Type: application/json' -d '{"files":["skills/audit/scripts/lib/paths.mjs"]}'
```

Expected: `{ ok: true, sessionId: "...", version: 2, taskCount: 1, files: [...] }`

- [ ] **Step 7: Verify round has 2 sessions**

```bash
curl -s http://localhost:3456/api/rounds/<round-id>
```

Expected: `sessions` array with 2 entries, versions 1 and 2.
