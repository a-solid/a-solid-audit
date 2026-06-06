# Review Rounds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce rounds as a first-class entity grouping review sessions, with round-level `review-notes.yaml` that persists finding descriptions and triage decisions across sessions.

**Architecture:** Breaking change — storage layout becomes `.audit/<project>/<round>/<session>/`. Round API handlers in a new file. Session creation requires `roundId`. Review submission auto-populates round-level notes with finding descriptions. `setScope` excludes fully-resolved tasks based on prior notes.

**Tech Stack:** Node.js (no dependencies), custom router, YAML read/write, vanilla browser JS.

---

## File Structure

| File | Responsibility |
|---|---|
| `skills/audit/scripts/server/handlers/rounds.mjs` | New — Round CRUD API |
| `skills/audit/scripts/lib/session.mjs` | Modify — `createSession` requires `roundId`, `listSessions` works within round |
| `skills/audit/scripts/lib/paths.mjs` | Modify — `resolveReportsDir` returns round dir, add `resolveRoundDir` |
| `skills/audit/scripts/server/index.mjs` | Modify — Register round routes |
| `skills/audit/scripts/server/handlers/sessions.mjs` | Modify — Session creation requires `roundId`, remove session-level notes endpoints |
| `skills/audit/scripts/server/handlers/notes.mjs` | Modify — Read/write from round-level `review-notes.yaml`, add descriptions |
| `skills/audit/scripts/server/handlers/reviews.mjs` | Modify — After review-yaml, update round-level notes with finding descriptions |
| `skills/audit/scripts/lib/mapping.mjs` | Modify — `setScope` excludes fully-resolved tasks |
| `skills/audit/scripts/server/handlers/project-scan.mjs` | Modify — Use round-aware paths |
| `skills/audit/prompts/code-review.md` | Modify — Add `round-id` context, prior findings instructions |
| `skills/audit/prompts/story-review.md` | Modify — Same |
| `skills/audit/prompts/project-review.md` | Modify — Same |
| `skills/audit/SKILL.md` | Modify — Add round creation step, update all API calls |
| `skills/audit/scripts/public/js/api.mjs` | Modify — Add round API methods |
| `skills/audit/scripts/public/js/views/summary.mjs` | Modify — Use round-level notes API |

---

### Task 1: Add round utilities to `paths.mjs`

**Files:**
- Modify: `skills/audit/scripts/lib/paths.mjs`

- [ ] **Step 1: Add `roundId` helper and `resolveRoundDir`**

After the existing `resolveReportsDir` function (line 51), add:

```js
export function roundId() {
  return new Date().toISOString().replace(/:/g, "-");
}

export function resolveRoundDir(projectDir, rid) {
  const reportsDir = resolveReportsDir(projectDir);
  const safeRid = rid.replace(/[:\\]/g, "-");
  return path.join(reportsDir, safeRid);
}
```

