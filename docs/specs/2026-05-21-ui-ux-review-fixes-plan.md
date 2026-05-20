# UI/UX Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 15 UI/UX issues across all pages of the A-Solid Audit app — severity label overflow, missing status indicators, dismiss panel clipping, responsive breaks, missing feedback, accessibility gaps.

**Architecture:** Pure CSS + vanilla JS changes to existing files. No new files. Each task is self-contained and testable in the browser.

**Tech Stack:** Vanilla JS (ES modules), CSS custom properties, hash-based SPA router.

---

## File Structure

| File | Responsibility | Lines |
|------|----------------|-------|
| `skills/audit/scripts/public/styles.css` | All CSS fixes: severity labels, responsive grids, sidebar transitions, detail-panel padding, wizard animation | ~895 |
| `skills/audit/scripts/public/js/components/task-detail.mjs` | Accept notes param, render finding status badges, conditional button states | ~115 |
| `skills/audit/scripts/public/js/views/review.mjs` | Pass notes to task-detail, auto-scroll dismiss panel, specific toasts, severity label map, sidebar scroll preservation, empty findings state, aria-labels | ~271 |
| `skills/audit/scripts/public/js/views/summary.mjs` | Severity label map, grid-cols-5 responsive, inline sign-off validation, aria-labels | ~185 |
| `skills/audit/scripts/public/js/views/wizard.mjs` | Add wizard content animation class on step change | ~486 |
| `skills/audit/scripts/public/js/app.mjs` | Scroll to top on navigation | ~165 |

---

### Task 1: Fix severity bar label overflow and shortening (#1, #9)

**Files:**
- Modify: `skills/audit/scripts/public/styles.css:551-554`
- Modify: `skills/audit/scripts/public/js/views/review.mjs:113-121`
- Modify: `skills/audit/scripts/public/js/views/summary.mjs:104-112`

- [ ] **Step 1: Fix CSS severity-bar-label to allow growth**

In `styles.css`, change `.severity-bar-label` from fixed `width` to `min-width` and add nowrap:

```css
/* Before (line 551-554): */
.severity-bar-label {
  width: 72px; font-size: var(--text-xs); text-transform: uppercase;
  letter-spacing: 0.5px; font-weight: 600;
}

/* After: */
.severity-bar-label {
  min-width: 72px; font-size: var(--text-xs); text-transform: uppercase;
  letter-spacing: 0.5px; font-weight: 600; white-space: nowrap;
}
```

- [ ] **Step 2: Add severity label mapping in review.mjs**

In `review.mjs`, add a `SEVERITY_LABELS` map at the top of the file (after the imports, before `renderReview`), and use it in the `renderOverview` function where severity labels are rendered (around line 115).

Add after line 5:
```js
const SEVERITY_LABELS = {
  'partially-met': 'Partial',
  'not-met': 'Not Met',
  'met': 'Met',
};
```

In `renderOverview` around line 115, change:
```html
<!-- Before: -->
<span class="badge severity-${sev} severity-bar-label">${sev}</span>

<!-- After: -->
<span class="badge severity-${sev} severity-bar-label">${SEVERITY_LABELS[sev] || sev}</span>
```

- [ ] **Step 3: Add the same severity label mapping in summary.mjs**

In `summary.mjs`, add the same `SEVERITY_LABELS` map after the imports (after line 3), and apply it in the severity bar rendering (around line 106):

```js
const SEVERITY_LABELS = {
  'partially-met': 'Partial',
  'not-met': 'Not Met',
  'met': 'Met',
};
```

Change at line 106:
```html
<!-- Before: -->
<span class="badge severity-${sev} severity-bar-label">${sev}</span>

<!-- After: -->
<span class="badge severity-${sev} severity-bar-label">${SEVERITY_LABELS[sev] || sev}</span>
```

- [ ] **Step 4: Verify in browser**

Run the server, navigate to a session with findings, check both Review > Overview and Summary pages. Verify "partially-met" now shows as "PARTIAL" and doesn't overflow the label area.

