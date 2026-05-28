# Positive Severity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `positive` severity to code/project reviews so all tasks have at least one finding, eliminating zero-finding edge cases.

**Architecture:** Add `positive` severity to data model and prompts, extend frontend rendering to handle positive findings like met findings (green cards, auto well-done, no action buttons), and update PDF export similarly.

**Tech Stack:** Vanilla JS (ES modules), inline HTML/CSS for PDF template, Markdown prompts for LLM sub-agents.

---

## File Structure

| File | Responsibility | Change Type |
|------|---------------|-------------|
| `skills/audit/prompts/code-review.md` | LLM prompt — add positive severity, require min 1 finding | Modify severity defs + field rules |
| `skills/audit/prompts/project-review.md` | LLM prompt — add positive severity, require min 1 finding | Modify severity defs + field rules |
| `skills/audit/scripts/public/js/constants.mjs` | Shared config — add positive label/color | Add 2 entries |
| `skills/audit/scripts/public/js/components/task-detail.mjs` | Task detail — all-positive card, positive finding rendering, getSeverityIcon | Modify rendering + add icon |
| `skills/audit/scripts/public/js/views/review.mjs` | Review view — autoPersistWellDone, severity bars, getSeverityIcon | Modify 3 functions |
| `skills/audit/scripts/public/print.html` | PDF — CSS, all-positive cards, severity bar filter | Modify CSS + JS |

---

### Task 1: Update code-review prompt

**Files:**
- Modify: `skills/audit/prompts/code-review.md`

- [ ] **Step 1: Add `positive` to Severity Definitions**

Find the Severity Definitions section:

```markdown
### Severity Definitions

- **Critical:** Security vulnerability, data loss risk, production-breaking bug
- **Major:** Logic error, significant performance issue, missing error handling
- **Minor:** Code style, naming, minor optimization
- **Info:** Suggestions, alternative approaches
```

Replace with:

```markdown
### Severity Definitions

- **Critical:** Security vulnerability, data loss risk, production-breaking bug
- **Major:** Logic error, significant performance issue, missing error handling
- **Minor:** Code style, naming, minor optimization
- **Info:** Suggestions, alternative approaches
- **Positive:** Good practices, well-designed patterns, clean code — use for high-quality code (score 7+)
```

- [ ] **Step 2: Update Field Rules**

Find the Field Rules section:

```markdown
### Field Rules

- `description` is required for each finding
- `file`, `line`, `code`, `suggestion` are optional — include when helpful
- Provide `suggestion` for critical and major findings
- `findings` and `positives` arrays may be empty — omit or send `[]`
```

Replace with:

```markdown
### Field Rules

- `description` is required for each finding
- `file`, `line`, `code`, `suggestion` are optional — include when helpful
- Provide `suggestion` for critical and major findings
- `findings` array must contain at least one entry — include a `positive` severity finding for high-quality code (score 7+)
- `positives` array may be empty — findings with `positive` severity serve this purpose
```

- [ ] **Step 3: Commit**

```bash
git add skills/audit/prompts/code-review.md
git commit -m "feat: add positive severity to code review prompt"
```

---

### Task 2: Update project-review prompt

**Files:**
- Modify: `skills/audit/prompts/project-review.md`

- [ ] **Step 1: Add `positive` to severity finding guidelines**

Find the Finding guidelines section:

```markdown
**Finding guidelines**:
- Every finding MUST include `file`, `line`, and `code` fields
- Every finding MUST include a `category` field
- Be specific — cite exact line numbers and code snippets
- Do NOT report stylistic preferences — only report genuine security, bug, logic, or performance issues
- `critical` is reserved for exploitable security vulnerabilities or data loss scenarios
```

Replace with:

```markdown
**Finding guidelines**:
- Every finding MUST include `file`, `line`, and `code` fields
- Every finding MUST include a `category` field
- Be specific — cite exact line numbers and code snippets
- Do NOT report stylistic preferences — only report genuine security, bug, logic, or performance issues
- `critical` is reserved for exploitable security vulnerabilities or data loss scenarios
- `findings` array must contain at least one entry — include a `positive` severity finding for clean code (score 9-10)
```

