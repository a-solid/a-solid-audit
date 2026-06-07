# Semantic Paths Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace timestamp-based round/session directory names with human-readable round names and version numbers (v1, v2, etc), and refactor all session API routes to nest under rounds.

**Architecture:** Round directories use the round name as the folder name directly. Session directories within rounds use `v<N>` version numbers. All API routes change from flat `/api/sessions/:id` to nested `/api/rounds/:roundName/sessions/:version`. The `resolveSessionPath` function changes from a directory scan to a direct path join.

**Tech Stack:** Node.js, vanilla JS, no frameworks. Custom HTTP router with `:param` pattern matching.

---

## File Structure

### Modified files

| File | Responsibility |
|------|---------------|
| `scripts/lib/session.mjs` | Core path resolution and session CRUD — rewrite `resolveSessionPath`, remove `sessionId()`, add `roundName` param everywhere |
| `scripts/lib/task.mjs` | Task CRUD — all functions gain `roundName` param |
| `scripts/lib/mapping.mjs` | Git diff scope → task generation — gains `roundName` param |
| `scripts/lib/project-scan.mjs` | Project scan functions — use `resolveSessionPath` instead of direct join |
| `scripts/server/handlers/rounds.mjs` | Round CRUD — `:roundId` → `:roundName`, duplicate check, version-based session IDs |
| `scripts/server/handlers/sessions.mjs` | Session CRUD — all routes nested under rounds |
| `scripts/server/handlers/stories.mjs` | Story CRUD — nested routes + fix 404 bug |
| `scripts/server/handlers/tasks.mjs` | Task endpoints — nested routes |
| `scripts/server/handlers/notes.mjs` | Review notes — nested routes |
| `scripts/server/handlers/reviews.mjs` | Review submission — nested routes |
| `scripts/server/handlers/project-scan.mjs` | Project scan endpoints — nested routes |
| `scripts/server/handlers/audit.mjs` | Git/scope endpoints — scope route nested |
| `scripts/server/handlers/wait.mjs` | Wait/signal — returns `roundName` + `version` |
| `scripts/server/index.mjs` | Route registration — pass `projectDir` for round name resolution |
| `scripts/public/js/api.mjs` | API client — all session methods take `(roundName, version)` |
| `scripts/public/js/app.mjs` | Hash router — new URL structure |
| `scripts/public/js/views/home.mjs` | Home — round creation uses `name` not `id` |
| `scripts/public/js/views/round-detail.mjs` | Round detail — session links use version |
| `scripts/public/js/views/round-summary.mjs` | Round summary — round name param |
| `scripts/public/js/views/wizard.mjs` | Wizard — session ref uses round name + version |
| `scripts/public/js/views/wizard-scope.mjs` | Scope step — API calls use round name + version |
| `scripts/public/js/views/wizard-stories.mjs` | Stories step — API calls use round name + version |
| `scripts/public/js/views/wizard-project.mjs` | Project wizard — API calls use round name + version |
| `scripts/public/js/views/progress.mjs` | Progress — API calls use round name + version |
| `scripts/public/js/views/review.mjs` | Review — API calls use round name + version |
| `scripts/public/js/components/notes-panel.mjs` | Notes panel — uses round name + version |
| `skills/audit/SKILL.md` | Skill doc — updated curl examples |
| `skills/audit/prompts/code-review.md` | Sub-agent prompt — `round-name` + `version` |
| `skills/audit/prompts/story-review.md` | Sub-agent prompt — `round-name` + `version` |
| `skills/audit/prompts/project-review.md` | Sub-agent prompt — `round-name` + `version` |
| `skills/audit/prompts/project-group.md` | Sub-agent prompt — `round-name` + `version` |

---

### Task 1: Rewrite `lib/session.mjs` — core path resolution

**Files:**
- Modify: `skills/audit/scripts/lib/session.mjs`

- [ ] **Step 1: Replace `resolveSessionPath` signature and body**

The old function takes `(reportsDir, safeSid)` and scans subdirectories. Replace with direct path construction:

```javascript
export function validateVersion(version) {
  const v = String(version);
  if (!/^v\d+$/.test(v)) {
    throw new AppError("Invalid version format: " + v + ". Expected v<N>", "VALIDATION_ERROR", 400);
  }
  return v;
}

export function resolveSessionPath(reportsDir, roundName, version) {
  const safeRound = sanitizePath(roundName);
  const safeVersion = validateVersion(version);
  const p = path.join(reportsDir, safeRound, safeVersion, "index.yaml");
  if (!fs.existsSync(p)) return null;
  return p;
}

export function resolveSessionDir(reportsDir, roundName, version) {
  const p = resolveSessionPath(reportsDir, roundName, version);
  return p ? path.dirname(p) : null;
}
```

- [ ] **Step 2: Remove `sessionId()` function**

Delete the entire `sessionId()` function (line 49-51). No longer needed.

- [ ] **Step 3: Rewrite `listSessions(reportsDir, roundName)`**

