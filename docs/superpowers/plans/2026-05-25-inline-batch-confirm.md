# Inline Batch Confirm Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the expandable confirm-all panel with inline batch checkboxes on finding cards and a sticky action bar.

**Architecture:** Remove the old `#confirm-all-slot` / `renderConfirmAllPanel` code entirely. Add a batch-mode state flag to `review.mjs` that controls whether finding cards show checkboxes. The finding card template in `task-detail.mjs` gains a checkbox column (hidden by default). A sticky action bar is appended to the detail panel when batch mode is active. CSS handles the slide-in animation and hides per-card action buttons during batch mode.

**Tech Stack:** Vanilla JS (ES modules), plain CSS, no framework.

---

### Task 1: Remove old confirm-all code from styles.css

**Files:**
- Modify: `skills/audit/scripts/public/styles.css:1047-1161`

- [ ] **Step 1: Delete the confirm-all CSS block**

Remove lines 1047–1161 (the entire `/* Confirm All selection panel */` comment through `.confirm-all-actions .btn-confirm-selected:disabled`). This includes:
- `/* Confirm All selection panel */` comment
- `.confirm-all-panel`
- `.confirm-all-panel-header`
- `.confirm-all-panel-title`
- `.confirm-all-sev-pills`
- `.confirm-all-sev-pill`
- `.confirm-all-warning`
- `.confirm-all-warning-icon`
- `.confirm-all-list`
- `.confirm-all-row` and `:hover` and `[data-high-sev]` variants
- `.confirm-all-row-sev` and severity variants
- `.confirm-all-row-text`
- `.confirm-all-actions`
- `.confirm-all-actions .btn-confirm-selected`
- `.confirm-all-actions .btn-confirm-selected:disabled`

Keep `.finding-card .btn-icon` (line 1162) — that's still needed.

- [ ] **Step 2: Verify no other references to confirm-all classes exist**

Run: `grep -rn "confirm-all" skills/audit/scripts/public/styles.css`
Expected: no output (all removed)

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/public/styles.css
git commit -m "refactor: remove old confirm-all selection panel CSS"
```

---

### Task 2: Remove old confirm-all code from review.mjs

**Files:**
- Modify: `skills/audit/scripts/public/js/views/review.mjs:383-509`

- [ ] **Step 1: Remove the confirm-all button injection and renderConfirmAllPanel function**

In `review.mjs`, delete lines 383–509. Specifically:

Remove the block starting with:
```js
    // Add "Confirm All" button if there are unreviewed findings
```
through the closing `}` of `renderConfirmAllPanel` (the line before `// Restore detail panel scroll`).

This removes:
- The `unreviewedIndices` / `unreviewedCount` computation (lines 387–391)
- The `#confirm-all-slot` button injection (lines 393–402)
- The entire `renderConfirmAllPanel` function (lines 404–509)

Keep `confirmSelectedFindings` (lines 91–119) — that function is still needed for the batch confirm logic.

- [ ] **Step 2: Verify the file still references confirmSelectedFindings**

Run: `grep -n "confirmSelectedFindings" skills/audit/scripts/public/js/views/review.mjs`
Expected: only the function definition at ~line 91. The new code will call it from the batch action bar.

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/public/js/views/review.mjs
git commit -m "refactor: remove old confirm-all panel rendering code"
```

---

### Task 3: Remove #confirm-all-slot from task-detail.mjs template

**Files:**
- Modify: `skills/audit/scripts/public/js/components/task-detail.mjs:52`

- [ ] **Step 1: Remove the confirm-all-slot div**

Delete line 52:
```html
      <div id="confirm-all-slot" class="mt-2"></div>
```

- [ ] **Step 2: Commit**

```bash
git add skills/audit/scripts/public/js/components/task-detail.mjs
git commit -m "refactor: remove confirm-all-slot div from task detail template"
```

---

### Task 4: Add batch mode CSS to styles.css

**Files:**
- Modify: `skills/audit/scripts/public/styles.css`

- [ ] **Step 1: Add new CSS rules after the `.finding-card .btn-icon` block (line ~1162)**

Insert the following CSS block:

```css
/* ─── Inline Batch Mode ─── */
.finding-card .finding-checkbox {
  display: none;
  flex-shrink: 0;
  margin-top: 2px;
  width: 18px;
  height: 18px;
  accent-color: var(--accent);
  cursor: pointer;
}
.batch-mode .finding-card {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
}
.batch-mode .finding-checkbox {
  display: block;
  animation: checkboxIn 150ms ease;
}
.batch-mode .finding-card .btn-confirm,
.batch-mode .finding-card .btn-dismiss {
  display: none;
}
@keyframes checkboxIn {
  from { opacity: 0; transform: translateX(-8px); }
  to { opacity: 1; transform: translateX(0); }
}

