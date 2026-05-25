# AI Terminal Prompt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace misleading "Start AI Review" web buttons with prominent terminal-style cards that guide users to type commands in their AI terminal.

**Architecture:** Create a shared `renderTerminalCard()` helper in `app.mjs` that returns HTML and wires up a copy-to-clipboard button. Add `.terminal-card` CSS styles. Modify 4 view contexts in `wizard.mjs` and `progress.mjs` to use the new component.

**Tech Stack:** Vanilla JS (ES modules), CSS custom properties, no framework

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `skills/audit/scripts/public/js/app.mjs` | Modify | Add `renderTerminalCard()` export |
| `skills/audit/scripts/public/styles.css` | Modify | Add `.terminal-card*` styles |
| `skills/audit/scripts/public/js/views/wizard.mjs` | Modify | `renderProjectReady`, `renderStep4`, `renderPending` |
| `skills/audit/scripts/public/js/views/progress.mjs` | Modify | `scan-overlay` section |

---

### Task 1: Add Terminal Card CSS

**Files:**
- Modify: `skills/audit/scripts/public/styles.css` (append after line 1013, before the Finding Card section)

- [ ] **Step 1: Add `.terminal-card` CSS block**

Insert after line 1013 (after `.info-banner-amber`), before the `/* ─── Finding Card ─── */` comment:

```css
/* ─── Terminal Card ─── */
.terminal-card {
  background: var(--bg-deep);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-sm), 0 0 20px var(--accent-glow);
}
.terminal-card-titlebar {
  background: var(--bg-elevated);
  padding: var(--space-2) var(--space-3);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  border-bottom: 1px solid var(--border);
}
.terminal-card-dots {
  display: flex;
  gap: 6px;
  margin-right: var(--space-2);
}
.terminal-card-dots span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.15);
}
.terminal-card-dots span:first-child { background: rgba(239, 68, 68, 0.5); }
.terminal-card-dots span:nth-child(2) { background: rgba(245, 158, 11, 0.5); }
.terminal-card-dots span:nth-child(3) { background: rgba(34, 197, 94, 0.5); }
.terminal-card-title {
  font-size: var(--text-xs);
  color: var(--text-muted);
  font-family: var(--font-mono);
  letter-spacing: 0.5px;
  text-transform: uppercase;
}
.terminal-card-body {
  padding: var(--space-6) var(--space-6) var(--space-5);
}
.terminal-card-instruction {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  margin-bottom: var(--space-4);
}
.terminal-card-cmd {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  font-family: var(--font-mono);
  font-size: var(--text-lg);
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}
.terminal-card-cmd-text {
  overflow-x: auto;
  white-space: nowrap;
}
.terminal-card-copy {
  flex-shrink: 0;
  background: none;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  padding: var(--space-1) var(--space-2);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: var(--text-xs);
  font-family: var(--font-ui);
  transition: color var(--duration-fast), border-color var(--duration-fast);
}
.terminal-card-copy:hover {
  color: var(--text-secondary);
  border-color: var(--border-hover);
}
.terminal-card-copy.copied {
  color: var(--accent);
  border-color: var(--border-accent);
}
```

- [ ] **Step 2: Verify CSS loads**

Run the server and open the app in a browser — confirm no console errors from the CSS.

```bash
cd skills/audit/scripts && node cli.mjs serve
```

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/public/styles.css
git commit -m "feat: add terminal-card CSS styles for AI terminal prompt component"
```

---

### Task 2: Add `renderTerminalCard()` Helper

**Files:**
- Modify: `skills/audit/scripts/public/js/app.mjs` (after the `initTabKeyboard` function, around line 255)

- [ ] **Step 1: Add the exported function**

Insert after the `initTabKeyboard` function (after line 255), before `window.addEventListener("hashchange", navigate);`:

```javascript
// ─── Terminal Card Component ───

