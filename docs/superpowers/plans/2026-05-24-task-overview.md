# Task Overview — Call Chain Diagram Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `type`, `entry`, and `overview` (Mermaid diagram + description) fields to Project Task YAML, populate them during scanning and AI review, and render them in the frontend task detail view.

**Architecture:** Scanning phase identifies entry points via heuristic path matching and lightweight import regex, filling `type` and `entry`. AI review sub-agent fills `overview.diagram` (Mermaid) and `overview.description`. Frontend renders type badge, Mermaid chart, and description text above the existing review content.

**Tech Stack:** Node.js (no new deps), Mermaid.js (CDN), existing frontend SPA (ES modules, Tailwind CSS).

---

## Task 1: Add `type` and `entry` to `writeProjectTaskYaml()` and YAML schema

**Files:**
- Modify: `skills/audit/scripts/lib/yaml.mjs` (line 268-275, `writeProjectTaskYaml`)

- [ ] **Step 1: Update `writeProjectTaskYaml()` to include new fields**

In `skills/audit/scripts/lib/yaml.mjs`, change the `writeProjectTaskYaml` function to:

```js
export function writeProjectTaskYaml(filePath, data) {
  writeYaml(filePath, {
    name: data.name,
    status: data.status || "pending",
    type: data.type || "unknown",
    entry: data.entry || null,
    files: data.files || [],
    review: data.review || { score: 0, summary: "", findings: [], positives: [] },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add skills/audit/scripts/lib/yaml.mjs
git commit -m "feat: add type and entry fields to writeProjectTaskYaml"
```

---

## Task 2: Add entry-point identification to scanning logic

**Files:**
- Modify: `skills/audit/scripts/lib/project-scan.mjs` (after line 47, new functions; modify `chunkFiles` and `setProjectScope`)

- [ ] **Step 1: Add entry-point classification and import resolution functions**

After the `classifyPriority` function (after line 47), add:

```js
const ENTRY_PATTERNS = [
  { type: "api", keywords: ["handler", "controller", "route", "api", "endpoint"] },
  { type: "scheduled", keywords: ["cron", "job", "scheduler"] },
  { type: "consumer", keywords: ["consumer", "subscriber", "worker", "queue", "listener"] },
  { type: "script", keywords: ["script", "bin", "cli", "migration"] },
];

function classifyEntryType(filePath) {
  const normalized = filePath.toLowerCase().replace(/\\/g, "/");
  const name = path.basename(normalized);
  for (const { type, keywords } of ENTRY_PATTERNS) {
    for (const kw of keywords) {
      if (normalized.includes("/" + kw) || normalized.includes(kw + "/") || name.includes(kw)) {
        return type;
      }
    }
  }
  return "unknown";
}

const IMPORT_RE = /(?:import\s+.*?\s+from\s+['"])(\.{1,2}\/[^'"]+)(?:['"])|(?:require\s*\(\s*['"])(\.{1,2}\/[^'"]+)(?:['"])/g;

function resolveImports(filePath, projectDir) {
  const fullPath = path.join(projectDir, filePath);
  if (!fs.existsSync(fullPath)) return [];
  try {
    const src = fs.readFileSync(fullPath, "utf-8");
    const imports = [];
    let m;
    while ((m = IMPORT_RE.exec(src)) !== null) {
      const raw = m[1] || m[2];
      const resolved = path.normalize(path.join(path.dirname(filePath), raw));
      let rel = resolved.replace(/\\/g, "/");
      // Try with common extensions
      for (const ext of ["", ".mjs", ".js", ".ts", ".cjs"]) {
        if (fs.existsSync(path.join(projectDir, rel + ext))) {
          imports.push(rel + ext);
          break;
        }
      }
      // Try index
      for (const ext of ["/index.mjs", "/index.js", "/index.ts"]) {
        if (fs.existsSync(path.join(projectDir, rel + ext))) {
          imports.push(rel + ext);
          break;
        }
      }
    }
    return [...new Set(imports)];
  } catch {
    return [];
  }
}
```

- [ ] **Step 2: Replace `chunkFiles()` with entry-point-driven grouping**

Replace the existing `chunkFiles` function with:

```js
export function chunkFiles(files, projectDir) {
  // Identify entry files
  const entries = [];
  const nonEntries = [];
  for (const f of files) {
    const entryType = classifyEntryType(f.path);
    if (entryType !== "unknown") {
      entries.push({ ...f, entryType });
    } else {
      nonEntries.push(f);
    }
  }

  // Group: each entry + its transitive imports (2 levels deep)
  const claimed = new Set();
  const chunks = [];
  let chunkIdx = 1;

  for (const entry of entries) {
    const chain = new Set([entry.path]);
    // Level 1: direct imports
    for (const imp of resolveImports(entry.path, projectDir)) {
      chain.add(imp);
      // Level 2: imports of imports
      for (const imp2 of resolveImports(imp, projectDir)) {
        chain.add(imp2);
      }
    }
    const chainFiles = [...chain].filter(p => files.some(f => f.path === p));
    chainFiles.forEach(p => claimed.add(p));

    chunks.push({
      id: "chunk-" + String(chunkIdx++).padStart(3, "0"),
      name: entry.path,
      type: entry.entryType,
      entry: entry.path,
      files: chainFiles,
      priority: entry.priority,
      fileCount: chainFiles.length,
    });
  }

  // Remaining unclaimed files grouped by directory
  const remaining = nonEntries.filter(f => !claimed.has(f.path));
  const dirGroups = new Map();
  for (const f of remaining) {
    const dir = path.dirname(f.path);
    if (!dirGroups.has(dir)) dirGroups.set(dir, []);
    dirGroups.get(dir).push(f);
  }
  for (const [dir, dirFiles] of dirGroups) {
    chunks.push({
      id: "chunk-" + String(chunkIdx++).padStart(3, "0"),
      name: dir === "." ? "root" : dir + "/",
      type: "unknown",
      entry: null,
      files: dirFiles.map(f => f.path),
      priority: dirFiles[0].priority,
      fileCount: dirFiles.length,
    });
  }

  // Merge small adjacent unknown chunks
  const merged = [];
  for (const chunk of chunks) {
    if (merged.length > 0 && merged[merged.length - 1].type === "unknown" && chunk.type === "unknown"
        && merged[merged.length - 1].fileCount + chunk.fileCount <= MAX_FILES_PER_CHUNK) {
      const last = merged[merged.length - 1];
      last.name = last.name + " + " + chunk.name;
      last.files = [...last.files, ...chunk.files];
      last.fileCount += chunk.fileCount;
    } else {
      merged.push({ ...chunk, files: [...chunk.files] });
    }
  }

  return merged;
}
```

- [ ] **Step 3: Update `setProjectScope()` to pass projectDir and new fields**

Update the `setProjectScope` function to pass `projectDir` to `chunkFiles` and include `type`/`entry` in task YAML:

```js
export function setProjectScope(projectDir, reportsDir, sid, scanOptions = {}) {
  const safeSid = sanitizePath(sid);
  const sessionDir = path.join(reportsDir, safeSid);
  const indexPath = path.join(sessionDir, "index.yaml");
  if (!fs.existsSync(indexPath)) throw new Error("Session not found: " + safeSid);

  const files = scanProjectDir(projectDir, scanOptions);
  const chunks = chunkFiles(files, projectDir);
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

  const index = readYaml(indexPath);
  writeIndexYaml(indexPath, {
    session: {
      ...index.session,
      type: "project-scan",
      status: "scoped",
      scope: { method: "directory-scan", ref: "" },
      projectDir,
    },
    codeTasks: index.codeTasks || [],
    storyTasks: index.storyTasks || [],
    projectTasks: tasks,
  });

  return { taskCount: tasks.length, totalFiles: files.length, chunks };
}
```

- [ ] **Step 4: Commit**

```bash
git add skills/audit/scripts/lib/project-scan.mjs
git commit -m "feat: entry-point identification and import-based chunking in project scan"
```

---

## Task 3: Add `overview` handling to task update and API

**Files:**
- Modify: `skills/audit/scripts/lib/task.mjs` (line 9-44, `updateTask`)
- Modify: `skills/audit/scripts/server/handlers/reviews.mjs` (line 27-65, POST handler)

- [ ] **Step 1: Update `updateTask()` to persist `overview` field**

In `skills/audit/scripts/lib/task.mjs`, modify the `updateTask` function. After the line `task.review = { ...task.review, ...reviewData };` (line 27), add overview handling:

