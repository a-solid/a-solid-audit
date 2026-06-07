// skills/audit/scripts/public/js/views/wizard-project.mjs
import { api } from "../api.mjs";
import { showToast, icon, escapeHtml, onNavigateCleanup, renderTerminalCard } from "../app.mjs";

export function renderCodegraphStatus(containerId, projectDir) {
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

export function renderProjectConfigure(content, state) {
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
          <span id="project-context-chevron" class="ml-auto" style="transition:transform 200ms;transform:rotate(${state.contextExpanded ? "180" : "0"}deg)">${icon("chevronDown", 14)}</span>
        </div>
        <div id="project-context-panel" style="display:${state.contextExpanded ? "block" : "none"}">
          <textarea id="project-context-input" class="w-full" rows="4" placeholder="Project background, key requirements, areas of concern..."></textarea>
          <div class="text-xs text-muted mt-1">This context is passed to AI reviewers as additional guidance.</div>
        </div>
      </div>
    </div>
    <div class="wizard-nav">
      <button id="project-back" class="btn btn-ghost">${icon("arrowLeft", 14)} Back</button>
      <button id="project-next" class="btn btn-primary">Next ${icon("chevronRight", 14)}</button>
    </div>`;

  api.getSession(state.roundName, state.version).then(session => {
    const dirInput = document.getElementById("project-dir");
    if (dirInput) {
      dirInput.value = session.projectDir || state.defaultProjectDir || "";
    }
    renderCodegraphStatus("codegraph-status", session.projectDir || state.defaultProjectDir || "");
  }).catch(() => {});

  api.getReviewContext(state.roundName, state.version).then(data => {
    const input = document.getElementById("project-context-input");
    if (input && data.context) {
      const match = data.context.match(/## User Context\n([\s\S]*?)(?=\n## Review Notes|$)/);
      input.value = match ? match[1].trim() : data.context.trim();
    }
  }).catch(() => {});

  document.getElementById("project-context-toggle").addEventListener("click", () => {
    state.contextExpanded = !state.contextExpanded;
    document.getElementById("project-context-panel").style.display = state.contextExpanded ? "block" : "none";
    document.getElementById("project-context-chevron").style.transform = `rotate(${state.contextExpanded ? 180 : 0}deg)`;
    state.save();
  });

  let ctxTimer = null;
  const ctxInput = document.getElementById("project-context-input");
  if (ctxInput) {
    ctxInput.addEventListener("blur", () => {
      clearTimeout(ctxTimer);
      ctxTimer = setTimeout(async () => {
        try { await api.setReviewContext(state.roundName, state.version, ctxInput.value); } catch {}
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

  document.getElementById("project-back").addEventListener("click", () => { state.goBack(1, "project-back"); });
  document.getElementById("project-next").addEventListener("click", async () => {
    const btn = document.getElementById("project-next");
    const originalHTML = btn.innerHTML;
    try {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner spinner-sm"></span> Saving...';
      // Save project directory to session
      const dirInput = document.getElementById("project-dir");
      if (dirInput) {
        try { await api.patchSession(state.roundName, state.version, { projectDir: dirInput.value.trim() || null }); } catch {}
      }
      if (ctxInput) {
        try { await api.setReviewContext(state.roundName, state.version, ctxInput.value); } catch {}
      }
      state.step = 3;
      state.save();
      state.render();
    } catch (e) {
      showToast("Failed: " + e.message);
      btn.disabled = false;
      btn.innerHTML = originalHTML;
    }
  });
}

export function renderGroupStep(content, state) {
  content.innerHTML = `
    <div class="card mb-4">
      <h2 class="font-semibold mb-4">Scan &amp; Group Files</h2>
      <div id="group-step-content">
        <div class="text-sm text-secondary"><span class="spinner spinner-sm"></span> Checking scan status...</div>
      </div>
    </div>
    <div class="wizard-nav">
      <button id="group-back" class="btn btn-ghost">${icon("arrowLeft", 14)} Back</button>
      <button id="group-confirm-btn" class="btn btn-primary" disabled>Confirm Groups ${icon("check", 14)}</button>
    </div>`;

  document.getElementById("group-back").addEventListener("click", () => { state.clearPoll(); state.goBack(2, "group-back"); });

  let groups = null;
  let activeEs = null;

  function closeEventSource() {
    if (activeEs) { activeEs.close(); activeEs = null; }
  }

  onNavigateCleanup(() => { window.onbeforeunload = null; closeEventSource(); state.clearPoll(); });

  const scanLogUrl = `/api/rounds/${encodeURIComponent(state.roundName)}/sessions/${encodeURIComponent(state.version)}/scan/logs`;

  function renderScanning() {
    closeEventSource();

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

    try {
      activeEs = new EventSource(scanLogUrl);
      activeEs.onmessage = (e) => {
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
      activeEs.onerror = () => { closeEventSource(); };
    } catch {}
  }

  function pollScanStatus() {
    api.getScanStatus(state.roundName, state.version).then(data => {
      if (data.status === "scanned") {
        renderPending();
      } else if (data.status === "done") {
        state.step = 4;
        state.save();
        state.render();
      } else if (data.status === "scanning") {
        state.schedulePoll(pollScanStatus, 2000);
      } else {
        triggerScan();
      }
    }).catch(() => {
      state.schedulePoll(pollScanStatus, 3000);
    });
  }

  function triggerScan() {
    renderScanning();
    api.startScan(state.roundName, state.version).then(() => {
      state.schedulePoll(pollScanStatus, 2000);
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
      document.getElementById("group-back-retry")?.addEventListener("click", () => { state.clearPoll(); state.step = 2; state.save(); state.render(); });
    });
  }

  function pollForGroups() {
    api.getGroups(state.roundName, state.version).then(data => {
      if (data.status === "ready" && data.groups && data.groups.length > 0) {
        groups = data.groups;
        renderGroupsLoaded();
      } else {
        renderPending();
      }
    }).catch(() => renderPending());
  }

  function renderPending() {
    state.clearPoll();
    const el = document.getElementById("group-step-content");
    api.getGraphData(state.roundName, state.version).then(graphData => {
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
          <div id="group-terminal-card"></div>
          <div class="flex items-center gap-2 text-sm text-muted">
            <span class="spinner spinner-sm"></span> Waiting for grouping...
          </div>
        </div>`;

      const termEl = document.getElementById("group-terminal-card");
      renderTerminalCard(termEl, `group ${state.roundName}/${state.version}`);
    }).catch(() => {
      el.innerHTML = `
        <div class="space-y-4">
          <div id="group-terminal-card-fallback"></div>
          <div class="flex items-center gap-2 text-sm text-muted">
            <span class="spinner spinner-sm"></span> Waiting for grouping...
          </div>
        </div>`;

      const termEl = document.getElementById("group-terminal-card-fallback");
      renderTerminalCard(termEl, `group ${state.roundName}/${state.version}`);
    });

    state.schedulePoll(pollForGroups, 3000);
  }

  function renderGroupsLoaded() {
    state.clearPoll();
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
        await api.confirmGroups(state.roundName, state.version);
        await api.advance(state.roundName, state.version, { action: "confirm-groups" }).catch(() => {});
        const stepContent = document.getElementById("group-step-content");
        if (stepContent) {
          stepContent.innerHTML = `<div style="text-align:center;padding:var(--space-8)">
            <div class="confirm-success-check">${icon("check", 24)}</div>
            <p style="margin-top:var(--space-4);color:var(--accent);font-weight:600">Groups confirmed</p>
          </div>`;
        }
        setTimeout(() => { state.step = 4; state.save(); state.render(); }, 800);
      } catch (e) {
        showToast("Failed to confirm groups: " + e.message);
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = `Confirm Groups ${icon("check", 14)}`;
      }
    });
  }

  // Entry point: check scan status and decide what to show
  api.getScanStatus(state.roundName, state.version).then(data => {
    if (data.status === "scanned") {
      pollForGroups();
    } else if (data.status === "done") {
      state.step = 4;
      state.save();
      state.render();
    } else if (data.status === "scanning") {
      renderScanning();
      state.schedulePoll(pollScanStatus, 2000);
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
    document.getElementById("retry-scan-btn").addEventListener("click", () => {
      el.innerHTML = `<div class="text-sm text-secondary"><span class="spinner spinner-sm"></span> Checking scan status...</div>`;
      api.getScanStatus(state.roundName, state.version).then(data => {
        if (data.status === "scanned") pollForGroups();
        else triggerScan();
      }).catch(() => triggerScan());
    });
  });
}