- [ ] **Step 2: Add `positive` to the curl example severity list**

Find in the curl example:

```json
          "severity": "critical|major|minor|info",
```

Replace with:

```json
          "severity": "critical|major|minor|info|positive",
```

- [ ] **Step 3: Commit**

```bash
git add skills/audit/prompts/project-review.md
git commit -m "feat: add positive severity to project review prompt"
```

---

### Task 3: Add `positive` to constants

**Files:**
- Modify: `skills/audit/scripts/public/js/constants.mjs`

- [ ] **Step 1: Add `positive` to SEVERITY_LABELS and SEVERITY_COLORS**

Find:

```js
export const SEVERITY_LABELS = {
  'partially-met': 'Partial',
  'not-met': 'Not Met',
  'met': 'Met',
};
```

Replace with:

```js
export const SEVERITY_LABELS = {
  'partially-met': 'Partial',
  'not-met': 'Not Met',
  'met': 'Met',
  'positive': 'Positive',
};
```

Find:

```js
  met: "var(--accent)",
};
```

Replace with:

```js
  met: "var(--accent)",
  positive: "var(--accent)",
};
```

- [ ] **Step 2: Commit**

```bash
git add skills/audit/scripts/public/js/constants.mjs
git commit -m "feat: add positive severity label and color"
```

---

### Task 4: Update task-detail.mjs for positive findings

**Files:**
- Modify: `skills/audit/scripts/public/js/components/task-detail.mjs`

This task has three changes: add positive icon, add all-positive detection (parallel to all-met), and handle individual positive findings in the normal path.

- [ ] **Step 1: Add `positive` to getSeverityIcon**

Find the `getSeverityIcon` function (line 5-16):

```js
function getSeverityIcon(severity) {
  const icons = {
    critical: '<svg ...shield SVG...</svg>',
    ...
    low: '<svg ...circle SVG...</svg>',
  };
  return icons[severity] || '';
}
```

Add a `positive` entry after the `low` entry, before the closing `};`:

```js
    positive: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
```

- [ ] **Step 2: Add all-positive detection alongside all-met**

Find the IIFE at line 79:

```js
      ${findings.length > 0 ? (() => {
        const allMet = findings.every(f => f.severity === "met");
        if (allMet) {
```

Replace with:

```js
      ${findings.length > 0 ? (() => {
        const allMet = findings.every(f => f.severity === "met");
        const allPositive = findings.every(f => f.severity === "positive");
        if (allMet) {
```

Then find the closing of the all-met block (the line `// Normal findings rendering`):

```js
        }
        // Normal findings rendering (unchanged from original)
        return `
```

Insert an all-positive block between the all-met closing and the normal rendering:

```js
        }
        if (allPositive) {
          return `
          <div>
            <div class="text-xs text-muted font-semibold mb-3">FINDINGS (${findings.length})</div>
            <div class="card" style="text-align:center;padding:var(--space-6);color:var(--accent)">
              ${icon("check", 24)}
              <div class="text-sm mt-2">Clean code — no issues found</div>
            </div>
            <div class="space-y-2 mt-3">
              ${findings.map((f, i) => {
                const status = noteTask?.findings?.[i]?.status || "well-done";
                const isReviewed = status !== null && status !== undefined;
                return `
                <div class="finding-card severity-positive${isReviewed ? " reviewed" : ""}" data-finding="${i}">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <span class="badge severity-positive">${getSeverityIcon("positive")} positive</span>
                      <span class="badge" style="background:var(--accent);color:var(--btn-primary-text)">${icon("check", 10)} Well Done</span>
                    </div>
                    ${isReviewed ? `<button class="btn-revert" data-revert="${i}" title="Revert to pending">${icon("undo2", 12)} Revert</button>` : ""}
                  </div>
                  <div class="text-sm" style="margin-top:var(--space-2)">${escapeHtml(f.description || "")}</div>
                </div>`;
              }).join("")}
            </div>
          </div>`;
        }
        // Normal findings rendering
        return `
```

