# Finding Status UX Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign finding status confirmation UI with clearer action buttons, undo/revert capability, and smooth transitions across finding cards, sidebar, overview, and summary page.

**Architecture:** Replace the icon-only 28px check/X buttons with a labeled inline action bar (Acknowledge + Defer). Add a revert link to acknowledged/deferred cards. Replace single-color progress bars with segmented green/amber/gray bars. Add a stacked review-progress bar to overview and summary pages.

**Tech Stack:** Vanilla JS (ESM), HTML templates in JS, CSS with custom properties. No build step.

---

### Task 1: CSS — New finding card action bar and transition styles

**Files:**
- Modify: `skills/audit/scripts/public/styles.css` (lines 1088–1203)

- [ ] **Step 1: Add action bar styles after the existing `.finding-card .btn-icon` block (after line 1127)**

Insert after the `.finding-card .btn-icon` block and before the collapsible section:

```css
/* ─── Finding Card Action Bar ─── */
.finding-action-bar {
  display: flex;
  gap: var(--space-2);
  padding-top: var(--space-2);
  margin-top: var(--space-2);
  border-top: 1px solid var(--border);
}
.btn-acknowledge {
  flex: 1;
  height: 36px;
  border: 1px solid var(--accent);
  border-radius: var(--radius-md);
  background: var(--accent-dim);
  color: var(--accent);
  font-size: var(--text-sm);
  font-weight: 500;
  font-family: var(--font-ui);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  transition: background var(--duration-fast), opacity var(--duration-fast);
  padding: 0 var(--space-3);
  min-height: 36px;
  min-width: 44px;
}
.btn-acknowledge:hover {
  background: var(--accent);
  color: var(--bg-base);
}
.btn-acknowledge:active {
  opacity: 0.8;
}
.btn-defer-action {
  height: 36px;
  padding: 0 var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--warning);
  font-size: var(--text-sm);
  font-weight: 500;
  font-family: var(--font-ui);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  transition: background var(--duration-fast), border-color var(--duration-fast);
  min-height: 36px;
  min-width: 44px;
}
.btn-defer-action:hover {
  border-color: var(--warning);
  background: var(--warning-dim);
}
.btn-defer-action:active {
  opacity: 0.8;
}
```

- [ ] **Step 2: Add revert button and transition styles**

Insert after the `.btn-defer-action:active` block:

```css
/* ─── Finding Card Revert ─── */
.btn-revert {
  padding: 2px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-muted);
  font-size: var(--text-xs);
  font-family: var(--font-ui);
  cursor: pointer;
  transition: color var(--duration-fast), border-color var(--duration-fast);
}
.btn-revert:hover {
  color: var(--text-primary);
  border-color: var(--border-hover);
}
.finding-revert-hint {
  font-size: var(--text-xs);
  color: var(--text-muted);
  padding-top: var(--space-2);
  margin-top: var(--space-2);
  border-top: 1px solid var(--border);
}
```

- [ ] **Step 3: Update `.finding-card` transition and state classes**

Replace the existing `.finding-card.confirmed` and `.finding-card.dismissed` rules (lines 1112–1113):

```css
.finding-card.confirmed {
  background: linear-gradient(135deg, var(--success-dim), var(--bg-surface));
  border-color: var(--accent);
  border-left-color: var(--accent);
}
.finding-card.dismissed {
  opacity: 0.7;
}
```

Update the `.finding-card` base rule (line 1089) to add transition properties:

```css
.finding-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  border-left: 4px solid;
  transition: border-color 200ms ease-out, background 200ms ease-out, opacity 200ms ease-out;
}
```

Remove the old `.finding-card .btn-sm` and `.finding-card .btn-icon` blocks (lines 1114–1127) since those are no longer used.

- [ ] **Step 4: Add `prefers-reduced-motion` override**

Add at the end of the dismiss panel section (after `.dismiss-reason-badge`):

```css
@media (prefers-reduced-motion: reduce) {
  .finding-card,
  .finding-card.confirmed,
  .finding-card.dismissed {
    transition: none;
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add skills/audit/scripts/public/styles.css
git commit -m "style: add finding card action bar, revert button, and transition CSS"
```

---

### Task 2: CSS — Segmented progress bar and review progress bar

**Files:**
- Modify: `skills/audit/scripts/public/styles.css` (after line 770)

- [ ] **Step 1: Add segmented progress bar for sidebar**

Insert after `.task-sidebar-separator` (line 770):

