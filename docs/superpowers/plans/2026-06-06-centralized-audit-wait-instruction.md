# Centralized Audit Root + Wait-Instruction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralize all audit sessions under a configurable root directory (`~/.audit/{project-name}/`) and eliminate manual handoffs by adding HTTP long-poll `/wait` + `/advance` endpoints.

**Architecture:** Two independent features. (1) A new `resolveReportsDir()` function reads `audit.rootDir` and `audit.projectName` from `settings.json` to produce the reports directory path, replacing all hardcoded `.audit` paths. (2) A `/wait` endpoint holds an HTTP connection open until the browser UI calls `/advance`, letting the AI drive the entire flow without manual text input.

**Tech Stack:** Node.js HTTP server (no Express), vanilla JS frontend, YAML file storage.

---

## File Structure

| File | Responsibility |
|------|---------------|
| `lib/paths.mjs` | **Modify** — add `resolveReportsDir()`, `resolveProjectName()`, `loadAuditSettings()` |
| `server/index.mjs` | **Modify** — use `resolveReportsDir()`, register wait routes |
| `server/handlers/wait.mjs` | **Create** — `/wait` and `/advance` long-poll endpoints |
| `server/handlers/settings.mjs` | **Modify** — add `audit` section to read/write |
| `cli.mjs` | **Modify** — use `resolveReportsDir()` in `getReportsDir()` |
| `public/js/api.mjs` | **Modify** — add `advance()` method |
| `public/js/views/wizard.mjs` | **Modify** — replace terminal card with Start Review button |
| `public/js/views/wizard-project.mjs` | **Modify** — add `/advance` to group confirm, replace terminal card in project ready |
| `public/js/views/settings.mjs` | **Modify** — add Audit section with rootDir and projectName inputs |
| `SKILL.md` | **Modify** — update flow to use `/wait` instead of manual commands |

---

### Task 1: Centralized Audit Root — paths.mjs

**Files:**
- Modify: `skills/audit/scripts/lib/paths.mjs`

- [ ] **Step 1: Add `loadAuditSettings`, `resolveProjectName`, and `resolveReportsDir` to paths.mjs**

Append the following to the end of `skills/audit/scripts/lib/paths.mjs`:

```js
import os from "node:os";

const SETTINGS_FILENAME = "settings.json";

function loadAuditSettings() {
  const settingsPath = path.join(import.meta.dirname, "..", "settings.json");
  if (!fs.existsSync(settingsPath)) return {};
  try {
    const data = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    return data.audit || {};
  } catch {
    return {};
  }
}

export function resolveProjectName(projectDir, settings) {
  if (settings.projectName) return settings.projectName;
  return path.basename(path.resolve(projectDir));
}

export function resolveReportsDir(projectDir) {
  const settings = loadAuditSettings();
  const rawRoot = settings.rootDir || "~/.audit";
  const rootDir = rawRoot.startsWith("~")
    ? path.join(os.homedir(), rawRoot.slice(1))
    : path.resolve(rawRoot);
  const projectName = resolveProjectName(projectDir, settings);
  return path.join(rootDir, projectName);
}
```

Note: The `import os from "node:os"` goes at the top of the file alongside the existing imports. The `path` and `fs` imports already exist.

- [ ] **Step 2: Commit**

```bash
git add skills/audit/scripts/lib/paths.mjs
git commit -m "feat: add resolveReportsDir for centralized audit root"
```

---

### Task 2: Centralized Audit Root — Wire into cli.mjs and server/index.mjs

**Files:**
- Modify: `skills/audit/scripts/cli.mjs`
- Modify: `skills/audit/scripts/server/index.mjs`

- [ ] **Step 1: Update cli.mjs to use resolveReportsDir**

In `skills/audit/scripts/cli.mjs`, update the import and `getReportsDir`:

Change the import from:
```js
import { resolveProjectDir } from "./lib/paths.mjs";
```
To:
```js
import { resolveProjectDir, resolveReportsDir } from "./lib/paths.mjs";
```

Change `getReportsDir` from:
```js
function getReportsDir() {
  return path.join(projectDir, ".audit");
}
```
To:
```js
function getReportsDir() {
  return resolveReportsDir(projectDir);
}
```