export function renderTerminalCard(container, command, options = {}) {
  const instruction = options.instruction || "Go to your AI terminal and type:";
  const viewProgressHref = options.viewProgressHref || null;

  container.innerHTML = `
    <div class="terminal-card" role="region" aria-label="AI Terminal Instruction">
      <div class="terminal-card-titlebar">
        <div class="terminal-card-dots"><span></span><span></span><span></span></div>
        <span class="terminal-card-title">AI Terminal</span>
      </div>
      <div class="terminal-card-body">
        <div class="terminal-card-instruction">${escapeHtml(instruction)}</div>
        <div class="terminal-card-cmd">
          <span class="terminal-card-cmd-text" role="textbox" aria-readonly="true">${escapeHtml(command)}</span>
          <button class="terminal-card-copy" aria-label="Copy command" data-cmd="${escapeHtml(command)}">${icon("clipboard", 12)} Copy</button>
        </div>
        ${viewProgressHref ? `<div style="margin-top:var(--space-5);text-align:center"><a href="${viewProgressHref}" class="btn btn-ghost">${icon("barChart", 14)} View Progress ${icon("chevronRight", 14)}</a></div>` : ""}
      </div>
    </div>`;

  const copyBtn = container.querySelector(".terminal-card-copy");
  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(copyBtn.dataset.cmd);
        copyBtn.classList.add("copied");
        copyBtn.innerHTML = `${icon("check", 12)} Copied!`;
        setTimeout(() => {
          copyBtn.classList.remove("copied");
          copyBtn.innerHTML = `${icon("clipboard", 12)} Copy`;
        }, 2000);
      } catch {
        // Fallback: select text
        const cmdText = container.querySelector(".terminal-card-cmd-text");
        if (cmdText) {
          const range = document.createRange();
          range.selectNodeContents(cmdText);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
    });
  }
}
```

- [ ] **Step 2: Verify no import errors**

Open the app in a browser, check the console for import/syntax errors. The app should load normally since nothing calls `renderTerminalCard` yet.

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/public/js/app.mjs
git commit -m "feat: add renderTerminalCard() shared component with copy-to-clipboard"
```

---

### Task 3: Modify `renderProjectReady` (Context 1 — Project Scan)

**Files:**
- Modify: `skills/audit/scripts/public/js/views/wizard.mjs:776-824` (`renderProjectReady` function)
- The file already imports from `app.mjs` — add `renderTerminalCard` to the import

- [ ] **Step 1: Update the import at the top of wizard.mjs**

On line 3, change:

```javascript
import { showToast, setBreadcrumb, icon, escapeHtml, initTabKeyboard, onNavigateCleanup } from "../app.mjs";
```

to:

```javascript
import { showToast, setBreadcrumb, icon, escapeHtml, initTabKeyboard, onNavigateCleanup, renderTerminalCard } from "../app.mjs";
```

- [ ] **Step 2: Rewrite `renderProjectReady`**

Replace the entire `renderProjectReady` function (lines 776–824) with:

```javascript
  function renderProjectReady() {
    const content = document.getElementById("wizard-content");
    content.innerHTML = `
      <h2 style="margin-bottom:var(--space-6)">Review Ready</h2>
      <div id="project-ready-summary"></div>
      <div id="project-ready-terminal"></div>`;

    // Load group summary
    api.getTasks(sessionId).then(tasks => {
      const summary = document.getElementById("project-ready-summary");
      if (summary) {
        const groupCount = tasks.length;
        const fileCount = tasks.reduce((sum, t) => sum + (t.files ? t.files.length : 0), 0);
        summary.innerHTML = `
          <div class="ready-summary-grid">
            <div class="ready-summary-card">
              <div class="summary-icon">${icon("folder-search", 20)}</div>
              <div class="summary-label">Type</div>
              <div class="summary-value">Project Scan</div>
            </div>
            <div class="ready-summary-card">
              <div class="summary-icon">${icon("file", 20)}</div>
              <div class="summary-label">Scope</div>
              <div class="summary-value">${groupCount} groups, ${fileCount} files</div>
            </div>
          </div>`;
      }
    }).catch(() => {});

    setDirty(false);
    localStorage.removeItem(`audit-wizard-${sessionId}`);

    const termEl = document.getElementById("project-ready-terminal");
    renderTerminalCard(termEl, "start review", {
      viewProgressHref: `#/progress/${sessionId}`,
    });
  }
```

- [ ] **Step 3: Verify in browser**

Create a project scan session, complete steps 1-3, reach step 4. Confirm:
- No "Start AI Review" button
- Terminal card is visible with `start review` command
- Copy button works
- "View Progress" link navigates to `#/progress/{sessionId}`

- [ ] **Step 4: Commit**

```bash
git add skills/audit/scripts/public/js/views/wizard.mjs
git commit -m "feat: replace project-scan 'Start AI Review' button with terminal card prompt"
```

---

### Task 4: Modify `renderStep4` (Context 2 — Code Review Ready)

