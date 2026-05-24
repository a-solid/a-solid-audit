# Project Scan Frontend Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add project scan entry point to the frontend wizard and a global settings page for managing API keys and credentials.

**Architecture:** Extend the existing wizard with a third "Project Scan" card in Step 1 and a simplified 2-step flow (Configure → Ready). Add a new settings page with GET/PUT API. Refactor `callAnthropicAPI()` to accept config from settings.json instead of `process.env`.

**Tech Stack:** Node.js ESM (no build step), vanilla JS frontend, Tailwind CSS, existing icon system.

---

## File Structure

| File | Responsibility |
|------|---------------|
| `skills/audit/scripts/server/handlers/settings.mjs` | New — GET/PUT `/api/settings` handler |
| `skills/audit/scripts/public/js/views/settings.mjs` | New — Settings page UI |
| `skills/audit/scripts/server/index.mjs` | Modify — register settings routes |
| `skills/audit/scripts/public/js/api.mjs` | Modify — add settings API methods |
| `skills/audit/scripts/public/js/app.mjs` | Modify — add settings route + header gear icon |
| `skills/audit/scripts/public/js/views/wizard.mjs` | Modify — add project scan card + configure step |
| `skills/audit/scripts/lib/project-scan.mjs` | Modify — accept apiKey parameter |
| `skills/audit/scripts/server/handlers/project-scan.mjs` | Modify — read settings and pass to scanProject |
| `skills/audit/scripts/public/js/views/progress.mjs` | Modify — auto-trigger scan when project session is ready |

---

### Task 1: Create settings API handler

**Files:**
- Create: `skills/audit/scripts/server/handlers/settings.mjs`

- [ ] **Step 1: Create the settings handler**

```javascript
// skills/audit/scripts/server/handlers/settings.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { jsonResponse, errorResponse, readBody } from "../index.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SETTINGS_PATH = path.join(__dirname, "..", "..", "settings.json");

function loadSettings() {
  if (!fs.existsSync(SETTINGS_PATH)) return {};
  try { return JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8")); }
  catch { return {}; }
}

function saveSettings(data) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

function toPublicResponse(settings) {
  const result = {};
  if (settings.anthropic) {
    result.anthropic = { configured: !!(settings.anthropic.apiKey) };
  } else {
    result.anthropic = { configured: false };
  }
  if (settings.jira) {
    result.jira = { configured: !!(settings.jira.baseUrl && settings.jira.token) };
  } else {
    result.jira = { configured: false };
  }
  if (settings.database) {
    result.database = { configured: !!(settings.database.host && settings.database.name) };
  } else {
    result.database = { configured: false };
  }
  result.codegraph = {
    path: settings.codegraph?.path || "~/.local/bin/codegraph",
  };
  result.customVars = (settings.customVars || []).map(v => ({
    key: v.key,
    configured: !!(v.value),
  }));
  return result;
}

export function registerSettingsRoutes(router) {
  // GET /api/settings
  router.get("/api/settings", (req, res) => {
    const settings = loadSettings();
    jsonResponse(res, toPublicResponse(settings));
  });

  // PUT /api/settings
  router.put("/api/settings", async (req, res) => {
    try {
      const body = JSON.parse(await readBody(req));
      if (!body || typeof body !== "object") {
        return errorResponse(res, "Invalid body", "VALIDATION_ERROR", 400);
      }
      const existing = loadSettings();

      if (body.anthropic) existing.anthropic = body.anthropic;
      if (body.jira) existing.jira = body.jira;
      if (body.database) existing.database = body.database;
      if (body.codegraph) existing.codegraph = body.codegraph;
      if (body.customVars) existing.customVars = body.customVars;

      saveSettings(existing);
      jsonResponse(res, toPublicResponse(existing));
    } catch (e) {
      errorResponse(res, "Failed to save settings: " + e.message, "INTERNAL_ERROR", 500);
    }
  });
}

export { loadSettings, SETTINGS_PATH };
```

- [ ] **Step 2: Commit**

```bash
git add skills/audit/scripts/server/handlers/settings.mjs
git commit -m "feat: add settings API handler with GET/PUT endpoints"
```

---

### Task 2: Register settings routes in server

**Files:**
- Modify: `skills/audit/scripts/server/index.mjs`

- [ ] **Step 1: Add import and route registration**

