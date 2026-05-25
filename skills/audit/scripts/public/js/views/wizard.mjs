// skills/audit/scripts/public/js/views/wizard.mjs
import { api } from "../api.mjs";
import { showToast, setBreadcrumb, icon, escapeHtml, initTabKeyboard, onNavigateCleanup } from "../app.mjs";
import { renderFileTree } from "../components/file-tree.mjs";
import { renderScopeFileTree } from "../components/scope-file-tree.mjs";

function formatScopeDisplay(method, ref) {
  if (method === "uncommitted") return "Uncommitted Changes";
  if (method === "commits" && ref) {
    const parts = ref.split(" ");
    if (parts.length === 2) return `${parts[0].slice(0, 7)}..${parts[1].slice(0, 7)}`;
    return ref.slice(0, 14);
  }
  if (method === "branch" && ref) return ref;
  return `${method}${ref ? " " + ref : ""}`;
}

function renderCodegraphStatus(containerId, projectDir) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const dir = projectDir || "";
  if (!dir) {
    el.innerHTML = `
      <div class="codegraph-status-card codegraph-unavail">
        <div class="codegraph-info">
          <div class="codegraph-title">${icon("info", 14)} CodeGraph</div>
          <div class="codegraph-detail">Enter a project directory to check CodeGraph status.</div>
        </div>
      </div>`;
    return;
  }

  el.innerHTML = `
    <div class="codegraph-status-card codegraph-loading">
      <div class="codegraph-info">
        <div class="codegraph-title"><span class="spinner spinner-sm"></span> Checking CodeGraph...</div>
      </div>
    </div>`;

  api.getCodegraphStatus(dir).then(status => {
    if (status.available && status.indexed) {
      el.innerHTML = `
        <div class="codegraph-status-card codegraph-ready">
          <div class="codegraph-info">
            <div class="codegraph-title">${icon("check", 14)} CodeGraph Available</div>
            <div class="codegraph-detail">${status.fileCount || 0} files, ${status.symbolCount || 0} symbols indexed</div>
          </div>
          <button id="codegraph-reindex-btn" class="btn btn-sm">Re-index</button>
        </div>`;
      document.getElementById("codegraph-reindex-btn")?.addEventListener("click", async () => {
        const btn = document.getElementById("codegraph-reindex-btn");
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner spinner-sm"></span> Indexing...';
        try {
          await api.initCodegraph(dir);
          renderCodegraphStatus(containerId, dir);
        } catch (e) {
          showToast("Re-index failed: " + e.message);
          btn.disabled = false;
          btn.textContent = "Re-index";
        }
      });
    } else if (status.available && !status.initialized) {
      el.innerHTML = `
        <div class="codegraph-status-card codegraph-uninit">
          <div class="codegraph-info">
            <div class="codegraph-title">${icon("alertTriangle", 14)} Not Initialized</div>
            <div class="codegraph-detail">CLI detected but no index found.</div>
          </div>
          <button id="codegraph-init-btn" class="btn btn-primary btn-sm">Initialize & Index</button>
        </div>`;
      document.getElementById("codegraph-init-btn")?.addEventListener("click", async () => {
        const btn = document.getElementById("codegraph-init-btn");
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner spinner-sm"></span> Indexing...';
        try {
          await api.initCodegraph(dir);
          renderCodegraphStatus(containerId, dir);
        } catch (e) {
          showToast("Init failed: " + e.message);
          btn.disabled = false;
          btn.textContent = "Initialize & Index";
        }
      });
    } else if (status.available && status.initialized && !status.indexed) {
      el.innerHTML = `
        <div class="codegraph-status-card codegraph-uninit">
          <div class="codegraph-info">
            <div class="codegraph-title">${icon("alertTriangle", 14)} Needs Indexing</div>
            <div class="codegraph-detail">Initialized but not yet indexed.</div>
          </div>
          <button id="codegraph-index-btn" class="btn btn-primary btn-sm">Run Index</button>
        </div>`;
      document.getElementById("codegraph-index-btn")?.addEventListener("click", async () => {
        const btn = document.getElementById("codegraph-index-btn");
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner spinner-sm"></span> Indexing...';
        try {
          await api.initCodegraph(dir);
          renderCodegraphStatus(containerId, dir);
        } catch (e) {
          showToast("Index failed: " + e.message);
          btn.disabled = false;
          btn.textContent = "Run Index";
        }
      });
    } else {
      el.innerHTML = `
        <div class="codegraph-status-card codegraph-unavail">
          <div class="codegraph-info">
            <div class="codegraph-title">${icon("x", 14)} Unavailable</div>
            <div class="codegraph-detail">CLI not found. Will use basic file scan.</div>
          </div>
        </div>`;
    }
  }).catch(() => {
    el.innerHTML = `
      <div class="codegraph-status-card codegraph-unavail">
        <div class="codegraph-info">
          <div class="codegraph-title">${icon("x", 14)} Error</div>
          <div class="codegraph-detail">Failed to check status.</div>
        </div>
      </div>`;
  });
}

