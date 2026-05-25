# Fix Project Scan Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the project scan wizard flow so scan+group happens entirely in the wizard, projectDir defaults to the current project, and the progress page only handles reviewing.

**Architecture:** Three files change. The server returns `projectDir` on session creation. The wizard's Group step triggers scan on entry and manages the full scan→group→confirm lifecycle. The progress page stops handling scan/group states for project sessions.

**Tech Stack:** Node.js (ESM), vanilla JS frontend

---

### Task 1: Return projectDir in session creation response

**Files:**
- Modify: `skills/audit/scripts/server/handlers/sessions.mjs:2,34-46`

- [ ] **Step 1: Add resolveProjectDir import**

In `skills/audit/scripts/server/handlers/sessions.mjs`, add the import at line 2, after the existing imports:

```javascript
import { resolveProjectDir } from "../../lib/paths.mjs";
```

- [ ] **Step 2: Include projectDir in POST /api/sessions response**

In the same file, change the response at line 45 from:

```javascript
    jsonResponse(res, { id: result.id }, 201);
```

to:

```javascript
    jsonResponse(res, { id: result.id, projectDir: resolveProjectDir() }, 201);
```

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/server/handlers/sessions.mjs
git commit -m "feat: return projectDir in session creation response"
```

---

### Task 2: Capture projectDir in wizard and prefill Configure step

**Files:**
- Modify: `skills/audit/scripts/public/js/views/wizard.mjs:128-142,296-312,365-369`

- [ ] **Step 1: Add defaultProjectDir variable**

In `renderWizard`, after the variable declarations (after line 141, `let pendingExpandIndex = -1;`), add:

```javascript
  let defaultProjectDir = "";
```

- [ ] **Step 2: Capture projectDir from create session response**

In `renderStep1`, the `step1-next` click handler creates a session when `isNew` (around line 304). Change:

```javascript
          const { id } = await api.createSession({ type: reviewType });
          sessionId = id;
          location.hash = `#/wizard/${id}`;
```

to:

```javascript
          const { id, projectDir } = await api.createSession({ type: reviewType });
          sessionId = id;
          defaultProjectDir = projectDir || "";
          location.hash = `#/wizard/${id}`;
```

- [ ] **Step 3: Prefill project directory input when session has no projectDir**

In `renderProjectConfigure`, the session fetch at line 365-369 sets the input value only if `session.projectDir` exists. Change:

```javascript
    api.getSession(sessionId).then(session => {
      const dirInput = document.getElementById("project-dir");
      if (dirInput && session.projectDir) dirInput.value = session.projectDir;
      renderCodegraphStatus("codegraph-status", session.projectDir || "");
    }).catch(() => {});
```

to:

```javascript
    api.getSession(sessionId).then(session => {
      const dirInput = document.getElementById("project-dir");
      if (dirInput) {
        dirInput.value = session.projectDir || defaultProjectDir || "";
      }
      renderCodegraphStatus("codegraph-status", session.projectDir || defaultProjectDir || "");
    }).catch(() => {});
```

- [ ] **Step 4: Commit**

```bash
git add skills/audit/scripts/public/js/views/wizard.mjs
git commit -m "feat: prefill projectDir in wizard Configure step"
```

---

### Task 3: Fix wizard state restore for scanned/grouping sessions

**Files:**
- Modify: `skills/audit/scripts/public/js/views/wizard.mjs:185-188`

- [ ] **Step 1: Jump to step 3 for scanned/grouping project sessions**

In the server restore block (around line 185), change:

```javascript
        } else if (session?.type === "project") {
          reviewType = "project";
          step = 2;
          save();
        }
```

to:

```javascript
        } else if (session?.type === "project") {
          reviewType = "project";
          if (["scanned", "grouping", "ready"].includes(session.status)) {
            step = 3;
          } else {
            step = 2;
          }
          save();
        }