Add import after line 13 in `skills/audit/scripts/server/index.mjs`:

```javascript
import { registerSettingsRoutes } from "./handlers/settings.mjs";
```

Add route registration after line 43 (after `registerProjectScanRoutes`):

```javascript
  registerSettingsRoutes(router);
```

- [ ] **Step 2: Commit**

```bash
git add skills/audit/scripts/server/index.mjs
git commit -m "feat: register settings routes in server"
```

---

### Task 3: Refactor `callAnthropicAPI` to accept apiKey parameter

**Files:**
- Modify: `skills/audit/scripts/lib/project-scan.mjs`

- [ ] **Step 1: Change `callAnthropicAPI` signature**

In `skills/audit/scripts/lib/project-scan.mjs`, change line 12-14 from:

```javascript
function callAnthropicAPI(systemPrompt, userMessage) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
```

To:

```javascript
function callAnthropicAPI(systemPrompt, userMessage, apiKey) {
  if (!apiKey) throw new Error("Anthropic API key not configured — set it in Settings");
```

- [ ] **Step 2: Update `aiGroupEntries` to accept and pass apiKey**

Change the `aiGroupEntries` function signature on line 57 from:

```javascript
async function aiGroupEntries(matrix) {
```

To:

```javascript
async function aiGroupEntries(matrix, apiKey) {
```

Change line 73 from:

```javascript
  const response = await callAnthropicAPI(
```

To:

```javascript
  const response = await callAnthropicAPI(
    "你是一个代码分析助手，负责将项目入口点按业务领域分组。只输出 JSON。",
    userMessage,
    apiKey
  );
```

(Keep the existing system prompt and userMessage — only add the `apiKey` third argument.)

The full call should be:

```javascript
  const response = await callAnthropicAPI(
    "你是一个代码分析助手，负责将项目入口点按业务领域分组。只输出 JSON。",
    userMessage,
    apiKey
  );
```

- [ ] **Step 3: Update `scanProject` to accept and pass apiKey**

Change line 350 from:

```javascript
export async function scanProject(projectDir, reportsDir, sid) {
```

To:

```javascript
export async function scanProject(projectDir, reportsDir, sid, apiKey) {
```

Change line 425 from:

```javascript
        groups = await aiGroupEntries(matrix);
```

To:

```javascript
        groups = await aiGroupEntries(matrix, apiKey);
```

- [ ] **Step 4: Commit**

```bash
git add skills/audit/scripts/lib/project-scan.mjs
git commit -m "refactor: accept apiKey parameter instead of process.env"
```

---

### Task 4: Update project-scan handler to read settings

**Files:**
- Modify: `skills/audit/scripts/server/handlers/project-scan.mjs`

- [ ] **Step 1: Import loadSettings and pass apiKey to scanProject**

Change the import at the top (line 4) from:

```javascript
import { scanProject } from "../../lib/project-scan.mjs";
```

To:

```javascript
import { scanProject } from "../../lib/project-scan.mjs";
import { loadSettings } from "./settings.mjs";
```

Change line 37 from:

```javascript
        result = await scanProject(targetDir, reportsDir, safeSid);
```

To:

```javascript
        const settings = loadSettings();
        const apiKey = settings.anthropic?.apiKey || process.env.ANTHROPIC_API_KEY || "";
        result = await scanProject(targetDir, reportsDir, safeSid, apiKey);
```

- [ ] **Step 2: Commit**

```bash
git add skills/audit/scripts/server/handlers/project-scan.mjs
git commit -m "feat: read API key from settings for project scan"
```

---

### Task 5: Add settings API methods to frontend API client

**Files:**
- Modify: `skills/audit/scripts/public/js/api.mjs`

- [ ] **Step 1: Add getSettings and updateSettings methods**

Add after the `getScanStatus` method (after line 79), before the closing `};`:

```javascript
  // Settings
  getSettings: () => request("GET", "/api/settings"),
  updateSettings: (data) => request("PUT", "/api/settings", data),
```

- [ ] **Step 2: Commit**

```bash
git add skills/audit/scripts/public/js/api.mjs
git commit -m "feat: add settings API methods to frontend client"
```

---

### Task 6: Add settings route and header gear icon

**Files:**
- Modify: `skills/audit/scripts/public/js/app.mjs`
- Modify: `skills/audit/scripts/public/index.html`