.finding-card .finding-card-body {
  flex: 1;
  min-width: 0;
}

.batch-mode .finding-card.disabled-checkbox .finding-checkbox {
  opacity: 0.4;
  cursor: default;
}

/* ─── Batch Action Bar ─── */
.batch-action-bar {
  position: sticky;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3);
  margin: var(--space-3) calc(-1 * var(--space-3)) calc(-1 * var(--space-3));
  background: var(--bg-surface-solid);
  border-top: 1px solid var(--border);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  animation: slideUp 150ms ease;
  z-index: 10;
}
.batch-action-bar-left {
  display: flex;
  gap: var(--space-2);
}
.batch-action-bar .batch-confirm-btn {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-dim);
}
.batch-action-bar .batch-confirm-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.batch-action-bar .batch-high-sev-note {
  font-size: var(--text-xs);
  color: var(--warning);
  margin-left: var(--space-1);
}
@keyframes slideUp {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
```

Note: `finding-card-body` is a new wrapper div added in Task 5. The `margin` negative values on `.batch-action-bar` are to counteract the parent padding so the bar sits flush to edges.

- [ ] **Step 2: Verify the CSS parses correctly**

Run: No automated CSS lint is configured; visual verification during Task 7.

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/public/styles.css
git commit -m "feat: add inline batch mode CSS — checkboxes, action bar, animations"
```

---

### Task 5: Update task-detail.mjs template for batch mode support

**Files:**
- Modify: `skills/audit/scripts/public/js/components/task-detail.mjs`

- [ ] **Step 1: Update the function signature to accept batch mode state**

Change the function signature at line 18 from:
```js
export function renderTaskDetail(task, notes) {
```
to:
```js
export function renderTaskDetail(task, notes, batchMode = false) {
```

- [ ] **Step 2: Update the FINDINGS header to include a "Batch Select" button**

Change line 82 from:
```html
          <div class="text-xs text-muted font-semibold mb-3">FINDINGS (${findings.length})</div>
```
to:
```js
          <div class="flex items-center justify-between mb-3">
            <div class="text-xs text-muted font-semibold">FINDINGS (${findings.length})</div>
            ${(() => {
              const unreviewed = findings.some((_, i) => !(noteTask?.findings?.[i]?.status));
              if (!unreviewed) return "";
              return batchMode
                ? `<button class="btn btn-sm btn-ghost" id="batch-cancel-btn">${icon("x", 12)} Cancel</button>`
                : `<button class="btn btn-sm btn-ghost" id="batch-select-btn">${icon("checkSquare", 12)} Batch Select</button>`;
            })()}
          </div>
```

This computes whether any findings are unreviewed. If so, shows either "Batch Select" or "Cancel" depending on `batchMode`.

- [ ] **Step 3: Wrap each finding card inner content in finding-card-body, add checkbox**

Replace the finding card template (lines 91–149). The card div gets a `finding-checkbox` input and its inner content gets wrapped in `finding-card-body`. Change the card `<div>` and its content to:

```js
              const LOW_SEVS = ["minor", "medium", "info", "low"];
              const preChecked = !isConfirmed && !isDismissed && LOW_SEVS.includes(f.severity);

              return `
              <div class="finding-card severity-${f.severity}${isConfirmed ? " confirmed" : ""}${isDismissed ? " dismissed" : ""}${(isConfirmed || isDismissed) ? " disabled-checkbox" : ""}" data-finding="${i}">
                <input type="checkbox" class="finding-checkbox"
                  data-finding-idx="${i}"
                  data-severity="${f.severity}"
                  ${isConfirmed ? "checked disabled" : ""}
                  ${isDismissed ? "disabled" : ""}
                  ${preChecked ? "checked" : ""}
                  aria-label="Select finding ${i + 1}">
                <div class="finding-card-body">
                <div class="flex items-center justify-between">
```

Then at the end of the card, before the closing `</div>` of the finding-card, close the body div:

Change line 149 from:
```js
              </div>`;
```
to:
```js
                </div>
              </div>`;
```

That is: the `finding-card-body` div wraps everything from the first `<div class="flex items-center justify-between">` through to just before the closing `</div>` of the card.

- [ ] **Step 4: Verify the icon function supports "checkSquare"**

Run: `grep -n "checkSquare" skills/audit/scripts/public/js/app.mjs`
Expected: a match (it should already exist in the icon sprite map). If not, add it:

In the icon map, add an entry for `checkSquare`:
```js
checkSquare: '<svg width="SIZE" height="SIZE" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
```

- [ ] **Step 5: Commit**

```bash
git add skills/audit/scripts/public/js/components/task-detail.mjs skills/audit/scripts/public/js/app.mjs
git commit -m "feat: add batch mode support to finding card template — checkbox, body wrapper, header button"
```

---

### Task 6: Add batch mode state and wiring to review.mjs

**Files:**
- Modify: `skills/audit/scripts/public/js/views/review.mjs`

- [ ] **Step 1: Add batch mode state variable**

After line 13 (`let preserveDetailScroll = false;`), add:
```js
  let batchMode = false;
```

- [ ] **Step 2: Pass batchMode to renderTaskDetail**

At line 380, change:
```js
    detailPanel.innerHTML = renderTaskDetail(tasks[currentTaskIdx], notes);
```
to:
```js
    detailPanel.innerHTML = renderTaskDetail(tasks[currentTaskIdx], notes, batchMode);
```

- [ ] **Step 3: Add batch-mode class to detail panel when active**

After setting `detailPanel.innerHTML` (the line just changed), add:
```js
    if (batchMode) detailPanel.classList.add("batch-mode");
```

- [ ] **Step 4: Add batch action bar rendering**

After the existing wiring section (after the collapse toggle wiring, around line 583), before the closing `}` of `renderTasksTab`, insert the batch action bar logic:

```js
    // Batch mode: toggle, action bar, select all/deselect all
    const batchSelectBtn = detailPanel.querySelector("#batch-select-btn");
    const batchCancelBtn = detailPanel.querySelector("#batch-cancel-btn");

    if (batchSelectBtn) {
      batchSelectBtn.addEventListener("click", () => {
        batchMode = true;
        preserveDetailScroll = true;
        requestAnimationFrame(() => requestAnimationFrame(() => renderContent()));
      });
    }

    if (batchCancelBtn) {
      batchCancelBtn.addEventListener("click", () => {
        batchMode = false;
        preserveDetailScroll = true;
        requestAnimationFrame(() => requestAnimationFrame(() => renderContent()));
      });
    }

    // Render batch action bar if in batch mode
    if (batchMode) {
      const HIGH_SEVS = ["critical", "major", "high"];
      const bar = document.createElement("div");
      bar.className = "batch-action-bar";
      bar.id = "batch-action-bar";
      bar.innerHTML = `
        <div class="batch-action-bar-left">
          <button class="btn btn-sm btn-ghost" id="batch-select-all-btn">Select All</button>
          <button class="btn btn-sm btn-ghost" id="batch-deselect-all-btn">Deselect All</button>
        </div>
        <div class="flex items-center gap-2">
          <button class="btn btn-sm batch-confirm-btn" id="batch-confirm-btn" disabled>${icon("check", 14)} Confirm 0 selected</button>
        </div>
      `;
      detailPanel.appendChild(bar);

      function updateBatchBar() {
        const checkboxes = detailPanel.querySelectorAll(".finding-checkbox:not(:disabled)");
        const checked = detailPanel.querySelectorAll(".finding-checkbox:not(:disabled):checked");
        const count = checked.length;
        const confirmBtn = document.getElementById("batch-confirm-btn");
        if (!confirmBtn) return;
        confirmBtn.disabled = count === 0;

        const highCount = Array.from(checked).filter(cb =>
          HIGH_SEVS.includes(cb.dataset.severity)
        ).length;
        const highNote = highCount > 0
          ? `<span class="batch-high-sev-note">${icon("alertTriangle", 12)} ${highCount} high-severity</span>`
          : "";
        confirmBtn.innerHTML = `${icon("check", 14)} Confirm ${count} selected ${highNote}`;
      }

      // Wire checkbox changes
      detailPanel.querySelectorAll(".finding-checkbox").forEach(cb => {
        cb.addEventListener("change", updateBatchBar);
      });

      // Select All / Deselect All
      document.getElementById("batch-select-all-btn")?.addEventListener("click", () => {
        detailPanel.querySelectorAll(".finding-checkbox:not(:disabled)").forEach(cb => {
          cb.checked = true;
        });
        updateBatchBar();
      });
      document.getElementById("batch-deselect-all-btn")?.addEventListener("click", () => {
        detailPanel.querySelectorAll(".finding-checkbox:not(:disabled)").forEach(cb => {
          cb.checked = false;
        });
        updateBatchBar();
      });

      // Batch confirm execute
      document.getElementById("batch-confirm-btn")?.addEventListener("click", async () => {
        const confirmBtn = document.getElementById("batch-confirm-btn");
        const checkedIndices = Array.from(detailPanel.querySelectorAll(".finding-checkbox:not(:disabled):checked"))
          .map(cb => parseInt(cb.dataset.findingIdx));
        if (checkedIndices.length === 0) return;

        confirmBtn.disabled = true;
        confirmBtn.innerHTML = `<span class="spinner spinner-sm"></span> Confirming...`;

        const count = await confirmSelectedFindings(tasks[currentTaskIdx], checkedIndices);
        batchMode = false;
        if (count > 0) {
          showToast(`${count} finding(s) confirmed`, "success");
        } else {
          showToast("No findings were confirmed", "info");
        }
        preserveDetailScroll = true;
        requestAnimationFrame(() => requestAnimationFrame(() => renderContent()));
      });

      // Initial bar state
      updateBatchBar();
    }
