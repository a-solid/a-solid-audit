# Finding Status Rename + Auto-Acknowledge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename finding statuses to audit-appropriate terms (pending/acknowledged/deferred) and auto-acknowledge info/low findings when a task is first viewed.

**Architecture:** String replacement across 4 files — no structural changes, no new files. Auto-ack is a new async function called before rendering in `renderTasksTab`.

**Tech Stack:** Vanilla JS (ES modules), plain CSS, Node.js backend.

---

### Task 1: Update backend validation and defaults in notes.mjs

**Files:**
- Modify: `skills/audit/scripts/server/handlers/notes.mjs`

- [ ] **Step 1: Update status validation whitelist (line 49)**

Change:
```js
      if (body.status !== undefined && !["confirmed", "action-required", "deferred", ""].includes(body.status)) {
```
to:
```js
      if (body.status !== undefined && !["acknowledged", "action-required", "deferred", "pending", ""].includes(body.status)) {
```

- [ ] **Step 2: Update default finding status (line 63)**

Change:
```js
        const findings = Array.from({ length: findingCount }, () => ({ status: "confirmed", reason: "" }));
```
to:
```js
        const findings = Array.from({ length: findingCount }, () => ({ status: "pending", reason: "" }));
```

- [ ] **Step 3: Verify syntax**

Run: `node --check skills/audit/scripts/server/handlers/notes.mjs`
Expected: no output (clean parse)

- [ ] **Step 4: Commit**

```bash
git add skills/audit/scripts/server/handlers/notes.mjs
git commit -m "refactor: update finding status values — add acknowledged to validation, default to pending

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: Update task-detail.mjs status strings and UI text

**Files:**
- Modify: `skills/audit/scripts/public/js/components/task-detail.mjs`

- [ ] **Step 1: Update status comparisons (lines 94-95)**

Change:
```js
              const isConfirmed = status === "confirmed";
              const isDismissed = status === "deferred";
```
to:
```js
              const isConfirmed = status === "acknowledged";
              const isDismissed = status === "deferred";
```

- [ ] **Step 2: Update badge text for confirmed findings (line 114)**

Change:
```js
                    ${isConfirmed ? `<span class="badge" style="background:var(--success-dim);color:var(--accent)">${icon("check", 10)} Confirmed</span>` : ""}
```
to:
```js
                    ${isConfirmed ? `<span class="badge" style="background:var(--success-dim);color:var(--accent)">${icon("check", 10)} Acknowledged</span>` : ""}
```

- [ ] **Step 3: Update badge text for dismissed findings (line 115)**

Change:
```js
                    ${isDismissed ? `<span class="badge dismiss-reason-badge"${reason ? ` title="${escapeHtml(reason)}"` : ""} style="background:var(--warning-dim);color:var(--warning)">${icon("x", 10)} Dismissed${reason ? ": " + escapeHtml(reason.length > 20 ? reason.slice(0, 20) + "..." : reason) : ""}</span>` : ""}
```
to:
```js
                    ${isDismissed ? `<span class="badge dismiss-reason-badge"${reason ? ` title="${escapeHtml(reason)}"` : ""} style="background:var(--warning-dim);color:var(--warning)">${icon("x", 10)} Deferred${reason ? ": " + escapeHtml(reason.length > 20 ? reason.slice(0, 20) + "..." : reason) : ""}</span>` : ""}
```

- [ ] **Step 4: Verify syntax**

Run: `node --check skills/audit/scripts/public/js/components/task-detail.mjs`
Expected: no output

- [ ] **Step 5: Commit**

```bash
git add skills/audit/scripts/public/js/components/task-detail.mjs
git commit -m "refactor: rename finding status strings — confirmed→acknowledged, dismissed→deferred in card UI

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: Update review.mjs — status strings, toast text, and add auto-ack

**Files:**
- Modify: `skills/audit/scripts/public/js/views/review.mjs`

This is the largest task. 10 targeted replacements plus 1 new function.

- [ ] **Step 1: Update toast text in updateFindingStatus (lines 70-72)**

Change:
```js
	      showToast(
	        status === "confirmed"
	          ? `Confirmed: ${snippet}`
	          : `Dismissed: ${snippet}`,
	        "success"
	      );
```
to:
```js
	      showToast(
	        status === "acknowledged"
	          ? `Acknowledged: ${snippet}`
	          : `Deferred: ${snippet}`,
	        "success"
	      );
```

