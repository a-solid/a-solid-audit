# UI/UX Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Systematically improve the A-Solid Audit UI by fixing design system inconsistencies, polishing wizard transitions, enhancing review page visual hierarchy, and improving home page navigation.

**Architecture:** CSS-only design token cleanup, then JS view modifications per layer. No backend changes. Each task is scoped to a single concern with minimal cross-file dependencies.

**Tech Stack:** Vanilla JS (ESM), CSS custom properties, no frameworks

---

## File Structure

| File | Responsibility |
|------|---------------|
| `skills/audit/scripts/public/styles.css` | All CSS: tokens, unified `.collapse`, step transitions, new component styles |
| `skills/audit/scripts/public/js/views/wizard.mjs` | Step transitions, scan progress, group badges, CodeGraph indicator, ready step |
| `skills/audit/scripts/public/js/views/review.mjs` | Finding icons, sidebar progress bars, overview stats, keyboard overlay |
| `skills/audit/scripts/public/js/views/home.mjs` | Type icons, relative time, empty state, reviewing pulse |
| `skills/audit/scripts/public/js/app.mjs` | Active session indicator, theme toggle tooltip, new icons |
| `skills/audit/scripts/public/js/views/summary.mjs` | Breadcrumb link fix |
| `skills/audit/scripts/public/js/views/task-detail.mjs` | Finding severity icons |

---

### Task 1: Design system token cleanup (CSS-only)

**Files:**
- Modify: `skills/audit/scripts/public/styles.css`

This task fixes all design system foundation issues: missing tokens, hardcoded values, duplicate tokens, z-index scale.

- [ ] **Step 1: Add new design tokens to `:root`**

Add after line 65 (`--space-12: 48px;`):

```css
  --space-7: 28px;
  --space-10: 40px;
```

Add after line 88 (`--duration-slow: 400ms;`):

```css
  /* Z-index scale */
  --z-base: 0;
  --z-sticky: 10;
  --z-overlay: 40;
  --z-toast: 50;
  --z-modal: 100;
  --z-skip: 999;

  /* Component colors */
  --toast-error-bg: #1A0808;
  --toast-success-bg: #081A0D;
  --toast-warning-bg: #1A1208;
  --btn-primary-text: #052e16;
  --sev-text-critical: #fca5a5;
  --sev-text-major: #fcd34d;
```

- [ ] **Step 2: Add light theme overrides for new tokens**

Inside `[data-theme="light"]` (after line 119 `--shadow-glow: ...`), add:

```css
  --toast-error-bg: #fef2f2;
  --toast-success-bg: #f0fdf4;
  --toast-warning-bg: #fffbeb;
  --btn-primary-text: #ffffff;
  --sev-text-critical: #b91c1c;
  --sev-text-major: #a16207;
  --info-dim: rgba(59, 130, 246, 0.1);
  --warning-dim: rgba(245, 158, 11, 0.1);
  --danger-dim: rgba(239, 68, 68, 0.1);
  --purple-dim: rgba(167, 139, 250, 0.1);
```

- [ ] **Step 3: Fix z-index values to use tokens**

- Line 181: `.skip-link` → change `z-index: 999` to `z-index: var(--z-skip)`
- Line 195: `.app-header` → change `z-index: 40` to `z-index: var(--z-sticky)`
- Line 419: `.toast-container` → change `z-index: 50` to `z-index: var(--z-toast)`
- Line 867: `.notes-fab` → change `z-index: 45` to `z-index: var(--z-overlay)`
- Line 878: `.notes-panel` → change `z-index: 45` to `z-index: var(--z-overlay)`

- [ ] **Step 4: Fix `.btn-sm` min-height**

Change line 321 from:
```css
  min-height: 44px;
```
to:
```css
  min-height: 32px;
```

- [ ] **Step 5: Replace hardcoded colors with tokens**

- Line 301: `.btn-primary` color → change `#052e16` to `var(--btn-primary-text)`
- Line 464: `.step-node.done .step-dot` color → change `#052e16` to `var(--btn-primary-text)`
- Line 870: `.notes-fab` color → change `#052e16` to `var(--btn-primary-text)`
- Line 432: `.toast-error` background → change `#1A0808` to `var(--toast-error-bg)`
- Line 433: `.toast-success` background → change `#081A0D` to `var(--toast-success-bg)`
- Line 434: `.toast-warning` background → change `#1A1208` to `var(--toast-warning-bg)`
- Line 1077: `.sev-count-critical` color → change `#fca5a5` to `var(--sev-text-critical)`
- Line 1081: `.sev-count-major` color → change `#fca5a5` to `var(--sev-text-critical)`
- Line 1085: `.sev-count-minor` color → change `#fcd34d` to `var(--sev-text-major)`

- [ ] **Step 6: Replace hardcoded spacing with tokens**

- Line 394: `.signoff-signed-meta` font-size → change `12px` to `var(--text-xs)`
- Line 469: `.step-line` margin-bottom → change `20px` to `var(--space-5)`
- Line 867: `.notes-fab` bottom/right → change `24px` to `var(--space-6)` (both)
- Line 878: `.notes-panel` bottom/right → change `24px` to `var(--space-6)` (both)

- [ ] **Step 7: Consolidate light theme header override**

Move the content of lines 121-123 into the main `[data-theme="light"]` block. Delete lines 121-123 as a separate rule and add inside the block (after the new tokens from Step 2):

