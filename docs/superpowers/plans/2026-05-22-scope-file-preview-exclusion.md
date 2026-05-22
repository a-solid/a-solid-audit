# Scope File Preview & Exclusion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a directory tree file preview to the Scope step that auto-loads when the user selects a scope method, allows unchecking files/folders to exclude them, and only generates tasks for included files.

**Architecture:** Backend-first approach: modify `parseDiffByFile` to return change stats, add a preview endpoint, add excludeFiles to the scope endpoint. Then build the frontend: new scope-file-tree component, CSS, API client updates, and wizard Step 2 integration.

**Tech Stack:** Node.js HTTP server, vanilla JS (ES modules), CSS custom properties, git CLI via execFileSync.

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `skills/audit/scripts/lib/git.mjs` | Modify | `parseDiffByFile` returns change stats |
| `skills/audit/scripts/lib/mapping.mjs` | Modify | `setScope` supports excludeFiles, adapts to new parseDiffByFile format |
| `skills/audit/scripts/server/handlers/audit.mjs` | Modify | Add preview handler, update scope handler for excludeFiles |
| `skills/audit/scripts/public/js/api.mjs` | Modify | Add previewScope, update setScope signature |
| `skills/audit/scripts/public/styles.css` | Modify | Add scope file tree styles |
| `skills/audit/scripts/public/js/components/scope-file-tree.mjs` | Create | Directory tree component with checkboxes and change stats |
| `skills/audit/scripts/public/js/views/wizard.mjs` | Modify | Integrate file preview tree into Step 2 with auto-load |

---

### Task 1: Modify parseDiffByFile to Return Change Stats

**Files:**
- Modify: `skills/audit/scripts/lib/git.mjs`

- [ ] **Step 1: Update parseDiffByFile**

Replace the current `parseDiffByFile` function (lines 45-62) with:

```javascript
export function parseDiffByFile(diffOutput) {
  const files = {};
  const lines = diffOutput.split("\n");
  let currentFile = null;
  let currentChunks = [];
  for (const line of lines) {
    const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (match) {
      if (currentFile) {
        const diff = currentChunks.join("\n");
        files[currentFile] = { diff, ...countChanges(diff) };
      }
      currentFile = match[2].trim();
      currentChunks = [line];
    } else if (currentFile) {
      currentChunks.push(line);
    }
  }
  if (currentFile) {
    const diff = currentChunks.join("\n");
    files[currentFile] = { diff, ...countChanges(diff) };
  }
  return files;
}

function countChanges(diffText) {
  let additions = 0;
  let deletions = 0;
  for (const line of diffText.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) additions++;
    else if (line.startsWith("-") && !line.startsWith("---")) deletions++;
  }
  return { additions, deletions };
}
```

- [ ] **Step 2: Verify syntax**

Run: `node --check skills/audit/scripts/lib/git.mjs`

Expected: No output (success)

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/lib/git.mjs
git commit -m "feat: parseDiffByFile returns change stats (additions/deletions)"
```

---

### Task 2: Update mapping.mjs for New parseDiffByFile Format + excludeFiles

**Files:**
- Modify: `skills/audit/scripts/lib/mapping.mjs`

- [ ] **Step 1: Update setScope signature and loop body**

Replace the current `setScope` function (lines 9-52) with:

```javascript
export function setScope(projectDir, reportsDir, sid, scopeType, scopeRef, excludeFiles = []) {
  const safeSid = sanitizePath(sid);
  const sessionDir = path.join(reportsDir, safeSid);
  const indexPath = path.join(sessionDir, "index.yaml");
  if (!fs.existsSync(indexPath)) throw new Error("Session not found: " + safeSid);

  const diff = runGitDiff(scopeType, scopeRef, projectDir);
  if (!diff.trim()) throw new Error("No diff found for the selected scope");

  const filesMap = parseDiffByFile(diff);
  const exclude = new Set(excludeFiles || []);
  const tasksDir = path.join(sessionDir, "code-tasks");
  fs.mkdirSync(tasksDir, { recursive: true });

  const tasks = [];
  for (const [filePath, fileData] of Object.entries(filesMap)) {
    if (exclude.has(filePath)) continue;
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
    tasks.push({ file: "code-tasks/" + tf, status: "pending" });
  }

  const index = readYaml(indexPath);
  const existingType = index.session.type;
  writeIndexYaml(indexPath, {
    session: {
      id: safeSid,
      type: existingType === "all" ? "all" : "code",
      status: "scoped",
      scope: { method: scopeType, ref: scopeRef || "" },
      created: index.session.created || new Date().toISOString(),
    },
    codeTasks: tasks,
    storyTasks: index.storyTasks || [],
  });

  return { scope: { method: scopeType, ref: scopeRef }, taskCount: tasks.length };
}
```

Key changes from original:
- Added `excludeFiles = []` parameter
- Created `exclude` Set for O(1) lookup
- Skip files in the exclude set before generating tasks
- Access `fileData.diff` instead of raw string (new parseDiffByFile format)

- [ ] **Step 2: Verify syntax**

Run: `node --check skills/audit/scripts/lib/mapping.mjs`

Expected: No output (success)

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/lib/mapping.mjs
git commit -m "feat: setScope supports excludeFiles parameter"
```