```javascript
export function listSessions(reportsDir, roundName) {
  const safeRound = sanitizePath(roundName);
  const roundDir = path.join(reportsDir, safeRound);
  if (!fs.existsSync(roundDir)) return [];

  return fs.readdirSync(roundDir)
    .filter(e => /^v\d+$/.test(e) && fs.statSync(path.join(roundDir, e)).isDirectory())
    .map(v => {
      const indexPath = path.join(roundDir, v, "index.yaml");
      if (!fs.existsSync(indexPath)) return null;
      const index = readYaml(indexPath);
      const taskRefs = [
        ...(index.codeTasks || []),
        ...(index.storyTasks || []),
        ...(index.projectTasks || []),
      ];
      const reviewed = taskRefs.filter(t => t.status === "reviewed").length;
      return {
        id: v,
        type: index.session.type,
        status: index.session.status || "created",
        created: index.session.created,
        roundName: index.session.roundName || roundName,
        version: parseInt(v.slice(1), 10),
        progress: {
          total: taskRefs.length,
          reviewed,
          percentage: taskRefs.length ? Math.round((reviewed / taskRefs.length) * 100) : 0,
        },
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.version - a.version);
}
```

- [ ] **Step 4: Rewrite `getSession(reportsDir, roundName, version)`**

```javascript
export function getSession(reportsDir, roundName, version) {
  const indexPath = resolveSessionPath(reportsDir, roundName, version);
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

- [ ] **Step 5: Rewrite `updateSessionStatus(reportsDir, roundName, version, newStatus)`**

```javascript
export function updateSessionStatus(reportsDir, roundName, version, newStatus) {
  if (!VALID_STATUSES.includes(newStatus)) {
    throw new AppError("Invalid status: " + newStatus, "VALIDATION_ERROR", 400);
  }
  const indexPath = resolveSessionPath(reportsDir, roundName, version);
  if (!indexPath) throw new AppError("Session not found", "NOT_FOUND", 404);
  const index = readYaml(indexPath);
  const current = index.session.status || "created";
  const type = index.session.type || "code";

  const transitions = TRANSITIONS[type] || TRANSITIONS.code;
  const allowed = transitions[current] || [];
  if (!allowed.includes(newStatus)) {
    throw new AppError(`Cannot transition from "${current}" to "${newStatus}" (type: ${type}). Allowed: ${allowed.join(", ") || "none"}`, "CONFLICT", 409);
  }

  index.session.status = newStatus;
  writeIndexYaml(indexPath, index);
  return index.session;
}
```

- [ ] **Step 6: Rewrite `updateSession(reportsDir, roundName, version, updates)`**

```javascript
export function updateSession(reportsDir, roundName, version, updates) {
  const indexPath = resolveSessionPath(reportsDir, roundName, version);
  if (!indexPath) throw new AppError("Session not found", "NOT_FOUND", 404);
  const index = readYaml(indexPath);
  for (const key of MUTABLE_FIELDS) {
    if (key in updates) {
      index.session[key] = updates[key];
    }
  }
  writeIndexYaml(indexPath, index);
  return index.session;
}
```

- [ ] **Step 7: Rewrite `createSession(reportsDir, roundName, version, options)`**

```javascript
export function createSession(reportsDir, roundName, version, options = {}) {
  const safeRound = sanitizePath(roundName);
  const safeVersion = validateVersion(version);
  const roundDir = path.join(reportsDir, safeRound);
  if (!fs.existsSync(path.join(roundDir, "round.yaml"))) {
    throw new AppError("Round not found: " + safeRound, "NOT_FOUND", 404);
  }
  const sessionDir = path.join(roundDir, safeVersion);
  if (fs.existsSync(sessionDir)) {
    throw new AppError("Session version already exists: " + safeVersion, "CONFLICT", 409);
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
      id: safeVersion,
      type: options.type || "code",
      status: "created",
      version: parseInt(safeVersion.slice(1), 10),
      scope: options.type === "project" ? null : { method: "", ref: "" },
      projectDir: options.projectDir || null,
      roundName: safeRound,
      created: new Date().toISOString(),
    },
    codeTasks: [],
    storyTasks: [],
    projectTasks: [],
  });
  return { id: safeVersion, dir: sessionDir };
}
```

- [ ] **Step 8: Rewrite `resetReviewing(reportsDir, roundName, version)`**

```javascript
export function resetReviewing(reportsDir, roundName, version) {
  const indexPath = resolveSessionPath(reportsDir, roundName, version);
  if (!indexPath) throw new AppError("Session not found", "NOT_FOUND", 404);

  const index = readYaml(indexPath);
  let resetCount = 0;

  for (const taskGroup of ["codeTasks", "storyTasks", "projectTasks"]) {
    for (const ref of index[taskGroup] || []) {
      if (ref.status === "reviewing") {
        ref.status = "pending";
        resetCount++;
      }
    }
  }

  if (resetCount > 0) {
    writeIndexYaml(indexPath, index);
  }

  return resetCount;
}
```

- [ ] **Step 9: Commit**

```bash
git add skills/audit/scripts/lib/session.mjs
git commit -m "refactor: rewrite session.mjs for round-name + version paths"
```

---

### Task 2: Update `lib/task.mjs` — add `roundName` param

**Files:**
- Modify: `skills/audit/scripts/lib/task.mjs`

- [ ] **Step 1: Update `updateTask` signature and body**

Change `(reportsDir, sid, taskFile, ...)` to `(reportsDir, roundName, version, taskFile, ...)`. Replace all `resolveSessionPath(reportsDir, safeSid)` with `resolveSessionPath(reportsDir, roundName, version)`. Remove `sanitizePath(sid)` / `safeSid`. Use `validateVersion(version)`.

```javascript
export function updateTask(reportsDir, roundName, version, taskFile, status, score, reviewData, overview) {
  if (!ALLOWED_STATUSES.includes(status)) {
    throw new AppError("Invalid status: " + status + ". Allowed: " + ALLOWED_STATUSES.join(", "), "VALIDATION_ERROR", 400);
  }

  const safeTaskFile = sanitizeFilePath(taskFile);
  const indexPath = resolveSessionPath(reportsDir, roundName, version);
  if (!indexPath) throw new AppError("Session not found", "NOT_FOUND", 404);
  const sessionDir = path.dirname(indexPath);
  const taskPath = path.join(sessionDir, safeTaskFile);

  if (!fs.existsSync(taskPath)) throw new AppError("Task file not found", "NOT_FOUND", 404);

  const task = readYaml(taskPath);
  if (score !== undefined && score !== null) task.review.score = parseInt(score, 10);
  if (reviewData) {
    task.review = { ...task.review, ...reviewData };
  }
  if (overview && (overview.diagram || overview.description)) {
    task.overview = overview;
  }
  writeYaml(taskPath, task);

  const index = readYaml(indexPath);
  const allTaskGroups = ["codeTasks", "storyTasks", "projectTasks"];
  for (const group of allTaskGroups) {
    const ref = (index[group] || []).find(t => t.file === safeTaskFile);
    if (ref) {
      ref.status = status;
      break;
    }
  }
  writeIndexYaml(indexPath, index);

  const allReviewed = allTaskGroups.every(group =>
    (index[group] || []).every(t => t.status === "reviewed")
  );
  if (allReviewed) {
    updateSessionStatus(reportsDir, roundName, version, "completed");
  }

  return { file: safeTaskFile, status };
}
```

- [ ] **Step 2: Update `appendReview` signature and body**

Same pattern: `(reportsDir, roundName, version, taskFile, yamlText)`.

```javascript
export function appendReview(reportsDir, roundName, version, taskFile, yamlText) {
  const safeTaskFile = sanitizeFilePath(taskFile);
  const indexPath = resolveSessionPath(reportsDir, roundName, version);
  if (!indexPath) throw new AppError("Session not found", "NOT_FOUND", 404);
  const sessionDir = path.dirname(indexPath);
  const taskPath = path.join(sessionDir, safeTaskFile);

  if (!fs.existsSync(taskPath)) throw new AppError("Task file not found", "NOT_FOUND", 404);

  fs.appendFileSync(taskPath, "\n\n" + yamlText);

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

  const allReviewed = allTaskGroups.every(group =>
    (index[group] || []).every(t => t.status === "reviewed")
  );
  if (allReviewed) {
    updateSessionStatus(reportsDir, roundName, version, "completed");
  }

  return { file: safeTaskFile, status: "reviewed" };
}
```

- [ ] **Step 3: Update `getTasks`, `getTasksSummary`, `getTask`**

All change from `(reportsDir, sid)` to `(reportsDir, roundName, version)`. Replace `resolveSessionPath(reportsDir, safeSid)` with `resolveSessionPath(reportsDir, roundName, version)`. Remove `safeSid` variable.

- [ ] **Step 4: Commit**

```bash
git add skills/audit/scripts/lib/task.mjs
git commit -m "refactor: update task.mjs for round-name + version params"
```

---

### Task 3: Update `lib/mapping.mjs` and `lib/project-scan.mjs`

**Files:**
- Modify: `skills/audit/scripts/lib/mapping.mjs`
- Modify: `skills/audit/scripts/lib/project-scan.mjs`

- [ ] **Step 1: Update `setScope` in mapping.mjs**

Change signature from `(projectDir, reportsDir, sid, scopeType, scopeRef, excludeFiles)` to `(projectDir, reportsDir, roundName, version, scopeType, scopeRef, excludeFiles)`.

Replace:
- `sanitizePath(sid)` + `resolveSessionPath(reportsDir, safeSid)` → `resolveSessionPath(reportsDir, roundName, version)`
- `updateSessionStatus(reportsDir, safeSid, ...)` → `updateSessionStatus(reportsDir, roundName, version, ...)`
- In `writeIndexYaml`, set `session.id` to `validateVersion(version)` and `session.roundName` to `roundName`

- [ ] **Step 2: Update `collectGraphData` in project-scan.mjs**

Change from `path.join(reportsDir, safeSid)` to using `resolveSessionDir(reportsDir, roundName, version)`. Change signature to take `(projectDir, reportsDir, roundName, version)`.

- [ ] **Step 3: Update `generateTasksFromGroups` in project-scan.mjs**

Same: change to take `(reportsDir, roundName, version)`, use `resolveSessionDir`.

- [ ] **Step 4: Update `setProjectScope` in project-scan.mjs**

Same pattern: add `roundName` param, use `resolveSessionDir`.

- [ ] **Step 5: Commit**

```bash
git add skills/audit/scripts/lib/mapping.mjs skills/audit/scripts/lib/project-scan.mjs
git commit -m "refactor: update mapping.mjs and project-scan.mjs for round-name + version"
```

---

### Task 4: Rewrite `server/handlers/rounds.mjs`

**Files:**
- Modify: `skills/audit/scripts/server/handlers/rounds.mjs`

- [ ] **Step 1: Update `findRoundDir`**

```javascript
function findRoundDir(projectDir, roundName) {
  const reportsDir = resolveReportsDir(projectDir);
  const safeRound = sanitizePath(roundName);
  const roundDir = path.join(reportsDir, safeRound);
  if (!fs.existsSync(path.join(roundDir, "round.yaml"))) return null;
  return roundDir;
}
```

- [ ] **Step 2: Update `POST /api/rounds` — duplicate check, return `name`**

```javascript
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
  const safeName = sanitizePath(name);
  const roundDir = path.join(reportsDir, safeName);
  if (fs.existsSync(roundDir)) {
    return errorResponse(res, "Round name already exists: " + name, "CONFLICT", 409);
  }
  fs.mkdirSync(roundDir, { recursive: true });

  writeYaml(path.join(roundDir, "round.yaml"), {
    name,
    description: body.description || "",
    created: new Date().toISOString(),
  });

  jsonResponse(res, { name }, 201);
});
```

- [ ] **Step 3: Update `GET /api/rounds` — use `name` as ID**

Replace all `entry` (directory name) references with the actual directory name. The response item's `id` becomes the directory name (which IS the round name):

```javascript
rounds.push({ name: data.name, description: data.description || "", created: data.created, sessions });
```

(The `id` field is removed from response — `name` is the identifier.)

- [ ] **Step 4: Update `GET /api/rounds/:roundName`**

Replace `:roundId` with `:roundName`. Use `findRoundDir(projectDir, params.roundName)`.

- [ ] **Step 5: Update `POST /api/rounds/:roundName/sessions` — version-based**

```javascript
router.post("/api/rounds/:roundName/sessions", async (req, res, params) => {
  const reportsDir = resolveReportsDir(projectDir);
  const roundName = params.roundName;
  const roundDir = findRoundDir(projectDir, roundName);
  if (!roundDir) return errorResponse(res, "Round not found", "NOT_FOUND", 404);

  let body = {};
  try { body = JSON.parse(await readBody(req)); } catch {}

  const sessions = listSessions(reportsDir, roundName);
  const maxVersion = sessions.reduce((max, s) => Math.max(max, s.version || 1), 0);
  const nextVersion = maxVersion + 1;
  const versionStr = "v" + nextVersion;

  createSession(reportsDir, roundName, versionStr, {
    type: body.type || "code",
    projectDir: resolveProjectDir(),
  });

  jsonResponse(res, { version: nextVersion, roundName }, 201);
});
```

- [ ] **Step 6: Update `POST /api/rounds/:roundName/re-review`**

Use `roundName` from params. Session creation uses `createSession(reportsDir, roundName, "v" + nextVersion, ...)`. Note: also need to update references to `listSessions(reportsDir, roundName)` and `resolveSessionPath(reportsDir, roundName, latest.id)`.

- [ ] **Step 7: Update `GET /api/rounds/:roundName/summary`**

Use `roundName` from params. Update `listSessions` and `resolveSessionPath` calls.

- [ ] **Step 8: Commit**

```bash
git add skills/audit/scripts/server/handlers/rounds.mjs
git commit -m "refactor: rewrite rounds handler for semantic paths"
```

---

### Task 5: Rewrite `server/handlers/sessions.mjs` — nested routes

**Files:**
- Modify: `skills/audit/scripts/server/handlers/sessions.mjs`

- [ ] **Step 1: Rewrite all route registrations**

All routes change from `/api/sessions/:id/...` to `/api/rounds/:roundName/sessions/:version/...`. Helper to resolve session:

```javascript
function resolveSession(reportsDir, params) {
  const roundName = params.roundName;
  const version = params.version;
  const indexPath = resolveSessionPath(reportsDir, roundName, version);
  if (!indexPath) return null;
  return { roundName, version, indexPath, sessionDir: path.dirname(indexPath) };
}
```

- [ ] **Step 2: Update each route handler**

Replace `params.id` with `params.roundName` + `params.version`. Use `resolveSession` helper. Pass `roundName, version` to `getSession`, `updateSessionStatus`, `updateSession`, `createSession`.

Routes:
- `GET /api/rounds/:roundName/sessions/:version` — `getSession(reportsDir, roundName, version)`
- `PUT /api/rounds/:roundName/sessions/:version/status` — `updateSessionStatus(reportsDir, roundName, version, body.status)`
- `PATCH /api/rounds/:roundName/sessions/:version` — `updateSession(reportsDir, roundName, version, body)`
- `GET /api/rounds/:roundName/sessions/:version/review-context` — read file from `sessionDir`
- `PUT /api/rounds/:roundName/sessions/:version/review-context` — write file to `sessionDir`
- `POST /api/rounds/:roundName/sessions/:version/review-notes` — append to file in `sessionDir`

Remove `POST /api/sessions` and `GET /api/sessions` entirely.

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/server/handlers/sessions.mjs
git commit -m "refactor: nest session routes under rounds"
```