```css
.task-nav-progress-segmented {
  display: flex;
  height: 4px;
  border-radius: 2px;
  overflow: hidden;
  background: var(--bg-active);
  gap: 1px;
  margin-top: var(--space-1);
}
.task-nav-progress-seg {
  height: 100%;
  border-radius: 1px;
  transition: flex var(--duration-base) var(--ease-spring);
}
.task-nav-progress-seg.seg-ack { background: var(--accent); }
.task-nav-progress-seg.seg-defer { background: var(--warning); }
.task-nav-progress-seg.seg-pending { background: var(--border); }
.task-nav-progress-legend {
  display: flex;
  gap: var(--space-2);
  margin-top: 2px;
  font-size: 10px;
  color: var(--text-muted);
}
.task-nav-progress-legend span { white-space: nowrap; }
```

- [ ] **Step 2: Add review progress bar for overview/summary**

Insert after the quick-stats section (after line 798):

```css
/* ─── Review Progress Bar ─── */
.review-progress-bar {
  display: flex;
  height: 8px;
  border-radius: 4px;
  overflow: hidden;
  background: var(--bg-active);
}
.review-progress-seg {
  height: 100%;
  transition: width var(--duration-base) var(--ease-spring);
}
.review-progress-seg.seg-ack { background: var(--accent); }
.review-progress-seg.seg-defer { background: var(--warning); }
.review-progress-seg.seg-pending { background: var(--border); }
.review-progress-label {
  display: flex;
  justify-content: space-between;
  margin-top: var(--space-1);
  font-size: var(--text-xs);
  color: var(--text-muted);
}
.review-progress-warning {
  margin-top: var(--space-4);
  padding: var(--space-3);
  background: var(--danger-dim);
  border: 1px solid var(--danger);
  border-radius: var(--radius-md);
  color: var(--danger);
  font-size: var(--text-sm);
}
```

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/public/styles.css
git commit -m "style: add segmented progress bar and review progress bar CSS"
```

---

### Task 3: task-detail.mjs — Replace icon buttons with action bar and revert

**Files:**
- Modify: `skills/audit/scripts/public/js/components/task-detail.mjs`

- [ ] **Step 1: Replace the finding card template (lines 83–149)**

Replace the entire `return` block inside the `.map()` callback (lines 91–148) with the new template. The key changes:
- Remove the two icon buttons (`.btn-confirm`, `.btn-dismiss`)
- Add action bar with `.btn-acknowledge` and `.btn-defer-action` for pending cards
- Add `.btn-revert` for acknowledged/deferred cards
- Add transition class `finding-card-transition` to the card div
- Show dashed "Pending" badge for unreviewed state

Replace the return block:

```javascript
              return `
              <div class="finding-card severity-${f.severity}${isConfirmed ? " confirmed" : ""}${isDismissed ? " dismissed" : ""}" data-finding="${i}">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <span class="badge severity-${f.severity}">${getSeverityIcon(f.severity)} ${f.severity}</span>
                    ${isConfirmed ? `<span class="badge" style="background:var(--accent-dim);color:var(--accent)">${icon("check", 10)} Acknowledged</span>` : ""}
                    ${isDismissed ? `<span class="badge dismiss-reason-badge"${reason ? ` title="${escapeHtml(reason)}"` : ""} style="background:var(--warning-dim);color:var(--warning)">${icon("x", 10)} Deferred${reason ? ": " + escapeHtml(reason.length > 25 ? reason.slice(0, 25) + "..." : reason) : ""}</span>` : ""}
                    ${isUnreviewed ? `<span class="badge" style="background:transparent;color:var(--text-muted);border:1px dashed var(--border)">Pending</span>` : ""}
                  </div>
                  ${(isConfirmed || isDismissed) ? `<button class="btn-revert" data-revert="${i}" title="Revert to pending">${icon("undo2", 12)} Revert</button>` : ""}
                </div>
                <div class="text-sm" style="margin-top:var(--space-2)">${escapeHtml(f.description || "")}</div>
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
                ${isUnreviewed ? `
                  <div class="finding-action-bar">
                    <button class="btn-acknowledge" data-ack="${i}" title="Acknowledge finding">${icon("check", 14)} Acknowledge</button>
                    <button class="btn-defer-action" data-defer="${i}" title="Defer finding">${icon("x", 14)} Defer</button>
                  </div>
                ` : ""}
                ${(f.code || f.suggestion) ? `
                  <button class="finding-collapse-toggle mt-2" data-collapse-toggle="${i}">
                    <span class="toggle-icon">${icon("chevronRight", 12)}</span>
                    ${f.code && f.suggestion ? "Show details" : f.code ? "Show code" : "Show suggestion"}
                  </button>
                  <div class="finding-collapsible" data-collapsible="${i}">
                    ${f.code ? `
                      <pre class="mt-2 p-3" style="border-color:var(--border)"><code class="text-xs">${escapeHtml(f.code)}</code></pre>
                    ` : ""}
                    ${f.suggestion ? `
                      <div class="text-sm mt-2 flex items-start gap-2" style="color:var(--info)">
                        ${icon("zap", 14)}
                        <span>${escapeHtml(f.suggestion)}</span>
                      </div>
                    ` : ""}
                  </div>
                ` : ""}
                ${f.file ? `
                  <div class="text-xs text-muted mt-2 flex items-center gap-1" style="min-width:0">
                    ${icon("file", 12)}
                    <span class="font-mono truncate" title="${escapeHtml(f.file)}${f.line ? ":" + f.line : ""}">${escapeHtml(f.file)}${f.line ? ":" + f.line : ""}</span>
                  </div>
                ` : ""}
              </div>`;