```

This ensures that when a user returns to the wizard for a session that's already been scanned, they land on the Group step (step 3) instead of Configure (step 2). The `ready` status is included because the user might want to go back from step 4 to step 3.

- [ ] **Step 2: Commit**

```bash
git add skills/audit/scripts/public/js/views/wizard.mjs
git commit -m "fix: restore wizard to Group step for scanned/grouping project sessions"
```

---

### Task 4: Add scan trigger to Group step

**Files:**
- Modify: `skills/audit/scripts/public/js/views/wizard.mjs:435-583`

- [ ] **Step 1: Replace renderGroupStep with scan-aware version**

Replace the entire `renderGroupStep()` function (lines 435-583) with:

```javascript
  function renderGroupStep() {
    const content = document.getElementById("wizard-content");
    content.innerHTML = `
      <div class="card mb-4">
        <h2 class="font-semibold mb-4">Scan & Group Files</h2>
        <div id="group-step-content">
          <div class="text-sm text-secondary"><span class="spinner spinner-sm"></span> Checking scan status...</div>
        </div>
      </div>
      <div class="flex justify-between">
        <button id="group-back" class="btn btn-ghost">${icon("arrowLeft", 14)} Back</button>
        <button id="group-confirm-btn" class="btn btn-primary" disabled>Confirm Groups ${icon("check", 14)}</button>
      </div>`;

    document.getElementById("group-back").addEventListener("click", () => { if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; } step = 2; save(); render(); });

    let groups = null;
    let pollTimer = null;

    function clearPoll() {
      if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
    }

    function schedulePoll(fn, ms) {
      clearPoll();
      pollTimer = setTimeout(fn, ms);
    }

    function renderScanning() {
      const el = document.getElementById("group-step-content");
      el.innerHTML = `
        <div class="space-y-4">
          <div class="flex items-center gap-2 text-sm text-secondary">
            <span class="spinner spinner-sm"></span> Scanning project files...
          </div>
          <div class="scan-log-section">
            <button id="scan-log-toggle" class="scan-log-toggle">
              <span class="toggle-icon">${icon("chevronRight", 10)}</span> Scan Log
            </button>
            <div id="scan-log-panel" class="scan-log-panel"></div>
          </div>
        </div>`;

      // Start SSE log stream
      const logPanel = document.getElementById("scan-log-panel");
      const logToggle = document.getElementById("scan-log-toggle");
      if (logToggle) {
        logToggle.addEventListener("click", () => {
          logPanel?.classList.toggle("open");
          logToggle.classList.toggle("open");
        });
      }

      let es = null;
      try {
        es = new EventSource(`/api/sessions/${sessionId}/scan/logs`);
        es.onmessage = (e) => {
          try {
            const entry = JSON.parse(e.data);
            if (!logPanel) return;
            const div = document.createElement("div");
            div.className = "scan-log-entry";
            div.innerHTML = `<span class="log-time">${escapeHtml(entry.timestamp)}</span>${escapeHtml(entry.message)}`;
            logPanel.appendChild(div);
            logPanel.scrollTop = logPanel.scrollHeight;
            if (!logPanel.classList.contains("open")) {
              logPanel.classList.add("open");
              if (logToggle) logToggle.classList.add("open");
            }
          } catch {}
        };
        es.onerror = () => { es?.close(); es = null; };
      } catch {}

      onNavigateCleanup(() => { es?.close(); clearPoll(); });
    }

    function pollScanStatus() {
      api.getScanStatus(sessionId).then(data => {
        if (data.status === "scanned") {
          renderPending();
        } else if (data.status === "done") {
          // Already confirmed — jump to ready
          step = 4;
          save();
          render();
        } else if (data.status === "scanning") {
          schedulePoll(pollScanStatus, 2000);
        } else {
          // Not started yet — trigger scan
          triggerScan();
        }
      }).catch(() => {
        schedulePoll(pollScanStatus, 3000);
      });
    }

    function triggerScan() {
      renderScanning();
      api.startScan(sessionId).then(() => {
        schedulePoll(pollScanStatus, 2000);
      }).catch(e => {
        const el = document.getElementById("group-step-content");
        el.innerHTML = `
          <div class="space-y-4">
            <div class="text-sm text-danger">${icon("alertTriangle", 14)} Scan failed: ${escapeHtml(e.message)}</div>
            <button id="retry-scan-btn" class="btn btn-sm">Retry Scan</button>
          </div>`;
        document.getElementById("retry-scan-btn")?.addEventListener("click", () => triggerScan());
      });
    }

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
      clearPoll();
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

      schedulePoll(pollForGroups, 3000);
    }

    function renderGroupsLoaded() {
      clearPoll();
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

    // Entry point: check scan status and decide what to show
    api.getScanStatus(sessionId).then(data => {
      if (data.status === "scanned") {
        // Scan already done — check if groups exist
        pollForGroups();
      } else if (data.status === "done") {
        // Already confirmed — go to ready
        step = 4;
        save();
        render();
      } else {
        // Not scanned yet — trigger scan
        triggerScan();
      }
    }).catch(() => {
      // Status check failed — try triggering scan
      triggerScan();
    });

    onNavigateCleanup(() => clearPoll());
  }