export async function renderWizard(container, params) {
  let sessionId = params[0];
  const isNew = !sessionId || sessionId === "new";
  const urlParams = new URLSearchParams(window.location.hash.split("?")[1] || "");
  const preselectType = urlParams.get("type");
  let step = 1;
  let prevStep = 0;
  let reviewType = "code";
  let scopeMethod = "uncommitted";
  let scopeRef = "";
  let stories = [];
  let storyMappings = [];
  let contextExpanded = true;
  let excludedFiles = [];
  let scopeTreeInstance = null;
  let previewGeneration = 0;
  let pendingExpandIndex = -1;
  let defaultProjectDir = "";
  let dirty = false;

  // For "new" wizard, skip session restore — no session exists yet
  if (!isNew) {
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
      excludedFiles = state.excludedFiles || [];
    }

    // If no localStorage data, try to restore from server for scoped sessions
    if (!saved) {
      try {
        const session = await api.getSession(sessionId);
        if (session?.status === "scoped") {
          reviewType = session.type || "code";
          if (session.scope) {
            scopeMethod = session.scope.method || "uncommitted";
            scopeRef = session.scope.ref || "";
          }
          // Jump to the appropriate step (past scope selection)
          step = reviewType === "all" ? 3 : 2;
          // Load stories from server
          try {
            const serverStories = await api.getStories(sessionId);
            stories = serverStories.map(s => ({
              name: s.name,
              description: s.description || "",
              acceptance: s.acceptance || "",
            }));
            storyMappings = serverStories.map(s => ({
              storyName: s.name,
              files: (s.files || []).map(f => typeof f === "string" ? f : f.name),
            }));
          } catch (e) { /* no stories yet */ }
          save();
        } else if (session?.type === "project") {
          reviewType = "project";
          if (["scanned", "grouping", "ready"].includes(session.status)) {
            step = 3;
          } else {
            step = 2;
          }
          save();
        } else if (session?.type && session.status === "created") {
          // New session from type selection — skip to step 2
          reviewType = session.type === "all" ? "all" : "code";
          step = 2;
          save();
        }
      } catch (e) {
        // If server fetch fails, start fresh
      }
    }
  }

  function save() {
    if (isNew) return;
    const savedKey = `audit-wizard-${sessionId}`;
    localStorage.setItem(savedKey, JSON.stringify({
      step, reviewType, scopeMethod, scopeRef, stories, storyMappings, contextExpanded, excludedFiles,
    }));
  }

  function setDirty(value) {
    dirty = value;
    if (dirty && step > 1) {
      window.onbeforeunload = () => true;
    } else {
      window.onbeforeunload = null;
    }
  }

  function render() {
    const shortId = sessionId && !isNew ? sessionId.slice(0, 7) : "";
    setBreadcrumb([
      { label: "Sessions", href: "#/home" },
      ...(shortId ? [{ label: shortId, href: `#/wizard/${sessionId}` }] : []),
      { label: isNew ? "New Audit" : "Configure" },
    ]);

    const totalSteps = reviewType === "all" ? 4 : (reviewType === "project" ? 4 : 3);
    const stepLabels = reviewType === "all"
      ? ["Review Type", "Scope", "Stories", "Ready"]
      : reviewType === "project"
        ? ["Review Type", "Configure", "Group", "Ready"]
        : ["Review Type", "Scope", "Ready"];

    const goingForward = step > prevStep;
    prevStep = step;

    container.innerHTML = `
      <h1 class="text-2xl mb-6">New Audit</h1>
      <div class="steps">
        ${stepLabels.map((label, i) => {
          const num = i + 1;
          const isActive = step === num;
          const isDone = step > num;
          const isLast = i === stepLabels.length - 1;
          return `
            <div class="step-node ${isActive ? "active" : ""} ${isDone ? "done" : ""}">
              <div class="step-dot">
                ${isDone ? icon("check", 14) : num}
              </div>
              <span class="step-label">${label}</span>
            </div>
            ${!isLast ? `<div class="step-line ${isDone ? "done" : ""}"></div>` : ""}
          `;
        }).join("")}
      </div>
      <div id="wizard-content" class="${goingForward ? 'wizard-step-enter' : 'wizard-step-enter-back'}"></div>
    `;

    if (step === 1) renderStep1();
    else if (step === 2 && reviewType === "project") renderProjectConfigure();
    else if (step === 2) renderStep2();
    else if (step === 3 && reviewType === "project") renderGroupStep();
    else if (step === 3 && reviewType === "all") renderStep3();
    else if (step === 3 && reviewType === "code") renderStep4();
    else if (step === 4 && reviewType === "project") renderProjectReady();
    else if (step === 4) renderStep4();
    else renderStep4();
  }

  function renderStep1() {
    if (preselectType && isNew) {
      reviewType = preselectType;
    }
    const content = document.getElementById("wizard-content");
    content.innerHTML = `
      <div class="card mb-4">
        <h2 class="font-semibold mb-4">Choose Review Type</h2>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
          <div class="card card-clickable ${reviewType === "code" ? "selected" : ""}" data-type="code">
            <div class="flex items-center gap-3 mb-3">
              ${icon("eye", 20)}
              <span class="font-medium">Code Review Only</span>
            </div>
            <div class="text-sm text-secondary">Review code changes for quality, security, and best practices.</div>
          </div>
          <div class="card card-clickable ${reviewType === "all" ? "selected" : ""}" data-type="all">
            <div class="flex items-center gap-3 mb-3">
              ${icon("clipboard", 20)}
              <span class="font-medium">Code + Story Alignment</span>
            </div>
            <div class="text-sm text-secondary">Also check that code changes align with story requirements.</div>
          </div>
          <div class="card card-clickable ${reviewType === "project" ? "selected" : ""}" data-type="project">
            <div class="flex items-center gap-3 mb-3">
              ${icon("search", 20)}
              <span class="font-medium">Project Scan</span>
            </div>
            <div class="text-sm text-secondary">Full project security and quality audit.</div>
          </div>
        </div>
      </div>
      <div class="flex justify-end">
        <button id="step1-next" class="btn btn-primary">Next ${icon("chevronRight", 14)}</button>
      </div>`;

    content.querySelectorAll("[data-type]").forEach(card => {
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.addEventListener("click", () => {
        const newType = card.dataset.type;
        reviewType = newType;
        save();
        setDirty(true);
        render();
      });
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); card.click(); }
      });
    });
    document.getElementById("step1-next").addEventListener("click", async () => {
      const nextBtn = document.getElementById("step1-next");
      // If new wizard, create session on Next
      if (isNew) {
        const originalHTML = nextBtn.innerHTML;
        nextBtn.disabled = true;
        nextBtn.innerHTML = '<span class="spinner spinner-sm"></span> Creating...';
        try {
          const { id, projectDir } = await api.createSession({ type: reviewType });
          sessionId = id;
          defaultProjectDir = projectDir || "";
          location.hash = `#/wizard/${id}`;
        } catch (e) {
          showToast("Failed to create session: " + e.message);
          nextBtn.disabled = false;
          nextBtn.innerHTML = originalHTML;
        }
        return;
      }
      // For existing session switching to project, create new session
      if (reviewType === "project" && !isNew) {
        // Check if current session is already project type
        try {
          const session = await api.getSession(sessionId);
          if (session?.type !== "project") {
            const { id } = await api.createSession({ type: "project" });
            localStorage.removeItem(`audit-wizard-${sessionId}`);
            location.hash = `#/wizard/${id}`;
            return;
          }
        } catch {}
      }
      step = 2;
      save();
      render();
    });
  }

  function renderProjectConfigure() {
    const content = document.getElementById("wizard-content");
    content.innerHTML = `
      <div class="card mb-4">
        <h2 class="font-semibold mb-4">Configure Project Scan</h2>
        <div class="space-y-4">
          <div>
            <label for="project-dir">Project Directory</label>
            <div style="position:relative">
              <span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--text-muted);pointer-events:none">${icon("folder", 16)}</span>
              <input id="project-dir" class="mt-1" placeholder="/path/to/project" style="padding-left:40px;">
            </div>
            <div class="text-xs text-muted mt-1">Leave empty to scan the current project.</div>
          </div>
          <div id="codegraph-status"></div>
        </div>

        <div class="mt-4 border-t" style="border-color:var(--border)">
          <div id="project-context-toggle" class="flex items-center gap-2 py-3 cursor-pointer" style="color:var(--text-secondary)">
            ${icon("messageSquare", 16)}
            <span class="text-sm font-medium">Review Context</span>
            <span class="text-xs text-muted ml-1">(optional)</span>
            <span id="project-context-chevron" class="ml-auto" style="transition:transform 200ms;transform:rotate(${contextExpanded ? "180" : "0"}deg)">${icon("chevronDown", 14)}</span>
          </div>
          <div id="project-context-panel" style="display:${contextExpanded ? "block" : "none"}">
            <textarea id="project-context-input" class="w-full" rows="4" placeholder="Project background, key requirements, areas of concern..."></textarea>
            <div class="text-xs text-muted mt-1">This context is passed to AI reviewers as additional guidance.</div>
          </div>
        </div>
      </div>
      <div class="flex justify-between">
        <button id="project-back" class="btn btn-ghost">${icon("arrowLeft", 14)} Back</button>
        <button id="project-next" class="btn btn-primary">Next ${icon("chevronRight", 14)}</button>
      </div>`;

    api.getSession(sessionId).then(session => {
      const dirInput = document.getElementById("project-dir");
      if (dirInput) {
        dirInput.value = session.projectDir || defaultProjectDir || "";
      }
      renderCodegraphStatus("codegraph-status", session.projectDir || defaultProjectDir || "");
    }).catch(() => {});

    api.getReviewContext(sessionId).then(data => {
      const input = document.getElementById("project-context-input");
      if (input && data.context) {
        const match = data.context.match(/## User Context\n([\s\S]*?)(?=\n## Review Notes|$)/);
        input.value = match ? match[1].trim() : data.context.trim();
      }
    }).catch(() => {});

    document.getElementById("project-context-toggle").addEventListener("click", () => {
      contextExpanded = !contextExpanded;
      document.getElementById("project-context-panel").style.display = contextExpanded ? "block" : "none";
      document.getElementById("project-context-chevron").style.transform = `rotate(${contextExpanded ? 180 : 0}deg)`;
      save();
    });

    let ctxTimer = null;
    const ctxInput = document.getElementById("project-context-input");
    if (ctxInput) {
      ctxInput.addEventListener("blur", () => {
        clearTimeout(ctxTimer);
        ctxTimer = setTimeout(async () => {
          try { await api.setReviewContext(sessionId, ctxInput.value); } catch {}
        }, 300);
      });
    }

    // Re-check codegraph status when directory changes
    let cgTimer = null;
    const dirInput = document.getElementById("project-dir");
    if (dirInput) {
      dirInput.addEventListener("input", () => {
        clearTimeout(cgTimer);
        cgTimer = setTimeout(() => {
          renderCodegraphStatus("codegraph-status", dirInput.value.trim());
        }, 500);
      });
    }

    document.getElementById("project-back").addEventListener("click", () => { step = 1; save(); render(); });
    document.getElementById("project-next").addEventListener("click", async () => {
      const btn = document.getElementById("project-next");
      const originalHTML = btn.innerHTML;
      try {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner spinner-sm"></span> Saving...';
        // Save project directory to session
        const dirInput = document.getElementById("project-dir");
        if (dirInput) {
          try { await api.patchSession(sessionId, { projectDir: dirInput.value.trim() || null }); } catch {}
        }
        if (ctxInput) {
          try { await api.setReviewContext(sessionId, ctxInput.value); } catch {}
        }
        step = 3;
        save();
        render();
      } catch (e) {
        showToast("Failed: " + e.message);
        btn.disabled = false;
        btn.innerHTML = originalHTML;
      }
    });
  }

  function renderGroupStep() {
    const content = document.getElementById("wizard-content");
    content.innerHTML = `
      <div class="card mb-4">
        <h2 class="font-semibold mb-4">Scan &amp; Group Files</h2>
        <div id="group-step-content">
          <div class="text-sm text-secondary"><span class="spinner spinner-sm"></span> Checking scan status...</div>
        </div>
      </div>
      <div class="flex justify-between">
        <button id="group-back" class="btn btn-ghost">${icon("arrowLeft", 14)} Back</button>
        <button id="group-confirm-btn" class="btn btn-primary" disabled>Confirm Groups ${icon("check", 14)}</button>
      </div>`;

    document.getElementById("group-back").addEventListener("click", () => { clearPoll(); step = 2; save(); render(); });

    let groups = null;
    let pollTimer = null;

    function clearPoll() {
      if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
    }

    function schedulePoll(fn, ms) {
      clearPoll();
      pollTimer = setTimeout(fn, ms);
    }

    function renderScanning() {
      const el = document.getElementById("group-step-content");
      el.innerHTML = `
        <div class="space-y-4">
          <div class="flex items-center gap-2 text-sm text-secondary">
            <span class="spinner spinner-sm"></span> Scanning project files...
          </div>
          <div class="scan-progress-bar"><div class="progress-fill"></div></div>
          <div class="scan-log-section">
            <button id="scan-log-toggle" class="scan-log-toggle">
              <span class="toggle-icon">${icon("chevronRight", 10)}</span> Scan Log
            </button>
            <div id="scan-log-panel" class="scan-log-panel"></div>
          </div>
        </div>`;

      const logPanel = document.getElementById("scan-log-panel");
      const logToggle = document.getElementById("scan-log-toggle");
      if (logToggle) {
        logToggle.addEventListener("click", () => {
          logPanel?.classList.toggle("open");
          logToggle.classList.toggle("open");
        });
      }

      let es = null;
      try {
        es = new EventSource(`/api/sessions/${sessionId}/scan/logs`);
        es.onmessage = (e) => {
          try {
            const entry = JSON.parse(e.data);
            if (!logPanel) return;
            const div = document.createElement("div");
            div.className = "scan-log-entry";
            div.innerHTML = `<span class="log-time">${escapeHtml(entry.timestamp)}</span>${escapeHtml(entry.message)}`;
            const wasAtBottom = logPanel.scrollHeight - logPanel.scrollTop - logPanel.clientHeight < 30;
            logPanel.appendChild(div);
            if (wasAtBottom) logPanel.scrollTop = logPanel.scrollHeight;
            if (!logPanel.classList.contains("open")) {
              logPanel.classList.add("open");
              if (logToggle) logToggle.classList.add("open");
            }
          } catch {}
        };
        es.onerror = () => { es?.close(); es = null; };
      } catch {}

      onNavigateCleanup(() => { window.onbeforeunload = null; es?.close(); clearPoll(); });
    }

    function pollScanStatus() {
      api.getScanStatus(sessionId).then(data => {
        if (data.status === "scanned") {
          renderPending();
        } else if (data.status === "done") {
          step = 4;
          save();
          render();
        } else if (data.status === "scanning") {
          schedulePoll(pollScanStatus, 2000);
        } else {
          triggerScan();
        }
      }).catch(() => {
        schedulePoll(pollScanStatus, 3000);
      });
    }

    function triggerScan() {
      renderScanning();
      api.startScan(sessionId).then(() => {
        schedulePoll(pollScanStatus, 2000);
      }).catch(e => {
        const el = document.getElementById("group-step-content");
        const isNotFound = e.message?.includes("not found");
        el.innerHTML = `
          <div class="space-y-4">
            <div class="text-sm text-danger">${icon("alertTriangle", 14)} Scan failed: ${escapeHtml(e.message)}</div>
            ${isNotFound ? `
              <div class="text-sm text-secondary">The session may not be fully configured yet. Try going back and re-entering the project directory.</div>
              <button id="group-back-retry" class="btn btn-sm">${icon("arrowLeft", 14)} Back to Configure</button>
            ` : `
              <button id="retry-scan-btn" class="btn btn-sm">Retry Scan</button>
            `}
          </div>`;
        document.getElementById("retry-scan-btn")?.addEventListener("click", () => triggerScan());
        document.getElementById("group-back-retry")?.addEventListener("click", () => { clearPoll(); step = 2; save(); render(); });
      });
    }

    function pollForGroups() {
      api.getGroups(sessionId).then(data => {
        if (data.status === "ready" && data.groups && data.groups.length > 0) {
          groups = data.groups;
          renderGroupsLoaded();
        } else {
          renderPending();
        }
      }).catch(() => renderPending());
    }

    function renderPending() {
      clearPoll();
      const el = document.getElementById("group-step-content");
      api.getGraphData(sessionId).then(graphData => {
        const entryList = (graphData.entryFiles || []).slice(0, 8);
        const moreCount = Math.max(0, (graphData.entryFiles || []).length - 8);
        el.innerHTML = `
          <div class="space-y-4">
            <div class="scan-file-count">${icon("file", 12)} Found ${graphData.totalFiles || 0} files</div>
            <div class="text-sm text-secondary">${(graphData.entryFiles || []).length} entry points detected</div>
            ${entryList.length > 0 ? `
            <div class="group-entry-list">
              <div class="text-xs font-semibold text-muted mb-2" style="text-transform:uppercase;letter-spacing:0.5px">Entry Points</div>
              ${entryList.map(e => `
                <div class="group-entry-item">
                  <span class="entry-file-badge entry-type-${e.type}">${e.type}</span>
                  <span class="text-sm font-mono">${escapeHtml(e.path)}</span>
                </div>
              `).join("")}
              ${moreCount > 0 ? `<div class="text-xs text-muted mt-1">... ${moreCount} more</div>` : ""}
            </div>` : ""}
            <div class="info-banner info-banner-amber">
              ${icon("terminal", 16)}
              <span>Go to your AI terminal and type: <code>group ${escapeHtml(sessionId)}</code></span>
            </div>
            <div class="flex items-center gap-2 text-sm text-muted">
              <span class="spinner spinner-sm"></span> Waiting for grouping...
            </div>
          </div>`;
      }).catch(() => {
        el.innerHTML = `
          <div class="info-banner info-banner-amber">
            ${icon("terminal", 16)}
            <span>Go to your AI terminal and type: <code>group ${escapeHtml(sessionId)}</code></span>
          </div>
          <div class="flex items-center gap-2 text-sm text-muted mt-3">
            <span class="spinner spinner-sm"></span> Waiting for grouping...
          </div>`;
      });

      schedulePoll(pollForGroups, 3000);
    }

    function renderGroupsLoaded() {
      clearPoll();
      const el = document.getElementById("group-step-content");
      const confirmBtn = document.getElementById("group-confirm-btn");

      el.innerHTML = `
        <div class="text-sm text-secondary mb-4">
          <strong>${groups.length}</strong> groups generated — review and adjust if needed
        </div>
        <div class="space-y-3" id="group-cards">
          ${groups.map((g, i) => `
            <div class="group-card" data-group-index="${i}">
              <div class="group-card-header" data-index="${i}">
                <div class="group-card-info">
                  <div class="group-card-title">
                    ${icon("folder", 16)}
                    <span class="font-medium">${escapeHtml(g.name || "Group " + (i + 1))}</span>
                    <span class="group-file-count-badge">${(g.files || []).length} files</span>
                  </div>
                  ${g.rationale ? `<div class="group-rationale">${escapeHtml(g.rationale)}</div>` : ""}
                </div>
                <span class="group-chevron">${icon("chevronDown", 14)}</span>
              </div>
              <div class="group-card-body" id="group-body-${i}" style="display:none">
                ${(g.files || []).map(f => {
                  const isEntry = (g.entryFiles || []).includes(f);
                  return `<div class="group-file-item">
                    <label class="checkbox-toggle">
                      <input type="checkbox" data-file="${escapeHtml(f)}" ${isEntry ? "checked disabled" : "checked"}>
                      <span class="text-sm font-mono ${isEntry ? "text-accent" : ""}">${escapeHtml(f)}</span>
                      ${isEntry ? '<span class="entry-file-badge entry-type-api ml-2">entry</span>' : ""}
                    </label>
                  </div>`;
                }).join("")}
              </div>
            </div>
          `).join("")}
        </div>
        <div class="group-confirm-totals">${groups.length} groups, ${groups.reduce((sum, g) => sum + (g.files ? g.files.length : 0), 0)} files</div>`;

      confirmBtn.disabled = false;

      el.querySelectorAll(".group-card-header").forEach(header => {
        header.addEventListener("click", () => {
          const idx = header.dataset.index;
          const body = document.getElementById(`group-body-${idx}`);
          const card = header.closest(".group-card");
          const isVisible = body.style.display !== "none";
          body.style.display = isVisible ? "none" : "block";
          card.classList.toggle("expanded", !isVisible);
        });
      });

      confirmBtn.addEventListener("click", async () => {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<span class="spinner spinner-sm"></span> Confirming...';
        try {
          await api.confirmGroups(sessionId);
          const stepContent = document.getElementById("group-step-content");
          if (stepContent) {
            stepContent.innerHTML = `<div style="text-align:center;padding:var(--space-8)">
              <div class="confirm-success-check">${icon("check", 24)}</div>
              <p style="margin-top:var(--space-4);color:var(--accent);font-weight:600">Groups confirmed</p>
            </div>`;
          }
          setTimeout(() => { step = 4; save(); render(); }, 800);
        } catch (e) {
          showToast("Failed to confirm groups: " + e.message);
          confirmBtn.disabled = false;
          confirmBtn.innerHTML = `Confirm Groups ${icon("check", 14)}`;
        }
      });
    }

    // Entry point: check scan status and decide what to show
    api.getScanStatus(sessionId).then(data => {
      if (data.status === "scanned") {
        pollForGroups();
      } else if (data.status === "done") {
        step = 4;
        save();
        render();
      } else if (data.status === "scanning") {
        renderScanning();
        schedulePoll(pollScanStatus, 2000);
      } else {
        triggerScan();
      }
    }).catch(e => {
      const el = document.getElementById("group-step-content");
      el.innerHTML = `
        <div class="space-y-4">
          <div class="text-sm text-danger">${icon("alertTriangle", 14)} Failed to check scan status: ${escapeHtml(e.message)}</div>
          <button id="retry-scan-btn" class="btn btn-sm">Retry</button>
        </div>`;
      document.getElementById("retry-scan-btn")?.addEventListener("click", () => {
        el.innerHTML = `<div class="text-sm text-secondary"><span class="spinner spinner-sm"></span> Checking scan status...</div>`;
        api.getScanStatus(sessionId).then(data => {
          if (data.status === "scanned") pollForGroups();
          else triggerScan();
        }).catch(() => triggerScan());
      });
    });

    onNavigateCleanup(() => { window.onbeforeunload = null; clearPoll(); });
  }

  function renderProjectReady() {
    const content = document.getElementById("wizard-content");
    content.innerHTML = `
      <h2 style="margin-bottom:var(--space-6)">Review Ready</h2>
      <div id="project-ready-summary"></div>
      <button id="start-project-scan-btn" class="btn btn-primary btn-start-review">
        ${icon("zap", 18)} Start AI Review
      </button>`;

    // Load group summary
    api.getTasks(sessionId).then(tasks => {
      const summary = document.getElementById("project-ready-summary");
      if (summary) {
        const groupCount = tasks.length;
        const fileCount = tasks.reduce((sum, t) => sum + (t.files ? t.files.length : 0), 0);
        summary.innerHTML = `
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
          </div>`;
      }
    }).catch(() => {});

    document.getElementById("start-project-scan-btn").addEventListener("click", async () => {
      const btn = document.getElementById("start-project-scan-btn");
      try {
        btn.disabled = true;
        setDirty(false);
        localStorage.removeItem(`audit-wizard-${sessionId}`);
        content.innerHTML = `
          <div style="text-align:center;padding:var(--space-8)">
            <div class="confirm-success-check">${icon("check", 24)}</div>
            <h3 style="margin-top:var(--space-4);color:var(--text-primary)">Session Prepared</h3>
            <p style="color:var(--text-secondary);margin-top:var(--space-2)">Go to the <a href="#/progress/${sessionId}">Progress page</a> or type <code>start review</code> in the AI terminal.</p>
          </div>`;
      } catch (e) {
        showToast("Failed: " + e.message);
        btn.disabled = false;
      }
    });
  }

  function renderStep2() {
    const content = document.getElementById("wizard-content");
    content.innerHTML = `
      <div class="card mb-4">
        <h2 class="font-semibold mb-4">Select Scope</h2>
        <div class="tabs" id="scope-tabs" role="tablist">
          <div class="tab ${scopeMethod === "uncommitted" ? "active" : ""}" data-method="uncommitted" role="tab" tabindex="0" aria-selected="${scopeMethod === "uncommitted"}">Uncommitted</div>
          <div class="tab ${scopeMethod === "commits" ? "active" : ""}" data-method="commits" role="tab" tabindex="-1" aria-selected="${scopeMethod === "commits"}">Commits</div>
          <div class="tab ${scopeMethod === "branch" ? "active" : ""}" data-method="branch" role="tab" tabindex="-1" aria-selected="${scopeMethod === "branch"}">Branch</div>
        </div>
        <div id="scope-content" class="mt-4"></div>
        <div id="file-preview-section" class="mt-4"></div>
      </div>
      <div class="flex justify-between">
        <button id="step2-back" class="btn btn-ghost" aria-label="Go back">${icon("arrowLeft", 14)} Back</button>
        <button id="step2-confirm" class="btn btn-primary">Confirm Scope</button>
      </div>`;

    renderScopeContent();

    // Tab click + keyboard
    const scopeTabs = document.getElementById("scope-tabs");
    scopeTabs.querySelectorAll(".tab").forEach(tab => {
      tab.addEventListener("click", () => {
        scopeMethod = tab.dataset.method;
        scopeRef = "";
        excludedFiles = [];
        save();
        setDirty(true);
        render();
      });
    });
    initTabKeyboard(scopeTabs);

    document.getElementById("step2-back").addEventListener("click", () => { step = 1; save(); render(); });
    document.getElementById("step2-confirm").addEventListener("click", async () => {
      const btn = document.getElementById("step2-confirm");
      const originalHTML = btn.innerHTML;
      try {
        btn.disabled = true;
        btn.innerHTML = `<span class="spinner spinner-sm"></span> Generating...`;
        if (excludedFiles.length > 0 && scopeTreeInstance) {
          const { selected, total } = scopeTreeInstance.getSelectedCount();
          if (total > 0 && selected === 0) {
            showToast("No files selected for review");
            btn.disabled = false;
            btn.innerHTML = originalHTML;
            return;
          }
        }
        await api.setScope(sessionId, scopeMethod, scopeRef, excludedFiles);
        step = 3;
        save();
        render();
      } catch (e) {
        showToast("Failed to set scope: " + e.message);
        btn.disabled = false;
        btn.innerHTML = originalHTML;
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
              <label for="commit-from">From</label>
              <select id="commit-from" class="mt-1">
                ${commits.map(c => `<option value="${c.hash}">${c.hash.slice(0, 7)} ${escapeHtml(c.message)} (${c.date?.slice(0, 10)})</option>`).join("")}
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
          scopeRef = document.getElementById("commit-from").value + " " + document.getElementById("commit-to").value;
          save();
          setDirty(true);
          loadFilePreview();
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
          scopeRef = document.getElementById("branch-base").value + "..." + document.getElementById("branch-compare").value;
          save();
          setDirty(true);
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

    const gen = ++previewGeneration;
    previewSection.innerHTML = `<div class="scope-tree-loading"><span class="spinner spinner-sm"></span> Loading files...</div>`;
    scopeTreeInstance = null;

    // Single persistent change listener — only attached once
    if (!previewSection.dataset.changeWired) {
      previewSection.dataset.changeWired = "1";
      previewSection.addEventListener("change", () => {
        if (scopeTreeInstance) {
          excludedFiles = scopeTreeInstance.getExcludedFiles();
          save();
          setDirty(true);
        }
      });
    }

    try {
      const data = await api.previewScope(scopeMethod, scopeRef);
      if (gen !== previewGeneration) return;
      if (!data.files || data.files.length === 0) {
        previewSection.innerHTML = `<div class="scope-tree-loading">No changed files found for this scope.</div>`;
        return;
      }
      const tree = renderScopeFileTree(previewSection, data.files);
      scopeTreeInstance = tree;
    } catch (e) {
      if (gen !== previewGeneration) return;
      previewSection.innerHTML = `<div class="scope-tree-loading" style="color:var(--danger)">Failed to load files: ${escapeHtml(e.message)}</div>`;
    }
  }

  async function renderStep3() {
    const content = document.getElementById("wizard-content");
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
      <div id="file-mapping-section" class="card mb-4 ${stories.length === 0 ? "hidden" : ""}">
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
        await api.createStory(sessionId, { name, description, acceptance });
        stories.push({ name, description, acceptance });
        pendingExpandIndex = stories.length - 1;
        save();
        setDirty(true);
        render();
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
        api.mapStories(sid, stories.map(s => ({
          storyName: s.name,
          files: (storyMappings.find(m => m.storyName === s.name)?.files || []),
        }))).catch(e => showToast("Failed to save mapping: " + e.message))
          .finally(() => { syncing = false; });
      }

      // Sync existing mappings to server after re-render
      if (storyMappings.some(m => m.files?.length > 0)) {
        syncMappingsToServer();
      }

      if (pendingExpandIndex >= 0 && pendingExpandIndex < stories.length) {
        expandedIndex = pendingExpandIndex;
        pendingExpandIndex = -1;
        const item = container.querySelector(`[data-story-index="${expandedIndex}"]`);
        if (item) item.classList.add("expanded");
      }

      // Load file tree for pre-expanded item
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
            fileTreeInstances[idx] = tree;
            // Restore selection after a microtask to avoid triggering change events during init
            if (existing?.files?.length) {
              queueMicrotask(() => { tree.setSelected(existing.files); });
            }

            body.addEventListener("change", () => {
              const selected = tree.getSelected();
              const mappingIdx = storyMappings.findIndex(m => m.storyName === story.name);
              if (mappingIdx >= 0) storyMappings[mappingIdx].files = selected;
              else storyMappings.push({ storyName: story.name, files: selected });
              save();

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
              stories = stories.filter(s => s.name !== name);
              storyMappings = storyMappings.filter(m => m.storyName !== name);
              save();
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

  function renderStep4() {
    const content = document.getElementById("wizard-content");
    content.innerHTML = `
      <div class="card mb-4">
        <h2 class="font-semibold mb-4">Ready to Start</h2>
        <div class="ready-summary-grid">
          <div class="ready-summary-card">
            <div class="summary-icon">${icon("eye", 20)}</div>
            <div class="summary-label">Type</div>
            <div class="summary-value">${reviewType === "code" ? "Code Review" : "Code + Story"}</div>
          </div>
          <div class="ready-summary-card">
            <div class="summary-icon">${icon("gitCommit", 20)}</div>
            <div class="summary-label">Scope</div>
            <div class="summary-value">${formatScopeDisplay(scopeMethod, scopeRef)}</div>
          </div>
          ${reviewType === "all" ? `
          <div class="ready-summary-card">
            <div class="summary-icon">${icon("clipboard", 20)}</div>
            <div class="summary-label">Stories</div>
            <div class="summary-value">${stories.length} stories</div>
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
            <textarea id="review-context-input" class="w-full" rows="4" placeholder="Project background, key requirements, areas of concern, known issues..."></textarea>
            <div class="text-xs text-muted mt-1">This context is passed to AI reviewers as additional guidance.</div>
          </div>
        </div>

        <div class="mt-4 info-banner info-banner-amber">
          ${icon("zap", 16)}
          <span>Click "Start AI Review" below, then go back to the AI terminal and type <strong>start review</strong> to begin.</span>
        </div>
      </div>
      <div class="flex justify-between">
        <button id="step4-back" class="btn btn-ghost" aria-label="Go back">${icon("arrowLeft", 14)} Back</button>
        <button id="start-review-btn" class="btn btn-primary btn-start-review">
          ${icon("zap", 14)}
          Start AI Review
        </button>
      </div>`;

    // Load existing context (extract only User Context section)
    api.getReviewContext(sessionId).then(data => {
      const input = document.getElementById("review-context-input");
      if (input && data.context) {
        const match = data.context.match(/## User Context\n([\s\S]*?)(?=\n## Review Notes|$)/);
        input.value = match ? match[1].trim() : data.context.trim();
      }
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
            setDirty(true);
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
      const btn = document.getElementById("start-review-btn");
      const originalHTML = btn.innerHTML;
      // Save context before starting
      if (contextInput) {
        try { await api.setReviewContext(sessionId, contextInput.value); } catch (e) {}
      }
      try {
        btn.disabled = true;
        btn.innerHTML = `<span class="spinner spinner-sm"></span> Preparing...`;
        setDirty(false);
        localStorage.removeItem(`audit-wizard-${sessionId}`);
        // Show confirmation instead of navigating away
        const content = document.getElementById("wizard-content");
        content.innerHTML = `
          <div class="card" style="text-align:center;padding:var(--space-8) var(--space-6)">
            <div style="margin-bottom:var(--space-4);color:var(--accent)">${icon("check", 48)}</div>
            <h2 class="text-xl mb-3">Audit Ready</h2>
            <p class="text-secondary mb-4">Session is prepared. Go back to the AI terminal and type:</p>
            <code style="font-size:var(--text-lg);background:var(--bg-elevated);padding:var(--space-2) var(--space-4);border-radius:var(--radius-md);display:inline-block">start review</code>
            <div class="mt-4">
              <a href="#/progress/${sessionId}" class="btn btn-ghost">View Progress ${icon("chevronRight", 14)}</a>
            </div>
          </div>`;
      } catch (e) {
        showToast("Failed to start review: " + e.message);
        const btn2 = document.getElementById("start-review-btn");
        if (btn2) { btn2.disabled = false; btn2.innerHTML = originalHTML; }
      }
    });
  }

  }

  render();

  onNavigateCleanup(() => {
    window.onbeforeunload = null;
  });
}
