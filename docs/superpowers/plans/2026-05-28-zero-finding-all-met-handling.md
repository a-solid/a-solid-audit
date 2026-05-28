# Zero-Finding & All-Met Task Handling — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix inconsistencies in how zero-finding tasks and all-met story tasks are handled across frontend rendering, PDF export, and data layer.

**Architecture:** Targeted fixes to 5 files. Each task is self-contained and can be tested independently. The data layer change (`constants.mjs`) is a prerequisite for the frontend changes, and the PDF changes are independent of the frontend changes.

**Tech Stack:** Vanilla JS (ES modules), inline HTML/CSS for PDF template, no build tools.

---

## File Structure

| File | Responsibility | Change Type |
|------|---------------|-------------|
| `skills/audit/scripts/public/js/constants.mjs` | Shared severity config — add `met` color | Modify 1 line |
| `skills/audit/scripts/public/js/components/task-detail.mjs` | Task detail panel — all-met positive summary | Modify rendering logic |
| `skills/audit/scripts/public/js/views/review.mjs` | Overview severity bars — filter `met` | Modify rendering logic |
| `skills/audit/scripts/public/js/views/summary.mjs` | Task table review status — fix all-met detection | Modify review status logic |
| `skills/audit/scripts/public/print.html` | PDF template — stats, badges, met styling, card redesign | Modify stats + rendering + CSS |

---

### Task 1: Add `met` to `SEVERITY_COLORS`

**Files:**
- Modify: `skills/audit/scripts/public/js/constants.mjs:9-13`

This is a one-line data change that all other tasks depend on.

- [ ] **Step 1: Add `met` color to `SEVERITY_COLORS`**

In `skills/audit/scripts/public/js/constants.mjs`, add `met` to the `SEVERITY_COLORS` object at line 13 (after the `info` entry):

```js
export const SEVERITY_COLORS = {
  critical: "var(--danger)", major: "var(--danger)", high: "var(--danger)",
  medium: "var(--warning)", minor: "var(--warning)",
  low: "var(--info)", info: "var(--info)",
  met: "var(--accent)",
};
```

- [ ] **Step 2: Commit**

```bash
git add skills/audit/scripts/public/js/constants.mjs
git commit -m "fix: add met severity color to SEVERITY_COLORS"
```

---

### Task 2: All-met positive summary card in task detail

**Files:**
- Modify: `skills/audit/scripts/public/js/components/task-detail.mjs:79-170`

When ALL findings in a task have `severity === "met"`, show a compact positive card instead of individual finding cards with action buttons.

- [ ] **Step 1: Add all-met detection and rendering**

In `skills/audit/scripts/public/js/components/task-detail.mjs`, the findings section starts at line 79 with:

```js
${findings.length > 0 ? `
```

Replace the entire findings block (lines 79–170) with logic that detects all-met and renders differently:

```js
      ${findings.length > 0 ? (() => {
        const allMet = findings.every(f => f.severity === "met");
        if (allMet) {
          return `
          <div>
            <div class="text-xs text-muted font-semibold mb-3">ACCEPTANCE CRITERIA (${findings.length}/${findings.length} met)</div>
            <div class="card" style="text-align:center;padding:var(--space-6);color:var(--accent)">
              ${icon("check", 24)}
              <div class="text-sm mt-2">All acceptance criteria met</div>
            </div>
            <div class="space-y-2 mt-3">
              ${findings.map((f, i) => {
                const status = noteTask?.findings?.[i]?.status || "well-done";
                const reason = noteTask?.findings?.[i]?.reason || "";
                const isReviewed = status !== null && status !== undefined;
                return `
                <div class="finding-card severity-met${isReviewed ? " reviewed" : ""}" data-finding="${i}">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <span class="badge severity-met">${icon("check", 10)} met</span>
                      <span class="badge" style="background:var(--accent);color:var(--btn-primary-text)">${icon("check", 10)} Well Done</span>
                    </div>
                    ${isReviewed ? `<button class="btn-revert" data-revert="${i}" title="Revert to pending">${icon("undo2", 12)} Revert</button>` : ""}
                  </div>
                  <div class="text-sm" style="margin-top:var(--space-2)">${escapeHtml(f.description || "")}</div>
                  ${f.criteria ? `<div class="text-xs text-muted mt-1">AC: ${escapeHtml(f.criteria)}</div>` : ""}
                </div>`;
              }).join("")}
            </div>
          </div>`;
        }
        // Normal findings rendering (unchanged from original)
        return `
        <div>
          <div class="text-xs text-muted font-semibold mb-3">FINDINGS (${findings.length})</div>
          <div class="space-y-3">
            ${findings.map((f, i) => {
              const status = noteTask?.findings?.[i]?.status || (f.severity === "met" ? "well-done" : null);
              const isNeedFix = status === "need-fix";
              const isWontFix = status === "wont-fix";
              const isNotAnIssue = status === "not-an-issue";
              const isWellDone = status === "well-done";
              const isReviewed = isNeedFix || isWontFix || isNotAnIssue || isWellDone;
              const isUnreviewed = !status;
              const reason = noteTask?.findings?.[i]?.reason || "";

              const statusBadge = isNeedFix ? `<span class="badge badge-need-fix">${icon("alertCircle", 10)} Need Fix</span>`
                : isWontFix ? `<span class="badge badge-wont-fix"${reason ? ` title="${escapeHtml(reason)}"` : ""}>${icon("minus", 10)} Won't Fix${reason ? ": " + escapeHtml(reason.length > 25 ? reason.slice(0, 25) + "..." : reason) : ""}</span>`
                : isNotAnIssue ? `<span class="badge badge-not-an-issue"${reason ? ` title="${escapeHtml(reason)}"` : ""}>${icon("x", 10)} Not an Issue${reason ? ": " + escapeHtml(reason.length > 25 ? reason.slice(0, 25) + "..." : reason) : ""}</span>`
                : isWellDone ? `<span class="badge" style="background:var(--accent);color:var(--btn-primary-text)">${icon("check", 10)} Well Done</span>`
                : `<span class="badge" style="background:transparent;color:var(--text-muted);border:1px dashed var(--border)">Pending</span>`;

              return `
              <div class="finding-card severity-${f.severity}${isReviewed ? " reviewed" : ""}" data-finding="${i}">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <span class="badge severity-${f.severity}">${getSeverityIcon(f.severity)} ${f.severity}</span>
                    ${statusBadge}
                  </div>
                  ${isReviewed ? `<button class="btn-revert" data-revert="${i}" title="Revert to pending">${icon("undo2", 12)} Revert</button>` : ""}
                </div>
                <div class="text-sm" style="margin-top:var(--space-2)">${escapeHtml(f.description || "")}</div>
                <div class="dismiss-panel hidden" data-dismiss-panel="${i}">
                  <div class="dismiss-reasons">
                    ${["Intentional design", "Acceptable risk", "Low priority", "Already addressed"].map(r =>
                      `<button class="dismiss-reason-btn" data-reason="${r}">${escapeHtml(r)}</button>`
                    ).join("")}
                  </div>
                  <div class="flex gap-2 mt-2">
                    <input class="dismiss-custom-input" placeholder="Other reason..." data-dismiss-custom="${i}">
                    <button class="btn btn-sm btn-primary dismiss-submit-btn" data-dismiss-submit="${i}">Submit</button>
                  </div>
                </div>
                <div class="dismiss-panel hidden" data-not-issue-panel="${i}">
                  <div class="dismiss-reasons">
                    ${["AI misunderstood context", "Not applicable", "Already handled elsewhere", "Feature, not a bug"].map(r =>
                      `<button class="not-issue-reason-btn" data-reason="${r}">${escapeHtml(r)}</button>`
                    ).join("")}
                  </div>
                  <div class="flex gap-2 mt-2">
                    <input class="dismiss-custom-input" placeholder="Other reason..." data-not-issue-custom="${i}">
                    <button class="btn btn-sm btn-primary not-issue-submit-btn" data-not-issue-submit="${i}">Submit</button>
                  </div>
                </div>
                ${isUnreviewed ? `
                  <div class="finding-action-bar">
                    <button class="btn-need-fix" data-need-fix="${i}" title="Mark as needing a fix">${icon("alertCircle", 14)} Need Fix</button>
                    <button class="btn-wont-fix" data-wont-fix="${i}" title="Accept, won't fix">${icon("minus", 14)} Won't Fix</button>
                    <button class="btn-not-an-issue" data-not-issue="${i}" title="Not a real issue">${icon("x", 14)} Not an Issue</button>
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
            }).join("")}
          </div>
        </div>`;
      })() : `
        <div class="card" style="text-align:center;padding:var(--space-6);color:var(--accent)">
          ${icon("check", 20)}
          <div class="text-sm mt-2">Clean code — no issues found</div>
        </div>
      `}
```

