// skills/audit/scripts/public/js/constants.mjs

export const SEVERITY_LABELS = {
  'partially-met': 'Partial',
  'not-met': 'Not Met',
  'met': 'Met',
};

export const SEVERITY_COLORS = {
  critical: "var(--danger)", major: "var(--danger)", high: "var(--danger)",
  medium: "var(--warning)", minor: "var(--warning)",
  low: "var(--info)", info: "var(--info)",
};

export function scoreColor(score) {
  return score >= 7 ? "var(--accent)" : score >= 4 ? "var(--warning)" : "var(--danger)";
}