```js
export function updateTask(reportsDir, sid, taskFile, status, score, reviewData, overview) {
  if (!ALLOWED_STATUSES.includes(status)) {
    throw new Error("Invalid status: " + status + ". Allowed: " + ALLOWED_STATUSES.join(", "));
  }

  const safeSid = sanitizePath(sid);
  const sessionDir = path.join(reportsDir, safeSid);
  const safeTaskFile = sanitizeFilePath(taskFile);
  const taskPath = path.join(sessionDir, safeTaskFile);
  const indexPath = path.join(sessionDir, "index.yaml");

  if (!fs.existsSync(taskPath)) throw new Error("Task file not found: " + taskPath);
  if (!fs.existsSync(indexPath)) throw new Error("Session not found: " + safeSid);

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

  const index = readYaml(indexPath);
  let allReviewed = true;
  for (const taskGroup of ["codeTasks", "storyTasks", "projectTasks"]) {
    const tasks = index[taskGroup] || [];
    for (const t of tasks) {
      if (t.file === safeTaskFile) t.status = status;
      if (t.status !== "reviewed") allReviewed = false;
    }
  }
  if (allReviewed) index.session.status = "completed";
  writeIndexYaml(indexPath, index);

  return { file: safeTaskFile, status };
}
```

- [ ] **Step 2: Update review POST handler to accept `overview`**

In `skills/audit/scripts/server/handlers/reviews.mjs`, update the POST handler to extract and pass `overview`:

```js
const { status, score, review, overview } = body;
```

And change the `updateTask` call:

```js
const result = updateTask(reportsDir, safeSid, safeTaskFile, status, score, review, overview);
```

- [ ] **Step 3: Update `getTasks()` and `getTask()` in task.mjs to include projectTasks**

In `skills/audit/scripts/lib/task.mjs`, update `getTasks()` to include project tasks:

```js
export function getTasks(reportsDir, sid) {
  const safeSid = sanitizePath(sid);
  const sessionDir = path.join(reportsDir, safeSid);
  const indexPath = path.join(sessionDir, "index.yaml");
  if (!fs.existsSync(indexPath)) throw new Error("Session not found: " + safeSid);

  const index = readYaml(indexPath);
  const result = [];

  for (const ref of index.codeTasks || []) {
    const taskPath = path.join(sessionDir, ref.file);
    if (fs.existsSync(taskPath)) {
      const task = readYaml(taskPath);
      result.push({ type: "code", file: ref.file, ...task });
    }
  }

  for (const ref of index.storyTasks || []) {
    const taskPath = path.join(sessionDir, ref.file);
    if (fs.existsSync(taskPath)) {
      const task = readYaml(taskPath);
      result.push({ type: "story", file: ref.file, ...task });
    }
  }

  for (const ref of index.projectTasks || []) {
    const taskPath = path.join(sessionDir, ref.file);
    if (fs.existsSync(taskPath)) {
      const task = readYaml(taskPath);
      result.push({ type: "project", file: ref.file, ...task });
    }
  }

  return result;
}
```

Update `getTask()` similarly — change the `allRefs` and type detection:

```js
const allRefs = [...(index.codeTasks || []), ...(index.storyTasks || []), ...(index.projectTasks || [])];
```

And the type detection:

```js
const type = (index.codeTasks || []).some(t => t.file === ref.file) ? "code"
  : (index.storyTasks || []).some(t => t.file === ref.file) ? "story"
  : "project";
```

- [ ] **Step 4: Commit**

```bash
git add skills/audit/scripts/lib/task.mjs skills/audit/scripts/server/handlers/reviews.mjs
git commit -m "feat: handle overview field in task update and include projectTasks in getTasks"
```

---

## Task 4: Update AI review prompt to generate overview

**Files:**
- Modify: `skills/audit/prompts/project-review.md` (after Step 6 "Submit Results")

- [ ] **Step 1: Add overview generation instructions to the prompt**

After the "Submit Results" section (Step 6) and before "Update Review Context" (Step 7), add the following section. Also update the request body in Step 6 to include `overview`:

In Step 6's request body, add after `"positives"`:

```
    "overview": {
      "diagram": "<Mermaid graph TD diagram of the call chain>",
      "description": "<1-3 sentence execution flow description>"
    }
```

Add a new Step 7 (renumber existing Step 7 to Step 8):