---

### Task 6: Update remaining handlers — stories, tasks, notes, reviews, project-scan, audit, wait

**Files:**
- Modify: `skills/audit/scripts/server/handlers/stories.mjs`
- Modify: `skills/audit/scripts/server/handlers/tasks.mjs`
- Modify: `skills/audit/scripts/server/handlers/notes.mjs`
- Modify: `skills/audit/scripts/server/handlers/reviews.mjs`
- Modify: `skills/audit/scripts/server/handlers/project-scan.mjs`
- Modify: `skills/audit/scripts/server/handlers/audit.mjs`
- Modify: `skills/audit/scripts/server/handlers/wait.mjs`

- [ ] **Step 1: stories.mjs — nested routes + fix 404 bug**

Replace all `/api/sessions/:id/stories/...` with `/api/rounds/:roundName/sessions/:version/stories/...`.

Replace all `path.join(reportsDir, safeSid, ...)` with `resolveSessionDir(reportsDir, params.roundName, params.version)` to fix the 404 bug where round-scoped sessions weren't found.

- [ ] **Step 2: tasks.mjs — nested routes**

Replace `/api/sessions/:id/tasks/...` with `/api/rounds/:roundName/sessions/:version/tasks/...`. Pass `roundName, version` to `getTask`, `getTasks`, `getTasksSummary`.

