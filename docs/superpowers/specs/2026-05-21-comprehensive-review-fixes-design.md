# Comprehensive Code Review Fixes

Date: 2026-05-21

## Scope

Fix all issues found during a full project review, excluding Tailwind CSS concerns.

## Fixes

### Critical

1. **router.mjs: add DELETE method** — `router.mjs` only has GET/POST/PUT, but `stories.mjs` uses `router.delete()`. Server crashes on startup.
2. **notes.mjs: sanitize body.file** — `body.file` used in `path.join()` without sanitization. Path traversal risk.
3. **progress.mjs: escape session.status and t.status** — Unescaped values in innerHTML = XSS risk.
4. **git.mjs: validate scopeRef** — User-supplied ref passed as git arg without validation. Could be interpreted as git flags.
5. **readBody: handle malformed JSON** — Unhandled `JSON.parse` SyntaxError causes hanging connections.

### Major

6. **progress.mjs: fix timer leak** — Manual refresh creates duplicate intervals without clearing old one.
7. **review.mjs: guard shortcuts in inputs** — j/k/o/s keys fire during text input.
8. **Extract shared constants** — SEVERITY_LABELS, sevColors, scoreColor duplicated across review.mjs, summary.mjs, task-detail.mjs, print-task-detail.mjs.
9. **Print CSS: complete :root overrides** — `--text-primary`, `--bg-surface`, `--border` etc. resolve to dark-mode values on white paper.
10. **errorResponse: add default status** — Missing `status` parameter causes crash.
11. **audit.mjs: sanitize params.id at handler level** — Inconsistent with other handlers.
12. **tasks.mjs handler: sanitize params.id** — Relies on lib function, inconsistent.

### Minor

13. **story-card.mjs: dead code** — Never imported by any file.
14. **print-task-detail.mjs: severity sort fallback** — Unknown severities sort before critical.
15. **notes-panel.mjs: add aria-label to FAB** — Missing accessibility attribute.
16. **review.mjs: add loading state** — Empty content during initial data fetch.
17. **wizard.mjs: dead ternary on line 179** — Both branches are `3`.

## Approach

Sequential fixes, grouped by file to minimize context switches. No architectural changes.