```markdown
### 7. Generate Overview

Analyze the call chain and data flow for the files in this task, then include `overview` in your review submission:

**diagram**: A Mermaid `graph TD` diagram showing the call/data flow:
- Each node is a file: `A[filename.mjs<br/>role]` where role is handler, service, repository, middleware, util, etc.
- Edges describe the relationship: `A -->|validates| B`
- Only include files from `files[]`
- Keep it concise — no more than 10 nodes
- Example:
  ```
  graph TD
      A[handler.mjs<br/>Handler] -->|validate & route| B[service.mjs<br/>Service]
      B -->|query & persist| C[repo.mjs<br/>Repository]
      B -->|cache lookup| D[cache.mjs<br/>Cache]
  ```

**description**: 1-3 sentences describing:
- How the request/data enters through the entry point
- How it flows through the key modules
- What each major module is responsible for

If the task has `type: unknown` (no clear entry point), describe the general purpose of the module group instead.
```

- [ ] **Step 2: Commit**

```bash
git add skills/audit/prompts/project-review.md
git commit -m "feat: add overview generation instructions to project-review prompt"
```

---

## Task 5: Add type constants and Mermaid CDN to frontend

**Files:**
- Modify: `skills/audit/scripts/public/js/constants.mjs`
- Modify: `skills/audit/scripts/public/index.html`

- [ ] **Step 1: Add entry type constants to constants.mjs**

Append to `skills/audit/scripts/public/js/constants.mjs`:

```js
export const ENTRY_TYPES = {
  api:       { label: "API",       color: "var(--info)" },
  scheduled: { label: "Cron",      color: "var(--warning)" },
  consumer:  { label: "Consumer",  color: "#a78bfa" },
  script:    { label: "Script",    color: "var(--accent)" },
  unknown:   { label: "Module",    color: "var(--text-muted)" },
};
```

- [ ] **Step 2: Add Mermaid CDN script to index.html**

In `skills/audit/scripts/public/index.html`, add before the closing `</head>` tag (before line 31):

```html
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
<script>mermaid.initialize({startOnLoad:false,theme:"dark",securityLevel:"loose"});</script>
```

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/public/js/constants.mjs skills/audit/scripts/public/index.html
git commit -m "feat: add entry type constants and Mermaid CDN to frontend"
```

---

## Task 6: Render overview section in task-detail component

**Files:**
- Modify: `skills/audit/scripts/public/js/components/task-detail.mjs`
- Modify: `skills/audit/scripts/public/styles.css`

- [ ] **Step 1: Update `renderTaskDetail()` to render overview**

In `skills/audit/scripts/public/js/components/task-detail.mjs`, add import at top:

```js
import { ENTRY_TYPES } from "../constants.mjs";
```

Then in the `renderTaskDetail` function, add the overview section between the task header and the summary. Insert after the closing `</div>` of the task header block (after the line with `findings.length} findings</div>`) and before the summary block:

```js
      ${task.overview ? `
        <div class="task-overview">
          ${task.type && ENTRY_TYPES[task.type] ? `
            <div class="flex items-center gap-2 mb-3">
              <span class="badge entry-type-badge" style="background:${ENTRY_TYPES[task.type].color}20;color:${ENTRY_TYPES[task.type].color};border:1px solid ${ENTRY_TYPES[task.type].color}40">${ENTRY_TYPES[task.type].label}</span>
              ${task.entry ? `<span class="text-xs font-mono text-muted">${escapeHtml(task.entry)}</span>` : ""}
            </div>
          ` : ""}
          ${task.overview.diagram ? `
            <div class="overview-diagram" data-mermaid-source="${escapeHtml(task.overview.diagram)}">
              <div class="mermaid-placeholder text-sm text-muted">Loading diagram...</div>
            </div>
          ` : ""}
          ${task.overview.description ? `
            <div class="overview-description text-sm text-secondary mt-2">${escapeHtml(task.overview.description)}</div>
          ` : ""}
        </div>
      ` : ""}
