# UI Polish, JIRA Integration & Sign-off Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Six targeted frontend improvements to the A-Solid Audit wizard and summary views.

**Architecture:** All changes are in the existing SPA frontend files — no new files, no backend changes. Each task modifies one or two view/component modules in `skills/audit/scripts/public/js/`.

**Tech Stack:** Vanilla JS (ES modules), inline HTML templates, Tailwind via CDN, no test framework (manual browser testing).

---

## File Structure

| File | Changes |
|---|---|
| `skills/audit/scripts/public/js/views/wizard.mjs` | Tasks 1–4 (context default, auto-expand, JIRA, badge alignment, Chinese placeholder) |
| `skills/audit/scripts/public/js/views/summary.mjs` | Task 5 (sign-off reorder + interaction redesign) |
| `skills/audit/scripts/public/js/components/notes-panel.mjs` | Task 6 (FAB panel rename) |

No new files. No backend changes. The JIRA backend (provider + API endpoint) already exists.

---

### Task 1: Review Context Default Expanded + Chinese Placeholder Fix

**Files:**
- Modify: `skills/audit/scripts/public/js/views/wizard.mjs`

This task covers spec items 1 and 6 (Chinese text part). These are both small single-line changes in the same file, so they're grouped.

- [ ] **Step 1: Change the default value of `contextExpanded`**

In `wizard.mjs` line 14, change:

```js
let contextExpanded = false;
```

to:

```js
let contextExpanded = true;
```

- [ ] **Step 2: Fix localStorage restore to handle `true` correctly**

In `wizard.mjs` line 26, the current restore logic is:

```js
contextExpanded = state.contextExpanded || false;
```

This would treat `false` from localStorage the same as missing (both falsy), so it would use the new default `true` correctly. But it also treats an explicit `false` saved earlier as "use default". This is fine — the user's new sessions will default expanded. Leave this line as-is.

- [ ] **Step 3: Replace the Chinese placeholder with English**

In `wizard.mjs` line 465, change:

```js
placeholder="项目背景、关键需求、关注领域、已知问题..."
```

to:

```js
placeholder="Project background, key requirements, areas of concern, known issues..."
```

- [ ] **Step 4: Test in browser**

1. Open http://localhost:3456, create a new session, walk through wizard to Step 4 (for "Code Review Only" type, this is Step 3; for "Code + Story Alignment", this is Step 4).
2. Verify Review Context panel is **expanded** by default with the textarea visible.
3. Verify the placeholder text is in English.
4. Collapse it, refresh — verify it stays collapsed (localStorage).
5. Start a fresh session — verify it starts expanded again.

- [ ] **Step 5: Commit**

```bash
git add skills/audit/scripts/public/js/views/wizard.mjs
git commit -m "feat: default Review Context to expanded, fix Chinese placeholder"
```

---

### Task 2: Auto-Expand New Story After Adding

**Files:**
- Modify: `skills/audit/scripts/public/js/views/wizard.mjs`

- [ ] **Step 1: Track the new story index and pass it into the accordion**

In `wizard.mjs`, the `save-story-btn` click handler (around line 295) currently does:

```js
document.getElementById("save-story-btn").addEventListener("click", async () => {
  const name = document.getElementById("story-name").value.trim();
  const description = document.getElementById("story-desc").value.trim();
  const acceptance = document.getElementById("story-ac").value.trim();
  if (!name) { showToast("Story name is required"); return; }
  try {
    await api.createStory(sessionId, { name, description, acceptance });
    stories.push({ name, description, acceptance });
    save();
    render();
  } catch (e) { showToast("Failed to save story: " + e.message); }
});
```

Change it to:

```js
document.getElementById("save-story-btn").addEventListener("click", async () => {
  const name = document.getElementById("story-name").value.trim();
  const description = document.getElementById("story-desc").value.trim();
  const acceptance = document.getElementById("story-ac").value.trim();
  if (!name) { showToast("Story name is required"); return; }
  try {
    await api.createStory(sessionId, { name, description, acceptance });
    stories.push({ name, description, acceptance });
    save();
    pendingExpandIndex = stories.length - 1;
    render();
  } catch (e) { showToast("Failed to save story: " + e.message); }
});
```

- [ ] **Step 2: Add the `pendingExpandIndex` variable and use it in `loadAccordionFileTree`**

At the top of `renderWizard` (around line 8, alongside other state variables), add:

```js
let pendingExpandIndex = -1;
```

In `loadAccordionFileTree`, after `let expandedIndex = -1;` (line 327), add:

```js
if (pendingExpandIndex >= 0 && pendingExpandIndex < stories.length) {
  expandedIndex = pendingExpandIndex;
  pendingExpandIndex = -1;
  const item = container.querySelector(`[data-story-index="${expandedIndex}"]`);
  if (item) item.classList.add("expanded");
}
```