- [ ] **Step 5: Commit**

```bash
git add skills/audit/scripts/public/styles.css skills/audit/scripts/public/js/views/review.mjs skills/audit/scripts/public/js/views/summary.mjs
git commit -m "fix: severity bar label overflow and shorten partially-met/not-met display text"
```

---

### Task 2: Add finding status indicators to task-detail component (#2)

**Files:**
- Modify: `skills/audit/scripts/public/js/components/task-detail.mjs`

- [ ] **Step 1: Update renderTaskDetail to accept notes and show status**

Change the function signature at line 4 from `renderTaskDetail(task)` to `renderTaskDetail(task, notes)`. Then update the findings rendering (lines 49-89) to look up each finding's current status and render the appropriate badge and button states.

Full replacement for lines 4-115 of `task-detail.mjs`:

```js
export function renderTaskDetail(task, notes) {
  if (!task) return `<div class="text-muted text-sm flex items-center gap-2">${icon("chevronRight", 16)} Select a task to view details.</div>`;

  const score = task.review?.score;
  const findings = task.review?.findings || [];
  const positives = task.review?.positives || [];
  const gaps = task.review?.gaps || [];

  const scoreColor = score >= 7 ? "var(--accent)" : score >= 4 ? "var(--warning)" : "var(--danger)";
  const circumference = 2 * Math.PI * 42;
  const offset = circumference * (1 - (score || 0) / 10);

  function getFindingStatus(task, idx) {
    const noteTask = notes?.tasks?.find(t => t.file === task.file);
    return noteTask?.findings?.[idx]?.status || null;
  }

  return `
    <div class="space-y-4">
      <!-- Score ring -->
      <div class="flex items-center gap-4 mb-4">
        <div class="score-ring">
          <svg width="96" height="96" viewBox="0 0 96 96">
            <circle class="score-ring-bg" cx="48" cy="48" r="42" fill="none" stroke-width="5"/>
            <circle class="score-ring-fill" cx="48" cy="48" r="42" fill="none"
              stroke="${scoreColor}"
              stroke-width="5"
              stroke-dasharray="${circumference}"
              stroke-dashoffset="${offset}"
              stroke-linecap="round"/>
          </svg>
          <div class="score-ring-text" style="color:${scoreColor}">${score ?? "-"}</div>
        </div>
        <div>
          <div class="text-xs text-muted">Score</div>
          <div class="text-lg font-semibold" style="color:${scoreColor}">${score ?? "-"}/10</div>
        </div>
      </div>

      ${task.review?.summary ? `
        <div>
          <div class="text-xs text-muted font-semibold mb-1">SUMMARY</div>
          <div class="text-sm">${escapeHtml(task.review.summary)}</div>
        </div>
      ` : ""}

      ${findings.length > 0 ? `
        <div>
          <div class="text-xs text-muted font-semibold mb-3">FINDINGS (${findings.length})</div>
          <div class="space-y-3">
            ${findings.map((f, i) => {
              const status = getFindingStatus(task, i);
              const isConfirmed = status === "confirmed";
              const isDismissed = status === "deferred";
              const noteTask = notes?.tasks?.find(t => t.file === task.file);
              const reason = noteTask?.findings?.[i]?.reason || "";

              return `
              <div class="finding-card severity-${f.severity}" data-finding="${i}">
                <div class="flex items-center justify-between mb-2">
                  <div class="flex items-center gap-2">
                    <span class="badge severity-${f.severity}">${f.severity}</span>
                    ${isConfirmed ? `<span class="badge" style="background:var(--success-dim);color:var(--accent)">${icon("check", 10)} Confirmed</span>` : ""}
                    ${isDismissed ? `<span class="badge" style="background:var(--warning-dim);color:var(--warning)">${icon("x", 10)} Dismissed${reason ? ": " + escapeHtml(reason.slice(0, 30)) : ""}</span>` : ""}
                  </div>
                  <div class="flex gap-2">
                    <button class="btn btn-sm ${isConfirmed ? "" : "btn-ghost"} btn-confirm" data-idx="${i}"
                      aria-label="Confirm finding"
                      style="${isConfirmed ? "color:var(--accent);border-color:var(--accent);background:var(--accent-dim)" : "color:var(--accent)"}">
                      ${icon("check", 12)} Confirm
                    </button>
                    <button class="btn btn-sm ${isDismissed ? "" : "btn-ghost"} btn-dismiss" data-idx="${i}"
                      aria-label="Dismiss finding"
                      style="${isDismissed ? "color:var(--warning);border-color:var(--warning);background:var(--warning-dim)" : "color:var(--text-muted)"}">
                      ${icon("x", 12)} Dismiss
                    </button>
                  </div>
                </div>
                <div class="text-sm">${escapeHtml(f.description || "")}</div>
                <div class="dismiss-panel hidden" data-dismiss-panel="${i}">
                  <div class="dismiss-reasons">
                    ${["False positive", "Acceptable risk", "Out of scope", "Already addressed", "Intentional design"].map(r =>
                      `<button class="dismiss-reason-btn" data-reason="${r}">${escapeHtml(r)}</button>`
                    ).join("")}
                  </div>
                  <div class="flex gap-2 mt-2">
                    <input class="dismiss-custom-input" placeholder="Other reason..." data-dismiss-custom="${i}">
                    <button class="btn btn-sm btn-primary dismiss-submit-btn" data-dismiss-submit="${i}">Submit</button>
                  </div>
                </div>
                ${f.code ? `
                  <pre class="mt-2 p-3" style="border-color:var(--border)"><code class="text-xs">${escapeHtml(f.code)}</code></pre>
                ` : ""}
                ${f.suggestion ? `
                  <div class="text-sm mt-2 flex items-start gap-2" style="color:var(--info)">
                    ${icon("zap", 14)}
                    <span>${escapeHtml(f.suggestion)}</span>
                  </div>
                ` : ""}
                ${f.file ? `
                  <div class="text-xs text-muted mt-2 flex items-center gap-1">
                    ${icon("file", 12)}
                    <span class="font-mono">${escapeHtml(f.file)}${f.line ? ":" + f.line : ""}</span>
                  </div>
                ` : ""}
              </div>`;
            }).join("")}
          </div>
        </div>
      ` : ""}

      ${positives.length > 0 ? `
        <div>
          <div class="text-xs font-semibold mb-2 flex items-center gap-2" style="color:var(--accent)">
            ${icon("check", 14)}
            POSITIVES
          </div>
          ${positives.map(p => `<div class="text-sm mb-1" style="color:var(--accent)">${escapeHtml(p)}</div>`).join("")}
        </div>
      ` : ""}

      ${gaps.length > 0 ? `
        <div>
          <div class="text-xs font-semibold mb-2 flex items-center gap-2" style="color:var(--danger)">
            ${icon("alertTriangle", 14)}
            GAPS
          </div>
          ${gaps.map(g => `<div class="text-sm mb-1" style="color:var(--danger)">${escapeHtml(g)}</div>`).join("")}
        </div>
      ` : ""}
    </div>`;
}
```