```

Note: The icon `"undo2"` must exist in the icon registry in `app.mjs`. Check for it — if not present, use `"rotateCcw"` which is a Lucide icon name. If neither exists, use text `↩` instead.

- [ ] **Step 2: Commit**

```bash
git add skills/audit/scripts/public/js/components/task-detail.mjs
git commit -m "feat: replace icon buttons with action bar and revert in finding cards"
```

---

### Task 4: review.mjs — Update event handlers for new action bar + revert + sidebar progress

**Files:**
- Modify: `skills/audit/scripts/public/js/views/review.mjs`

- [ ] **Step 1: Update `updateFindingStatus` to handle revert (lines 50–89)**

The function already handles all three statuses. For revert, we pass `null` as status. Update the toast messages to handle the revert case. Replace lines 68–73:

```javascript
      const statusLabel = status === "acknowledged"
        ? "Acknowledged"
        : status === "deferred"
        ? "Deferred"
        : "Reverted";
      showToast(`${statusLabel}: ${snippet}`, "success");
```

And update the visual transition (lines 76–78) to handle revert:

```javascript
      if (findingCard) {
        findingCard.style.transition = "opacity 200ms ease-out";
        findingCard.style.opacity = status === "acknowledged" ? "0.6" : status === "deferred" ? "0.3" : "0.6";
      }
```

- [ ] **Step 2: Replace button event handlers (lines 391–441)**

Replace the entire block from `// Wire up confirm/dismiss buttons` to the end of the `.dismiss-custom-input` click handler. The old code wired `.btn-confirm` and `.btn-dismiss`. The new code wires `.btn-acknowledge`, `.btn-defer-action`, and `.btn-revert`:

```javascript
    // Wire up acknowledge buttons
    detailPanel.querySelectorAll(".btn-acknowledge").forEach(btn => {
      btn.addEventListener("click", async () => {
        const idx = parseInt(btn.dataset.ack);
        await updateFindingStatus(sessionId, tasks[currentTaskIdx], idx, "acknowledged", "");
      });
    });
    // Wire up defer buttons (toggle dismiss panel)
    detailPanel.querySelectorAll(".btn-defer-action").forEach(btn => {
      btn.addEventListener("click", () => {
        const idx = btn.dataset.defer;
        detailPanel.querySelectorAll(".dismiss-panel").forEach(p => {
          if (p.dataset.dismissPanel !== idx) p.classList.add("hidden");
        });
        const panel = detailPanel.querySelector(`[data-dismiss-panel="${idx}"]`);
        panel.classList.toggle("hidden");
        if (!panel.classList.contains("hidden")) {
          requestAnimationFrame(() => {
            panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
          });
        }
      });
    });
    // Wire up revert buttons
    detailPanel.querySelectorAll(".btn-revert").forEach(btn => {
      btn.addEventListener("click", async () => {
        const idx = parseInt(btn.dataset.revert);
        await updateFindingStatus(sessionId, tasks[currentTaskIdx], idx, null, "");
      });
    });
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
    // Prevent dismiss custom input clicks from bubbling
    detailPanel.querySelectorAll(".dismiss-custom-input").forEach(input => {
      input.addEventListener("click", (e) => e.stopPropagation());
    });
    // Prevent clicks inside dismiss panels from closing them
    detailPanel.querySelectorAll(".dismiss-panel").forEach(panel => {
      panel.addEventListener("click", (e) => e.stopPropagation());
    });
```