- [ ] **Step 2: Update server/index.mjs to use resolveReportsDir**

In `skills/audit/scripts/server/index.mjs`, update the import and `startServer`:

Change the import — there is no existing import from paths.mjs, so add at the top:
```js
import { resolveReportsDir } from "../lib/paths.mjs";
```

Change the first line inside `startServer` from:
```js
  const reportsDir = path.join(projectDir, ".audit");
```
To:
```js
  const reportsDir = resolveReportsDir(projectDir);
```

Also update the console.log to show the resolved path:
```js
  console.log("Reports: " + reportsDir);
```

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/cli.mjs skills/audit/scripts/server/index.mjs
git commit -m "feat: wire resolveReportsDir into cli and server"
```

---

### Task 3: Centralized Audit Root — Settings handler support

**Files:**
- Modify: `skills/audit/scripts/server/handlers/settings.mjs`
- Modify: `skills/audit/scripts/public/js/views/settings.mjs`

- [ ] **Step 1: Add audit section to settings handler**

In `skills/audit/scripts/server/handlers/settings.mjs`, update `toPublicResponse` to include `audit`:

Add after the `result.customVars` block (before `return result`):
```js
  result.audit = {
    rootDir: settings.audit?.rootDir || "~/.audit",
    projectName: settings.audit?.projectName || "",
  };
```

Update the `PUT /api/settings` handler to persist `audit`:
Add after `if (body.customVars) existing.customVars = body.customVars;`:
```js
      if (body.audit) existing.audit = body.audit;
```

- [ ] **Step 2: Add Audit section to settings UI**

In `skills/audit/scripts/public/js/views/settings.mjs`, add an Audit card before the CodeGraph card (before the `<div class="card mb-4">` that contains `<h2 class="font-semibold mb-4">CodeGraph</h2>`):

```html
    <div class="card mb-4">
      <h2 class="font-semibold mb-4">Audit Storage</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label for="audit-root">Root Directory</label>
          <input id="audit-root" class="mt-1" placeholder="~/.audit"
            value="${escapeHtml(settings.audit?.rootDir || "~/.audit")}">
          <div class="text-xs text-muted mt-1">Centralized directory for all project audit data.</div>
        </div>
        <div>
          <label for="audit-project">Project Name Override</label>
          <input id="audit-project" class="mt-1" placeholder="(auto-detect from directory name)"
            value="${escapeHtml(settings.audit?.projectName || "")}">
          <div class="text-xs text-muted mt-1">Leave empty to use the directory name.</div>
        </div>
      </div>
    </div>
```

In the save handler (inside `document.getElementById("save-settings-btn").addEventListener`), add after the `codegraph` payload block:

```js
    const auditRoot = document.getElementById("audit-root").value.trim();
    const auditProject = document.getElementById("audit-project").value.trim();
    if (auditRoot || auditProject) {
      payload.audit = {
        rootDir: auditRoot || "~/.audit",
        projectName: auditProject || null,
      };
    }
```

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/server/handlers/settings.mjs skills/audit/scripts/public/js/views/settings.mjs
git commit -m "feat: add audit.rootDir and audit.projectName to settings"
```

---

### Task 4: Wait-Instruction — Create server/handlers/wait.mjs

**Files:**
- Create: `skills/audit/scripts/server/handlers/wait.mjs`

- [ ] **Step 1: Create the wait handler file**

Create `skills/audit/scripts/server/handlers/wait.mjs` with the following content:

```js
// skills/audit/scripts/server/handlers/wait.mjs
import { sanitizePath } from "../../lib/session.mjs";
import { jsonResponse, errorResponse, readBody } from "../index.mjs";

const WAIT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

const waiters = new Map(); // sessionId -> { resolve, timer }

export function registerWaitRoutes(router) {
  // POST /api/sessions/:id/wait
  // Blocks until /advance is called or timeout.
  router.post("/api/sessions/:id/wait", async (req, res, params) => {
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      return errorResponse(res, "Invalid JSON", "PARSE_ERROR", 400);
    }

    const reason = body.reason;
    if (!reason || !["ready", "grouping"].includes(reason)) {
      return errorResponse(res, "Invalid reason: must be 'ready' or 'grouping'", "VALIDATION_ERROR", 400);
    }

    const sid = sanitizePath(params.id);

    if (waiters.has(sid)) {
      return errorResponse(res, "Already waiting for this session", "CONFLICT", 409);
    }

    const result = await new Promise((resolve) => {
      const timer = setTimeout(() => {
        waiters.delete(sid);
        resolve({ action: "timeout" });
      }, WAIT_TIMEOUT_MS);

      waiters.set(sid, { resolve, timer });
    });

    jsonResponse(res, result);
  });

  // POST /api/sessions/:id/advance
  // Resolves a pending /wait call.
  router.post("/api/sessions/:id/advance", async (req, res, params) => {
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      return errorResponse(res, "Invalid JSON", "PARSE_ERROR", 400);
    }

    const action = body.action;
    if (!action || !["start", "confirm-groups"].includes(action)) {
      return errorResponse(res, "Invalid action: must be 'start' or 'confirm-groups'", "VALIDATION_ERROR", 400);
    }

    const sid = sanitizePath(params.id);
    const waiter = waiters.get(sid);

    if (!waiter) {
      return errorResponse(res, "No one waiting for this session", "NOT_FOUND", 404);
    }

    clearTimeout(waiter.timer);
    waiters.delete(sid);
    waiter.resolve({ action, data: {} });
    jsonResponse(res, { ok: true });
  });
}

// Cancel all waiters (for server shutdown)
export function cancelAllWaiters() {
  for (const [sid, waiter] of waiters) {
    clearTimeout(waiter.timer);
    waiter.resolve({ action: "cancelled" });
  }
  waiters.clear();
}
```

- [ ] **Step 2: Commit**

```bash
git add skills/audit/scripts/server/handlers/wait.mjs
git commit -m "feat: add /wait and /advance long-poll endpoints"
```

---

### Task 5: Wait-Instruction — Register routes in server/index.mjs

**Files:**
- Modify: `skills/audit/scripts/server/index.mjs`

- [ ] **Step 1: Import and register wait routes**

In `skills/audit/scripts/server/index.mjs`, add the import alongside the existing handler imports:

```js
import { registerWaitRoutes, cancelAllWaiters } from "./handlers/wait.mjs";
```

Inside `startServer`, add the registration after the other `register*Routes` calls:

```js
  registerWaitRoutes(router);
```

Add cleanup on server close — after `server.listen(...)`, add:

```js
  server.on("close", () => {
    cancelAllWaiters();
  });
```

- [ ] **Step 2: Commit**

```bash
git add skills/audit/scripts/server/index.mjs
git commit -m "feat: register /wait and /advance routes in server"
```

---

### Task 6: Wait-Instruction — Add advance() to api.mjs

**Files:**
- Modify: `skills/audit/scripts/public/js/api.mjs`

- [ ] **Step 1: Add advance method to api object**

In `skills/audit/scripts/public/js/api.mjs`, add after the `updateSessionStatus` line:

```js
  advance: (id, body) =>
    request("POST", `/api/sessions/${encodeURIComponent(id)}/advance`, body),
```

- [ ] **Step 2: Commit**

```bash
git add skills/audit/scripts/public/js/api.mjs
git commit -m "feat: add advance() to API client"
```

---

### Task 7: Browser UX — Replace terminal card in wizard.mjs Ready step

**Files:**
- Modify: `skills/audit/scripts/public/js/views/wizard.mjs`

- [ ] **Step 1: Replace renderStep4 terminal card with Start Review button**

In `skills/audit/scripts/public/js/views/wizard.mjs`, inside `renderStep4`, replace the entire block from `// Poll for session status change` through the end of the function (but before `setDirty(false)` and `localStorage.removeItem`).

Replace everything from `const termEl = document.getElementById("step4-terminal");` through `pollReadyStatus();` with:

```js
    // Start Review button
    const termEl = document.getElementById("step4-terminal");
    termEl.innerHTML = `
      <div style="text-align:center;padding:var(--space-4)">
        <button id="start-review-btn" class="btn btn-primary">${icon("zap", 14)} Start Review</button>
      </div>`;

    document.getElementById("start-review-btn").addEventListener("click", async () => {
      const btn = document.getElementById("start-review-btn");
      const originalHTML = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner spinner-sm"></span> Starting...';
      try {
        await api.advance(sessionId, { action: "start" });
        await api.updateSessionStatus(sessionId, "reviewing");
        location.hash = `#/progress/${sessionId}`;
      } catch (e) {
        showToast("Failed to start review: " + e.message);
        btn.disabled = false;
        btn.innerHTML = originalHTML;
      }
    });
```

- [ ] **Step 2: Commit**

```bash
git add skills/audit/scripts/public/js/views/wizard.mjs
git commit -m "feat: replace terminal card with Start Review button in wizard"
```

---

### Task 8: Browser UX — Update wizard-project.mjs group confirm and project ready

**Files:**
- Modify: `skills/audit/scripts/public/js/views/wizard-project.mjs`

- [ ] **Step 1: Add advance call to group confirm**

In `skills/audit/scripts/public/js/views/wizard-project.mjs`, inside the `confirmBtn.addEventListener("click")` handler in `renderGroupStep`, add the `/advance` call.

Change:
```js
        await api.confirmGroups(state.sessionId);
        const stepContent = document.getElementById("group-step-content");
```
To:
```js
        await api.confirmGroups(state.sessionId);
        await api.advance(state.sessionId, { action: "confirm-groups" }).catch(() => {});
        const stepContent = document.getElementById("group-step-content");
```

The `.catch(() => {})` handles the case where no AI is waiting (user is using the old manual flow).

- [ ] **Step 2: Replace terminal card in renderProjectReady with Start Review button**

In `skills/audit/scripts/public/js/views/wizard-project.mjs`, inside `renderProjectReady`, replace the `renderTerminalCard` call and add a Start Review button.

Replace:
```js
  const termEl = document.getElementById("project-ready-terminal");
  renderTerminalCard(termEl, `start review ${state.sessionId}`, {
    viewProgressHref: `#/progress/${state.sessionId}`,
  });
```

With:
```js
  const termEl = document.getElementById("project-ready-terminal");
  termEl.innerHTML = `
    <div style="text-align:center;padding:var(--space-4)">
      <button id="project-start-review-btn" class="btn btn-primary">${icon("zap", 14)} Start Review</button>
    </div>`;

  document.getElementById("project-start-review-btn")?.addEventListener("click", async () => {
    const btn = document.getElementById("project-start-review-btn");
    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner spinner-sm"></span> Starting...';
    try {
      await api.advance(state.sessionId, { action: "start" });
      await api.updateSessionStatus(state.sessionId, "reviewing");
      location.hash = `#/progress/${state.sessionId}`;
    } catch (e) {
      showToast("Failed to start review: " + e.message);
      btn.disabled = false;
      btn.innerHTML = originalHTML;
    }
  });
```

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/public/js/views/wizard-project.mjs
git commit -m "feat: add /advance to group confirm, replace terminal card in project ready"
```

---

### Task 9: SKILL.md — Update AI orchestration flow

**Files:**
- Modify: `skills/audit/SKILL.md`

- [ ] **Step 1: Update the Startup section**

Replace the "### 1. Startup" section with:

```markdown
### 1. Startup

1. Start the server: `node scripts/cli.mjs server` (background process)
2. Verify the server is running:
   ```bash
   curl -s http://localhost:3456/api/sessions
   ```
   If this fails, the server didn't start.
3. Tell the user: "A-Solid Audit server running at http://localhost:3456 — open this URL in your browser to configure the audit."
4. Create a session via the API or let the user create one in the browser. If creating via API:
   ```bash
   curl -s -X POST http://localhost:3456/api/sessions -H 'Content-Type: application/json' -d '{"type":"code"}'
   ```
   Note the `id` from the response.
5. **Wait for user to finish configuring** by calling the long-poll endpoint:
   ```bash
   curl -s -X POST http://localhost:3456/api/sessions/<session-id>/wait -H 'Content-Type: application/json' -d '{"reason":"ready"}'
   ```
   This blocks until the user clicks "Start Review" in the browser, or times out after 10 minutes.
6. When the response arrives with `{"action":"start"}`, proceed to the review loop.
```