Key changes from original:
- Function signature: `(task)` → `(task, notes)`
- Added `getFindingStatus` helper
- Each finding now shows a "Confirmed" (green) or "Dismissed" (amber) badge based on notes state
- Confirm/Dismiss buttons change style based on current status: active action gets filled border+background, inactive stays ghost
- Added `aria-label` to both buttons

- [ ] **Step 2: Update review.mjs to pass notes to renderTaskDetail**

In `review.mjs` line 179, change:
```js
// Before:
detailPanel.innerHTML = renderTaskDetail(tasks[currentTaskIdx]);

// After:
detailPanel.innerHTML = renderTaskDetail(tasks[currentTaskIdx], notes);
```

- [ ] **Step 3: Verify in browser**

Navigate to Review > Tasks tab. Click Confirm on a finding — green badge should appear, Confirm button gets green border. Click Dismiss on another — amber badge appears, dismiss button gets amber border. Switch between tasks and back — states should persist.

- [ ] **Step 4: Commit**

```bash
git add skills/audit/scripts/public/js/components/task-detail.mjs skills/audit/scripts/public/js/views/review.mjs
git commit -m "feat: add finding status indicators with confirmed/dismissed badges"
```

---

### Task 3: Auto-scroll dismiss panel and specific toasts (#3, #10)