- [ ] **Step 3: Handle individual positive findings in normal path**

In the normal findings rendering path (the `findings.map` block starting around line 115), find the status fallback line:

```js
              const status = noteTask?.findings?.[i]?.status || (f.severity === "met" ? "well-done" : null);
```

Replace with:

```js
              const status = noteTask?.findings?.[i]?.status || (f.severity === "met" || f.severity === "positive" ? "well-done" : null);
```

- [ ] **Step 4: Commit**

```bash
git add skills/audit/scripts/public/js/components/task-detail.mjs
git commit -m "feat: handle positive severity findings in task detail"
```

---

### Task 5: Update review.mjs for positive severity

**Files:**
- Modify: `skills/audit/scripts/public/js/views/review.mjs`

Three changes: extend autoPersistWellDone, add positive to getSeverityIcon, and update severity bar filter.

- [ ] **Step 1: Extend autoPersistWellDone for positive severity**

Find (around line 111):

```js
        if (findings[i].severity === "met" && !noteFindings[i]?.status) {
```

Replace with:

```js
        if ((findings[i].severity === "met" || findings[i].severity === "positive") && !noteFindings[i]?.status) {
```

- [ ] **Step 2: Add positive to getSeverityIcon in review.mjs**

Find the `getSeverityIcon` function (around line 171-182):

```js
  function getSeverityIcon(sev) {
    const m = {
      critical: '<svg ...shield...</svg>',
      ...
      low: '<svg ...circle...</svg>',
    };
    return m[sev] || '';
  }
```

Add a `positive` entry after `low`, before the closing `};`:

```js
      positive: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
```

- [ ] **Step 3: Update severity bar filter to also exclude `positive`**

Find (around line 270-271):

```js
          const problemSeverities = Object.fromEntries(
            Object.entries(bySeverity).filter(([sev]) => sev !== "met")
          );
          const metCount = bySeverity.met || 0;
```

Replace with:

```js
          const problemSeverities = Object.fromEntries(
            Object.entries(bySeverity).filter(([sev]) => sev !== "met" && sev !== "positive")
          );
          const metCount = bySeverity.met || 0;
          const positiveCount = bySeverity.positive || 0;
```

Then find the metCount display block:

```js
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
```

Replace with:

```js
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
            ${positiveCount > 0 ? `
              <div class="severity-bar-row" style="margin-top:${metCount > 0 ? "4px" : "8px"}">
                <span class="badge severity-positive severity-bar-label">Positive</span>
                <div class="severity-bar-track">
                  <div class="severity-bar-fill" style="width:${totalFindings > 0 ? (positiveCount / maxSevCount) * 100 : 0}%;background:${SEVERITY_COLORS.positive || "var(--accent)"}"></div>
                </div>
                <span class="severity-bar-count">${positiveCount}</span>
                <span class="severity-bar-pct">${totalFindings > 0 ? Math.round(positiveCount / totalFindings * 100) : 0}%</span>
              </div>
            ` : ""}
          </div>`;