```

- [ ] **Step 5: Reset batch mode when switching tasks**

In the `handleTaskNav` function (around line 355), add before the existing `renderContent()` call:
```js
        batchMode = false;
```
So the handler becomes:
```js
    async function handleTaskNav(e) {
      const item = e.currentTarget;
      const newIdx = parseInt(item.dataset.idx);
      if (newIdx !== currentTaskIdx) {
        currentTaskIdx = newIdx;
        batchMode = false;
      }
      renderContent();
    }
```

Also reset batch mode on mobile nav (lines 372–377):
```js
    el.querySelector(".mobile-task-prev")?.addEventListener("click", () => {
      if (currentTaskIdx > 0) { currentTaskIdx--; batchMode = false; renderContent(); }
    });
    el.querySelector(".mobile-task-next")?.addEventListener("click", () => {
      if (currentTaskIdx < tasks.length - 1) { currentTaskIdx++; batchMode = false; renderContent(); }
    });
```

- [ ] **Step 6: Verify the file compiles (no syntax errors)**

Run: `node --check skills/audit/scripts/public/js/views/review.mjs`
Expected: no output (clean parse)

- [ ] **Step 7: Commit**

```bash
git add skills/audit/scripts/public/js/views/review.mjs
git commit -m "feat: add inline batch mode — state, action bar, select/deselect, batch confirm"
```

---

### Task 7: Manual visual verification

**Files:** None (testing only)

- [ ] **Step 1: Start the dev server**

Run: `cd skills/audit/scripts && python3 -m http.server 8080` (or however the app is served)

- [ ] **Step 2: Verify batch mode toggle**

1. Navigate to a review page with findings.
2. Confirm "Batch Select" button appears in the FINDINGS header.
3. Click "Batch Select" — checkboxes should slide in on the left of each card.
4. Confirm/dismiss icon buttons should be hidden.
5. Low-severity checkboxes should be pre-checked; high-severity unchecked.
6. Already confirmed/dismissed findings should have disabled checkboxes.
7. Sticky action bar should appear at the bottom of the detail panel.

- [ ] **Step 3: Verify Select All / Deselect All**

1. Click "Select All" — all unreviewed checkboxes should be checked.
2. Confirm button count should update.
3. Click "Deselect All" — all unchecked, confirm button disabled.
4. High-severity count note should appear/disappear based on selection.

- [ ] **Step 4: Verify batch confirm**

1. Select 2-3 findings.
2. Click "Confirm N selected".
3. Spinner should appear on button.
4. After completion, batch mode exits, findings show "Confirmed" status.
5. Toast confirms count.

- [ ] **Step 5: Verify edge cases**

1. Switch tasks while in batch mode — batch mode resets.
2. Use mobile prev/next — batch mode resets.
3. No unreviewed findings — no "Batch Select" button.
4. All findings already confirmed — no button.