```css
  --header-bg: rgba(240, 242, 245, 0.85);
```

Then update `.app-header` at line 189 to use:
```css
  background: var(--header-bg, rgba(18, 19, 26, 0.8));
```

Remove the separate `[data-theme="light"] .app-header` rule (lines 121-123).

- [ ] **Step 8: Smoke test**

Open the app in browser. Verify:
- Dark theme looks identical to before (no visual changes)
- Light theme looks identical
- Buttons, toasts, cards all render correctly
- No console errors

- [ ] **Step 9: Commit**

```bash
git add skills/audit/scripts/public/styles.css
git commit -m "fix: clean up design system tokens, fix btn-sm height, add z-index scale"
```

---

### Task 2: Unify collapsible patterns (CSS)

**Files:**
- Modify: `skills/audit/scripts/public/styles.css`

Add a unified `.collapse` component. Keep existing class names working as aliases until JS is updated in later tasks.

- [ ] **Step 1: Add unified `.collapse` CSS**

After the Accordion section (line 958), add:

```css
/* ─── Unified Collapse ─── */
.collapse {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
  transition: border-color var(--duration-fast) var(--ease-spring);
}
.collapse:hover { border-color: var(--border-hover); }
.collapse.open { border-color: var(--border-accent); }
.collapse-header {
  display: flex; align-items: center; gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  cursor: pointer;
  background: var(--bg-surface);
  transition: background var(--duration-fast) var(--ease-spring);
  user-select: none;
}
.collapse-header:hover { background: var(--bg-elevated); }
.collapse-body {
  max-height: 0;
  overflow: hidden;
  border-top: 1px solid transparent;
  background: var(--bg-base);
  transition: max-height var(--duration-base) var(--ease-spring);
}
.collapse.open .collapse-body {
  border-top-color: var(--border);
  overflow-y: auto;
}
.collapse-icon {
  color: var(--text-muted);
  transition: transform var(--duration-fast) var(--ease-spring);
  flex-shrink: 0;
}
.collapse.open .collapse-icon { transform: rotate(180deg); }
```

- [ ] **Step 2: Smoke test**

The existing accordion, finding, group-card, and scan-log patterns still work (they use their own class names). The new `.collapse` classes are available but unused until later tasks.

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/public/styles.css
git commit -m "feat: add unified collapse component CSS"
```

---

### Task 3: Add new icon definitions

**Files:**
- Modify: `skills/audit/scripts/public/js/app.mjs`

Add the icons needed by later tasks (home page type icons, review severity icons, keyboard shortcut icon, folder icon).

- [ ] **Step 1: Add new icon SVG paths to ICONS dictionary**

In the `ICONS` dictionary (lines 25-50 of `app.mjs`), add these entries before the closing `}`:

```javascript
  folder: '<path d="M2 6a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6z"/>',
  code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
  "book-open": '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  "folder-search": '<path d="M2 6a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v4"/><path d="M14.5 19l-2.5-2.5"/><circle cx="19" cy="17" r="3"/>',
  "shield-alert": '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
  "alert-triangle": '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  "minus-circle": '<circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
```

Note: `alertTriangle` already exists in ICONS. The new `"alert-triangle"` is a kebab-case alias for use in severity icon mapping.

- [ ] **Step 2: Smoke test**

Open browser console and verify `icon("code")` returns an SVG string without errors.

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/public/js/app.mjs
git commit -m "feat: add new icon definitions for UI overhaul"
```

---

### Task 4: Wizard step transitions

**Files:**
- Modify: `skills/audit/scripts/public/styles.css`
- Modify: `skills/audit/scripts/public/js/views/wizard.mjs`

- [ ] **Step 1: Add step transition CSS**

In `styles.css`, after the existing `.wizard-content-enter` rule (line 246), add:

```css
.wizard-step-enter {
  animation: stepSlideIn 250ms var(--ease-spring) forwards;
}
.wizard-step-exit {
  animation: stepSlideOut 150ms var(--ease-in) forwards;
}
@keyframes stepSlideIn {
  from { opacity: 0; transform: translateX(30px); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes stepSlideOut {
  from { opacity: 1; transform: translateX(0); }
  to { opacity: 0; transform: translateX(-30px); }
}
.wizard-step-enter-back {
  animation: stepSlideInBack 250ms var(--ease-spring) forwards;
}
@keyframes stepSlideInBack {
  from { opacity: 0; transform: translateX(-30px); }
  to { opacity: 1; transform: translateX(0); }
}
```

- [ ] **Step 2: Modify wizard.mjs render() to add transition classes**

In `wizard.mjs`, find the `render()` function (line 214). Before the step routing (line 249), add direction tracking. Modify the render function:

At the top of `renderWizard` (after line 129), add a variable:
```javascript
let prevStep = 0;
```

In the `render()` function, before the step routing block (before line 249), add:
```javascript
const goingForward = step > prevStep;
prevStep = step;
```

Then modify the step content rendering. Find line 246 where the `#wizard-content` div is created:
```html
<div id="wizard-content" class="wizard-content-enter"></div>
```

Change it to:
```html
<div id="wizard-content" class="${goingForward ? 'wizard-step-enter' : 'wizard-step-enter-back'}"></div>
```

This gives the entering step its direction-based animation class.

- [ ] **Step 3: Smoke test**

Navigate through the wizard steps. Verify:
- Clicking Next slides content in from the right
- Clicking Back slides content in from the left
- Reduced motion: steps swap instantly (test with `prefers-reduced-motion: reduce` in devtools)

