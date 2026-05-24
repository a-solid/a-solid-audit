# CodeGraph CLI Integration for Project Scan

## Summary

Replace the regex-based `resolveImports` in `project-scan.mjs` with `codegraph` CLI calls, add server-side logging for the entire scan pipeline, and add frontend UI for CodeGraph status detection and real-time scan log display.

## Motivation

- `resolveImports` uses a static regex (`IMPORT_RE`) that only catches `import ... from './...'` and `require('./...')` patterns. It misses re-exports, dynamic imports, and cross-language dependencies.
- codegraph provides AST-level symbol resolution and call-chain tracking via a local CLI, already installed and indexed in this project.
- No visibility into the scan pipeline: when scanning fails or produces unexpected chunks, there is no way to diagnose without reading source code.

## Architecture

### Data Flow

```
Wizard (Configure Step)
  ├─ GET /api/codegraph/status?dir=...
  │   → detect CLI + .codegraph/ + index stats
  ├─ POST /api/codegraph/init { projectDir }
  │   → codegraph init -i && codegraph index
  └─ User clicks "Next" → save projectDir to session

Progress Page (Scanning Phase)
  ├─ POST /api/sessions/:id/scan
  │   → setProjectScope() calls scanProjectDir() → chunkFiles()
  │   → chunkFiles() calls resolveImportsViaCodegraph() instead of resolveImports()
  │   → each step logs to server stdout + in-memory buffer
  ├─ GET /api/sessions/:id/scan/logs (SSE)
  │   → streams buffered log entries to browser
  └─ Frontend renders scan log panel with auto-scroll
```

### Fallback

If codegraph CLI is not available or the project has no `.codegraph/` directory, `resolveImportsViaCodegraph` falls back to the original `resolveImports` regex-based approach. The log will indicate this fallback explicitly.

## Changes

### 1. Backend: `skills/audit/scripts/lib/project-scan.mjs`

#### 1a. New function: `resolveImportsViaCodegraph(filePath, projectDir)`

- Uses `child_process.execSync` to call `codegraph query --json -p ${projectDir}`.
- Parses JSON output to find symbols defined in `filePath`.
- For each symbol, traces its callees to find dependent files.
- Returns a deduplicated list of relative file paths.
- On any error (CLI not found, no index, parse failure), logs the error and falls back to the original `resolveImports`.
- Logs: CLI command, result count, timing.

#### 1b. Modify `chunkFiles(files, projectDir)`

- Replace `resolveImports(entry.path, projectDir)` calls with `resolveImportsViaCodegraph(entry.path, projectDir)`.
- Add logging at entry: total files received, number of entry points detected.
- Add logging per chunk: chunk id, name, type, file count.
- Add logging at exit: total chunks, merged count.

#### 1c. Modify `scanProjectDir(projectDir, options)`

- Log: start of scan, total files found after walk, count by priority level.

#### 1d. Modify `setProjectScope(projectDir, reportsDir, sid, scanOptions)`

- Log: start, projectDir, scanOptions.
- Log: scanProjectDir result (file count).
- Log: chunkFiles result (chunk count).
- Log: task generation result (task count, excluded files).
- Log: completion with timing.

#### 1e. Log buffer for SSE

- Add a module-level `Map<sessionId, string[]>` as in-memory log buffer.
- Each log entry is `{ timestamp, level, message }` serialized as a single line.
- `setProjectScope` pushes entries to this buffer.
- New export `getScanLogs(sid)` returns the buffered entries.
- Buffer is cleared when scan completes or on session cleanup.

### 2. Backend: `skills/audit/scripts/server/handlers/project-scan.mjs`

#### 2a. SSE endpoint: `GET /api/sessions/:id/scan/logs`

- Validates session exists and is project type.
- Sets `Content-Type: text/event-stream` and `Cache-Control: no-cache`.
- Sends buffered log entries as SSE `data:` lines.
- Keeps connection open until scan status changes from `scanning`.
- Uses `res.end()` to close when scan completes.

### 3. Backend: `skills/audit/scripts/server/handlers/settings.mjs` (extend)

#### 3a. `GET /api/codegraph/status`

Query params: `dir` (project directory path).

Steps:
1. Check if `codegraph` CLI is in PATH (`which codegraph` via `execSync`).
2. Check if `.codegraph/` exists under the given project directory.
3. If initialized, run `codegraph status --json -p ${dir}` to get index stats.
4. Return JSON: `{ available: bool, initialized: bool, indexed: bool, fileCount: number|null, symbolCount: number|null }`.
5. On any error, return the available/initialized state that was determined before the failure.

#### 3b. `POST /api/codegraph/init`

Body: `{ projectDir: string }`.

Steps:
1. Validate projectDir exists and is a directory.
2. Execute `codegraph init -i ${projectDir}` synchronously (typically fast).
3. Execute `codegraph index ${projectDir}` — this may take time for large projects.
4. Return `{ ok: true }` on success.
5. On failure, return error with stderr output.

For future improvement: the index step could be made async with SSE progress, but for now synchronous is acceptable since most projects index in under 10 seconds.

### 4. Backend: `skills/audit/scripts/server/handlers/project-scan.mjs` (extend)

Register the new SSE route in `registerProjectScanRoutes`. The router already supports async handlers; SSE just needs to avoid calling `jsonResponse` and instead write raw SSE frames.

### 5. Frontend: `skills/audit/scripts/public/js/api.mjs`

Add two new methods:

```js
getCodegraphStatus: (projectDir) =>
  request("GET", `/api/codegraph/status?dir=${encodeURIComponent(projectDir)}`),
initCodegraph: (projectDir) =>
  request("POST", "/api/codegraph/init", { projectDir }),
```

### 6. Frontend: `skills/audit/scripts/public/js/views/wizard.mjs`

#### 6a. `renderProjectConfigure()` — add CodeGraph status card

After the "Project Directory" input and before the "Review Context" section:

1. On mount, call `getCodegraphStatus(projectDir)` (use the input value, default to server's projectDir if empty).
2. Render a status card with three visual states:

**Ready state** (green left border):
```
┌─────────────────────────────────────────────────┐
│ [check icon]  CodeGraph — Ready                  │
│               68 files, 342 symbols indexed      │
│                                       [Re-index] │
└─────────────────────────────────────────────────┘
```

**Not initialized** (yellow left border):
```
┌─────────────────────────────────────────────────┐
│ [alertTriangle icon]  CodeGraph — Not Initialized│
│                       CLI detected but no index   │
│                       [Initialize & Index]        │
└─────────────────────────────────────────────────┘
```

**Not available** (red left border):
```
┌─────────────────────────────────────────────────┐
│ [xIcon icon]  CodeGraph — Not Available           │
│               CLI not found. Will use basic scan. │
└─────────────────────────────────────────────────┘
```

3. "Initialize & Index" button calls `initCodegraph(dir)`, shows spinner during execution, then re-checks status.
4. "Re-index" button calls `codegraph index` via the same init endpoint (or a dedicated reindex endpoint if split later).
5. Re-check status when project directory input changes (debounced 500ms).

### 7. Frontend: `skills/audit/scripts/public/js/views/progress.mjs`

#### 7a. Scan log panel

Inside the existing `scan-overlay` div, add a collapsible log panel below the status text and above the start button:

```html
<div class="scan-log-section" style="margin-top:var(--space-4)">
  <button id="scan-log-toggle" class="scan-log-toggle">
    [chevronDown icon] Scan Log
  </button>
  <div id="scan-log-panel" class="scan-log-panel">
    <!-- log entries appended here -->
  </div>
</div>
```

Behavior:
1. When scan starts (`POST /scan` succeeds), open an EventSource connection to `GET /api/sessions/:id/scan/logs`.
2. Each SSE message creates a `div.scan-log-entry` with timestamp and message.
3. Auto-scroll to bottom on new entries.
4. Panel starts collapsed; auto-expands when first log entry arrives.
5. Connection closes when scan completes (status becomes `ready`).
6. On navigation away, close the EventSource connection (existing `onNavigateCleanup`).

### 8. Frontend: `skills/audit/scripts/public/styles.css`

New CSS classes:

```css
/* CodeGraph status card */
.codegraph-status-card {
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  gap: var(--space-3);
  transition: border-color var(--duration-fast);
}
.codegraph-status-card.card-accent-success { border-left: 3px solid var(--success); }
.codegraph-status-card.card-accent-warning { border-left: 3px solid var(--warning); }
.codegraph-status-card.card-accent-info { border-left: 3px solid var(--info); }
/* (card-accent-danger already handled by card-accent-info with danger color) */

/* Scan log panel */
.scan-log-toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 0;
  border: none;
  background: none;
  color: var(--text-muted);
  font-size: var(--text-xs);
  font-family: var(--font-ui);
  cursor: pointer;
  margin-bottom: var(--space-2);
}
.scan-log-toggle:hover { color: var(--text-secondary); }
.scan-log-toggle .toggle-icon {
  transition: transform var(--duration-fast) var(--ease-spring);
}
.scan-log-toggle.open .toggle-icon { transform: rotate(90deg); }

.scan-log-panel {
  background: var(--bg-deep);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  max-height: 200px;
  overflow-y: auto;
  padding: var(--space-2);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: 1.6;
}
.scan-log-entry {
  animation: logFadeIn 200ms var(--ease-spring) forwards;
  opacity: 0;
  color: var(--text-secondary);
}
.scan-log-entry .log-time {
  color: var(--text-muted);
  margin-right: var(--space-2);
}
@keyframes logFadeIn {
  from { opacity: 0; transform: translateY(2px); }
  to { opacity: 1; transform: translateY(0); }
}
```

## Files Changed

| File | Type of Change |
|------|---------------|
| `skills/audit/scripts/lib/project-scan.mjs` | Replace resolveImports, add logging, add log buffer |
| `skills/audit/scripts/server/handlers/project-scan.mjs` | Add SSE log endpoint |
| `skills/audit/scripts/server/handlers/settings.mjs` | Add codegraph status + init endpoints |
| `skills/audit/scripts/public/js/api.mjs` | Add getCodegraphStatus, initCodegraph |
| `skills/audit/scripts/public/js/views/wizard.mjs` | Add CodeGraph status card in project configure step |
| `skills/audit/scripts/public/js/views/progress.mjs` | Add scan log panel with SSE |
| `skills/audit/scripts/public/styles.css` | Add codegraph + scan-log CSS classes |

## Out of Scope

- Async codegraph index with SSE progress (synchronous init is acceptable for now).
- Changes to `project-review.md` prompt (sub-agent codegraph usage remains optional).
- Settings page UI for configuring codegraph path (already exists as `codegraph.path` in settings.json).
- CodeGraph status caching (re-check on every wizard render is acceptable).