**Files:**
- Modify: `skills/audit/scripts/public/js/views/review.mjs:182-216`

- [ ] **Step 1: Add auto-scroll after dismiss panel toggle**

In `review.mjs`, in the `renderTasksTab` function, find the dismiss button click handler (around line 189-197). After the `panel.classList.toggle("hidden")` line, add auto-scroll:

```js
detailPanel.querySelectorAll(".btn-dismiss").forEach(btn => {
  btn.addEventListener("click", () => {
    const idx = btn.dataset.idx;
    detailPanel.querySelectorAll(".dismiss-panel").forEach(p => {
      if (p.dataset.dismissPanel !== idx) p.classList.add("hidden");
    });
    const panel = detailPanel.querySelector(`[data-dismiss-panel="${idx}"]`);
    panel.classList.toggle("hidden");
    // Auto-scroll dismiss panel into view
    if (!panel.classList.contains("hidden")) {
      requestAnimationFrame(() => {
        panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    }
  });
});
```

- [ ] **Step 2: Make toast messages finding-specific**

In `review.mjs`, update the `updateFindingStatus` function (lines 42-55). Change the showToast call to include a truncated finding description:

```js
async function updateFindingStatus(sid, task, findingIdx, status, reason) {
  const findingsCount = (task.review?.findings || []).length;
  const noteFindings = Array.from({ length: findingsCount }, (_, i) => {
    const existing = notes?.tasks?.find(t => t.file === task.file)?.findings?.[i];
    return existing || { status: "confirmed", reason: "" };
  });
  noteFindings[findingIdx] = { status, reason };
  try {
    await api.updateTaskNote(sid, task.file, { findings: noteFindings });
    const desc = task.review?.findings?.[findingIdx]?.description || "";
    const snippet = desc.length > 40 ? desc.slice(0, 40) + "..." : desc;
    showToast(
      status === "confirmed"
        ? `Confirmed: ${snippet}`
        : `Dismissed: ${snippet}`,
      "success"
    );
  } catch (e) {
    showToast("Failed to update: " + e.message);
  }
}
```

- [ ] **Step 3: Verify in browser**

Click Dismiss on a finding near the bottom of the detail panel. The dismiss reason panel should scroll into view. After selecting a reason, the toast should show "Dismissed: [finding description snippet]...".

- [ ] **Step 4: Commit**

```bash
git add skills/audit/scripts/public/js/views/review.mjs
git commit -m "feat: auto-scroll dismiss panel into view and specific toast messages"
```

---

### Task 4: Responsive grid fixes (#4, #5)

**Files:**
- Modify: `skills/audit/scripts/public/styles.css:873`
- Add: `grid-cols-5` utility class

- [ ] **Step 1: Add grid-cols-5 utility class**

In `styles.css` after line 756 (`.grid-cols-4`), add:

```css
.grid-cols-5 { grid-template-columns: repeat(5, 1fr); }
```

- [ ] **Step 2: Add grid-cols-5 to responsive override**

In `styles.css` at line 873, change:

```css
/* Before: */
  .grid-cols-2, .grid-cols-3, .grid-cols-4 { grid-template-columns: 1fr; }

/* After: */
  .grid-cols-2, .grid-cols-3, .grid-cols-4, .grid-cols-5 { grid-template-columns: 1fr; }
```

