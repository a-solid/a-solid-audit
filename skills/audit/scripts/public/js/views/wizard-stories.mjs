// skills/audit/scripts/public/js/views/wizard-stories.mjs
import { api } from "../api.mjs";
import { showToast, icon, escapeHtml } from "../app.mjs";
import { renderFileTree } from "../components/file-tree.mjs";

export function renderStoriesStep(content, state) {
  content.innerHTML = `
    <div class="card mb-4">
      <h2 class="font-semibold mb-4">Story Collection</h2>
      <div id="story-collection">
        <div class="mb-3">
          <label for="story-source">Add Story</label>
          <div class="flex gap-2 mt-1">
            <select id="story-source">
              <option value="manual">Manual Input</option>
            </select>
            <button id="add-story-btn" class="btn">${icon("plus", 14)} Add Story</button>
          </div>
        </div>
        <div id="story-form" class="hidden mt-3 card">
          <label for="story-name" class="sr-only">Story name</label>
          <input id="story-name" class="mb-2" placeholder="Story name">
          <label for="story-desc" class="sr-only">Description</label>
          <textarea id="story-desc" class="mb-2" rows="2" placeholder="Description"></textarea>
          <label for="story-ac" class="sr-only">Acceptance criteria</label>
          <textarea id="story-ac" class="mb-2" rows="2" placeholder="Acceptance criteria"></textarea>
          <button id="save-story-btn" class="btn btn-primary btn-sm">Save</button>
        </div>
      </div>
    </div>
    <div id="file-mapping-section" class="card mb-4 ${state.stories.length === 0 ? "hidden" : ""}">
      <h2 class="font-semibold mb-4">File Mapping</h2>
      <p class="text-sm text-secondary mb-3">Click a story to expand, then check files to associate. Changes save automatically.</p>
      <div id="accordion-container" class="space-y-2"></div>
    </div>
    <div class="flex justify-between">
      <button id="step3-back" class="btn btn-ghost" aria-label="Go back">${icon("arrowLeft", 14)} Back</button>
      <button id="step3-next" class="btn btn-primary">Next ${icon("chevronRight", 14)}</button>
    </div>`;

  document.getElementById("add-story-btn").addEventListener("click", () => {
    document.getElementById("story-form").classList.toggle("hidden");
  });
  document.getElementById("save-story-btn").addEventListener("click", async () => {
    const name = document.getElementById("story-name").value.trim();
    const description = document.getElementById("story-desc").value.trim();
    const acceptance = document.getElementById("story-ac").value.trim();
    if (!name) { showToast("Story name is required"); return; }
    try {
      await api.createStory(state.sessionId, { name, description, acceptance });
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
  providerFetchArea.classList.add("hidden", "mt-2");
  providerFetchArea.innerHTML = `
    <div class="flex gap-2">
      <input id="provider-key-input" placeholder="e.g. PROJ-123">
      <button id="provider-fetch-btn" class="btn btn-sm">${icon("download", 14)} Fetch</button>
    </div>
  `;
  document.getElementById("story-collection").insertBefore(
    providerFetchArea,
    document.getElementById("story-form")
  );

  sourceSelect.addEventListener("change", () => {
    const isProvider = sourceSelect.value !== "manual";
    providerFetchArea.classList.toggle("hidden", !isProvider);
    document.getElementById("story-form").classList.add("hidden");
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
      document.getElementById("story-form").classList.remove("hidden");
      providerFetchArea.classList.add("hidden");
      sourceSelect.value = "manual";
    } catch (e) {
      showToast("Fetch failed: " + e.message);
    } finally {
      fetchBtn.disabled = false;
      fetchBtn.innerHTML = `${icon("download", 14)} Fetch`;
    }
  });

  document.getElementById("step3-back").addEventListener("click", () => { state.goBack(2, "step3-back"); });
  document.getElementById("step3-next").addEventListener("click", () => { state.step = 4; state.save(); state.render(); });

  if (state.stories.length > 0) loadAccordionFileTree(state.sessionId);

  async function loadAccordionFileTree(sid) {
    const container = document.getElementById("accordion-container");
    if (!container) return;
    container.innerHTML = `<span class="text-sm text-muted">Loading files...</span>`;
    try {
      const tasks = await api.getTasks(sid);
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
        return `
          <div class="accordion-item" data-story-index="${i}">
            <div class="accordion-header" data-index="${i}">
              ${icon("clipboard", 14)}
              <span class="text-sm font-medium" style="flex-grow:1">${escapeHtml(story.name || story.id)}</span>
              <span class="accordion-badge ${count > 0 ? "has-files" : ""}">${count}</span>
              <button class="btn btn-ghost btn-sm story-delete-btn" data-story-name="${escapeHtml(story.name)}" style="margin-left:auto;padding:2px 6px;color:var(--text-muted)" title="Delete story">${icon("x", 12)}</button>
              <span class="accordion-chevron">${icon("chevronDown", 14)}</span>
            </div>
            <div class="accordion-body" id="accordion-body-${i}"></div>
          </div>`;
      }).join("");

      let syncing = false;
      function syncMappingsToServer() {
        if (syncing) return;
        syncing = true;
        api.mapStories(sid, state.stories.map(s => ({
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

      // Load file tree for pre-expanded item
      if (expandedIndex >= 0) {
        const body = document.getElementById(`accordion-body-${expandedIndex}`);
        const story = state.stories[expandedIndex];
        const existing = state.storyMappings.find(m => m.storyName === story.name);
        const tree = renderFileTree(body, files);
        fileTreeInstances[expandedIndex] = tree;
        if (existing?.files?.length) {
          queueMicrotask(() => { tree.setSelected(existing.files); });
        }
        body.addEventListener("change", () => {
          const selected = tree.getSelected();
          const mappingIdx = state.storyMappings.findIndex(m => m.storyName === story.name);
          if (mappingIdx >= 0) state.storyMappings[mappingIdx].files = selected;
          else state.storyMappings.push({ storyName: story.name, files: selected });
          state.save();
          const item = container.querySelector(`[data-story-index="${expandedIndex}"]`);
          const badge = item?.querySelector(".accordion-badge");
          if (badge) {
            badge.textContent = selected.length;
            badge.classList.toggle("has-files", selected.length > 0);
          }
          syncMappingsToServer();
        });
      }

      container.querySelectorAll(".accordion-header").forEach(header => {
        header.addEventListener("click", () => {
          const idx = parseInt(header.dataset.index);
          if (expandedIndex === idx) {
            const item = container.querySelector(`[data-story-index="${idx}"]`);
            item.classList.remove("expanded");
            expandedIndex = -1;
            return;
          }
          if (expandedIndex >= 0) {
            const prev = container.querySelector(`[data-story-index="${expandedIndex}"]`);
            if (prev) prev.classList.remove("expanded");
          }
          expandedIndex = idx;
          const item = container.querySelector(`[data-story-index="${idx}"]`);
          item.classList.add("expanded");

          if (!fileTreeInstances[idx]) {
            const body = document.getElementById(`accordion-body-${idx}`);
            const story = state.stories[idx];
            const existing = state.storyMappings.find(m => m.storyName === story.name);
            const tree = renderFileTree(body, files);
            fileTreeInstances[idx] = tree;
            // Restore selection after a microtask to avoid triggering change events during init
            if (existing?.files?.length) {
              queueMicrotask(() => { tree.setSelected(existing.files); });
            }

            body.addEventListener("change", () => {
              const selected = tree.getSelected();
              const mappingIdx = state.storyMappings.findIndex(m => m.storyName === story.name);
              if (mappingIdx >= 0) state.storyMappings[mappingIdx].files = selected;
              else state.storyMappings.push({ storyName: story.name, files: selected });
              state.save();

              const badge = item.querySelector(".accordion-badge");
              badge.textContent = selected.length;
              badge.classList.toggle("has-files", selected.length > 0);

              syncMappingsToServer();
            });
          }
        });
      });

      // Wire up delete buttons — two-click confirmation pattern
      container.querySelectorAll(".story-delete-btn").forEach(btn => {
        btn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const name = btn.dataset.storyName;
          if (btn.dataset.confirmPending === "true") {
            // Second click — perform delete
            if (btn._confirmTimer) clearTimeout(btn._confirmTimer);
            try {
              const safeName = name.replace(/[^a-zA-Z0-9\-_.]/g, "-");
              await api.deleteStory(sid, safeName);
              state.stories = state.stories.filter(s => s.name !== name);
              state.storyMappings = state.storyMappings.filter(m => m.storyName !== name);
              state.save();
              loadAccordionFileTree(sid);
            } catch (err) { showToast("Failed to delete story: " + err.message); }
          } else {
            // First click — show confirmation
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
