// skills/audit/scripts/public/js/components/notes-panel.mjs
import { api } from "../api.mjs";
import { icon, showToast } from "../app.mjs";

export function initNotesPanel(root) {
  let panelOpen = false;
  let sessionId = null;
  let loadedContent = "";

  root.innerHTML = `
    <button id="notes-fab" class="notes-fab no-print" title="Edit review context" aria-label="Edit review context">
      ${icon("messageSquare", 20)}
    </button>
    <div id="notes-panel" class="notes-panel no-print">
      <div class="notes-panel-header">
        <div>
          <span class="font-medium text-sm">Review Context</span>
          <div class="text-xs text-muted" style="margin-top:2px">Project context for AI reviewers</div>
        </div>
        <button id="notes-close" class="btn btn-ghost btn-sm">${icon("x", 14)}</button>
      </div>
      <textarea id="notes-textarea" class="notes-textarea" placeholder="Add review context, key concerns, known issues..."></textarea>
      <div class="notes-panel-footer">
        <span id="notes-status" class="text-xs text-muted">Auto-saved on blur</span>
      </div>
    </div>
  `;

  const fab = document.getElementById("notes-fab");
  const panel = document.getElementById("notes-panel");
  const textarea = document.getElementById("notes-textarea");
  const closeBtn = document.getElementById("notes-close");
  const status = document.getElementById("notes-status");

  fab.addEventListener("click", () => togglePanel(true));
  closeBtn.addEventListener("click", () => togglePanel(false));

  // Close on click outside
  document.addEventListener("click", (e) => {
    if (panelOpen && !root.contains(e.target)) togglePanel(false);
  });

  // Auto-save on blur
  textarea.addEventListener("blur", async () => {
    if (!sessionId) return;
    const content = textarea.value;
    if (content === loadedContent) return;
    try {
      await api.setReviewContext(sessionId, content);
      loadedContent = content;
      status.textContent = "Saved";
      status.style.color = "var(--accent)";
      setTimeout(() => { status.textContent = "Auto-saved on blur"; status.style.color = ""; }, 2000);
    } catch (e) {
      showToast("Failed to save notes: " + e.message);
    }
  });

  function togglePanel(open) {
    panelOpen = open;
    panel.style.display = open ? "flex" : "none";
    fab.style.display = open ? "none" : "flex";
    if (open && sessionId) loadContent();
  }

  async function loadContent() {
    try {
      const data = await api.getReviewContext(sessionId);
      const match = (data.context || "").match(/## User Context\n([\s\S]*?)(?=\n## Review Notes|$)/);
      loadedContent = match ? match[1].trim() : (data.context || "").trim();
      textarea.value = loadedContent;
    } catch (e) {
      textarea.value = "";
      loadedContent = "";
    }
  }

  // Public API for app.mjs to call on route change
  return {
    updateSession(newSessionId) {
      sessionId = newSessionId;
      root.style.display = newSessionId ? "" : "none";
      if (panelOpen) {
        if (newSessionId) loadContent();
        else togglePanel(false);
      }
    },
  };
}
