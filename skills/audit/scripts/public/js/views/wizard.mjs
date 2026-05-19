// skills/audit/scripts/public/js/views/wizard.mjs
import { api } from "../api.mjs";
import { renderStoryCard } from "../components/story-card.mjs";
import { renderFileTree } from "../components/file-tree.mjs";
import { showToast } from "../app.mjs";

export async function renderWizard(container, params) {
  const sessionId = params[0];
  let step = 1;
  let reviewType = "code"; // "code" or "all"
  let scopeMethod = "uncommitted";
  let scopeRef = "";
  let stories = [];
  let storyMappings = [];
  let diffFiles = [];

  // Restore from localStorage if available
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
  }

  function save() {
    localStorage.setItem(savedKey, JSON.stringify({
      step, reviewType, scopeMethod, scopeRef, stories, storyMappings,
    }));
  }

  function render() {
    container.innerHTML = `
      <h1 class="text-2xl font-bold text-gray-900 mb-6">New Audit</h1>
      <div class="steps mb-8">
        <div class="step ${step === 1 ? 'active' : step > 1 ? 'done' : ''}">1. Review Type</div>
        <div class="step ${step === 2 ? 'active' : step > 2 ? 'done' : ''}">2. Scope</div>
        <div class="step ${step === 3 ? 'active' : step > 3 ? 'done' : ''} ${reviewType === 'code' ? 'hidden' : ''}">3. Stories</div>
        <div class="step ${step === 4 ? 'active' : ''}">4. Ready</div>
      </div>
      <div id="wizard-content"></div>
    `;

    if (step === 1) renderStep1();
    else if (step === 2) renderStep2();
    else if (step === 3) renderStep3();
    else if (step === 4) renderStep4();
  }

  function renderStep1() {
    const content = document.getElementById("wizard-content");
    content.innerHTML = `
      <div class="card mb-4">
        <h2 class="font-semibold text-gray-900 mb-4">Choose Review Type</h2>
        <div class="grid grid-cols-2 gap-4">
          <div class="card cursor-pointer ${reviewType === 'code' ? 'border-blue-500 bg-blue-50' : ''}" data-type="code">
            <div class="font-medium">Code Review Only</div>
            <div class="text-sm text-gray-500 mt-1">Review code changes for quality, security, and best practices.</div>
          </div>
          <div class="card cursor-pointer ${reviewType === 'all' ? 'border-blue-500 bg-blue-50' : ''}" data-type="all">
            <div class="font-medium">Code + Story Alignment</div>
            <div class="text-sm text-gray-500 mt-1">Also check that code changes align with story requirements.</div>
          </div>
        </div>
      </div>
      <div class="flex justify-end">
        <button id="step1-next" class="btn btn-primary">Next</button>
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
        <h2 class="font-semibold text-gray-900 mb-4">Select Scope</h2>
        <div class="tabs" id="scope-tabs">
          <div class="tab ${scopeMethod === 'uncommitted' ? 'active' : ''}" data-method="uncommitted">Uncommitted</div>
          <div class="tab ${scopeMethod === 'commits' ? 'active' : ''}" data-method="commits">Commits</div>
          <div class="tab ${scopeMethod === 'branch' ? 'active' : ''}" data-method="branch">Branch</div>
        </div>
        <div id="scope-content"></div>
      </div>
      <div class="flex justify-between">
        <button id="step2-back" class="btn">Back</button>
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
        btn.textContent = "Generating...";
        await api.setScope(sessionId, scopeMethod, scopeRef);
        if (reviewType === "code") step = 4;
        else step = 3;
        save();
        render();
      } catch (e) {
        showToast("Failed to set scope: " + e.message);
        document.getElementById("step2-confirm").disabled = false;
        document.getElementById("step2-confirm").textContent = "Confirm Scope";
      }
    });
  }

  async function renderScopeContent() {
    const scopeContent = document.getElementById("scope-content");
    if (scopeMethod === "uncommitted") {
      scopeContent.innerHTML = `<p class="text-sm text-gray-500">Review uncommitted changes in the working directory (including staged changes).</p>`;
    } else if (scopeMethod === "commits") {
      try {
        const commits = await api.getCommits();
        scopeContent.innerHTML = `
          <div class="grid grid-cols-2 gap-4 mt-2">
            <div><label class="text-sm font-medium">From</label>
              <select id="commit-from" class="w-full mt-1 border rounded p-2 text-sm">${commits.map(c => `<option value="${c.hash}">${c.hash.slice(0,7)} ${c.message} (${c.date?.slice(0,10)})</option>`).join("")}</select></div>
            <div><label class="text-sm font-medium">To</label>
              <select id="commit-to" class="w-full mt-1 border rounded p-2 text-sm">${commits.map((c, i) => `<option value="${c.hash}" ${i === 0 ? 'selected' : ''}>${c.hash.slice(0,7)} ${c.message} (${c.date?.slice(0,10)})</option>`).join("")}</select></div>
          </div>`;
        document.getElementById("commit-from").addEventListener("change", updateCommitRef);
        document.getElementById("commit-to").addEventListener("change", updateCommitRef);
        function updateCommitRef() {
          scopeRef = document.getElementById("commit-from").value + " " + document.getElementById("commit-to").value;
          save();
        }
        updateCommitRef();
      } catch (e) {
        scopeContent.innerHTML = `<p class="text-red-600 text-sm">Failed to load commits: ${e.message}</p>`;
      }
    } else if (scopeMethod === "branch") {
      try {
        const branches = await api.getBranches();
        scopeContent.innerHTML = `
          <div class="grid grid-cols-2 gap-4 mt-2">
            <div><label class="text-sm font-medium">Base</label>
              <select id="branch-base" class="w-full mt-1 border rounded p-2 text-sm">${branches.map(b => `<option value="${b}" ${b === 'main' || b === 'master' ? 'selected' : ''}>${b}</option>`).join("")}</select></div>
            <div><label class="text-sm font-medium">Compare</label>
              <select id="branch-compare" class="w-full mt-1 border rounded p-2 text-sm">${branches.map(b => `<option value="${b}">${b}</option>`).join("")}</select></div>
          </div>`;
        document.getElementById("branch-base").addEventListener("change", updateBranchRef);
        document.getElementById("branch-compare").addEventListener("change", updateBranchRef);
        function updateBranchRef() {
          const base = document.getElementById("branch-base").value;
          const compare = document.getElementById("branch-compare").value;
          scopeRef = base + "..." + compare;
          save();
        }
        updateBranchRef();
      } catch (e) {
        scopeContent.innerHTML = `<p class="text-red-600 text-sm">Failed to load branches: ${e.message}</p>`;
      }
    }
  }

  function renderStep3() {
    const content = document.getElementById("wizard-content");
    content.innerHTML = `
      <div class="card mb-4">
        <h2 class="font-semibold text-gray-900 mb-4">Story Collection</h2>
        <div id="story-collection">
          <div class="mb-3"><label class="text-sm font-medium">Add Story</label>
            <div class="flex gap-2 mt-1">
              <select id="story-source" class="border rounded p-2 text-sm">
                <option value="manual">Manual Input</option>
              </select>
              <button id="add-story-btn" class="btn">Add Story</button>
            </div>
          </div>
          <div id="story-form" class="hidden mt-3 border rounded p-3 bg-gray-50">
            <input id="story-name" class="w-full border rounded p-2 mb-2 text-sm" placeholder="Story name">
            <textarea id="story-desc" class="w-full border rounded p-2 mb-2 text-sm" rows="2" placeholder="Description"></textarea>
            <textarea id="story-ac" class="w-full border rounded p-2 mb-2 text-sm" rows="2" placeholder="Acceptance criteria"></textarea>
            <button id="save-story-btn" class="btn btn-primary text-sm">Save</button>
          </div>
          <div id="story-list" class="mt-4 space-y-2">
            ${stories.map(s => renderStoryCard(s)).join("")}
          </div>
        </div>
      </div>
      <div id="file-mapping-section" class="card mb-4 ${stories.length === 0 ? 'hidden' : ''}">
        <h2 class="font-semibold text-gray-900 mb-4">File Mapping</h2>
        <p class="text-sm text-gray-500 mb-3">Select a story, then check files to associate.</p>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <div class="text-sm font-medium mb-2">Files</div>
            <div id="file-tree-container" class="border rounded p-2 max-h-64 overflow-y-auto"></div>
          </div>
          <div>
            <div class="text-sm font-medium mb-2">Selected Story</div>
            <select id="story-select" class="w-full border rounded p-2 text-sm mb-2">
              <option value="">-- Select story --</option>
              ${stories.map((s, i) => `<option value="${i}">${escapeHtml(s.name || s.id)}</option>`).join("")}
            </select>
            <div id="selected-story-preview"></div>
            <button id="save-mapping-btn" class="btn btn-primary mt-3 w-full">Save Mappings</button>
          </div>
        </div>
      </div>
      <div class="flex justify-between">
        <button id="step3-back" class="btn">Back</button>
        <button id="step3-next" class="btn btn-primary">Next</button>
      </div>`;

    // Story form toggle
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

    document.getElementById("save-mapping-btn").addEventListener("click", async () => {
      try {
        const mappings = stories.map(s => ({
          storyName: s.name,
          files: (storyMappings.find(m => m.storyName === s.name)?.files || []),
        }));
        await api.mapStories(sessionId, mappings);
        showToast("Mappings saved", "success");
      } catch (e) { showToast("Failed to save mappings: " + e.message); }
    });

    document.getElementById("step3-back").addEventListener("click", () => { step = 2; save(); render(); });
    document.getElementById("step3-next").addEventListener("click", () => { step = 4; save(); render(); });
  }

  function renderStep4() {
    const content = document.getElementById("wizard-content");
    content.innerHTML = `
      <div class="card mb-4">
        <h2 class="font-semibold text-gray-900 mb-4">Ready to Start</h2>
        <div class="space-y-2 text-sm">
          <div><span class="text-gray-500">Review Type:</span> <span class="font-medium">${reviewType === 'code' ? 'Code Review Only' : 'Code + Story Alignment'}</span></div>
          <div><span class="text-gray-500">Scope:</span> <span class="font-medium">${scopeMethod} ${scopeRef}</span></div>
          ${reviewType === 'all' ? `<div><span class="text-gray-500">Stories:</span> <span class="font-medium">${stories.length} story(s)</span></div>` : ""}
        </div>
        <div class="mt-4 p-3 bg-blue-50 rounded text-sm text-blue-700">
          AI review runs in the Claude Code terminal. Keep the terminal open.
        </div>
      </div>
      <div class="flex justify-between">
        <button id="step4-back" class="btn">Back</button>
        <button id="start-review-btn" class="btn btn-primary">Start AI Review</button>
      </div>`;

    document.getElementById("step4-back").addEventListener("click", () => {
      step = reviewType === "code" ? 2 : 3;
      save();
      render();
    });
    document.getElementById("start-review-btn").addEventListener("click", async () => {
      try {
        const btn = document.getElementById("start-review-btn");
        btn.disabled = true;
        btn.textContent = "Starting...";
        await api.updateSessionStatus(sessionId, "ready");
        localStorage.removeItem(savedKey);
        location.hash = `#/progress/${sessionId}`;
      } catch (e) {
        showToast("Failed to start review: " + e.message);
        document.getElementById("start-review-btn").disabled = false;
        document.getElementById("start-review-btn").textContent = "Start AI Review";
      }
    });
  }

  // Load providers on init
  try {
    const providers = await api.listProviders();
    // Will populate story source dropdown on render
  } catch (e) { /* no providers available */ }

  render();
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
