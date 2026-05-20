// skills/audit/scripts/public/js/views/wizard.mjs
import { api } from "../api.mjs";
import { showToast, setBreadcrumb, icon, escapeHtml } from "../app.mjs";
import { renderFileTree } from "../components/file-tree.mjs";

export async function renderWizard(container, params) {
  const sessionId = params[0];
  let step = 1;
  let reviewType = "code";
  let scopeMethod = "uncommitted";
  let scopeRef = "";
  let stories = [];
  let storyMappings = [];
  let contextExpanded = false;

  const savedKey = `audit-wizard-${sessionId}`;
  const saved = localStorage.getItem(savedKey);
  if (saved) {
    const state = JSON.parse(saved);
    step = state.step || 1;
    reviewType = state.reviewType || "code";
    scopeMethod = state.scopeMethod || "uncommitted";
    scopeRef = state.scopeRef || "";
    stories = state.stories || [];
    storyMappings = state.storyMappings || [];
    contextExpanded = state.contextExpanded || false;
  }

  function save() {
    localStorage.setItem(savedKey, JSON.stringify({
      step, reviewType, scopeMethod, scopeRef, stories, storyMappings, contextExpanded,
    }));
  }

  function render() {
    setBreadcrumb([
      { label: "Sessions", href: "#/home" },
      { label: "New Audit" },
    ]);

    const totalSteps = reviewType === "all" ? 4 : 3;
    const stepLabels = reviewType === "all"
      ? ["Review Type", "Scope", "Stories", "Ready"]
      : ["Review Type", "Scope", "Ready"];

    container.innerHTML = `
      <h1 class="text-2xl mb-6">New Audit</h1>
      <div class="steps">
        <div class="step-dots">
          ${stepLabels.map((label, i) => {
            const num = i + 1;
            const isActive = step === num;
            const isDone = step > num;
            const isLast = i === stepLabels.length - 1;
            return `
              <div class="step-dot ${isActive ? "active" : ""} ${isDone ? "done" : ""}">
                ${isDone ? icon("check", 14) : num}
              </div>
              ${!isLast ? `<div class="step-line ${isDone ? "done" : ""}"></div>` : ""}
            `;
          }).join("")}
        </div>
        <div class="step-labels">
          ${stepLabels.map((label, i) => {
            const num = i + 1;
            const isActive = step === num;
            const isDone = step > num;
            return `<span class="step-label ${isActive ? "active" : ""} ${isDone ? "done" : ""}" style="flex:1">${label}</span>`;
          }).join("")}
        </div>
      </div>
      <div id="wizard-content"></div>
    `;

    const actualStep = reviewType === "code" && step === 4 ? 3 : step;
    if (actualStep === 1) renderStep1();
    else if (actualStep === 2) renderStep2();
    else if (actualStep === 3 && reviewType === "all") renderStep3();
    else renderStep4();
  }

  function renderStep1() {
    const content = document.getElementById("wizard-content");
    content.innerHTML = `
      <div class="card mb-4">
        <h2 class="font-semibold mb-4">Choose Review Type</h2>
        <div class="grid grid-cols-2 gap-4">
          <div class="card card-clickable ${reviewType === "code" ? "selected" : ""}" data-type="code"
               style="${reviewType === "code" ? "border-color:var(--accent);background:var(--accent-dim);box-shadow:inset 0 0 0 1px var(--border-accent)" : ""}">
            <div class="flex items-center gap-2 mb-2">
              ${icon("eye", 20)}
              <span class="font-medium">Code Review Only</span>
            </div>
            <div class="text-sm text-secondary">Review code changes for quality, security, and best practices.</div>
          </div>
          <div class="card card-clickable ${reviewType === "all" ? "selected" : ""}" data-type="all"
               style="${reviewType === "all" ? "border-color:var(--accent);background:var(--accent-dim);box-shadow:inset 0 0 0 1px var(--border-accent)" : ""}">
            <div class="flex items-center gap-2 mb-2">
              ${icon("clipboard", 20)}
              <span class="font-medium">Code + Story Alignment</span>
            </div>
            <div class="text-sm text-secondary">Also check that code changes align with story requirements.</div>
          </div>
        </div>
      </div>
      <div class="flex justify-end">
        <button id="step1-next" class="btn btn-primary">Next ${icon("chevronRight", 14)}</button>
      </div>`;

    content.querySelectorAll("[data-type]").forEach(card => {
      card.addEventListener("click", () => {
        reviewType = card.dataset.type;
        save();
        render();
      });
    });
    document.getElementById("step1-next").addEventListener("click", () => { step = 2; save(); render(); });
  }

  function renderStep2() {
    const content = document.getElementById("wizard-content");
    content.innerHTML = `
      <div class="card mb-4">
        <h2 class="font-semibold mb-4">Select Scope</h2>
        <div class="tabs" id="scope-tabs">
          <div class="tab ${scopeMethod === "uncommitted" ? "active" : ""}" data-method="uncommitted">Uncommitted</div>
          <div class="tab ${scopeMethod === "commits" ? "active" : ""}" data-method="commits">Commits</div>
          <div class="tab ${scopeMethod === "branch" ? "active" : ""}" data-method="branch">Branch</div>
        </div>
        <div id="scope-content" class="mt-4"></div>
      </div>
      <div class="flex justify-between">
        <button id="step2-back" class="btn btn-ghost">${icon("arrowLeft", 14)} Back</button>
        <button id="step2-confirm" class="btn btn-primary">Confirm Scope</button>
      </div>`;

    renderScopeContent();

    document.getElementById("scope-tabs").querySelectorAll(".tab").forEach(tab => {
      tab.addEventListener("click", () => {
        scopeMethod = tab.dataset.method;
        scopeRef = "";
        save();
        render();
      });
    });
    document.getElementById("step2-back").addEventListener("click", () => { step = 1; save(); render(); });
    document.getElementById("step2-confirm").addEventListener("click", async () => {
      try {
        const btn = document.getElementById("step2-confirm");
        btn.disabled = true;
        btn.innerHTML = `<span class="spinner spinner-sm"></span> Generating...`;
        await api.setScope(sessionId, scopeMethod, scopeRef);
        step = reviewType === "code" ? 3 : 3;
        save();
        render();
      } catch (e) {
        showToast("Failed to set scope: " + e.message);
        const btn = document.getElementById("step2-confirm");
        if (btn) { btn.disabled = false; btn.textContent = "Confirm Scope"; }
      }
    });
  }

  async function renderScopeContent() {
    const scopeContent = document.getElementById("scope-content");
    if (!scopeContent) return;

    if (scopeMethod === "uncommitted") {
      scopeContent.innerHTML = `
        <div class="info-banner info-banner-blue">
          ${icon("gitBranch", 16)}
          <span>Review uncommitted changes in the working directory (including staged changes).</span>
        </div>`;
    } else if (scopeMethod === "commits") {
      try {
        const commits = await api.getCommits();
        scopeContent.innerHTML = `
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label>From</label>
              <select id="commit-from" class="mt-1">
                ${commits.map(c => `<option value="${c.hash}">${c.hash.slice(0, 7)} ${escapeHtml(c.message)} (${c.date?.slice(0, 10)})</option>`).join("")}
              </select>
            </div>
            <div>
              <label>To</label>
              <select id="commit-to" class="mt-1">
                ${commits.map((c, i) => `<option value="${c.hash}" ${i === 0 ? "selected" : ""}>${c.hash.slice(0, 7)} ${escapeHtml(c.message)} (${c.date?.slice(0, 10)})</option>`).join("")}
              </select>
            </div>
          </div>`;
        document.getElementById("commit-from").addEventListener("change", updateCommitRef);
        document.getElementById("commit-to").addEventListener("change", updateCommitRef);
        function updateCommitRef() {
          scopeRef = document.getElementById("commit-from").value + " " + document.getElementById("commit-to").value;
          save();
        }
        updateCommitRef();
      } catch (e) {
        scopeContent.innerHTML = `<p class="text-danger text-sm">${icon("alertTriangle", 14)} Failed to load commits: ${escapeHtml(e.message)}</p>`;
      }
    } else if (scopeMethod === "branch") {
      try {
        const branches = await api.getBranches();
        scopeContent.innerHTML = `
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label>Base</label>
              <select id="branch-base" class="mt-1">
                ${branches.map(b => `<option value="${b}" ${b === "main" || b === "master" ? "selected" : ""}>${escapeHtml(b)}</option>`).join("")}
              </select>
            </div>
            <div>
              <label>Compare</label>
              <select id="branch-compare" class="mt-1">
                ${branches.map(b => `<option value="${b}">${escapeHtml(b)}</option>`).join("")}
              </select>
            </div>
          </div>`;
        document.getElementById("branch-base").addEventListener("change", updateBranchRef);
        document.getElementById("branch-compare").addEventListener("change", updateBranchRef);
        function updateBranchRef() {
          scopeRef = document.getElementById("branch-base").value + "..." + document.getElementById("branch-compare").value;
          save();
        }
        updateBranchRef();
      } catch (e) {
        scopeContent.innerHTML = `<p class="text-danger text-sm">${icon("alertTriangle", 14)} Failed to load branches: ${escapeHtml(e.message)}</p>`;
      }
    }
  }

  function renderStep3() {
    const content = document.getElementById("wizard-content");
    content.innerHTML = `
      <div class="card mb-4">
        <h2 class="font-semibold mb-4">Story Collection</h2>
        <div id="story-collection">
          <div class="mb-3">
            <label>Add Story</label>
            <div class="flex gap-2 mt-1">
              <select id="story-source">
                <option value="manual">Manual Input</option>
              </select>
              <button id="add-story-btn" class="btn">${icon("plus", 14)} Add Story</button>
            </div>
          </div>
          <div id="story-form" class="hidden mt-3 card">
            <input id="story-name" class="mb-2" placeholder="Story name">
            <textarea id="story-desc" class="mb-2" rows="2" placeholder="Description"></textarea>
            <textarea id="story-ac" class="mb-2" rows="2" placeholder="Acceptance criteria"></textarea>
            <button id="save-story-btn" class="btn btn-primary btn-sm">Save</button>
          </div>
        </div>
      </div>
      <div id="file-mapping-section" class="card mb-4 ${stories.length === 0 ? "hidden" : ""}">
        <h2 class="font-semibold mb-4">File Mapping</h2>
        <p class="text-sm text-secondary mb-3">Click a story to expand, then check files to associate. Changes save automatically.</p>
        <div id="accordion-container" class="space-y-2"></div>
      </div>
      <div class="flex justify-between">
        <button id="step3-back" class="btn btn-ghost">${icon("arrowLeft", 14)} Back</button>
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
        await api.createStory(sessionId, { name, description, acceptance });
        stories.push({ name, description, acceptance });
        save();
        render();
      } catch (e) { showToast("Failed to save story: " + e.message); }
    });

    document.getElementById("step3-back").addEventListener("click", () => { step = 2; save(); render(); });
    document.getElementById("step3-next").addEventListener("click", () => { step = 4; save(); render(); });

    if (stories.length > 0) loadAccordionFileTree(sessionId);
  }

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

      container.innerHTML = stories.map((story, i) => {
        const existing = storyMappings.find(m => m.storyName === story.name);
        const count = existing?.files?.length || 0;
        return `
          <div class="accordion-item" data-story-index="${i}">
            <div class="accordion-header" data-index="${i}">
              ${icon("clipboard", 14)}
              <span class="text-sm font-medium">${escapeHtml(story.name || story.id)}</span>
              <span class="accordion-badge ${count > 0 ? "has-files" : ""}">${count}</span>
              <span class="accordion-chevron">${icon("chevronDown", 14)}</span>
            </div>
            <div class="accordion-body" id="accordion-body-${i}"></div>
          </div>`;
      }).join("");

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
            const story = stories[idx];
            const existing = storyMappings.find(m => m.storyName === story.name);
            const tree = renderFileTree(body, files);
            if (existing?.files?.length) tree.setSelected(existing.files);
            fileTreeInstances[idx] = tree;

            body.addEventListener("change", () => {
              const selected = tree.getSelected();
              const mappingIdx = storyMappings.findIndex(m => m.storyName === story.name);
              if (mappingIdx >= 0) storyMappings[mappingIdx].files = selected;
              else storyMappings.push({ storyName: story.name, files: selected });
              save();

              const badge = item.querySelector(".accordion-badge");
              badge.textContent = selected.length;
              badge.classList.toggle("has-files", selected.length > 0);

              api.mapStories(sid, stories.map(s => ({
                storyName: s.name,
                files: (storyMappings.find(m => m.storyName === s.name)?.files || []),
              }))).catch(e => showToast("Failed to save mapping: " + e.message));
            });
          }
        });
      });
    } catch (e) {
      container.innerHTML = `<span class="text-sm text-danger">Failed to load files: ${escapeHtml(e.message)}</span>`;
    }
  }

  function renderStep4() {
    const content = document.getElementById("wizard-content");
    content.innerHTML = `
      <div class="card mb-4">
        <h2 class="font-semibold mb-4">Ready to Start</h2>
        <div class="space-y-3">
          <div class="flex items-center gap-3">
            <span style="color:var(--text-muted)">${icon("eye", 18)}</span>
            <div>
              <div class="text-xs text-muted">Review Type</div>
              <div class="text-sm font-medium">${reviewType === "code" ? "Code Review Only" : "Code + Story Alignment"}</div>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <span style="color:var(--text-muted)">${icon("gitCommit", 18)}</span>
            <div>
              <div class="text-xs text-muted">Scope</div>
              <div class="text-sm font-medium">${scopeMethod}${scopeRef ? " " + scopeRef : ""}</div>
            </div>
          </div>
          ${reviewType === "all" ? `
          <div class="flex items-center gap-3">
            <span style="color:var(--text-muted)">${icon("clipboard", 18)}</span>
            <div>
              <div class="text-xs text-muted">Stories</div>
              <div class="text-sm font-medium">${stories.length} story(s)</div>
            </div>
          </div>` : ""}
        </div>

        <div class="mt-4 border-t" style="border-color:var(--border)">
          <div id="context-toggle" class="flex items-center gap-2 py-3 cursor-pointer" style="color:var(--text-secondary)">
            ${icon("messageSquare", 16)}
            <span class="text-sm font-medium">Review Context</span>
            <span class="text-xs text-muted ml-1">(optional)</span>
            <span id="context-chevron" class="ml-auto" style="transition:transform 200ms;transform:rotate(${contextExpanded ? "180" : "0"}deg)">${icon("chevronDown", 14)}</span>
          </div>
          <div id="context-panel" style="display:${contextExpanded ? "block" : "none"}">
            <textarea id="review-context-input" class="w-full" rows="4" placeholder="项目背景、关键需求、关注领域、已知问题..."></textarea>
            <div class="text-xs text-muted mt-1">This context is passed to AI reviewers as additional guidance.</div>
          </div>
        </div>

        <div class="mt-4 info-banner info-banner-amber">
          ${icon("zap", 16)}
          <span>AI review runs in the Claude Code terminal. Keep the terminal open.</span>
        </div>
      </div>
      <div class="flex justify-between">
        <button id="step4-back" class="btn btn-ghost">${icon("arrowLeft", 14)} Back</button>
        <button id="start-review-btn" class="btn btn-primary">
          ${icon("zap", 14)}
          Start AI Review
        </button>
      </div>`;

    // Load existing context
    api.getReviewContext(sessionId).then(data => {
      const input = document.getElementById("review-context-input");
      if (input && data.context) input.value = data.context;
    }).catch(() => {});

    // Toggle collapsible
    document.getElementById("context-toggle").addEventListener("click", () => {
      contextExpanded = !contextExpanded;
      const panel = document.getElementById("context-panel");
      const chevron = document.getElementById("context-chevron");
      panel.style.display = contextExpanded ? "block" : "none";
      chevron.style.transform = `rotate(${contextExpanded ? 180 : 0}deg)`;
      save();
    });

    // Save context on blur (debounced)
    let contextSaveTimer = null;
    const contextInput = document.getElementById("review-context-input");
    if (contextInput) {
      contextInput.addEventListener("blur", () => {
        clearTimeout(contextSaveTimer);
        contextSaveTimer = setTimeout(async () => {
          try {
            await api.setReviewContext(sessionId, contextInput.value);
          } catch (e) { /* silent fail — context is optional */ }
        }, 300);
      });
    }

    // Also save context right before starting review
    document.getElementById("step4-back").addEventListener("click", () => {
      step = reviewType === "code" ? 2 : 3;
      save();
      render();
    });
    document.getElementById("start-review-btn").addEventListener("click", async () => {
      // Save context before starting
      if (contextInput) {
        try { await api.setReviewContext(sessionId, contextInput.value); } catch (e) {}
      }
      try {
        const btn = document.getElementById("start-review-btn");
        btn.disabled = true;
        btn.innerHTML = `<span class="spinner spinner-sm"></span> Starting...`;
        await api.updateSessionStatus(sessionId, "ready");
        localStorage.removeItem(savedKey);
        location.hash = `#/progress/${sessionId}`;
      } catch (e) {
        showToast("Failed to start review: " + e.message);
        const btn = document.getElementById("start-review-btn");
        if (btn) { btn.disabled = false; btn.innerHTML = `${icon("zap", 14)} Start AI Review`; }
      }
    });
  }

  render();
}