- [ ] **Step 1: Add settings import and route in app.mjs**

Add import after line 7:

```javascript
import { renderSettings } from "./views/settings.mjs";
```

Add to the `routes` object (after `summary` on line 118):

```javascript
  settings: renderSettings,
```

- [ ] **Step 2: Add gear icon to header in index.html**

Change line 44 in `index.html` from:

```html
    <button id="theme-toggle" class="btn btn-ghost btn-sm" aria-label="Toggle theme"></button>
```

To:

```html
    <a href="#/settings" class="btn btn-ghost btn-sm" aria-label="Settings" id="header-settings-btn"></a>
    <button id="theme-toggle" class="btn btn-ghost btn-sm" aria-label="Toggle theme"></button>
```

- [ ] **Step 3: Populate gear icon via existing theme initialization**

The header settings button needs its SVG content set. Add this logic to `app.mjs` after the `initTheme()` call (after line 11):

```javascript
const settingsBtn = document.getElementById("header-settings-btn");
if (settingsBtn) settingsBtn.innerHTML = icon("settings", 16);
```

- [ ] **Step 4: Commit**

```bash
git add skills/audit/scripts/public/js/app.mjs skills/audit/scripts/public/index.html
git commit -m "feat: add settings route and header gear icon"
```

---

### Task 7: Create settings page

**Files:**
- Create: `skills/audit/scripts/public/js/views/settings.mjs`

- [ ] **Step 1: Create the settings page view**

