# Overview Task Navigation & Dismiss Input Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add click-to-navigate from Overview "Needs Attention" tasks to the Tasks tab, fix dismiss custom input closing bug, and improve long dismiss reason display.

**Architecture:** Three targeted fixes in the existing review view: (1) wire up click handlers on Overview task cards to switch tab + select task, (2) stop event propagation inside dismiss panels, (3) add CSS truncation + tooltip on dismiss reason badges.

**Tech Stack:** Vanilla JS (ES modules), CSS custom properties, no frameworks.

---

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `skills/audit/scripts/public/js/views/review.mjs` | Modify | Overview task click handlers, dismiss panel event fix |
| `skills/audit/scripts/public/js/components/task-detail.mjs` | Modify | Badge HTML with `title` attr and shorter truncation |
| `skills/audit/scripts/public/styles.css` | Modify | Dismiss reason badge ellipsis + dismiss panel click protection |

---

### Task 1: Add click-to-navigate on Overview "Needs Attention" tasks

**Files:**
- Modify: `skills/audit/scripts/public/js/views/review.mjs:156-175` (renderOverview → "Needs Attention" section)
- Modify: `skills/audit/scripts/public/js/views/review.mjs:303-309` (updateTabUI function, already exists)

- [ ] **Step 1: Add click handlers and cursor style to Overview task cards**

In `review.mjs`, replace the "Needs Attention" task card rendering (lines 166-170) to add `data-task-idx` attribute, `cursor:pointer` style, and a `needs-attention-item` class for targeting:

```js
// In renderOverview(), replace lines 166-170 with:
            return critical.map(t => {
              const taskIdx = tasks.indexOf(t);
              return `
              <div class="flex items-center justify-between py-2 border-b needs-attention-item" style="border-color:var(--border);cursor:pointer" data-task-idx="${taskIdx}">
                <span class="text-sm font-mono truncate">${escapeHtml(t.name || t.file)}</span>
                <span class="text-sm text-danger font-medium">${(t.review?.findings || []).filter(f => f.severity === "critical" || f.severity === "high" || f.severity === "major").length} high-severity</span>
              </div>`;
            }).join("");
```

Then add event wiring at the end of `renderOverview()`, right after the `el.innerHTML = ...` assignment and before the closing `}`:

```js
    // Wire up Needs Attention task clicks
    el.querySelectorAll(".needs-attention-item").forEach(item => {
      item.addEventListener("click", () => {
        currentTaskIdx = parseInt(item.dataset.taskIdx);
        currentTab = "tasks";
        updateTabUI();
        renderContent();
      });
    });
```

- [ ] **Step 2: Verify in browser**

1. Start the server: `node skills/audit/scripts/server/index.mjs` (or however the dev server is started)
2. Open a session with findings that have critical/high/major severity
3. On the Overview tab, click a task in the "Needs Attention" section
4. Verify: tab switches to "Tasks", the clicked task is selected in the sidebar, and its detail is shown

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/public/js/views/review.mjs
git commit -m "feat: click Needs Attention tasks to navigate to Tasks tab"
```

---

### Task 2: Fix dismiss custom input closing bug

**Files:**
- Modify: `skills/audit/scripts/public/js/views/review.mjs:245-262` (dismiss event wiring)

- [ ] **Step 1: Add stopPropagation to dismiss panel interactions**

In `review.mjs`, update the dismiss reason buttons and dismiss submit button event listeners to call `e.stopPropagation()`. This prevents clicks inside the dismiss panel from bubbling up and triggering the dismiss toggle.

Replace lines 245-262:

```js
    // Dismiss reason buttons
    detailPanel.querySelectorAll(".dismiss-reason-btn").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.closest("[data-dismiss-panel]").dataset.dismissPanel);
        const reason = btn.dataset.reason;
        await updateFindingStatus(sessionId, tasks[currentTaskIdx], idx, "deferred", reason);
      });
    });
    // Dismiss custom submit
    detailPanel.querySelectorAll(".dismiss-submit-btn").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.dismissSubmit);
        const input = detailPanel.querySelector(`[data-dismiss-custom="${idx}"]`);
        const reason = input?.value?.trim();
        if (!reason) { showToast("Enter a reason"); return; }
        await updateFindingStatus(sessionId, tasks[currentTaskIdx], idx, "deferred", reason);
      });
    });
```

Also add `stopPropagation` on the custom input itself to prevent click/focus from bubbling. Add this after the submit button wiring:

```js
    // Prevent dismiss custom input clicks from bubbling
    detailPanel.querySelectorAll(".dismiss-custom-input").forEach(input => {
      input.addEventListener("click", (e) => e.stopPropagation());
    });
```

And add `stopPropagation` to the dismiss panel itself so any click inside it doesn't bubble:

```js
    // Prevent clicks inside dismiss panels from closing them
    detailPanel.querySelectorAll(".dismiss-panel").forEach(panel => {
      panel.addEventListener("click", (e) => e.stopPropagation());
    });
```

- [ ] **Step 2: Verify in browser**

1. Open a session with findings
2. Click Dismiss on a finding — panel opens
3. Click into the custom input field — panel stays open
4. Type a custom reason — panel stays open, text is preserved
5. Click Submit — finding is dismissed with the custom reason, panel closes after save
6. Also verify preset reason buttons still work correctly

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/public/js/views/review.mjs
git commit -m "fix: stop event propagation in dismiss panel to prevent unexpected closing"
```

---

### Task 3: Improve long dismiss reason display

**Files:**
- Modify: `skills/audit/scripts/public/js/components/task-detail.mjs:63` (badge HTML)
- Modify: `skills/audit/scripts/public/styles.css` (add dismiss reason badge styles)

- [ ] **Step 1: Update badge HTML with title and truncation**

In `task-detail.mjs`, replace line 63:

```js
// Old:
                    ${isDismissed ? `<span class="badge" style="background:var(--warning-dim);color:var(--warning)">${icon("x", 10)} Dismissed${reason ? ": " + escapeHtml(reason.slice(0, 30)) : ""}</span>` : ""}

// New:
                    ${isDismissed ? `<span class="badge dismiss-reason-badge" title="${escapeHtml(reason)}" style="background:var(--warning-dim);color:var(--warning)">${icon("x", 10)} Dismissed${reason ? ": " + escapeHtml(reason.length > 20 ? reason.slice(0, 20) + "..." : reason) : ""}</span>` : ""}
```

- [ ] **Step 2: Add CSS for dismiss reason badge overflow**

In `styles.css`, after the `.dismiss-custom-input` rule (after line 657), add:

```css
.dismiss-reason-badge {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

- [ ] **Step 3: Verify in browser**

1. Open a session with a dismissed finding (or dismiss one with a long custom reason like "This is a very long dismiss reason that should be truncated properly")
2. Verify the badge shows truncated text with "..." ending
3. Hover over the badge — full reason appears in native tooltip
4. Verify the badge doesn't overflow or break the finding card layout

- [ ] **Step 4: Commit**

```bash
git add skills/audit/scripts/public/js/components/task-detail.mjs skills/audit/scripts/public/styles.css
git commit -m "fix: truncate long dismiss reasons with tooltip on hover"
```