- [ ] **Step 4: Commit**

```bash
git add skills/audit/scripts/public/styles.css skills/audit/scripts/public/js/views/wizard.mjs
git commit -m "feat: add directional step transitions in wizard"
```

---

### Task 5: Wizard Group step — scan progress + group card badges

**Files:**
- Modify: `skills/audit/scripts/public/styles.css`
- Modify: `skills/audit/scripts/public/js/views/wizard.mjs`

- [ ] **Step 1: Add scan progress bar CSS**

In `styles.css`, after the `.scan-log-section` styles (after line 1453), add:

```css
.scan-progress-bar {
  height: 4px;
  background: var(--bg-active);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: var(--space-4);
}
.scan-progress-bar .progress-fill {
  width: 100%;
  background: linear-gradient(90deg, var(--info), var(--accent), var(--info));
  background-size: 200% 100%;
  animation: scanShimmer 1.5s ease-in-out infinite;
}
@keyframes scanShimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
.scan-file-count {
  display: inline-flex; align-items: center; gap: var(--space-1);
  padding: var(--space-1) var(--space-3);
  background: var(--accent-dim);
  color: var(--accent);
  border-radius: var(--radius-full);
  font-size: var(--text-xs);
  font-weight: 600;
  margin-bottom: var(--space-4);
}
.scan-auto-scroll {
  display: inline-flex; align-items: center; gap: var(--space-1);
  font-size: var(--text-xs); color: var(--text-muted);
  margin-left: var(--space-3);
}
```

- [ ] **Step 2: Add group card file count badge CSS**

Add after the `.group-file-item` styles (after line 1504):

```css
.group-file-count-badge {
  display: inline-flex; align-items: center; gap: var(--space-1);
  padding: 2px 8px;
  background: var(--accent-dim);
  color: var(--accent);
  border-radius: var(--radius-full);
  font-size: var(--text-xs);
  font-weight: 600;
  margin-left: auto;
  flex-shrink: 0;
}
.group-confirm-totals {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  margin-bottom: var(--space-4);
  display: flex; align-items: center; gap: var(--space-2);
}
.confirm-success-check {
  display: inline-flex; align-items: center; justify-content: center;
  width: 48px; height: 48px;
  border-radius: 50%;
  background: var(--accent-dim);
  color: var(--accent);
  animation: confirmPulse 600ms var(--ease-spring);
}
@keyframes confirmPulse {
  0% { transform: scale(0.5); opacity: 0; }
  50% { transform: scale(1.1); }
  100% { transform: scale(1); opacity: 1; }
}
```

- [ ] **Step 3: Modify `renderGroupStep()` in wizard.mjs**

In the scanning state section of `renderGroupStep()` (around line 450-500 where the scanning UI is built), add the shimmer progress bar right after the "Scanning project files..." heading:

Find where the scanning state HTML is constructed. After the spinner/heading, add:
```html
<div class="scan-progress-bar"><div class="progress-fill"></div></div>
```

When scan completes (status becomes `scanned`), add the file count badge. Find where the scan completion is detected and add:
```javascript
// After getting graphData with the file count
const fileCount = graphData.files ? graphData.files.length : 0;
// Include in the HTML: `<span class="scan-file-count">${icon("file", 12)} Found ${fileCount} files</span>`
```

For the scan log panel, add auto-scroll behavior. In the EventSource `onmessage` handler where log entries are appended:
```javascript
const panel = document.getElementById("scan-log-panel");
if (panel) {
  const wasAtBottom = panel.scrollHeight - panel.scrollTop - panel.clientHeight < 30;
  panel.innerHTML += `<div class="scan-log-entry">...</div>`;
  if (wasAtBottom) panel.scrollTop = panel.scrollHeight;
}
```

- [ ] **Step 4: Add group card file count badges**

In the group rendering section of `renderGroupStep()`, where each group card header is built, add:
```javascript
// Inside the group card header, after the group title:
const fileCount = group.files ? group.files.length : 0;
// Add to header HTML: <span class="group-file-count-badge">${fileCount} files</span>
```

Before the "Confirm Groups" button, add totals:
```javascript
const totalFiles = groups.reduce((sum, g) => sum + (g.files ? g.files.length : 0), 0);
// Add HTML: <div class="group-confirm-totals">${groups.length} groups, ${totalFiles} files</div>
```

After confirm success, replace the button area with a checkmark animation:
```javascript
// On confirm success:
container.innerHTML = `<div style="text-align:center;padding:var(--space-8)">
  <div class="confirm-success-check">${icon("check", 24)}</div>
  <p style="margin-top:var(--space-4);color:var(--accent);font-weight:600">Groups confirmed</p>
</div>`;
```

- [ ] **Step 5: Smoke test**

Create a new project scan session. Verify:
- Scan progress shimmer bar appears during scanning
- File count badge appears after scan completes
- Group cards show file count badges
- Confirm shows totals and success animation

- [ ] **Step 6: Commit**

```bash
git add skills/audit/scripts/public/styles.css skills/audit/scripts/public/js/views/wizard.mjs
git commit -m "feat: improve wizard scan progress and group card badges"
```

---

### Task 6: Wizard Configure step — CodeGraph status indicator + folder icon

**Files:**
- Modify: `skills/audit/scripts/public/js/views/wizard.mjs`

- [ ] **Step 1: Add folder icon prefix to project directory input**