This sets the expanded state immediately when building the accordion, so the new story renders already open. The file tree will be lazily loaded when the user interacts, but the accordion body will be visible.

However, we also need to load the file tree for the pre-expanded item. After the accordion HTML is built and the `expandedIndex` logic above, trigger the file tree load:

```js
if (expandedIndex >= 0) {
  const body = document.getElementById(`accordion-body-${expandedIndex}`);
  const story = stories[expandedIndex];
  const existing = storyMappings.find(m => m.storyName === story.name);
  const tree = renderFileTree(body, files);
  fileTreeInstances[expandedIndex] = tree;
  if (existing?.files?.length) {
    queueMicrotask(() => { tree.setSelected(existing.files); });
  }
  body.addEventListener("change", () => {
    const selected = tree.getSelected();
    const mappingIdx = storyMappings.findIndex(m => m.storyName === story.name);
    if (mappingIdx >= 0) storyMappings[mappingIdx].files = selected;
    else storyMappings.push({ storyName: story.name, files: selected });
    save();
    const item = container.querySelector(`[data-story-index="${expandedIndex}"]`);
    const badge = item?.querySelector(".accordion-badge");
    if (badge) {
      badge.textContent = selected.length;
      badge.classList.toggle("has-files", selected.length > 0);
    }
    syncMappingsToServer();
  });
}
```

- [ ] **Step 3: Test in browser**

1. Create a "Code + Story Alignment" session, get to Step 3 (Stories).
2. Add a new story. Verify it appears **already expanded** in the accordion with the file tree loaded.
3. Check some files, collapse, re-expand — verify state persists.
4. Add another story — verify only the new one is expanded (mutual exclusivity).

- [ ] **Step 4: Commit**

```bash
git add skills/audit/scripts/public/js/views/wizard.mjs
git commit -m "feat: auto-expand newly added story accordion"
```

---

### Task 3: JIRA Story Source Integration

**Files:**
- Modify: `skills/audit/scripts/public/js/views/wizard.mjs`

The backend already has `GET /api/providers` and `POST /api/providers/:name/fetch`. The frontend `api.mjs` already has `api.listProviders()` and `api.fetchFromProvider(name, ids)`.

- [ ] **Step 1: Add JIRA source option to the dropdown dynamically**

In `renderStep3()`, the dropdown is currently hardcoded (line 268):

```html
<select id="story-source">
  <option value="manual">Manual Input</option>
</select>
```

Change to:

```html
<select id="story-source">
  <option value="manual">Manual Input</option>
</select>
```

After the innerHTML assignment, add a block that dynamically populates the dropdown with available providers. Insert this right after the story-form event listeners setup (after line 306):

```js
// Populate provider sources
let providers = [];
try {
  providers = await api.listProviders();
} catch (e) { /* providers unavailable */ }
const sourceSelect = document.getElementById("story-source");
if (providers.length > 0) {
  providers.forEach(p => {
    const opt = document.createElement("option");
    opt.value = p;
    opt.textContent = p.charAt(0).toUpperCase() + p.slice(1);
    sourceSelect.appendChild(opt);
  });
}
```

Wait — `renderStep3` is not async. But it calls `loadAccordionFileTree` which is async. We need to either make `renderStep3` async or fetch providers in parallel. The simplest approach: make `renderStep3` async.

Change the function signature from:

```js
function renderStep3() {
```

to:

```js
async function renderStep3() {
```

Then after the `story-form` hidden div (after the save-story-btn handler, around line 306), add:

```js
// Populate provider sources
let providers = [];
try { providers = await api.listProviders(); } catch (e) {}
const sourceSelect = document.getElementById("story-source");
providers.forEach(p => {
  const opt = document.createElement("option");
  opt.value = p;
  opt.textContent = p.charAt(0).toUpperCase() + p.slice(1);
  sourceSelect.appendChild(opt);
});

// JIRA fetch UI
const jiraFetchArea = document.createElement("div");
jiraFetchArea.id = "jira-fetch-area";
jiraFetchArea.classList.add("hidden", "mt-2");
jiraFetchArea.innerHTML = `
  <div class="flex gap-2">
    <input id="jira-key-input" placeholder="e.g. PROJ-123">
    <button id="jira-fetch-btn" class="btn btn-sm">${icon("download", 14)} Fetch</button>
  </div>
