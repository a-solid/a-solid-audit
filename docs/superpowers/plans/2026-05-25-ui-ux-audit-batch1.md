# UI/UX Audit Batch 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 13 critical+high priority UI/UX issues across the A-Solid Audit web application using surgical, in-place fixes.

**Architecture:** Each task modifies one or two files with minimal changes. No new files created. No refactoring. All paths relative to `skills/audit/scripts/public/`.

**Tech Stack:** Vanilla JS (ES modules), CSS custom properties, hash-based SPA router

---

## Task 1: Fix review overview confirmed/dismissed counts (#1)

**Files:**
- Modify: `js/views/review.mjs:135-156` (renderOverview function)

The overview tab reads finding status from `task.review.findings[].status` which is always undefined. Status is stored in `notes.tasks[].findings[].status`. Replace lines 149-156 to cross-reference notes.

- [ ] **Step 1: Replace the confirmed/dismissed counting logic**

In `js/views/review.mjs`, replace lines 149-156:

```javascript
    // BEFORE (broken — reads from task data, not notes):
    const allFindings = tasks.flatMap(t => t.review?.findings || []);
    const confirmed = allFindings.filter(f => f.status === "confirmed").length;
    const dismissed = allFindings.filter(f => f.status === "deferred").length;
    const unreviewedCount = allFindings.length - confirmed - dismissed;
    const findingsTotal = allFindings.length || 1;
    const confirmPct = Math.round(confirmed / findingsTotal * 100);
    const dismissPct = Math.round(dismissed / findingsTotal * 100);
    const unreviewedPct = 100 - confirmPct - dismissPct;

    // AFTER (reads from notes, same pattern as summary.mjs):
    let confirmed = 0;
    let deferred = 0;
    let totalFindingsFromAll = 0;
    const noteTasks = notes?.tasks || [];
    tasks.forEach(t => {
      const taskFindings = t.review?.findings || [];
      totalFindingsFromAll += taskFindings.length;
      const noteTask = noteTasks.find(nt => nt.file === t.file);
      (noteTask?.findings || []).forEach(f => {
        if (!f) return;
        if (f.status === "confirmed") confirmed++;
        else if (f.status === "deferred") deferred++;
      });
    });
    const unreviewedCount = totalFindingsFromAll - confirmed - deferred;
    const findingsTotal = totalFindingsFromAll || 1;
    const confirmPct = Math.round(confirmed / findingsTotal * 100);
    const dismissPct = Math.round(deferred / findingsTotal * 100);
    const unreviewedPct = 100 - confirmPct - dismissPct;
```

- [ ] **Step 2: Verify the change renders correctly**

Open the review page for a session with confirmed/dismissed findings. The "Confirmed X% / Dismissed Y% / Unreviewed Z%" row should now show correct percentages.

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/public/js/views/review.mjs
git commit -m "fix: review overview reads finding status from notes, not task data"
```

---

## Task 2: Add summary link to home page completed sessions (#2)

**Files:**
- Modify: `js/views/home.mjs:88-131`

Change completed session cards to navigate to summary instead of review, and add a secondary "Findings" link for direct review access.

- [ ] **Step 1: Change completed card click target and add findings link**

In `js/views/home.mjs`, replace line 121:

```javascript
        if (status === "completed") location.hash = `#/review/${id}`;
```

with:

```javascript
        if (status === "completed") location.hash = `#/summary/${id}`;
```

Then in the session card template (around lines 109-111), add a findings link for completed sessions. After the badge line (`<span class="badge ${cfg.badge}">${s.status}</span>`) and before the closing `</div>` of the right-side flex container, add:

```javascript
              ${s.status === "completed" ? `<a href="#/review/${s.id}" class="session-findings-link" onclick="event.stopPropagation()">${icon("eye", 12)} Findings</a>` : ""}
