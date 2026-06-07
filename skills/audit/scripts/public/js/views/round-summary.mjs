// skills/audit/scripts/public/js/views/round-summary.mjs
import { api } from "../api.mjs";
import { showToast, setBreadcrumb, icon, escapeHtml } from "../app.mjs";
import { scoreColor } from "../constants.mjs";

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

const FINDING_STATUS_CONFIG = {
  "need-fix":   { label: "Need Fix",    badge: "badge-ready",     color: "var(--warning)" },
  "wont-fix":   { label: "Won't Fix",   badge: "badge-created",   color: "var(--text-muted)" },
  "not-an-issue": { label: "Not an Issue", badge: "badge-created", color: "var(--text-muted)" },
  "well-done":  { label: "Well Done",   badge: "badge-completed",  color: "var(--success)" },
  "pending":    { label: "Pending",     badge: "badge-reviewing",  color: "var(--info)" },
};

export async function renderRoundSummary(container, params) {
  const roundName = params[0];
  if (!roundName) { location.hash = "#/home"; return; }

  setBreadcrumb([{ label: "Rounds", href: "#/home" }]);

  container.innerHTML = `<div class="skeleton skeleton-card"></div>`;

  let round;
  let summary;

  try {
    [round, summary] = await Promise.all([
      api.getRound(roundName),
      api.getRoundSummary(roundName),
    ]);
  } catch (e) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">${icon("alertTriangle", 56)}</div>
        <h2>Failed to load summary</h2>
        <p>${escapeHtml(e.message)}</p>
        <a href="#/home" class="btn btn-primary">${icon("arrowLeft", 14)} Back to Rounds</a>
      </div>`;
    return;
  }

  setBreadcrumb([
    { label: "Rounds", href: "#/home" },
    { label: round.name, href: `#/round/${encodeURIComponent(roundName)}` },
    { label: "Summary" },
  ]);

  const { files, stats } = summary;

  // Stat cards
  const statCards = [
    { label: "Total Files", value: stats.totalFiles, icon: "file" },
    { label: "Findings", value: stats.totalFindings, icon: "alertTriangle" },
    { label: "Need Fix", value: stats.needFix, icon: "zap", color: "var(--warning)" },
    { label: "Won't Fix", value: stats.wontFix, icon: "minus-circle" },
    { label: "Not an Issue", value: stats.notAnIssue, icon: "check" },
    { label: "Well Done", value: stats.wellDone, icon: "shield", color: "var(--success)" },
  ];

  container.innerHTML = `
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl">Round Summary</h1>
        <p class="text-sm text-muted mt-1">${escapeHtml(round.name)} &middot; Aggregated across ${files.length} file${files.length !== 1 ? "s" : ""}</p>
      </div>
      <a href="#/round/${encodeURIComponent(roundName)}" class="btn btn-ghost">
        ${icon("arrowLeft", 14)} Back to Round
      </a>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
      ${statCards.map(s => `
        <div class="card" style="text-align:center;padding:var(--space-3)">
          <div style="color:${s.color || "var(--text-secondary)"}">${icon(s.icon, 20)}</div>
          <div class="text-2xl font-bold mt-1" ${s.color ? `style="color:${s.color}"` : ""}>${s.value}</div>
          <div class="text-xs text-muted">${s.label}</div>
        </div>
      `).join("")}
    </div>

    ${files.length === 0 ? `
      <div class="empty-state">
        <div class="empty-state-icon">${icon("barChart", 48)}</div>
        <h2>No review data yet</h2>
        <p>Complete a review session to see aggregated findings.</p>
      </div>
    ` : `
      <div class="card">
        <div class="round-summary-table">
          <table>
            <thead>
              <tr>
                <th>File</th>
                <th style="text-align:center">Version</th>
                <th style="text-align:center">Score</th>
                <th style="text-align:center">Findings</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${files.map(f => {
                const scoreVal = f.review?.score ?? 0;
                const sc = scoreColor(scoreVal);
                const findings = f.findings || [];
                const statuses = new Set(findings.map(fi => fi.status || "pending"));
                return `
                  <tr>
                    <td class="font-mono text-sm">${escapeHtml(f.name)}</td>
                    <td style="text-align:center"><span class="version-badge">v${f.latestVersion}</span></td>
                    <td style="text-align:center"><span style="color:${sc};font-weight:600">${scoreVal}/10</span></td>
                    <td style="text-align:center">${findings.length}</td>
                    <td>
                      <div class="flex items-center gap-1 flex-wrap">
                        ${[...statuses].map(st => {
                          const cfg = FINDING_STATUS_CONFIG[st] || FINDING_STATUS_CONFIG.pending;
                          const count = findings.filter(fi => (fi.status || "pending") === st).length;
                          return `<span class="badge ${cfg.badge}" style="font-size:11px">${count} ${cfg.label}</span>`;
                        }).join("")}
                      </div>
                    </td>
                  </tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `}
  `;
}