- [ ] **Step 3: notes.mjs — nested routes**

Replace `/api/sessions/:id/notes/...` with `/api/rounds/:roundName/sessions/:version/notes/...`. Replace `resolveSessionDir(reportsDir, params.id)` with `resolveSessionDir(reportsDir, params.roundName, params.version)`.

- [ ] **Step 4: reviews.mjs — nested routes**

Replace `/api/sessions/:id/tasks/review/...` with `/api/rounds/:roundName/sessions/:version/tasks/review/...`. Pass `roundName, version` to `updateTask`, `getTask`, `appendReview`.

- [ ] **Step 5: project-scan.mjs — nested routes**

Replace `/api/sessions/:id/scan/...` with `/api/rounds/:roundName/sessions/:version/scan/...`. Use `resolveSessionPath` instead of direct joins. Pass `roundName, version` to `updateSessionStatus`, `setProjectScope`, `getProjectMap`, `generateTasksFromGroups`.

- [ ] **Step 6: audit.mjs — scope route nested**

Replace `/api/sessions/:id/scope` with `/api/rounds/:roundName/sessions/:version/scope`. Pass `roundName, version` to `setScope`.

- [ ] **Step 7: wait.mjs — return roundName + version**

The advance route changes from `POST /api/sessions/:id/advance` to `POST /api/rounds/:roundName/sessions/:version/advance`. The signal object changes from `{ sessionId, action }` to `{ roundName, version, action }`. The `/wait` response changes from `"Session <sessionId> ready."` to `"Session <roundName>/v<N> ready."`.

