# Smart Grouping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign project scan chunking to use codegraph dependency data + LLM-driven intelligent grouping, with a new Group wizard step for user review and adjustment.

**Architecture:** After scanning, the server writes `graph-data.json` with codegraph dependency data. A new "Group" wizard step shows the data and prompts the user to run `group <session-id>` in the AI terminal. An LLM sub-agent reads `graph-data.json`, decides logical groupings, writes `groups.json`. The UI polls for `groups.json`, shows group cards the user can adjust, then confirms to generate review task YAMLs.

**Tech Stack:** Node.js (ESM), codegraph CLI, vanilla JS frontend, YAML file storage

---

### Task 1: Add `scanned` and `grouping` to session statuses

**Files:**
- Modify: `skills/audit/scripts/lib/session.mjs:6,92-99`

- [ ] **Step 1: Update VALID_STATUSES array**

In `skills/audit/scripts/lib/session.mjs`, line 6, change:

```javascript
const VALID_STATUSES = ["created", "scoped", "ready", "scanning", "reviewing", "completed"];
```

to:

```javascript
const VALID_STATUSES = ["created", "scanned", "scoped", "ready", "scanning", "grouping", "reviewing", "completed"];
```

- [ ] **Step 2: Update transition map**

In the same file, update the `transitions` object (around line 92) to add new states:

```javascript
const transitions = {
  created: ["scoped", "scanning", "ready"],
  scanned: ["grouping", "ready"],
  grouping: ["scanned", "ready"],
  scoped: ["ready"],
  scanning: ["ready", "scanned"],
  ready: ["reviewing"],
  reviewing: ["completed"],
  completed: [],
};
```