In `renderProjectConfigure()` (line 339), find where the project directory input is rendered. Add a folder icon before the input:

```html
<div style="position:relative;">
  <span style="position:absolute;left:var(--space-3);top:50%;transform:translateY(-50%);color:var(--text-muted);pointer-events:none;">${icon("folder", 16)}</span>
  <input id="project-dir" ... style="padding-left:var(--space-8);">
</div>
```

- [ ] **Step 2: Improve CodeGraph status rendering**

Find the CodeGraph status rendering in `renderProjectConfigure()`. Replace the text-only status with icon + color indicator. The current implementation likely builds HTML like:

```html
<div class="codegraph-status-card codegraph-ready">
  <div class="codegraph-info">
    <div class="codegraph-title">...</div>
    ...
```

Change the title to include an icon based on status:
- `ready` → `icon("check", 14)` in green
- `uninit` → `icon("alertTriangle", 14)` in yellow
- `unavail` → `icon("x", 14)` in muted
- `loading` → `<span class="spinner spinner-sm"></span>` in info

Example for ready state:
```javascript
`<div class="codegraph-title" style="color:var(--success)">${icon("check", 14)} CodeGraph Available</div>`
```

- [ ] **Step 3: Smoke test**

Open wizard, go to Configure step. Verify:
- Folder icon appears before the directory input
- CodeGraph status shows icon + label for each state

- [ ] **Step 4: Commit**

```bash
git add skills/audit/scripts/public/js/views/wizard.mjs
git commit -m "feat: add folder icon and visual CodeGraph status to wizard configure step"
```

---

### Task 7: Wizard Ready step — visual summary cards

**Files:**
- Modify: `skills/audit/scripts/public/styles.css`
- Modify: `skills/audit/scripts/public/js/views/wizard.mjs`

- [ ] **Step 1: Add summary card CSS**

In `styles.css`, add after the `.wizard-step-enter-back` section:

```css
.ready-summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-4);
  margin-bottom: var(--space-6);
}
.ready-summary-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
}
.ready-summary-card .summary-icon {
  color: var(--accent);
  margin-bottom: var(--space-2);
}
.ready-summary-card .summary-label {
  font-size: var(--text-xs);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: var(--space-1);
}
.ready-summary-card .summary-value {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text-primary);
}
.btn-start-review {
  width: 100%;
  min-height: 48px;
  font-size: var(--text-md);
}
.btn-start-review:hover {
  animation: startPulse 1.5s ease-in-out infinite;
}
@keyframes startPulse {
  0%, 100% { box-shadow: var(--shadow-glow); }
  50% { box-shadow: 0 0 30px var(--accent-glow); }
}
```

- [ ] **Step 2: Rewrite `renderProjectReady()` in wizard.mjs**

Replace the body of `renderProjectReady()` (line 693) to use visual summary cards:

```javascript
function renderProjectReady() {
  const content = document.getElementById("wizard-content");
  if (!content) return;

  const groupCount = /* read from saved state or session data */;
  const fileCount = /* read from saved state or session data */;
  const contextText = /* read review context */;

  content.innerHTML = `
    <h2 style="margin-bottom:var(--space-6)">Review Ready</h2>
    <div class="ready-summary-grid">
      <div class="ready-summary-card">
        <div class="summary-icon">${icon("folder-search", 20)}</div>
        <div class="summary-label">Type</div>
        <div class="summary-value">Project Scan</div>
      </div>
      <div class="ready-summary-card">
        <div class="summary-icon">${icon("file", 20)}</div>
        <div class="summary-label">Scope</div>
        <div class="summary-value">${groupCount} groups, ${fileCount} files</div>
      </div>
      <div class="ready-summary-card">
        <div class="summary-icon">${icon("clipboard", 20)}</div>
        <div class="summary-label">Context</div>
        <div class="summary-value">${contextText ? escapeHtml(contextText.substring(0, 60)) + (contextText.length > 60 ? "..." : "") : "None"}</div>
      </div>
    </div>
    <button id="btn-start-review" class="btn btn-primary btn-start-review">
      ${icon("zap", 18)} Start AI Review
    </button>
  `;

  document.getElementById("btn-start-review")?.addEventListener("click", () => {
    // Show confirmation state
    content.innerHTML = `
      <div style="text-align:center;padding:var(--space-8)">
        <div class="confirm-success-check">${icon("check", 24)}</div>
        <h3 style="margin-top:var(--space-4);color:var(--text-primary)">Session Prepared</h3>
        <p style="color:var(--text-secondary);margin-top:var(--space-2)">Go to the <a href="#/progress/${sessionId}">Progress page</a> or type <code>start review</code> in the AI terminal.</p>
      </div>
    `;
    localStorage.removeItem(`audit-wizard-${sessionId}`);
  });
}
```

The actual groupCount/fileCount values should be read from the same state that the current `renderProjectReady` uses (it already has access to session data). Read the existing function to determine the exact variable names.

- [ ] **Step 3: Apply same pattern to `renderStep4()` for code/all types**

The code/all ready step at line 1209 should get the same visual summary treatment. Replace its body with similar summary cards showing:
- Type card: "Code Review" or "Code + Story"
- Scope card: file count and scope method
- Context card: review context preview
- (For "all" type) Stories card: story count

Use the same CSS classes.

- [ ] **Step 4: Smoke test**

