# Project Scan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add project-level scan capability to A-Solid Audit that discovers entry points, traces call chains (with optional CodeGraph), and presents each entry as an independently reviewable task.

**Architecture:** Two-phase model — Scan (server-side, no AI) then Review (AI sub-agent per task). CodeGraph CLI is optional; heuristic fallback when not installed. Shared context injected into each review prompt instead of a separate cross-cutting review phase.

**Tech Stack:** Zero-dependency Node.js ESM (existing), CodeGraph CLI (optional external tool), Mermaid (already loaded via CDN)

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `skills/audit/scripts/lib/project-scan.mjs` | Entry discovery, call chain tracing, CodeGraph CLI integration, heuristic fallback |
| `skills/audit/scripts/server/handlers/project-scan.mjs` | `POST /api/sessions/:id/scan` and `GET /api/sessions/:id/scan/status` handlers |
| `skills/audit/prompts/project-review.md` | AI sub-agent prompt template for project task review |
| `scripts/setup-codegraph.sh` | CodeGraph installation helper script |

### Modified files

| File | Change |
|------|--------|
| `skills/audit/scripts/lib/yaml.mjs` | `writeIndexYaml()` must persist `projectTasks` |
| `skills/audit/scripts/lib/session.mjs` | Fix 5 functions to support `projectTasks` and new `scanning` state |
| `skills/audit/scripts/server/index.mjs` | Import and register project-scan routes |
| `skills/audit/scripts/server/handlers/sessions.mjs` | Accept `type` and `projectDir` in session creation |
| `skills/audit/scripts/public/js/api.mjs` | Add `startScan` and `getScanStatus` API methods |
| `skills/audit/scripts/public/js/views/progress.mjs` | Add scan button for project sessions in `created` state |
| `skills/audit/scripts/public/styles.css` | Add scan button and progress styles |

---

## Task 1: Fix `writeIndexYaml()` to persist `projectTasks`

**Files:**
- Modify: `skills/audit/scripts/lib/yaml.mjs:268-280`

**Why first:** Every subsequent task that writes index.yaml depends on this. Currently `writeIndexYaml()` silently drops `projectTasks`.

- [ ] **Step 1: Update `writeIndexYaml()` to include `projectTasks`**

In `skills/audit/scripts/lib/yaml.mjs`, replace the `writeIndexYaml` function:

```javascript
export function writeIndexYaml(filePath, data) {
  writeYaml(filePath, {
    session: {
      id: data.session.id,
      type: data.session.type,
      status: data.session.status || "created",
      scope: data.session.scope,
      projectDir: data.session.projectDir || null,
      created: data.session.created,
    },
    codeTasks: (data.codeTasks || data.tasks || []).map(t => ({ file: t.file, status: t.status })),
    storyTasks: (data.storyTasks || []).map(t => ({ file: t.file, status: t.status })),
    projectTasks: (data.projectTasks || []).map(t => ({ file: t.file, type: t.type, entry: t.entry, status: t.status })),
  });
}
```

Key changes:
- Added `projectTasks` array with `file`, `type`, `entry`, `status` fields
- Added `projectDir` on session (null for non-project sessions)

- [ ] **Step 2: Verify existing sessions still work**

Run: `node -e "
import { readYaml, writeIndexYaml } from './skills/audit/scripts/lib/yaml.mjs';
const data = { session: { id: 'test', type: 'code', status: 'created', scope: { method: '', ref: '' }, created: '2026-01-01' }, codeTasks: [{ file: 'a.yaml', status: 'pending' }], storyTasks: [] };
writeIndexYaml('/tmp/test-index.yaml', data);
const result = readYaml('/tmp/test-index.yaml');
console.log(JSON.stringify(result, null, 2));
"`
Expected: YAML with `projectTasks: []`, existing fields unchanged.

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/lib/yaml.mjs
git commit -m "fix: writeIndexYaml now persists projectTasks and projectDir"
```

---

## Task 2: Fix session.mjs — 5 functions for project support

**Files:**
- Modify: `skills/audit/scripts/lib/session.mjs`

**Why:** All 5 functions ignore `projectTasks` or the `project` session type, causing 0/0 progress, missing directories, hardcoded type, and stuck reviewing states.

- [ ] **Step 1: Update `VALID_STATUSES` to include `scanning`**

Replace line 4:

```javascript
const VALID_STATUSES = ["created", "scoped", "ready", "scanning", "reviewing", "completed"];
```

- [ ] **Step 2: Update `updateSessionStatus()` transitions**

In the `transitions` object inside `updateSessionStatus()`, add the new states:

```javascript
  const transitions = {
    created: ["scoped", "scanning"],
    scoped: ["ready"],
    scanning: ["ready"],
    ready: ["reviewing"],
    reviewing: ["completed"],
    completed: [],
  };