- [ ] **Step 3: Verify in browser**

Open Summary page. Resize browser to mobile width. All 5 stat cards should stack vertically. Review > Overview should also stack its 3 stat cards on mobile.

- [ ] **Step 4: Commit**

```bash
git add skills/audit/scripts/public/styles.css
git commit -m "fix: add grid-cols-5 responsive collapse for summary stat cards"
```

---

### Task 5: Empty findings state in Review Overview (#6)

**Files:**
- Modify: `skills/audit/scripts/public/js/views/review.mjs:83-144`

- [ ] **Step 1: Add empty findings state to renderOverview**

In `review.mjs` `renderOverview` function, after the stat cards grid (line 108) and before the severity chart (line 110), add an empty state condition. Replace the existing severity chart + needs attention section with a conditional:

Find the block starting at line 110 (`${Object.keys(bySeverity).length > 0 ? ...}`) and ending at line 144. Replace the entire block from line 110 through line 144 with:

```js
      ${totalFindings === 0 ? `
        <div class="card" style="text-align:center;padding:var(--space-8) var(--space-6)">
          <div style="margin-bottom:var(--space-4);color:var(--accent)">${icon("check", 48)}</div>
          <h2 class="text-lg" style="color:var(--text-secondary)">All Clear</h2>
          <p class="text-sm text-muted mt-2" style="max-width:320px;margin:0 auto">No findings were identified in this review.</p>
        </div>
      ` : `
        ${Object.keys(bySeverity).length > 0 ? `
          <div class="card mb-4">
            <div class="font-medium mb-4">Findings by Severity</div>
            ${Object.entries(bySeverity).map(([sev, count]) => `
              <div class="severity-bar-row">
                <span class="badge severity-${sev} severity-bar-label">${SEVERITY_LABELS[sev] || sev}</span>
                <div class="severity-bar-track">
                  <div class="severity-bar-fill" style="width:${(count / maxSevCount) * 100}%;background:${sevColors[sev] || "var(--info)"}"></div>
                </div>
                <span class="severity-bar-count">${count}</span>
              </div>
            `).join("")}
          </div>
        ` : ""}

        <div class="card">
          <div class="font-medium mb-3">Needs Attention</div>
          ${(() => {
            const critical = tasks.filter(t =>
              (t.review?.findings || []).some(f => f.severity === "critical" || f.severity === "high" || f.severity === "major")
            );
            if (critical.length === 0) {
              return `<div class="flex items-center gap-2 text-sm text-muted">
                ${icon("check", 16)}
                <span>No high-severity findings.</span>
              </div>`;
            }
            return critical.map(t => `
              <div class="flex items-center justify-between py-2 border-b" style="border-color:var(--border)">
                <span class="text-sm font-mono truncate">${escapeHtml(t.name || t.file)}</span>
                <span class="text-sm text-danger font-medium">${(t.review?.findings || []).filter(f => f.severity === "critical" || f.severity === "high" || f.severity === "major").length} high-severity</span>
              </div>
            `).join("");
          })()}
        </div>
      `}
```

- [ ] **Step 2: Verify in browser**

Open a review session with no findings. The overview should show a centered "All Clear" card with a green checkmark instead of empty space.

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/public/js/views/review.mjs
git commit -m "feat: add all-clear empty state when no findings exist in review overview"
```

---

### Task 6: Sidebar scroll preservation and detail panel scroll reset (#7)

**Files:**
- Modify: `skills/audit/scripts/public/js/views/review.mjs:147-217`

- [ ] **Step 1: Save and restore sidebar scroll in renderTasksTab**

In `review.mjs`, in the `renderTasksTab` function (starts at line 147), save the sidebar scroll position at the start and restore it after rendering. Also reset the detail panel scroll.

Change the beginning of `renderTasksTab` (lines 147-155):

```js
  function renderTasksTab(el) {
    // Preserve sidebar scroll position across re-renders
    const savedScrollTop = document.getElementById("task-sidebar")?.scrollTop || 0;

    el.innerHTML = `
      <div class="sidebar-layout">
        <div class="sidebar-panel" id="task-sidebar"></div>
        <div class="detail-panel" id="task-detail-panel"></div>
      </div>`;

    const sidebar = document.getElementById("task-sidebar");
```

Then after the sidebar innerHTML is set (after line 169 `).join("");`), add:

```js
    // Restore sidebar scroll position
    sidebar.scrollTop = savedScrollTop;