```

- [ ] **Step 2: Add CSS for the findings link**

In `styles.css`, after the `.session-progress-label` rule (around line 884), add:

```css
.session-findings-link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-xs);
  color: var(--text-muted);
  white-space: nowrap;
  transition: color var(--duration-fast);
  cursor: pointer;
}
.session-findings-link:hover { color: var(--accent); }
```

- [ ] **Step 3: Verify completed sessions now go to summary with a findings link visible**

Navigate to home, click a completed session card — should go to summary. The "Findings" link should be clickable and go to review.

- [ ] **Step 4: Commit**

```bash
git add skills/audit/scripts/public/js/views/home.mjs skills/audit/scripts/public/styles.css
git commit -m "fix: completed sessions navigate to summary with findings link"
```

---

## Task 3: Add wizard navigation guard (#3)

**Files:**
- Modify: `js/views/wizard.mjs`

Add a dirty flag and beforeunload handler to prevent accidental data loss.

- [ ] **Step 1: Add dirty flag variable**

In `js/views/wizard.mjs`, after the variable declarations around line 143 (after `let defaultProjectDir = "";`), add:

```javascript
  let dirty = false;
```

- [ ] **Step 2: Add beforeunload setup/teardown**

After the `save()` function definition (around line 215), add:

```javascript
  function setDirty(value) {
    dirty = value;
    if (dirty && step > 1) {
      window.onbeforeunload = () => true;
    } else {
      window.onbeforeunload = null;
    }
  }
```

- [ ] **Step 3: Call setDirty on all form change events**

In every place the wizard calls `save()` after user input (not after programmatic state changes), also call `setDirty(true)`. Specifically:

1. In `renderStep1`, inside the card click handler (around line 308): after `save()`, add `setDirty(true);`
2. In `renderStep2`, inside the `renderScopeContent` tab change handlers and `loadFilePreview` change handler: after each `save()`, add `setDirty(true);`
3. In `renderStep3`, inside the save-story-btn click handler (around line 1001): after `save()`, add `setDirty(true);`
4. In `renderStep4`, inside the context-input blur handler (around line 1316): after save, add `setDirty(true);`

- [ ] **Step 4: Clear dirty on final submission**

In `renderStep4`, inside the start-review-btn click handler (around line 1336), before `localStorage.removeItem`, add:

```javascript
        setDirty(false);
```

Also in `renderProjectReady` (around line 775), before `localStorage.removeItem`, add:

```javascript
        setDirty(false);
```

- [ ] **Step 5: Clean up on navigation**

After the final `render();` call (around line 1356), register cleanup:

```javascript
  onNavigateCleanup(() => {
    window.onbeforeunload = null;
  });
```

Note: `onNavigateCleanup` is already imported at the top of the file.

- [ ] **Step 6: Commit**

```bash
git add skills/audit/scripts/public/js/views/wizard.mjs
git commit -m "fix: add navigation guard for unsaved wizard changes"
```

---

## Task 4: Verify settings PLACEHOLDER is correct (#4)

**Files:**
- None (verification only)

The PLACEHOLDER constant is already correctly defined at `settings.mjs:5` as `"••••••••••••••••"` and the save logic at lines 134-135, 143-146, and 158 already correctly excludes the placeholder from the payload. No changes needed.

- [ ] **Step 1: Mark as verified, no code changes**

This issue is already handled correctly in the current code.

---

## Task 5: Remove auto-confirm, add explicit "Confirm All" button (#5)

**Files:**
- Modify: `js/views/review.mjs:315-326` (handleTaskNav)
- Modify: `js/components/task-detail.mjs:18-51` (renderTaskDetail)

- [ ] **Step 1: Remove autoConfirmFindings from handleTaskNav**

In `js/views/review.mjs`, replace the `handleTaskNav` function (lines 315-326):

```javascript
    async function handleTaskNav(e) {
      const item = e.currentTarget;
      const newIdx = parseInt(item.dataset.idx);
      if (newIdx !== currentTaskIdx) {
        currentTaskIdx = newIdx;
        const confirmedCount = await autoConfirmFindings(tasks[currentTaskIdx]);
        if (confirmedCount > 0) {
          showToast(`${confirmedCount} finding(s) auto-confirmed`, "success");
        }
      }
      renderContent();
    }
