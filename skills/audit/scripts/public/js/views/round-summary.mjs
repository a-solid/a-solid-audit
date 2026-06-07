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

/**
 * Build the SVG ring for the overall score hero.
 * @param {number} score 0-10
 * @param {string} color CSS color for the ring fill
 */
function scoreRingSVG(score, color) {
  const r = 34;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 10) * circ;
  return `<svg viewBox="0 0 80 80" width="80" height="80">
    <circle class="report-score-ring-bg" cx="40" cy="40" r="${r}"/>
    <circle class="report-score-ring-fill" cx="40" cy="40" r="${r}"
      stroke="${color}"
      stroke-dasharray="${circ}"
      stroke-dashoffset="${offset}"/>
  </svg>`;
}

/**
 * Build a mini score bar HTML snippet.
 * @param {number} score 0-10
 * @param {string} color CSS color for the fill
 */
function scoreBarHTML(score, color) {
  const pct = (score / 10) * 100;
  return `<span class="score-bar">
    <span class="score-bar-track"><span class="score-bar-fill" style="width:${pct}%;background:${color}"></span></span>
    <span style="color:${color};font-weight:600">${score}/10</span>
  </span>`;
}

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

  // ── Calculate overall average score ──
  const scoredFiles = files.filter(f => f.review?.score != null);
  const avgScore = scoredFiles.length
    ? scoredFiles.reduce((sum, f) => sum + f.review.score, 0) / scoredFiles.length
    : null;
  const hasScores = scoredFiles.length > 0;

  // Stat cards with accent attributes
  const statCards = [
    { label: "Total Files", value: stats.totalFiles, icon: "file", accent: "success" },
    { label: "Findings", value: stats.totalFindings, icon: "alertTriangle", accent: null },
    { label: "Need Fix", value: stats.needFix, icon: "zap", color: "var(--warning)", accent: "warning" },
    { label: "Won't Fix", value: stats.wontFix, icon: "minus-circle", accent: null },
    { label: "Not an Issue", value: stats.notAnIssue, icon: "check", accent: null },
    { label: "Well Done", value: stats.wellDone, icon: "shield", color: "var(--success)", accent: "success" },
  ];

  // ── Severity counting helper ──
  function severityCounts(findings) {
    const counts = { critical: 0, high: 0, major: 0, medium: 0, minor: 0, low: 0, info: 0 };
    for (const f of findings) {
      const sev = (f.severity || "").toLowerCase();
      if (sev in counts) counts[sev]++;
      else counts.info++;
    }
    return counts;
  }

  function severitySummaryHTML(counts) {
    const items = [];
    const sevColorMap = {
      critical: "var(--danger)", high: "var(--danger)", major: "var(--danger)",
      medium: "var(--warning)", minor: "var(--warning)", low: "var(--info)", info: "var(--info)",
    };
    const displayOrder = ["critical", "high", "major", "medium", "minor", "low", "info"];
    for (const sev of displayOrder) {
      if (counts[sev] > 0) {
        items.push(`<span class="severity-summary-item">
          <span class="severity-dot" style="background:${sevColorMap[sev]}"></span>
          ${counts[sev]} ${sev}
        </span>`);
      }
    }
    return items.length ? `<div class="severity-summary">${items.join("")}</div>` : "";
  }

  function renderFindingsByFile(filesData) {
    const HIGH_SEVERITIES = ["critical", "high", "major"];
    const enrichedFiles = [];
    const allFindings = [];
    for (const f of filesData) {
      const reviewFindings = f.review?.findings || [];
      if (reviewFindings.length === 0) continue;
      const noteFindings = f.findings || [];
      const fileFindings = [];
      for (let i = 0; i < reviewFindings.length; i++) {
        const rf = reviewFindings[i];
        const status = noteFindings[i]?.status || null;
        const isHighPriority = HIGH_SEVERITIES.includes(rf.severity) || status === "need-fix" || !status;
        const item = { severity: rf.severity, description: rf.description || "", status, line: rf.line || null, isHighPriority };
        fileFindings.push(item);
        allFindings.push(item);
      }
      enrichedFiles.push({ name: f.name, findings: fileFindings });
    }
    if (enrichedFiles.length === 0) return "";

    const hasActionable = allFindings.some(f => f.isHighPriority);

    return `
      <div class="mt-6">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-lg font-semibold">Findings by File</h2>
          <button id="toggle-findings-btn" class="btn btn-ghost btn-sm">
            ${hasActionable ? "Show all findings" : "Show actionable only"}
          </button>
        </div>
        ${!hasActionable ? `
          <div class="card" style="border-color:var(--accent);text-align:center;padding:var(--space-4)">
            ${icon("check", 18)} <span class="font-medium" style="color:var(--accent)">All findings resolved</span>
          </div>
        ` : ""}
        ${enrichedFiles.map(f => {
          const highPriority = f.findings.filter(f => f.isHighPriority);
          const lowPriority = f.findings.filter(f => !f.isHighPriority);
          if (highPriority.length === 0 && lowPriority.length === 0) return "";

          const counts = severityCounts(f.findings);

          return `
            <div class="summary-file-section">
              <div class="font-mono text-sm text-muted mb-2 mt-4">${escapeHtml(f.name)}</div>
              ${severitySummaryHTML(counts)}
              ${highPriority.map(f => renderSummaryFinding(f, true)).join("")}
              ${lowPriority.map(f => renderSummaryFinding(f, false)).join("")}
            </div>`;
        }).join("")}
      </div>`;
  }

  function renderSummaryFinding(f, isHighPriority) {
    const sevLabel = f.severity.toUpperCase();
    const sevColor = `var(--${f.severity === "critical" ? "danger" : f.severity === "high" || f.severity === "major" ? "danger" : f.severity === "medium" || f.severity === "minor" ? "warning" : "info"})`;
    const statusCfg = FINDING_STATUS_CONFIG[f.status || "pending"];

    // Line number display for high-priority findings
    const lineInfo = isHighPriority && f.line ? `<span class="text-muted" style="font-size:11px;margin-left:4px">L${f.line}</span>` : "";

    if (!isHighPriority) {
      // Resolved/low-priority: use accordion
      return `
        <div class="finding-accordion summary-finding-hidden">
          <details>
            <summary>
              <span class="accordion-chevron">${icon("chevronRight", 14)}</span>
              <span class="finding-severity-badge" style="background:${sevColor}">${sevLabel}</span>
              <span class="accordion-desc-trunc">${escapeHtml(f.description)}</span>
              ${statusCfg ? `<span class="finding-status-pill finding-status-pill-${f.status || "pending"}">${statusCfg.label}</span>` : ""}
            </summary>
            <div class="finding-accordion-body">
              <div class="finding-description">${escapeHtml(f.description)}</div>
              ${f.line ? `<div class="text-muted" style="font-size:11px;margin-top:2px">Line ${f.line}</div>` : ""}
              ${statusCfg ? `<span class="badge ${statusCfg.badge}" style="font-size:10px">${statusCfg.label}</span>` : ""}
            </div>
          </details>
        </div>`;
    }

    // High-priority: keep existing flat row style
    return `
      <div class="summary-finding-row summary-finding-high-priority">
        <span class="finding-severity-badge" style="background:${sevColor}">${sevLabel}</span>
        <span class="summary-finding-desc">${escapeHtml(f.description)}${lineInfo}</span>
        ${statusCfg ? `<span class="badge ${statusCfg.badge}" style="font-size:10px">${statusCfg.label}</span>` : ""}
      </div>`;
  }

  // ── Build score hero section ──
  let scoreHeroHTML = "";
  if (hasScores) {
    const avgRound = Math.round(avgScore * 10) / 10;
    const heroColor = avgRound >= 7 ? "var(--accent)" : avgRound >= 4 ? "var(--warning)" : "var(--danger)";
    scoreHeroHTML = `
      <div class="report-score-hero">
        <div class="report-score-ring">
          ${scoreRingSVG(avgRound, heroColor)}
          <div class="report-score-value" style="color:${heroColor}">${avgRound}</div>
        </div>
        <div class="report-score-info">
          <h2>Overall Score</h2>
          <p>${scoredFiles.length} file${scoredFiles.length !== 1 ? "s" : ""} reviewed &middot; ${stats.totalFindings} finding${stats.totalFindings !== 1 ? "s" : ""}</p>
        </div>
      </div>`;
  }

  container.innerHTML = `
    <div class="print-header">
      <h1>${escapeHtml(round.name)} — Audit Report</h1>
      <p>${new Date().toLocaleDateString()}</p>
    </div>

    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl">Round Summary</h1>
        <p class="text-sm text-muted mt-1">${escapeHtml(round.name)} &middot; Aggregated across ${files.length} file${files.length !== 1 ? "s" : ""}</p>
      </div>
      <div class="flex items-center gap-2">
        <button id="export-pdf-btn" class="btn btn-ghost">
          ${icon("download", 14)} Export PDF
        </button>
        <a href="#/round/${encodeURIComponent(roundName)}" class="btn btn-ghost">
          ${icon("arrowLeft", 14)} Back to Round
        </a>
      </div>
    </div>

    ${scoreHeroHTML}

    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
      ${statCards.map(s => `
        <div class="card report-stat-card" ${s.accent ? `data-accent="${s.accent}"` : ""}>
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
                const statuses = new Set(findings.filter(fi => fi).map(fi => fi.status || "pending"));
                const hasScore = f.review?.score != null;
                return `
                  <tr>
                    <td class="font-mono text-sm">${escapeHtml(f.name)}</td>
                    <td style="text-align:center"><span class="version-badge">v${f.latestVersion}</span></td>
                    <td style="text-align:center">${hasScore ? scoreBarHTML(scoreVal, sc) : `<span class="text-muted">—</span>`}</td>
                    <td style="text-align:center">${findings.length}</td>
                    <td>
                      <div class="flex items-center gap-1 flex-wrap">
                        ${[...statuses].map(st => {
                          const cfg = FINDING_STATUS_CONFIG[st] || FINDING_STATUS_CONFIG.pending;
                          const count = findings.filter(fi => fi && (fi.status || "pending") === st).length;
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
      ${renderFindingsByFile(files)}
    `}

    <div class="print-footer">
      Generated by A-Solid Audit &middot; ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}
    </div>
  `;

  document.getElementById("export-pdf-btn")?.addEventListener("click", () => {
    window.print();
  });

  const toggleBtn = document.getElementById("toggle-findings-btn");
  if (toggleBtn) {
    let showingAll = false;
    toggleBtn.addEventListener("click", () => {
      showingAll = !showingAll;
      container.querySelectorAll(".summary-finding-hidden").forEach(el => {
        el.style.display = showingAll ? "" : "none";
      });
      toggleBtn.innerText = showingAll ? "Show actionable only" : "Show all findings";
    });
  }
}
