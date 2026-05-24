# CodeGraph CLI Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace regex-based `resolveImports` with codegraph CLI calls, add scan pipeline logging, and add frontend UI for codegraph status + scan logs.

**Architecture:** Backend calls `codegraph query --json -k import` once per scan to get all import edges, then filters in-memory per file. Falls back to regex if codegraph unavailable. SSE streams logs from server to browser during scanning.

**Tech Stack:** Node.js (ESM), codegraph CLI, vanilla JS frontend, Server-Sent Events

---

## Task 1: Add log buffer and helpers to `project-scan.mjs`

**Files:**
- Modify: `skills/audit/scripts/lib/project-scan.mjs` (add at top + new exports)

This task adds the logging infrastructure. No behavior change yet — just the buffer and helper functions that later tasks will use.

- [ ] **Step 1: Add log buffer and helper functions**

At the top of `skills/audit/scripts/lib/project-scan.mjs`, add `import { execSync } from "node:child_process";` to the imports.

After the existing `IMPORT_RE` constant (line 69), add the log buffer and helpers:

```javascript
import { execSync } from "node:child_process";

// ── Scan log buffer (for SSE streaming) ──
const scanLogs = new Map();

function pushLog(sid, level, message) {
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

- [ ] **Step 2: Verify no syntax errors**

Run: `node --check skills/audit/scripts/lib/project-scan.mjs`
Expected: No output (clean parse)

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/lib/project-scan.mjs
git commit -m "feat(project-scan): add scan log buffer and helpers"
```

---

## Task 2: Add `resolveImportsViaCodegraph` function

**Files:**
- Modify: `skills/audit/scripts/lib/project-scan.mjs`

This task adds the codegraph-based import resolver alongside the existing `resolveImports`. It does NOT replace the call sites yet.

- [ ] **Step 1: Add `resolveImportsViaCodegraph` function**

Add this function after the existing `resolveImports` function (after line 99). It makes a single CLI call to get all import nodes, then filters by source file:

```javascript
// ── CodeGraph-based import resolver ──
let _codegraphCache = null;
let _codegraphCacheDir = null;

function resolveImportsViaCodegraph(filePath, projectDir, sid) {
  try {
    // One CLI call per scan — cache results per projectDir
    if (_codegraphCacheDir !== projectDir || !_codegraphCache) {
      const cmd = `codegraph query --json -k import -l 1000 "" -p "${projectDir}"`;
      pushLog(sid, "info", `codegraph: ${cmd}`);
      const start = Date.now();
      const raw = execSync(cmd, { encoding: "utf-8", timeout: 30000, stdio: ["pipe", "pipe", "pipe"] });
      const data = JSON.parse(raw);
      pushLog(sid, "info", `codegraph: returned ${data.length} import edges in ${Date.now() - start}ms`);

      // Build map: source file → [resolved target files]
      const fileImports = new Map();
      for (const item of data) {
        const n = item.node;
        const src = n.filePath;
        // Skip worktree/duplicate paths
        if (src.includes("worktree")) continue;
        const impPath = n.qualifiedName || n.name;
        if (!impPath || impPath.startsWith("node:")) continue;

        if (!fileImports.has(src)) fileImports.set(src, []);
        fileImports.get(src).push(impPath);
      }
      _codegraphCache = fileImports;
      _codegraphCacheDir = projectDir;
    }

    // Find imports for our file
    const rawImports = _codegraphCache.get(filePath) || [];
    const resolved = [];
    for (const imp of rawImports) {
      const resolvedPath = path.normalize(path.join(path.dirname(filePath), imp)).replace(/\\/g, "/");
      for (const ext of ["", ".mjs", ".js", ".ts", ".cjs"]) {
        if (fs.existsSync(path.join(projectDir, resolvedPath + ext))) {
          resolved.push(resolvedPath + ext);
          break;
        }
      }
      for (const ext of ["/index.mjs", "/index.js", "/index.ts"]) {
        if (fs.existsSync(path.join(projectDir, resolvedPath + ext))) {
          resolved.push(resolvedPath + ext);
          break;
        }
      }
    }
    return [...new Set(resolved)];
  } catch (e) {
    pushLog(sid, "warn", `codegraph: fallback to regex — ${e.message}`);
    return resolveImports(filePath, projectDir);
  }
}

export function resetCodegraphCache() {
  _codegraphCache = null;
  _codegraphCacheDir = null;
}
```

