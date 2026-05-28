// skills/audit/scripts/public/js/constants.mjs

export const SEVERITY_LABELS = {
  'partially-met': 'Partial',
  'not-met': 'Not Met',
  'met': 'Met',
  'positive': 'Positive',
};

export const SEVERITY_COLORS = {
  critical: "var(--danger)", major: "var(--danger)", high: "var(--danger)",
  medium: "var(--warning)", minor: "var(--warning)",
  low: "var(--info)", info: "var(--info)",
  met: "var(--accent)",
  positive: "var(--accent)",
};

export function scoreColor(score) {
  return score >= 7 ? "var(--accent)" : score >= 4 ? "var(--warning)" : "var(--danger)";
}

export const ENTRY_TYPES = {
  api:       { label: "API",       color: "var(--info)" },
  scheduled: { label: "Cron",      color: "var(--warning)" },
  consumer:  { label: "Consumer",  color: "#a78bfa" },
  script:    { label: "Script",    color: "var(--accent)" },
  unknown:   { label: "Module",    color: "var(--text-muted)" },
};

export function aggregateFindings(tasks, notes) {
  const noteTasks = notes?.tasks || [];
  let needFix = 0, wontFix = 0, notAnIssue = 0, wellDone = 0, pendingCount = 0;
  const bySeverity = {};
  let totalFindings = 0;
  tasks.forEach(t => {
    const findings = t.review?.findings || [];
    totalFindings += findings.length;
    findings.forEach(f => {
      bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
    });
    const noteTask = noteTasks.find(nt => nt.file === t.file);
    findings.forEach((f, i) => {
      const status = noteTask?.findings?.[i]?.status;
      if (status === "need-fix") needFix++;
      else if (status === "wont-fix") wontFix++;
      else if (status === "not-an-issue") notAnIssue++;
      else if (status === "well-done") wellDone++;
      else pendingCount++;
    });
  });
  const reviewed = needFix + wontFix + notAnIssue + wellDone;
  return { totalFindings, bySeverity, needFix, wontFix, notAnIssue, wellDone, pendingCount, reviewed };
}