```

- [ ] **Step 4: Commit**

```bash
git add skills/audit/scripts/public/js/views/review.mjs
git commit -m "feat: handle positive severity in review view"
```

---

### Task 6: Update print.html for positive severity

**Files:**
- Modify: `skills/audit/scripts/public/print.html`

Four changes: add CSS, update task card rendering for all-positive, update severity bars to filter positive, update SEVERITY_ORDER.

- [ ] **Step 1: Add positive CSS**

After the existing met CSS rules (line 77):

```css
  .badge-well-done { color: #16a34a; }
```

Add:

```css
  .finding.positive { border-left-color: #16a34a; }
  .sev-label.sev-positive { border-left-color: #16a34a; color: #166534; }
  .sev-fill.sev-positive { background: #16a34a; }
```

- [ ] **Step 2: Update task card rendering for all-positive tasks**

Find the task card section. Currently it handles `rawFindings.length === 0` and `allMet`. Add `allPositive` detection.

Find:

```js
    const allMet = rawFindings.length > 0 && rawFindings.every(f => f.severity === "met");
    const findings = allMet ? rawFindings : rawFindings
```

Replace with:

```js
    const allMet = rawFindings.length > 0 && rawFindings.every(f => f.severity === "met");
    const allPositive = rawFindings.length > 0 && rawFindings.every(f => f.severity === "positive");
    const findings = (allMet || allPositive) ? rawFindings : rawFindings
```

Then find the all-met card section (starts with `` : allMet ? ` ``) and after its closing backtick, add the all-positive case before the normal findings else:

Find:

```js
      ` : allMet ? `
        <div style="color:#16a34a;padding:8px 0">&#10003; All acceptance criteria met (${rawFindings.length}/${rawFindings.length})</div>
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
```

Replace with:

```js
      ` : allMet ? `
        <div style="color:#16a34a;padding:8px 0">&#10003; All acceptance criteria met (${rawFindings.length}/${rawFindings.length})</div>
        <div style="margin-top:6px">
          ${rawFindings.map((f, origIdx) => {
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
      ` : allPositive ? `
        <div style="color:#16a34a;padding:8px 0">&#10003; Clean code — no issues found</div>
        <div style="margin-top:6px">
          ${rawFindings.map((f, origIdx) => {
            return `<div class="finding positive" style="padding:4px 10px;margin-bottom:4px">
              <div class="finding-top">
                <span class="badge" style="border-left:3px solid #16a34a;background:none;color:#16a34a;font-weight:600">positive</span>
                <span class="badge badge-status badge-well-done">Well Done</span>
              </div>
              <div class="finding-desc">${esc(f.description || "")}</div>
            </div>`;
          }).join("")}
        </div>
      ` : `
```

- [ ] **Step 3: Update severity bars in PDF to filter positive**

Find the PDF severity bars section (around line 253):

```js
  ${Object.keys(bySeverity).length > 0 ? `
  <div class="severity-section">
    <h2>Findings by Severity</h2>
    ${Object.entries(bySeverity).map(([sev, count]) => `
      <div class="sev-row">
        <span class="sev-label sev-${sev}">${sev}</span>
        <div class="sev-track"><div class="sev-fill sev-${sev}" style="width:${(count / maxSevCount) * 100}%"></div></div>
        <span class="sev-count">${count}</span>
      </div>
    `).join("")}
  </div>` : ""}
```

Replace with:

```js
  ${(() => {
    const problemSevs = Object.fromEntries(Object.entries(bySeverity).filter(([s]) => s !== "met" && s !== "positive"));
    const metCount = bySeverity.met || 0;
    const posCount = bySeverity.positive || 0;
    if (Object.keys(problemSevs).length === 0 && metCount === 0 && posCount === 0) return "";
    return `<div class="severity-section">
      <h2>Findings by Severity</h2>
      ${Object.entries(problemSevs).map(([sev, count]) => `
        <div class="sev-row">
          <span class="sev-label sev-${sev}">${sev}</span>
          <div class="sev-track"><div class="sev-fill sev-${sev}" style="width:${(count / maxSevCount) * 100}%"></div></div>
          <span class="sev-count">${count}</span>
        </div>
      `).join("")}
      ${metCount > 0 ? `
        <div class="sev-row" style="margin-top:8px">
          <span class="sev-label sev-met">Met</span>
          <div class="sev-track"><div class="sev-fill sev-met" style="width:${(metCount / maxSevCount) * 100}%"></div></div>
          <span class="sev-count">${metCount}</span>
        </div>
      ` : ""}
      ${posCount > 0 ? `
        <div class="sev-row" style="margin-top:4px">
          <span class="sev-label sev-positive">Positive</span>
          <div class="sev-track"><div class="sev-fill sev-positive" style="width:${(posCount / maxSevCount) * 100}%"></div></div>
          <span class="sev-count">${posCount}</span>
        </div>
      ` : ""}
    </div>`;
  })()}
```

- [ ] **Step 4: Commit**

```bash
git add skills/audit/scripts/public/print.html
git commit -m "feat: handle positive severity in PDF export"
```
