// skills/audit/scripts/public/js/views/wizard-scope.mjs
import { api } from "../api.mjs";
import { showToast, icon, escapeHtml, initTabKeyboard } from "../app.mjs";
import { renderScopeFileTree } from "../components/scope-file-tree.mjs";

export function renderScopeStep(content, state) {
  content.innerHTML = `
    <div class="card mb-4">
      <h2 class="font-semibold mb-4">Select Scope</h2>
      <div class="tabs" id="scope-tabs" role="tablist">
        <div class="tab ${state.scopeMethod === "uncommitted" ? "active" : ""}" data-method="uncommitted" role="tab" tabindex="0" aria-selected="${state.scopeMethod === "uncommitted"}">Uncommitted</div>
        <div class="tab ${state.scopeMethod === "commits" ? "active" : ""}" data-method="commits" role="tab" tabindex="-1" aria-selected="${state.scopeMethod === "commits"}">Commits</div>
        <div class="tab ${state.scopeMethod === "branch" ? "active" : ""}" data-method="branch" role="tab" tabindex="-1" aria-selected="${state.scopeMethod === "branch"}">Branch</div>
      </div>
      <div id="scope-content" class="mt-4"></div>
      <div id="file-preview-section" class="mt-4"></div>
    </div>
    <div class="wizard-nav">
      <button id="step2-back" class="btn btn-ghost" aria-label="Go back">${icon("arrowLeft", 14)} Back</button>
      <button id="step2-confirm" class="btn btn-primary">Confirm Scope</button>
    </div>`;

  renderScopeContent();

  // Tab click + keyboard
  const scopeTabs = document.getElementById("scope-tabs");
  scopeTabs.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      state.scopeMethod = tab.dataset.method;
      state.scopeRef = "";
      state.excludedFiles = [];
      state.save();
      state.render();
    });
  });
  initTabKeyboard(scopeTabs);

  document.getElementById("step2-back").addEventListener("click", () => { state.goBack(1, "step2-back"); });
  document.getElementById("step2-confirm").addEventListener("click", async () => {
    const btn = document.getElementById("step2-confirm");
    const originalHTML = btn.innerHTML;
    try {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner spinner-sm"></span> Generating...`;
      if (state.excludedFiles.length > 0 && state.scopeTreeInstance) {
        const { selected, total } = state.scopeTreeInstance.getSelectedCount();
        if (total > 0 && selected === 0) {
          showToast("No files selected for review");
          btn.disabled = false;
          btn.innerHTML = originalHTML;
          return;
        }
      }
      const result = await api.setScope(state.sessionId, state.scopeMethod, state.scopeRef, state.excludedFiles);
      if (!result.taskCount || result.taskCount === 0) {
        showToast("No changed files found in this scope. Try a different scope or commit changes first.", "warning");
        btn.disabled = false;
        btn.innerHTML = originalHTML;
        return;
      }
      state.step = 3;
      state.save();
      state.render();
    } catch (e) {
      showToast("Failed to set scope: " + e.message);
      btn.disabled = false;
      btn.innerHTML = originalHTML;
    }
  });

  async function renderScopeContent() {
    const scopeContent = document.getElementById("scope-content");
    if (!scopeContent) return;

    if (state.scopeMethod === "uncommitted") {
      scopeContent.innerHTML = `
        <div class="info-banner info-banner-blue">
          ${icon("gitBranch", 16)}
          <span>Review uncommitted changes in the working directory (including staged changes).</span>
        </div>`;
    } else if (state.scopeMethod === "commits") {
      try {
        const commits = await api.getCommits();
        scopeContent.innerHTML = `
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label for="commit-from">From</label>
              <select id="commit-from" class="mt-1">
                ${commits.map((c, i) => `<option value="${c.hash}" ${i === 1 ? "selected" : ""}>${c.hash.slice(0, 7)} ${escapeHtml(c.message)} (${c.date?.slice(0, 10)})</option>`).join("")}
              </select>
            </div>
            <div>
              <label for="commit-to">To</label>
              <select id="commit-to" class="mt-1">
                ${commits.map((c, i) => `<option value="${c.hash}" ${i === 0 ? "selected" : ""}>${c.hash.slice(0, 7)} ${escapeHtml(c.message)} (${c.date?.slice(0, 10)})</option>`).join("")}
              </select>
            </div>
          </div>`;
        document.getElementById("commit-from").addEventListener("change", updateCommitRef);
        document.getElementById("commit-to").addEventListener("change", updateCommitRef);
        function updateCommitRef() {
          state.scopeRef = document.getElementById("commit-from").value + " " + document.getElementById("commit-to").value;
          state.save();
          state.setDirty(true);
          loadFilePreview();
        }
        updateCommitRef();
      } catch (e) {
        scopeContent.innerHTML = `<p class="text-danger text-sm">${icon("alertTriangle", 14)} Failed to load commits: ${escapeHtml(e.message)}</p>`;
      }
    } else if (state.scopeMethod === "branch") {
      try {
        const branches = await api.getBranches();
        scopeContent.innerHTML = `
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label for="branch-base">Base</label>
              <select id="branch-base" class="mt-1">
                ${branches.map(b => `<option value="${b}" ${b === "main" || b === "master" ? "selected" : ""}>${escapeHtml(b)}</option>`).join("")}
              </select>
            </div>
            <div>
              <label for="branch-compare">Compare</label>
              <select id="branch-compare" class="mt-1">
                ${branches.map(b => `<option value="${b}">${escapeHtml(b)}</option>`).join("")}
              </select>
            </div>
          </div>`;
        document.getElementById("branch-base").addEventListener("change", updateBranchRef);
        document.getElementById("branch-compare").addEventListener("change", updateBranchRef);
        function updateBranchRef() {
          state.scopeRef = document.getElementById("branch-base").value + "..." + document.getElementById("branch-compare").value;
          state.save();
          state.setDirty(true);
          loadFilePreview();
        }
        updateBranchRef();
      } catch (e) {
        scopeContent.innerHTML = `<p class="text-danger text-sm">${icon("alertTriangle", 14)} Failed to load branches: ${escapeHtml(e.message)}</p>`;
      }
    }
    // Auto-load file preview
    loadFilePreview();
  }

  async function loadFilePreview() {
    const previewSection = document.getElementById("file-preview-section");
    if (!previewSection) return;

    const gen = ++state.previewGeneration;
    previewSection.innerHTML = `<div class="scope-tree-loading"><span class="spinner spinner-sm"></span> Loading files...</div>`;
    state.scopeTreeInstance = null;

    // Single persistent change listener — only attached once
    if (!previewSection.dataset.changeWired) {
      previewSection.dataset.changeWired = "1";
      previewSection.addEventListener("change", () => {
        if (state.scopeTreeInstance) {
          state.excludedFiles = state.scopeTreeInstance.getExcludedFiles();
          state.save();
          state.setDirty(true);
        }
      });
    }

    try {
      const data = await api.previewScope(state.scopeMethod, state.scopeRef);
      if (gen !== state.previewGeneration) return;
      if (!data.files || data.files.length === 0) {
        previewSection.innerHTML = `<div class="scope-tree-loading">No changed files found for this scope.</div>`;
        return;
      }
      const tree = renderScopeFileTree(previewSection, data.files);
      state.scopeTreeInstance = tree;
    } catch (e) {
      if (gen !== state.previewGeneration) return;
      previewSection.innerHTML = `<div class="scope-tree-loading" style="color:var(--danger)">Failed to load files: ${escapeHtml(e.message)}</div>`;
    }
  }
}