`;
document.getElementById("story-collection").insertBefore(
  jiraFetchArea,
  document.getElementById("story-form")
);

sourceSelect.addEventListener("change", () => {
  const isProvider = sourceSelect.value !== "manual";
  jiraFetchArea.classList.toggle("hidden", !isProvider);
  document.getElementById("story-form").classList.add("hidden");
});

document.getElementById("jira-fetch-btn").addEventListener("click", async () => {
  const key = document.getElementById("jira-key-input").value.trim();
  if (!key) { showToast("Enter a JIRA issue key"); return; }
  const fetchBtn = document.getElementById("jira-fetch-btn");
  fetchBtn.disabled = true;
  fetchBtn.innerHTML = `<span class="spinner spinner-sm"></span> Fetching...`;
  try {
    const results = await api.fetchFromProvider(sourceSelect.value, [key]);
    if (!results || results.length === 0) { showToast("No data returned"); return; }
    const story = results[0];
    document.getElementById("story-name").value = story.name || "";
    document.getElementById("story-desc").value = story.description || "";
    document.getElementById("story-ac").value = story.acceptance || "";
    document.getElementById("story-form").classList.remove("hidden");
    jiraFetchArea.classList.add("hidden");
    sourceSelect.value = "manual";
  } catch (e) {
    showToast("Fetch failed: " + e.message);
  } finally {
    fetchBtn.disabled = false;
    fetchBtn.innerHTML = `${icon("download", 14)} Fetch`;
  }
});
```

- [ ] **Step 2: Test in browser**

1. If JIRA env vars are not configured, the dropdown should still only show "Manual Input" (the provider returns an error and `listProviders` returns an empty array or the provider is not listed as executable).
2. If JIRA is configured, "Jira" should appear in the dropdown.
3. Select "Jira" — verify the key input + Fetch button appear, manual form is hidden.
4. Enter a valid JIRA key, click Fetch — verify fields auto-fill, form becomes visible and editable.
5. Edit the auto-filled fields, click Save — verify story is created normally.
6. Test with an invalid key — verify error toast.

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/public/js/views/wizard.mjs
git commit -m "feat: add JIRA provider as story source in wizard"
```

---

### Task 4: File Mapping Badge Right-Aligned

**Files:**
- Modify: `skills/audit/scripts/public/js/views/wizard.mjs`

- [ ] **Step 1: Add flex-grow to the story name span**

In `loadAccordionFileTree`, the accordion header rendering (line 336) currently has:

```html
<span class="text-sm font-medium">${escapeHtml(story.name || story.id)}</span>
```

Change to:

```html
<span class="text-sm font-medium" style="flex-grow:1">${escapeHtml(story.name || story.id)}</span>
```

This makes the name span fill all available space between the clipboard icon and the badge, pushing the badge to a consistent right-aligned position.

- [ ] **Step 2: Test in browser**

1. Open a session with stories, go to File Mapping.
2. Verify all file count badges are aligned to the same right position, regardless of story name length.
3. Test with very long story names — verify they don't push the badge off-screen (flex-grow handles overflow).

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/public/js/views/wizard.mjs
git commit -m "fix: right-align file count badges in story accordion"
```

---

### Task 5: Summary & Sign-off Page Redesign

**Files:**
- Modify: `skills/audit/scripts/public/js/views/summary.mjs`

This is the largest task. It reorders sections and rewrites the sign-off interaction.

- [ ] **Step 1: Reorder the HTML blocks**

In `summary.mjs`, the `content.innerHTML` template literal (starting at line 74) currently has sections in this order:

1. Stat cards (lines 75-96)
2. Findings by Severity (lines 98-110)
3. Overall Notes (lines 112-118)
4. Task Details (lines 120-125)
5. Sign-off (lines 127-152)

Reorder to:

1. Stat cards (same)
2. Findings by Severity (same)
3. Overall Notes (same)
4. **Sign-off** (moved up)
5. Task Details (moved down)

- [ ] **Step 2: Rewrite the sign-off section**

Replace the sign-off HTML block (the `<div class="card mb-6">` for Sign-off) with two conditional versions — unsigned and signed:

**Unsigned state:**

```html
<div class="card mb-6" id="signoff-card">
  <div class="font-medium mb-3">Sign-off</div>
  <div class="grid grid-cols-2 gap-4">
    <div>
      <label>Name</label>
      <input id="signoff-name" class="mt-1" value="${escapeHtml(notes?.summary?.signoff?.name || "")}">
      <div id="signoff-name-error" class="text-danger text-xs mt-1 hidden">Name is required</div>
    </div>
    <div>
      <label>Role</label>
      <input id="signoff-role" class="mt-1" value="${escapeHtml(notes?.summary?.signoff?.role || "")}">
    </div>
  </div>
  <button id="signoff-btn" class="btn btn-primary mt-3">
    ${icon("check", 14)}
    Sign Off
  </button>
</div>
```

**Signed state:**