```javascript
// skills/audit/scripts/public/js/views/settings.mjs
import { api } from "../api.mjs";
import { showToast, setBreadcrumb, icon, escapeHtml } from "../app.mjs";

export async function renderSettings(container) {
  setBreadcrumb([{ label: "Settings" }]);

  let settings = {};
  try { settings = await api.getSettings(); } catch (e) { showToast("Failed to load settings"); }

  container.innerHTML = `
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl">Settings</h1>
        <p class="text-sm text-muted mt-1">Configure API keys, credentials, and integrations</p>
      </div>
    </div>

    <div class="card mb-4">
      <h2 class="font-semibold mb-4">${icon("zap", 16)} Anthropic</h2>
      <div class="space-y-3">
        <div>
          <label for="anthropic-key">API Key</label>
          <input id="anthropic-key" type="password" class="mt-1" placeholder="sk-ant-..."
            value="${settings.anthropic?.configured ? "••••••••••••••••" : ""}">
          ${settings.anthropic?.configured
            ? '<span class="text-xs text-success mt-1 block">已配置</span>'
            : '<span class="text-xs text-muted mt-1 block">未配置</span>'}
        </div>
      </div>
    </div>

    <div class="card mb-4">
      <h2 class="font-semibold mb-4">JIRA</h2>
      <div class="grid grid-cols-3 gap-4">
        <div>
          <label for="jira-url">Base URL</label>
          <input id="jira-url" class="mt-1" placeholder="https://your-domain.atlassian.net">
        </div>
        <div>
          <label for="jira-email">Email</label>
          <input id="jira-email" class="mt-1" placeholder="user@example.com">
        </div>
        <div>
          <label for="jira-token">API Token</label>
          <input id="jira-token" type="password" class="mt-1" placeholder="Token"
            value="${settings.jira?.configured ? "••••••••••••••••" : ""}">
          ${settings.jira?.configured
            ? '<span class="text-xs text-success mt-1 block">已配置</span>'
            : '<span class="text-xs text-muted mt-1 block">未配置</span>'}
        </div>
      </div>
    </div>

    <div class="card mb-4">
      <h2 class="font-semibold mb-4">Database</h2>
      <div class="grid grid-cols-5 gap-4">
        <div>
          <label for="db-host">Host</label>
          <input id="db-host" class="mt-1" placeholder="localhost">
        </div>
        <div>
          <label for="db-port">Port</label>
          <input id="db-port" type="number" class="mt-1" placeholder="5432">
        </div>
        <div>
          <label for="db-name">Database</label>
          <input id="db-name" class="mt-1" placeholder="mydb">
        </div>
        <div>
          <label for="db-user">User</label>
          <input id="db-user" class="mt-1" placeholder="user">
        </div>
        <div>
          <label for="db-password">Password</label>
          <input id="db-password" type="password" class="mt-1" placeholder="Password"
            value="${settings.database?.configured ? "••••••••••••••••" : ""}">
          ${settings.database?.configured
            ? '<span class="text-xs text-success mt-1 block">已配置</span>'
            : '<span class="text-xs text-muted mt-1 block">未配置</span>'}
        </div>
      </div>
    </div>

    <div class="card mb-4">
      <h2 class="font-semibold mb-4">CodeGraph</h2>
      <div>
        <label for="cg-path">Binary Path</label>
        <input id="cg-path" class="mt-1" value="${escapeHtml(settings.codegraph?.path || "~/.local/bin/codegraph")}">
      </div>
    </div>

    <div class="card mb-4">
      <h2 class="font-semibold mb-4">Custom Variables</h2>
      <div id="custom-vars-list" class="space-y-2"></div>
      <button id="add-var-btn" class="btn btn-sm mt-3">${icon("plus", 14)} Add Variable</button>
    </div>

    <div class="flex justify-between">
      <a href="#/home" class="btn btn-ghost">${icon("arrowLeft", 14)} Back</a>
      <button id="save-settings-btn" class="btn btn-primary">${icon("check", 14)} Save Settings</button>
    </div>`;

  // Render custom vars
  const varsList = document.getElementById("custom-vars-list");
  const customVars = settings.customVars || [];
  if (customVars.length === 0) {
    addVarRow(varsList, "", "");
  } else {
    customVars.forEach(v => addVarRow(varsList, v.key, v.configured ? "••••••••" : ""));
  }

  document.getElementById("add-var-btn").addEventListener("click", () => {
    addVarRow(varsList, "", "");
  });

  function addVarRow(container, key, value) {
    const row = document.createElement("div");
    row.className = "flex gap-2";
    row.innerHTML = `
      <input class="custom-var-key" placeholder="KEY" value="${escapeHtml(key)}" style="flex:1">
      <input class="custom-var-value" type="password" placeholder="Value" value="${escapeHtml(value)}" style="flex:2">
      <button class="btn btn-ghost btn-sm remove-var-btn" aria-label="Remove">${icon("x", 14)}</button>`;
    row.querySelector(".remove-var-btn").addEventListener("click", () => row.remove());
    container.appendChild(row);
  }

  // Save
  document.getElementById("save-settings-btn").addEventListener("click", async () => {
    const btn = document.getElementById("save-settings-btn");
    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner spinner-sm"></span> Saving...';

    const anthropicKey = document.getElementById("anthropic-key").value;
    const jiraToken = document.getElementById("jira-token").value;
    const dbPassword = document.getElementById("db-password").value;

    const payload = {};

    // Only send if user actually changed (not the placeholder dots)
    if (anthropicKey && !anthropicKey.startsWith("••")) {
      payload.anthropic = { apiKey: anthropicKey };
    }

    const jiraUrl = document.getElementById("jira-url").value;
    const jiraEmail = document.getElementById("jira-email").value;
    if (jiraUrl || jiraEmail || (jiraToken && !jiraToken.startsWith("••"))) {
      payload.jira = { baseUrl: jiraUrl, email: jiraEmail, token: jiraToken && !jiraToken.startsWith("••") ? jiraToken : undefined };
    }

    const dbHost = document.getElementById("db-host").value;
    const dbPort = parseInt(document.getElementById("db-port").value, 10) || 5432;
    const dbName = document.getElementById("db-name").value;
    const dbUser = document.getElementById("db-user").value;
    if (dbHost || dbName || dbUser || (dbPassword && !dbPassword.startsWith("••"))) {
      payload.database = {
        host: dbHost, port: dbPort, name: dbName, user: dbUser,
        password: dbPassword && !dbPassword.startsWith("••") ? dbPassword : undefined,
      };
    }

    const cgPath = document.getElementById("cg-path").value;
    if (cgPath) payload.codegraph = { path: cgPath };

    const customVarRows = varsList.querySelectorAll(".flex.gap-2");
    const vars = [];
    customVarRows.forEach(row => {
      const k = row.querySelector(".custom-var-key").value.trim();
      const v = row.querySelector(".custom-var-value").value;
      if (k) vars.push({ key: k, value: v && !v.startsWith("••") ? v : undefined });
    });
    if (vars.length > 0) payload.customVars = vars;

    try {
      if (Object.keys(payload).length > 0) {
        await api.updateSettings(payload);
        showToast("Settings saved", "success");
        // Reload to refresh configured states
        setTimeout(() => renderSettings(container), 500);
      } else {
        showToast("No changes to save");
        btn.disabled = false;
        btn.innerHTML = originalHTML;
      }
    } catch (e) {
      showToast("Failed to save: " + e.message);
      btn.disabled = false;
      btn.innerHTML = originalHTML;
    }
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add skills/audit/scripts/public/js/views/settings.mjs
git commit -m "feat: add settings page with credential management"
```

