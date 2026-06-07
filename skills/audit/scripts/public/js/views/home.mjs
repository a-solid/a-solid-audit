// skills/audit/scripts/public/js/views/home.mjs
import { api } from "../api.mjs";
import { showToast, setBreadcrumb, icon, escapeHtml } from "../app.mjs";

function relativeTime(dateStr) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

const STATUS_CONFIG = {
  created:    { color: "text-muted",   accent: "",                    badge: "badge-created" },
  ready:      { color: "text-warning", accent: "card-accent-warning", badge: "badge-ready" },
  reviewing:  { color: "text-info",    accent: "card-accent-info",    badge: "badge-reviewing" },
  completed:  { color: "text-success", accent: "card-accent-success", badge: "badge-completed" },
};

function getLatestSession(sessions) {
  if (!sessions || sessions.length === 0) return null;
  return sessions
    .slice()
    .sort((a, b) => new Date(b.created) - new Date(a.created))[0];
}

function renderModal(container) {
  const overlay = document.createElement("div");
  overlay.id = "new-round-modal";
  overlay.style.cssText = "position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6)";
  overlay.innerHTML = `
    <div class="card" style="width:100%;max-width:440px;padding:24px;margin:16px">
      <h2 class="text-lg mb-4">New Audit Round</h2>
      <div class="mb-3">
        <label class="block text-sm font-medium mb-1">Round name <span class="text-danger">*</span></label>
        <input id="modal-round-name" type="text" class="input" placeholder="e.g. Sprint 24 Review" maxlength="120" autofocus />
      </div>
      <div class="mb-4">
        <label class="block text-sm font-medium mb-1">Description</label>
        <textarea id="modal-round-desc" class="input" rows="3" placeholder="Optional description of this audit round" maxlength="500"></textarea>
      </div>
      <div class="flex items-center justify-end gap-2">
        <button id="modal-cancel-btn" class="btn btn-ghost">Cancel</button>
        <button id="modal-create-btn" class="btn btn-primary">Create</button>
      </div>
    </div>
  `;
  container.appendChild(overlay);

  const nameInput = document.getElementById("modal-round-name");
  const descInput = document.getElementById("modal-round-desc");
  const cancelBtn = document.getElementById("modal-cancel-btn");
  const createBtn = document.getElementById("modal-create-btn");

  function close() {
    overlay.remove();
  }

  cancelBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  createBtn.addEventListener("click", async () => {
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.style.borderColor = "var(--danger, #ef4444)";
      nameInput.focus();
      return;
    }
    const description = descInput.value.trim();
    createBtn.disabled = true;
    createBtn.textContent = "Creating...";
    try {
      await api.createRound({ name, description });
      location.hash = `#/round/${encodeURIComponent(name)}`;
    } catch (e) {
      showToast("Failed to create round: " + e.message);
      createBtn.disabled = false;
      createBtn.textContent = "Create";
    }
  });

  nameInput.focus();
}

export async function renderHome(container) {
  setBreadcrumb([]);

  container.innerHTML = `
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl">Audit Rounds</h1>
        <p class="text-sm text-muted mt-1">Organized code review rounds with versioned sessions</p>
      </div>
      <button id="new-audit-btn" class="btn btn-primary">
        ${icon("plus", 16)}
        New Audit
      </button>
    </div>
    <div id="round-list"></div>
  `;

  document.getElementById("new-audit-btn").addEventListener("click", () => {
    renderModal(container);
  });

  const listEl = document.getElementById("round-list");
  listEl.innerHTML = Array.from({ length: 3 }, () =>
    `<div class="skeleton skeleton-card"></div>`
  ).join("");

  try {
    const rounds = await api.listRounds();

    if (rounds.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              <line x1="8" y1="11" x2="14" y2="11"/>
              <line x1="8" y1="14" x2="14" y2="14"/>
              <line x1="8" y1="8" x2="12" y2="8"/>
            </svg>
          </div>
          <h2>No audit rounds yet</h2>
          <p>Start by creating an audit round to organize code reviews into versioned sessions.</p>
          <div class="empty-state-cta-row">
            <button id="empty-new-audit-btn" class="btn btn-primary">${icon("plus", 16)} New Audit</button>
          </div>
        </div>
      `;
      document.getElementById("empty-new-audit-btn").addEventListener("click", () => {
        renderModal(container);
      });
      return;
    }

    listEl.innerHTML = `<div class="session-grid">
      ${rounds.map(r => {
        const latest = getLatestSession(r.sessions);
        const status = latest ? latest.status : "created";
        const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.created;
        const sessionCount = r.sessions ? r.sessions.length : 0;
        const latestVersion = latest ? latest.version : null;
        return `
          <div class="session-card card card-clickable ${cfg.accent}" data-name="${escapeHtml(r.name)}" tabindex="0" role="button" aria-label="${escapeHtml(r.name)}, ${status}">
            <div class="flex items-center justify-between">
              <div style="min-width:0;flex:1">
                <h3 class="text-base font-semibold truncate">${escapeHtml(r.name)}</h3>
                ${r.description ? `<p class="text-sm text-muted mt-1" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(r.description)}</p>` : ""}
                <div class="text-xs text-muted mt-2">
                  ${icon("clock", 12)} <span title="${new Date(r.created).toLocaleString()}">${relativeTime(r.created)}</span>
                </div>
              </div>
              <div class="flex items-center gap-4" style="flex-shrink:0;margin-left:16px">
                ${latestVersion != null ? `<span class="badge badge-created">v${latestVersion}</span>` : ""}
                <span class="text-sm text-muted">${sessionCount} session${sessionCount !== 1 ? "s" : ""}</span>
                <span class="badge ${cfg.badge}">${status}</span>
              </div>
            </div>
          </div>`;
      }).join("")}
    </div>`;

    listEl.querySelectorAll(".card-clickable").forEach(card => {
      card.addEventListener("click", () => {
        const name = card.dataset.name;
        location.hash = `#/round/${encodeURIComponent(name)}`;
      });
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          card.click();
        }
      });
    });
  } catch (e) {
    showToast("Failed to load rounds: " + e.message);
  }
}