- [ ] **Step 8: Commit**

```bash
git add skills/audit/scripts/server/handlers/
git commit -m "refactor: nest all session handler routes under rounds"
```

---

### Task 7: Update `server/index.mjs` — route registration

**Files:**
- Modify: `skills/audit/scripts/server/index.mjs`

- [ ] **Step 1: Remove `registerSessionRoutes` flat routes**

The sessions handler no longer registers `GET /api/sessions` or `POST /api/sessions`. Remove the import if sessions handler only contains nested routes now registered via the same function.

- [ ] **Step 2: Verify registration order**

The router resolves first match. Round-scoped routes like `/api/rounds/:roundName/sessions/:version/...` must be registered. No changes to registration order needed since the custom router handles path segments.

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/server/index.mjs
git commit -m "refactor: update route registration for nested sessions"
```

---

### Task 8: Rewrite frontend `api.mjs`

**Files:**
- Modify: `skills/audit/scripts/public/js/api.mjs`

- [ ] **Step 1: Replace all session methods with round-scoped versions**

```javascript
export const api = {
  // Rounds
  listRounds: () => request("GET", "/api/rounds"),
  getRound: (roundName) => request("GET", `/api/rounds/${encodeURIComponent(roundName)}`),
  createRound: (data) => request("POST", "/api/rounds", data),
  createRoundSession: (roundName, options = {}) =>
    request("POST", `/api/rounds/${encodeURIComponent(roundName)}/sessions`, options),
  reReview: (roundName, data = {}) =>
    request("POST", `/api/rounds/${encodeURIComponent(roundName)}/re-review`, data),
  getRoundSummary: (roundName) =>
    request("GET", `/api/rounds/${encodeURIComponent(roundName)}/summary`),

  // Session (all require roundName + version)
  getSession: (roundName, version) =>
    request("GET", `/api/rounds/${encodeURIComponent(roundName)}/sessions/${encodeURIComponent(version)}`),
  updateSessionStatus: (roundName, version, status) =>
    request("PUT", `/api/rounds/${encodeURIComponent(roundName)}/sessions/${encodeURIComponent(version)}/status`, { status }),
  advance: (roundName, version, body) =>
    request("POST", `/api/rounds/${encodeURIComponent(roundName)}/sessions/${encodeURIComponent(version)}/advance`, { roundName, version, ...body }),
  patchSession: (roundName, version, data) =>
    request("PATCH", `/api/rounds/${encodeURIComponent(roundName)}/sessions/${encodeURIComponent(version)}`, data),

  // Git
  getCommits: () => request("GET", "/api/git/commits"),
  getBranches: () => request("GET", "/api/git/branches"),
  previewScope: (method, ref) =>
    request("POST", "/api/git/preview", { method, ref }),
  setScope: (roundName, version, method, ref, excludeFiles) =>
    request("POST", `/api/rounds/${encodeURIComponent(roundName)}/sessions/${encodeURIComponent(version)}/scope`, { method, ref, excludeFiles }),

  // Providers
  listProviders: () => request("GET", "/api/providers"),
  fetchFromProvider: (name, ids) =>
    request("POST", `/api/providers/${encodeURIComponent(name)}/fetch`, { ids }),

  // Stories
  getStories: (roundName, version) =>
    request("GET", `/api/rounds/${encodeURIComponent(roundName)}/sessions/${encodeURIComponent(version)}/stories`),
  createStory: (roundName, version, story) =>
    request("POST", `/api/rounds/${encodeURIComponent(roundName)}/sessions/${encodeURIComponent(version)}/stories`, story),
  updateStory: (roundName, version, name, data) =>
    request("PUT", `/api/rounds/${encodeURIComponent(roundName)}/sessions/${encodeURIComponent(version)}/stories/${encodeURIComponent(name)}`, data),
  deleteStory: (roundName, version, name) =>
    request("DELETE", `/api/rounds/${encodeURIComponent(roundName)}/sessions/${encodeURIComponent(version)}/stories/${encodeURIComponent(name)}`),
  mapStories: (roundName, version, mappings) =>
    request("PUT", `/api/rounds/${encodeURIComponent(roundName)}/sessions/${encodeURIComponent(version)}/stories/map`, { mappings }),

  // Tasks
  getTasks: (roundName, version) =>
    request("GET", `/api/rounds/${encodeURIComponent(roundName)}/sessions/${encodeURIComponent(version)}/tasks`),
  getTasksSummary: (roundName, version) =>
    request("GET", `/api/rounds/${encodeURIComponent(roundName)}/sessions/${encodeURIComponent(version)}/tasks/summary`),

  // Notes
  getNotes: (roundName, version) =>
    request("GET", `/api/rounds/${encodeURIComponent(roundName)}/sessions/${encodeURIComponent(version)}/notes`),
  updateTaskNote: (roundName, version, file, data) =>
    request("POST", `/api/rounds/${encodeURIComponent(roundName)}/sessions/${encodeURIComponent(version)}/notes`, { file, ...data }),

  // Review Context
  getReviewContext: (roundName, version) =>
    request("GET", `/api/rounds/${encodeURIComponent(roundName)}/sessions/${encodeURIComponent(version)}/review-context`),
  setReviewContext: (roundName, version, context) =>
    request("PUT", `/api/rounds/${encodeURIComponent(roundName)}/sessions/${encodeURIComponent(version)}/review-context`, { context }),
  appendReviewNotes: (roundName, version, notes) =>
    request("POST", `/api/rounds/${encodeURIComponent(roundName)}/sessions/${encodeURIComponent(version)}/review-notes`, { notes }),

  // Project Scan
  startScan: (roundName, version) =>
    request("POST", `/api/rounds/${encodeURIComponent(roundName)}/sessions/${encodeURIComponent(version)}/scan`),
  getScanStatus: (roundName, version) =>
    request("GET", `/api/rounds/${encodeURIComponent(roundName)}/sessions/${encodeURIComponent(version)}/scan/status`),

  // Settings
  getSettings: () => request("GET", "/api/settings"),
  updateSettings: (data) => request("PUT", "/api/settings", data),

  // CodeGraph
  getCodegraphStatus: (projectDir) =>
    request("GET", `/api/codegraph/status?dir=${encodeURIComponent(projectDir)}`),
  initCodegraph: (projectDir) =>
    request("POST", "/api/codegraph/init", { projectDir }),

  // Smart Grouping
  getGraphData: (roundName, version) =>
    request("GET", `/api/rounds/${encodeURIComponent(roundName)}/sessions/${encodeURIComponent(version)}/graph-data`),
  getGroups: (roundName, version) =>
    request("GET", `/api/rounds/${encodeURIComponent(roundName)}/sessions/${encodeURIComponent(version)}/groups`),
  updateGroups: (roundName, version, groups) =>
    request("PUT", `/api/rounds/${encodeURIComponent(roundName)}/sessions/${encodeURIComponent(version)}/groups`, { groups }),
  confirmGroups: (roundName, version) =>
    request("POST", `/api/rounds/${encodeURIComponent(roundName)}/sessions/${encodeURIComponent(version)}/groups/confirm`),
};
```

- [ ] **Step 2: Remove `listSessions` and `createSession` methods**

These flat routes no longer exist.

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/public/js/api.mjs
git commit -m "refactor: rewrite api.mjs for round-scoped session methods"
```