**Files:**
- Modify: `skills/audit/scripts/public/js/views/wizard.mjs:1279-1397` (`renderStep4` function)

- [ ] **Step 1: Rewrite `renderStep4`**

Replace the entire `renderStep4` function (lines 1279–1397) with:

```javascript
  function renderStep4() {
    const content = document.getElementById("wizard-content");
    content.innerHTML = `
      <div class="card mb-4">
        <h2 class="font-semibold mb-4">Ready to Start</h2>
        <div class="ready-summary-grid">
          <div class="ready-summary-card">
            <div class="summary-icon">${icon("eye", 20)}</div>
            <div class="summary-label">Type</div>
            <div class="summary-value">${reviewType === "code" ? "Code Review" : "Code + Story"}</div>
          </div>
          <div class="ready-summary-card">
            <div class="summary-icon">${icon("gitCommit", 20)}</div>
            <div class="summary-label">Scope</div>
            <div class="summary-value">${formatScopeDisplay(scopeMethod, scopeRef)}</div>
          </div>
          ${reviewType === "all" ? `
          <div class="ready-summary-card">
            <div class="summary-icon">${icon("clipboard", 20)}</div>
            <div class="summary-label">Stories</div>
            <div class="summary-value">${stories.length} stories</div>
          </div>` : ""}
        </div>

        <div class="mt-4 border-t" style="border-color:var(--border)">
          <div id="context-toggle" class="flex items-center gap-2 py-3 cursor-pointer" style="color:var(--text-secondary)">
            ${icon("messageSquare", 16)}
            <span class="text-sm font-medium">Review Context</span>
            <span class="text-xs text-muted ml-1">(optional)</span>
            <span id="context-chevron" class="ml-auto" style="transition:transform 200ms;transform:rotate(${contextExpanded ? "180" : "0"}deg)">${icon("chevronDown", 14)}</span>
          </div>
          <div id="context-panel" style="display:${contextExpanded ? "block" : "none"}">
            <textarea id="review-context-input" class="w-full" rows="4" placeholder="Project background, key requirements, areas of concern, known issues..."></textarea>
            <div class="text-xs text-muted mt-1">This context is passed to AI reviewers as additional guidance.</div>
          </div>
        </div>
      </div>
      <div id="step4-terminal"></div>
      <div class="flex justify-between mt-4">
        <button id="step4-back" class="btn btn-ghost" aria-label="Go back">${icon("arrowLeft", 14)} Back</button>
      </div>`;

    // Load existing context (extract only User Context section)
    api.getReviewContext(sessionId).then(data => {
      const input = document.getElementById("review-context-input");
      if (input && data.context) {
        const match = data.context.match(/## User Context\n([\s\S]*?)(?=\n## Review Notes|$)/);
        input.value = match ? match[1].trim() : data.context.trim();
      }
    }).catch(() => {});

    // Toggle collapsible
    document.getElementById("context-toggle").addEventListener("click", () => {
      contextExpanded = !contextExpanded;
      const panel = document.getElementById("context-panel");
      const chevron = document.getElementById("context-chevron");
      panel.style.display = contextExpanded ? "block" : "none";
      chevron.style.transform = `rotate(${contextExpanded ? 180 : 0}deg)`;
      save();
    });

    // Save context on blur (debounced)
    let contextSaveTimer = null;
    const contextInput = document.getElementById("review-context-input");
    if (contextInput) {
      contextInput.addEventListener("blur", () => {
        clearTimeout(contextSaveTimer);
        contextSaveTimer = setTimeout(async () => {
          try {
            await api.setReviewContext(sessionId, contextInput.value);
          } catch { /* silent fail — context is optional */ }
        }, 300);
      });
    }

    document.getElementById("step4-back").addEventListener("click", () => {
      goBack(reviewType === "code" ? 2 : 3, "step4-back");
    });

    setDirty(false);
    localStorage.removeItem(`audit-wizard-${sessionId}`);

    const termEl = document.getElementById("step4-terminal");
    renderTerminalCard(termEl, "start review", {
      viewProgressHref: `#/progress/${sessionId}`,
    });
  }