```

- [ ] **Step 3: Fix `listSessions()` to aggregate `projectTasks`**

Replace the `allTasks` line in `listSessions()`:

```javascript
    const allTasks = [...(index.codeTasks || []), ...(index.storyTasks || []), ...(index.projectTasks || [])];
```

- [ ] **Step 4: Fix `getSession()` to aggregate `projectTasks`**

Replace the `allTasks` line and add `projectTasks` to the return object in `getSession()`:

```javascript
  const allTasks = [...(index.codeTasks || []), ...(index.storyTasks || []), ...(index.projectTasks || [])];
```

And add `projectTasks` to the return:

```javascript
  return {
    ...index.session,
    status: index.session.status || "created",
    codeTasks: index.codeTasks || [],
    storyTasks: index.storyTasks || [],
    projectTasks: index.projectTasks || [],
    progress: {
      total: allTasks.length,
      ...counts,
      percentage: allTasks.length ? Math.round((counts.reviewed / allTasks.length) * 100) : 0,
    },
  };
```

- [ ] **Step 5: Fix `initSession()` to create `project-tasks/` directory**

After the `story-tasks` mkdir, add:

```javascript
  fs.mkdirSync(path.join(base, "project-tasks"), { recursive: true });
```

- [ ] **Step 6: Fix `createSession()` to accept `type` and `projectDir`**

Replace the `createSession` function:

```javascript
export function createSession(reportsDir, sid, options = {}) {
  const safeSid = sanitizePath(sid);
  const base = initSession(reportsDir, safeSid);
  const indexPath = path.join(base, "index.yaml");
  writeIndexYaml(indexPath, {
    session: {
      id: safeSid,
      type: options.type || "code",
      status: "created",
      scope: options.type === "project" ? null : { method: "", ref: "" },
      projectDir: options.projectDir || null,
      created: new Date().toISOString(),
    },
    codeTasks: [],
    storyTasks: [],
    projectTasks: [],
  });
  return { id: safeSid, dir: base };
}
```

- [ ] **Step 7: Fix `resetReviewing()` to iterate `projectTasks`**

Replace the task group array:

```javascript
  for (const taskGroup of ["codeTasks", "storyTasks", "projectTasks"]) {
```

- [ ] **Step 8: Verify**

Run: `node -e "
import { createSession, getSession, listSessions, resetReviewing } from './skills/audit/scripts/lib/session.mjs';
const dir = '/tmp/test-audit-' + Date.now();
const { id } = createSession(dir, 'test-session', { type: 'project', projectDir: '/tmp/test-project' });
const session = getSession(dir, 'test-session');
console.log('type:', session.type, 'projectDir:', session.projectDir, 'projectTasks:', JSON.stringify(session.projectTasks));
console.log('listSessions:', JSON.stringify(listSessions(dir).map(s => ({ type: s.type, progress: s.progress }))));
"`
Expected: `type: project`, `projectDir: /tmp/test-project`, `projectTasks: []`, progress total 0.

- [ ] **Step 9: Commit**

```bash
git add skills/audit/scripts/lib/session.mjs
git commit -m "fix: session module supports project type, scanning state, and projectTasks"
```

---

## Task 3: Create `project-scan.mjs` — scanning logic

**Files:**
- Create: `skills/audit/scripts/lib/project-scan.mjs`

**Why:** Core scanning engine — discovers entry points, traces call chains via CodeGraph or heuristics, generates task YAMLs.

- [ ] **Step 1: Create the scanning module**

Create `skills/audit/scripts/lib/project-scan.mjs`:

```javascript
// skills/audit/scripts/lib/project-scan.mjs
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { writeYaml, readYaml, writeIndexYaml } from "./yaml.mjs";
import { sanitizePath } from "./session.mjs";

const ENTRY_RULES = [
  { type: "api", pathPatterns: /handler|controller|route|api|endpoint/i, filePatterns: /router|handler|controller/i },
  { type: "scheduled", pathPatterns: /cron|job|scheduler/i, filePatterns: /cron|job|schedule/i },
  { type: "consumer", pathPatterns: /consumer|subscriber|worker|queue|listener/i, filePatterns: /consumer|subscriber|worker|listener/i },
  { type: "script", pathPatterns: /script|bin|cli|migration/i, filePatterns: /cli|migrate|seed|setup/i },
];

const IGNORE_DIRS = new Set(["node_modules", ".git", "dist", "build", "vendor", "__pycache__", ".audit", ".codegraph", "coverage", ".next", ".nuxt"]);

function detectCodeGraph() {
  try {
    const version = execSync("codegraph --version", { timeout: 5000, encoding: "utf-8" }).trim();
    console.log("[scan] CodeGraph " + version + " detected — using AST-level analysis");
    return { available: true, version };
  } catch {
    console.log("[scan] CodeGraph not found — using heuristic fallback");
    return { available: false };
  }
}

function collectFiles(dir, base = dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      results.push(...collectFiles(path.join(dir, entry.name), base));
    } else {
      const ext = path.extname(entry.name);
      if ([".js", ".mjs", ".cjs", ".ts", ".mts", ".cts", ".jsx", ".tsx"].includes(ext)) {
        results.push(path.relative(base, path.join(dir, entry.name)));
      }
    }
  }
  return results;
}

function identifyEntryType(filePath) {
  for (const rule of ENTRY_RULES) {
    if (rule.pathPatterns.test(filePath) || rule.filePatterns.test(path.basename(filePath, path.extname(filePath)))) {
      return rule.type;
    }
  }
  return "unknown";
}

function parseImports(content, filePath) {
  const imports = [];
  const dir = path.dirname(filePath);
  const patterns = [
    /import\s+.*?\s+from\s+['"](\.\/[^'"]+)['"]/g,
    /import\s+.*?\s+from\s+['"](\.\.\/[^'"]+)['"]/g,
    /require\s*\(\s*['"](\.\/[^'"]+)['"]\s*\)/g,
    /require\s*\(\s*['"](\.\.\/[^'"]+)['"]\s*\)/g,
  ];
  for (const re of patterns) {
    let match;
    while ((match = re.exec(content)) !== null) {
      const raw = match[1];
      const resolved = path.normalize(path.join(dir, raw));
      imports.push(resolved);
    }
  }
  return imports;
}

function traceCallChainHeuristic(entryFile, projectDir, allFiles) {
  const visited = new Set();
  const chain = [];
  const exts = [".js", ".mjs", ".cjs", ".ts", ".mts", ".cts", ""];

  function walk(filePath) {
    if (visited.has(filePath)) return;
    visited.add(filePath);
    chain.push(filePath);

    const full = path.join(projectDir, filePath);
    if (!fs.existsSync(full)) return;
    const content = fs.readFileSync(full, "utf-8");
    const imports = parseImports(content, filePath);

    for (const imp of imports) {
      let resolved = imp.startsWith("/") ? imp : path.normalize(imp);
      let found = false;
      for (const ext of exts) {
        const candidate = resolved + ext;
        if (allFiles.includes(candidate) && !visited.has(candidate)) {
          walk(candidate);
          found = true;
          break;
        }
      }
      if (!found) {
        for (const ext of exts) {
          const candidate = path.join(resolved, "index" + ext);
          if (allFiles.includes(candidate) && !visited.has(candidate)) {
            walk(candidate);
            break;
          }
        }
      }
    }
  }

  walk(entryFile);
  return chain;
}

function traceCallChainCodeGraph(entryFile, projectDir) {
  try {
    const result = execSync(
      `codegraph callees "${entryFile}" --depth 5 --json`,
      { cwd: projectDir, timeout: 30000, encoding: "utf-8" }
    );
    const data = JSON.parse(result);
    return (data.files || []).map(f => path.relative(projectDir, f));
  } catch {
    return null;
  }
}

function detectBinEntries(projectDir) {
  const pkgPath = path.join(projectDir, "package.json");
  if (!fs.existsSync(pkgPath)) return [];
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    const bins = [];
    if (pkg.bin) {
      if (typeof pkg.bin === "string") bins.push(pkg.bin);
      else Object.values(pkg.bin).forEach(b => bins.push(b));
    }
    return bins.filter(b => typeof b === "string").map(b => path.normalize(b));
  } catch {
    return [];
  }
}

function generateMermaidSource(entryFile, files) {
  if (files.length <= 1) return "";
  const nodes = files.map((f, i) => {
    const name = path.basename(f, path.extname(f));
    return `  N${i}[${name}]`;
  });
  const edges = [];
  for (let i = 0; i < files.length - 1; i++) {
    edges.push(`  N${i} --> N${i + 1}`);
  }
  return "graph TD\n" + nodes.join("\n") + "\n" + edges.join("\n");
}

export function scanProject(projectDir, reportsDir, sid) {
  const safeSid = sanitizePath(sid);
  const sessionDir = path.join(reportsDir, safeSid);
  const indexPath = path.join(sessionDir, "index.yaml");
  if (!fs.existsSync(indexPath)) throw new Error("Session not found: " + safeSid);

  const codegraph = detectCodeGraph();

  if (codegraph.available) {
    try {
      execSync("codegraph init -i", { cwd: projectDir, timeout: 10000, stdio: "pipe" });
      execSync("codegraph index", { cwd: projectDir, timeout: 120000, stdio: "pipe" });
    } catch (e) {
      console.log("[scan] CodeGraph indexing failed, falling back: " + e.message);
      codegraph.available = false;
    }
  }

  const allFiles = collectFiles(projectDir);
  console.log("[scan] Found " + allFiles.length + " source files");

  const entries = new Map();

  for (const file of allFiles) {
    const type = identifyEntryType(file);
    if (type !== "unknown") {
      entries.set(file, { type, entry: file });
    }
  }

  for (const bin of detectBinEntries(projectDir)) {
    if (!entries.has(bin)) {
      entries.set(bin, { type: "script", entry: bin });
    }
  }

  const entryFiles = new Set(entries.keys());
  const assignedFiles = new Set();

  const tasksDir = path.join(sessionDir, "project-tasks");
  fs.mkdirSync(tasksDir, { recursive: true });

  const projectTasks = [];

  for (const [entryFile, info] of entries) {
    let files;
    if (codegraph.available) {
      files = traceCallChainCodeGraph(entryFile, projectDir);
      if (!files) files = traceCallChainHeuristic(entryFile, projectDir, allFiles);
    } else {
      files = traceCallChainHeuristic(entryFile, projectDir, allFiles);
    }

    if (!files || files.length === 0) files = [entryFile];

    for (const f of files) assignedFiles.add(f);

    const name = path.basename(entryFile, path.extname(entryFile));
    const taskFile = "project-tasks/" + name.replace(/[^a-zA-Z0-9_-]/g, "-") + ".yaml";
    const callChain = generateMermaidSource(entryFile, files);

    writeYaml(path.join(sessionDir, taskFile), {
      name,
      type: info.type,
      entry: entryFile,
      files,
      status: "pending",
      _callChain: callChain,
      overview: { diagram: "", description: "" },
      review: { score: 0, summary: "", findings: [], positives: [], gaps: [] },
    });

    projectTasks.push({ file: taskFile, type: info.type, entry: entryFile, status: "pending" });
  }

  const orphans = allFiles.filter(f => !assignedFiles.has(f) && !entryFiles.has(f));
  if (orphans.length > 0) {
    const taskFile = "project-tasks/_unassigned.yaml";
    writeYaml(path.join(sessionDir, taskFile), {
      name: "unassigned-files",
      type: "unknown",
      entry: "",
      files: orphans,
      status: "pending",
      _callChain: "",
      overview: { diagram: "", description: "" },
      review: { score: 0, summary: "", findings: [], positives: [], gaps: [] },
    });
    projectTasks.push({ file: taskFile, type: "unknown", entry: "", status: "pending" });
  }

  const index = readYaml(indexPath);
  index.projectTasks = projectTasks;
  index.session.status = "ready";
  writeIndexYaml(indexPath, index);

  console.log("[scan] Discovered " + projectTasks.length + " entry points, " + orphans.length + " unassigned files");
  return { tasksFound: projectTasks.length, codegraphUsed: codegraph.available, orphans: orphans.length };
}
```

- [ ] **Step 2: Verify module loads**

Run: `node -e "import './skills/audit/scripts/lib/project-scan.mjs'; console.log('module loads ok')"`
Expected: `module loads ok`

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/lib/project-scan.mjs
git commit -m "feat: add project scanning engine with CodeGraph and heuristic support"
```

---

## Task 4: Create project-scan API handlers

**Files:**
- Create: `skills/audit/scripts/server/handlers/project-scan.mjs`
- Modify: `skills/audit/scripts/server/index.mjs`
- Modify: `skills/audit/scripts/server/handlers/sessions.mjs`

- [ ] **Step 1: Create the handler module**

Create `skills/audit/scripts/server/handlers/project-scan.mjs`:

```javascript
// skills/audit/scripts/server/handlers/project-scan.mjs
import path from "node:path";
import fs from "node:fs";
import path from "node:path";
import { scanProject } from "../../lib/project-scan.mjs";
import { readYaml } from "../../lib/yaml.mjs";
import { sanitizePath } from "../../lib/session.mjs";
import { jsonResponse, errorResponse, readBody } from "../index.mjs";

// In-memory scan status tracking
const scanStatuses = new Map();

export function registerProjectScanRoutes(router, reportsDir, projectDir) {
  // POST /api/sessions/:id/scan
  router.post("/api/sessions/:id/scan", async (req, res, params) => {
    try {
      const safeSid = sanitizePath(params.id);
      const sessionDir = path.join(reportsDir, safeSid);
      const indexPath = path.join(sessionDir, "index.yaml");

      if (!fs.existsSync(indexPath)) {
        return errorResponse(res, "Session not found", "NOT_FOUND", 404);
      }

      const index = readYaml(indexPath);
      if (index.session.type !== "project") {
        return errorResponse(res, "Session is not a project scan", "VALIDATION_ERROR", 400);
      }

      const targetDir = index.session.projectDir || projectDir;
      if (!targetDir) {
        return errorResponse(res, "No project directory configured", "VALIDATION_ERROR", 400);
      }

      scanStatuses.set(safeSid, { status: "scanning", progress: "Starting scan..." });

      let result;
      try {
        result = scanProject(targetDir, reportsDir, safeSid);
      } catch (e) {
        scanStatuses.set(safeSid, { status: "error", error: e.message });
        throw e;
      }

      scanStatuses.set(safeSid, { status: "done", result });
      jsonResponse(res, { ok: true, ...result });
    } catch (e) {
      if (e.message.includes("not found")) return errorResponse(res, e.message, "NOT_FOUND", 404);
      if (e.message.includes("Invalid path")) return errorResponse(res, e.message, "VALIDATION_ERROR", 400);
      throw e;
    }
  });

  // GET /api/sessions/:id/scan/status
  router.get("/api/sessions/:id/scan/status", (req, res, params) => {
    try {
      const safeSid = sanitizePath(params.id);
      const status = scanStatuses.get(safeSid) || { status: "none" };
      jsonResponse(res, status);
    } catch (e) {
      if (e.message.includes("Invalid path")) return errorResponse(res, e.message, "VALIDATION_ERROR", 400);
      throw e;
    }
  });
}
```

- [ ] **Step 2: Register project-scan routes in server**

In `skills/audit/scripts/server/index.mjs`, add the import after the existing handler imports:

```javascript
import { registerProjectScanRoutes } from "./handlers/project-scan.mjs";
```

And add the registration after the existing `registerReviewRoutes` call:

```javascript
  registerProjectScanRoutes(router, reportsDir, projectDir);
```

- [ ] **Step 3: Update session creation to accept type and projectDir**

In `skills/audit/scripts/server/handlers/sessions.mjs`, replace the `POST /api/sessions` handler:

```javascript
  router.post("/api/sessions", async (req, res, params) => {
    const sid = sessionId();
    const body = JSON.parse(await readBody(req)).catch(() => ({}));
    const options = {
      type: body.type || "code",
      projectDir: body.projectDir || null,
    };
    const result = createSession(reportsDir, sid, options);
    jsonResponse(res, { id: result.id }, 201);
  });
```

Note: `readBody` returns a string, so we need `JSON.parse(await readBody(req))`. But `readBody` doesn't have `.catch` on it — fix the parsing:

```javascript
  router.post("/api/sessions", async (req, res, params) => {
    const sid = sessionId();
    let options = { type: "code", projectDir: null };
    try {
      const body = JSON.parse(await readBody(req));
      options = {
        type: body.type || "code",
        projectDir: body.projectDir || null,
      };
    } catch { /* use defaults */ }
    const result = createSession(reportsDir, sid, options);
    jsonResponse(res, { id: result.id }, 201);
  });
```

- [ ] **Step 4: Verify server starts**

Run: `timeout 3 node skills/audit/scripts/cli.mjs server 13456 2>&1 || true`
Expected: "A-Solid Audit server running at http://localhost:13456" (then timeout kills it)

- [ ] **Step 5: Commit**

```bash
git add skills/audit/scripts/server/handlers/project-scan.mjs skills/audit/scripts/server/index.mjs skills/audit/scripts/server/handlers/sessions.mjs
git commit -m "feat: add project scan API endpoints and session type support"
```

---

## Task 5: Add `_callChain` cleanup to review handler

**Files:**
- Modify: `skills/audit/scripts/lib/task.mjs`

**Why:** The spec requires removing the `_callChain` internal field after a task is reviewed. Currently `updateTask()` doesn't do this.

- [ ] **Step 1: Add `_callChain` removal to `updateTask()`**

In `skills/audit/scripts/lib/task.mjs`, after the line `if (overview && (overview.diagram || overview.description))` block (around line 30), add:

```javascript
  if (task._callChain !== undefined) delete task._callChain;
```

This goes right before `writeYaml(taskPath, task);` (line 32).

- [ ] **Step 2: Commit**

```bash
git add skills/audit/scripts/lib/task.mjs
git commit -m "fix: remove _callChain internal field after task review"
```

---

## Task 6: Create project-review prompt template

**Files:**
- Create: `skills/audit/prompts/project-review.md`

- [ ] **Step 1: Create the prompt template**

Create `skills/audit/prompts/project-review.md`:

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add skills/audit/prompts/project-review.md
git commit -m "feat: add project review AI prompt template"
```

---

## Task 7: Add frontend API methods

**Files:**
- Modify: `skills/audit/scripts/public/js/api.mjs`

- [ ] **Step 1: Add scan API methods**

In `skills/audit/scripts/public/js/api.mjs`, add to the `api` object after the `setReviewContext` entry:

```javascript
  // Project Scan
  startScan: (id) =>
    request("POST", `/api/sessions/${encodeURIComponent(id)}/scan`),
  getScanStatus: (id) =>
    request("GET", `/api/sessions/${encodeURIComponent(id)}/scan/status`),
```

Also update `createSession` to accept options:

```javascript
  createSession: (options = {}) =>
    request("POST", "/api/sessions", options),
```

- [ ] **Step 2: Verify**

Run: `node -e "
import { api } from './skills/audit/scripts/public/js/api.mjs';
console.log('startScan:', typeof api.startScan);
console.log('getScanStatus:', typeof api.getScanStatus);
" 2>&1 || echo "Note: browser-only module, expected import issues in Node"`

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/public/js/api.mjs
git commit -m "feat: add project scan API methods to frontend client"
```

---

## Task 8: Add scan button to progress view

**Files:**
- Modify: `skills/audit/scripts/public/js/views/progress.mjs`

- [ ] **Step 1: Add scan button UI for project sessions in `created` state**

In `skills/audit/scripts/public/js/views/progress.mjs`, after the `setBreadcrumb` call, locate the `container.innerHTML` template string. After the closing `</div>` of the `poll-warning` div but before the final backtick, add the scan overlay:

Find this line:
```javascript
    <div id="poll-warning" class="hidden mt-4">
```

Before it, add:

```javascript
    <div id="scan-overlay" class="hidden card" style="text-align:center;padding:var(--space-8) var(--space-6);margin-bottom:var(--space-4)">
      <div style="margin-bottom:var(--space-4);color:var(--info)">${icon("search", 48)}</div>
      <h2 class="text-lg mb-2">Project Scan</h2>
      <p class="text-sm text-muted mb-4" style="max-width:400px;margin:0 auto">Discover entry points and call chains. This may take a minute for large projects.</p>
      <div id="scan-status" class="text-sm text-muted mb-4 hidden"></div>
      <button id="start-scan-btn" class="btn btn-primary">${icon("search", 14)} Start Scan</button>
    </div>
```

- [ ] **Step 2: Add scan logic in the `poll()` function**

At the beginning of the `poll()` function, before the `try`, add session type detection and overlay control:

```javascript
  async function poll() {
    try {
      const session = await api.getSession(sessionId);

      // Handle project sessions in created/scanning state
      const scanOverlay = document.getElementById("scan-overlay");
      const scanStatusEl = document.getElementById("scan-status");
      const startBtn = document.getElementById("start-scan-btn");

      if (session.type === "project" && (session.status === "created" || session.status === "scanning")) {
        scanOverlay.classList.remove("hidden");
        document.getElementById("task-list").innerHTML = "";
        document.getElementById("progress-text").textContent = "Project scan not started";
        document.getElementById("progress-pct").textContent = "";
        document.getElementById("progress-fill").style.width = "0%";

        if (session.status === "scanning") {
          startBtn.classList.add("hidden");
          scanStatusEl.classList.remove("hidden");
          try {
            const scanStatus = await api.getScanStatus(sessionId);
            scanStatusEl.textContent = scanStatus.progress || "Scanning...";
          } catch { scanStatusEl.textContent = "Scanning..."; }
        }

        pollTimer = setTimeout(poll, 3000);
        return;
      }

      if (scanOverlay) scanOverlay.classList.add("hidden");

      const tasks = await api.getTasks(sessionId);
```

Note: The existing code structure has `const session = await api.getSession(sessionId)` and `const tasks = await api.getTasks(sessionId)` on separate lines. Modify to merge the project-scan check between them.

Replace the beginning of the `poll()` function (from `async function poll()` through to `const tasks = await api.getTasks(sessionId);`):

```javascript
  async function poll() {
    try {
      const session = await api.getSession(sessionId);
      pollFailures = 0;
      document.getElementById("poll-warning").classList.add("hidden");

      // Handle project sessions in created/scanning state
      const scanOverlay = document.getElementById("scan-overlay");
      const scanStatusEl = document.getElementById("scan-status");
      const startBtn = document.getElementById("start-scan-btn");

      if (session.type === "project" && (session.status === "created" || session.status === "scanning")) {
        scanOverlay.classList.remove("hidden");
        document.getElementById("task-list").innerHTML = "";
        document.getElementById("progress-text").textContent = "Project scan not started";
        document.getElementById("progress-pct").textContent = "";
        document.getElementById("progress-fill").style.width = "0%";
        document.getElementById("session-badge").innerHTML = `<span class="badge badge-${escapeHtml(session.status)}">${escapeHtml(session.status)}</span>`;

        if (session.status === "scanning") {
          startBtn.classList.add("hidden");
          scanStatusEl.classList.remove("hidden");
          try {
            const scanStatus = await api.getScanStatus(sessionId);
            scanStatusEl.textContent = scanStatus.progress || "Scanning...";
          } catch { scanStatusEl.textContent = "Scanning..."; }
        }

        pollTimer = setTimeout(poll, 3000);
        return;
      }

      if (scanOverlay) scanOverlay.classList.add("hidden");

      const tasks = await api.getTasks(sessionId);
```

- [ ] **Step 3: Add scan button event listener**

After the `manual-refresh-btn` listener, add:

```javascript
  document.getElementById("start-scan-btn").addEventListener("click", async () => {
    const startBtn = document.getElementById("start-scan-btn");
    const scanStatusEl = document.getElementById("scan-status");
    startBtn.disabled = true;
    startBtn.textContent = "Starting scan...";
    scanStatusEl.classList.remove("hidden");
    scanStatusEl.textContent = "Initiating scan...";
    try {
      await api.startScan(sessionId);
      scanStatusEl.textContent = "Scanning in progress...";
      pollInterval = 3000;
      pollTimer = setTimeout(poll, pollInterval);
    } catch (e) {
      startBtn.disabled = false;
      startBtn.innerHTML = `${icon("search", 14)} Start Scan`;
      scanStatusEl.textContent = "Scan failed: " + e.message;
      showToast("Scan failed: " + e.message, "error");
    }
  });
```

- [ ] **Step 4: Verify no syntax errors**

Run: `node --check skills/audit/scripts/public/js/views/progress.mjs 2>&1 || echo "Note: ESM in browser, expected issues in Node"`

- [ ] **Step 5: Commit**

```bash
git add skills/audit/scripts/public/js/views/progress.mjs
git commit -m "feat: add scan button to progress view for project sessions"
```

---

## Task 9: Add CSS styles for scan UI

**Files:**
- Modify: `skills/audit/scripts/public/styles.css`

- [ ] **Step 1: Add badge styles for new states**

In `skills/audit/scripts/public/styles.css`, add after the existing `.badge-reviewing-task` rule:

```css
.badge-scanning {
  background: var(--info-dim, rgba(59, 130, 246, 0.1));
  color: var(--info);
  border: 1px solid rgba(59, 130, 246, 0.3);
}
```

Note: Check if `--info-dim` is already defined. If not, use `rgba(59, 130, 246, 0.1)` directly or add the variable. The existing design system likely has `var(--info)` — search for it and use a matching dim variant.

- [ ] **Step 2: Commit**

```bash
git add skills/audit/scripts/public/styles.css
git commit -m "feat: add scanning state badge style"
```

---

## Task 10: Create CodeGraph installation script

**Files:**
- Create: `scripts/setup-codegraph.sh`

- [ ] **Step 1: Create the script**

Create `scripts/setup-codegraph.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${HOME}/.local/share/codegraph"
echo "==> Installing CodeGraph..."

if [ -d "$INSTALL_DIR" ]; then
  echo "==> Existing installation found at $INSTALL_DIR, updating..."
  cd "$INSTALL_DIR"
  git pull
else
  git clone https://github.com/colbymchenry/codegraph.git "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

npm install && npm run build

# Link binary to user's PATH
mkdir -p "${HOME}/.local/bin"
ln -sf "$INSTALL_DIR/bin/codegraph" "${HOME}/.local/bin/codegraph"

if command -v codegraph &>/dev/null; then
  echo "==> CodeGraph installed: $(codegraph --version)"
  echo "==> You can now run 'a-solid audit project scan' with AST-level analysis."
else
  echo "==> Add ${HOME}/.local/bin to your PATH, or run codegraph via:"
  echo "    ${HOME}/.local/bin/codegraph"
fi
```

- [ ] **Step 2: Make executable**

Run: `chmod +x scripts/setup-codegraph.sh`

- [ ] **Step 3: Commit**

```bash
git add scripts/setup-codegraph.sh
git commit -m "feat: add CodeGraph installation helper script"
```

---

## Task 11: Integration verification

**Files:** None (verification only)

- [ ] **Step 1: Verify server starts with all new routes**

Run: `timeout 3 node skills/audit/scripts/cli.mjs server 13457 2>&1 || true`
Expected: "A-Solid Audit server running at http://localhost:13457"

- [ ] **Step 2: Test project session creation via API**

Run:
```bash
node -e "
import { createSession, getSession } from './skills/audit/scripts/lib/session.mjs';
const dir = '/tmp/itest-' + Date.now();
const { id } = createSession(dir, 'itest', { type: 'project', projectDir: process.cwd() });
const s = getSession(dir, 'itest');
console.log('type:', s.type, 'projectDir:', s.projectDir, 'status:', s.status);
console.log('projectTasks:', JSON.stringify(s.projectTasks));
" 2>&1
```
Expected: `type: project`, `projectDir: <cwd>`, `status: created`, `projectTasks: []`

- [ ] **Step 3: Test scan on this project**

Run:
```bash
node -e "
import { createSession } from './skills/audit/scripts/lib/session.mjs';
import { scanProject } from './skills/audit/scripts/lib/project-scan.mjs';
const dir = '/tmp/itest-scan-' + Date.now();
const { id } = createSession(dir, 'itest-scan', { type: 'project', projectDir: process.cwd() });
const result = scanProject(process.cwd(), dir, 'itest-scan');
console.log('Result:', JSON.stringify(result));
" 2>&1
```
Expected: `tasksFound: <N>`, `codegraphUsed: false` (unless CodeGraph is installed), `orphans: <M>`

- [ ] **Step 4: Verify task YAMLs were created**

Run: `ls /tmp/itest-scan-*/project-tasks/ 2>/dev/null || echo "no files"`
Expected: List of `.yaml` files matching discovered entry points.

- [ ] **Step 5: Final commit if any fixes needed**

If any issues were found and fixed:
```bash
git add -A
git commit -m "fix: integration test fixes"
```