---

### Task 9: Update frontend `app.mjs` — hash router + breadcrumb + active polling

**Files:**
- Modify: `skills/audit/scripts/public/js/app.mjs`

- [ ] **Step 1: Update `getSessionIdFromHash`**

The hash routes change. Old: `#/wizard/<sessionId>`, `#/progress/<sessionId>`, `#/review/<sessionId>`. New: `#/round/<roundName>/v<N>/wizard`, `#/round/<roundName>/v<N>/progress`, `#/round/<roundName>/v<N>/review`.

```javascript
function parseSessionRef() {
  const hash = location.hash.slice(1) || "";
  const parts = hash.split("/").filter(Boolean);
  // #/round/<roundName>/v<N>/<view>
  if (parts.length >= 4 && parts[0] === "round" && /^v\d+$/.test(parts[2])) {
    return { roundName: decodeURIComponent(parts[1]), version: parts[2] };
  }
  return null;
}

function getSessionIdFromHash() {
  const ref = parseSessionRef();
  return ref ? `${ref.roundName}/${ref.version}` : null;
}
```

- [ ] **Step 2: Update `checkActiveSessions`**

Replace `api.listSessions()` with `api.listRounds()`, then check if any round has an active session:

```javascript
async function checkActiveSessions() {
  try {
    const rounds = await api.listRounds();
    const hasActive = rounds.some(r =>
      (r.sessions || []).some(s => s.status === "reviewing")
    );
    const dot = document.getElementById("active-dot");
    if (dot) dot.style.display = hasActive ? "block" : "none";
  } catch { /* ignore */ }
}
```