```

with:

```javascript
    async function handleTaskNav(e) {
      const item = e.currentTarget;
      const newIdx = parseInt(item.dataset.idx);
      if (newIdx !== currentTaskIdx) {
        currentTaskIdx = newIdx;
      }
      renderContent();
    }
```

- [ ] **Step 2: Add "Confirm All" button to task detail header**

In `js/components/task-detail.mjs`, the `renderTaskDetail` function returns a template string. We need to add a "Confirm All" button but we don't have access to the notes mutation function from this component. Instead, we'll add the button in `review.mjs` after calling `renderTaskDetail`.

First, add a marker in the task detail header. In `task-detail.mjs`, after line 49 (`<div class="text-xs text-muted mt-1">${score ?? "-"}/10 · ${findings.length} findings</div>`), before closing `</div>` of the header flex container, add a slot for the confirm-all button:

```javascript
          <div id="confirm-all-slot" class="mt-2"></div>
```

Then in `js/views/review.mjs`, after line 339 (`detailPanel.innerHTML = renderTaskDetail(tasks[currentTaskIdx], notes);`), add:

```javascript
    // Add "Confirm All" button if there are unreviewed findings
    const currentTask = tasks[currentTaskIdx];
    const currentFindings = currentTask?.review?.findings || [];
    const currentNoteTask = notes?.tasks?.find(t => t.file === currentTask?.file);
    const unreviewedCount = currentFindings.filter((f, i) => !currentNoteTask?.findings?.[i]?.status).length;
    if (unreviewedCount > 0) {
      const slot = detailPanel.querySelector("#confirm-all-slot");
      if (slot) {
        slot.innerHTML = `<button class="btn btn-sm" style="color:var(--accent);border-color:var(--accent);background:var(--accent-dim);width:100%" id="confirm-all-findings-btn">${icon("check", 14)} Confirm All ${unreviewedCount} Findings</button>`;
        document.getElementById("confirm-all-findings-btn")?.addEventListener("click", async () => {
          const count = await autoConfirmFindings(currentTask);
          if (count > 0) {
            showToast(`${count} finding(s) confirmed`, "success");
            preserveDetailScroll = true;
            requestAnimationFrame(() => requestAnimationFrame(() => renderContent()));
          }
        });
      }
    }
```

- [ ] **Step 3: Verify the button appears only for tasks with unreviewed findings and works**

Navigate to the review page, select a task with unreviewed findings. The "Confirm All" button should appear. Click it — findings should confirm. Switch tasks — no auto-confirm.

- [ ] **Step 4: Commit**

```bash
git add skills/audit/scripts/public/js/views/review.mjs skills/audit/scripts/public/js/components/task-detail.mjs
git commit -m "fix: replace silent auto-confirm with explicit Confirm All button"
```

---

## Task 6: Add mobile task picker for review page (#6)

**Files:**
- Modify: `js/views/review.mjs:277-281` (renderTasksTab layout)
- Modify: `styles.css` (add mobile task nav styles)

- [ ] **Step 1: Add mobile task nav bar to renderTasksTab**

In `js/views/review.mjs`, replace lines 277-281:

```javascript
    el.innerHTML = `
      <div class="sidebar-layout">
        <div class="sidebar-panel" id="task-sidebar"></div>
        <div class="detail-panel" id="task-detail-panel"></div>
      </div>`;
```

with:

```javascript
    const currentTask = tasks[currentTaskIdx];
    const currentScore = currentTask?.review?.score;
    el.innerHTML = `
      <div class="mobile-task-nav" aria-label="Task navigation">
        <button class="btn btn-ghost btn-sm mobile-task-prev" aria-label="Previous task" ${currentTaskIdx <= 0 ? "disabled" : ""}>${icon("chevronLeft", 14)}</button>
        <div class="mobile-task-info">
          <span class="font-mono text-sm truncate">${escapeHtml(currentTask?.name || currentTask?.file || "Select task")}</span>
          <span class="text-xs text-muted">${currentScore ?? "-"}/10</span>
        </div>
        <button class="btn btn-ghost btn-sm mobile-task-next" aria-label="Next task" ${currentTaskIdx >= tasks.length - 1 ? "disabled" : ""}>${icon("chevronRight", 14)}</button>
      </div>
      <div class="sidebar-layout">
        <div class="sidebar-panel" id="task-sidebar"></div>
        <div class="detail-panel" id="task-detail-panel"></div>
      </div>`;
