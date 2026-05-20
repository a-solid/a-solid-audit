# Notes Panel + File Mapping Accordion + Step-Line Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the wizard step-line visual gap, add a floating notes panel for editing review context from any view, and replace the file mapping select+button with an auto-save accordion.

**Architecture:** Three independent changes to the wizard and global UI. Step-line fix restructures the CSS+HTML of the step indicator. Notes panel is a new global component mounted in `index.html`, detecting session from URL hash. File mapping accordion replaces the select+button in wizard Step 3 with per-story expandable sections.

**Tech Stack:** Vanilla JS (ES modules), CSS custom properties, existing API endpoints (`/api/sessions/:id/review-context`, `/api/sessions/:id/stories/map`).

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `skills/audit/scripts/public/styles.css` | Step-line CSS, notes panel CSS, accordion CSS |
| Modify | `skills/audit/scripts/public/js/views/wizard.mjs` | Step indicator HTML restructure + file mapping accordion |
| Create | `skills/audit/scripts/public/js/components/notes-panel.mjs` | Floating notes panel component |
| Modify | `skills/audit/scripts/public/js/app.mjs` | Mount notes panel, export `getSessionId` helper |
| Modify | `skills/audit/scripts/public/index.html` | Add `<div id="notes-panel-root">` mount point |

---

### Task 1: Fix step-line CSS

**Files:**
- Modify: `skills/audit/scripts/public/styles.css:319-356` (Step Indicator section)

- [ ] **Step 1: Replace the Step Indicator CSS section**

Replace the entire `/* ─── Step Indicator ─── */` block (lines 319–356) with:

```css
/* ─── Step Indicator ─── */
.steps {
  display: flex; align-items: center;
  margin-bottom: var(--space-8);
  position: relative;
}
.step-dots {
  display: flex; align-items: center; width: 100%;
}
.step-dot {
  width: 28px; height: 28px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: var(--text-xs); font-weight: 600;
  background: var(--bg-active); color: var(--text-muted);
  border: 2px solid var(--border);
  flex-shrink: 0;
  transition: all var(--duration-base) var(--ease-spring);
}
.step-dot.active {
  background: var(--accent-dim); color: var(--accent);
  border-color: var(--accent);
  box-shadow: 0 0 0 4px var(--accent-dim);
}
.step-dot.done {
  background: var(--accent); color: #052E16; border-color: var(--accent);
}
.step-line {
  flex: 1; height: 2px; background: var(--border);
  transition: background var(--duration-base) var(--ease-spring);
}
.step-line.done { background: var(--accent); }
.step-labels {
  display: flex; width: 100%; margin-top: var(--space-2);
}
.step-label {
  font-size: var(--text-xs); color: var(--text-muted);
  text-align: center; white-space: nowrap;
  transition: color var(--duration-base) var(--ease-spring);
}
.step-label.active { color: var(--text-primary); }
.step-label.done { color: var(--accent); }
```

- [ ] **Step 2: Verify the CSS compiles without errors**

Run: `cd /Users/cqx/Projects/chenqixing/a-solid/a-solid-audit && head -1 skills/audit/scripts/public/styles.css`
Expected: `/* A-Solid Audit — Cinematic Dark Theme */` (file is intact)

---

### Task 2: Fix step-line HTML in wizard render()