---

### Task 3: Add Preview Endpoint and Update Scope Endpoint

**Files:**
- Modify: `skills/audit/scripts/server/handlers/audit.mjs`

- [ ] **Step 1: Add imports and preview handler**

Replace the entire file with:

```javascript
// skills/audit/scripts/server/handlers/audit.mjs
import { getCommits, getBranches, runGitDiff, parseDiffByFile } from "../../lib/git.mjs";
import { setScope } from "../../lib/mapping.mjs";
import { jsonResponse, readBody, errorResponse } from "../index.mjs";

export function registerAuditRoutes(router, projectDir, reportsDir) {
  // GET /api/git/commits — latest 10 commits
  router.get("/api/git/commits", (req, res, params) => {
    try {
      const commits = getCommits(projectDir);
      jsonResponse(res, commits);
    } catch (e) {
      errorResponse(res, "Git error: " + e.message, "VALIDATION_ERROR", 400);
    }
  });

  // GET /api/git/branches — local branch list
  router.get("/api/git/branches", (req, res, params) => {
    try {
      const branches = getBranches(projectDir);
      jsonResponse(res, branches);
    } catch (e) {
      errorResponse(res, "Git error: " + e.message, "VALIDATION_ERROR", 400);
    }
  });

  // POST /api/git/preview — preview diff files with change stats
  router.post("/api/git/preview", async (req, res, params) => {
    try {
      const body = JSON.parse(await readBody(req));
      if (!body || !body.method) {
        return errorResponse(res, "Missing required field: method", "VALIDATION_ERROR", 400);
      }
      if (!["uncommitted", "commits", "branch"].includes(body.method)) {
        return errorResponse(res, "Invalid method. Allowed: uncommitted, commits, branch", "VALIDATION_ERROR", 400);
      }
      if (body.method !== "uncommitted" && !body.ref) {
        return errorResponse(res, "Missing required field: ref", "VALIDATION_ERROR", 400);
      }
      if (body.ref && !/^[a-zA-Z0-9._\-\/\s]+$/.test(body.ref)) {
        return errorResponse(res, "Invalid ref format", "VALIDATION_ERROR", 400);
      }
      const diff = runGitDiff(body.method, body.ref || "", projectDir);
      if (!diff.trim()) {
        return jsonResponse(res, { files: [] });
      }
      const filesMap = parseDiffByFile(diff);
      const files = [];
      for (const [filePath, fileData] of Object.entries(filesMap)) {
        const hasChanges = fileData.diff.split("\n").some(
          l => (l.startsWith("+") && !l.startsWith("+++")) || (l.startsWith("-") && !l.startsWith("---"))
        );
        if (!hasChanges) continue;
        files.push({ path: filePath, additions: fileData.additions, deletions: fileData.deletions });
      }
      jsonResponse(res, { files });
    } catch (e) {
      errorResponse(res, "Preview failed: " + e.message, "INTERNAL_ERROR", 500);
    }
  });

  // POST /api/sessions/:id/scope — set scope, generate code task YAMLs
  router.post("/api/sessions/:id/scope", async (req, res, params) => {
    try {
      const body = JSON.parse(await readBody(req));
      if (!body || !body.method) {
        return errorResponse(res, "Missing required field: method", "VALIDATION_ERROR", 400);
      }
      if (!["uncommitted", "commits", "branch"].includes(body.method)) {
        return errorResponse(res, "Invalid method. Allowed: uncommitted, commits, branch", "VALIDATION_ERROR", 400);
      }
      if (body.method !== "uncommitted" && !body.ref) {
        return errorResponse(res, "Missing required field: ref", "VALIDATION_ERROR", 400);
      }
      if (body.ref && !/^[a-zA-Z0-9._\-\/\s]+$/.test(body.ref)) {
        return errorResponse(res, "Invalid ref format", "VALIDATION_ERROR", 400);
      }
      const excludeFiles = Array.isArray(body.excludeFiles) ? body.excludeFiles : [];
      const result = setScope(projectDir, reportsDir, params.id, body.method, body.ref || "", excludeFiles);
      jsonResponse(res, result);
    } catch (e) {
      if (e.message.includes("No diff found")) return errorResponse(res, e.message, "VALIDATION_ERROR", 400);
      if (e.message.includes("not found")) return errorResponse(res, e.message, "NOT_FOUND", 404);
      throw e;
    }
  });
}
```

