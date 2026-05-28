# Tasks Summary Endpoint & Well-Done Auto-Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a lightweight tasks/summary endpoint and auto-apply `well-done` status for story `met` findings and no-finding tasks.

**Architecture:** Two independent features. Feature 1 adds a server-side `getTasksSummary()` that reads only `index.yaml` and exposes it as `GET /api/sessions/:id/tasks/summary`. Feature 2 adds a `well-done` finding status that is auto-persisted for `met`-severity findings on page load, and treats zero-finding tasks as fully reviewed.

**Tech Stack:** Node.js HTTP server, vanilla JS frontend, YAML file storage

---

## Feature 1: Tasks Summary Endpoint

### Task 1: Add `getTasksSummary()` to `lib/task.mjs`

**Files:**
- Modify: `skills/audit/scripts/lib/task.mjs:57-85` (after `getTasks`)

- [ ] **Step 1: Add the function**

Add after `getTasks` (after line 85):

```javascript
// Lightweight task list from index.yaml only — no per-task YAML reads
export function getTasksSummary(reportsDir, sid) {
  const safeSid = sanitizePath(sid);
  const sessionDir = path.join(reportsDir, safeSid);
  const indexPath = path.join(sessionDir, "index.yaml");
  if (!fs.existsSync(indexPath)) throw new AppError("Session not found: " + safeSid, "NOT_FOUND", 404);

  const index = readYaml(indexPath);
  const result = [];

  const groups = [
    { refs: index.codeTasks || [], type: "code" },
    { refs: index.storyTasks || [], type: "story" },
    { refs: index.projectTasks || [], type: "project" },
  ];

  for (const { refs, type } of groups) {
    for (const ref of refs) {
      result.push({ type, file: ref.file, status: ref.status || "pending" });
    }
  }

  return result;
}
```

- [ ] **Step 2: Verify server starts**

Run: `curl -s http://localhost:3456/api/sessions`
Expected: existing sessions list (server already running)

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/lib/task.mjs
git commit -m "feat: add getTasksSummary() — lightweight task list from index.yaml only"
```

---

### Task 2: Register the summary route

**Files:**
- Modify: `skills/audit/scripts/server/handlers/tasks.mjs:1-22`

- [ ] **Step 1: Update imports and add route**

In `tasks.mjs`, update the import line:

```javascript
import { getTasks, getTask, getTasksSummary } from "../../lib/task.mjs";
```

Add the new route after the existing `GET /api/sessions/:id/tasks` handler (after line 21):

```javascript
  // GET /api/sessions/:id/tasks/summary — lightweight task list
  router.get("/api/sessions/:id/tasks/summary", (req, res, params) => {
    try {
      const tasks = getTasksSummary(reportsDir, params.id);
      jsonResponse(res, tasks);
    } catch (e) {
      throw e;
    }
  });
```

**IMPORTANT:** This route must be registered BEFORE the `:id` route in the code, because the router matches routes in registration order and `tasks/summary` would otherwise be matched by `tasks/:id` with `id = "summary"`. Check how the router works — it uses exact path segment matching, so `tasks/summary` (2 segments after `sessions/:id`) won't conflict with `tasks` (1 segment). Verify by reading `router.mjs` — the route `api/sessions/:id/tasks/summary` has 5 segments, `api/sessions/:id/tasks` has 4 segments. They won't conflict.

- [ ] **Step 2: Restart server and test**

```bash
# Restart server (kill existing first)
curl -s http://localhost:3456/api/sessions/2026-05-28T08-31-11.432Z/tasks/summary
```

Expected: `[{"type":"code","file":"code-tasks/...","status":"reviewed"}, ...]`

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/server/handlers/tasks.mjs
git commit -m "feat: add GET /tasks/summary route — lightweight task list endpoint"
```

---

### Task 3: Add client-side `api.getTasksSummary()`

**Files:**
- Modify: `skills/audit/scripts/public/js/api.mjs:63-66`

- [ ] **Step 1: Add the method**

After line 63 (after `getTasks`), add:

```javascript
  getTasksSummary: (id) => request("GET", `/api/sessions/${encodeURIComponent(id)}/tasks/summary`),
```

- [ ] **Step 2: Verify in browser console**

