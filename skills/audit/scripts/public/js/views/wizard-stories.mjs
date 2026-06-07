// skills/audit/scripts/public/js/views/wizard-stories.mjs
import { api } from "../api.mjs";
import { showToast, icon, escapeHtml } from "../app.mjs";
import { renderFileTree } from "../components/file-tree.mjs";

export async function renderStoriesStep(content, state) {
  content.innerHTML = `
    <div class="card mb-4">
      <h2 class="font-semibold mb-4">Story Collection</h2>
      <p class="text-sm text-secondary mb-4">Add stories to check code alignment against requirements. Each story maps to specific files for review.</p>
      <div id="story-collection">
        <div class="story-add-bar">
          <div class="flex gap-2 flex-grow">
            <select id="story-source">
              <option value="manual">Manual Input</option>
            </select>
            <button id="add-story-btn" class="btn">${icon("plus", 14)} Add Story</button>
          </div>
        </div>
        <div id="story-form" class="hidden story-form-card">
          <div class="story-form-header">
            <span class="text-sm font-medium">New Story</span>
            <button id="cancel-story-btn" class="btn btn-ghost btn-sm" style="padding:2px 6px;color:var(--text-muted)" title="Cancel">${icon("x", 14)}</button>
          </div>
          <div class="story-form-fields">
            <label for="story-name">Name</label>
            <input id="story-name" placeholder="e.g. PROJ-123 Login Feature">
            <label for="story-desc">Description</label>
            <textarea id="story-desc" rows="2" placeholder="What this story covers..."></textarea>
            <label for="story-ac">Acceptance Criteria</label>
            <textarea id="story-ac" rows="2" placeholder="Expected behavior or outcomes..."></textarea>
          </div>
          <div class="story-form-actions">
            <button id="save-story-btn" class="btn btn-primary btn-sm">${icon("check", 14)} Save</button>
          </div>
        </div>
      </div>
    </div>
    <div id="file-mapping-section" class="card mb-4 ${state.stories.length === 0 ? "hidden" : ""}">
      <h2 class="font-semibold mb-4">File Mapping</h2>
      <p class="text-sm text-secondary mb-3">Click a story to expand and associate files. Changes save automatically.</p>
      <div id="accordion-container" class="space-y-2"></div>
    </div>
    <div class="wizard-nav">
      <button id="step3-back" class="btn btn-ghost" aria-label="Go back">${icon("arrowLeft", 14)} Back</button>
      <button id="step3-next" class="btn btn-primary">Next ${icon("chevronRight", 14)}</button>
    </div>`;

  const storyForm = document.getElementById("story-form");

  function showStoryForm() { storyForm.classList.remove("hidden"); document.getElementById("story-name").focus(); }
  function hideStoryForm() {
    storyForm.classList.add("hidden");
    document.getElementById("story-name").value = "";
    document.getElementById("story-desc").value = "";
    document.getElementById("story-ac").value = "";
  }

  document.getElementById("add-story-btn").addEventListener("click", () => {
    if (storyForm.classList.contains("hidden")) showStoryForm();
    else hideStoryForm();
  });
  document.getElementById("cancel-story-btn").addEventListener("click", hideStoryForm);
  document.getElementById("save-story-btn").addEventListener("click", async () => {
    const name = document.getElementById("story-name").value.trim();
    const description = document.getElementById("story-desc").value.trim();
    const acceptance = document.getElementById("story-ac").value.trim();
    if (!name) { showToast("Story name is required"); return; }
    try {
      await api.createStory(state.roundName, state.version, { name, description, acceptance });
      state.stories.push({ name, description, acceptance });
      state.pendingExpandIndex = state.stories.length - 1;
      state.save();
      state.setDirty(true);
      state.render();
      requestAnimationFrame(() => {
        document.getElementById("file-mapping-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (e) { showToast("Failed to save story: " + e.message); }
  });

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

  // Provider fetch UI
  const providerFetchArea = document.createElement("div");
  providerFetchArea.id = "provider-fetch-area";
  providerFetchArea.classList.add("hidden", "provider-fetch-bar");
  providerFetchArea.innerHTML = `
    <input id="provider-key-input" placeholder="e.g. PROJ-123">
    <button id="provider-fetch-btn" class="btn btn-sm">${icon("download", 14)} Fetch</button>
  `;
  document.getElementById("story-collection").insertBefore(
    providerFetchArea,
    storyForm
  );

  sourceSelect.addEventListener("change", () => {
    const isProvider = sourceSelect.value !== "manual";
    providerFetchArea.classList.toggle("hidden", !isProvider);
    hideStoryForm();
  });

  document.getElementById("provider-fetch-btn").addEventListener("click", async () => {
    const key = document.getElementById("provider-key-input").value.trim();
    if (!key) { showToast("Enter an issue key"); return; }
    const fetchBtn = document.getElementById("provider-fetch-btn");
    fetchBtn.disabled = true;
    fetchBtn.innerHTML = `<span class="spinner spinner-sm"></span> Fetching...`;
    try {
      const results = await api.fetchFromProvider(sourceSelect.value, [key]);
      if (!results || results.length === 0) { showToast("No data returned"); return; }
      const story = results[0];
      document.getElementById("story-name").value = story.name || "";
      document.getElementById("story-desc").value = story.description || "";
      document.getElementById("story-ac").value = story.acceptance || "";
      providerFetchArea.classList.add("hidden");
      sourceSelect.value = "manual";
      showStoryForm();
    } catch (e) {
      showToast("Fetch failed: " + e.message);
    } finally {
      fetchBtn.disabled = false;
      fetchBtn.innerHTML = `${icon("download", 14)} Fetch`;
    }
  });

  document.getElementById("step3-back").addEventListener("click", () => { state.goBack(2, "step3-back"); });
  document.getElementById("step3-next").addEventListener("click", () => { state.step = 4; state.save(); state.render(); });

  if (state.stories.length > 0) loadAccordionFileTree();

  async function loadAccordionFileTree() {
    const container = document.getElementById("accordion-container");
    if (!container) return;
    container.innerHTML = `<span class="text-sm text-muted">Loading files...</span>`;
    try {
      const tasks = await api.getTasks(state.roundName, state.version);
      const files = tasks.filter(t => t.type === "code").map(t => t.name);
      if (files.length === 0) {
        container.innerHTML = `<span class="text-sm text-muted">No files found. Confirm scope first.</span>`;
        return;
      }

      const fileTreeInstances = {};
      let expandedIndex = -1;

      container.innerHTML = state.stories.map((story, i) => {
        const existing = state.storyMappings.find(m => m.storyName === story.name);
        const count = existing?.files?.length || 0;
        const descPreview = story.description ? escapeHtml(story.description.length > 60 ? story.description.slice(0, 60) + "..." : story.description) : "";
        return `
          <div class="accordion-item" data-story-index="${i}">
            <div class="accordion-header" data-index="${i}">
              ${icon("clipboard", 14)}
              <div class="accordion-title">
                <span class="text-sm font-medium">${escapeHtml(story.name || story.id)}</span>
                ${descPreview ? `<span class="accordion-subtitle">${descPreview}</span>` : ""}
              </div>
              <span class="accordion-badge ${count > 0 ? "has-files" : ""}">${count}</span>
              <div class="accordion-actions">
                <button class="btn btn-ghost btn-sm story-edit-btn" data-story-index="${i}" style="padding:2px 6px;color:var(--text-muted)" title="Edit story">${icon("pencil", 12)}</button>
                <button class="btn btn-ghost btn-sm story-delete-btn" data-story-name="${escapeHtml(story.name)}" style="padding:2px 6px;color:var(--text-muted)" title="Delete story">${icon("x", 12)}</button>
              </div>
              <span class="accordion-chevron">${icon("chevronDown", 14)}</span>
            </div>
            <div class="accordion-body" id="accordion-body-${i}">
              <div id="story-edit-form-${i}" class="story-edit-form hidden">
                <div class="story-edit-field">
                  <label class="text-xs text-muted">Description</label>
                  <textarea id="edit-desc-${i}" class="mt-1" rows="2">${escapeHtml(story.description || "")}</textarea>
                </div>
                <div class="story-edit-field">
                  <label class="text-xs text-muted">Acceptance Criteria</label>
                  <textarea id="edit-ac-${i}" class="mt-1" rows="2">${escapeHtml(story.acceptance || "")}</textarea>
                </div>
                <div class="flex gap-2 mt-2">
                  <button class="btn btn-primary btn-sm story-save-edit-btn" data-story-index="${i}">Save</button>
                  <button class="btn btn-ghost btn-sm story-cancel-edit-btn" data-story-index="${i}">Cancel</button>
                </div>
              </div>
              <div id="accordion-filetree-${i}"></div>
            </div>
          </div>`;
      }).join("");

      let syncing = false;
      function syncMappingsToServer() {
        if (syncing) return;
        syncing = true;
        api.mapStories(state.roundName, state.version, state.stories.map(s => ({
          storyName: s.name,
          files: (state.storyMappings.find(m => m.storyName === s.name)?.files || []),
        }))).catch(e => showToast("Failed to save mapping: " + e.message))
          .finally(() => { syncing = false; });
      }

      // Sync existing mappings to server after re-render
      if (state.storyMappings.some(m => m.files?.length > 0)) {
        syncMappingsToServer();
      }

      if (state.pendingExpandIndex >= 0 && state.pendingExpandIndex < state.stories.length) {
        expandedIndex = state.pendingExpandIndex;
        state.pendingExpandIndex = -1;
        const item = container.querySelector(`[data-story-index="${expandedIndex}"]`);
        if (item) item.classList.add("expanded");
      }

      function expandItem(idx) {
        if (expandedIndex >= 0 && expandedIndex !== idx) {
          const prev = container.querySelector(`[data-story-index="${expandedIndex}"]`);
          if (prev) prev.classList.remove("expanded");
        }
        expandedIndex = idx;
        const item = container.querySelector(`[data-story-index="${idx}"]`);
        item.classList.add("expanded");
        loadFileTree(idx);
      }

      function collapseItem(idx) {
        const item = container.querySelector(`[data-story-index="${idx}"]`);
        if (item) item.classList.remove("expanded");
        if (expandedIndex === idx) expandedIndex = -1;
      }

      // Load file tree for a given index into its dedicated container
      function loadFileTree(idx) {
        const treeContainer = document.getElementById(`accordion-filetree-${idx}`);
        if (!treeContainer || fileTreeInstances[idx]) return;
        const story = state.stories[idx];
        const existing = state.storyMappings.find(m => m.storyName === story.name);
        const tree = renderFileTree(treeContainer, files);
        fileTreeInstances[idx] = tree;
        if (existing?.files?.length) {
          queueMicrotask(() => { tree.setSelected(existing.files); });
        }

        treeContainer.addEventListener("change", () => {
          const selected = tree.getSelected();
          const mappingIdx = state.storyMappings.findIndex(m => m.storyName === story.name);
          if (mappingIdx >= 0) state.storyMappings[mappingIdx].files = selected;
          else state.storyMappings.push({ storyName: story.name, files: selected });
          state.save();

          const item = container.querySelector(`[data-story-index="${idx}"]`);
          const badge = item?.querySelector(".accordion-badge");
          if (badge) {
            badge.textContent = selected.length;
            badge.classList.toggle("has-files", selected.length > 0);
          }
          syncMappingsToServer();
        });
      }

      // Load file tree for pre-expanded item
      if (expandedIndex >= 0) {
        loadFileTree(expandedIndex);
      }

      container.querySelectorAll(".accordion-header").forEach(header => {
        header.addEventListener("click", () => {
          const idx = parseInt(header.dataset.index);
          if (expandedIndex === idx) {
            collapseItem(idx);
          } else {
            expandItem(idx);
          }
        });
      });

      // Wire up edit buttons — auto-expand if collapsed
      container.querySelectorAll(".story-edit-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const idx = parseInt(btn.dataset.storyIndex);
          // Auto-expand if not already expanded
          if (expandedIndex !== idx) expandItem(idx);
          const form = document.getElementById(`story-edit-form-${idx}`);
          form.classList.toggle("hidden");
          if (!form.classList.contains("hidden")) {
            document.getElementById(`edit-desc-${idx}`).focus();
          }
        });
      });

      // Wire up save edit buttons
      container.querySelectorAll(".story-save-edit-btn").forEach(btn => {
        btn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const idx = parseInt(btn.dataset.storyIndex);
          const story = state.stories[idx];
          const description = document.getElementById(`edit-desc-${idx}`).value.trim();
          const acceptance = document.getElementById(`edit-ac-${idx}`).value.trim();
          const saveBtn = btn;
          const origHTML = saveBtn.innerHTML;
          try {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<span class="spinner spinner-sm"></span>';
            const safeName = story.name.replace(/[^a-zA-Z0-9\-_.]/g, "-");
            await api.updateStory(state.roundName, state.version, safeName, { description, acceptance });
            state.stories[idx].description = description;
            state.stories[idx].acceptance = acceptance;
            state.save();
            document.getElementById(`story-edit-form-${idx}`).classList.add("hidden");
            showToast("Story updated", "success");
            // Re-render accordion to update description preview
            loadAccordionFileTree();
          } catch (err) {
            showToast("Failed to update story: " + err.message);
          } finally {
            saveBtn.disabled = false;
            saveBtn.innerHTML = origHTML;
          }
        });
      });

      // Wire up cancel edit buttons
      container.querySelectorAll(".story-cancel-edit-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const idx = parseInt(btn.dataset.storyIndex);
          document.getElementById(`story-edit-form-${idx}`).classList.add("hidden");
          const story = state.stories[idx];
          document.getElementById(`edit-desc-${idx}`).value = story.description || "";
          document.getElementById(`edit-ac-${idx}`).value = story.acceptance || "";
        });
      });

      // Wire up delete buttons — two-click confirmation pattern
      container.querySelectorAll(".story-delete-btn").forEach(btn => {
        btn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const name = btn.dataset.storyName;
          if (btn.dataset.confirmPending === "true") {
            if (btn._confirmTimer) clearTimeout(btn._confirmTimer);
            try {
              const safeName = name.replace(/[^a-zA-Z0-9\-_.]/g, "-");
              await api.deleteStory(state.roundName, state.version, safeName);
              state.stories = state.stories.filter(s => s.name !== name);
              state.storyMappings = state.storyMappings.filter(m => m.storyName !== name);
              state.save();
              loadAccordionFileTree();
            } catch (err) { showToast("Failed to delete story: " + err.message); }
          } else {
            btn.dataset.confirmPending = "true";
            btn.style.color = "var(--danger)";
            btn.style.borderColor = "var(--danger)";
            btn.innerHTML = `${icon("x", 12)} Sure?`;
            btn._confirmTimer = setTimeout(() => {
              btn.dataset.confirmPending = "";
              btn.style.color = "";
              btn.style.borderColor = "";
              btn.innerHTML = `${icon("x", 12)}`;
            }, 3000);
          }
        });
      });
    } catch (e) {
      container.innerHTML = `<span class="text-sm text-danger">Failed to load files: ${escapeHtml(e.message)}</span>`;
    }
  }
}