- [ ] **Step 3: Update route table**

```javascript
const routes = {
  home: renderHome,
  round: null, // special: dispatches to sub-views
  settings: renderSettings,
};
```

Update `parseHash` and `navigate` to handle `#/round/<roundName>/v<N>/<view>` pattern and dispatch to the correct render function.

- [ ] **Step 4: Commit**

```bash
git add skills/audit/scripts/public/js/app.mjs
git commit -m "refactor: update app.mjs hash router for nested round routes"
```

---

### Task 10: Update all frontend views

**Files:**
- Modify: `skills/audit/scripts/public/js/views/home.mjs`
- Modify: `skills/audit/scripts/public/js/views/round-detail.mjs`
- Modify: `skills/audit/scripts/public/js/views/round-summary.mjs`
- Modify: `skills/audit/scripts/public/js/views/wizard.mjs`
- Modify: `skills/audit/scripts/public/js/views/wizard-scope.mjs`
- Modify: `skills/audit/scripts/public/js/views/wizard-stories.mjs`
- Modify: `skills/audit/scripts/public/js/views/wizard-project.mjs`
- Modify: `skills/audit/scripts/public/js/views/progress.mjs`
- Modify: `skills/audit/scripts/public/js/views/review.mjs`
- Modify: `skills/audit/scripts/public/js/components/notes-panel.mjs`

- [ ] **Step 1: Update `home.mjs`**

- `api.createRound({ name })` response now returns `{ name }` instead of `{ id, name }`.
- After creation, navigate to `#/round/${encodeURIComponent(name)}/new-wizard` (or however the wizard is triggered).
- Round cards link to `#/round/${encodeURIComponent(r.name)}` instead of `#/rounds/${r.id}`.
- Remove `r.id` references — use `r.name` throughout.