- [ ] **Step 3: Update sidebar progress rendering (lines 331–349)**

Replace the sidebar item template. The key change is replacing the single-color `.task-nav-progress` with a segmented bar. Replace the template inside `sidebar.innerHTML = sorted.map(...)`:

Inside each sidebar item, replace the progress bar and add a legend. The old progress bar was:

```javascript
<div class="task-nav-progress"><div class="task-nav-progress-fill" style="width:${progressPct}%"></div></div>
```

Replace with:

```javascript
              <div class="task-nav-progress-segmented">
                ${(ackCount > 0) ? `<div class="task-nav-progress-seg seg-ack" style="flex:${ackCount}"></div>` : ""}
                ${(deferCount > 0) ? `<div class="task-nav-progress-seg seg-defer" style="flex:${deferCount}"></div>` : ""}
                ${(pendingCount > 0) ? `<div class="task-nav-progress-seg seg-pending" style="flex:${pendingCount}"></div>` : ""}
              </div>
              <div class="task-nav-progress-legend">
                ${ackCount > 0 ? `<span style="color:var(--accent)">${ackCount} ack</span>` : ""}
                ${deferCount > 0 ? `<span style="color:var(--warning)">${deferCount} defer</span>` : ""}
                ${pendingCount > 0 ? `<span>${pendingCount} pending</span>` : ""}
              </div>
```

This requires computing `ackCount`, `deferCount`, `pendingCount` per task. Add these computations before the template, replacing the old `reviewedCount` and `progressPct` calculations:

```javascript
      const noteTaskForSidebar = noteTasks.find(nt => nt.file === t.file);
      const ackCount = (t.review?.findings || []).filter((f, fi) => {
        const nf = noteTaskForSidebar?.findings?.[fi];
        return nf?.status === "acknowledged";
      }).length;
      const deferCount = (t.review?.findings || []).filter((f, fi) => {
        const nf = noteTaskForSidebar?.findings?.[fi];
        return nf?.status === "deferred";
      }).length;
      const pendingCount = (t.review?.findings || []).length - ackCount - deferCount;
```

**Important:** `noteTasks` is defined inside `renderOverview` but the sidebar is inside `renderTasksTab`. Add `const noteTasks = notes?.tasks || [];` at the top of `renderTasksTab` function body (after line 300) so it's in scope for the sidebar rendering.

- [ ] **Step 4: Update overview tab stats (lines 187–216)**

Replace the `quick-stats-row` section with the new 4-stat-card layout and review progress bar. Replace lines 187–216:

```javascript
    el.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div class="stat-card">
          <div class="stat-value" style="color:${avgScore >= 7 ? "var(--accent)" : avgScore >= 4 ? "var(--warning)" : "var(--danger)"}">${avgScore}/10</div>
          <div class="stat-label">Avg Score</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${totalFindings}</div>
          <div class="stat-label">Findings</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${tasks.length}</div>
          <div class="stat-label">Tasks</div>
        </div>
      </div>

      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div class="stat-card">
          <div class="stat-value">${totalFindingsFromAll}</div>
          <div class="stat-label">Total</div>
        </div>
        <div class="stat-card">
          <div class="stat-value stat-value-success">${confirmed}</div>
          <div class="stat-label">Acknowledged</div>
        </div>
        <div class="stat-card">
          <div class="stat-value stat-value-warning">${deferred}</div>
          <div class="stat-label">Deferred</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color:var(--text-muted)">${unreviewedCount}</div>
          <div class="stat-label">Pending</div>
        </div>
      </div>

      <div class="card mb-4">
        <div class="font-medium mb-2">Review Progress</div>
        <div class="review-progress-bar">
          ${(confirmed > 0) ? `<div class="review-progress-seg seg-ack" style="width:${confirmPct}%"></div>` : ""}
          ${(deferred > 0) ? `<div class="review-progress-seg seg-defer" style="width:${dismissPct}%"></div>` : ""}
          <div class="review-progress-seg seg-pending" style="width:${unreviewedPct}%"></div>
        </div>
        <div class="review-progress-label">
          <span>${confirmPct + dismissPct}% reviewed</span>
          <span>${unreviewedCount} remaining</span>
        </div>
      </div>
```

Remove the old `quick-stats-row` HTML entirely. The rest of the overview (severity chart, needs attention, review context) stays the same.

- [ ] **Step 5: Commit**

```bash
git add skills/audit/scripts/public/js/views/review.mjs
git commit -m "feat: update review view with action bar handlers, segmented sidebar, overview stats"
```