- [ ] **Step 2: Verify syntax**

Run: `node --check skills/audit/scripts/server/handlers/audit.mjs`

Expected: No output (success)

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/server/handlers/audit.mjs
git commit -m "feat: add POST /api/git/preview endpoint, scope accepts excludeFiles"
```

---

### Task 4: Update API Client

**Files:**
- Modify: `skills/audit/scripts/public/js/api.mjs`

- [ ] **Step 1: Add previewScope and update setScope**

In `api.mjs`, add `previewScope` after the `setScope` method (after line 38) and update `setScope` to accept `excludeFiles`.

Replace line 37-38:
```javascript
  setScope: (id, method, ref) =>
    request("POST", `/api/sessions/${encodeURIComponent(id)}/scope`, { method, ref }),
```

with:
```javascript
  previewScope: (method, ref) =>
    request("POST", "/api/git/preview", { method, ref }),

  setScope: (id, method, ref, excludeFiles) =>
    request("POST", `/api/sessions/${encodeURIComponent(id)}/scope`, { method, ref, excludeFiles }),
```

- [ ] **Step 2: Verify syntax**

Run: `node --check skills/audit/scripts/public/js/api.mjs`

Expected: No output (success)

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/public/js/api.mjs
git commit -m "feat: add previewScope API, setScope accepts excludeFiles"
```

---

### Task 5: Add Scope File Tree CSS Styles

**Files:**
- Modify: `skills/audit/scripts/public/styles.css`

- [ ] **Step 1: Add scope file tree styles**

Add the following CSS after the `.human-review-unreviewed` rule (before the `/* ─── Print ─── */` comment):

```css
/* ─── Scope File Tree ─── */
.scope-tree-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-3);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md) var(--radius-md) 0 0;
  font-size: var(--text-sm);
}
.scope-tree-select-all {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  cursor: pointer;
  color: var(--text-secondary);
  font-size: var(--text-sm);
}
.scope-tree-select-all:hover { color: var(--text-primary); }
.scope-tree-count {
  font-size: var(--text-xs);
  color: var(--text-muted);
  font-family: var(--font-mono);
}
.scope-tree {
  border: 1px solid var(--border);
  border-top: none;
  border-radius: 0 0 var(--radius-md) var(--radius-md);
  max-height: 320px;
  overflow-y: auto;
  background: var(--bg-surface);
}
.scope-tree-node {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-sm);
  cursor: pointer;
  transition: background var(--duration-fast);
  min-height: 32px;
}
.scope-tree-node:hover { background: var(--bg-hover); }
.scope-tree-node input[type="checkbox"] {
  accent-color: var(--accent);
  width: 14px;
  height: 14px;
  cursor: pointer;
  flex-shrink: 0;
}
.scope-tree-folder-toggle {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  transition: transform var(--duration-fast);
}
.scope-tree-folder-toggle.expanded {
  transform: rotate(90deg);
}
.scope-tree-folder-icon {
  color: var(--text-muted);
  flex-shrink: 0;
}
.scope-tree-folder-name {
  font-weight: 500;
  color: var(--text-secondary);
}
.scope-tree-file-name {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-primary);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.scope-tree-stats {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-muted);
  flex-shrink: 0;
  white-space: nowrap;
}
.scope-tree-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-6);
  color: var(--text-muted);
  font-size: var(--text-sm);
}
```

