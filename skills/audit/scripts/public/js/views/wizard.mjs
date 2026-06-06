// skills/audit/scripts/public/js/views/wizard.mjs
import { api } from "../api.mjs";
import { showToast, setBreadcrumb, icon, escapeHtml, initTabKeyboard, onNavigateCleanup } from "../app.mjs";
import { renderFileTree } from "../components/file-tree.mjs";
import { renderScopeFileTree } from "../components/scope-file-tree.mjs";
import { renderScopeStep } from "./wizard-scope.mjs";
import { renderStoriesStep } from "./wizard-stories.mjs";
import { renderProjectConfigure, renderGroupStep, renderProjectReady } from "./wizard-project.mjs";

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

export async function renderWizard(container, params) {
  let sessionId = params[0]?.split("?")[0];
  const isNew = !sessionId || sessionId === "new";
  const urlParams = new URLSearchParams(window.location.hash.split("?")[1] || "");
  let preselectType = urlParams.get("type");
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

    // If no localStorage data, try to restore from server for ready sessions
    if (!saved) {
      try {
        const session = await api.getSession(sessionId);
        if (session?.status === "ready" && session.type !== "project") {
          reviewType = session.type || "code";
          if (session.scope) {
            scopeMethod = session.scope.method || "uncommitted";
            scopeRef = session.scope.ref || "";
          }
          // Ready means all configuration done — go to final step
          step = reviewType === "all" ? 4 : 4;
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
          // If scope already confirmed (codeTasks exist), jump to step 3
          if (session.codeTasks?.length > 0 && session.type !== "project") {
            step = 3;
          } else {
            step = 2;
          }
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

  function goBack(targetStep, btnId) {
    if (!dirty) { step = targetStep; save(); render(); return; }
    const btn = document.getElementById(btnId);
    if (btn?.dataset.confirmPending === "true") {
      btn.dataset.confirmPending = "";
      setDirty(false);
      step = targetStep;
      save();
      render();
    } else if (btn) {
      btn.dataset.confirmPending = "true";
      const origHTML = btn.innerHTML;
      btn.innerHTML = `${icon("alertTriangle", 14)} Discard?`;
      btn.style.color = "var(--warning)";
      btn.style.borderColor = "var(--warning)";
      setTimeout(() => {
        btn.dataset.confirmPending = "";
        btn.innerHTML = origHTML;
        btn.style.color = "";
        btn.style.borderColor = "";
      }, 3000);
    }
  }

  let pollTimer = null;
  function clearPoll() {
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
  }
  function schedulePoll(fn, ms) {
    clearPoll();
    pollTimer = setTimeout(fn, ms);
  }

  // State object shared with sub-modules
  const state = {
    get sessionId() { return sessionId; },
    set sessionId(v) { sessionId = v; },
    get isNew() { return isNew; },
    get step() { return step; },
    set step(v) { step = v; },
    get prevStep() { return prevStep; },
    set prevStep(v) { prevStep = v; },
    get reviewType() { return reviewType; },
    set reviewType(v) { reviewType = v; },
    get scopeMethod() { return scopeMethod; },
    set scopeMethod(v) { scopeMethod = v; },
    get scopeRef() { return scopeRef; },
    set scopeRef(v) { scopeRef = v; },
    get stories() { return stories; },
    set stories(v) { stories = v; },
    get storyMappings() { return storyMappings; },
    set storyMappings(v) { storyMappings = v; },
    get excludedFiles() { return excludedFiles; },
    set excludedFiles(v) { excludedFiles = v; },
    get contextExpanded() { return contextExpanded; },
    set contextExpanded(v) { contextExpanded = v; },
    get scopeTreeInstance() { return scopeTreeInstance; },
    set scopeTreeInstance(v) { scopeTreeInstance = v; },
    get previewGeneration() { return previewGeneration; },
    set previewGeneration(v) { previewGeneration = v; },
    get pendingExpandIndex() { return pendingExpandIndex; },
    set pendingExpandIndex(v) { pendingExpandIndex = v; },
    get defaultProjectDir() { return defaultProjectDir; },
    set defaultProjectDir(v) { defaultProjectDir = v; },
    get dirty() { return dirty; },
    set dirty(v) { dirty = v; },
    save, setDirty, goBack, render: () => render(),
    clearPoll, schedulePoll,
  };

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

    const animClass = step === prevStep ? "" : (step > prevStep ? "wizard-step-enter" : "wizard-step-enter-back");
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
      <div id="wizard-content" class="${animClass}"></div>
    `;

    const content = document.getElementById("wizard-content");
    if (step === 1) renderStep1(content);
    else if (step === 2 && reviewType === "project") renderProjectConfigure(content, state);
    else if (step === 2) renderScopeStep(content, state);
    else if (step === 3 && reviewType === "project") renderGroupStep(content, state);
    else if (step === 3 && reviewType === "all") renderStoriesStep(content, state);
    else if (step === 3 && reviewType === "code") renderStep4(content);
    else if (step === 4 && reviewType === "project") renderProjectReady(content, state);
    else if (step === 4) renderStep4(content);
    else renderStep4(content);
  }

  function renderStep1(content) {
    if (preselectType && isNew) {
      reviewType = preselectType;
      preselectType = null;
    }
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
      <div class="wizard-nav" style="justify-content:flex-end">
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

  function renderStep4(content) {
    // For "all" sessions, ensure status is "ready" (setScope only marks "code" sessions as ready)
    if (reviewType === "all") {
      api.updateSessionStatus(sessionId, "ready").catch(e => {
        showToast("Failed to update session status: " + e.message, "warning");
      });
    }

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
      </div>
      <div id="step4-terminal"></div>
      <div class="wizard-nav">
        <button id="step4-back" class="btn btn-ghost" aria-label="Go back">${icon("arrowLeft", 14)} Back</button>
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
          } catch { /* silent fail — context is optional */ }
        }, 300);
      });
    }

    document.getElementById("step4-back").addEventListener("click", () => {
      clearPoll();
      goBack(reviewType === "code" ? 2 : 3, "step4-back");
    });

    // Start Review button
    const termEl = document.getElementById("step4-terminal");
    termEl.innerHTML = `
      <div style="text-align:center;padding:var(--space-4)">
        <button id="start-review-btn" class="btn btn-primary">${icon("zap", 14)} Start Review</button>
      </div>`;

    document.getElementById("start-review-btn").addEventListener("click", async () => {
      const btn = document.getElementById("start-review-btn");
      const originalHTML = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner spinner-sm"></span> Starting...';
      try {
        await api.advance(sessionId, { action: "start" });
        await api.updateSessionStatus(sessionId, "reviewing");
        location.hash = `#/progress/${sessionId}`;
      } catch (e) {
        showToast("Failed to start review: " + e.message);
        btn.disabled = false;
        btn.innerHTML = originalHTML;
      }
    });

    setDirty(false);
    localStorage.removeItem(`audit-wizard-${sessionId}`);
  }

  render();

  onNavigateCleanup(() => {
    window.onbeforeunload = null;
    clearPoll();
  });
}