---

### Task 8: Add Project Scan card to wizard Step 1

**Files:**
- Modify: `skills/audit/scripts/public/js/views/wizard.mjs`

- [ ] **Step 1: Update step labels and count logic**

In `renderWizard()`, change the `render()` function's step logic (around line 90-93).

Change lines 90-93 from:

```javascript
    const totalSteps = reviewType === "all" ? 4 : 3;
    const stepLabels = reviewType === "all"
      ? ["Review Type", "Scope", "Stories", "Ready"]
      : ["Review Type", "Scope", "Ready"];
```

To:

```javascript
    const totalSteps = reviewType === "all" ? 4 : reviewType === "project" ? 3 : 3;
    const stepLabels = reviewType === "all"
      ? ["Review Type", "Scope", "Stories", "Ready"]
      : reviewType === "project"
        ? ["Review Type", "Configure", "Ready"]
        : ["Review Type", "Scope", "Ready"];
```

- [ ] **Step 2: Add Project Scan card to renderStep1()**

In `renderStep1()` (around line 126-148), change the 2-column grid to 3-column and add the third card.

Change line 129 from:

```javascript
        <div class="grid grid-cols-2 gap-4">
```

To:

```javascript
        <div class="grid grid-cols-3 gap-4">
```

Add after the "Code + Story" card closing `</div>` (after line 145) and before the grid closing `</div>`:

```javascript
          <div class="card card-clickable ${reviewType === "project" ? "selected" : ""}" data-type="project"
               style="${reviewType === "project" ? "border-color:var(--accent);background:var(--accent-dim);box-shadow:inset 0 0 0 1px var(--border-accent)" : ""}">
            <div class="flex items-center gap-2 mb-2">
              ${icon("search", 20)}
              <span class="font-medium">Project Scan</span>
            </div>
            <div class="text-sm text-secondary">Full project security and quality audit.</div>
          </div>
```

- [ ] **Step 3: Update step routing logic for project type**

In the `render()` function, change lines 117-121 from:

```javascript
    const actualStep = reviewType === "code" && step === 4 ? 3 : step;
    if (actualStep === 1) renderStep1();
    else if (actualStep === 2) renderStep2();
    else if (actualStep === 3 && reviewType === "all") renderStep3();
    else renderStep4();
```

To:

```javascript
    if (step === 1) renderStep1();
    else if (step === 2 && reviewType === "project") renderProjectConfigure();
    else if (step === 2) renderStep2();
    else if (step === 3 && reviewType === "project") renderProjectReady();
    else if (step === 3 && reviewType === "all") renderStep3();
    else if (step === 3 && reviewType === "code") renderStep4();
    else if (step === 4) renderStep4();
    else renderStep4();
```

- [ ] **Step 4: Add renderProjectConfigure() function**

Add this function after `renderStep1()` (after line 160):