```

- [ ] **Step 2: Commit**

```bash
git add skills/audit/scripts/public/js/views/wizard.mjs
git commit -m "feat: add scan trigger to Group step with scanning/pending/loaded states"
```

---

### Task 5: Update Project Ready step for confirmed groups

**Files:**
- Modify: `skills/audit/scripts/public/js/views/wizard.mjs:586-639`

- [ ] **Step 1: Replace renderProjectReady with group-aware version**

Replace the `renderProjectReady()` function with:

```javascript
  function renderProjectReady() {
    const content = document.getElementById("wizard-content");
    content.innerHTML = `
      <div class="card mb-4">
        <h2 class="font-semibold mb-4">Ready to Review</h2>
        <div class="space-y-3">
          <div class="flex items-center gap-3">
            <span style="color:var(--text-muted)">${icon("search", 18)}</span>
            <div>
              <div class="text-xs text-muted">Review Type</div>
              <div class="text-sm font-medium">Project Scan</div>
            </div>
          </div>
          <div id="project-ready-summary"></div>
        </div>

        <div class="mt-4 info-banner info-banner-amber">
          ${icon("zap", 16)}
          <span>Click "Start Review" below, then go back to the AI terminal and type <strong>start review</strong> to begin.</span>
        </div>
      </div>
      <div class="flex justify-between">
        <button id="project-ready-back" class="btn btn-ghost">${icon("arrowLeft", 14)} Back</button>
        <button id="start-project-scan-btn" class="btn btn-primary">
          ${icon("zap", 14)}
          Start Review
        </button>
      </div>`;

    // Load group summary
    api.getTasks(sessionId).then(tasks => {
      const summary = document.getElementById("project-ready-summary");
      if (summary && tasks.length > 0) {
        summary.innerHTML = `
          <div class="flex items-center gap-3">
            <span style="color:var(--text-muted)">${icon("package", 18)}</span>
            <div>
              <div class="text-xs text-muted">Groups</div>
              <div class="text-sm font-medium">${tasks.length} review groups configured</div>
            </div>
          </div>`;
      }
    }).catch(() => {});

    document.getElementById("project-ready-back").addEventListener("click", () => { step = 3; save(); render(); });
    document.getElementById("start-project-scan-btn").addEventListener("click", async () => {
      const btn = document.getElementById("start-project-scan-btn");
      const originalHTML = btn.innerHTML;
      try {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner spinner-sm"></span> Preparing...';
        localStorage.removeItem(`audit-wizard-${sessionId}`);
        const wizardContent = document.getElementById("wizard-content");
        wizardContent.innerHTML = `
          <div class="card" style="text-align:center;padding:var(--space-8) var(--space-6)">
            <div style="margin-bottom:var(--space-4);color:var(--accent)">${icon("check", 48)}</div>
            <h2 class="text-xl mb-3">Audit Ready</h2>
            <p class="text-secondary mb-4">Session is prepared. Go back to the AI terminal and type:</p>
            <code style="font-size:var(--text-lg);background:var(--bg-elevated);padding:var(--space-2) var(--space-4);border-radius:var(--radius-md);display:inline-block">start review</code>
            <div class="mt-4">
              <a href="#/progress/${sessionId}" class="btn btn-ghost">View Progress ${icon("chevronRight", 14)}</a>
            </div>
          </div>`;
      } catch (e) {
        showToast("Failed: " + e.message);
        btn.disabled = false;
        btn.innerHTML = originalHTML;
      }
    });
  }