```

And after the detail panel innerHTML is set (after line 179), add:

```js
    // Reset detail panel scroll to top on task switch
    detailPanel.scrollTop = 0;
```

- [ ] **Step 2: Verify in browser**

Open Review > Tasks tab with 10+ tasks. Scroll down in the sidebar, click a task. The sidebar should stay at the same scroll position. The detail panel should scroll to top.

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/public/js/views/review.mjs
git commit -m "fix: preserve sidebar scroll position and reset detail panel on task switch"
```

---

### Task 7: CSS polish — sidebar transitions, detail-panel padding, wizard animation (#8, #12, #13)

**Files:**
- Modify: `skills/audit/scripts/public/styles.css`

- [ ] **Step 1: Add transition to task-nav-item active state**

In `styles.css`, update `.task-nav-item.active` (line 495-498). Add border-left transition:

```css
/* Before: */
.task-nav-item.active {
  background: var(--accent-dim);
  border-left: 2px solid var(--accent);
}

/* After: */
.task-nav-item.active {
  background: var(--accent-dim);
  border-left: 2px solid var(--accent);
  transition: background var(--duration-fast) var(--ease-spring),
              border-color var(--duration-fast) var(--ease-spring);
}
```

- [ ] **Step 2: Add bottom padding to detail-panel for FAB clearance**

In `styles.css`, update `.detail-panel` (line 846-849):

```css
/* Before: */
.detail-panel {
  padding: var(--space-6);
  overflow-y: auto;
  background: var(--bg-base);
}

/* After: */
.detail-panel {
  padding: var(--space-6);
  padding-bottom: 72px;
  overflow-y: auto;
  background: var(--bg-base);
}
```

- [ ] **Step 3: Add wizard content enter animation class**

In `styles.css`, after the existing `@keyframes fadeIn` block (line 172-175), add:

```css
.wizard-content-enter {
  animation: fadeIn 200ms var(--ease-spring) forwards;
}
```

- [ ] **Step 4: Commit**

```bash
git add skills/audit/scripts/public/styles.css
git commit -m "fix: sidebar transition, detail-panel bottom padding, wizard content animation"
```

---

### Task 8: Wizard step animation (#13)

**Files:**
- Modify: `skills/audit/scripts/public/js/views/wizard.mjs:65`

- [ ] **Step 1: Add animation class to wizard content div**

In `wizard.mjs`, in the `render()` function, change the wizard-content div (line 65):

```html
<!-- Before: -->
<div id="wizard-content"></div>

<!-- After: -->
<div id="wizard-content" class="wizard-content-enter"></div>
```

This applies the `fadeIn` animation defined in Task 7 step 3 on every step change, since the entire wizard re-renders.

- [ ] **Step 2: Verify in browser**

Go through the wizard steps. Each step change should have a subtle fade-in animation.

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/public/js/views/wizard.mjs
git commit -m "feat: add fade-in animation on wizard step transitions"
```

---

### Task 9: Sign-off inline validation (#14)

**Files:**
- Modify: `skills/audit/scripts/public/js/views/summary.mjs:122-175`

- [ ] **Step 1: Add inline error state to sign-off form**

In `summary.mjs`, update the sign-off section (around lines 123-147). Change the name input to include an error container:

```html
        <div>
          <label>Name</label>
          <input id="signoff-name" class="mt-1" value="${escapeHtml(notes?.summary?.signoff?.name || "")}">
          <div id="signoff-name-error" class="text-danger text-xs mt-1 hidden">Name is required</div>
        </div>