export function renderProjectReady(content, state) {
  content.innerHTML = `
    <h2 style="margin-bottom:var(--space-6)">Review Ready</h2>
    <div id="project-ready-summary"></div>
    <div id="project-ready-terminal"></div>`;

  // Load group summary
  api.getTasks(state.roundName, state.version).then(tasks => {
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

  state.setDirty(false);
  localStorage.removeItem(`audit-wizard-${state.roundName}-${state.version}`);

  const termEl = document.getElementById("project-ready-terminal");
  termEl.innerHTML = `
    <div style="text-align:center;padding:var(--space-4)">
      <button id="project-start-review-btn" class="btn btn-primary">${icon("zap", 14)} Start Review</button>
    </div>`;

  document.getElementById("project-start-review-btn")?.addEventListener("click", async () => {
    const btn = document.getElementById("project-start-review-btn");
    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner spinner-sm"></span> Starting...';
    try {
      await api.advance(state.roundName, state.version, { action: "start" });
      await api.updateSessionStatus(state.roundName, state.version, "reviewing");
      location.hash = `#/round/${encodeURIComponent(state.roundName)}/${state.version}/progress`;
    } catch (e) {
      showToast("Failed to start review: " + e.message);
      btn.disabled = false;
      btn.innerHTML = originalHTML;
    }
  });

  // Poll for session status change — auto-redirect when review starts
  function pollProjectReadyStatus() {
    api.getSession(state.roundName, state.version).then(session => {
      if (session.status === "reviewing" || session.status === "completed") {
        location.hash = `#/round/${encodeURIComponent(state.roundName)}/${state.version}/progress`;
        return;
      }
      state.schedulePoll(pollProjectReadyStatus, 3000);
    }).catch(() => {
      state.schedulePoll(pollProjectReadyStatus, 5000);
    });
  }
  pollProjectReadyStatus();
}