Open `http://localhost:3456` in browser, DevTools console:
`api.getTasksSummary("2026-05-28T08-31-11.432Z").then(console.log)`
Expected: array of `{type, file, status}` objects

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/public/js/api.mjs
git commit -m "feat: add api.getTasksSummary() client method"
```

---

### Task 4: Switch progress.mjs polling to summary

**Files:**
- Modify: `skills/audit/scripts/public/js/views/progress.mjs:207`

- [ ] **Step 1: Replace getTasks with getTasksSummary**

Change line 207 from:
```javascript
      try { tasks = await api.getTasks(sessionId); } catch (e) {
```
to:
```javascript
      try { tasks = await api.getTasksSummary(sessionId); } catch (e) {
```

- [ ] **Step 2: Remove score display from task list rendering**

The summary response has no `review.score` or `name`. Update the task card rendering (around line 231) — change the score display line:

From:
```javascript
              ${t.review?.score ? `<span class="text-sm font-mono ${scoreColor}">${t.review.score}/10</span>` : ""}
```
To (remove entirely):
```javascript
```

Also remove the `scoreColor` variable since it's unused now (line 230):
```javascript
        const scoreColor = t.review?.score >= 7 ? "text-success" : t.review?.score >= 4 ? "text-warning" : "text-danger";
```
Remove this line.

Also change the task name display — summary has `file` but not `name`. Change:
```javascript
${escapeHtml(t.name || t.file)}
```
to appear twice in the template. The existing `t.name || t.file` already handles this correctly since `name` will be undefined in the summary response, falling back to `file`. No change needed here.

- [ ] **Step 3: Verify in browser**

Navigate to a session's progress page. Task cards should show without scores but with correct status and file names.

- [ ] **Step 4: Commit**

```bash
git add skills/audit/scripts/public/js/views/progress.mjs
git commit -m "perf: switch progress polling to lightweight tasks/summary endpoint"
```

---

### Task 5: Update SKILL.md

**Files:**
- Modify: `skills/audit/SKILL.md:53`

- [ ] **Step 1: Change the curl command**

Change line 53 from:
```bash
   curl -s http://localhost:3456/api/sessions/<session-id>/tasks
```
to:
```bash
   curl -s http://localhost:3456/api/sessions/<session-id>/tasks/summary
```

- [ ] **Step 2: Commit**

```bash
git add skills/audit/SKILL.md
git commit -m "docs: update SKILL.md to use tasks/summary endpoint for task dispatch"
```

---

## Feature 2: Well-Done Auto-Review

### Task 6: Add `well-done` CSS styles

**Files:**
- Modify: `skills/audit/scripts/public/styles.css:801-804, 854-857`

- [ ] **Step 1: Add sidebar progress bar segment**

After line 804:
```css
.task-nav-progress-seg.seg-pending { background: var(--border); }
```
Add:
```css
.task-nav-progress-seg.seg-well-done { background: var(--accent); }
```

- [ ] **Step 2: Add review overview progress bar segment**

After line 857:
```css
.review-progress-seg.seg-pending { background: var(--border); }
```
Add:
```css
.review-progress-seg.seg-well-done { background: var(--accent); }
```

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/public/styles.css
git commit -m "feat: add seg-well-done CSS for progress bar segments"
```

---

### Task 7: Update `aggregateFindings` in constants.mjs

**Files:**
- Modify: `skills/audit/scripts/public/js/constants.mjs:27-49`

- [ ] **Step 1: Add wellDone count**

Change `aggregateFindings` to count `well-done` status:

```javascript
export function aggregateFindings(tasks, notes) {
  const noteTasks = notes?.tasks || [];
  let needFix = 0, wontFix = 0, notAnIssue = 0, wellDone = 0, pendingCount = 0;
  const bySeverity = {};
  let totalFindings = 0;
  tasks.forEach(t => {
    const findings = t.review?.findings || [];
    totalFindings += findings.length;
    findings.forEach(f => {
      bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
    });
    const noteTask = noteTasks.find(nt => nt.file === t.file);
    findings.forEach((f, i) => {
      const status = noteTask?.findings?.[i]?.status;
      if (status === "need-fix") needFix++;
      else if (status === "wont-fix") wontFix++;
      else if (status === "not-an-issue") notAnIssue++;
      else if (status === "well-done") wellDone++;
      else pendingCount++;
    });
  });
  const reviewed = needFix + wontFix + notAnIssue + wellDone;
  return { totalFindings, bySeverity, needFix, wontFix, notAnIssue, wellDone, pendingCount, reviewed };
}
```

- [ ] **Step 2: Commit**

```bash
git add skills/audit/scripts/public/js/constants.mjs
git commit -m "feat: count well-done findings in aggregateFindings"
```

---

### Task 8: Auto-persist well-done for met findings + update task-detail.mjs

**Files:**
- Modify: `skills/audit/scripts/public/js/components/task-detail.mjs:83-135`

- [ ] **Step 1: Add auto-persist logic**

The `renderTaskDetail` function receives `task` and `notes` but has no access to `api` or `sessionId` for persistence. The auto-persist must happen in `review.mjs` (the caller), not in the component. We'll handle persistence in Task 11.

For now, update `task-detail.mjs` to render `well-done` status for `met` findings.

In `renderTaskDetail`, change the finding status detection (around line 84-89). Currently:
```javascript
              const status = noteTask?.findings?.[i]?.status || null;
              const isNeedFix = status === "need-fix";
              const isWontFix = status === "wont-fix";
              const isNotAnIssue = status === "not-an-issue";
              const isReviewed = isNeedFix || isWontFix || isNotAnIssue;
              const isUnreviewed = !status;
```

Change to:
```javascript
              const status = noteTask?.findings?.[i]?.status || (f.severity === "met" ? "well-done" : null);
              const isNeedFix = status === "need-fix";
              const isWontFix = status === "wont-fix";
              const isNotAnIssue = status === "not-an-issue";
              const isWellDone = status === "well-done";
              const isReviewed = isNeedFix || isWontFix || isNotAnIssue || isWellDone;
              const isUnreviewed = !status;
```

- [ ] **Step 2: Update status badge rendering**

After the `isNotAnIssue` badge (line 94), add the `well-done` badge. Change:

```javascript
              const statusBadge = isNeedFix ? `<span class="badge badge-need-fix">${icon("alertCircle", 10)} Need Fix</span>`
                : isWontFix ? `<span class="badge badge-wont-fix"${reason ? ` title="${escapeHtml(reason)}"` : ""}>${icon("minus", 10)} Won't Fix${reason ? ": " + escapeHtml(reason.length > 25 ? reason.slice(0, 25) + "..." : reason) : ""}</span>`
                : isNotAnIssue ? `<span class="badge badge-not-an-issue"${reason ? ` title="${escapeHtml(reason)}"` : ""}>${icon("x", 10)} Not an Issue${reason ? ": " + escapeHtml(reason.length > 25 ? reason.slice(0, 25) + "..." : reason) : ""}</span>`
                : `<span class="badge" style="background:transparent;color:var(--text-muted);border:1px dashed var(--border)">Pending</span>`;
```

To:
```javascript
              const statusBadge = isNeedFix ? `<span class="badge badge-need-fix">${icon("alertCircle", 10)} Need Fix</span>`
                : isWontFix ? `<span class="badge badge-wont-fix"${reason ? ` title="${escapeHtml(reason)}"` : ""}>${icon("minus", 10)} Won't Fix${reason ? ": " + escapeHtml(reason.length > 25 ? reason.slice(0, 25) + "..." : reason) : ""}</span>`
                : isNotAnIssue ? `<span class="badge badge-not-an-issue"${reason ? ` title="${escapeHtml(reason)}"` : ""}>${icon("x", 10)} Not an Issue${reason ? ": " + escapeHtml(reason.length > 25 ? reason.slice(0, 25) + "..." : reason) : ""}</span>`
                : isWellDone ? `<span class="badge" style="background:var(--accent);color:var(--btn-primary-text)">${icon("check", 10)} Well Done</span>`
                : `<span class="badge" style="background:transparent;color:var(--text-muted);border:1px dashed var(--border)">Pending</span>`;
```

- [ ] **Step 3: Hide action bar for well-done findings**

Change the action bar rendering (line 129-135). Currently shows for all `isUnreviewed` findings. The `met` findings now have `status = "well-done"` so `isUnreviewed` is already `false`. No action bar change needed — the existing condition `${isUnreviewed ? `...action bar...` : ""}` already handles it correctly since `met` findings won't be `isUnreviewed`.

- [ ] **Step 4: Add "Clean code" message for zero-finding tasks**

In the findings section (around line 79-163), after `${findings.length > 0 ? `...findings...` : ""}` add an else clause. Change:

```javascript
      ${findings.length > 0 ? `
        <div>
          <div class="text-xs text-muted font-semibold mb-3">FINDINGS (${findings.length})</div>
          ...
        </div>
      ` : ""}
```

To:
```javascript
      ${findings.length > 0 ? `
        <div>
          <div class="text-xs text-muted font-semibold mb-3">FINDINGS (${findings.length})</div>
          ...
        </div>
      ` : `
        <div class="card" style="text-align:center;padding:var(--space-6);color:var(--accent)">
          ${icon("check", 20)}
          <div class="text-sm mt-2">Clean code — no issues found</div>
        </div>
      `}
```

- [ ] **Step 5: Commit**

```bash
git add skills/audit/scripts/public/js/components/task-detail.mjs
git commit -m "feat: auto well-done for met findings + clean code message for zero findings"
```

---

### Task 9: Auto-persist well-done + update sidebar in review.mjs

**Files:**
- Modify: `skills/audit/scripts/public/js/views/review.mjs`

- [ ] **Step 1: Add auto-persist function**

After the `updateFindingStatus` function (around line 70), add:

```javascript
  async function autoPersistWellDone() {
    for (const task of tasks) {
      const findings = task.review?.findings || [];
      if (findings.length === 0) continue;
      const noteTask = notes?.tasks?.find(nt => nt.file === task.file);
      const noteFindings = noteTask?.findings || [];
      let changed = false;
      for (let i = 0; i < findings.length; i++) {
        if (findings[i].severity === "met" && !noteFindings[i]?.status) {
          noteFindings[i] = { status: "well-done" };
          changed = true;
        }
      }
      if (changed) {
        await api.updateTaskNote(sessionId, task.file, { findings: noteFindings });
        let existing = notes.tasks.find(nt => nt.file === task.file);
        if (!existing) {
          existing = { file: task.file, findings: noteFindings };
          notes.tasks.push(existing);
        } else {
          existing.findings = noteFindings;
        }
      }
    }
  }
```

Call it after data loads (after line 50, before rendering):

```javascript
    await autoPersistWellDone();
```

- [ ] **Step 2: Add well-done to sidebar reviewedCounts**

In the sidebar rendering (around line 341), change:

```javascript
      const reviewedCounts = { "need-fix": 0, "wont-fix": 0, "not-an-issue": 0, pending: 0 };
      (t.review?.findings || []).forEach((f, fi) => {
        const s = noteTaskForSidebar?.findings?.[fi]?.status;
        if (reviewedCounts[s] !== undefined) reviewedCounts[s]++;
        else reviewedCounts.pending++;
      });
```

To:
```javascript
      const reviewedCounts = { "need-fix": 0, "wont-fix": 0, "not-an-issue": 0, "well-done": 0, pending: 0 };
      (t.review?.findings || []).forEach((f, fi) => {
        const s = noteTaskForSidebar?.findings?.[fi]?.status || (f.severity === "met" ? "well-done" : null);
        if (s && reviewedCounts[s] !== undefined) reviewedCounts[s]++;
        else reviewedCounts.pending++;
      });
```

- [ ] **Step 3: Update humanDone to include well-done**

Change:
```javascript
      const humanDone = reviewedCounts["need-fix"] + reviewedCounts["wont-fix"] + reviewedCounts["not-an-issue"];
```
To:
```javascript
      const humanDone = reviewedCounts["need-fix"] + reviewedCounts["wont-fix"] + reviewedCounts["not-an-issue"] + reviewedCounts["well-done"];
```

- [ ] **Step 4: Add well-done segment to sidebar progress bar**

After the `not-an-issue` segment (line 385), add:
```javascript
                ${(reviewedCounts["well-done"] > 0) ? `<div class="task-nav-progress-seg seg-well-done" style="flex:${reviewedCounts["well-done"]}"></div>` : ""}
```

- [ ] **Step 5: Add well-done to sidebar legend**

After the `not-an-issue` legend item (line 391), add:
```javascript
                ${reviewedCounts["well-done"] > 0 ? `<span style="color:var(--accent)">${reviewedCounts["well-done"]} done</span>` : ""}
```

- [ ] **Step 6: Handle zero-finding tasks in sidebar status**

The sidebar status badge logic (around line 354-365) currently shows "Unreviewed" when `humanDone === 0`. For zero-finding tasks, `humanDone` is now 0 but `humanTotal` is also 0. Change the condition:

From:
```javascript
        if (humanDone === 0) {
          statusBadge = "Unreviewed";
          statusBadgeClass = "badge-unreviewed";
        } else if (humanDone < humanTotal) {
```

To:
```javascript
        if (humanTotal === 0) {
          statusBadge = "Complete";
          statusBadgeClass = "badge-complete";
        } else if (humanDone === 0) {
          statusBadge = "Unreviewed";
          statusBadgeClass = "badge-unreviewed";
        } else if (humanDone < humanTotal) {
```

This makes zero-finding tasks show "Complete" instead of "Unreviewed".

- [ ] **Step 7: Update review overview progress bar**

In the overview tab rendering (around line 160-170), update the destructuring:

```javascript
    const { totalFindings, bySeverity, needFix: needFixCount, wontFix: wontFixCount, notAnIssue: notAnIssueCount, wellDone: wellDoneCount, reviewed: reviewedCount, pendingCount: unreviewedCount } = aggregateFindings(tasks, notes);
```

Add well-done percentage:
```javascript
    const wellDonePct = Math.round(wellDoneCount / findingsTotal * 100);
    const unreviewedPct = 100 - needFixPct - wontFixPct - notAnIssuePct - wellDonePct;
```

Add the segment to the progress bar (after `not-an-issue` segment):
```javascript
          ${(wellDoneCount > 0) ? `<div class="review-progress-seg seg-well-done" style="width:${wellDonePct}%"></div>` : ""}
```

Add a stat card for well-done in the 4-column grid. Change the grid from `grid-cols-4` to `grid-cols-5` and add after the "Not an Issue" card:

```javascript
        <div class="stat-card">
          <div class="stat-value" style="color:var(--accent)">${wellDoneCount}</div>
          <div class="stat-label">Well Done</div>
        </div>
```

Update the grid class from `grid-cols-2 md:grid-cols-4` to `grid-cols-2 md:grid-cols-5`.

- [ ] **Step 8: Verify in browser**

Navigate to the review page of a completed session. Check:
- Story `met` findings show green "Well Done" badge, no action buttons
- Zero-finding tasks show "Complete" in sidebar
- Progress bars include green "done" segments
- Overview stats show "Well Done" count

- [ ] **Step 9: Commit**

```bash
git add skills/audit/scripts/public/js/views/review.mjs
git commit -m "feat: auto-persist well-done for met findings, zero-finding tasks show Complete"
```

---

### Task 10: Update summary.mjs for well-done count

**Files:**
- Modify: `skills/audit/scripts/public/js/views/summary.mjs`

- [ ] **Step 1: Update summary view to show well-done count**

In `summary.mjs`, find where `aggregateFindings` is destructured and add `wellDone`:

```javascript
  const { totalFindings, bySeverity, needFix: needFixCount, wontFix: wontFixCount, notAnIssue: notAnIssueCount, wellDone: wellDoneCount, pendingCount: pending, reviewed: reviewedCount } = aggregateFindings(tasks, notes);
```

Add a well-done stat card if the summary view has a similar stats grid. Check the file for the exact layout and add appropriately.

- [ ] **Step 2: Commit**

```bash
git add skills/audit/scripts/public/js/views/summary.mjs
git commit -m "feat: show well-done count in summary view"
```

---

### Task 11: Final verification

- [ ] **Step 1: Test summary endpoint**

```bash
curl -s http://localhost:3456/api/sessions/2026-05-28T08-31-11.432Z/tasks/summary | python3 -c "import sys,json; data=json.load(sys.stdin); print(f'{len(data)} tasks'); [print(f'  {t[\"type\"]} {t[\"status\"]}') for t in data]"
```

Expected: lightweight response with type/status only

- [ ] **Step 2: Test review page in browser**

Open review page. Verify met findings auto-persist well-done. Verify zero-finding tasks show Complete. Verify progress bars include well-done segments.

- [ ] **Step 3: Final commit if any fixes needed**