```

- [ ] **Step 2: Update signoff click handler with inline validation**

In the signoff button click handler (around line 159), change from toast-only to inline validation:

```js
  document.getElementById("signoff-btn")?.addEventListener("click", async () => {
    const name = document.getElementById("signoff-name").value.trim();
    const nameError = document.getElementById("signoff-name-error");
    if (!name) {
      if (nameError) nameError.classList.remove("hidden");
      document.getElementById("signoff-name").style.borderColor = "var(--danger)";
      document.getElementById("signoff-name").focus();
      return;
    }
    if (nameError) nameError.classList.add("hidden");
    document.getElementById("signoff-name").style.borderColor = "";
    const role = document.getElementById("signoff-role").value.trim();
    try {
      await api.updateSummary(sessionId, {
        signoff: { name, role, date: new Date().toISOString() },
      });
      showToast("Signed off successfully", "success");
      location.hash = `#/summary/${sessionId}`;
    } catch (e) { showToast("Sign-off failed: " + e.message); }
  });
```

- [ ] **Step 3: Clear error on input**

After the signoff handler, add an input listener to clear the error state:

```js
  document.getElementById("signoff-name")?.addEventListener("input", () => {
    const nameError = document.getElementById("signoff-name-error");
    if (nameError) nameError.classList.add("hidden");
    document.getElementById("signoff-name").style.borderColor = "";
  });
```

- [ ] **Step 4: Verify in browser**

Go to Summary page, click Sign Off without entering a name. Red border appears on name input, "Name is required" shows below. Type a name — error clears automatically.

- [ ] **Step 5: Commit**

```bash
git add skills/audit/scripts/public/js/views/summary.mjs
git commit -m "feat: inline validation for sign-off name field"
```

---

### Task 10: Page scroll to top on navigation (#15)

**Files:**
- Modify: `skills/audit/scripts/public/js/app.mjs:113-147`

- [ ] **Step 1: Add scrollTo in navigate function**

In `app.mjs`, in the `navigate()` function, add `window.scrollTo` right after the cleanup but before the view transition starts. After line 119 (`currentCleanup = null;}`) and before line 121 (`const { view, params } = parseHash();`), add:

```js
  // Reset scroll position on navigation
  window.scrollTo({ top: 0, behavior: "instant" });
```

Actually, more precisely: add it right after line 122 (`notesPanel.updateSession(getSessionIdFromHash());`) so it runs after session update but before rendering. Insert between lines 122 and 123:

```js
  window.scrollTo({ top: 0 });
```

- [ ] **Step 2: Verify in browser**

Navigate to a long page (e.g., Review with many tasks), scroll down, then click "Home" button. Page should scroll to top.

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/public/js/app.mjs
git commit -m "fix: scroll to top on page navigation"
```

---

### Task 11: Aria-labels on icon-only buttons (#11)

**Files:**
- Modify: `skills/audit/scripts/public/js/views/review.mjs`
- Modify: `skills/audit/scripts/public/js/views/summary.mjs`
- Modify: `skills/audit/scripts/public/js/views/home.mjs`
- Modify: `skills/audit/scripts/public/js/views/wizard.mjs`
- Modify: `skills/audit/scripts/public/js/views/progress.mjs`

- [ ] **Step 1: Add aria-labels in review.mjs**

In `review.mjs`, update the page header buttons (around line 22-23):

```html
<!-- Before: -->
<button id="review-home-btn" class="btn btn-ghost">${icon("arrowLeft", 14)} Home</button>
<button id="review-summary-btn" class="btn btn-primary">Summary & Sign-off</button>

<!-- After: -->
<button id="review-home-btn" class="btn btn-ghost" aria-label="Go home">${icon("arrowLeft", 14)} Home</button>
<button id="review-summary-btn" class="btn btn-primary" aria-label="Go to summary">Summary & Sign-off</button>
```

