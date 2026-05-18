# Remove Confirm All Button — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the "Confirm All" button from the findings section and auto-fill unmarked findings when the user clicks any bottom status button.

**Architecture:** Delete dead UI and server code, then add auto-fill logic to `setTaskStatus()` so unmarked findings become `confirmed` when the user sets a task-level status.

**Tech Stack:** Alpine.js (HTML template), Node.js HTTP server

---

### Task 1: Remove "Confirm All" button HTML

**Files:**
- Modify: `skills/audit/scripts/report-template.html:570-576`

- [ ] **Step 1: Delete the Confirm All button HTML**

In `skills/audit/scripts/report-template.html`, delete lines 570-576 (the entire `<button>` element for Confirm All):

```html
<!-- DELETE this entire block (lines 570-576): -->
            <button @click="confirmAll(currentTask)"
                    :disabled="confirmingAll"
                    class="text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-all duration-150 disabled:opacity-50">
              <span x-show="!confirmingAll && !confirmedAllAt">Confirm All</span>
              <span x-show="confirmingAll">Confirming...</span>
              <span x-show="confirmedAllAt && !confirmingAll" x-transition>Confirmed ✓</span>
            </button>
```

The section header row (`<div class="flex items-center justify-between mb-3">`) will now only contain the title "Findings (N)" and the "All Default ✓" span.

- [ ] **Step 2: Commit**

```bash
git add skills/audit/scripts/report-template.html
git commit -m "Remove Confirm All button HTML from findings section"
```

---

### Task 2: Remove `confirmingAll` / `confirmedAllAt` state and `confirmAll()` method

**Files:**
- Modify: `skills/audit/scripts/report-template.html:866-867` (state)
- Modify: `skills/audit/scripts/report-template.html:1250-1267` (method)

- [ ] **Step 1: Delete state initialization**

In `skills/audit/scripts/report-template.html`, delete the two state properties around line 866-867:

```javascript
// DELETE these two lines:
    confirmingAll: false,
    confirmedAllAt: null,
```

- [ ] **Step 2: Delete `confirmAll()` method**

Delete the entire `confirmAll()` method (lines 1250-1267):

```javascript
// DELETE this entire block:
    async confirmAll(task) {
      this.confirmingAll = true;
      try {
        const note = this.getOrCreateNote(task);
        for (let i = 0; i < note.findings.length; i++) {
          if (!note.findings[i].status || note.findings[i].status === '') {
            note.findings[i] = { status: 'confirmed', reason: '' };
          }
        }
        await this.saveNote(task);
        this.confirmingAll = false;
        this.confirmedAllAt = Date.now();
        setTimeout(() => { this.confirmedAllAt = null; }, 500);
      } catch (e) {
        this.confirmingAll = false;
        this.error = e.message;
      }
    },
```

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/report-template.html
git commit -m "Remove confirmingAll/confirmedAllAt state and confirmAll method"
```

---

### Task 3: Modify `setTaskStatus()` to auto-fill unmarked findings

**Files:**
- Modify: `skills/audit/scripts/report-template.html:1269-1273`

- [ ] **Step 1: Update `setTaskStatus()` method**

Replace the existing `setTaskStatus()` method (currently lines 1269-1273):

```javascript
// BEFORE:
    async setTaskStatus(task, status) {
      const note = this.getOrCreateNote(task);
      note.status = status;
      await this.saveNote(task);
    },
```

With:

```javascript
// AFTER:
    async setTaskStatus(task, status) {
      const note = this.getOrCreateNote(task);
      note.status = status;
      for (let i = 0; i < note.findings.length; i++) {
        if (!note.findings[i].status || note.findings[i].status === '') {
          note.findings[i] = { status: 'confirmed', reason: '' };
        }
      }
      await this.saveNote(task);
    },
```

This reuses the same auto-fill logic that was in `confirmAll()`. When the user clicks Confirmed, Action Required, or Deferred, any findings with empty status get set to `confirmed`.

- [ ] **Step 2: Commit**

```bash
git add skills/audit/scripts/report-template.html
git commit -m "Auto-fill unmarked findings when setting task status"
```

---

### Task 4: Remove `handleBatchConfirm` from report server

**Files:**
- Modify: `skills/audit/scripts/report-server.mjs:161-190` (handler function)
- Modify: `skills/audit/scripts/report-server.mjs:223` (route registration)

- [ ] **Step 1: Delete `handleBatchConfirm()` function**

Delete the entire function (lines 161-190):

```javascript
// DELETE this entire block:
async function handleBatchConfirm(req, res, sessionDir) {
  const body = JSON.parse(await readBody(req));
  if (!body || typeof body.file !== 'string' || !body.file) {
    return jsonResponse(res, { error: "Missing required field: file" }, 400);
  }
  const index = readYaml(path.join(sessionDir, "index.yaml"));
  const allRefs = [...(index.codeTasks || []), ...(index.storyTasks || [])];
  const ref = allRefs.find(t => t.file === body.file);
  if (!ref || ref.status !== "reviewed") {
    jsonResponse(res, { error: "Task AI review not yet completed" }, 409);
    return;
  }

  const notes = readNotes(sessionDir);
  let entry = notes.tasks.find(t => t.file === body.file);
  if (!entry) {
    jsonResponse(res, { error: "No note entry found" }, 404);
    return;
  }

  let count = 0;
  entry.findings = (entry.findings || []).map(f => {
    const status = typeof f === "string" ? f : (f.status || "");
    if (!status) { count++; return { status: "confirmed", reason: "" }; }
    return typeof f === "string" ? { status: f, reason: "" } : f;
  });

  writeNotes(sessionDir, notes);
  jsonResponse(res, { ok: true, confirmed: count });
}
```

- [ ] **Step 2: Delete route registration**

Delete line 223:

```javascript
// DELETE this line:
    if (req.method === "POST" && url.pathname === "/api/notes/batch-confirm") return handleBatchConfirm(req, res, sessionDir);
```

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/report-server.mjs
git commit -m "Remove unused handleBatchConfirm endpoint from report server"
```

---

### Task 5: Verify no remaining references

**Files:**
- Search across entire repo

- [ ] **Step 1: Search for remaining references**

Run:
```bash
grep -rn "confirmAll\|confirmingAll\|confirmedAllAt\|batch-confirm\|handleBatchConfirm" --include="*.html" --include="*.mjs" --include="*.js" --include="*.md" .
```

Expected: no matches in `.html` or `.mjs` files. Design docs and plan files in `docs/` may still reference these terms — that's expected and fine.

- [ ] **Step 2: If any code references found, clean them up and commit**