Complete a wizard flow. Verify:
- Ready step shows visual summary cards
- "Start AI Review" button is full-width with pulse hover
- Clicking it shows confirmation with session link

- [ ] **Step 5: Commit**

```bash
git add skills/audit/scripts/public/styles.css skills/audit/scripts/public/js/views/wizard.mjs
git commit -m "feat: add visual summary cards to wizard ready step"
```

---

### Task 8: Review page — finding severity icons + backgrounds

**Files:**
- Modify: `skills/audit/scripts/public/styles.css`
- Modify: `skills/audit/scripts/public/js/views/task-detail.mjs`

- [ ] **Step 1: Add severity-tinted backgrounds to finding cards in CSS**

In `styles.css`, after the finding card severity border rules (after line 771), add:

```css
.finding-card.severity-critical { background: linear-gradient(135deg, var(--danger-dim), var(--bg-surface)); }
.finding-card.severity-major,
.finding-card.severity-high { background: linear-gradient(135deg, var(--danger-dim), var(--bg-surface)); }
.finding-card.severity-minor,
.finding-card.severity-medium { background: linear-gradient(135deg, var(--warning-dim), var(--bg-surface)); }
.finding-card.severity-info,
.finding-card.severity-low { background: linear-gradient(135deg, var(--info-dim), var(--bg-surface)); }
```

Note: The `.finding-card.confirmed` rule at line 772 already sets a green background — the severity backgrounds should not override it. Add `!not-confirmed` logic by ensuring the confirmed rule comes after the severity rules in the stylesheet.

- [ ] **Step 2: Update finding card rendering in task-detail.mjs**

In `task-detail.mjs`, line 80, change the severity badge from:
```javascript
`<span class="badge severity-${f.severity}">${f.severity}</span>`
```
to:
```javascript
`<span class="badge severity-${f.severity}">${getSeverityIcon(f.severity)} ${f.severity}</span>`
```

Add a helper function at the top of the file (after imports):
```javascript
function getSeverityIcon(severity) {
  const icons = {
    critical: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    major: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    high: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    minor: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    medium: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    info: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>',
    low: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>',
  };
  return icons[severity] || '';
}
```

Also make the finding title bold: find the description div (line 97) and wrap the first part (or the title if there is one) with `font-weight: 600; font-size: var(--text-sm)`.

- [ ] **Step 3: Smoke test**

Open a review with findings. Verify:
- Each finding shows a severity icon in the badge
- Finding cards have tinted backgrounds matching severity
- Confirmed findings still show green background (severity tint overridden)

- [ ] **Step 4: Commit**

```bash
git add skills/audit/scripts/public/styles.css skills/audit/scripts/public/js/views/task-detail.mjs
git commit -m "feat: add severity icons and tinted backgrounds to finding cards"
```

---

### Task 9: Review page — task sidebar improvements

**Files:**
- Modify: `skills/audit/scripts/public/styles.css`
- Modify: `skills/audit/scripts/public/js/views/review.mjs`

- [ ] **Step 1: Add task sidebar mini progress bar CSS**

In `styles.css`, after the `.task-nav-item` styles (after line 659), add:

```css
.task-nav-progress {
  height: 2px;
  background: var(--bg-active);
  border-radius: 1px;
  margin-top: var(--space-1);
  overflow: hidden;
}
.task-nav-progress-fill {
  height: 100%;
  border-radius: 1px;
  background: var(--accent);
  transition: width var(--duration-base) var(--ease-spring);
}
.task-nav-item.active {
  border-left-width: 3px;
  background: var(--accent-dim);
}
.task-sidebar-separator {
  padding: var(--space-2) var(--space-4);
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  background: var(--bg-muted);
}
```

- [ ] **Step 2: Modify task sidebar rendering in review.mjs**

In `renderTasksTab()` (line 226), the sidebar items are built at lines 240-254. Modify the `tasks.map()` to:

1. Add a mini progress bar under each item showing findings reviewed / total:
```javascript
const reviewedCount = task.findings ? task.findings.filter(f => f.status === "confirmed" || f.status === "dismissed").length : 0;
const totalCount = task.findings ? task.findings.length : 0;
const progressPct = totalCount > 0 ? (reviewedCount / totalCount * 100) : 0;
```

Add after each task nav item's existing content:
```html
<div class="task-nav-progress"><div class="task-nav-progress-fill" style="width:${progressPct}%"></div></div>
```

2. Add a "Pending" separator: Insert before the first pending task a `<div class="task-sidebar-separator">Pending</div>`. Sort reviewed tasks first, then the separator, then pending tasks.

- [ ] **Step 3: Add auto-scroll on keyboard navigation**

In the keyboard shortcut handler (line 381-398), after updating `currentTaskIdx`, scroll the active item into view:

```javascript
const activeItem = sidebar.querySelector(".task-nav-item.active");
if (activeItem) activeItem.scrollIntoView({ block: "nearest", behavior: "smooth" });
```

This should be added in both the `j`/ArrowDown and `k`/ArrowUp handlers, after `renderTasksTab(el)` is called (or after the active class is toggled).

- [ ] **Step 4: Smoke test**

Open a review with multiple tasks. Verify:
- Each task in sidebar has a mini progress bar
- Active task has bright accent border
- Pressing j/k scrolls to keep active task visible
- Pending tasks separated from reviewed tasks

- [ ] **Step 5: Commit**

```bash
git add skills/audit/scripts/public/styles.css skills/audit/scripts/public/js/views/review.mjs
git commit -m "feat: add mini progress bars and pending separator to task sidebar"
```