```

After the sidebar event listeners block (after line 336), add mobile nav handlers:

```javascript
    // Mobile task nav
    el.querySelector(".mobile-task-prev")?.addEventListener("click", () => {
      if (currentTaskIdx > 0) { currentTaskIdx--; renderContent(); }
    });
    el.querySelector(".mobile-task-next")?.addEventListener("click", () => {
      if (currentTaskIdx < tasks.length - 1) { currentTaskIdx++; renderContent(); }
    });
```

- [ ] **Step 2: Add mobile task nav CSS**

In `styles.css`, after the `.sidebar-layout` rules (around line 1273), add:

```css
/* ─── Mobile Task Nav ─── */
.mobile-task-nav {
  display: none;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  margin-bottom: var(--space-3);
}
.mobile-task-info {
  flex: 1;
  min-width: 0;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
@media (max-width: 768px) {
  .mobile-task-nav { display: flex; }
  .sidebar-panel { max-height: 200px; }
}
```

- [ ] **Step 3: Verify mobile nav appears on narrow viewport and sidebar shrinks**

Resize browser to <768px. The mobile task nav bar should appear above the sidebar layout. Prev/next buttons should switch tasks.

- [ ] **Step 4: Commit**

```bash
git add skills/audit/scripts/public/js/views/review.mjs skills/audit/scripts/public/styles.css
git commit -m "feat: add mobile task picker for review page"
```

---

## Task 7: Make wizard type cards responsive (#7)

**Files:**
- Modify: `js/views/wizard.mjs:274`

- [ ] **Step 1: Change grid classes**

In `js/views/wizard.mjs`, line 274, replace:

```javascript
	        <div class="grid grid-cols-3 gap-6">
```

with:

```javascript
	        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
```

The `sm:grid-cols-3` media query is already defined in `styles.css:1942`.

- [ ] **Step 2: Verify cards stack on mobile**

Resize to <640px. Cards should stack vertically. At ≥640px, 3-column grid.

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/public/js/views/wizard.mjs
git commit -m "fix: wizard type cards stack on mobile"
```

---

## Task 8: Add cancel button to progress scan (#8)

**Files:**
- Modify: `js/views/progress.mjs:21-32` (header area)

- [ ] **Step 1: Add cancel button to header**

In `js/views/progress.mjs`, after the view-summary-btn (line 30), add a cancel button inside the header flex container:

```javascript
	        <button id="cancel-scan-btn" class="btn btn-ghost btn-sm hidden" style="color:var(--danger);border-color:rgba(239,68,68,0.3)" aria-label="Cancel scan">${icon("x", 14)} Cancel</button>
```

- [ ] **Step 2: Show cancel button during active reviewing and wire handler**

After the existing `view-summary-btn` event listener (around line 279), add:

```javascript
  document.getElementById("cancel-scan-btn").addEventListener("click", async () => {
    const cancelBtn = document.getElementById("cancel-scan-btn");
    if (cancelBtn.dataset.confirmPending === "true") {
      cancelBtn.dataset.confirmPending = "";
      try {
        await api.patchSession(sessionId, { status: "created" });
        if (pollTimer) clearTimeout(pollTimer);
        showToast("Scan cancelled", "success");
        location.hash = `#/wizard/${sessionId}`;
      } catch (e) {
        showToast("Failed to cancel: " + e.message);
        cancelBtn.textContent = "Cancel";
      }
    } else {
      cancelBtn.dataset.confirmPending = "true";
      cancelBtn.innerHTML = `${icon("x", 14)} Sure?`;
      setTimeout(() => {
        cancelBtn.dataset.confirmPending = "";
        cancelBtn.innerHTML = `${icon("x", 14)} Cancel`;
      }, 3000);
    }
  });