```javascript
  function renderProjectConfigure() {
    const content = document.getElementById("wizard-content");
    content.innerHTML = `
      <div class="card mb-4">
        <h2 class="font-semibold mb-4">Configure Project Scan</h2>
        <div class="space-y-4">
          <div>
            <label for="project-dir">Project Directory</label>
            <input id="project-dir" class="mt-1" placeholder="/path/to/project">
            <div class="text-xs text-muted mt-1">Leave empty to scan the current project.</div>
          </div>
          <div>
            <label class="flex items-center gap-2">
              <input id="use-codegraph" type="checkbox" checked>
              <span class="text-sm">Use CodeGraph (if available)</span>
            </label>
            <div class="text-xs text-muted mt-1">AST-level analysis for more accurate call chain discovery.</div>
          </div>
        </div>

        <div class="mt-4 border-t" style="border-color:var(--border)">
          <div id="project-context-toggle" class="flex items-center gap-2 py-3 cursor-pointer" style="color:var(--text-secondary)">
            ${icon("messageSquare", 16)}
            <span class="text-sm font-medium">Review Context</span>
            <span class="text-xs text-muted ml-1">(optional)</span>
            <span id="project-context-chevron" class="ml-auto" style="transition:transform 200ms;transform:rotate(${contextExpanded ? "180" : "0"}deg)">${icon("chevronDown", 14)}</span>
          </div>
          <div id="project-context-panel" style="display:${contextExpanded ? "block" : "none"}">
            <textarea id="project-context-input" class="w-full" rows="4" placeholder="Project background, key requirements, areas of concern..."></textarea>
            <div class="text-xs text-muted mt-1">This context is passed to AI reviewers as additional guidance.</div>
          </div>
        </div>
      </div>
      <div class="flex justify-between">
        <button id="project-back" class="btn btn-ghost">${icon("arrowLeft", 14)} Back</button>
        <button id="project-next" class="btn btn-primary">Next ${icon("chevronRight", 14)}</button>
      </div>`;

    // Load session to get projectDir
    api.getSession(sessionId).then(session => {
      const dirInput = document.getElementById("project-dir");
      if (dirInput && session.projectDir) dirInput.value = session.projectDir;
    }).catch(() => {});

    // Load existing context
    api.getReviewContext(sessionId).then(data => {
      const input = document.getElementById("project-context-input");
      if (input && data.context) {
        const match = data.context.match(/## User Context\n([\s\S]*?)(?=\n## Review Notes|$)/);
        input.value = match ? match[1].trim() : data.context.trim();
      }
    }).catch(() => {});

    // Toggle context
    document.getElementById("project-context-toggle").addEventListener("click", () => {
      contextExpanded = !contextExpanded;
      document.getElementById("project-context-panel").style.display = contextExpanded ? "block" : "none";
      document.getElementById("project-context-chevron").style.transform = `rotate(${contextExpanded ? 180 : 0}deg)`;
      save();
    });

    // Save context on blur
    let ctxTimer = null;
    const ctxInput = document.getElementById("project-context-input");
    if (ctxInput) {
      ctxInput.addEventListener("blur", () => {
        clearTimeout(ctxTimer);
        ctxTimer = setTimeout(async () => {
          try { await api.setReviewContext(sessionId, ctxInput.value); } catch {}
        }, 300);
      });
    }

    document.getElementById("project-back").addEventListener("click", () => { step = 1; save(); render(); });
    document.getElementById("project-next").addEventListener("click", async () => {
      const btn = document.getElementById("project-next");
      const originalHTML = btn.innerHTML;
      const projectDir = document.getElementById("project-dir").value.trim();
      try {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner spinner-sm"></span> Saving...';
        // Save context
        if (ctxInput) {
          try { await api.setReviewContext(sessionId, ctxInput.value); } catch {}
        }
        // Update project dir if provided
        if (projectDir) {
          await api.createSession({ type: "project", projectDir });
          // Actually we need to update existing session, not create new one
          // The session was already created, just save context and move on
        }
        step = 3;
        save();
        render();
      } catch (e) {
        showToast("Failed: " + e.message);
        btn.disabled = false;
        btn.innerHTML = originalHTML;
      }
    });
  }
```

- [ ] **Step 5: Add renderProjectReady() function**

Add after `renderProjectConfigure()`:

```javascript
  function renderProjectReady() {
    const content = document.getElementById("wizard-content");
    content.innerHTML = `
      <div class="card mb-4">
        <h2 class="font-semibold mb-4">Ready to Scan</h2>
        <div class="space-y-3">
          <div class="flex items-center gap-3">
            <span style="color:var(--text-muted)">${icon("search", 18)}</span>
            <div>
              <div class="text-xs text-muted">Review Type</div>
              <div class="text-sm font-medium">Project Scan</div>
            </div>
          </div>
        </div>

        <div class="mt-4 info-banner info-banner-amber">
          ${icon("zap", 16)}
          <span>Click "Start Scan" below. The scan will discover entry points and analyze your project.</span>
        </div>
      </div>
      <div class="flex justify-between">
        <button id="project-ready-back" class="btn btn-ghost">${icon("arrowLeft", 14)} Back</button>
        <button id="start-project-scan-btn" class="btn btn-primary">
          ${icon("search", 14)}
          Start Scan
        </button>
      </div>`;

    document.getElementById("project-ready-back").addEventListener("click", () => { step = 2; save(); render(); });
    document.getElementById("start-project-scan-btn").addEventListener("click", async () => {
      const btn = document.getElementById("start-project-scan-btn");
      const originalHTML = btn.innerHTML;
      try {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner spinner-sm"></span> Preparing...';
        await api.updateSessionStatus(sessionId, "ready");
        localStorage.removeItem(savedKey);
        location.hash = `#/progress/${sessionId}`;
      } catch (e) {
        showToast("Failed to start scan: " + e.message);
        btn.disabled = false;
        btn.innerHTML = originalHTML;
      }
    });
  }