- [ ] **Step 2: Verify in browser**

Start the dev server and navigate to a review session with a story task that has all-met findings. Confirm:
- The positive summary card shows "All acceptance criteria met"
- Individual met findings are listed as read-only cards (no action buttons)
- Revert button is present on each finding
- Zero-finding code tasks still show "Clean code — no issues found"

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/public/js/components/task-detail.mjs
git commit -m "feat: show positive summary card for all-met story tasks"
```

---

### Task 3: Filter `met` from overview severity bars

**Files:**
- Modify: `skills/audit/scripts/public/js/views/review.mjs:269-285`

In the overview tab, the "Findings by Severity" section currently renders `met` as a severity bar alongside critical/major/minor. Met is a positive outcome and should be excluded from problem severity bars.

- [ ] **Step 1: Replace severity bar section in `renderOverview`**

In `skills/audit/scripts/public/js/views/review.mjs`, find the severity bars section around line 269:

```js
        ${Object.keys(bySeverity).length > 0 ? `
          <div class="card mb-4">
            <div class="font-medium mb-4">Findings by Severity</div>
            ${Object.entries(bySeverity).map(([sev, count]) => {
```

Replace the entire severity section (from `${Object.keys(bySeverity).length > 0 ?` through its closing `` : ""}`) with:

```js
        ${(() => {
          const problemSeverities = Object.fromEntries(
            Object.entries(bySeverity).filter(([sev]) => sev !== "met")
          );
          const metCount = bySeverity.met || 0;
          if (Object.keys(problemSeverities).length === 0 && metCount === 0) return "";
          return `<div class="card mb-4">
            <div class="font-medium mb-4">Findings by Severity</div>
            ${Object.entries(problemSeverities).map(([sev, count]) => {
              const pct = totalFindings > 0 ? Math.round(count / totalFindings * 100) : 0;
              return `
              <div class="severity-bar-row">
                <span class="badge severity-${sev} severity-bar-label">${SEVERITY_LABELS[sev] || sev}</span>
                <div class="severity-bar-track">
                  <div class="severity-bar-fill" style="width:${(count / maxSevCount) * 100}%;background:${SEVERITY_COLORS[sev] || "var(--info)"}"></div>
                </div>
                <span class="severity-bar-count">${count}</span>
                <span class="severity-bar-pct">${pct}%</span>
              </div>`;
            }).join("")}
            ${metCount > 0 ? `
              <div class="severity-bar-row" style="margin-top:8px">
                <span class="badge severity-met severity-bar-label">Met</span>
                <div class="severity-bar-track">
                  <div class="severity-bar-fill" style="width:${totalFindings > 0 ? (metCount / maxSevCount) * 100 : 0}%;background:${SEVERITY_COLORS.met}"></div>
                </div>
                <span class="severity-bar-count">${metCount}</span>
                <span class="severity-bar-pct">${totalFindings > 0 ? Math.round(metCount / totalFindings * 100) : 0}%</span>
              </div>
            ` : ""}
          </div>`;
        })()}
```

- [ ] **Step 2: Verify in browser**

Navigate to the overview tab of a review session. Confirm:
- `met` findings no longer appear in the problem severity bars
- If there are met findings, they appear as a separate "Met" row below the problem severities, styled in green (accent color)
- If there are only met findings (no problems), the card still renders with just the Met row
- If there are no findings at all, the card is hidden

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/public/js/views/review.mjs
git commit -m "fix: separate met findings from problem severity bars in overview"
```

---

### Task 4: Fix summary table review status for all-met tasks

**Files:**
- Modify: `skills/audit/scripts/public/js/views/summary.mjs:260-273`

The `renderTaskTable` function sets `reviewStatus = "none"` when `totalFindings === 0`, and the review logic doesn't account for `well-done` status. All-met story tasks show "—" even when all findings are reviewed.

- [ ] **Step 1: Fix review status detection**

In `skills/audit/scripts/public/js/views/summary.mjs`, inside the `renderTaskTable` function, find the `reviewedCount` and `reviewStatus` logic (lines ~260-273):

```js
            const reviewedCount = (noteTask?.findings || []).filter(f => f && ["need-fix", "wont-fix", "not-an-issue", "well-done"].includes(f.status)).length;
            let reviewStatus = "none";
            if (totalFindings === 0) {
              reviewStatus = "none";
            } else if (reviewedCount === 0) {
              reviewStatus = "unreviewed";
            } else if (reviewedCount >= totalFindings) {
              reviewStatus = "reviewed";
            } else {
              reviewStatus = "partial";
            }
            }
```

Replace with:

```js
            const reviewedCount = (noteTask?.findings || []).filter(f => f && ["need-fix", "wont-fix", "not-an-issue", "well-done"].includes(f.status)).length;
            let reviewStatus;
            if (totalFindings === 0) {
              reviewStatus = "none";
            } else if (reviewedCount >= totalFindings) {
              reviewStatus = "reviewed";
            } else if (reviewedCount === 0) {
              reviewStatus = "unreviewed";
            } else {
              reviewStatus = "partial";
            }
```

Note: the old code had an extra stray `}` on line 273 — this is removed in the replacement. The `reviewedCount` already counts `well-done` statuses, so all-met tasks where `autoPersistWellDone` has run will have `reviewedCount === totalFindings` and get `"reviewed"` status.

- [ ] **Step 2: Verify in browser**

Navigate to the summary page of a review session with all-met story tasks. Confirm:
- All-met story tasks show "Reviewed" badge in the Human Review column
- Zero-finding code tasks still show "—"
- Partially reviewed tasks still show "Partial"
- Unreviewed tasks still show "Pending"

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/public/js/views/summary.mjs
git commit -m "fix: show Reviewed status for all-met tasks in summary table"
```

---

### Task 5: PDF export — stats, badges, met styling, card redesign

**Files:**
- Modify: `skills/audit/scripts/public/print.html`

This is the largest task. The PDF template is a self-contained HTML file with inline CSS and JS. It needs: Well Done stats counting, well-done status badge, met severity styling, and better zero/all-met task cards.

- [ ] **Step 1: Add `met` severity CSS**

In `print.html`, after the `.sev-fill.sev-low, .sev-fill.sev-info` rule (line 73), add:

```css
  .finding.met { border-left-color: #16a34a; }
  .sev-label.sev-met { border-left-color: #16a34a; color: #166534; }
  .sev-fill.sev-met { background: #16a34a; }
  .badge-well-done { color: #16a34a; }
```

- [ ] **Step 2: Add `wellDoneCount` to stats computation**

In `print.html`, find the stats computation block (lines ~191-204):

```js
  const noteTasks = notes?.tasks || [];
  let needFixCount = 0, wontFixCount = 0, notAnIssueCount = 0;
  tasks.forEach(t => {
    const noteTask = noteTasks.find(nt => nt.file === t.file);
    const taskFindings = t.review?.findings || [];
    const noteFindings = noteTask?.findings || [];
    taskFindings.forEach((f, i) => {
      const status = noteFindings[i]?.status;
      if (status === "need-fix") needFixCount++;
      else if (status === "wont-fix") wontFixCount++;
      else if (status === "not-an-issue") notAnIssueCount++;
    });
  });
  const reviewedCount = needFixCount + wontFixCount + notAnIssueCount;
  const pendingCount = totalFindings - reviewedCount;
```

Replace with:

```js
  const noteTasks = notes?.tasks || [];
  let needFixCount = 0, wontFixCount = 0, notAnIssueCount = 0, wellDoneCount = 0;
  tasks.forEach(t => {
    const noteTask = noteTasks.find(nt => nt.file === t.file);
    const taskFindings = t.review?.findings || [];
    const noteFindings = noteTask?.findings || [];
    taskFindings.forEach((f, i) => {
      const status = noteFindings[i]?.status;
      if (status === "need-fix") needFixCount++;
      else if (status === "wont-fix") wontFixCount++;
      else if (status === "not-an-issue") notAnIssueCount++;
      else if (status === "well-done") wellDoneCount++;
    });
  });
  const reviewedCount = needFixCount + wontFixCount + notAnIssueCount + wellDoneCount;
  const pendingCount = totalFindings - reviewedCount;
```

- [ ] **Step 3: Replace stats row HTML**

In `print.html`, find the stats row (lines ~240-246):

```html
  <div class="stats-row">
    <div class="stat-box"><div class="stat-value">${totalFindings}</div><div class="stat-label">Total</div></div>
    <div class="stat-box"><div class="stat-value" style="color:#b91c1c">${needFixCount}</div><div class="stat-label">Need Fix</div></div>
    <div class="stat-box"><div class="stat-value" style="color:#92400e">${wontFixCount}</div><div class="stat-label">Won't Fix</div></div>
    <div class="stat-box"><div class="stat-value" style="color:#1d4ed8">${notAnIssueCount}</div><div class="stat-label">Not an Issue</div></div>
    <div class="stat-box"><div class="stat-value">${pendingCount}</div><div class="stat-label">Pending</div></div>
  </div>
```

Replace with:

```html
  <div class="stats-row">
    <div class="stat-box"><div class="stat-value">${totalFindings}</div><div class="stat-label">Total</div></div>
    <div class="stat-box"><div class="stat-value" style="color:#b91c1c">${needFixCount}</div><div class="stat-label">Need Fix</div></div>
    <div class="stat-box"><div class="stat-value" style="color:#92400e">${wontFixCount}</div><div class="stat-label">Won't Fix</div></div>
    <div class="stat-box"><div class="stat-value" style="color:#1d4ed8">${notAnIssueCount}</div><div class="stat-label">Not an Issue</div></div>
    <div class="stat-box"><div class="stat-value" style="color:#16a34a">${wellDoneCount}</div><div class="stat-label">Well Done</div></div>
  </div>
```

- [ ] **Step 4: Add `well-done` to status badge logic**

In `print.html`, find the status badge logic inside the findings rendering (lines ~282-285):

```js
              const statusBadge = status === "need-fix" ? '<span class="badge badge-status badge-need-fix">Need Fix</span>'
                : status === "wont-fix" ? `<span class="badge badge-status badge-wont-fix">Won't Fix${reason ? ": " + esc(reason.length > 40 ? reason.slice(0, 40) + "..." : reason) : ""}</span>`
                : status === "not-an-issue" ? `<span class="badge badge-status badge-not-an-issue">Not an Issue${reason ? ": " + esc(reason.length > 40 ? reason.slice(0, 40) + "..." : reason) : ""}</span>`
                : '<span class="badge badge-status badge-unreviewed">Pending</span>';
```

Replace with:

```js
              const statusBadge = status === "need-fix" ? '<span class="badge badge-status badge-need-fix">Need Fix</span>'
                : status === "wont-fix" ? `<span class="badge badge-status badge-wont-fix">Won't Fix${reason ? ": " + esc(reason.length > 40 ? reason.slice(0, 40) + "..." : reason) : ""}</span>`
                : status === "not-an-issue" ? `<span class="badge badge-status badge-not-an-issue">Not an Issue${reason ? ": " + esc(reason.length > 40 ? reason.slice(0, 40) + "..." : reason) : ""}</span>`
                : status === "well-done" ? '<span class="badge badge-status badge-well-done">Well Done</span>'
                : '<span class="badge badge-status badge-unreviewed">Pending</span>';
```

- [ ] **Step 5: Add zero-finding and all-met task card handling**

In `print.html`, find the task card rendering (lines ~262-299). The current code renders findings for every task. Replace the task rendering map function to handle zero-finding and all-met cases.

Find the task card section starting with:

```js
  ${tasks.map(t => {
    const score = t.review?.score;
    const rawFindings = t.review?.findings || [];
    const findings = rawFindings
      .map((f, origIdx) => ({ ...f, _origIdx: origIdx }))
      .sort((a, b) => (SEVERITY_ORDER.indexOf(a.severity) ?? 99) - (SEVERITY_ORDER.indexOf(b.severity) ?? 99));
    const noteTask = noteTasks.find(nt => nt.file === t.file);

    return `
    <div class="task-card">
```

Replace the entire task card section (from `${tasks.map(t => {` through the closing `}).join("")}`) with:

```js
  ${tasks.map(t => {
    const score = t.review?.score;
    const rawFindings = t.review?.findings || [];
    const allMet = rawFindings.length > 0 && rawFindings.every(f => f.severity === "met");
    const findings = allMet ? rawFindings : rawFindings
      .map((f, origIdx) => ({ ...f, _origIdx: origIdx }))
      .sort((a, b) => (SEVERITY_ORDER.indexOf(a.severity) ?? 99) - (SEVERITY_ORDER.indexOf(b.severity) ?? 99));
    const noteTask = noteTasks.find(nt => nt.file === t.file);

    return `
    <div class="task-card">
      <div class="task-header">
        <span class="task-name">${esc(t.name || t.file)}</span>
        <span class="task-score">${score ?? "-"}/10</span>
      </div>
      ${rawFindings.length === 0 ? `
        <div style="color:#16a34a;text-align:center;padding:12px">✓ Clean code — no issues found</div>
      ` : allMet ? `
        <div style="color:#16a34a;padding:8px 0">✓ All acceptance criteria met (${rawFindings.length}/${rawFindings.length})</div>
        <div style="margin-top:6px">
          ${rawFindings.map((f, origIdx) => {
            const reason = noteTask?.findings?.[origIdx]?.reason || "";
            return `<div class="finding met" style="padding:4px 10px;margin-bottom:4px">
              <div class="finding-top">
                <span class="badge" style="border-left:3px solid #16a34a;background:none;color:#16a34a;font-weight:600">met</span>
                <span class="badge badge-status badge-well-done">Well Done</span>
              </div>
              <div class="finding-desc">${esc(f.description || "")}</div>
              ${f.criteria ? `<div class="finding-file">AC: ${esc(f.criteria)}</div>` : ""}
            </div>`;
          }).join("")}
        </div>
      ` : `
        <div class="findings-header">Findings (${findings.length})</div>
        ${findings.map(f => {
          const origIdx = f._origIdx;
          const status = noteTask?.findings?.[origIdx]?.status || null;
          const reason = noteTask?.findings?.[origIdx]?.reason || "";
          const statusBadge = status === "need-fix" ? '<span class="badge badge-status badge-need-fix">Need Fix</span>'
            : status === "wont-fix" ? `<span class="badge badge-status badge-wont-fix">Won't Fix${reason ? ": " + esc(reason.length > 40 ? reason.slice(0, 40) + "..." : reason) : ""}</span>`
            : status === "not-an-issue" ? `<span class="badge badge-status badge-not-an-issue">Not an Issue${reason ? ": " + esc(reason.length > 40 ? reason.slice(0, 40) + "..." : reason) : ""}</span>`
            : status === "well-done" ? '<span class="badge badge-status badge-well-done">Well Done</span>'
            : '<span class="badge badge-status badge-unreviewed">Pending</span>';
          return `
          <div class="finding ${f.severity}">
            <div class="finding-top">
              <span class="badge">${f.severity}</span>
              ${statusBadge}
            </div>
            <div class="finding-desc">${esc(f.description || "")}</div>
            ${f.suggestion ? `<div class="finding-suggestion">Suggestion: ${esc(f.suggestion)}</div>` : ""}
            ${f.file ? `<div class="finding-file">${esc(f.file)}${f.line ? ":" + f.line : ""}</div>` : ""}
          </div>`;
        }).join("")}
      `}
    </div>`;
  }).join("")}
```

- [ ] **Step 6: Verify PDF export**

Open `print.html?session=<session-id>` in a browser. Confirm:
- Stats row shows: Total | Need Fix | Won't Fix | Not an Issue | Well Done
- Zero-finding tasks show "✓ Clean code — no issues found"
- All-met tasks show "✓ All acceptance criteria met (N/N)" with met findings listed
- Met findings have green left border
- Well Done status badge is green
- Normal findings render unchanged

- [ ] **Step 7: Commit**

```bash
git add skills/audit/scripts/public/print.html
git commit -m "fix: align PDF stats with frontend, add well-done badge and met severity styling"
```