```

- [ ] **Step 3: Show the cancel button when session is actively reviewing**

In the `poll` function, after the session is loaded and status is `reviewing` (around line 164, after `updateHeading`), add:

```javascript
      const cancelBtn = document.getElementById("cancel-scan-btn");
      if (cancelBtn) {
        const showCancel = session.status === "reviewing" || session.status === "scoped";
        cancelBtn.classList.toggle("hidden", !showCancel);
      }
```

Also hide it when review completes (in the block around line 207 where `location.hash = #/review/${sessionId}` is set):

```javascript
      const cancelBtn2 = document.getElementById("cancel-scan-btn");
      if (cancelBtn2) cancelBtn2.classList.add("hidden");
```

- [ ] **Step 4: Verify cancel button appears during active review and cancels**

Start a review session, go to progress. Cancel button should appear. Click once → "Sure?". Click again → redirects to wizard.

- [ ] **Step 5: Commit**

```bash
git add skills/audit/scripts/public/js/views/progress.mjs
git commit -m "feat: add cancel button to progress scan"
```

---

## Task 9: Smart toast duration by severity (#9)

**Files:**
- Modify: `js/app.mjs:99-118` (showToast function)

- [ ] **Step 1: Replace showToast with smart duration version**

In `js/views/app.mjs`, replace the showToast function (lines 99-118):

```javascript
export function showToast(message, type = "error") {
  const toastContainer = document.getElementById("toast-container");
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.textContent = message;
  el.style.cursor = "pointer";
  toastContainer.appendChild(el);

  let dismissed = false;
  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    el.style.opacity = "0";
    el.style.transform = "translateX(16px)";
    el.style.transition = "all 200ms ease";
    setTimeout(() => el.remove(), 200);
  }

  el.addEventListener("click", dismiss);
  setTimeout(dismiss, 4000);
}
```

with:

```javascript
const TOAST_DURATIONS = { error: 6000, warning: 5000, success: 3000 };

export function showToast(message, type = "error") {
  const toastContainer = document.getElementById("toast-container");
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.textContent = message;
  el.style.cursor = "pointer";
  toastContainer.appendChild(el);

  let dismissed = false;
  let timer = null;

  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    clearTimeout(timer);
    el.style.opacity = "0";
    el.style.transform = "translateX(16px)";
    el.style.transition = "all 200ms ease";
    setTimeout(() => el.remove(), 200);
  }

  function startTimer() {
    clearTimeout(timer);
    timer = setTimeout(dismiss, TOAST_DURATIONS[type] || 4000);
  }

  el.addEventListener("click", dismiss);
  el.addEventListener("mouseenter", () => clearTimeout(timer));
  el.addEventListener("mouseleave", () => {
    if (!dismissed) startTimer();
  });
  startTimer();
}
```

- [ ] **Step 2: Verify toast durations differ**

Trigger an error toast (e.g., stop the server and load a page). It should stay visible for ~6s. A success toast should dismiss in ~3s. Hovering should pause the timer.

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/public/js/app.mjs
git commit -m "fix: smart toast duration by severity with hover-pause"
```

---

## Task 10: Add session ID to breadcrumbs (#10)

**Files:**
- Modify: `js/views/review.mjs:15-18` (setBreadcrumb)
- Modify: `js/views/progress.mjs:16-19` (setBreadcrumb)
- Modify: `js/views/summary.mjs:11-15` (setBreadcrumb)
- Modify: `js/views/wizard.mjs:218-221` (setBreadcrumb)

- [ ] **Step 1: Update review breadcrumb**

In `js/views/review.mjs`, replace lines 15-18:

```javascript
  setBreadcrumb([
    { label: "Sessions", href: "#/home" },
    { label: "Review Findings" },
  ]);