```html
<div class="card mb-6" id="signoff-card" style="border-color:var(--success);border-left:3px solid var(--success)">
  <div class="font-medium mb-3">Sign-off</div>
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
    <div style="width:32px;height:32px;border-radius:50%;background:var(--success);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;flex-shrink:0">
      ${icon("check", 16)}
    </div>
    <div>
      <div style="font-weight:600">Signed off</div>
      <div class="text-xs text-muted">${new Date(notes.summary.signoff.date).toLocaleDateString()} · ${escapeHtml(notes.summary.signoff.name || "unknown")}${notes.summary.signoff.role ? " · " + escapeHtml(notes.summary.signoff.role) : ""}</div>
    </div>
    <button id="signoff-undo-btn" class="btn btn-ghost btn-sm" style="margin-left:auto;font-size:12px;color:var(--text-muted);text-decoration:underline">Undo</button>
  </div>
  <div style="opacity:0.5;pointer-events:none">
    <div class="grid grid-cols-2 gap-4">
      <div>
        <label>Name</label>
        <input class="mt-1" value="${escapeHtml(notes.summary.signoff.name || "")}" readonly>
      </div>
      <div>
        <label>Role</label>
        <input class="mt-1" value="${escapeHtml(notes.summary.signoff.role || "")}" readonly>
      </div>
    </div>
  </div>
</div>
```

Replace the existing sign-off conditional block (lines 127-152) with:

```js
${notes?.summary?.signoff?.date ? `
  SIGNED_STATE_HTML_ABOVE
` : `
  UNSIGNED_STATE_HTML_ABOVE
`}
```

- [ ] **Step 3: Add the undo handler**

After the sign-off button handler, add a new undo handler:

```js
document.getElementById("signoff-undo-btn")?.addEventListener("click", async () => {
  try {
    await api.updateSummary(sessionId, { signoff: null });
    showToast("Sign-off cleared", "success");
    location.hash = `#/summary/${sessionId}`;
  } catch (e) { showToast("Failed to undo sign-off: " + e.message); }
});
```

The existing sign-off button handler (lines 164-183) stays the same — it already handles validation and saving.

- [ ] **Step 4: Test in browser**

1. Open a completed session's Summary page.
2. Verify section order: stats → severity chart → Overall Notes → Sign-off → Task Details.
3. Without signing off: verify name validation works (empty name shows error).
4. Sign off: verify card transforms to green border, checkmark avatar, "Signed off" text, read-only inputs.
5. Click Undo: verify card returns to editable state with previous values pre-filled.
6. Verify the undo button is styled as an underlined text link, not a prominent button.
7. Test Export PDF — verify the sign-off section prints correctly in both states.

- [ ] **Step 5: Commit**

```bash
git add skills/audit/scripts/public/js/views/summary.mjs
git commit -m "feat: redesign sign-off with undo, reorder summary sections"
```

---

### Task 6: FAB Panel Rename

**Files:**
- Modify: `skills/audit/scripts/public/js/components/notes-panel.mjs`

- [ ] **Step 1: Update the panel title and add subtitle**

In `notes-panel.mjs`, the panel header (line 15) currently has:

```html
<span class="font-medium text-sm">Review Notes</span>
```

Change to:

```html
<div>
  <span class="font-medium text-sm">Review Context</span>
  <div class="text-xs text-muted" style="margin-top:2px">Referenced during code review as context.</div>
</div>
```

- [ ] **Step 2: Update the FAB title attribute**

In `notes-panel.mjs`, the FAB button (line 11) has:

```html
<button id="notes-fab" class="notes-fab" title="Edit review notes" aria-label="Edit review notes">
```

Change to:

```html
<button id="notes-fab" class="notes-fab" title="Edit review context" aria-label="Edit review context">
```

- [ ] **Step 3: Test in browser**

1. Open any session page.
2. Verify the floating button tooltip says "Edit review context".
3. Click the FAB — verify panel title says "Review Context" with subtitle "Referenced during code review as context."
4. Verify the panel still auto-saves correctly.

- [ ] **Step 4: Commit**

```bash
git add skills/audit/scripts/public/js/components/notes-panel.mjs
git commit -m "feat: rename FAB panel from Review Notes to Review Context"
```

---

## Execution Notes

- **Testing:** All testing is manual in the browser at http://localhost:3456. No automated test suite exists for the frontend.
- **Server:** The dev server must be running (`node skills/audit/scripts/cli.mjs server`) before testing.
- **Task dependencies:** Tasks 1-4 all modify `wizard.mjs` and should be applied sequentially to avoid merge conflicts. Task 5 modifies `summary.mjs` independently. Task 6 modifies `notes-panel.mjs` independently. Tasks 5 and 6 can be done in parallel with 1-4.