```

- [ ] **Step 6: Handle project session creation**

When the user picks "Project Scan" in Step 1, the current session was already created as `type: "code"` by `home.mjs`. We need to create a new session with `type: "project"` instead.

Change the card click handler in `renderStep1()` (lines 152-158) from:

```javascript
    content.querySelectorAll("[data-type]").forEach(card => {
      card.addEventListener("click", () => {
        reviewType = card.dataset.type;
        save();
        render();
      });
    });
```

To:

```javascript
    content.querySelectorAll("[data-type]").forEach(card => {
      card.addEventListener("click", async () => {
        const newType = card.dataset.type;
        if (newType === "project" && reviewType !== "project") {
          try {
            const { id } = await api.createSession({ type: "project" });
            localStorage.removeItem(savedKey);
            location.hash = `#/wizard/${id}`;
            return;
          } catch (e) { showToast("Failed to create session: " + e.message); }
        }
        reviewType = newType;
        save();
        render();
      });
    });
```

When the user clicks "Project Scan", a new `type: "project"` session is created and the wizard reloads with that session. For "code" and "all" types, the existing client-side behavior is preserved.

- [ ] **Step 7: Commit**

```bash
git add skills/audit/scripts/public/js/views/wizard.mjs
git commit -m "feat: add project scan card to wizard Step 1 with configure and ready steps"
```

---

### Task 9: Auto-trigger scan in progress view for project sessions

**Files:**
- Modify: `skills/audit/scripts/public/js/views/progress.mjs`

- [ ] **Step 1: Auto-trigger scan when project session status is "ready"**

In the `poll()` function, after the existing check for `session.type === "project" && (session.status === "created" || session.status === "scanning")` (around line 72), add auto-trigger logic for `ready` state.

Add after line 91 (after the `return;` in the scanning block):

```javascript
      // Auto-trigger scan when project session becomes ready
      if (session.type === "project" && session.status === "ready") {
        scanOverlay.classList.remove("hidden");
        document.getElementById("task-list").innerHTML = "";
        document.getElementById("progress-text").textContent = "Auto-starting scan...";
        document.getElementById("progress-pct").textContent = "";
        document.getElementById("progress-fill").style.width = "0%";
        document.getElementById("session-badge").innerHTML = `<span class="badge badge-ready">ready</span>`;
        startBtn.classList.add("hidden");
        scanStatusEl.classList.remove("hidden");
        scanStatusEl.textContent = "Auto-starting scan...";
        try {
          await api.startScan(sessionId);
          scanStatusEl.textContent = "Scanning in progress...";
        } catch (e) {
          scanStatusEl.textContent = "Auto-scan failed: " + e.message;
          startBtn.classList.remove("hidden");
          startBtn.disabled = false;
          startBtn.innerHTML = `${icon("search", 14)} Start Scan`;
          showToast("Auto-scan failed: " + e.message);
        }
        pollTimer = setTimeout(poll, 3000);
        return;
      }
```

- [ ] **Step 2: Commit**

```bash
git add skills/audit/scripts/public/js/views/progress.mjs
git commit -m "feat: auto-trigger scan when project session is ready"
```

---

### Task 10: Verify and clean up

**Files:**
- All modified files

- [ ] **Step 1: Run syntax check on all modified backend files**

```bash
node --check skills/audit/scripts/server/handlers/settings.mjs
node --check skills/audit/scripts/server/index.mjs
node --check skills/audit/scripts/lib/project-scan.mjs
node --check skills/audit/scripts/server/handlers/project-scan.mjs
```

Expected: No output (no syntax errors).

- [ ] **Step 2: Commit any fixes**

```bash
git add -u
git commit -m "fix: address issues found during verification"
```