- [ ] **Step 2: Add aria-labels in summary.mjs**

In `summary.mjs`, update header buttons (around line 20-21):

```html
<!-- Before: -->
<button id="summary-back-btn" class="btn btn-ghost">${icon("arrowLeft", 14)} Review</button>
<button id="export-pdf-btn" class="btn btn-primary">${icon("download", 14)} Export PDF</button>

<!-- After: -->
<button id="summary-back-btn" class="btn btn-ghost" aria-label="Go back to review">${icon("arrowLeft", 14)} Review</button>
<button id="export-pdf-btn" class="btn btn-primary" aria-label="Export PDF">${icon("download", 14)} Export PDF</button>
```

- [ ] **Step 3: Add aria-labels in wizard.mjs**

In `wizard.mjs`, update step navigation buttons. In `renderStep2` (around line 126-127):

```html
<button id="step2-back" class="btn btn-ghost" aria-label="Go back">${icon("arrowLeft", 14)} Back</button>
```

In `renderStep3` (around line 255-256):

```html
<button id="step3-back" class="btn btn-ghost" aria-label="Go back">${icon("arrowLeft", 14)} Back</button>
```

In `renderStep4` (around line 410-411):

```html
<button id="step4-back" class="btn btn-ghost" aria-label="Go back">${icon("arrowLeft", 14)} Back</button>
```

- [ ] **Step 4: Add aria-labels in progress.mjs**

In `progress.mjs`, update header buttons (around line 23-24):

```html
<!-- Before: -->
<button id="view-findings-btn" class="btn btn-ghost btn-sm hidden">${icon("eye", 14)} Findings</button>
<button id="view-summary-btn" class="btn btn-ghost btn-sm hidden">${icon("barChart", 14)} Summary</button>

<!-- After: -->
<button id="view-findings-btn" class="btn btn-ghost btn-sm hidden" aria-label="View findings">${icon("eye", 14)} Findings</button>
<button id="view-summary-btn" class="btn btn-ghost btn-sm hidden" aria-label="View summary">${icon("barChart", 14)} Summary</button>
```

And the manual refresh button (around line 44):

```html
<!-- Before: -->
<button id="manual-refresh-btn" class="btn btn-sm ml-3">Refresh</button>

<!-- After: -->
<button id="manual-refresh-btn" class="btn btn-sm ml-3" aria-label="Refresh">Refresh</button>
```

- [ ] **Step 5: Verify with screen reader or browser accessibility inspector**

Tab through the interface. All icon buttons should announce their purpose via aria-label.

- [ ] **Step 6: Commit**

```bash
git add skills/audit/scripts/public/js/views/review.mjs skills/audit/scripts/public/js/views/summary.mjs skills/audit/scripts/public/js/views/wizard.mjs skills/audit/scripts/public/js/views/progress.mjs skills/audit/scripts/public/js/views/home.mjs
git commit -m "a11y: add aria-labels to icon-only and icon-primary buttons across all views"
```

---

### Task 12: Final integration test

**Files:** None (testing only)

- [ ] **Step 1: Full page walkthrough**

Test the complete flow:
1. **Home** — verify session cards render correctly
2. **Wizard** — step through all steps, verify animation on transitions
3. **Progress** — verify progress bar and task status display
4. **Review > Overview** — verify severity labels (no overflow), empty state if no findings, stat cards
5. **Review > Tasks** — verify:
   - Finding status badges (Confirmed/Dismissed) show and persist
   - Button states change based on current finding status
   - Dismiss panel auto-scrolls into view
   - Sidebar scroll is preserved when switching tasks
   - Toast messages include finding descriptions
6. **Summary** — verify stat cards responsive, severity labels, sign-off inline validation
7. **Resize to mobile** — verify all grids collapse, no horizontal scroll

- [ ] **Step 2: Commit any remaining fixes if needed**

```bash
git add -A
git commit -m "fix: final integration tweaks for UI/UX review fixes"
```