This allows:
- `scanning → scanned` (after graph data collection)
- `scanned → grouping` (when sub-agent starts)
- `grouping → scanned` (when sub-agent finishes)
- `scanned → ready` (if using classic mode or direct confirm)
- `scanning → ready` (backward compat for classic mode)

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/lib/session.mjs
git commit -m "feat: add scanned/grouping statuses to session state machine"
```

---

### Task 2: Add `collectGraphData` function to project-scan.mjs

**Files:**
- Modify: `skills/audit/scripts/lib/project-scan.mjs:1-10` (imports), add new function after `resetCodegraphCache`

- [ ] **Step 1: Add `collectGraphData` function**

Add this function after `resetCodegraphCache` (after line 180) in `skills/audit/scripts/lib/project-scan.mjs`:

```javascript
export function collectGraphData(projectDir, reportsDir, sid) {
  const safeSid = sid;
  const sessionDir = path.join(reportsDir, safeSid);
  const startTime = Date.now();
  pushLog(safeSid, "info", `collectGraphData: starting for ${projectDir}`);

  // Run scanProjectDir to get file list
  const files = scanProjectDir(projectDir, {}, safeSid);

  // Classify entry files
  const entryFiles = [];
  for (const f of files) {
    const entryType = classifyEntryType(f.path);
    if (entryType !== "unknown") {
      entryFiles.push({ path: f.path, type: entryType });
    }
  }

  pushLog(safeSid, "info", `collectGraphData: ${entryFiles.length} entry points from ${files.length} files`);

  // Collect import edges via codegraph
  const imports = {};
  try {
    const cmd = `codegraph query --json -k import -l 2000 "" -p "${projectDir}"`;
    pushLog(safeSid, "info", `collectGraphData: ${cmd}`);
    const importStart = Date.now();
    const raw = execSync(cmd, { encoding: "utf-8", timeout: 30000, stdio: ["pipe", "pipe", "pipe"] });
    const data = JSON.parse(raw);
    pushLog(safeSid, "info", `collectGraphData: ${data.length} import edges in ${Date.now() - importStart}ms`);

    for (const item of data) {
      const n = item.node;
      const src = n.filePath;
      if (src.includes("worktree")) continue;
      const target = n.qualifiedName || n.name;
      if (!target || target.startsWith("node:")) continue;

      if (!imports[src]) imports[src] = [];
      imports[src].push(target);
    }

    // Deduplicate import arrays
    for (const key of Object.keys(imports)) {
      imports[key] = [...new Set(imports[key])];
    }
  } catch (e) {
    pushLog(safeSid, "warn", `collectGraphData: codegraph import query failed — ${e.message}`);
  }

  // Collect function/method symbols via codegraph
  const symbols = {};
  try {
    const cmd = `codegraph query --json -k function -l 2000 "" -p "${projectDir}"`;
    pushLog(safeSid, "info", `collectGraphData: ${cmd}`);
    const symStart = Date.now();
    const raw = execSync(cmd, { encoding: "utf-8", timeout: 30000, stdio: ["pipe", "pipe", "pipe"] });
    const data = JSON.parse(raw);
    pushLog(safeSid, "info", `collectGraphData: ${data.length} function symbols in ${Date.now() - symStart}ms`);

    for (const item of data) {
      const n = item.node;
      const filePath = n.filePath;
      if (filePath.includes("worktree")) continue;
      if (!symbols[filePath]) symbols[filePath] = [];
      symbols[filePath].push({
        name: n.name,
        kind: n.kind || "function",
        signature: n.signature || "",
      });
    }
  } catch (e) {
    pushLog(safeSid, "warn", `collectGraphData: codegraph function query failed — ${e.message}`);
  }

  const graphData = {
    projectDir,
    totalFiles: files.length,
    files: files.map(f => ({
      path: f.path,
      priority: f.priority,
      entryType: classifyEntryType(f.path),
    })),
    imports,
    symbols,
    entryFiles,
  };

  // Write to .audit/<sid>/graph-data.json
  fs.mkdirSync(sessionDir, { recursive: true });
  const graphDataPath = path.join(sessionDir, "graph-data.json");
  fs.writeFileSync(graphDataPath, JSON.stringify(graphData, null, 2), "utf-8");

  pushLog(safeSid, "info", `collectGraphData: wrote graph-data.json (${files.length} files, ${Object.keys(imports).length} import sources, ${Object.keys(symbols).length} symbol sources) in ${Date.now() - startTime}ms`);
  return graphData;
}
```

- [ ] **Step 2: Commit**

```bash
git add skills/audit/scripts/lib/project-scan.mjs
git commit -m "feat: add collectGraphData function for codegraph dependency extraction"
```

---

### Task 3: Add `generateTasksFromGroups` function to project-scan.mjs

**Files:**
- Modify: `skills/audit/scripts/lib/project-scan.mjs`, add after `collectGraphData`

- [ ] **Step 1: Add `generateTasksFromGroups` function**

Add this function after `collectGraphData` in `skills/audit/scripts/lib/project-scan.mjs`:

```javascript
export function generateTasksFromGroups(reportsDir, sid) {
  const safeSid = sanitizePath(sid);
  const sessionDir = path.join(reportsDir, safeSid);
  const groupsPath = path.join(sessionDir, "groups.json");
  const indexPath = path.join(sessionDir, "index.yaml");

  if (!fs.existsSync(groupsPath)) {
    throw new Error("groups.json not found — run grouping first");
  }

  const groups = JSON.parse(fs.readFileSync(groupsPath, "utf-8"));
  pushLog(safeSid, "info", `generateTasksFromGroups: ${groups.length} groups`);

  const tasksDir = path.join(sessionDir, "project-tasks");
  fs.mkdirSync(tasksDir, { recursive: true });

  const tasks = [];
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const tf = `group-${String(i + 1).padStart(3, "0")}.yaml`;
    const entryFile = group.entryFiles && group.entryFiles.length > 0 ? group.entryFiles[0] : null;
    writeProjectTaskYaml(path.join(tasksDir, tf), {
      name: group.name || `Group ${i + 1}`,
      type: group.type || "unknown",
      entry: entryFile,
      files: group.files || [],
    });
    tasks.push({
      file: "project-tasks/" + tf,
      status: "pending",
      type: group.type || "unknown",
      entry: entryFile,
    });
  }

  // Write project-map.yaml
  writeYaml(path.join(sessionDir, "project-map.yaml"), {
    projectDir: groups.projectDir || null,
    totalFiles: groups.totalFiles || tasks.reduce((sum, t) => sum, 0),
    scannedFiles: groups.totalFiles || 0,
    excludedDirs: [],
    groups: groups.map((g, i) => ({
      id: `group-${String(i + 1).padStart(3, "0")}`,
      name: g.name || `Group ${i + 1}`,
      type: g.type || "unknown",
      files: g.files || [],
      fileCount: (g.files || []).length,
      rationale: g.rationale || "",
    })),
  });

  // Update index.yaml with projectTasks
  const index = readYaml(indexPath);
  writeIndexYaml(indexPath, {
    session: {
      ...index.session,
      type: "project",
      scope: { method: "directory-scan", ref: "" },
    },
    codeTasks: index.codeTasks || [],
    storyTasks: index.storyTasks || [],
    projectTasks: tasks,
  });

  pushLog(safeSid, "info", `generateTasksFromGroups: ${tasks.length} tasks generated`);
  return { taskCount: tasks.length };
}
```

- [ ] **Step 2: Commit**

```bash
git add skills/audit/scripts/lib/project-scan.mjs
git commit -m "feat: add generateTasksFromGroups for converting groups.json to task YAMLs"
```

---

### Task 4: Modify `setProjectScope` to support scan mode

**Files:**
- Modify: `skills/audit/scripts/lib/project-scan.mjs:291-353`

- [ ] **Step 1: Add mode parameter to `setProjectScope`**

Replace the existing `setProjectScope` function (starting at line 291) with:

```javascript
export function setProjectScope(projectDir, reportsDir, sid, scanOptions = {}) {
  const safeSid = sanitizePath(sid);
  const sessionDir = path.join(reportsDir, safeSid);
  const indexPath = path.join(sessionDir, "index.yaml");
  if (!fs.existsSync(indexPath)) throw new Error("Session not found: " + safeSid);

  const mode = scanOptions.mode || "classic";
  const startTime = Date.now();
  resetCodegraphCache();
  pushLog(safeSid, "info", `setProjectScope: starting scan of ${projectDir} (mode: ${mode})`);

  // Update index to mark as project type
  const index = readYaml(indexPath);
  writeIndexYaml(indexPath, {
    session: {
      ...index.session,
      type: "project",
      scope: { method: "directory-scan", ref: "" },
      projectDir,
    },
    codeTasks: index.codeTasks || [],
    storyTasks: index.storyTasks || [],
    projectTasks: index.projectTasks || [],
  });

  if (mode === "scan") {
    // New flow: scan + collect graph data, return without generating tasks
    const graphData = collectGraphData(projectDir, reportsDir, safeSid);
    pushLog(safeSid, "info", `setProjectScope (scan): ${graphData.totalFiles} files scanned in ${Date.now() - startTime}ms`);
    return {
      taskCount: 0,
      totalFiles: graphData.totalFiles,
      entryFiles: graphData.entryFiles.length,
      hasGraph: Object.keys(graphData.imports).length > 0,
      mode: "scan",
    };
  }

  // Classic flow: scan + chunk + generate tasks
  const files = scanProjectDir(projectDir, scanOptions, safeSid);
  const chunks = chunkFiles(files, projectDir, safeSid);
  const exclude = new Set(scanOptions.excludeFiles || []);

  const tasksDir = path.join(sessionDir, "project-tasks");
  fs.mkdirSync(tasksDir, { recursive: true });

  const tasks = [];
  for (const chunk of chunks) {
    const filtered = chunk.files.filter(f => !exclude.has(f));
    if (filtered.length === 0) continue;
    const tf = chunk.id + ".yaml";
    writeProjectTaskYaml(path.join(tasksDir, tf), {
      name: chunk.name,
      type: chunk.type || "unknown",
      entry: chunk.entry || null,
      files: filtered,
    });
    tasks.push({ file: "project-tasks/" + tf, status: "pending" });
  }

  writeYaml(path.join(sessionDir, "project-map.yaml"), {
    projectDir,
    totalFiles: files.length,
    scannedFiles: files.length,
    excludedDirs: [...(scanOptions.excludeDirs || [])],
    chunks: chunks.map(c => ({
      id: c.id,
      name: c.name,
      type: c.type,
      entry: c.entry,
      files: c.files,
      priority: c.priority,
      fileCount: c.fileCount,
    })),
  });

  const idx = readYaml(indexPath);
  writeIndexYaml(indexPath, {
    session: {
      ...idx.session,
      type: "project",
      scope: { method: "directory-scan", ref: "" },
      projectDir,
    },
    codeTasks: idx.codeTasks || [],
    storyTasks: idx.storyTasks || [],
    projectTasks: tasks,
  });

  pushLog(safeSid, "info", `setProjectScope (classic): ${tasks.length} tasks from ${files.length} files in ${Date.now() - startTime}ms`);
  return { taskCount: tasks.length, totalFiles: files.length, chunks, mode: "classic" };
}
```

Note: `graphData` variable name is used to avoid conflict with `data` in the import parse loop inside `collectGraphData`.

- [ ] **Step 2: Commit**

```bash
git add skills/audit/scripts/lib/project-scan.mjs
git commit -m "feat: add scan mode to setProjectScope for graph-data collection"
```

---

### Task 5: Add server endpoints for graph-data, groups, and confirm

**Files:**
- Modify: `skills/audit/scripts/server/handlers/project-scan.mjs`

- [ ] **Step 1: Add new imports**

At the top of `skills/audit/scripts/server/handlers/project-scan.mjs`, update the import line:

```javascript
import { setProjectScope, getProjectMap, getScanLogs, generateTasksFromGroups } from "../../lib/project-scan.mjs";
```

- [ ] **Step 2: Modify POST /api/sessions/:id/scan to use scan mode**

In the POST `/api/sessions/:id/scan` handler, change the `setProjectScope` call (around line 37) and the status update after it:

```javascript
result = setProjectScope(targetDir, reportsDir, safeSid, { mode: "scan" });
```

And change the post-scan status from `ready` to `scanned`:

```javascript
// Update status to scanned (waiting for grouping)
const updated = readYaml(indexPath);
updated.session.status = "scanned";
writeIndexYaml(indexPath, updated);
```

- [ ] **Step 3: Add scanned/grouping status handling to GET scan/status**

In the `GET /api/sessions/:id/scan/status` handler, add cases for `scanned` and `grouping` after the `scanning` case (around line 70):

```javascript
if (status === "scanned") {
  const graphDataPath = path.join(sessionDir, "graph-data.json");
  let graphInfo = {};
  if (fs.existsSync(graphDataPath)) {
    const gd = JSON.parse(fs.readFileSync(graphDataPath, "utf-8"));
    graphInfo = { totalFiles: gd.totalFiles, entryFiles: gd.entryFiles?.length || 0, hasGraph: Object.keys(gd.imports || {}).length > 0 };
  }
  jsonResponse(res, { status: "scanned", ...graphInfo });
} else if (status === "grouping") {
  jsonResponse(res, { status: "grouping", progress: "AI is analyzing dependencies..." });
} else if (status === "scanning") {
```

- [ ] **Step 4: Add GET graph-data endpoint**

After the `scan/status` handler, add:

```javascript
// GET /api/sessions/:id/graph-data
router.get("/api/sessions/:id/graph-data", (req, res, params) => {
  try {
    const safeSid = sanitizePath(params.id);
    const graphDataPath = path.join(reportsDir, safeSid, "graph-data.json");
    if (!fs.existsSync(graphDataPath)) {
      return errorResponse(res, "Graph data not found", "NOT_FOUND", 404);
    }
    const data = JSON.parse(fs.readFileSync(graphDataPath, "utf-8"));
    jsonResponse(res, data);
  } catch (e) {
    if (e.message.includes("Invalid path")) return errorResponse(res, e.message, "VALIDATION_ERROR", 400);
    throw e;
  }
});
```

- [ ] **Step 5: Add GET groups endpoint**

```javascript
// GET /api/sessions/:id/groups
router.get("/api/sessions/:id/groups", (req, res, params) => {
  try {
    const safeSid = sanitizePath(params.id);
    const groupsPath = path.join(reportsDir, safeSid, "groups.json");
    if (!fs.existsSync(groupsPath)) {
      return jsonResponse(res, { status: "pending" });
    }
    const groups = JSON.parse(fs.readFileSync(groupsPath, "utf-8"));
    jsonResponse(res, { status: "ready", groups });
  } catch (e) {
    if (e.message.includes("Invalid path")) return errorResponse(res, e.message, "VALIDATION_ERROR", 400);
    throw e;
  }
});
```

- [ ] **Step 6: Add PUT groups endpoint**

```javascript
// PUT /api/sessions/:id/groups
router.put("/api/sessions/:id/groups", async (req, res, params) => {
  try {
    const safeSid = sanitizePath(params.id);
    const sessionDir = path.join(reportsDir, safeSid);
    const groupsPath = path.join(sessionDir, "groups.json");
    if (!fs.existsSync(path.join(sessionDir, "index.yaml"))) {
      return errorResponse(res, "Session not found", "NOT_FOUND", 404);
    }

    let body = "";
    for await (const chunk of req) body += chunk;
    const data = JSON.parse(body);
    if (!data.groups || !Array.isArray(data.groups)) {
      return errorResponse(res, "groups array required", "VALIDATION_ERROR", 400);
    }

    fs.writeFileSync(groupsPath, JSON.stringify(data.groups, null, 2), "utf-8");
    jsonResponse(res, { ok: true });
  } catch (e) {
    if (e.message.includes("Invalid path")) return errorResponse(res, e.message, "VALIDATION_ERROR", 400);
    throw e;
  }
});
```

- [ ] **Step 7: Add POST groups/confirm endpoint**

```javascript
// POST /api/sessions/:id/groups/confirm
router.post("/api/sessions/:id/groups/confirm", async (req, res, params) => {
  try {
    const safeSid = sanitizePath(params.id);
    const sessionDir = path.join(reportsDir, safeSid);
    const indexPath = path.join(sessionDir, "index.yaml");
    if (!fs.existsSync(indexPath)) {
      return errorResponse(res, "Session not found", "NOT_FOUND", 404);
    }

    const result = generateTasksFromGroups(reportsDir, safeSid);

    // Set status to ready
    const index = readYaml(indexPath);
    index.session.status = "ready";
    writeIndexYaml(indexPath, index);

    jsonResponse(res, { ok: true, ...result });
  } catch (e) {
    if (e.message.includes("not found")) return errorResponse(res, e.message, "NOT_FOUND", 404);
    if (e.message.includes("Invalid path")) return errorResponse(res, e.message, "VALIDATION_ERROR", 400);
    throw e;
  }
});
```

- [ ] **Step 8: Commit**

```bash
git add skills/audit/scripts/server/handlers/project-scan.mjs
git commit -m "feat: add graph-data, groups, and confirm endpoints for smart grouping"
```

---

### Task 6: Add frontend API methods

**Files:**
- Modify: `skills/audit/scripts/public/js/api.mjs:77-92`

- [ ] **Step 1: Add new API methods**

In `skills/audit/scripts/public/js/api.mjs`, after the existing CodeGraph section (after line 91), add:

```javascript
  // Smart Grouping
  getGraphData: (id) =>
    request("GET", `/api/sessions/${encodeURIComponent(id)}/graph-data`),
  getGroups: (id) =>
    request("GET", `/api/sessions/${encodeURIComponent(id)}/groups`),
  updateGroups: (id, groups) =>
    request("PUT", `/api/sessions/${encodeURIComponent(id)}/groups`, { groups }),
  confirmGroups: (id) =>
    request("POST", `/api/sessions/${encodeURIComponent(id)}/groups/confirm`),
```

- [ ] **Step 2: Commit**

```bash
git add skills/audit/scripts/public/js/api.mjs
git commit -m "feat: add getGraphData, getGroups, updateGroups, confirmGroups API methods"
```

---

### Task 7: Add Group step to wizard

**Files:**
- Modify: `skills/audit/scripts/public/js/views/wizard.mjs:215-252,408-431`

- [ ] **Step 1: Update step labels for project type**

In the `render()` function inside `renderWizard`, change the step labels calculation (around line 216-220):

```javascript
    const stepLabels = reviewType === "all"
      ? ["Review Type", "Scope", "Stories", "Ready"]
      : reviewType === "project"
        ? ["Review Type", "Configure", "Group", "Ready"]
        : ["Review Type", "Scope", "Ready"];
```

And update the totalSteps:

```javascript
    const totalSteps = reviewType === "all" ? 4 : (reviewType === "project" ? 4 : 3);
```

- [ ] **Step 2: Update render dispatcher for new step numbers**

In the same `render()` function, update the step dispatching (around line 244-252). The project flow now has 4 steps: step 2 = Configure, step 3 = Group, step 4 = Ready:

```javascript
    if (step === 1) renderStep1();
    else if (step === 2 && reviewType === "project") renderProjectConfigure();
    else if (step === 2) renderStep2();
    else if (step === 3 && reviewType === "project") renderGroupStep();
    else if (step === 3 && reviewType === "all") renderStep3();
    else if (step === 3 && reviewType === "code") renderStep4();
    else if (step === 4 && reviewType === "project") renderProjectReady();
    else if (step === 4) renderStep4();
    else renderStep4();
```

- [ ] **Step 3: Update project-next button to go to step 3**

In `renderProjectConfigure()`, the "Next" button currently sets `step = 3`. Since we added a new step, it should now also go to step 3 (Group step). The existing code at line 423 already does `step = 3` — this is correct since the Group step is now step 3.

- [ ] **Step 4: Update renderProjectReady to use step 4**

In `renderProjectReady()`, the back button should go to step 3 (Group step), not step 2. Update the back button handler. Change line 462:

```javascript
document.getElementById("project-ready-back").addEventListener("click", () => { step = 3; save(); render(); });
```

- [ ] **Step 5: Add `renderGroupStep()` function**

Add this new function after `renderProjectConfigure` and before `renderProjectReady` in `wizard.mjs`:

```javascript
  function renderGroupStep() {
    const content = document.getElementById("wizard-content");
    content.innerHTML = `
      <div class="card mb-4">
        <h2 class="font-semibold mb-4">Group Files</h2>
        <div id="group-step-content">
          <div class="text-sm text-secondary"><span class="spinner spinner-sm"></span> Loading scan data...</div>
        </div>
      </div>
      <div class="flex justify-between">
        <button id="group-back" class="btn btn-ghost">${icon("arrowLeft", 14)} Back</button>
        <button id="group-confirm-btn" class="btn btn-primary" disabled>Confirm Groups ${icon("check", 14)}</button>
      </div>`;

    document.getElementById("group-back").addEventListener("click", () => { step = 2; save(); render(); });

    let groups = null;
    let pollTimer = null;

    function pollForGroups() {
      api.getGroups(sessionId).then(data => {
        if (data.status === "ready" && data.groups && data.groups.length > 0) {
          groups = data.groups;
          renderGroupsLoaded();
        } else {
          renderPending();
        }
      }).catch(() => renderPending());
    }

    function renderPending() {
      const el = document.getElementById("group-step-content");
      api.getGraphData(sessionId).then(graphData => {
        const entryList = (graphData.entryFiles || []).slice(0, 8);
        const moreCount = Math.max(0, (graphData.entryFiles || []).length - 8);
        el.innerHTML = `
          <div class="space-y-4">
            <div class="text-sm text-secondary">
              Scan complete — <strong>${graphData.totalFiles || 0}</strong> files found, <strong>${(graphData.entryFiles || []).length}</strong> entry points
            </div>
            ${entryList.length > 0 ? `
            <div class="group-entry-list">
              <div class="text-xs font-semibold text-muted mb-2" style="text-transform:uppercase;letter-spacing:0.5px">Entry Points</div>
              ${entryList.map(e => `
                <div class="group-entry-item">
                  <span class="entry-file-badge entry-type-${e.type}">${e.type}</span>
                  <span class="text-sm font-mono">${escapeHtml(e.path)}</span>
                </div>
              `).join("")}
              ${moreCount > 0 ? `<div class="text-xs text-muted mt-1">... ${moreCount} more</div>` : ""}
            </div>` : ""}
            <div class="info-banner info-banner-amber">
              ${icon("terminal", 16)}
              <span>Go to your AI terminal and type: <code>group ${escapeHtml(sessionId)}</code></span>
            </div>
            <div class="flex items-center gap-2 text-sm text-muted">
              <span class="spinner spinner-sm"></span> Waiting for grouping...
            </div>
          </div>`;
      }).catch(() => {
        el.innerHTML = `
          <div class="info-banner info-banner-amber">
            ${icon("terminal", 16)}
            <span>Go to your AI terminal and type: <code>group ${escapeHtml(sessionId)}</code></span>
          </div>
          <div class="flex items-center gap-2 text-sm text-muted mt-3">
            <span class="spinner spinner-sm"></span> Waiting for grouping...
          </div>`;
      });

      // Poll every 3 seconds
      pollTimer = setTimeout(pollForGroups, 3000);
    }

    function renderGroupsLoaded() {
      if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
      const el = document.getElementById("group-step-content");
      const confirmBtn = document.getElementById("group-confirm-btn");

      el.innerHTML = `
        <div class="text-sm text-secondary mb-4">
          <strong>${groups.length}</strong> groups generated — review and adjust if needed
        </div>
        <div class="space-y-3" id="group-cards">
          ${groups.map((g, i) => `
            <div class="group-card" data-group-index="${i}">
              <div class="group-card-header" data-index="${i}">
                <div class="group-card-info">
                  <div class="group-card-title">
                    ${icon("package", 16)}
                    <span class="font-medium">${escapeHtml(g.name || "Group " + (i + 1))}</span>
                    <span class="text-xs text-muted">(${(g.files || []).length} files)</span>
                  </div>
                  ${g.rationale ? `<div class="group-rationale">${escapeHtml(g.rationale)}</div>` : ""}
                </div>
                <span class="group-chevron">${icon("chevronDown", 14)}</span>
              </div>
              <div class="group-card-body" id="group-body-${i}" style="display:none">
                ${(g.files || []).map(f => {
                  const isEntry = (g.entryFiles || []).includes(f);
                  return `<div class="group-file-item">
                    <label class="checkbox-toggle">
                      <input type="checkbox" data-file="${escapeHtml(f)}" ${isEntry ? "checked disabled" : "checked"}>
                      <span class="text-sm font-mono ${isEntry ? "text-accent" : ""}">${escapeHtml(f)}</span>
                      ${isEntry ? '<span class="entry-file-badge entry-type-api ml-2">entry</span>' : ""}
                    </label>
                  </div>`;
                }).join("")}
              </div>
            </div>
          `).join("")}
        </div>`;

      confirmBtn.disabled = false;

      // Wire up card expand/collapse
      el.querySelectorAll(".group-card-header").forEach(header => {
        header.addEventListener("click", () => {
          const idx = header.dataset.index;
          const body = document.getElementById(`group-body-${idx}`);
          const card = header.closest(".group-card");
          const isVisible = body.style.display !== "none";
          body.style.display = isVisible ? "none" : "block";
          card.classList.toggle("expanded", !isVisible);
        });
      });

      // Wire up confirm button
      confirmBtn.addEventListener("click", async () => {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<span class="spinner spinner-sm"></span> Confirming...';
        try {
          await api.confirmGroups(sessionId);
          step = 4;
          save();
          render();
        } catch (e) {
          showToast("Failed to confirm groups: " + e.message);
          confirmBtn.disabled = false;
          confirmBtn.innerHTML = `Confirm Groups ${icon("check", 14)}`;
        }
      });
    }

    // Start by polling
    pollForGroups();
  }
```

- [ ] **Step 6: Commit**

```bash
git add skills/audit/scripts/public/js/views/wizard.mjs
git commit -m "feat: add Group wizard step with pending/loaded states and group cards"
```

---

### Task 8: Add group-card styles

**Files:**
- Modify: `skills/audit/scripts/public/styles.css`

- [ ] **Step 1: Add CSS after scan-log styles**

Append to the end of `styles.css` (after the `@keyframes logFadeIn` block):

```css

/* ─── Group Card ─── */
.group-card {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
  transition: border-color var(--duration-fast) var(--ease-spring);
}
.group-card:hover { border-color: var(--border-hover); }
.group-card.expanded { border-color: var(--border-accent); }
.group-card-header {
  display: flex; align-items: center; gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  cursor: pointer;
  background: var(--bg-surface);
  transition: background var(--duration-fast) var(--ease-spring);
  user-select: none;
}
.group-card-header:hover { background: var(--bg-elevated); }
.group-card-info { flex: 1; min-width: 0; }
.group-card-title {
  display: flex; align-items: center; gap: var(--space-2);
  font-size: var(--text-sm);
}
.group-rationale {
  font-size: var(--text-xs); color: var(--text-muted);
  margin-top: var(--space-1);
  font-style: italic;
}
.group-chevron {
  color: var(--text-muted);
  transition: transform var(--duration-fast) var(--ease-spring);
  flex-shrink: 0;
}
.group-card.expanded .group-chevron { transform: rotate(180deg); }
.group-card-body {
  border-top: 1px solid var(--border);
  background: var(--bg-base);
  padding: var(--space-2) var(--space-4);
  max-height: 300px;
  overflow-y: auto;
}
.group-file-item {
  padding: var(--space-1) 0;
}
.group-file-item .checkbox-toggle {
  font-size: var(--text-xs);
}
.group-file-item .text-sm {
  font-size: var(--text-xs);
}

/* ─── Entry File Badge ─── */
.entry-file-badge {
  display: inline-block;
  padding: 1px 8px;
  border-radius: var(--radius-full);
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.entry-type-api { background: var(--info-dim); color: var(--info-hover); }
.entry-type-scheduled { background: var(--warning-dim); color: var(--warning); }
.entry-type-consumer { background: var(--purple-dim); color: var(--purple); }
.entry-type-script { background: var(--success-dim); color: var(--success); }
.entry-type-unknown { background: var(--bg-active); color: var(--text-muted); }

/* ─── Group Entry List ─── */
.group-entry-list {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-3);
}
.group-entry-item {
  display: flex; align-items: center; gap: var(--space-2);
  padding: var(--space-1) 0;
  font-size: var(--text-sm);
}
```

- [ ] **Step 2: Commit**

```bash
git add skills/audit/scripts/public/styles.css
git commit -m "feat: add group-card, entry-file-badge, and group-entry-list styles"
```

---

### Task 9: Create grouping sub-agent prompt

**Files:**
- Create: `skills/audit/prompts/project-group.md`

- [ ] **Step 1: Create the prompt file**

Create `skills/audit/prompts/project-group.md`:

```markdown
---
name: project-group
description: Groups project files into logical review modules based on dependency analysis
---

# Project File Grouping

You are a code analysis agent. Your task is to group project files into logical review modules based on dependency data.

## Input

Read the file `.audit/{{session-id}}/graph-data.json`. It contains:

- `projectDir`: the project root directory
- `totalFiles`: total number of scanned files
- `files[]`: array of `{ path, priority, entryType }` for each file
- `imports`: map of source file → array of import target paths
- `symbols`: map of file → array of `{ name, kind, signature }` for exported symbols
- `entryFiles[]`: array of `{ path, type }` for detected entry points (api, scheduled, consumer, script)

Also read `.audit/{{session-id}}/review-context.md` if it exists, for user-provided context about the project.

## Task

Analyze the dependency graph and group files into logical review modules. Each group should represent a cohesive unit of functionality.

## Grouping Guidelines

1. **Shared dependencies → merge**: If two entry points share the same service, DAO, or model files, they likely belong in the same group.
2. **Business domain grouping**: Group by business domain (e.g., "Order Management", "Payment Processing") rather than technical layer.
3. **Size target**: Aim for 5-15 files per group. If a group exceeds 20 files, consider splitting by sub-domain. Groups under 3 files are acceptable only if they form a truly independent module.
4. **Entry files belong together**: Multiple entry files (controllers) that serve the same business domain should be in the same group.
5. **Support files follow**: Utilities, models, and shared code should go with the group that most uses them. If shared across multiple groups, assign to the group with the strongest dependency.
6. **Every file in exactly one group**: No file may appear in multiple groups or be left out.
7. **Preserve entry file associations**: Entry files must remain in groups that include their full dependency chain where possible.

## Output

Write `.audit/{{session-id}}/groups.json` with this structure:

```json
[
  {
    "name": "Order Management",
    "type": "api",
    "files": [
      "controllers/OrderController.java",
      "controllers/OrderAdminController.java",
      "services/OrderService.java",
      "models/Order.java",
      "dao/OrderDAO.java"
    ],
    "entryFiles": [
      "controllers/OrderController.java",
      "controllers/OrderAdminController.java"
    ],
    "rationale": "OrderController and OrderAdminController share OrderService, Order model, and OrderDAO — grouped as the order management module."
  }
]
```

## Constraints

- The output must be valid JSON (array of group objects).
- Every file from `files[]` in graph-data.json must appear in exactly one group's `files` array.
- `entryFiles` must be a subset of `files` for each group.
- Group names should be human-readable and describe the business domain.
- The `rationale` field should briefly explain why these files were grouped together.

## Process

1. Read `graph-data.json`
2. Read `review-context.md` (if exists)
3. Build a dependency graph from `imports`
4. Identify clusters of entry points that share common dependencies
5. Assign non-entry files to the cluster with the strongest dependency
6. Handle remaining unassigned files by directory proximity
7. Validate: every file assigned, no duplicates
8. Write `groups.json`
```

- [ ] **Step 2: Commit**

```bash
git add skills/audit/prompts/project-group.md
git commit -m "feat: add project-group prompt for LLM-driven file grouping"
```

---

### Task 10: Add grouping flow to SKILL.md

**Files:**
- Modify: `skills/audit/SKILL.md`

- [ ] **Step 1: Add section 4.5**

In `skills/audit/SKILL.md`, add a new section between section 4 (Project Scan Loop) and section 5. Insert after line 56:

```markdown

### 4.5. Project Grouping (if type === "project" and status === "scanned")

When user types "group <session-id>":

1. `GET /api/sessions/<session-id>` — confirm status is `scanned`
2. `PUT /api/sessions/<session-id>/status` with `{ status: "grouping" }`
3. Dispatch a sub-agent with `prompts/project-group.md`, passing session-id as context. The sub-agent:
   - Reads `.audit/<session-id>/graph-data.json`
   - Analyzes the dependency graph
   - Groups files into logical modules
   - Writes `.audit/<session-id>/groups.json`
4. After sub-agent completes, the web UI will poll and detect `groups.json`
5. User reviews and adjusts groups in the browser UI
6. User clicks "Confirm Groups" which triggers task generation
7. Tell user: "Grouping complete. Review and adjust groups at http://localhost:3456."

```

- [ ] **Step 2: Commit**

```bash
git add skills/audit/SKILL.md
git commit -m "feat: add project grouping section (4.5) to SKILL.md"
```

---

### Task 11: Update scan/status handler to handle new session types in home view

**Files:**
- Modify: `skills/audit/scripts/public/js/views/progress.mjs` (scan status handling)

- [ ] **Step 1: Add scanned status badge style**

In `skills/audit/scripts/public/styles.css`, add after the existing badge styles (after `.badge-scanning`):

```css
.badge-scanned {
  background: rgba(59, 130, 246, 0.1);
  color: var(--info);
  border: 1px solid rgba(59, 130, 246, 0.3);
}
.badge-grouping {
  background: var(--purple-dim);
  color: var(--purple);
  border: 1px solid rgba(167, 139, 250, 0.3);
}
```

- [ ] **Step 2: Add scanned/grouping handling in progress view poll function**

In `skills/audit/scripts/public/js/views/progress.mjs`:

First, update the `updateHeading` function (around line 69-88) to handle the new phases. After the `scanning` case block and before the `else`:

```javascript
      } else if (phase === "scanned") {
        heading.textContent = "Scan Complete";
        subtitle.textContent = "Ready for file grouping.";
      } else if (phase === "grouping") {
        heading.textContent = "Grouping Files";
        subtitle.textContent = "AI is analyzing dependencies...";
```

Then, in the `poll()` function, line 139 checks for `created` and `scanning` states. Change:

```javascript
if (session.type === "project" && (session.status === "created" || session.status === "scanning")) {
```

to:

```javascript
if (session.type === "project" && ["created", "scanning", "scanned", "grouping"].includes(session.status)) {
```

Then add handling for the new states after the `scanning` block (after line 158) and before the closing `}` of the if block:

```javascript
        if (session.status === "scanned") {
          startBtn.classList.add("hidden");
          scanStatusEl.classList.remove("hidden");
          scanStatusEl.textContent = "Scan complete. Go to the wizard to group files and confirm.";
          updateHeading(true, "scanned");
          document.getElementById("session-badge").innerHTML = `<span class="badge badge-scanned">scanned</span>`;
        } else if (session.status === "grouping") {
          startBtn.classList.add("hidden");
          scanStatusEl.classList.remove("hidden");
          scanStatusEl.textContent = "AI is analyzing dependencies and grouping files...";
          updateHeading(true, "grouping");
          document.getElementById("session-badge").innerHTML = `<span class="badge badge-grouping">grouping</span>`;
        }
```

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/public/styles.css skills/audit/scripts/public/js/views/progress.mjs
git commit -m "feat: add scanned/grouping badge styles and progress view status handling"
```

---

### Task 12: End-to-end test with a real project scan session

**Files:**
- No files to modify

- [ ] **Step 1: Start the server and test the full flow**

1. Start the audit server: `cd skills/audit && node scripts/cli.mjs server`
2. Open `http://localhost:3456` in browser
3. Create a new project scan session
4. In the Configure step, set project dir and verify CodeGraph status shows
5. Click Next — should land on the Group step
6. Verify the pending state shows entry points and the `group <session-id>` command
7. In the Group step, the UI should poll and show "Waiting for grouping..."

This verifies the scan → scanned transition and the new Group step rendering work correctly.

- [ ] **Step 2: Commit any remaining changes**

```bash
git status
# If any uncommitted changes remain, commit them
```