```

with:

```javascript
  const shortId = sessionId ? sessionId.slice(0, 7) : "";
  setBreadcrumb([
    { label: "Sessions", href: "#/home" },
    ...(shortId ? [{ label: shortId, href: `#/review/${sessionId}` }] : []),
    { label: "Review" },
  ]);
```

- [ ] **Step 2: Update progress breadcrumb**

In `js/views/progress.mjs`, replace lines 16-19:

```javascript
  setBreadcrumb([
    { label: "Sessions", href: "#/home" },
    { label: "In Progress" },
  ]);
```

with:

```javascript
  const shortId = sessionId ? sessionId.slice(0, 7) : "";
  setBreadcrumb([
    { label: "Sessions", href: "#/home" },
    ...(shortId ? [{ label: shortId, href: `#/progress/${sessionId}` }] : []),
    { label: "Progress" },
  ]);
```

- [ ] **Step 3: Update summary breadcrumb**

In `js/views/summary.mjs`, replace lines 11-15:

```javascript
  setBreadcrumb([
    { label: "Sessions", href: "#/home" },
    { label: "Review", href: `#/review/${sessionId}` },
    { label: "Summary" },
  ]);
```

with:

```javascript
  const shortId = sessionId ? sessionId.slice(0, 7) : "";
  setBreadcrumb([
    { label: "Sessions", href: "#/home" },
    ...(shortId ? [{ label: shortId, href: `#/review/${sessionId}` }] : []),
    { label: "Summary" },
  ]);
```

- [ ] **Step 4: Update wizard breadcrumb**

In `js/views/wizard.mjs`, replace lines 218-221:

```javascript
    setBreadcrumb([
      { label: "Sessions", href: "#/home" },
      { label: isNew ? "New Audit" : "Configure Audit" },
    ]);
```

with:

```javascript
    const shortId = sessionId && !isNew ? sessionId.slice(0, 7) : "";
    setBreadcrumb([
      { label: "Sessions", href: "#/home" },
      ...(shortId ? [{ label: shortId, href: `#/wizard/${sessionId}` }] : []),
      { label: isNew ? "New Audit" : "Configure" },
    ]);
```

- [ ] **Step 5: Verify breadcrumbs show session ID**

Navigate to review/progress/summary/wizard pages. Breadcrumb should show: `Sessions / abc1234 / Review` (etc.)

- [ ] **Step 6: Commit**

```bash
git add skills/audit/scripts/public/js/views/review.mjs skills/audit/scripts/public/js/views/progress.mjs skills/audit/scripts/public/js/views/summary.mjs skills/audit/scripts/public/js/views/wizard.mjs
git commit -m "fix: add session ID to breadcrumbs for tab disambiguation"
```

---

## Task 11: Inline theme icon to avoid FOUC (#11)

**Files:**
- Modify: `index.html:27` (theme toggle button)
- Modify: `js/theme.mjs:12-14` (SVG constants already exist, no change needed)

- [ ] **Step 1: Add inline SVG to theme button in index.html**

In `index.html`, replace line 27:

```html
    <button id="theme-toggle" class="btn btn-ghost btn-sm" aria-label="Toggle theme" title="Switch theme"></button>
```

with:

```html
    <button id="theme-toggle" class="btn btn-ghost btn-sm" aria-label="Toggle theme" title="Switch theme"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></button>
```

This defaults to the search/placeholder icon, which `theme.mjs:applyTheme()` immediately replaces with the correct sun/moon icon on init (which runs before first paint since it's synchronous).

- [ ] **Step 2: Verify no empty flash on page reload**

Reload the page. The theme button should show the correct icon immediately — no empty flash.

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/public/index.html
git commit -m "fix: inline default theme icon to prevent FOUC"
```

---

## Task 12: Per-API-call error boundaries (#12)

**Files:**
- Modify: `js/views/review.mjs:37-46` (data loading)
- Modify: `js/views/progress.mjs` (data loading in poll)
- Modify: `js/views/summary.mjs:28-34` (data loading)

- [ ] **Step 1: Fix review.mjs data loading**

Replace lines 37-46:

```javascript
  let reviewContext = "";
  try {
    const session = await api.getSession(sessionId);
    tasks = await api.getTasks(sessionId);
    notes = await api.getNotes(sessionId);
    try { const ctx = await api.getReviewContext(sessionId); reviewContext = ctx.context || ""; } catch (e) { /* no context file */ }
  } catch (e) {
    showToast("Failed to load review data: " + e.message);
    return;
  }
```

with:

```javascript
  let reviewContext = "";
  try { tasks = await api.getTasks(sessionId); } catch (e) {
    showToast("Failed to load tasks: " + e.message);
    return;
  }
  try { notes = await api.getNotes(sessionId); } catch (e) {
    showToast("Notes unavailable — finding statuses may not display", "warning");
  }
  let session = null;
  try { session = await api.getSession(sessionId); } catch (e) { /* session info optional */ }
  try { const ctx = await api.getReviewContext(sessionId); reviewContext = ctx.context || ""; } catch (e) { /* no context file */ }
```

- [ ] **Step 2: Fix summary.mjs data loading**

Replace lines 28-34:

```javascript
  try {
    tasks = await api.getTasks(sessionId);
    notes = await api.getNotes(sessionId);
  } catch (e) {
    showToast("Failed to load summary data: " + e.message);
    return;
  }
```

with:

```javascript
  try { tasks = await api.getTasks(sessionId); } catch (e) {
    showToast("Failed to load tasks: " + e.message);
    return;
  }
  try { notes = await api.getNotes(sessionId); } catch (e) {
    showToast("Notes unavailable — sign-off section may not display", "warning");
  }
```

- [ ] **Step 3: Fix progress.mjs — session is critical, tasks degrade**

In `js/views/progress.mjs`, the `poll` function already handles the session fetch as the primary call. The tasks fetch on line 166 should be wrapped individually. Replace lines 166-167:

```javascript
      const tasks = await api.getTasks(sessionId);
```

with:

```javascript
      let tasks = [];
      try { tasks = await api.getTasks(sessionId); } catch (e) {
        document.getElementById("task-list").innerHTML = `<div class="text-sm text-muted" style="padding:var(--space-4)">Failed to load tasks. Retrying...</div>`;
      }
```

Also change `const tasks` to `let tasks` in the poll function scope, or use a local variable. Since `poll` already declares `tasks` as the return from `api.getTasks`, wrap it:

Before the change, line 166 is inside `async function poll()`. The `tasks` variable is local to `poll`. Change:

```javascript
      const tasks = await api.getTasks(sessionId);
```

to:

```javascript
      let tasks = [];
      try { tasks = await api.getTasks(sessionId); } catch (e) {
        document.getElementById("task-list").innerHTML = `<div class="text-sm text-muted" style="padding:var(--space-4)">Failed to load tasks. Retrying...</div>`;
      }
```

- [ ] **Step 4: Verify partial failures degrade gracefully**

Test by making one API endpoint fail (e.g., notes returns 500). Tasks should still render. Toast warning should appear.

- [ ] **Step 5: Commit**

```bash
git add skills/audit/scripts/public/js/views/review.mjs skills/audit/scripts/public/js/views/summary.mjs skills/audit/scripts/public/js/views/progress.mjs
git commit -m "fix: per-API-call error boundaries prevent total view failure"
```

---

## Task 13: Make settings grid responsive (#13)

**Files:**
- Modify: `js/views/settings.mjs:47`

- [ ] **Step 1: Replace grid-cols-5 with responsive classes**

In `js/views/settings.mjs`, line 47, replace:

```javascript
	      <div class="grid grid-cols-5 gap-4">
```

with:

```javascript
	      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
```

The `md:grid-cols-5` media query is already defined in `styles.css:1946`.

- [ ] **Step 2: Verify DB fields stack on mobile, 2-col on tablet, 5-col on desktop**

Resize browser. At <640px: single column. At 640-768px: 2 columns. At ≥768px: 5 columns.

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/public/js/views/settings.mjs
git commit -m "fix: settings DB grid responsive on mobile and tablet"
```