- [ ] **Step 2: Verify**

Run: `node -e "const c = require('fs').readFileSync('skills/audit/scripts/public/styles.css','utf8'); console.log('CSS loaded, length:', c.length)"`

Expected: `CSS loaded, length: <number>`

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/public/styles.css
git commit -m "style: add scope file tree CSS styles"
```

---

### Task 6: Create Scope File Tree Component

**Files:**
- Create: `skills/audit/scripts/public/js/components/scope-file-tree.mjs`

- [ ] **Step 1: Create the component**

Create file `skills/audit/scripts/public/js/components/scope-file-tree.mjs` with:

```javascript
// skills/audit/scripts/public/js/components/scope-file-tree.mjs
import { escapeHtml, icon } from "../app.mjs";

export function renderScopeFileTree(container, files) {
  let checkedFiles = new Set(files.map(f => f.path));
  let expandedDirs = new Set();
  const allFilePaths = new Set(files.map(f => f.path));

  const tree = buildTree(files);

  function render() {
    const { selected, total } = getCounts();
    container.innerHTML = `
      <div class="scope-tree-header">
        <label class="scope-tree-select-all">
          <input type="checkbox" id="scope-select-all" ${selected === total ? "checked" : ""}>
          <span>Select all</span>
        </label>
        <span class="scope-tree-count">${selected}/${total} files</span>
      </div>
      <div class="scope-tree">
        ${renderNodes(tree.children, 0)}
      </div>`;

    document.getElementById("scope-select-all")?.addEventListener("change", (e) => {
      if (e.target.checked) {
        checkedFiles = new Set(allFilePaths);
      } else {
        checkedFiles = new Set();
      }
      render();
      container.dispatchEvent(new Event("change", { bubbles: true }));
    });

    wireEvents();
  }

  function renderNodes(nodes, depth) {
    if (!nodes || nodes.length === 0) return "";
    return nodes.map(node => {
      const indent = depth * 20;
      if (node.type === "folder") {
        const isExpanded = expandedDirs.has(node.path);
        const isChecked = isFolderChecked(node);
        const isIndeterminate = !isChecked && isFolderPartial(node);
        return `
          <div class="scope-tree-node" data-folder-path="${escapeHtml(node.path)}" style="padding-left:${12 + indent}px">
            <input type="checkbox" data-action="toggle-folder" data-path="${escapeHtml(node.path)}" ${isChecked ? "checked" : ""} ${isIndeterminate ? 'class="indeterminate"' : ""}>
            <span class="scope-tree-folder-toggle ${isExpanded ? "expanded" : ""}" data-action="expand" data-path="${escapeHtml(node.path)}">${icon("chevronRight", 12)}</span>
            <span class="scope-tree-folder-icon">${icon("folder", 14)}</span>
            <span class="scope-tree-folder-name">${escapeHtml(node.name)}</span>
          </div>
          ${isExpanded ? renderNodes(node.children, depth + 1) : ""}`;
      }
      const file = node.file;
      const isChecked = checkedFiles.has(file.path);
      return `
        <div class="scope-tree-node" data-file-path="${escapeHtml(file.path)}" style="padding-left:${12 + indent + 20}px">
          <input type="checkbox" data-action="toggle-file" data-path="${escapeHtml(file.path)}" ${isChecked ? "checked" : ""}>
          <span class="scope-tree-file-name" title="${escapeHtml(file.path)}">${escapeHtml(node.name)}</span>
          <span class="scope-tree-stats">+${file.additions} −${file.deletions}</span>
        </div>`;
    }).join("");
  }

  function wireEvents() {
    container.querySelectorAll("[data-action='expand']").forEach(el => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const dirPath = el.dataset.path;
        if (expandedDirs.has(dirPath)) expandedDirs.delete(dirPath);
        else expandedDirs.add(dirPath);
        render();
      });
    });

    container.querySelectorAll("[data-action='toggle-folder']").forEach(el => {
      el.addEventListener("change", (e) => {
        e.stopPropagation();
        const dirPath = el.dataset.path;
        const node = findFolderNode(tree, dirPath);
        if (!node) return;
        const folderFiles = getFolderFiles(node);
        if (isFolderChecked(node)) {
          folderFiles.forEach(f => checkedFiles.delete(f));
        } else {
          folderFiles.forEach(f => checkedFiles.add(f));
        }
        render();
        container.dispatchEvent(new Event("change", { bubbles: true }));
      });
    });

    container.querySelectorAll("[data-action='toggle-file']").forEach(el => {
      el.addEventListener("change", (e) => {
        e.stopPropagation();
        const filePath = el.dataset.path;
        if (checkedFiles.has(filePath)) checkedFiles.delete(filePath);
        else checkedFiles.add(filePath);
        render();
        container.dispatchEvent(new Event("change", { bubbles: true }));
      });
    });

    // Set indeterminate state on folder checkboxes
    container.querySelectorAll(".indeterminate").forEach(el => {
      el.indeterminate = true;
    });
  }

  function isFolderChecked(node) {
    const files = getFolderFiles(node);
    return files.length > 0 && files.every(f => checkedFiles.has(f));
  }

  function isFolderPartial(node) {
    const files = getFolderFiles(node);
    return files.some(f => checkedFiles.has(f));
  }

  function getFolderFiles(node) {
    const result = [];
    for (const child of node.children) {
      if (child.type === "file") result.push(child.file.path);
      else result.push(...getFolderFiles(child));
    }
    return result;
  }

  function findFolderNode(node, path) {
    if (node.type === "folder" && node.path === path) return node;
    if (node.children) {
      for (const child of node.children) {
        const found = findFolderNode(child, path);
        if (found) return found;
      }
    }
    return null;
  }

  function getCounts() {
    return { selected: checkedFiles.size, total: allFilePaths.size };
  }

  render();

  return {
    getExcludedFiles: () => [...allFilePaths].filter(f => !checkedFiles.has(f)),
    getSelectedCount: getCounts,
  };
}