```

- [ ] **Step 2: Verify in browser**

Create a code review session, complete steps 1-2, reach step 3 (Ready). Confirm:
- No "Start AI Review" button
- Terminal card is visible with `start review` command
- Copy button works
- "View Progress" link navigates to `#/progress/{sessionId}`
- Review context accordion still works (expand/collapse, save on blur)
- Back button works

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/public/js/views/wizard.mjs
git commit -m "feat: replace code-review 'Start AI Review' button with terminal card prompt"
```

---

### Task 5: Modify `renderPending` (Context 3 — Grouping Step)

**Files:**
- Modify: `skills/audit/scripts/public/js/views/wizard.mjs:626-667` (`renderPending` function inside `renderGroupStep`)

- [ ] **Step 1: Rewrite `renderPending`**

Replace the entire `renderPending` function (lines 626–667) with:

```javascript
    function renderPending() {
      clearPoll();
      const el = document.getElementById("group-step-content");
      api.getGraphData(sessionId).then(graphData => {
        const entryList = (graphData.entryFiles || []).slice(0, 8);
        const moreCount = Math.max(0, (graphData.entryFiles || []).length - 8);
        el.innerHTML = `
          <div class="space-y-4">
            <div class="scan-file-count">${icon("file", 12)} Found ${graphData.totalFiles || 0} files</div>
            <div class="text-sm text-secondary">${(graphData.entryFiles || []).length} entry points detected</div>
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
            <div id="group-terminal-card"></div>
            <div class="flex items-center gap-2 text-sm text-muted">
              <span class="spinner spinner-sm"></span> Waiting for grouping...
            </div>
          </div>`;

        const termEl = document.getElementById("group-terminal-card");
        renderTerminalCard(termEl, `group ${escapeHtml(sessionId)}`);
      }).catch(() => {
        el.innerHTML = `
          <div class="space-y-4">
            <div id="group-terminal-card-fallback"></div>
            <div class="flex items-center gap-2 text-sm text-muted">
              <span class="spinner spinner-sm"></span> Waiting for grouping...
            </div>
          </div>`;

        const termEl = document.getElementById("group-terminal-card-fallback");
        renderTerminalCard(termEl, `group ${escapeHtml(sessionId)}`);
      });

      schedulePoll(pollForGroups, 3000);
    }
```

- [ ] **Step 2: Verify in browser**

Create a project scan session, complete steps 1-2, reach step 3 (Group). After scan completes and before groups are loaded, confirm:
- Amber info-banner is gone
- Terminal card is visible with `group <sessionId>` command
- Copy button works
- Entry points and file count are still shown above the card
- Spinner + "Waiting for grouping..." text below the card
- When groups load, the terminal card is replaced by group cards (unchanged behavior)

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/public/js/views/wizard.mjs
git commit -m "feat: replace grouping-step amber banner with terminal card prompt"
```

---

### Task 6: Modify Progress Page Scan Overlay (Context 4)

**Files:**
- Modify: `skills/audit/scripts/public/js/views/progress.mjs:143-162` (the `scan-overlay` section inside `poll`)
- The file already imports from `app.mjs` — add `renderTerminalCard` to the import

- [ ] **Step 1: Update the import at the top of progress.mjs**

On line 3, change:

```javascript
import { showToast, setBreadcrumb, icon, escapeHtml, onNavigateCleanup } from "../app.mjs";
```

to:

```javascript
import { showToast, setBreadcrumb, icon, escapeHtml, onNavigateCleanup, renderTerminalCard } from "../app.mjs";
```

- [ ] **Step 2: Replace the scan-overlay handling block**

Replace lines 143–162 (the `if (session.type === "project" && ...)` block) with:

```javascript
      if (session.type === "project" && ["created", "scanning", "scanned", "grouping", "ready"].includes(session.status)) {
        if (session.status === "scanning") {
          // Keep existing scan progress UI for active scanning
          scanOverlay.classList.remove("hidden");
          updateHeading(true, session.status);
          document.getElementById("task-list").innerHTML = "";
          document.getElementById("progress-text").textContent = "";
          document.getElementById("progress-pct").textContent = "";
          document.getElementById("progress-fill").style.width = "0%";
          document.getElementById("session-badge").innerHTML = `<span class="badge badge-${escapeHtml(session.status)}">${escapeHtml(session.status)}</span>`;
          const scanStatusEl = document.getElementById("scan-status");
          scanStatusEl.classList.remove("hidden");
          scanStatusEl.innerHTML = `<span class="spinner spinner-sm"></span> Scanning in progress...`;
          document.getElementById("start-scan-btn").classList.add("hidden");
          pollTimer = setTimeout(poll, 3000);
          return;
        }

        if (session.status === "grouping") {
          scanOverlay.classList.remove("hidden");
          updateHeading(true, "grouping");
          document.getElementById("task-list").innerHTML = "";
          document.getElementById("progress-text").textContent = "";
          document.getElementById("progress-pct").textContent = "";
          document.getElementById("progress-fill").style.width = "0%";
          document.getElementById("session-badge").innerHTML = `<span class="badge badge-${escapeHtml(session.status)}">${escapeHtml(session.status)}</span>`;
          const scanStatusEl = document.getElementById("scan-status");
          scanStatusEl.classList.remove("hidden");
          scanStatusEl.innerHTML = `<span class="spinner spinner-sm"></span> Grouping in progress...`;
          document.getElementById("start-scan-btn").classList.add("hidden");
          pollTimer = setTimeout(poll, 3000);
          return;
        }

        // scanned or ready — show terminal card
        scanOverlay.classList.remove("hidden");
        const phase = session.status === "scanned" ? "scanned" : "ready";
        updateHeading(true, phase);
        document.getElementById("task-list").innerHTML = "";
        document.getElementById("progress-text").textContent = "";
        document.getElementById("progress-pct").textContent = "";
        document.getElementById("progress-fill").style.width = "0%";
        document.getElementById("session-badge").innerHTML = `<span class="badge badge-${escapeHtml(session.status)}">${escapeHtml(session.status)}</span>`;
        document.getElementById("start-scan-btn").classList.add("hidden");
        const scanStatusEl = document.getElementById("scan-status");
        scanStatusEl.classList.remove("hidden");
        scanStatusEl.innerHTML = "";
        const cmd = session.status === "scanned" ? `group ${escapeHtml(sessionId)}` : "start review";
        renderTerminalCard(scanStatusEl, cmd);
        pollTimer = setTimeout(poll, 5000);
        return;
      }
```

- [ ] **Step 3: Verify in browser**

Navigate to a project session's progress page while the session is in various states:
- `scanning`: shows spinner (unchanged)
- `scanned`: shows terminal card with `group <sessionId>`
- `grouping`: shows spinner + "Grouping in progress..."
- `ready`: shows terminal card with `start review`

- [ ] **Step 4: Commit**

```bash
git add skills/audit/scripts/public/js/views/progress.mjs
git commit -m "feat: show terminal card prompt on progress page for scanned/ready project sessions"
```

---

### Task 7: Remove Unused `btn-start-review` CSS

**Files:**
- Modify: `skills/audit/scripts/public/styles.css:329-340`

- [ ] **Step 1: Remove the `.btn-start-review` styles**

Delete lines 329–340:

```css
.btn-start-review {
  width: 100%;
  min-height: 48px;
  font-size: var(--text-md);
}
.btn-start-review:hover {
  animation: startPulse 1.5s ease-in-out infinite;
}
@keyframes startPulse {
  0%, 100% { box-shadow: var(--shadow-glow); }
  50% { box-shadow: 0 0 30px var(--accent-glow); }
}
```

- [ ] **Step 2: Verify no references remain**

```bash
grep -rn "btn-start-review" skills/audit/scripts/public/
```

Expected: no results

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/public/styles.css
git commit -m "chore: remove unused btn-start-review CSS"
```

---

### Task 8: Final Integration Test

**Files:**
- No changes — browser testing only

- [ ] **Step 1: Start the server**

```bash
cd skills/audit/scripts && node cli.mjs serve
```

- [ ] **Step 2: Test Code Review flow**

1. Create a new Code Review session
2. Complete scope selection
3. On Ready page: verify Terminal Card shows `start review` with copy button and "View Progress" link
4. Click "View Progress" — navigates to progress page

- [ ] **Step 3: Test Project Scan flow**

1. Create a new Project Scan session
2. Configure project directory
3. On Group step: after scan, verify Terminal Card shows `group <sessionId>` with copy button
4. On Ready step: verify Terminal Card shows `start review` with copy button and "View Progress" link

- [ ] **Step 4: Test Progress Page**

1. Navigate to `#/progress/{sessionId}` for a project session in `scanned` state
2. Verify Terminal Card shows `group <sessionId>`
3. Navigate to `#/progress/{sessionId}` for a project session in `ready` state
4. Verify Terminal Card shows `start review`

- [ ] **Step 5: Test Copy button**

1. Click copy button on any Terminal Card
2. Verify button changes to "Copied!" with checkmark
3. Verify button resets after 2 seconds
4. Paste into a text field and verify the command text is correct