Also add the import for `loadAuditSettings` reuse (it's already a module-level function, so no change needed there).

- [ ] **Step 2: Commit**

```bash
git add skills/audit/scripts/lib/paths.mjs
git commit -m "feat: add roundId and resolveRoundDir to paths"
```

---

### Task 2: Create round API handler

**Files:**
- Create: `skills/audit/scripts/server/handlers/rounds.mjs`

- [ ] **Step 1: Create `skills/audit/scripts/server/handlers/rounds.mjs`**

```js
// skills/audit/scripts/server/handlers/rounds.mjs
import fs from "node:fs";
import path from "node:path";
import { sanitizePath } from "../../lib/session.mjs";
import { readYaml, writeYaml } from "../../lib/yaml.mjs";
import { jsonResponse, errorResponse, readBody } from "../index.mjs";
import { resolveReportsDir } from "../../lib/paths.mjs";

const VALID_STATUSES = ["pending", "need-fix", "wont-fix", "not-an-issue", "well-done"];

function findRoundDir(projectDir, rid) {
  const reportsDir = resolveReportsDir(projectDir);
  const safeRid = sanitizePath(rid);
  const roundDir = path.join(reportsDir, safeRid);
  if (!fs.existsSync(path.join(roundDir, "round.yaml"))) return null;
  return roundDir;
}

function readRoundNotes(roundDir) {
  const p = path.join(roundDir, "review-notes.yaml");
  if (!fs.existsSync(p)) return { tasks: [], summary: { notes: "", signoff: { name: "", role: "", date: "" } } };
  return readYaml(p);
}

function writeRoundNotes(roundDir, data) {
  writeYaml(path.join(roundDir, "review-notes.yaml"), data);
}

export function registerRoundRoutes(router, projectDir) {
  // POST /api/rounds — create round
  router.post("/api/rounds", async (req, res) => {
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      return errorResponse(res, "Invalid JSON", "PARSE_ERROR", 400);
    }

    const name = body?.name;
    if (!name || typeof name !== "string") {
      return errorResponse(res, "Missing required field: name", "VALIDATION_ERROR", 400);
    }

    const reportsDir = resolveReportsDir(projectDir);
    const rid = new Date().toISOString().replace(/:/g, "-");
    const roundDir = path.join(reportsDir, rid);
    fs.mkdirSync(roundDir, { recursive: true });

    writeYaml(path.join(roundDir, "round.yaml"), {
      name,
      description: body.description || "",
      created: new Date().toISOString(),
    });

    writeRoundNotes(roundDir, { tasks: [], summary: { notes: "", signoff: { name: "", role: "", date: "" } } });

    jsonResponse(res, { id: rid, name }, 201);
  });

  // GET /api/rounds — list rounds
  router.get("/api/rounds", (req, res) => {
    const reportsDir = resolveReportsDir(projectDir);
    if (!fs.existsSync(reportsDir)) return jsonResponse(res, []);

    const rounds = [];
    for (const entry of fs.readdirSync(reportsDir)) {
      const roundDir = path.join(reportsDir, entry);
      if (!fs.statSync(roundDir).isDirectory()) continue;
      const roundYaml = path.join(roundDir, "round.yaml");
      if (!fs.existsSync(roundYaml)) continue;
      const data = readYaml(roundYaml);

      // Count sessions
      const sessions = [];
      for (const sub of fs.readdirSync(roundDir)) {
        const subDir = path.join(roundDir, sub);
        if (!fs.statSync(subDir).isDirectory()) continue;
        if (fs.existsSync(path.join(subDir, "index.yaml"))) {
          const index = readYaml(path.join(subDir, "index.yaml"));
          sessions.push({
            id: index.session.id,
            type: index.session.type,
            status: index.session.status || "created",
            created: index.session.created,
          });
        }
      }
      sessions.sort((a, b) => b.created.localeCompare(a.created));

      rounds.push({ id: entry, name: data.name, description: data.description || "", created: data.created, sessions });
    }
    rounds.sort((a, b) => b.created.localeCompare(a.created));
    jsonResponse(res, rounds);
  });

  // GET /api/rounds/:roundId — round detail
  router.get("/api/rounds/:roundId", (req, res, params) => {
    const roundDir = findRoundDir(projectDir, params.roundId);
    if (!roundDir) return errorResponse(res, "Round not found", "NOT_FOUND", 404);

    const data = readYaml(path.join(roundDir, "round.yaml"));
    const notes = readRoundNotes(roundDir);

    const sessions = [];
    for (const entry of fs.readdirSync(roundDir)) {
      const subDir = path.join(roundDir, entry);
      if (!fs.statSync(subDir).isDirectory()) continue;
      if (fs.existsSync(path.join(subDir, "index.yaml"))) {
        const index = readYaml(path.join(subDir, "index.yaml"));
        const taskRefs = [...(index.codeTasks || []), ...(index.storyTasks || []), ...(index.projectTasks || [])];
        const reviewed = taskRefs.filter(t => t.status === "reviewed").length;
        sessions.push({
          id: index.session.id,
          type: index.session.type,
          status: index.session.status || "created",
          created: index.session.created,
          progress: { total: taskRefs.length, reviewed, percentage: taskRefs.length ? Math.round((reviewed / taskRefs.length) * 100) : 0 },
        });
      }
    }
    sessions.sort((a, b) => b.created.localeCompare(a.created));

    jsonResponse(res, { id: params.roundId, name: data.name, description: data.description || "", created: data.created, sessions, notes });
  });

  // GET /api/rounds/:roundId/notes
  router.get("/api/rounds/:roundId/notes", (req, res, params) => {
    const roundDir = findRoundDir(projectDir, params.roundId);
    if (!roundDir) return errorResponse(res, "Round not found", "NOT_FOUND", 404);
    jsonResponse(res, readRoundNotes(roundDir));
  });

  // POST /api/rounds/:roundId/notes — update findings
  router.post("/api/rounds/:roundId/notes", async (req, res, params) => {
    const roundDir = findRoundDir(projectDir, params.roundId);
    if (!roundDir) return errorResponse(res, "Round not found", "NOT_FOUND", 404);

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
    const notes = readRoundNotes(roundDir);
    let entry = notes.tasks.find(t => t.file === safeFile);
    if (!entry) {
      entry = { file: safeFile, findings: [] };
      notes.tasks.push(entry);
    }

    if (body.findings !== undefined) entry.findings = body.findings;

    writeRoundNotes(roundDir, notes);
    jsonResponse(res, { ok: true });
  });

  // POST /api/rounds/:roundId/summary — update summary + sign-off
  router.post("/api/rounds/:roundId/summary", async (req, res, params) => {
    const roundDir = findRoundDir(projectDir, params.roundId);
    if (!roundDir) return errorResponse(res, "Round not found", "NOT_FOUND", 404);

    const body = JSON.parse(await readBody(req));
    if (!body) return errorResponse(res, "Empty request body", "VALIDATION_ERROR", 400);

    const notes = readRoundNotes(roundDir);
    if (!notes.summary) notes.summary = { notes: "", signoff: { name: "", role: "", date: "" } };
    if (body.notes !== undefined) notes.summary.notes = body.notes;
    if (body.signoff !== undefined) {
      if (body.signoff === null) {
        notes.summary.signoff = { name: "", role: "", date: "" };
      } else {
        Object.assign(notes.summary.signoff, body.signoff);
      }
    }

    writeRoundNotes(roundDir, notes);
    jsonResponse(res, { ok: true });
  });
}
```

- [ ] **Step 2: Register round routes in `skills/audit/scripts/server/index.mjs`**

Add import at top (after line 15):

```js
import { registerRoundRoutes } from "./handlers/rounds.mjs";
```

Add registration in `startServer` (after `registerWaitRoutes(router);` on line 62):

```js
registerRoundRoutes(router, projectDir);
```

- [ ] **Step 3: Verify server starts**

Run: `node skills/audit/scripts/cli.mjs server 3457 &` then `curl -s http://localhost:3457/api/rounds`, then kill.

Expected: `[]`

- [ ] **Step 4: Commit**

```bash
git add skills/audit/scripts/server/handlers/rounds.mjs skills/audit/scripts/server/index.mjs
git commit -m "feat: add round API — create, list, detail, notes"
```

---

### Task 3: Update `session.mjs` — session creation under round

**Files:**
- Modify: `skills/audit/scripts/lib/session.mjs`

- [ ] **Step 1: Update `createSession` to accept `roundId`**

Replace `createSession` function (lines 182-200) with:

```js
export function createSession(reportsDir, sid, options = {}) {
  const safeSid = sanitizePath(sid);
  let sessionDir;
  if (options.roundId) {
    const safeRoundId = sanitizePath(options.roundId);
    const roundDir = path.join(reportsDir, safeRoundId);
    if (!fs.existsSync(path.join(roundDir, "round.yaml"))) {
      throw new AppError("Round not found: " + safeRoundId, "NOT_FOUND", 404);
    }
    sessionDir = path.join(roundDir, safeSid);
  } else {
    sessionDir = path.join(reportsDir, safeSid);
  }
  fs.mkdirSync(path.join(sessionDir, "code-tasks"), { recursive: true });
  fs.mkdirSync(path.join(sessionDir, "story-tasks"), { recursive: true });
  fs.mkdirSync(path.join(sessionDir, "project-tasks"), { recursive: true });
  fs.writeFileSync(
    path.join(sessionDir, "review-context.md"),
    "## User Context\n\n\n## Review Notes\n<!-- AI agents append shared observations here -->\n",
    "utf-8",
  );
  writeIndexYaml(path.join(sessionDir, "index.yaml"), {
    session: {
      id: safeSid,
      type: options.type || "code",
      status: "created",
      scope: options.type === "project" ? null : { method: "", ref: "" },
      projectDir: options.projectDir || null,
      roundId: options.roundId || null,
      created: new Date().toISOString(),
    },
    codeTasks: [],
    storyTasks: [],
    projectTasks: [],
  });
  return { id: safeSid, dir: sessionDir };
}
```

Note: `initSession` is no longer called separately — its logic is inlined. The `roundId` is stored in `index.yaml` session metadata.

- [ ] **Step 2: Update `listSessions` to accept optional `roundId`**

Replace `listSessions` function (lines 54-81) with:

```js
export function listSessions(reportsDir, roundId) {
  if (!fs.existsSync(reportsDir)) return [];
  let scanDir = reportsDir;
  if (roundId) {
    const safeRoundId = sanitizePath(roundId);
    scanDir = path.join(reportsDir, safeRoundId);
    if (!fs.existsSync(scanDir)) return [];
  }
  const entries = fs.readdirSync(scanDir).filter(e => {
    const full = path.join(scanDir, e);
    if (!fs.statSync(full).isDirectory()) return false;
    return fs.existsSync(path.join(full, "index.yaml"));
  });
  return entries.map(id => {
    const index = readYaml(path.join(scanDir, id, "index.yaml"));
    const taskRefs = [
      ...(index.codeTasks || []),
      ...(index.storyTasks || []),
      ...(index.projectTasks || []),
    ];
    const reviewed = taskRefs.filter(t => t.status === "reviewed").length;
    return {
      id: index.session.id,
      type: index.session.type,
      status: index.session.status || "created",
      created: index.session.created,
      roundId: index.session.roundId || null,
      progress: {
        total: taskRefs.length,
        reviewed,
        percentage: taskRefs.length ? Math.round((reviewed / taskRefs.length) * 100) : 0,
      },
    };
  }).sort((a, b) => b.id.localeCompare(a.id));
}
```

- [ ] **Step 3: Update `getSession` to resolve session dir from round**

Replace `getSession` function (lines 84-125) with:

```js
export function getSession(reportsDir, sid) {
  const safeSid = sanitizePath(sid);
  const indexPath = resolveSessionPath(reportsDir, safeSid);
  if (!indexPath) return null;
  const index = readYaml(indexPath);

  const codeTasks = [];
  const storyTasks = [];
  const projectTasks = [];
  const counts = { reviewed: 0, reviewing: 0, pending: 0 };

  for (const ref of index.codeTasks || []) {
    const status = ref.status || "pending";
    counts[status] = (counts[status] || 0) + 1;
    codeTasks.push({ ...ref, status });
  }
  for (const ref of index.storyTasks || []) {
    const status = ref.status || "pending";
    counts[status] = (counts[status] || 0) + 1;
    storyTasks.push({ ...ref, status });
  }
  for (const ref of index.projectTasks || []) {
    const status = ref.status || "pending";
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

Add a helper function before `getSession`:

```js
function resolveSessionPath(reportsDir, safeSid) {
  // Try direct path first (flat layout)
  const direct = path.join(reportsDir, safeSid, "index.yaml");
  if (fs.existsSync(direct)) return direct;
  // Search round subdirectories
  if (fs.existsSync(reportsDir)) {
    for (const entry of fs.readdirSync(reportsDir)) {
      const roundPath = path.join(reportsDir, entry, safeSid, "index.yaml");
      if (fs.existsSync(roundPath)) return roundPath;
    }
  }
  return null;
}
```

- [ ] **Step 4: Update `updateSessionStatus`, `updateSession`, `resetReviewing` to use `resolveSessionPath`**

Replace the path resolution in each function. For `updateSessionStatus` (line 133):

```js
const indexPath = resolveSessionPath(reportsDir, safeSid);
if (!indexPath) throw new AppError("Session not found: " + safeSid, "NOT_FOUND", 404);
```

For `updateSession` (line 154):

```js
const indexPath = resolveSessionPath(reportsDir, safeSid);
if (!indexPath) throw new AppError("Session not found: " + safeSid, "NOT_FOUND", 404);
```

For `resetReviewing` (line 205):

```js
const indexPath = resolveSessionPath(reportsDir, safeSid);
if (!indexPath) throw new AppError("Session not found: " + safeSid, "NOT_FOUND", 404);
```

- [ ] **Step 5: Commit**

```bash
git add skills/audit/scripts/lib/session.mjs
git commit -m "feat: sessions live under rounds, resolveSessionPath for round-aware lookup"
```

---

### Task 4: Update session creation handler

**Files:**
- Modify: `skills/audit/scripts/server/handlers/sessions.mjs`

- [ ] **Step 1: Require `roundId` in session creation**

In the `POST /api/sessions` handler (around line 36), change the body parsing and `createSession` call to:

```js
router.post("/api/sessions", async (req, res, params) => {
  const sid = sessionId();
  let options = { type: "code", projectDir: null, roundId: null };
  try {
    const body = JSON.parse(await readBody(req));
    options = {
      type: body.type || "code",
      projectDir: body.projectDir || null,
      roundId: body.roundId || null,
    };
  } catch { /* use defaults */ }
  if (!options.roundId) {
    return errorResponse(res, "Missing required field: roundId", "VALIDATION_ERROR", 400);
  }
  const result = createSession(reportsDir, sid, options);
  jsonResponse(res, { id: result.id, projectDir: resolveProjectDir(), roundId: options.roundId }, 201);
});
```

- [ ] **Step 2: Update `listSessions` call to pass `reportsDir` from handler**

In the `GET /api/sessions` handler, no change needed — it already calls `listSessions(reportsDir)` which now accepts optional `roundId`.

- [ ] **Step 3: Remove session-level notes and summary endpoints**

Remove these three routes from sessions.mjs:
- `POST /api/sessions/:id/review-notes` (the review-context append endpoint around line 122)
- No other notes routes are in sessions.mjs (they're in notes.mjs)

Keep the review-context read/write endpoints — those are per-session and unchanged.

- [ ] **Step 4: Commit**

```bash
git add skills/audit/scripts/server/handlers/sessions.mjs
git commit -m "feat: session creation requires roundId"
```

---

### Task 5: Update `notes.mjs` — round-level notes with descriptions

**Files:**
- Modify: `skills/audit/scripts/server/handlers/notes.mjs`

- [ ] **Step 1: Rewrite notes.mjs to read/write from round-level**

Replace the entire file with:

```js
// skills/audit/scripts/server/handlers/notes.mjs
import fs from "node:fs";
import path from "node:path";
import { sanitizePath } from "../../lib/session.mjs";
import { readYaml } from "../../lib/yaml.mjs";
import { jsonResponse, readBody, errorResponse } from "../index.mjs";

const VALID_STATUSES = ["pending", "need-fix", "wont-fix", "not-an-issue", "well-done"];

function resolveRoundDirFromSession(reportsDir, sid) {
  const safeSid = sanitizePath(sid);
  // Try direct path
  const directIndex = path.join(reportsDir, safeSid, "index.yaml");
  if (fs.existsSync(directIndex)) {
    const index = readYaml(directIndex);
    if (index.session.roundId) {
      return path.join(reportsDir, sanitizePath(index.session.roundId));
    }
    return path.join(reportsDir, safeSid);
  }
  // Search round subdirectories
  if (fs.existsSync(reportsDir)) {
    for (const entry of fs.readdirSync(reportsDir)) {
      const indexPath = path.join(reportsDir, entry, safeSid, "index.yaml");
      if (fs.existsSync(indexPath)) {
        const index = readYaml(indexPath);
        if (index.session.roundId) {
          return path.join(reportsDir, sanitizePath(index.session.roundId));
        }
        return path.join(reportsDir, entry, safeSid);
      }
    }
  }
  return null;
}

function readRoundNotes(roundDir) {
  const p = path.join(roundDir, "review-notes.yaml");
  if (!fs.existsSync(p)) return { tasks: [], summary: { notes: "", signoff: { name: "", role: "", date: "" } } };
  return readYaml(p);
}

export function registerNoteRoutes(router, reportsDir) {
  // GET /api/sessions/:id/notes — delegates to round-level notes
  router.get("/api/sessions/:id/notes", (req, res, params) => {
    const roundDir = resolveRoundDirFromSession(reportsDir, params.id);
    if (!roundDir) return errorResponse(res, "Session not found", "NOT_FOUND", 404);
    jsonResponse(res, readRoundNotes(roundDir));
  });

  // POST /api/sessions/:id/notes — delegates to round-level notes
  router.post("/api/sessions/:id/notes", async (req, res, params) => {
    const roundDir = resolveRoundDirFromSession(reportsDir, params.id);
    if (!roundDir) return errorResponse(res, "Session not found", "NOT_FOUND", 404);

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
    const notes = readRoundNotes(roundDir);
    let entry = notes.tasks.find(t => t.file === safeFile);
    if (!entry) {
      entry = { file: safeFile, findings: [] };
      notes.tasks.push(entry);
    }

    if (body.findings !== undefined) entry.findings = body.findings;

    const { writeYaml } = await import("../../lib/yaml.mjs");
    writeYaml(path.join(roundDir, "review-notes.yaml"), notes);
    jsonResponse(res, { ok: true });
  });

  // POST /api/sessions/:id/summary — delegates to round-level summary
  router.post("/api/sessions/:id/summary", async (req, res, params) => {
    const roundDir = resolveRoundDirFromSession(reportsDir, params.id);
    if (!roundDir) return errorResponse(res, "Session not found", "NOT_FOUND", 404);

    const body = JSON.parse(await readBody(req));
    if (!body) return errorResponse(res, "Empty request body", "VALIDATION_ERROR", 400);

    const notes = readRoundNotes(roundDir);
    if (!notes.summary) notes.summary = { notes: "", signoff: { name: "", role: "", date: "" } };
    if (body.notes !== undefined) notes.summary.notes = body.notes;
    if (body.signoff !== undefined) {
      if (body.signoff === null) {
        notes.summary.signoff = { name: "", role: "", date: "" };
      } else {
        Object.assign(notes.summary.signoff, body.signoff);
      }
    }

    const { writeYaml } = await import("../../lib/yaml.mjs");
    writeYaml(path.join(roundDir, "review-notes.yaml"), notes);
    jsonResponse(res, { ok: true });
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add skills/audit/scripts/server/handlers/notes.mjs
git commit -m "feat: notes read/write from round-level review-notes.yaml"
```

---

### Task 6: Update `reviews.mjs` — auto-populate round notes with finding descriptions

**Files:**
- Modify: `skills/audit/scripts/server/handlers/reviews.mjs`

- [ ] **Step 1: Add round-notes update after review-yaml submission**

After the `appendReview` call on line 112, add logic to update the round's `review-notes.yaml` with finding descriptions. Add this import at the top:

```js
import { writeYaml } from "../../lib/yaml.mjs";
```

Then after `const result = appendReview(reportsDir, safeSid, safeFile, raw.trim());` (line 112), add:

```js
// Auto-populate round-level review-notes.yaml with finding descriptions
if (index.session.roundId) {
  const roundDir = path.join(path.dirname(path.dirname(path.dirname(indexPath))), sanitizePath(index.session.roundId));
  // More robust: resolve from reportsDir
  const roundNotesPath = path.join(
    path.dirname(indexPath), // session dir
    "..",                     // up to round dir
    "review-notes.yaml"
  );
  const roundNotesRealPath = path.resolve(path.dirname(indexPath), "..", "review-notes.yaml");

  let roundNotes;
  if (fs.existsSync(roundNotesRealPath)) {
    roundNotes = readYaml(roundNotesRealPath);
  } else {
    roundNotes = { tasks: [], summary: { notes: "", signoff: { name: "", role: "", date: "" } } };
  }

  const findings = parsed.review?.findings || [];
  let entry = roundNotes.tasks.find(t => t.file === safeFile);
  if (!entry) {
    entry = { file: safeFile, findings: [] };
    roundNotes.tasks.push(entry);
  }

  for (const f of findings) {
    entry.findings.push({
      status: "pending",
      reason: "",
      description: f.description || "",
      severity: f.severity || "",
      file: f.file || "",
      line: f.line || null,
    });
  }

  writeYaml(roundNotesRealPath, roundNotes);
}
```

- [ ] **Step 2: Commit**

```bash
git add skills/audit/scripts/server/handlers/reviews.mjs
git commit -m "feat: auto-populate round notes with finding descriptions on review"
```

---

### Task 7: Update `mapping.mjs` — exclude fully-resolved tasks

**Files:**
- Modify: `skills/audit/scripts/lib/mapping.mjs`

- [ ] **Step 1: Add exclusion check in `setScope`**

Add import at the top:

```js
import { readYaml as readYamlNotes } from "./yaml.mjs";
```

(Note: `readYaml` is already imported from `./yaml.mjs`, so just use it.)

In the `setScope` function, after the `exclude` Set creation (line 19) and before the task generation loop (line 24), add:

```js
// Exclude files where all prior findings are resolved
const resolvedFiles = new Set();
const roundId = readYaml(indexPath).session.roundId;
if (roundId) {
  const roundNotesPath = path.join(reportsDir, sanitizePath(roundId), "review-notes.yaml");
  if (fs.existsSync(roundNotesPath)) {
    const roundNotes = readYaml(roundNotesPath);
    for (const task of roundNotes.tasks || []) {
      const findings = task.findings || [];
      if (findings.length > 0 && findings.every(f => ["wont-fix", "not-an-issue", "well-done"].includes(f.status))) {
        // Match task file pattern to diff file path
        resolvedFiles.add(task.file);
      }
    }
  }
}
```

Then in the task generation loop (line 24), add a check inside the loop after the `exclude.has(filePath)` check:

```js
if (exclude.has(filePath)) continue;
if (resolvedFiles.has("code-tasks/" + taskFileName(filePath))) continue;
```

- [ ] **Step 2: Commit**

```bash
git add skills/audit/scripts/lib/mapping.mjs
git commit -m "feat: exclude fully-resolved tasks from new session scope"
```

---

### Task 8: Update review prompts — add round context

**Files:**
- Modify: `skills/audit/prompts/code-review.md`
- Modify: `skills/audit/prompts/story-review.md`
- Modify: `skills/audit/prompts/project-review.md`

- [ ] **Step 1: Update code-review.md**

Add `round-id` to the Input section (after `task-file`):

```markdown
## Input

You will receive `session-id`, `task-file`, and `round-id` as context. The session directory is `.audit/<project>/<round-id>/<session-id>/`.
```

Add a new section after "Review Context File":

```markdown
## Prior Findings (Round Context)

Read `review-notes.yaml` from the round directory (`.audit/<project>/<round-id>/review-notes.yaml`).

For the current task file, check prior findings:
- Findings marked `wont-fix`, `not-an-issue`, or `well-done` — do NOT re-raise these. If the code hasn't changed, acknowledge they remain resolved.
- Findings marked `need-fix` — re-evaluate whether the fix was applied and the finding is still relevant.
- Findings marked `pending` — treat as new findings, review normally.

Use this context to avoid repeating already-triaged findings.
```

- [ ] **Step 2: Update story-review.md**

Same pattern: add `round-id` to input, add "Prior Findings (Round Context)" section.

- [ ] **Step 3: Update project-review.md**

Same pattern: add `round-id` to input, add "Prior Findings (Round Context)" section.

- [ ] **Step 4: Commit**

```bash
git add skills/audit/prompts/code-review.md skills/audit/prompts/story-review.md skills/audit/prompts/project-review.md
git commit -m "feat: add round-id and prior findings context to review prompts"
```

---

### Task 9: Update `SKILL.md` — add round creation to flow

**Files:**
- Modify: `skills/audit/SKILL.md`

- [ ] **Step 1: Add round creation step to Startup section**

After step 2 (verify server) and before step 4 (create session), insert:

```markdown
3. Create a round:
   ```bash
   curl -s -X POST http://localhost:3456/api/rounds -H 'Content-Type: application/json' -d '{"name":"<round-name>"}'
   ```
   Note the `id` from the response. This is the `round-id`.
4. Create a session within the round:
   ```bash
   curl -s -X POST http://localhost:3456/api/sessions -H 'Content-Type: application/json' -d '{"type":"code","roundId":"<round-id>"}'
   ```
   Note the `id` from the response.
```

Renumber subsequent steps (5 → 5 wait, 6 → 6 proceed).

- [ ] **Step 2: Update Code Review Loop dispatch instructions**

In section 3 (Code Review Loop), step 2, add `round-id` as context:

```markdown
2. Dispatch each as a sub-agent with `prompts/code-review.md` as its prompt, passing `session-id`, `task-file`, and `round-id` as context
```

Same for Story Review Loop (section 4) and Project Scan Review Loop (section 6).

- [ ] **Step 3: Commit**

```bash
git add skills/audit/SKILL.md
git commit -m "docs: add round creation to SKILL.md flow"
```

---

### Task 10: Update frontend API client

**Files:**
- Modify: `skills/audit/scripts/public/js/api.mjs`

- [ ] **Step 1: Add round API methods**

In the `api` object, add after the session methods:

```js
  // Rounds
  listRounds: () => request("GET", "/api/rounds"),
  getRound: (id) => request("GET", `/api/rounds/${encodeURIComponent(id)}`),
  createRound: (data) => request("POST", "/api/rounds", data),
  getRoundNotes: (id) => request("GET", `/api/rounds/${encodeURIComponent(id)}/notes`),
  updateRoundNote: (id, data) =>
    request("POST", `/api/rounds/${encodeURIComponent(id)}/notes`, data),
  updateRoundSummary: (id, data) =>
    request("POST", `/api/rounds/${encodeURIComponent(id)}/summary`, data),
```

- [ ] **Step 2: Update `createSession` to include `roundId`**

Change `createSession` to:

```js
  createSession: (options = {}) =>
    request("POST", "/api/sessions", options),
```

(This is unchanged — the caller passes `{ type, roundId }` which gets serialized.)

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/public/js/api.mjs
git commit -m "feat: add round API methods to frontend client"
```

---

### Task 11: Update `summary.mjs` — use round-level notes

**Files:**
- Modify: `skills/audit/scripts/public/js/views/summary.mjs`

- [ ] **Step 1: Update summary to load round notes**

The summary view currently calls `api.getNotes(sessionId)` and `api.updateSummary(sessionId, ...)`. Since the backend `notes.mjs` now delegates to round-level, these API calls still work — they go through `/api/sessions/:id/notes` which resolves to the round.

No code changes needed in `summary.mjs` — the session-level notes endpoints now transparently read/write round-level notes.

- [ ] **Step 2: Commit (if any changes)**

Only commit if changes were made. If no changes, skip.

---

### Task 12: Update `task.mjs` — round-aware session path resolution

**Files:**
- Modify: `skills/audit/scripts/lib/task.mjs`

- [ ] **Step 1: Update `updateTask`, `appendReview`, `getTasks`, `getTasksSummary`, `getTask` to use round-aware paths**

All these functions construct paths like `path.join(reportsDir, safeSid, ...)`. They need to resolve the actual session directory from within a round.

Add a helper at the top of the file:

```js
import { resolveSessionPath } from "./session.mjs";

function resolveSessionDir(reportsDir, safeSid) {
  const indexPath = resolveSessionPath(reportsDir, safeSid);
  if (!indexPath) throw new AppError("Session not found: " + safeSid, "NOT_FOUND", 404);
  return path.dirname(indexPath);
}
```

Wait — `resolveSessionPath` is a local function in `session.mjs`, not exported. Export it first.

In `session.mjs`, add `export` to the `resolveSessionPath` function:

```js
export function resolveSessionPath(reportsDir, safeSid) {
```

Then in `task.mjs`, import it:

```js
import { sanitizePath, sanitizeFilePath, updateSessionStatus, resolveSessionPath } from "./session.mjs";
```

Replace all `path.join(reportsDir, safeSid, ...)` with `path.dirname(resolveSessionPath(reportsDir, safeSid))` + the subpath.

For `updateTask` (line 10), change:

```js
const sessionDir = path.join(reportsDir, safeSid);
```

To:

```js
const sessionDir = path.dirname(resolveSessionPath(reportsDir, safeSid));
```

Same pattern for `appendReview` (line 63), `getTasks` (line 94), `getTasksSummary` (line 123), `getTask` (line 148).

- [ ] **Step 2: Commit**

```bash
git add skills/audit/scripts/lib/session.mjs skills/audit/scripts/lib/task.mjs
git commit -m "feat: round-aware session path resolution in task module"
```

---

### Task 13: Update `project-scan.mjs` — round-aware paths

**Files:**
- Modify: `skills/audit/scripts/server/handlers/project-scan.mjs`

- [ ] **Step 1: Import `resolveSessionPath` and use it**

Add import:

```js
import { sanitizePath, updateSessionStatus, resolveSessionPath } from "../../lib/session.mjs";
```

In each handler that constructs `path.join(reportsDir, safeSid, ...)`, change to use `resolveSessionPath`:

```js
const indexPath = resolveSessionPath(reportsDir, safeSid);
if (!indexPath) return errorResponse(res, "Session not found", "NOT_FOUND", 404);
const sessionDir = path.dirname(indexPath);
```

Apply this pattern to:
- `POST /api/sessions/:id/scan` (line 15)
- `GET /api/sessions/:id/scan/status` (line 60)
- `GET /api/sessions/:id/graph-data` (line 152)
- `GET /api/sessions/:id/groups` (line 167)
- `PUT /api/sessions/:id/groups` (line 183)
- `POST /api/sessions/:id/groups/confirm` (line 207)

- [ ] **Step 2: Commit**

```bash
git add skills/audit/scripts/server/handlers/project-scan.mjs
git commit -m "feat: round-aware path resolution in project-scan handlers"
```

---

### Task 14: Update `reviews.mjs` handler — round-aware paths

**Files:**
- Modify: `skills/audit/scripts/server/handlers/reviews.mjs`

- [ ] **Step 1: Use `resolveSessionPath` in review handlers**

Import `resolveSessionPath`:

```js
import { sanitizePath, sanitizeFilePath, resolveSessionPath } from "../../lib/session.mjs";
```

In `POST /api/sessions/:id/tasks/review` (line 44-46), replace:

```js
const safeSid = sanitizePath(params.id);
const sessionDir = path.join(reportsDir, safeSid);
const safeTaskFile = sanitizeFilePath(body.file);
const taskPath = path.join(sessionDir, safeTaskFile);
```

With:

```js
const safeSid = sanitizePath(params.id);
const indexPath = resolveSessionPath(reportsDir, safeSid);
if (!indexPath) return errorResponse(res, "Session not found", "NOT_FOUND", 404);
const sessionDir = path.dirname(indexPath);
const safeTaskFile = sanitizeFilePath(body.file);
const taskPath = path.join(sessionDir, safeTaskFile);
```

Same for `POST /api/sessions/:id/tasks/review-yaml` (line 92-95).

- [ ] **Step 2: Commit**

```bash
git add skills/audit/scripts/server/handlers/reviews.mjs
git commit -m "feat: round-aware path resolution in review handlers"
```

---

### Task 15: Update remaining handlers for round-aware paths

**Files:**
- Modify: `skills/audit/scripts/server/handlers/sessions.mjs` — all session handlers
- Modify: `skills/audit/scripts/server/handlers/audit.mjs` — scope handler

- [ ] **Step 1: Update sessions.mjs handlers**

Import `resolveSessionPath` and use it in `GET /api/sessions/:id`, `PUT /api/sessions/:id/status`, `PATCH /api/sessions/:id`, `GET/PUT review-context`:

```js
const indexPath = resolveSessionPath(reportsDir, safeSid);
if (!indexPath) return errorResponse(res, "Session not found", "NOT_FOUND", 404);
const sessionDir = path.dirname(indexPath);
```

- [ ] **Step 2: Update audit.mjs scope handler**

The `setScope` call passes `reportsDir` and `sid`. The `mapping.mjs` `setScope` function resolves the session dir internally. Since `task.mjs` now uses `resolveSessionPath`, the scope handler itself may not need changes — but `mapping.mjs` needs the same round-aware resolution.

In `mapping.mjs` `setScope` function, change:

```js
const sessionDir = path.join(reportsDir, safeSid);
const indexPath = path.join(sessionDir, "index.yaml");
if (!fs.existsSync(indexPath)) throw new Error("Session not found: " + safeSid);
```

To:

```js
import { resolveSessionPath } from "./session.mjs";

const safeSid = sanitizePath(sid);
const resolvedIndex = resolveSessionPath(reportsDir, safeSid);
if (!resolvedIndex) throw new Error("Session not found: " + safeSid);
const sessionDir = path.dirname(resolvedIndex);
const indexPath = resolvedIndex;
```

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/server/handlers/sessions.mjs skills/audit/scripts/server/handlers/audit.mjs skills/audit/scripts/lib/mapping.mjs
git commit -m "feat: round-aware path resolution across all handlers"
```

---

### Task 16: Smoke test — full round flow

- [ ] **Step 1: Start server**

```bash
node skills/audit/scripts/cli.mjs server 3456
```

- [ ] **Step 2: Create a round**

```bash
curl -s -X POST http://localhost:3456/api/rounds -H 'Content-Type: application/json' -d '{"name":"Test round"}'
```

Note the `id`.

- [ ] **Step 3: Create a session within the round**

```bash
curl -s -X POST http://localhost:3456/api/sessions -H 'Content-Type: application/json' -d '{"type":"code","roundId":"<round-id>"}'
```

- [ ] **Step 4: Verify round contains the session**

```bash
curl -s http://localhost:3456/api/rounds/<round-id>
```

Expected: round detail with `sessions` array containing the new session.

- [ ] **Step 5: Verify round-level notes endpoint**

```bash
curl -s http://localhost:3456/api/rounds/<round-id>/notes
```

Expected: `{ tasks: [], summary: { ... } }`

- [ ] **Step 6: Verify session notes delegate to round**

```bash
curl -s http://localhost:3456/api/sessions/<session-id>/notes
```

Expected: same response as round notes.

- [ ] **Step 7: Create a second session in the same round**

```bash
curl -s -X POST http://localhost:3456/api/sessions -H 'Content-Type: application/json' -d '{"type":"code","roundId":"<round-id>"}'
```

Verify both sessions appear in `GET /api/rounds/<round-id>`.