**Files:**
- Modify: `skills/audit/scripts/public/js/views/wizard.mjs:41-67` (the `render()` function's step indicator section)

- [ ] **Step 1: Replace the step indicator HTML in `render()`**

In `wizard.mjs`, replace lines 47–66 (the `container.innerHTML` template literal — just the step indicator part inside it) with a restructured version. The full `render()` function becomes:

```javascript
  function render() {
    setBreadcrumb([
      { label: "Sessions", href: "#/home" },
      { label: "New Audit" },
    ]);

    const totalSteps = reviewType === "all" ? 4 : 3;
    const stepLabels = reviewType === "all"
      ? ["Review Type", "Scope", "Stories", "Ready"]
      : ["Review Type", "Scope", "Ready"];

    container.innerHTML = `
      <h1 class="text-2xl mb-6">New Audit</h1>
      <div class="steps">
        <div class="step-dots">
          ${stepLabels.map((label, i) => {
            const num = i + 1;
            const isActive = step === num;
            const isDone = step > num;
            const isLast = i === stepLabels.length - 1;
            return `
              <div class="step-dot ${isActive ? "active" : ""} ${isDone ? "done" : ""}">
                ${isDone ? icon("check", 14) : num}
              </div>
              ${!isLast ? `<div class="step-line ${isDone ? "done" : ""}"></div>` : ""}
            `;
          }).join("")}
        </div>
        <div class="step-labels">
          ${stepLabels.map((label, i) => {
            const num = i + 1;
            const isActive = step === num;
            const isDone = step > num;
            return `<span class="step-label ${isActive ? "active" : ""} ${isDone ? "done" : ""}" style="flex:1">${label}</span>`;
          }).join("")}
        </div>
      </div>
      <div id="wizard-content"></div>
    `;

    const actualStep = reviewType === "code" && step === 4 ? 3 : step;
    if (actualStep === 1) renderStep1();
    else if (actualStep === 2) renderStep2();
    else if (actualStep === 3 && reviewType === "all") renderStep3();
    else renderStep4();
  }
```

Note: The `totalSteps` and `stepLabels` declarations that were previously at lines 36–39 need to be removed since they are now inside `render()`. Remove lines 36–39 (the `const totalSteps` and `const stepLabels` that sit outside `render()`).

- [ ] **Step 2: Commit step-line fix**

```bash
git add skills/audit/scripts/public/styles.css skills/audit/scripts/public/js/views/wizard.mjs
git commit -m "fix: restructure step indicator to connect dots with lines properly"
```

---

### Task 3: Create notes panel component

**Files:**
- Create: `skills/audit/scripts/public/js/components/notes-panel.mjs`

- [ ] **Step 1: Create the notes panel component**

```javascript
// skills/audit/scripts/public/js/components/notes-panel.mjs
import { api } from "../api.mjs";
import { icon, showToast } from "../app.mjs";

export function initNotesPanel(root) {
  let panelOpen = false;
  let sessionId = null;
  let loadedContent = "";

  root.innerHTML = `
    <button id="notes-fab" class="notes-fab" title="Edit review notes">
      ${icon("messageSquare", 20)}
    </button>
    <div id="notes-panel" class="notes-panel">
      <div class="notes-panel-header">
        <span class="font-medium text-sm">Review Notes</span>
        <button id="notes-close" class="btn btn-ghost btn-sm">${icon("x", 14)}</button>
      </div>
      <textarea id="notes-textarea" class="notes-textarea" placeholder="Add review context, key concerns, known issues..."></textarea>
      <div class="notes-panel-footer">
        <span id="notes-status" class="text-xs text-muted">Auto-saved on blur</span>
      </div>
    </div>
  `;

  const fab = document.getElementById("notes-fab");
  const panel = document.getElementById("notes-panel");
  const textarea = document.getElementById("notes-textarea");
  const closeBtn = document.getElementById("notes-close");
  const status = document.getElementById("notes-status");

  fab.addEventListener("click", () => togglePanel(true));
  closeBtn.addEventListener("click", () => togglePanel(false));

  // Close on click outside
  document.addEventListener("click", (e) => {
    if (panelOpen && !root.contains(e.target)) togglePanel(false);
  });

  // Auto-save on blur
  textarea.addEventListener("blur", async () => {
    if (!sessionId) return;
    const content = textarea.value;
    if (content === loadedContent) return;
    try {
      await api.setReviewContext(sessionId, content);
      loadedContent = content;
      status.textContent = "Saved";
      status.style.color = "var(--accent)";
      setTimeout(() => { status.textContent = "Auto-saved on blur"; status.style.color = ""; }, 2000);
    } catch (e) {
      showToast("Failed to save notes: " + e.message);
    }
  });

  function togglePanel(open) {
    panelOpen = open;
    panel.style.display = open ? "flex" : "none";
    fab.style.display = open ? "none" : "flex";
    if (open && sessionId) loadContent();
  }

  async function loadContent() {
    try {
      const data = await api.getReviewContext(sessionId);
      loadedContent = data.context || "";
      textarea.value = loadedContent;
    } catch (e) {
      textarea.value = "";
      loadedContent = "";
    }
  }

  // Public API for app.mjs to call on route change
  return {
    updateSession(newSessionId) {
      sessionId = newSessionId;
      root.style.display = newSessionId ? "" : "none";
      if (panelOpen) {
        if (newSessionId) loadContent();
        else togglePanel(false);
      }
    },
  };
}
```

- [ ] **Step 2: Commit the notes panel component**

```bash
git add skills/audit/scripts/public/js/components/notes-panel.mjs
git commit -m "feat: create floating notes panel component"
```

---

### Task 4: Add notes panel CSS

**Files:**
- Modify: `skills/audit/scripts/public/styles.css` (append after Step Indicator section)

- [ ] **Step 1: Add notes panel styles before the Layout Utilities section**

Insert before `/* ─── Layout Utilities ─── */` (line ~618):

```css
/* ─── Notes Panel ─── */
.notes-fab {
  position: fixed; bottom: 24px; right: 24px; z-index: 45;
  width: 44px; height: 44px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: var(--accent); color: #052E16; border: none;
  cursor: pointer; box-shadow: var(--shadow-md), var(--shadow-glow);
  transition: all var(--duration-fast) var(--ease-spring);
}
.notes-fab:hover { background: var(--accent-hover); transform: scale(1.05); }
.notes-fab:active { transform: scale(0.95); }
.notes-panel {
  display: none; flex-direction: column;
  position: fixed; bottom: 24px; right: 24px; z-index: 45;
  width: 400px; max-height: 450px;
  background: var(--bg-surface-solid);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  animation: notesSlideUp 200ms var(--ease-spring);
}
@keyframes notesSlideUp {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}
.notes-panel-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--border);
}
.notes-textarea {
  flex: 1; min-height: 300px; max-height: 360px;
  border: none; border-radius: 0;
  background: transparent; resize: none;
  padding: var(--space-3) var(--space-4);
}
.notes-textarea:focus { box-shadow: none; outline: none; }
.notes-panel-footer {
  padding: var(--space-2) var(--space-4);
  border-top: 1px solid var(--border);
  display: flex; justify-content: flex-end;
}
```

- [ ] **Step 2: Commit notes panel CSS**

```bash
git add skills/audit/scripts/public/styles.css
git commit -m "style: add floating notes panel CSS"
```

---

### Task 5: Wire up notes panel in app.mjs and index.html

**Files:**
- Modify: `skills/audit/scripts/public/js/app.mjs`
- Modify: `skills/audit/scripts/public/index.html`

- [ ] **Step 1: Add mount point to index.html**

Insert `<div id="notes-panel-root"></div>` before `</body>` (after the toast-container div), so the end of index.html becomes:

```html
  <div id="toast-container" class="toast-container"></div>
  <div id="notes-panel-root"></div>
</body>
</html>
```

- [ ] **Step 2: Add notes panel initialization to app.mjs**

Add import at top of `app.mjs` (after existing imports):

```javascript
import { initNotesPanel } from "./components/notes-panel.mjs";
```

Add initialization and session detection after `let currentCleanup = null;` (around line 11):

```javascript
// ─── Notes Panel ───
const notesPanelRoot = document.getElementById("notes-panel-root");
const notesPanel = initNotesPanel(notesPanelRoot);

function getSessionIdFromHash() {
  const hash = location.hash.slice(1) || "";
  const parts = hash.split("/").filter(Boolean);
  if (parts.length >= 2 && ["wizard", "progress", "review", "summary"].includes(parts[0])) {
    return parts[1];
  }
  return null;
}
```

In the `navigate()` function, after the `const { view, params } = parseHash();` line, add:

```javascript
  notesPanel.updateSession(getSessionIdFromHash());
```

- [ ] **Step 3: Commit notes panel wiring**

```bash
git add skills/audit/scripts/public/js/app.mjs skills/audit/scripts/public/index.html
git commit -m "feat: wire up floating notes panel to global app with session detection"
```

---

### Task 6: Add accordion styles for file mapping

**Files:**
- Modify: `skills/audit/scripts/public/styles.css`

- [ ] **Step 1: Add accordion styles before Layout Utilities section**

Insert before `/* ─── Layout Utilities ─── */`:

```css
/* ─── Accordion ─── */
.accordion-item {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
  transition: border-color var(--duration-fast) var(--ease-spring);
}
.accordion-item:hover { border-color: var(--border-hover); }
.accordion-item.expanded { border-color: var(--border-accent); }
.accordion-header {
  display: flex; align-items: center; gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  cursor: pointer;
  background: var(--bg-surface);
  transition: background var(--duration-fast) var(--ease-spring);
  user-select: none;
}
.accordion-header:hover { background: var(--bg-elevated); }
.accordion-chevron {
  color: var(--text-muted);
  transition: transform var(--duration-fast) var(--ease-spring);
  flex-shrink: 0;
}
.accordion-item.expanded .accordion-chevron {
  transform: rotate(180deg);
}
.accordion-body {
  display: none;
  padding: var(--space-3) var(--space-4);
  border-top: 1px solid var(--border);
  background: var(--bg-base);
  max-height: 280px;
  overflow-y: auto;
}
.accordion-item.expanded .accordion-body {
  display: block;
}
.accordion-badge {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 20px; height: 20px; padding: 0 6px;
  border-radius: var(--radius-full);
  font-size: var(--text-xs); font-weight: 600;
  background: var(--bg-active); color: var(--text-muted);
  margin-left: auto; flex-shrink: 0;
}
.accordion-badge.has-files {
  background: var(--accent-dim); color: var(--accent);
}
```

- [ ] **Step 2: Commit accordion CSS**

```bash
git add skills/audit/scripts/public/styles.css
git commit -m "style: add accordion component CSS"
```

---

### Task 7: Replace file mapping with accordion in wizard Step 3

**Files:**
- Modify: `skills/audit/scripts/public/js/views/wizard.mjs:229-347` (the `renderStep3()` and `loadFileTree()` functions)

- [ ] **Step 1: Replace `renderStep3()` with accordion-based file mapping**

Replace the `renderStep3()` function (lines 229–298) and `loadFileTree()` function (lines 301–347) with:

```javascript
  function renderStep3() {
    const content = document.getElementById("wizard-content");
    content.innerHTML = `
      <div class="card mb-4">
        <h2 class="font-semibold mb-4">Story Collection</h2>
        <div id="story-collection">
          <div class="mb-3">
            <label>Add Story</label>
            <div class="flex gap-2 mt-1">
              <select id="story-source">
                <option value="manual">Manual Input</option>
              </select>
              <button id="add-story-btn" class="btn">${icon("plus", 14)} Add Story</button>
            </div>
          </div>
          <div id="story-form" class="hidden mt-3 card">
            <input id="story-name" class="mb-2" placeholder="Story name">
            <textarea id="story-desc" class="mb-2" rows="2" placeholder="Description"></textarea>
            <textarea id="story-ac" class="mb-2" rows="2" placeholder="Acceptance criteria"></textarea>
            <button id="save-story-btn" class="btn btn-primary btn-sm">Save</button>
          </div>
        </div>
      </div>
      <div id="file-mapping-section" class="card mb-4 ${stories.length === 0 ? "hidden" : ""}">
        <h2 class="font-semibold mb-4">File Mapping</h2>
        <p class="text-sm text-secondary mb-3">Click a story to expand, then check files to associate. Changes save automatically.</p>
        <div id="accordion-container" class="space-y-2"></div>
      </div>
      <div class="flex justify-between">
        <button id="step3-back" class="btn btn-ghost">${icon("arrowLeft", 14)} Back</button>
        <button id="step3-next" class="btn btn-primary">Next ${icon("chevronRight", 14)}</button>
      </div>`;

    document.getElementById("add-story-btn").addEventListener("click", () => {
      document.getElementById("story-form").classList.toggle("hidden");
    });
    document.getElementById("save-story-btn").addEventListener("click", async () => {
      const name = document.getElementById("story-name").value.trim();
      const description = document.getElementById("story-desc").value.trim();
      const acceptance = document.getElementById("story-ac").value.trim();
      if (!name) { showToast("Story name is required"); return; }
      try {
        await api.createStory(sessionId, { name, description, acceptance });
        stories.push({ name, description, acceptance });
        save();
        render();
      } catch (e) { showToast("Failed to save story: " + e.message); }
    });

    document.getElementById("step3-back").addEventListener("click", () => { step = 2; save(); render(); });
    document.getElementById("step3-next").addEventListener("click", () => { step = 4; save(); render(); });

    if (stories.length > 0) loadAccordionFileTree(sessionId);
  }
```

Now replace `loadFileTree()` with the accordion version:

```javascript
  async function loadAccordionFileTree(sid) {
    const container = document.getElementById("accordion-container");
    if (!container) return;
    container.innerHTML = `<span class="text-sm text-muted">Loading files...</span>`;
    try {
      const tasks = await api.getTasks(sid);
      const files = tasks.filter(t => t.type === "code").map(t => t.name);
      if (files.length === 0) {
        container.innerHTML = `<span class="text-sm text-muted">No files found. Confirm scope first.</span>`;
        return;
      }

      const fileTreeInstances = {};
      let expandedIndex = -1;

      container.innerHTML = stories.map((story, i) => {
        const existing = storyMappings.find(m => m.storyName === story.name);
        const count = existing?.files?.length || 0;
        return `
          <div class="accordion-item" data-story-index="${i}">
            <div class="accordion-header" data-index="${i}">
              ${icon("clipboard", 14)}
              <span class="text-sm font-medium">${escapeHtml(story.name || story.id)}</span>
              <span class="accordion-badge ${count > 0 ? "has-files" : ""}">${count}</span>
              <span class="accordion-chevron">${icon("chevronDown", 14)}</span>
            </div>
            <div class="accordion-body" id="accordion-body-${i}"></div>
          </div>`;
      }).join("");

      container.querySelectorAll(".accordion-header").forEach(header => {
        header.addEventListener("click", () => {
          const idx = parseInt(header.dataset.index);
          if (expandedIndex === idx) {
            // Collapse current
            const item = container.querySelector(`[data-story-index="${idx}"]`);
            item.classList.remove("expanded");
            expandedIndex = -1;
            return;
          }
          // Collapse previous
          if (expandedIndex >= 0) {
            const prev = container.querySelector(`[data-story-index="${expandedIndex}"]`);
            if (prev) prev.classList.remove("expanded");
          }
          // Expand new
          expandedIndex = idx;
          const item = container.querySelector(`[data-story-index="${idx}"]`);
          item.classList.add("expanded");

          // Render file tree if not yet rendered
          if (!fileTreeInstances[idx]) {
            const body = document.getElementById(`accordion-body-${idx}`);
            const story = stories[idx];
            const existing = storyMappings.find(m => m.storyName === story.name);
            const tree = renderFileTree(body, files);
            if (existing?.files?.length) tree.setSelected(existing.files);
            fileTreeInstances[idx] = tree;

            // Auto-save on every checkbox click
            body.addEventListener("change", () => {
              const selected = tree.getSelected();
              const mappingIdx = storyMappings.findIndex(m => m.storyName === story.name);
              if (mappingIdx >= 0) storyMappings[mappingIdx].files = selected;
              else storyMappings.push({ storyName: story.name, files: selected });
              save();

              // Update badge
              const badge = item.querySelector(".accordion-badge");
              badge.textContent = selected.length;
              badge.classList.toggle("has-files", selected.length > 0);

              // Persist to server
              api.mapStories(sid, stories.map(s => ({
                storyName: s.name,
                files: (storyMappings.find(m => m.storyName === s.name)?.files || []),
              }))).catch(e => showToast("Failed to save mapping: " + e.message));
            });
          }
        });
      });
    } catch (e) {
      container.innerHTML = `<span class="text-sm text-danger">Failed to load files: ${escapeHtml(e.message)}</span>`;
    }
  }
```

- [ ] **Step 2: Commit file mapping accordion**

```bash
git add skills/audit/scripts/public/js/views/wizard.mjs
git commit -m "feat: replace file mapping select+button with auto-save accordion"
```

---

### Task 8: Visual verification

**Files:** None (manual testing)

- [ ] **Step 1: Start the dev server and verify all three changes**

Run: `cd /Users/cqx/Projects/chenqixing/a-solid/a-solid-audit && node skills/audit/scripts/server/index.mjs`

Verify in browser:
1. **Step-line**: Navigate to `#/wizard/new` — step dots should be connected by lines with no gaps, labels below
2. **Notes panel**: On any session view, green FAB should appear bottom-right. Click to open, edit text, click away to auto-save. No FAB on Home view
3. **File mapping accordion**: In wizard Step 3 with stories, stories should appear as accordion headers. Click to expand file tree. Check a file — should auto-save. Badge updates count

---

## Self-Review

**Spec coverage:**
- Step-line fix: Tasks 1–2 ✓
- Floating notes panel (single textarea, auto-save, session-aware): Tasks 3–5 ✓
- File mapping accordion (auto-save, badge count, one-at-a-time): Tasks 6–7 ✓

**Placeholder scan:** No TBD/TODO. All code blocks contain complete implementations.

**Type consistency:** All API calls use existing `api.setReviewContext()`, `api.getReviewContext()`, `api.mapStories()`. Component functions (`initNotesPanel`, `renderFileTree`) use the signatures defined in their source files.