---

### Task 5: summary.mjs — Update stat cards and add progress bar + warning

**Files:**
- Modify: `skills/audit/scripts/public/js/views/summary.mjs`

- [ ] **Step 1: Replace stat cards and add progress bar + warning banner (lines 64–96)**

Replace the stat cards and severity chart section. Keep the severity chart, but update the stat cards and add the progress bar and warning. Replace lines 64–96:

```javascript
  content.innerHTML = `
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
      <div class="stat-card">
        <div class="stat-value">${totalFindings}</div>
        <div class="stat-label">Total</div>
      </div>
      <div class="stat-card">
        <div class="stat-value stat-value-success">${acknowledged}</div>
        <div class="stat-label">Acknowledged</div>
      </div>
      <div class="stat-card">
        <div class="stat-value stat-value-warning">${deferred}</div>
        <div class="stat-label">Deferred</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color:var(--text-muted)">${pending}</div>
        <div class="stat-label">Pending</div>
      </div>
    </div>

    <div class="card mb-6">
      <div class="font-medium mb-2">Review Progress</div>
      <div class="review-progress-bar">
        ${(acknowledged > 0) ? `<div class="review-progress-seg seg-ack" style="width:${Math.round(acknowledged / Math.max(totalFindings, 1) * 100)}%"></div>` : ""}
        ${(deferred > 0) ? `<div class="review-progress-seg seg-defer" style="width:${Math.round(deferred / Math.max(totalFindings, 1) * 100)}%"></div>` : ""}
        <div class="review-progress-seg seg-pending" style="width:${Math.round(pending / Math.max(totalFindings, 1) * 100)}%"></div>
      </div>
      <div class="review-progress-label">
        <span>${Math.round((acknowledged + deferred) / Math.max(totalFindings, 1) * 100)}% reviewed</span>
        <span>${pending} remaining</span>
      </div>
    </div>

    ${pending > 0 ? `
      <div class="review-progress-warning">
        ${pending} finding${pending !== 1 ? "s" : ""} still pending review — complete all reviews before sign-off
      </div>
    ` : ""}

    ${Object.keys(bySeverity).length > 0 ? `
    <div class="card mb-6">
      <div class="font-medium mb-4">Findings by Severity</div>
      ${Object.entries(bySeverity).map(([sev, count]) => `
        <div class="severity-bar-row">
          <span class="badge severity-${sev} severity-bar-label">${SEVERITY_LABELS[sev] || sev}</span>
          <div class="severity-bar-track">
            <div class="severity-bar-fill" style="width:${(count / maxSevCount) * 100}%;background:${SEVERITY_COLORS[sev] || "var(--info)"}"></div>
          </div>
          <span class="severity-bar-count">${count}</span>
        </div>
      `).join("")}
    </div>` : ""}
```

- [ ] **Step 2: Commit**

```bash
git add skills/audit/scripts/public/js/views/summary.mjs
git commit -m "feat: update summary page with progress bar, warning banner, and stat cards"
```

---

### Task 6: Check icon registry and manual verification

**Files:**
- Modify: `skills/audit/scripts/public/js/app.mjs` (if `undo2` icon is missing)

- [ ] **Step 1: Check if `undo2` icon exists in the icon registry**

Run: `grep -n 'undo2\|rotateCcw' skills/audit/scripts/public/js/app.mjs`

If neither exists, find the icon function and add an `undo2` entry using the Lucide "undo-2" SVG path:

```javascript
undo2: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>',
```

- [ ] **Step 2: Start the server and manually verify**

Run: `node skills/audit/scripts/cli.mjs server` (if not already running)

Open `http://localhost:3456` in a browser and navigate to a completed session's review page. Verify:

1. Finding cards show "Pending" badge with dashed border for unreviewed findings
2. Action bar appears with "Acknowledge" and "Defer" buttons at bottom of pending cards
3. Clicking "Acknowledge" transitions the card smoothly to acknowledged state
4. "Revert" button appears on acknowledged/deferred cards
5. Clicking "Revert" returns the card to pending state
6. Sidebar shows segmented progress bar with green/amber/gray segments
7. Overview tab shows 4 stat cards + review progress bar
8. Summary page shows 4 stat cards + progress bar + warning banner (if pending findings exist)

- [ ] **Step 3: Final commit if any icon fix was needed**

```bash
git add skills/audit/scripts/public/js/app.mjs
git commit -m "fix: add undo2 icon for revert button"
```