---

### Task 10: Review page — overview quick stats + severity chart improvements

**Files:**
- Modify: `skills/audit/scripts/public/js/views/review.mjs`
- Modify: `skills/audit/scripts/public/styles.css`

- [ ] **Step 1: Add quick stats row CSS**

In `styles.css`, add:

```css
.quick-stats-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-3);
  margin-bottom: var(--space-6);
}
.quick-stat {
  text-align: center;
  padding: var(--space-3);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}
.quick-stat-value {
  font-size: var(--text-xl);
  font-weight: 700;
  font-family: var(--font-mono);
}
.quick-stat-value-confirmed { color: var(--accent); }
.quick-stat-value-dismissed { color: var(--warning); }
.quick-stat-value-unreviewed { color: var(--text-muted); }
.quick-stat-label {
  font-size: var(--text-xs);
  color: var(--text-muted);
  margin-top: var(--space-1);
}
.severity-bar-pct {
  font-size: var(--text-xs);
  color: var(--text-muted);
  font-family: var(--font-mono);
  min-width: 36px;
  text-align: right;
}
```

- [ ] **Step 2: Add quick stats row to overview**

In `renderOverview()` (line 122), after the summary stat cards, add a quick stats row:

```javascript
const allFindings = tasks.flatMap(t => t.findings || []);
const confirmed = allFindings.filter(f => f.status === "confirmed").length;
const dismissed = allFindings.filter(f => f.status === "dismissed").length;
const unreviewed = allFindings.length - confirmed - dismissed;
const total = allFindings.length || 1;

const confirmPct = Math.round(confirmed / total * 100);
const dismissPct = Math.round(dismissed / total * 100);
const unreviewedPct = 100 - confirmPct - dismissPct;
```

Render as:
```html
<div class="quick-stats-row">
  <div class="quick-stat">
    <div class="quick-stat-value quick-stat-value-confirmed">${confirmPct}%</div>
    <div class="quick-stat-label">Confirmed</div>
  </div>
  <div class="quick-stat">
    <div class="quick-stat-value quick-stat-value-dismissed">${dismissPct}%</div>
    <div class="quick-stat-label">Dismissed</div>
  </div>
  <div class="quick-stat">
    <div class="quick-stat-value quick-stat-value-unreviewed">${unreviewedPct}%</div>
    <div class="quick-stat-label">Unreviewed</div>
  </div>
</div>
```

- [ ] **Step 3: Add percentage labels to severity bars**

In the severity bar chart rendering in `renderOverview()`, after the count, add a percentage:

```javascript
const pct = total > 0 ? Math.round(count / total * 100) : 0;
// Add to bar HTML: <span class="severity-bar-pct">${pct}%</span>
```

- [ ] **Step 4: Add severity icon to needs-attention items**

Find the needs-attention rendering in `renderOverview()`. Add a colored severity icon before each item text:

```javascript
const sevIcon = getSeverityIcon(item.maxSeverity); // reuse from task-detail or inline
```

If `getSeverityIcon` is not importable from task-detail.mjs, define the severity icon mapping inline in review.mjs (same SVG strings as Task 8).

- [ ] **Step 5: Smoke test**

Open review overview. Verify:
- Quick stats row shows confirmed/dismissed/unreviewed percentages
- Severity bars show percentage labels
- Needs attention items show severity icons

- [ ] **Step 6: Commit**

```bash
git add skills/audit/scripts/public/styles.css skills/audit/scripts/public/js/views/review.mjs
git commit -m "feat: add quick stats, severity percentages, and icons to review overview"
```

---

### Task 11: Review page — keyboard shortcut overlay

**Files:**
- Modify: `skills/audit/scripts/public/js/views/review.mjs`
- Modify: `skills/audit/scripts/public/styles.css`

- [ ] **Step 1: Add keyboard overlay CSS**

In `styles.css`, add:

```css
.kb-overlay {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  z-index: var(--z-modal);
  animation: fadeIn 150ms var(--ease-spring);
}
.kb-overlay-card {
  background: var(--bg-surface-solid);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  min-width: 280px;
  box-shadow: var(--shadow-lg);
}
.kb-overlay-title {
  font-size: var(--text-lg);
  font-weight: 600;
  margin-bottom: var(--space-4);
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--border);
}
.kb-row {
  display: flex;
  justify-content: space-between;
  padding: var(--space-2) 0;
  font-size: var(--text-sm);
}
.kb-key {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  background: var(--bg-elevated);
  padding: 2px 8px;
  border-radius: var(--radius-xs);
  border: 1px solid var(--border);
  color: var(--text-secondary);
}
.kb-hint {
  position: fixed;
  bottom: var(--space-6);
  right: var(--space-6);
  z-index: var(--z-overlay);
}
.kb-hint-btn {
  width: 32px; height: 32px;
  border-radius: 50%;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  color: var(--text-muted);
  font-size: var(--text-sm);
  font-weight: 600;
  font-family: var(--font-mono);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all var(--duration-fast) var(--ease-spring);
}
.kb-hint-btn:hover { background: var(--bg-elevated); color: var(--text-primary); }
```

- [ ] **Step 2: Add keyboard overlay to review.mjs**

In `renderReview()`, after the keyboard shortcut listener is set up (line 411), add a `?` handler.

Modify the `shortcutHandler` function to handle `?`:

```javascript
if (e.key === "?") {
  toggleKbOverlay();
  return;
}
if (e.key === "Escape") {
  closeKbOverlay();
  return;
}
```

Add the overlay functions:

```javascript
function toggleKbOverlay() {
  const existing = document.getElementById("kb-overlay");
  if (existing) { existing.remove(); return; }
  const overlay = document.createElement("div");
  overlay.id = "kb-overlay";
  overlay.className = "kb-overlay";
  overlay.innerHTML = `
    <div class="kb-overlay-card">
      <div class="kb-overlay-title">Keyboard Shortcuts</div>
      <div class="kb-row"><span>j / ↓</span><span class="kb-key">Next task</span></div>
      <div class="kb-row"><span>k / ↑</span><span class="kb-key">Previous task</span></div>
      <div class="kb-row"><span>o</span><span class="kb-key">Overview tab</span></div>
      <div class="kb-row"><span>s</span><span class="kb-key">Tasks tab</span></div>
      <div class="kb-row"><span>?</span><span class="kb-key">Show shortcuts</span></div>
      <div class="kb-row"><span>Esc</span><span class="kb-key">Close panel</span></div>
    </div>
  `;
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
  document.body.appendChild(overlay);
}
```

Add the `?` hint button to the review view (after the main container content):
```javascript
const hint = document.createElement("div");
hint.className = "kb-hint";
hint.innerHTML = `<button class="kb-hint-btn" title="Keyboard shortcuts">?</button>`;
hint.querySelector("button").addEventListener("click", toggleKbOverlay);
container.appendChild(hint);
```

Ensure `closeKbOverlay` is called in the cleanup function:
```javascript
onNavigateCleanup(() => {
  document.removeEventListener("keydown", shortcutHandler);
  document.getElementById("kb-overlay")?.remove();
});
```

- [ ] **Step 3: Smoke test**

Open review page. Verify:
- `?` icon in bottom-right corner
- Press `?` or click icon → overlay appears with shortcuts
- Press `Esc` or click outside → overlay closes
- Overlay is glassmorphism-styled

- [ ] **Step 4: Commit**

```bash
git add skills/audit/scripts/public/styles.css skills/audit/scripts/public/js/views/review.mjs
git commit -m "feat: add keyboard shortcut overlay to review page"
```

---

### Task 12: Home page — session card improvements + empty state

**Files:**
- Modify: `skills/audit/scripts/public/js/views/home.mjs`
- Modify: `skills/audit/scripts/public/styles.css`

- [ ] **Step 1: Add CSS for improved session cards and empty state**

In `styles.css`, add:

```css
.session-card-type-icon {
  width: 18px; height: 18px;
  color: var(--text-muted);
  flex-shrink: 0;
}
.session-time {
  font-size: var(--text-xs);
  color: var(--text-muted);
}
.session-progress-label {
  font-size: var(--text-xs);
  font-family: var(--font-mono);
  color: var(--text-secondary);
  margin-left: var(--space-2);
}
.badge-reviewing {
  animation: reviewPulse 2s ease-in-out infinite;
}
@keyframes reviewPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}
.session-card.card-clickable:hover {
  transform: translateY(-2px);
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--border-accent), var(--shadow-sm);
}
.empty-state-cta-row {
  display: flex; gap: var(--space-3);
  justify-content: center;
  flex-wrap: wrap;
}
```

- [ ] **Step 2: Add relative time helper to home.mjs**

Add at the top of `home.mjs`:

```javascript
function relativeTime(dateStr) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}
```

- [ ] **Step 3: Add type icons to session cards**

In the session card rendering (line 61-94), add a type icon before the session ID:

```javascript
const typeIcon = s.type === "code" ? icon("code", 18)
  : s.type === "all" ? icon("book-open", 18)
  : icon("folder-search", 18);
```

Add `${typeIcon}` before the session ID in the card header.

- [ ] **Step 4: Replace date with relative time**

Change line 77 from:
```javascript
new Date(s.created).toLocaleDateString()
```
to:
```javascript
`<span title="${new Date(s.created).toLocaleString()}">${relativeTime(s.created)}</span>`
```

- [ ] **Step 5: Add progress bar label**

After the progress bar in session cards, add:
```javascript
const progressLabel = s.totalTasks ? `${s.reviewedTasks || 0}/${s.totalTasks}` : '';
```

Render after the progress bar: `<span class="session-progress-label">${progressLabel}</span>`

- [ ] **Step 6: Redesign empty state**

Replace the empty state at lines 42-58 with:

```javascript
if (sessions.length === 0) {
  listEl.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          <line x1="8" y1="11" x2="14" y2="11"/>
          <line x1="8" y1="14" x2="14" y2="14"/>
          <line x1="8" y1="8" x2="12" y2="8"/>
        </svg>
      </div>
      <h2>No audit sessions yet</h2>
      <p>Start by auditing specific code changes, or scan an entire project for comprehensive analysis.</p>
      <div class="empty-state-cta-row">
        <a href="#/wizard/new?type=code" class="btn btn-primary">${icon("code", 16)} Code Review</a>
        <a href="#/wizard/new?type=project" class="btn btn-ghost" style="border-color:var(--border)">${icon("folder-search", 16)} Project Scan</a>
      </div>
    </div>
  `;
  return;
}
```

- [ ] **Step 7: Add wizard type pre-selection support**

In `wizard.mjs`, at the beginning of `renderWizard` (around line 129), parse the query string for type:

```javascript
const urlParams = new URLSearchParams(window.location.hash.split("?")[1] || "");
const preselectType = urlParams.get("type");
```

In `renderStep1()`, if `preselectType` is set and `reviewType` is not already set, auto-select:
```javascript
if (preselectType && !reviewType) {
  reviewType = preselectType;
  save();
}
```

- [ ] **Step 8: Smoke test**

Open home page. Verify:
- Session cards show type icons
- Dates show relative time with tooltip on hover
- Progress bars show fraction labels
- Reviewing badge pulses
- Empty state shows illustration and two CTAs
- Clicking CTA opens wizard with pre-selected type

- [ ] **Step 9: Commit**

```bash
git add skills/audit/scripts/public/styles.css skills/audit/scripts/public/js/views/home.mjs skills/audit/scripts/public/js/views/wizard.mjs
git commit -m "feat: improve home page cards, empty state, and wizard type pre-selection"
```

---

### Task 13: Breadcrumb consistency + header improvements

**Files:**
- Modify: `skills/audit/scripts/public/js/views/summary.mjs`
- Modify: `skills/audit/scripts/public/js/app.mjs`
- Modify: `skills/audit/scripts/public/styles.css`

- [ ] **Step 1: Add breadcrumb hover animation CSS**

In `styles.css`, after the breadcrumb styles (after line 229), add:

```css
.breadcrumb a {
  position: relative;
}
.breadcrumb a::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 0;
  width: 0;
  height: 1px;
  background: var(--accent);
  transition: width var(--duration-fast) var(--ease-spring);
}
.breadcrumb a:hover::after {
  width: 100%;
}
```

- [ ] **Step 2: Fix summary.mjs breadcrumb**

In `summary.mjs` line 11-15, the "Review" breadcrumb entry should be a clickable link. Verify it already has `href: "#/review/${sessionId}"`. If "Sessions" is plain text (no `href`), add `href: "#/home"`:

```javascript
setBreadcrumb([
  { label: "Sessions", href: "#/home" },
  { label: "Review", href: `#/review/${sessionId}` },
  { label: "Summary" }
]);
```

- [ ] **Step 3: Add theme toggle tooltip**

In `app.mjs`, find where the theme toggle button is created. It's initialized via `initTheme()` imported from another module. The theme toggle button in the HTML header needs a `title` attribute.

In the HTML file `index.html`, find the theme toggle button and add `title="Switch theme"`. If it's created dynamically in JS, add the attribute there.

- [ ] **Step 4: Add active session indicator**

In `app.mjs`, add a function to check for active sessions:

```javascript
let activePollTimer = null;

async function checkActiveSessions() {
  try {
    const sessions = await api.listSessions();
    const hasActive = sessions.some(s => s.status === "reviewing");
    const dot = document.getElementById("active-dot");
    if (dot) dot.style.display = hasActive ? "block" : "none";
  } catch { /* ignore */ }
}

function startActivePolling() {
  checkActiveSessions();
  activePollTimer = setInterval(checkActiveSessions, 30000);
}

function stopActivePolling() {
  if (activePollTimer) { clearInterval(activePollTimer); activePollTimer = null; }
}
```

In the `navigate()` function, call `startActivePolling()`. In `onNavigateCleanup`, the timer is stopped when navigating away.

In `index.html`, add an active dot element next to the logo:
```html
<span id="active-dot" style="display:none;width:8px;height:8px;border-radius:50%;background:var(--accent);animation:reviewPulse 2s ease-in-out infinite;margin-left:4px;flex-shrink:0;"></span>
```

Place it inside the `.app-logo` element, after the SVG icon.

- [ ] **Step 5: Smoke test**

- Verify breadcrumbs have hover underline animation
- Verify "Sessions" link navigates to home from all sub-pages
- Verify theme toggle shows tooltip on hover
- Verify active dot appears when a session is reviewing (create one if needed)

- [ ] **Step 6: Commit**

```bash
git add skills/audit/scripts/public/js/views/summary.mjs skills/audit/scripts/public/js/app.mjs skills/audit/scripts/public/styles.css skills/audit/scripts/public/index.html
git commit -m "feat: breadcrumb hover animation, active session indicator, theme tooltip"
```

---

## Spec Coverage Check

| Spec Section | Task |
|---|---|
| 1.1 Unify collapsibles | Task 2 (CSS), JS migration deferred to individual view tasks |
| 1.2 Fix btn-sm | Task 1 |
| 1.3 z-index tokens | Task 1 |
| 1.4 Extract hardcoded colors | Task 1 |
| 1.5 Spacing scale fill | Task 1 |
| 1.6 Stat card extends card | Task 1 (token reuse), direct dedup in Task 1 |
| 1.7 Light theme consolidation | Task 1 |
| 2.1 Step transitions | Task 4 |
| 2.2 Scan progress | Task 5 |
| 2.3 Group card badges | Task 5 |
| 2.4 CodeGraph indicator | Task 6 |
| 2.5 Ready step redesign | Task 7 |
| 3.1 Finding severity icons | Task 8 |
| 3.2 Task sidebar progress | Task 9 |
| 3.3 Overview quick stats | Task 10 |
| 3.4 Keyboard overlay | Task 11 |
| 4.1 Session card improvements | Task 12 |
| 4.2 Empty state | Task 12 |
| 4.3 Breadcrumb consistency | Task 13 |
| 4.4 Header improvements | Task 13 |