- [ ] **Step 2: Verify no syntax errors**

Run: `node --check skills/audit/scripts/lib/project-scan.mjs`
Expected: No output (clean parse)

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/lib/project-scan.mjs
git commit -m "feat(project-scan): add resolveImportsViaCodegraph with regex fallback"
```

---

## Task 3: Wire up codegraph resolver + logging in `chunkFiles` and `scanProjectDir`

**Files:**
- Modify: `skills/audit/scripts/lib/project-scan.mjs`

This task switches `chunkFiles` to use `resolveImportsViaCodegraph` and adds logging to `scanProjectDir`, `chunkFiles`, and `setProjectScope`.

- [ ] **Step 1: Add logging to `scanProjectDir`**

In the `scanProjectDir` function, add `sid` parameter and logging. Replace the function signature (line 101) and add logs after the walk (after line 128):

Change signature from:
```javascript
export function scanProjectDir(projectDir, options = {}) {
```
to:
```javascript
export function scanProjectDir(projectDir, options = {}, sid) {
```

After `walk(projectDir);` (line 128) and before `files.sort(...)`, add:
```javascript
  pushLog(sid, "info", `scanProjectDir: found ${files.length} files (high: ${files.filter(f => f.priority === "high").length}, medium: ${files.filter(f => f.priority === "medium").length}, low: ${files.filter(f => f.priority === "low").length})`);
```

- [ ] **Step 2: Switch `chunkFiles` to use codegraph + add logging**

Change signature from:
```javascript
export function chunkFiles(files, projectDir) {
```
to:
```javascript
export function chunkFiles(files, projectDir, sid) {
```

After the entries/nonEntries split (after line 143, before `const claimed = new Set()`), add:
```javascript
  pushLog(sid, "info", `chunkFiles: ${files.length} files, ${entries.length} entry points, ${nonEntries.length} non-entry files`);
```

Replace the two `resolveImports` calls inside the `for (const entry of entries)` loop (lines 151-155). Change from:
```javascript
    for (const imp of resolveImports(entry.path, projectDir)) {
      chain.add(imp);
      for (const imp2 of resolveImports(imp, projectDir)) {
        chain.add(imp2);
      }
    }
```
to:
```javascript
    for (const imp of resolveImportsViaCodegraph(entry.path, projectDir, sid)) {
      chain.add(imp);
      for (const imp2 of resolveImportsViaCodegraph(imp, projectDir, sid)) {
        chain.add(imp2);
      }
    }
```

After the merged result (after `return merged;` on line 203), add a log line before the return:
```javascript
  pushLog(sid, "info", `chunkFiles: produced ${merged.length} chunks (${entries.length} entry-based, ${merged.length - entries.length} merged unknowns)`);
```

Actually — insert this BEFORE `return merged`:
```javascript
  pushLog(sid, "info", `chunkFiles: produced ${merged.length} chunks`);
  return merged;
```

- [ ] **Step 3: Add logging to `setProjectScope`**

At the start of `setProjectScope` (after the session existence check on line 210), add:
```javascript
  const startTime = Date.now();
  resetCodegraphCache();
  pushLog(safeSid, "info", `setProjectScope: starting scan of ${projectDir}`);
```

Change the `scanProjectDir` call (line 212) from:
```javascript
  const files = scanProjectDir(projectDir, scanOptions);
```
to:
```javascript
  const files = scanProjectDir(projectDir, scanOptions, safeSid);
```

Change the `chunkFiles` call (line 213) from:
```javascript
  const chunks = chunkFiles(files, projectDir);
```
to:
```javascript
  const chunks = chunkFiles(files, projectDir, safeSid);
```

Before the final `return` (line 262), add:
```javascript
  pushLog(safeSid, "info", `setProjectScope: ${tasks.length} tasks from ${files.length} files in ${Date.now() - startTime}ms`);
```

- [ ] **Step 4: Verify no syntax errors**

Run: `node --check skills/audit/scripts/lib/project-scan.mjs`
Expected: No output (clean parse)

- [ ] **Step 5: Commit**

```bash
git add skills/audit/scripts/lib/project-scan.mjs
git commit -m "feat(project-scan): wire codegraph resolver into chunkFiles, add pipeline logging"
```

---

## Task 4: Add codegraph status + init API endpoints

**Files:**
- Modify: `skills/audit/scripts/server/handlers/settings.mjs`

This task adds the backend API for checking codegraph availability and initializing the index.

- [ ] **Step 1: Add `import` for `execSync` and the two new routes**

At the top of `skills/audit/scripts/server/handlers/settings.mjs`, add to the existing imports:
```javascript
import { execSync } from "node:child_process";
```

Inside `registerSettingsRoutes`, after the existing `PUT /api/settings` handler (after line 84, before the closing `}`), add:

```javascript
  // GET /api/codegraph/status
  router.get("/api/codegraph/status", (req, res, params, url) => {
    try {
      const dir = url?.searchParams?.get("dir") || "";
      const result = { available: false, initialized: false, indexed: false, fileCount: null, symbolCount: null };

      // Check CLI availability
      try {
        execSync("which codegraph", { encoding: "utf-8", timeout: 5000 });
        result.available = true;
      } catch {
        return jsonResponse(res, result);
      }

      // Check .codegraph/ directory
      if (!dir) return jsonResponse(res, result);
      const codegraphDir = path.join(dir, ".codegraph");
      if (!fs.existsSync(codegraphDir)) return jsonResponse(res, result);
      result.initialized = true;

      // Get index stats
      try {
        const raw = execSync(`codegraph status --json "${dir}"`, { encoding: "utf-8", timeout: 5000 });
        const stats = JSON.parse(raw);
        result.indexed = stats.initialized;
        result.fileCount = stats.fileCount || null;
        result.symbolCount = stats.nodeCount || null;
      } catch {}

      jsonResponse(res, result);
    } catch (e) {
      errorResponse(res, "Failed to check codegraph status: " + e.message, "INTERNAL_ERROR", 500);
    }
  });

  // POST /api/codegraph/init
  router.post("/api/codegraph/init", async (req, res) => {
    try {
      const body = JSON.parse(await readBody(req));
      const dir = body?.projectDir;
      if (!dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
        return errorResponse(res, "Invalid project directory", "VALIDATION_ERROR", 400);
      }

      console.log(`[codegraph] Initializing: ${dir}`);
      execSync(`codegraph init -i "${dir}"`, { encoding: "utf-8", timeout: 30000 });
      console.log(`[codegraph] Indexing: ${dir}`);
      execSync(`codegraph index "${dir}"`, { encoding: "utf-8", timeout: 120000 });
      console.log(`[codegraph] Done`);

      jsonResponse(res, { ok: true });
    } catch (e) {
      console.error(`[codegraph] Init failed: ${e.message}`);
      errorResponse(res, "CodeGraph init failed: " + e.message, "INTERNAL_ERROR", 500);
    }
  });
```

Note: The route handler signature needs access to the URL. Check the router dispatch in `server/index.mjs` line 50-51 — it passes `(req, res, match.params)`. We need URL access. The simplest fix is to parse `req.url` inside the handler:

Replace `url?.searchParams?.get("dir")` with:
```javascript
const url = new URL(req.url, `http://localhost`);
const dir = url.searchParams.get("dir") || "";
```

So the full GET handler becomes:

```javascript
  // GET /api/codegraph/status
  router.get("/api/codegraph/status", (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const dir = url.searchParams.get("dir") || "";
      const result = { available: false, initialized: false, indexed: false, fileCount: null, symbolCount: null };

      // Check CLI availability
      try {
        execSync("which codegraph", { encoding: "utf-8", timeout: 5000 });
        result.available = true;
      } catch {
        return jsonResponse(res, result);
      }

      // Check .codegraph/ directory
      if (!dir) return jsonResponse(res, result);
      const codegraphDir = path.join(dir, ".codegraph");
      if (!fs.existsSync(codegraphDir)) return jsonResponse(res, result);
      result.initialized = true;

      // Get index stats
      try {
        const raw = execSync(`codegraph status --json "${dir}"`, { encoding: "utf-8", timeout: 5000 });
        const stats = JSON.parse(raw);
        result.indexed = stats.initialized;
        result.fileCount = stats.fileCount || null;
        result.symbolCount = stats.nodeCount || null;
      } catch {}

      jsonResponse(res, result);
    } catch (e) {
      errorResponse(res, "Failed to check codegraph status: " + e.message, "INTERNAL_ERROR", 500);
    }
  });
```

- [ ] **Step 2: Verify no syntax errors**

Run: `node --check skills/audit/scripts/server/handlers/settings.mjs`
Expected: No output (clean parse)

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/server/handlers/settings.mjs
git commit -m "feat(api): add codegraph status and init endpoints"
```

---

## Task 5: Add SSE scan log endpoint

**Files:**
- Modify: `skills/audit/scripts/server/handlers/project-scan.mjs`

This task adds the SSE endpoint that streams scan logs to the browser.

- [ ] **Step 1: Add import and SSE route**

At the top of `project-scan.mjs` handler, add to imports:
```javascript
import { getScanLogs, clearScanLogs } from "../../lib/project-scan.mjs";
```

Inside `registerProjectScanRoutes`, before the closing `}`, add the SSE endpoint:

```javascript
  // GET /api/sessions/:id/scan/logs (SSE)
  router.get("/api/sessions/:id/scan/logs", (req, res, params) => {
    try {
      const safeSid = sanitizePath(params.id);

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      // Send buffered logs
      const buffered = getScanLogs(safeSid);
      for (const entry of buffered) {
        res.write(`data: ${JSON.stringify(entry)}\n\n`);
      }

      // Poll for new entries
      let lastIdx = buffered.length;
      const interval = setInterval(() => {
        const logs = getScanLogs(safeSid);
        while (lastIdx < logs.length) {
          res.write(`data: ${JSON.stringify(logs[lastIdx])}\n\n`);
          lastIdx++;
        }
      }, 200);

      // Cleanup on close
      req.on("close", () => {
        clearInterval(interval);
      });
    } catch (e) {
      if (e.message.includes("Invalid path")) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end(e.message);
      }
    }
  });
```

- [ ] **Step 2: Verify no syntax errors**

Run: `node --check skills/audit/scripts/server/handlers/project-scan.mjs`
Expected: No output (clean parse)

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/server/handlers/project-scan.mjs
git commit -m "feat(api): add SSE scan log endpoint"
```

---

## Task 6: Add frontend API methods

**Files:**
- Modify: `skills/audit/scripts/public/js/api.mjs`

- [ ] **Step 1: Add two new API methods**

In `skills/audit/scripts/public/js/api.mjs`, inside the `api` object, after the existing `updateSettings` line (line 85), add:

```javascript
  // CodeGraph
  getCodegraphStatus: (projectDir) =>
    request("GET", `/api/codegraph/status?dir=${encodeURIComponent(projectDir)}`),
  initCodegraph: (projectDir) =>
    request("POST", "/api/codegraph/init", { projectDir }),
```

- [ ] **Step 2: Verify no syntax errors**

Run: `node --check skills/audit/scripts/public/js/api.mjs`
Expected: No output (clean parse)

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/public/js/api.mjs
git commit -m "feat(api-client): add getCodegraphStatus and initCodegraph"
```

---

## Task 7: Add CSS for codegraph status card and scan log panel

**Files:**
- Modify: `skills/audit/scripts/public/styles.css`

- [ ] **Step 1: Add new CSS classes**

At the end of `skills/audit/scripts/public/styles.css` (before the `@media print` block at line 1207, or at the very end of the file), append:

```css
/* ─── CodeGraph Status Card ─── */
.codegraph-status-card {
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-top: var(--space-3);
}
.codegraph-status-card .codegraph-info { flex: 1; min-width: 0; }
.codegraph-status-card .codegraph-title {
  font-size: var(--text-sm); font-weight: 600; display: flex; align-items: center; gap: var(--space-2);
}
.codegraph-status-card .codegraph-detail {
  font-size: var(--text-xs); color: var(--text-muted); margin-top: 2px;
}
.codegraph-ready { border-left: 3px solid var(--success); }
.codegraph-ready .codegraph-title { color: var(--success); }
.codegraph-uninit { border-left: 3px solid var(--warning); }
.codegraph-uninit .codegraph-title { color: var(--warning); }
.codegraph-unavail { border-left: 3px solid var(--text-muted); }
.codegraph-unavail .codegraph-title { color: var(--text-muted); }
.codegraph-loading { border-left: 3px solid var(--info); }

/* ─── Scan Log Panel ─── */
.scan-log-section { margin-top: var(--space-4); text-align: left; }
.scan-log-toggle {
  display: inline-flex; align-items: center; gap: var(--space-1);
  padding: 0; border: none; background: none;
  color: var(--text-muted); font-size: var(--text-xs);
  font-family: var(--font-ui); cursor: pointer;
  margin-bottom: var(--space-2);
}
.scan-log-toggle:hover { color: var(--text-secondary); }
.scan-log-toggle .toggle-icon {
  transition: transform var(--duration-fast) var(--ease-spring);
  display: inline-flex;
}
.scan-log-toggle.open .toggle-icon { transform: rotate(90deg); }
.scan-log-panel {
  background: var(--bg-deep); border: 1px solid var(--border);
  border-radius: var(--radius-md); max-height: 200px;
  overflow-y: auto; padding: var(--space-2);
  font-family: var(--font-mono); font-size: var(--text-xs);
  line-height: 1.6; display: none;
}
.scan-log-panel.open { display: block; }
.scan-log-entry {
  animation: logFadeIn 200ms var(--ease-spring) forwards;
  opacity: 0; color: var(--text-secondary);
}
.scan-log-entry .log-time { color: var(--text-muted); margin-right: var(--space-2); }
@keyframes logFadeIn {
  from { opacity: 0; transform: translateY(2px); }
  to { opacity: 1; transform: translateY(0); }
}
```

- [ ] **Step 2: Verify CSS is valid (basic check)**

Run: `node -e "const css = require('fs').readFileSync('skills/audit/scripts/public/styles.css','utf8'); console.log('CSS length:', css.length, 'chars')"`
Expected: CSS length printed, no errors

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/public/styles.css
git commit -m "feat(ui): add CSS for codegraph status card and scan log panel"
```

---

## Task 8: Add CodeGraph status card to wizard Configure step

**Files:**
- Modify: `skills/audit/scripts/public/js/views/wizard.mjs`

This task adds the CodeGraph status detection card in the project scan wizard.

- [ ] **Step 1: Add `loadCodegraphStatus` helper function**

In `skills/audit/scripts/public/js/views/wizard.mjs`, after the `formatScopeDisplay` function (around line 16), add:

```javascript
function renderCodegraphStatus(containerId, projectDir) {
  const el = document.getElementById(containerId);
  if (!el) return;

  // Default to server's project dir if input is empty
  const dir = projectDir || "";
  if (!dir) {
    el.innerHTML = `
      <div class="codegraph-status-card codegraph-unavail">
        <div class="codegraph-info">
          <div class="codegraph-title">${icon("info", 16)} CodeGraph</div>
          <div class="codegraph-detail">Enter a project directory to check CodeGraph status.</div>
        </div>
      </div>`;
    return;
  }

  el.innerHTML = `
    <div class="codegraph-status-card codegraph-loading">
      <div class="codegraph-info">
        <div class="codegraph-title"><span class="spinner spinner-sm"></span> Checking CodeGraph...</div>
      </div>
    </div>`;

  api.getCodegraphStatus(dir).then(status => {
    if (status.available && status.indexed) {
      el.innerHTML = `
        <div class="codegraph-status-card codegraph-ready">
          <div class="codegraph-info">
            <div class="codegraph-title">${icon("check", 16)} CodeGraph — Ready</div>
            <div class="codegraph-detail">${status.fileCount || 0} files, ${status.symbolCount || 0} symbols indexed</div>
          </div>
          <button id="codegraph-reindex-btn" class="btn btn-sm">Re-index</button>
        </div>`;
      document.getElementById("codegraph-reindex-btn")?.addEventListener("click", async () => {
        const btn = document.getElementById("codegraph-reindex-btn");
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner spinner-sm"></span> Indexing...';
        try {
          await api.initCodegraph(dir);
          renderCodegraphStatus(containerId, dir);
        } catch (e) {
          showToast("Re-index failed: " + e.message);
          btn.disabled = false;
          btn.textContent = "Re-index";
        }
      });
    } else if (status.available && !status.initialized) {
      el.innerHTML = `
        <div class="codegraph-status-card codegraph-uninit">
          <div class="codegraph-info">
            <div class="codegraph-title">${icon("alertTriangle", 16)} CodeGraph — Not Initialized</div>
            <div class="codegraph-detail">CLI detected but no index found.</div>
          </div>
          <button id="codegraph-init-btn" class="btn btn-primary btn-sm">Initialize & Index</button>
        </div>`;
      document.getElementById("codegraph-init-btn")?.addEventListener("click", async () => {
        const btn = document.getElementById("codegraph-init-btn");
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner spinner-sm"></span> Indexing...';
        try {
          await api.initCodegraph(dir);
          renderCodegraphStatus(containerId, dir);
        } catch (e) {
          showToast("Init failed: " + e.message);
          btn.disabled = false;
          btn.textContent = "Initialize & Index";
        }
      });
    } else if (status.available && status.initialized && !status.indexed) {
      el.innerHTML = `
        <div class="codegraph-status-card codegraph-uninit">
          <div class="codegraph-info">
            <div class="codegraph-title">${icon("alertTriangle", 16)} CodeGraph — Needs Indexing</div>
            <div class="codegraph-detail">Initialized but not yet indexed.</div>
          </div>
          <button id="codegraph-index-btn" class="btn btn-primary btn-sm">Run Index</button>
        </div>`;
      document.getElementById("codegraph-index-btn")?.addEventListener("click", async () => {
        const btn = document.getElementById("codegraph-index-btn");
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner spinner-sm"></span> Indexing...';
        try {
          await api.initCodegraph(dir);
          renderCodegraphStatus(containerId, dir);
        } catch (e) {
          showToast("Index failed: " + e.message);
          btn.disabled = false;
          btn.textContent = "Run Index";
        }
      });
    } else {
      el.innerHTML = `
        <div class="codegraph-status-card codegraph-unavail">
          <div class="codegraph-info">
            <div class="codegraph-title">${icon("x", 16)} CodeGraph — Not Available</div>
            <div class="codegraph-detail">CLI not found. Will use basic file scan.</div>
          </div>
        </div>`;
    }
  }).catch(() => {
    el.innerHTML = `
      <div class="codegraph-status-card codegraph-unavail">
        <div class="codegraph-info">
          <div class="codegraph-title">${icon("x", 16)} CodeGraph — Error</div>
          <div class="codegraph-detail">Failed to check status.</div>
        </div>
      </div>`;
  });
}
```

- [ ] **Step 2: Add status card HTML to `renderProjectConfigure`**

In the `renderProjectConfigure` function, find the section that ends with:
```javascript
          <div class="text-xs text-muted mt-1">Leave empty to scan the current project.</div>
```

Right after that `</div>` and before the closing `</div>` of the card, add:

```html
          <div id="codegraph-status"></div>
```

So the structure becomes:
```javascript
          <div>
            <label for="project-dir">Project Directory</label>
            <input id="project-dir" class="mt-1" placeholder="/path/to/project">
            <div class="text-xs text-muted mt-1">Leave empty to scan the current project.</div>
          </div>
          <div id="codegraph-status"></div>
```

- [ ] **Step 3: Trigger status check on mount and on input change**

After the existing `api.getSession(sessionId).then(...)` block (around line 256), add:

```javascript
    // Check codegraph status on mount
    api.getSession(sessionId).then(session => {
      renderCodegraphStatus("codegraph-status", session.projectDir || "");
    }).catch(() => {});
```

Wait — there's already a `api.getSession` call above. Just add the codegraph check after it. Find the existing block:

```javascript
    api.getSession(sessionId).then(session => {
      const dirInput = document.getElementById("project-dir");
      if (dirInput && session.projectDir) dirInput.value = session.projectDir;
    }).catch(() => {});
```

Add codegraph status check to the same block. Change to:
```javascript
    api.getSession(sessionId).then(session => {
      const dirInput = document.getElementById("project-dir");
      if (dirInput && session.projectDir) dirInput.value = session.projectDir;
      renderCodegraphStatus("codegraph-status", session.projectDir || "");
    }).catch(() => {});
```

Add a debounced re-check on input change. After the `ctxInput` blur handler (around line 281), add:

```javascript
    // Re-check codegraph status when directory changes
    let cgTimer = null;
    const dirInput = document.getElementById("project-dir");
    if (dirInput) {
      dirInput.addEventListener("input", () => {
        clearTimeout(cgTimer);
        cgTimer = setTimeout(() => {
          renderCodegraphStatus("codegraph-status", dirInput.value.trim());
        }, 500);
      });
    }
```

- [ ] **Step 4: Verify no syntax errors**

Run: `node --check skills/audit/scripts/public/js/views/wizard.mjs`
Expected: No output (clean parse)

- [ ] **Step 5: Commit**

```bash
git add skills/audit/scripts/public/js/views/wizard.mjs
git commit -m "feat(wizard): add CodeGraph status card to project configure step"
```

---

## Task 9: Add scan log panel to Progress page

**Files:**
- Modify: `skills/audit/scripts/public/js/views/progress.mjs`

This task adds the SSE-powered log panel to the scan overlay.

- [ ] **Step 1: Add log panel HTML to the scan overlay**

In `skills/audit/scripts/public/js/views/progress.mjs`, find the `scan-overlay` div HTML (around line 45-51). It currently ends with:
```javascript
      <button id="start-scan-btn" class="btn btn-primary">${icon("search", 14)} Start Scan</button>
```

Before this button line, insert the log panel:

```javascript
      <div class="scan-log-section">
        <button id="scan-log-toggle" class="scan-log-toggle">
          <span class="toggle-icon">${icon("chevronRight", 10)}</span> Scan Log
        </button>
        <div id="scan-log-panel" class="scan-log-panel"></div>
      </div>
```

- [ ] **Step 2: Add SSE log streaming logic**

After the `let scanStarted = false;` declaration (around line 13), add:
```javascript
  let logEventSource = null;
```

Add a helper function after the `updateHeading` function (around line 81):

```javascript
  function startLogStream() {
    if (logEventSource) return;
    const logPanel = document.getElementById("scan-log-panel");
    const logToggle = document.getElementById("scan-log-toggle");
    if (!logPanel) return;

    logEventSource = new EventSource(`/api/sessions/${sessionId}/scan/logs`);

    logEventSource.onmessage = (e) => {
      try {
        const entry = JSON.parse(e.data);
        const div = document.createElement("div");
        div.className = "scan-log-entry";
        div.innerHTML = `<span class="log-time">${escapeHtml(entry.timestamp)}</span>${escapeHtml(entry.message)}`;
        logPanel.appendChild(div);
        logPanel.scrollTop = logPanel.scrollHeight;

        // Auto-expand on first entry
        if (!logPanel.classList.contains("open")) {
          logPanel.classList.add("open");
          if (logToggle) logToggle.classList.add("open");
        }
      } catch {}
    };

    logEventSource.onerror = () => {
      logEventSource?.close();
      logEventSource = null;
    };
  }

  function stopLogStream() {
    if (logEventSource) {
      logEventSource.close();
      logEventSource = null;
    }
  }
```

- [ ] **Step 3: Wire up log toggle button**

After the `updateHeading` function block, add the toggle behavior. Find a good place — after the `poll()` function definition, before the event listeners. Add right after the `await poll();` call (around line 265):

Actually, add it inside the render flow. After the `await poll();` line (around line 265), add:

```javascript
  // Scan log toggle
  document.getElementById("scan-log-toggle")?.addEventListener("click", () => {
    const panel = document.getElementById("scan-log-panel");
    const toggle = document.getElementById("scan-log-toggle");
    panel?.classList.toggle("open");
    toggle?.classList.toggle("open");
  });
```

- [ ] **Step 4: Start log stream when scan starts**

In the `poll()` function, find the auto-trigger scan block (around line 120-145). After `await api.startScan(sessionId);` succeeds (around line 133), add:

```javascript
          startLogStream();
```

Also find the manual start button handler (around line 236). After `await api.startScan(sessionId);` succeeds (around line 237), add:

```javascript
      startLogStream();
```

- [ ] **Step 5: Clean up on navigation**

Find the `onNavigateCleanup` call (around line 268). Change from:
```javascript
  onNavigateCleanup(() => {
    if (pollTimer) clearTimeout(pollTimer);
  });
```
to:
```javascript
  onNavigateCleanup(() => {
    if (pollTimer) clearTimeout(pollTimer);
    stopLogStream();
  });
```

- [ ] **Step 6: Verify no syntax errors**

Run: `node --check skills/audit/scripts/public/js/views/progress.mjs`
Expected: No output (clean parse)

- [ ] **Step 7: Commit**

```bash
git add skills/audit/scripts/public/js/views/progress.mjs
git commit -m "feat(progress): add SSE scan log panel with auto-scroll"
```

---

## Task 10: Manual smoke test

This task verifies the full flow end-to-end.

- [ ] **Step 1: Start the server**

Run: `cd /Users/cqx/Projects/chenqixing/a-solid/a-solid-audit && node skills/audit/scripts/cli.mjs server`
Expected: "A-Solid Audit server running at http://localhost:3456"

- [ ] **Step 2: Test codegraph status API**

Run in another terminal: `curl -s http://localhost:3456/api/codegraph/status?dir=/Users/cqx/Projects/chenqixing/a-solid/a-solid-audit | python3 -m json.tool`
Expected: `{ "available": true, "initialized": true, "indexed": true, "fileCount": 68, "symbolCount": 583 }`

- [ ] **Step 3: Test wizard CodeGraph status card**

Open `http://localhost:3456` in a browser. Create a new project scan session. On the Configure step, verify:
- CodeGraph status card appears with green "Ready" state
- File/symbol counts are displayed
- "Re-index" button is visible

- [ ] **Step 4: Test scan log streaming**

Navigate to the Progress page for the project scan session. Start the scan. Verify:
- Scan log panel appears and auto-expands
- Log entries stream in with timestamps
- Server console also shows the same log messages
- Scan completes and tasks appear

- [ ] **Step 5: Verify fallback when codegraph unavailable**

In the wizard, enter a directory without `.codegraph/` (e.g., `/tmp`). Verify the "Not Initialized" or "Not Available" state appears correctly.

- [ ] **Step 6: Commit any fixes found during testing**