```

- [ ] **Step 2: Add Mermaid rendering logic**

At the end of the `renderTaskDetail` function, before the closing backtick of the return statement, there's no place for side effects. Instead, export a new function to render Mermaid diagrams after the detail is mounted:

```js
export async function renderMermaidDiagrams(container) {
  const els = container.querySelectorAll("[data-mermaid-source]");
  for (const el of els) {
    if (el.dataset.rendered) continue;
    el.dataset.rendered = "true";
    try {
      const src = el.dataset.mermaidSource;
      const { svg } = await mermaid.render("mermaid-" + Math.random().toString(36).slice(2, 8), src);
      el.innerHTML = svg;
    } catch (e) {
      el.innerHTML = `<pre class="text-xs text-muted">${escapeHtml(el.dataset.mermaidSource)}</pre>`;
    }
  }
}
```

- [ ] **Step 3: Add overview styles to styles.css**

Append to `skills/audit/scripts/public/styles.css`:

```css
/* Task overview */
.task-overview {
  padding: var(--space-4);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  margin-bottom: var(--space-3);
}
.overview-diagram {
  display: flex;
  justify-content: center;
  padding: var(--space-3) 0;
}
.overview-diagram svg {
  max-width: 100%;
  height: auto;
}
.overview-diagram .node rect,
.overview-diagram .node polygon {
  rx: 6;
  ry: 6;
}
.entry-type-badge {
  text-transform: uppercase;
  font-size: var(--text-xs);
  letter-spacing: 0.5px;
  padding: 2px 10px;
  border-radius: var(--radius-full);
}
.mermaid-placeholder {
  padding: var(--space-4);
  text-align: center;
}
[data-theme="light"] .overview-diagram .edgeLabel {
  color: #374151;
}
```

- [ ] **Step 4: Commit**

```bash
git add skills/audit/scripts/public/js/components/task-detail.mjs skills/audit/scripts/public/styles.css
git commit -m "feat: render overview section with Mermaid diagram in task detail"
```

---

## Task 7: Wire Mermaid rendering into review view

**Files:**
- Modify: `skills/audit/scripts/public/js/views/review.mjs`

- [ ] **Step 1: Import and call `renderMermaidDiagrams` after task detail renders**

In `skills/audit/scripts/public/js/views/review.mjs`, add import:

```js
import { renderMermaidDiagrams } from "../components/task-detail.mjs";
```

Find where `renderTaskDetail(task, notes)` is called and its result is set as `innerHTML`. After that DOM update, call:

```js
renderMermaidDiagrams(detailContainer);
```

where `detailContainer` is the element that received the task detail HTML.

- [ ] **Step 2: Commit**

```bash
git add skills/audit/scripts/public/js/views/review.mjs
git commit -m "feat: wire Mermaid rendering into review view"
```

---

## Task 8: Add type icon to progress view task list

**Files:**
- Modify: `skills/audit/scripts/public/js/views/progress.mjs`

- [ ] **Step 1: Import constants and add type icon to task rows**

In `skills/audit/scripts/public/js/views/progress.mjs`, add import:

```js
import { ENTRY_TYPES } from "../constants.mjs";
```

In the task list rendering (inside `tasks.map(t => ...)`), add a type icon before the task name. Change the task name line from:

```js
<span class="text-sm font-mono truncate">${escapeHtml(t.name || t.file)}</span>
```

to:

```js
              <span class="text-sm font-mono truncate">${t.type && ENTRY_TYPES[t.type] ? `<span class="badge entry-type-badge" style="background:${ENTRY_TYPES[t.type].color}20;color:${ENTRY_TYPES[t.type].color};border:1px solid ${ENTRY_TYPES[t.type].color}40;margin-right:6px">${ENTRY_TYPES[t.type].label}</span>` : ""}${escapeHtml(t.name || t.file)}</span>
```

- [ ] **Step 2: Commit**

```bash
git add skills/audit/scripts/public/js/views/progress.mjs
git commit -m "feat: show entry type badge in progress view task list"
```

---

## Self-Review

**Spec coverage check:**
- YAML schema (type/entry/overview): Task 1 (writeProjectTaskYaml)
- Entry-point identification: Task 2 (classifyEntryType, resolveImports, chunkFiles rewrite)
- AI prompt overview generation: Task 4 (prompt update)
- Server-side overview handling: Task 3 (updateTask + review handler + getTasks/getTask)
- Frontend Mermaid rendering: Task 5 (CDN + constants), Task 6 (task-detail component), Task 7 (review view wiring)
- Progress view type icons: Task 8

**Placeholder scan:** No TBD/TODO found. All steps have complete code.

**Type consistency:**
- `ENTRY_TYPES` defined in constants.mjs, used in task-detail.mjs and progress.mjs
- `overview` field passed through reviews.mjs handler → task.mjs updateTask → written to YAML
- `renderMermaidDiagrams` exported from task-detail.mjs, imported in review.mjs
- `chunk.type` / `chunk.entry` set in project-scan.mjs, passed to `writeProjectTaskYaml`