function buildTree(files) {
  const root = { type: "folder", name: "", path: "", children: [] };

  for (const file of files) {
    const parts = file.path.split("/");
    let current = root;

    for (let i = 0; i < parts.length - 1; i++) {
      const dirPath = parts.slice(0, i + 1).join("/");
      let child = current.children.find(c => c.type === "folder" && c.path === dirPath);
      if (!child) {
        child = { type: "folder", name: parts[i], path: dirPath, children: [] };
        current.children.push(child);
      }
      current = child;
    }

    current.children.push({
      type: "file",
      name: parts[parts.length - 1],
      file,
    });
  }

  sortTree(root);
  return root;
}

function sortTree(node) {
  if (!node.children) return;
  node.children.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  node.children.forEach(sortTree);
}
```

- [ ] **Step 2: Verify syntax**

Run: `node --check skills/audit/scripts/public/js/components/scope-file-tree.mjs`

Expected: No output (success)

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/public/js/components/scope-file-tree.mjs
git commit -m "feat: create scope-file-tree component with directory tree and checkboxes"
```

---

### Task 7: Integrate File Preview Tree into Wizard Step 2

**Files:**
- Modify: `skills/audit/scripts/public/js/views/wizard.mjs`

This is the largest task. The changes to wizard.mjs involve:

1. Import the new component
2. Add `excludedFiles` to wizard state
3. Add a file preview area in `renderStep2` after the scope content
4. Add auto-load logic in `renderScopeContent`
5. Update the "Confirm Scope" handler to collect excluded files and pass them

- [ ] **Step 1: Add import**

At the top of `wizard.mjs`, add after line 4:

```javascript
import { renderScopeFileTree } from "../components/scope-file-tree.mjs";
```

- [ ] **Step 2: Add excludedFiles to state**

In the wizard state declaration (around line 13), add after `let contextExpanded = true;`:

```javascript
let excludedFiles = [];
let scopeTreeInstance = null;
```

In the `save()` function, add `excludedFiles` to the persisted object. Update the `JSON.stringify` call:

```javascript
localStorage.setItem(savedKey, JSON.stringify({
  step, reviewType, scopeMethod, scopeRef, stories, storyMappings, contextExpanded, excludedFiles,
}));
```

In the state restore from localStorage (around line 27), add:

```javascript
excludedFiles = state.excludedFiles || [];
```

- [ ] **Step 3: Add file preview area to renderStep2**

In the `renderStep2` function, add a file preview container after the scope content div. Replace:

```javascript
        <div id="scope-content" class="mt-4"></div>
      </div>
```

with:

```javascript
        <div id="scope-content" class="mt-4"></div>
        <div id="file-preview-section" class="mt-4"></div>
      </div>
```

- [ ] **Step 4: Add auto-load logic to renderScopeContent**

At the end of `renderScopeContent`, after the existing `if/else if/else if` blocks (before the closing `}`), add a function to load the preview and call it:

```javascript
    // Auto-load file preview
    loadFilePreview();
  }

  async function loadFilePreview() {
    const previewSection = document.getElementById("file-preview-section");
    if (!previewSection) return;

    previewSection.innerHTML = `<div class="scope-tree-loading"><span class="spinner spinner-sm"></span> Loading files...</div>`;
    scopeTreeInstance = null;

    try {
      const data = await api.previewScope(scopeMethod, scopeRef);
      if (!data.files || data.files.length === 0) {
        previewSection.innerHTML = `<div class="scope-tree-loading">No changed files found for this scope.</div>`;
        return;
      }
      const tree = renderScopeFileTree(previewSection, data.files);
      scopeTreeInstance = tree;
      previewSection.addEventListener("change", () => {
        excludedFiles = tree.getExcludedFiles();
        save();
      });
    } catch (e) {
      previewSection.innerHTML = `<div class="scope-tree-loading" style="color:var(--danger)">Failed to load files: ${escapeHtml(e.message)}</div>`;
    }
  }
```

**Important:** For the Uncommitted tab, this loads immediately. For Commits/Branch tabs, this loads after the user makes their selections (because `renderScopeContent` is called after the dropdowns are populated and `updateCommitRef`/`updateBranchRef` set `scopeRef`).

Also add a re-load trigger for commits/branch changes. In the `updateCommitRef` function (around line 222), add `loadFilePreview();` after `save();`:

```javascript
        function updateCommitRef() {
          scopeRef = document.getElementById("commit-from").value + " " + document.getElementById("commit-to").value;
          save();
          loadFilePreview();
        }
```

In the `updateBranchRef` function (around line 250), add `loadFilePreview();` after `save();`:

```javascript
        function updateBranchRef() {
          scopeRef = document.getElementById("branch-base").value + "..." + document.getElementById("branch-compare").value;
          save();
          loadFilePreview();
        }
```

- [ ] **Step 5: Update Confirm Scope handler**

In `renderStep2`, update the "Confirm Scope" click handler (around line 174) to pass `excludedFiles`:

Replace:

```javascript
        await api.setScope(sessionId, scopeMethod, scopeRef);
```

with:

```javascript
        if (excludedFiles.length > 0 && scopeTreeInstance) {
          const { selected, total } = scopeTreeInstance.getSelectedCount();
          if (total > 0 && selected === 0) {
            showToast("No files selected for review");
            const btn = document.getElementById("step2-confirm");
            if (btn) { btn.disabled = false; btn.textContent = "Confirm Scope"; }
            return;
          }
        }
        await api.setScope(sessionId, scopeMethod, scopeRef, excludedFiles);
```

- [ ] **Step 6: Verify syntax**

Run: `node --check skills/audit/scripts/public/js/views/wizard.mjs`

Expected: No output (success)

- [ ] **Step 7: Start server and test manually**

Run: `cd skills/audit/scripts && node server.mjs`

Test in browser:
1. Create a new audit session
2. Select "Code Review Only" → Next
3. On Step 2 with "Uncommitted" tab → file tree should auto-load
4. Uncheck some files → count updates
5. Click "Confirm Scope" → only checked files become tasks
6. Try Commits/Branch tabs → tree loads after selections

- [ ] **Step 8: Commit**

```bash
git add skills/audit/scripts/public/js/views/wizard.mjs
git commit -m "feat: integrate file preview tree into wizard Step 2 with auto-load"
```