- [ ] **Step 2: Update opacity transition (line 79)**

Change:
```js
	        findingCard.style.opacity = status === "confirmed" ? "0.6" : "0.3";
```
to:
```js
	        findingCard.style.opacity = status === "acknowledged" ? "0.6" : "0.3";
```

- [ ] **Step 3: Update confirmSelectedFindings default status (line 104)**

Change:
```js
	        return { status: "confirmed", reason: "" };
```
to:
```js
	        return { status: "acknowledged", reason: "" };
```

- [ ] **Step 4: Update overview stats status comparisons (lines 176-177)**

Change:
```js
	        if (f.status === "confirmed") confirmed++;
	        else if (f.status === "deferred") deferred++;
```
to:
```js
	        if (f.status === "acknowledged") confirmed++;
	        else if (f.status === "deferred") deferred++;
```

- [ ] **Step 5: Update overview stats labels (lines 205, 209, 213)**

Change:
```js
	          <div class="quick-stat-label">Confirmed</div>
```
to:
```js
	          <div class="quick-stat-label">Acknowledged</div>
```

Change:
```js
	          <div class="quick-stat-label">Dismissed</div>
```
to:
```js
	          <div class="quick-stat-label">Deferred</div>
```

Change:
```js
	          <div class="quick-stat-label">Unreviewed</div>
```
to:
```js
	          <div class="quick-stat-label">Pending</div>
```

- [ ] **Step 6: Update sidebar progress count (line 332)**

Change:
```js
	      const reviewedCount = (t.review?.findings || []).filter(f => f.status === "confirmed" || f.status === "deferred").length;
```
to:
```js
	      const reviewedCount = (t.review?.findings || []).filter(f => f.status === "acknowledged" || f.status === "deferred").length;
```

- [ ] **Step 7: Update single-finding confirm call (line 394)**

Change:
```js
	        await updateFindingStatus(sessionId, tasks[currentTaskIdx], idx, "confirmed", "");
```
to:
```js
	        await updateFindingStatus(sessionId, tasks[currentTaskIdx], idx, "acknowledged", "");
```

- [ ] **Step 8: Update dismiss reason calls (lines 420 and 431)**

Both lines have:
```js
	        await updateFindingStatus(sessionId, tasks[currentTaskIdx], idx, "deferred", reason);
```
These are already using `"deferred"` so they need no change. Verify they say `"deferred"` and leave them.

- [ ] **Step 9: Update batch confirm button text and toast**

Find the `updateBatchBar` function (around line 497-510). The button text is:
```js
        confirmBtn.innerHTML = `${icon("check", 14)} Confirm ${count} selected ${highNote}`;
```
Change to:
```js
        confirmBtn.innerHTML = `${icon("check", 14)} Acknowledge ${count} selected ${highNote}`;
```

Also find the batch confirm execute block (around line 540):
```js
        confirmBtn.innerHTML = `<span class="spinner spinner-sm"></span> Confirming...`;
```
Change to:
```js
        confirmBtn.innerHTML = `<span class="spinner spinner-sm"></span> Acknowledging...`;
```

And the toast after batch confirm (around line 544-548):
```js
        if (count > 0) {
          showToast(`${count} finding(s) confirmed`, "success");
        } else {
          showToast("No findings were confirmed", "info");
        }
```
Change to:
```js
        if (count > 0) {
          showToast(`${count} finding(s) acknowledged`, "success");
        } else {
          showToast("No findings were acknowledged", "info");
        }
```

Also update the initial bar HTML (around line 492):
```js
          <button class="btn btn-sm batch-confirm-btn" id="batch-confirm-btn" disabled>${icon("check", 14)} Confirm 0 selected</button>
```
Change to:
```js
          <button class="btn btn-sm batch-confirm-btn" id="batch-confirm-btn" disabled>${icon("check", 14)} Acknowledge 0 selected</button>
```

- [ ] **Step 10: Add auto-acknowledge function**

After the `confirmSelectedFindings` function (around line 120), add this new function:

```js
  async function autoAcknowledgeLowSeverity(task) {
    const taskFindings = task.review?.findings || [];
    if (taskFindings.length === 0) return;
    const noteTask = notes?.tasks?.find(t => t.file === task.file);
    const existingFindings = noteTask?.findings || [];
    const LOW_SEVS = ["info", "low"];
    let changed = false;
    const saveFindings = taskFindings.map((f, i) => {
      const existing = existingFindings[i];
      if (existing) return existing;
      if (LOW_SEVS.includes(f.severity)) {
        changed = true;
        return { status: "acknowledged", reason: "" };
      }
      return null;
    });
    if (!changed) return;
    try {
      await api.updateTaskNote(sessionId, task.file, { findings: saveFindings });
      if (!noteTask) {
        if (!notes) notes = { tasks: [] };
        const nt = { file: task.file, findings: saveFindings };
        notes.tasks.push(nt);
      } else {
        noteTask.findings = saveFindings;
      }
    } catch (e) {
      // Silently fail — auto-ack is best-effort
    }
  }
```

- [ ] **Step 11: Call auto-ack in renderTasksTab**

In `renderTasksTab`, right after `const currentTask = tasks[currentTaskIdx];` (line 305) and before `const currentScore = ...`, insert:

```js
    await autoAcknowledgeLowSeverity(currentTask);
```

So the lines become:
```js
    const currentTask = tasks[currentTaskIdx];
    await autoAcknowledgeLowSeverity(currentTask);
    const currentScore = currentTask?.review?.score;
```

- [ ] **Step 12: Verify syntax**

Run: `node --check skills/audit/scripts/public/js/views/review.mjs`
Expected: no output

- [ ] **Step 13: Commit**

```bash
git add skills/audit/scripts/public/js/views/review.mjs
git commit -m "feat: rename finding statuses, add auto-acknowledge for info/low findings

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: Update summary.mjs status strings and labels

**Files:**
- Modify: `skills/audit/scripts/public/js/views/summary.mjs`

- [ ] **Step 1: Update status comparisons (lines 53-54)**

Change:
```js
	      if (f.status === "confirmed") confirmed++;
	      else if (f.status === "deferred") deferred++;
```
to:
```js
	      if (f.status === "acknowledged") confirmed++;
	      else if (f.status === "deferred") deferred++;
```

- [ ] **Step 2: Update action-required check (line 64)**

Change:
```js
	      if (noteF?.status === "confirmed" && (f.severity === "critical" || f.severity === "major" || f.severity === "high")) {
```
to:
```js
	      if (noteF?.status === "acknowledged" && (f.severity === "critical" || f.severity === "major" || f.severity === "high")) {
```

- [ ] **Step 3: Update per-task reviewed count (line 262)**

Change:
```js
	            const reviewedCount = (noteTask?.findings || []).filter(f => f && (f.status === "confirmed" || f.status === "deferred")).length;
```
to:
```js
	            const reviewedCount = (noteTask?.findings || []).filter(f => f && (f.status === "acknowledged" || f.status === "deferred")).length;
```

- [ ] **Step 4: Verify syntax**

Run: `node --check skills/audit/scripts/public/js/views/summary.mjs`
Expected: no output

- [ ] **Step 5: Commit**

```bash
git add skills/audit/scripts/public/js/views/summary.mjs
git commit -m "refactor: update summary view status strings — confirmed→acknowledged

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: Final verification — grep for stale status strings

**Files:** None (verification only)

- [ ] **Step 1: Search for remaining old status strings in source**

Run: `grep -rn '"confirmed"' skills/audit/scripts/public/js/ skills/audit/scripts/server/handlers/ --include="*.mjs"`
Expected: zero matches (all replaced with `"acknowledged"`)

- [ ] **Step 2: Verify no stale UI text**

Run: `grep -rn "Confirmed\|Dismissed\|Unreviewed" skills/audit/scripts/public/js/ --include="*.mjs"`
Expected: zero matches (all replaced with Acknowledged/Deferred/Pending)

- [ ] **Step 3: Verify all JS parses**

Run: `node --check skills/audit/scripts/server/handlers/notes.mjs && node --check skills/audit/scripts/public/js/components/task-detail.mjs && node --check skills/audit/scripts/public/js/views/review.mjs && node --check skills/audit/scripts/public/js/views/summary.mjs && echo "All OK"`
Expected: `All OK`