- [ ] **Step 2: Update the Begin Review section**

Replace "### 2. Begin Review (triggered by user saying `start review <session-id>`)" with:

```markdown
### 2. Begin Review (after /wait resolves with action "start")

1. The session should now have status `reviewing` (the browser sets this when the user clicks Start Review).
2. Confirm the session status:
   ```bash
   curl -s http://localhost:3456/api/sessions/<session-id>
   ```
3. Get the task list:
   ```bash
   curl -s http://localhost:3456/api/sessions/<session-id>/tasks/summary
   ```
```

- [ ] **Step 3: Update the Project Grouping section**

Replace "### 5. Project Grouping (if type === \"project\" and status === \"scanned\")" with:

```markdown
### 5. Project Grouping (if type === "project" and status === "scanned")

1. Transition to grouping:
   ```bash
   curl -s -X PUT http://localhost:3456/api/sessions/<session-id>/status -H 'Content-Type: application/json' -d '{"status":"grouping"}'
   ```
2. Dispatch a sub-agent with `prompts/project-group.md`, passing session-id as context. The sub-agent:
   - Reads the session's `graph-data.json`
   - Analyzes the dependency graph
   - Groups files into logical modules
   - Writes `groups.json`
3. After sub-agent completes, **wait for the user to confirm groups**:
   ```bash
   curl -s -X POST http://localhost:3456/api/sessions/<session-id>/wait -H 'Content-Type: application/json' -d '{"reason":"grouping"}'
   ```
   This blocks until the user reviews and confirms groups in the browser.
4. When the response arrives with `{"action":"confirm-groups"}`, the groups are confirmed and tasks are generated. Proceed to the review loop.
```

- [ ] **Step 4: Update the Autonomy section**

Change:
```markdown
This skill operates with **high autonomy**. Do not ask for permission between individual task reviews. Only pause at defined checkpoints: startup (wait for user), begin review (wait for `start review`), and project grouping (wait for user to confirm groups).
```
To:
```markdown
This skill operates with **high autonomy**. Do not ask for permission between individual task reviews. The AI drives the entire flow — use `/wait` to block at checkpoints until the user acts in the browser. No manual text input from the user is needed.
```

- [ ] **Step 5: Commit**

```bash
git add skills/audit/SKILL.md
git commit -m "docs: update SKILL.md to use /wait flow instead of manual commands"
```

---

### Task 10: Smoke test — Verify the full flow

- [ ] **Step 1: Start the server**

```bash
cd /Users/cqx/Projects/chenqixing/a-solid/a-solid-audit
node skills/audit/scripts/cli.mjs server
```

Expected: `A-Solid Audit server running at http://localhost:3456` and `Reports:` showing `~/.audit/<project-name>`.

- [ ] **Step 2: Verify /wait blocks and /advance resolves**

In one terminal:
```bash
curl -s -X POST http://localhost:3456/api/sessions -H 'Content-Type: application/json' -d '{"type":"code"}'
```
Note the session ID from the response.

In the same terminal, start a wait:
```bash
curl -s -X POST http://localhost:3456/api/sessions/<session-id>/wait -H 'Content-Type: application/json' -d '{"reason":"ready"}'
```
Expected: The request hangs (no immediate response).

In a second terminal, advance it:
```bash
curl -s -X POST http://localhost:3456/api/sessions/<session-id>/advance -H 'Content-Type: application/json' -d '{"action":"start"}'
```
Expected: `{"ok":true}`.

In the first terminal, the `/wait` should now return `{"action":"start","data":{}}`.

- [ ] **Step 3: Verify settings UI**

Open `http://localhost:3456` in a browser, navigate to Settings. Verify the "Audit Storage" card appears with Root Directory and Project Name fields. Save and verify the values persist.

- [ ] **Step 4: Verify browser Start Review button**

Create a new session via the browser wizard, proceed to the Ready step. Verify the "Start Review" button appears instead of the terminal card. Click it and verify it transitions to the progress view.