- [ ] **Step 2: Update `round-detail.mjs`**

- `params[0]` is now the round name.
- `api.getRound(roundName)` — already works.
- `api.getNotes(roundName, version)` — add version param.
- `api.createRoundSession(roundName, ...)` — already works.
- Session card links change: `sessionTarget(status, id)` → builds `#/round/${roundName}/${version}/${view}`.
- `api.reReview(roundName, ...)` response no longer has `sessionId` — it has `version`. Navigate to `#/round/${roundName}/v${version}/progress`.

- [ ] **Step 3: Update `round-summary.mjs`**

- `params[0]` is round name. `api.getRound(roundName)` and `api.getRoundSummary(roundName)` already use it. No API signature change needed.

- [ ] **Step 4: Update `wizard.mjs`**

- The wizard extracts `roundName` and `version` from the hash route `#/round/<roundName>/v<N>/wizard`.
- All `api.*` calls change from `(sessionId, ...)` to `(roundName, version, ...)`.
- localStorage key changes from `audit-wizard-${sessionId}` to `audit-wizard-${roundName}-${version}`.
- `createRoundSession` response: `{ version, roundName }` instead of `{ id, projectDir }`.
- Navigation: `#/round/${roundName}/v${version}/wizard` instead of `#/wizard/${id}`.

- [ ] **Step 5: Update `wizard-scope.mjs`, `wizard-stories.mjs`, `wizard-project.mjs`**

All use `state.sessionId` to call API methods. Change to `state.roundName, state.version`. The state object in wizard.mjs needs `roundName` and `version` properties.

- [ ] **Step 6: Update `progress.mjs`**

- Extract `roundName` and `version` from hash params.
- All API calls: `(sessionId)` → `(roundName, version)`.
- SSE endpoint: `/api/rounds/${roundName}/sessions/${version}/scan/logs`.
- Terminal card commands: `group ${roundName}/${version}` instead of `group ${sessionId}`.
- Navigation: `#/round/${roundName}/${version}/review` instead of `#/review/${sessionId}`.

- [ ] **Step 7: Update `review.mjs`**

- Extract `roundName` and `version` from hash params.
- All API calls: `(sessionId, ...)` → `(roundName, version, ...)`.

- [ ] **Step 8: Update `notes-panel.mjs`**

- `updateSession(sessionId)` → `updateSession(roundName, version)`.
- All API calls: `(sessionId, ...)` → `(roundName, version, ...)`.

- [ ] **Step 9: Commit**

```bash
git add skills/audit/scripts/public/js/
git commit -m "refactor: update all frontend views for round-scoped routes"
```

---

### Task 11: Update `skills/audit/SKILL.md` and sub-agent prompts

**Files:**
- Modify: `skills/audit/SKILL.md`
- Modify: `skills/audit/prompts/code-review.md`
- Modify: `skills/audit/prompts/story-review.md`
- Modify: `skills/audit/prompts/project-review.md`
- Modify: `skills/audit/prompts/project-group.md`

- [ ] **Step 1: Update SKILL.md curl examples**

Replace all timestamp-based examples with round name + version. Key changes:
- Round creation returns `{ name }`
- Session creation returns `{ version, roundName }`
- All session API paths: `/api/rounds/<roundName>/sessions/v<N>/...`
- Sub-agent context: `round-name`, `version`, `task-file` instead of `session-id`, `round-id`, `task-file`

- [ ] **Step 2: Update sub-agent prompts**

Replace `session-id` and `round-id` with `round-name` and `version`. Update the path structure described in each prompt from `.audit/<project>/<round-id>/<session-id>/` to `.audit/<project>/<round-name>/v<N>/`.

- [ ] **Step 3: Commit**

```bash
git add skills/audit/SKILL.md skills/audit/prompts/
git commit -m "docs: update SKILL.md and prompts for semantic paths"
```

---

### Task 12: Clean build test

- [ ] **Step 1: Delete old audit data**

```bash
rm -rf ~/.audit/a-solid-audit/
```

- [ ] **Step 2: Start the server and smoke test**

```bash
node skills/audit/scripts/cli.mjs server 3456 &
sleep 2

# Create a round
curl -s -X POST http://localhost:3456/api/rounds -H 'Content-Type: application/json' -d '{"name":"test-round"}'

# Create a session
curl -s -X POST http://localhost:3456/api/rounds/test-round/sessions -H 'Content-Type: application/json' -d '{"type":"code"}'

# Verify session
curl -s http://localhost:3456/api/rounds/test-round/sessions/v1

# Verify directory structure
ls ~/.audit/a-solid-audit/test-round/v1/

# Clean up
kill %1
```

Expected: `~/.audit/a-solid-audit/test-round/v1/index.yaml` exists with `session.id: v1` and `session.roundName: test-round`.

- [ ] **Step 3: Commit any fixes**

If the smoke test reveals issues, fix and commit.