```

- [ ] **Step 2: Commit**

```bash
git add skills/audit/scripts/public/js/views/wizard.mjs
git commit -m "fix: update Project Ready step to show group summary and start review"
```

---

### Task 6: Remove scan/group handling from Progress page

**Files:**
- Modify: `skills/audit/scripts/public/js/views/progress.mjs:69-209`

- [ ] **Step 1: Replace project session handling in poll function**

In `poll()`, replace the entire block that handles project sessions in scan/group states (lines 140-209, from `const scanOverlay` through the `return;` after the auto-scan trigger). Replace with:

```javascript
      const scanOverlay = document.getElementById("scan-overlay");

      // If project session is still in configuration states, redirect to wizard
      if (session.type === "project" && ["created", "scanning", "scanned", "grouping"].includes(session.status)) {
        scanOverlay.classList.remove("hidden");
        updateHeading(true, session.status);
        document.getElementById("task-list").innerHTML = "";
        document.getElementById("progress-text").textContent = "";
        document.getElementById("progress-pct").textContent = "";
        document.getElementById("progress-fill").style.width = "0%";
        document.getElementById("session-badge").innerHTML = `<span class="badge badge-${escapeHtml(session.status)}">${escapeHtml(session.status)}</span>`;

        const scanStatusEl = document.getElementById("scan-status");
        scanStatusEl.classList.remove("hidden");
        const startBtn = document.getElementById("start-scan-btn");
        startBtn.classList.add("hidden");
        scanStatusEl.innerHTML = `Session is still being configured. <a href="#/wizard/${sessionId}" style="color:var(--accent);text-decoration:underline">Go to wizard</a> to continue.`;

        pollTimer = setTimeout(poll, 5000);
        return;
      }
```

This replaces both the scan state handlers (lines 145-179) and the auto-scan trigger (lines 183-209).

- [ ] **Step 2: Remove the scan overlay button handlers that are no longer needed**

Since the progress page no longer triggers scans for project sessions, the `start-scan-btn` click handler (around line 290-312) is still needed for code/story sessions but not for project. No change needed there — it's generic.

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/public/js/views/progress.mjs
git commit -m "fix: remove scan/group handling from progress page for project sessions"
```

---

### Task 7: Smoke test the full flow

**Files:**
- No files to modify

- [ ] **Step 1: Start the server**

```bash
cd skills/audit && node scripts/cli.mjs server
```

- [ ] **Step 2: Test session creation returns projectDir**

```bash
curl -s -X POST http://localhost:3456/api/sessions -H 'Content-Type: application/json' -d '{"type":"project"}'
```

Expected: `{"id":"...","projectDir":"/path/to/project"}`

- [ ] **Step 3: Test in browser**

1. Open http://localhost:3456
2. Create new Project Scan session
3. Verify Configure step shows projectDir prefilled
4. Click Next — should land on Scan & Group step
5. Verify scan triggers automatically and shows progress
6. After scan completes, verify it shows "type group <id>" prompt
7. In the AI terminal, run `group <session-id>`
8. Verify groups appear as cards
9. Click Confirm Groups
10. Verify Ready step shows group summary
11. Click Start Review
12. Navigate to Progress page — verify it shows reviewing state, not scan state

- [ ] **Step 4: Commit any remaining changes**

```bash
git status
```
