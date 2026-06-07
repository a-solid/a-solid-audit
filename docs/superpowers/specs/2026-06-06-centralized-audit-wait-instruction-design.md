> **Superseded by** [simplified-wait-endpoint-design.md](./2026-06-06-simplified-wait-endpoint-design.md).
> The per-session `POST /wait` with JSON body described here was replaced by a simpler `GET /wait` endpoint.

# Centralized Audit Directory + Wait-Instruction Mechanism

**Date:** 2026-06-06

## Problem

1. **Sessions are stored per-project** at `.audit/<session-id>/` inside the repo. This makes it hard to manage audits across multiple projects from one place.
2. **Manual handoffs break the AI flow.** The AI starts the server, tells the user to configure in the browser, then must **stop and wait** for the user to return to Claude Code and type `start review <session-id>`. The same happens for project scan grouping (`group <session-id>`).

## Design

### 1. Centralized Audit Root with Project Namespacing

#### Settings

Add to `settings.json`:

```json
{
  "audit": {
    "rootDir": "~/.audit",
    "projectName": null
  }
}
```

- `rootDir`: Absolute path or `~`-prefixed path for the centralized audit root. Default: `~/.audit`.
- `projectName`: Override for the project subdirectory name. Default: `path.basename(projectDir)`.

#### Directory structure

```
~/.audit/
  ├── my-repo/
  │   ├── 2026-06-06T10-30-00/
  │   │   ├── index.yaml
  │   │   ├── tasks/
  │   │   └── ...
  │   └── 2026-06-05T...
  └── other-repo/
      └── 2026-06-06T...
```

#### Implementation

**`lib/paths.mjs`** — add two functions:

```js
export function resolveReportsDir(projectDir) {
  const settings = loadAuditSettings();
  const rawRoot = settings.rootDir || "~/.audit";
  const rootDir = rawRoot.startsWith("~")
    ? path.join(os.homedir(), rawRoot.slice(1))
    : path.resolve(rawRoot);
  const projectName = resolveProjectName(projectDir, settings);
  return path.join(rootDir, projectName);
}

export function resolveProjectName(projectDir, settings) {
  if (settings.projectName) return settings.projectName;
  return path.basename(path.resolve(projectDir));
}
```

Where `loadAuditSettings()` reads `settings.json` and returns the `audit` section (or `{}`).

**`server/index.mjs`** — `startServer()` resolves `reportsDir` via `resolveReportsDir(projectDir)` instead of `path.join(projectDir, ".audit")`.

**`cli.mjs`** — same change: `getReportsDir()` uses `resolveReportsDir(projectDir)`.

**`server/handlers/settings.mjs`** — `toPublicResponse()` includes `audit` section. `PUT /api/settings` persists `audit.rootDir` and `audit.projectName`.

**Backward compatibility:** Existing `.audit/` directories in project roots are not touched. New sessions go to the centralized root. The `listSessions` function already reads from `reportsDir`, so it automatically picks up the new location.

### 2. Wait-Instruction HTTP Long-Poll Mechanism

#### API

**`POST /api/sessions/:id/wait`**

Request:
```json
{ "reason": "ready" }
```
- `reason`: `"ready"` (waiting for user to finish config and start review) or `"grouping"` (waiting for user to confirm groups).

Response (blocks until user acts or timeout):
```json
{ "action": "start", "data": {} }
```
- `action`: `"start"` (user clicked Start Review), `"confirm-groups"` (user confirmed groups), or `"timeout"`.
- Timeout: 10 minutes.

**`POST /api/sessions/:id/advance`**

Request:
```json
{ "action": "start" }
```
- `action`: `"start"` or `"confirm-groups"`.

Response:
```json
{ "ok": true }
```

#### Server implementation

In a new handler file `server/handlers/wait.mjs`:

```js
const waiters = new Map(); // sessionId -> { resolve, timer }

router.post("/api/sessions/:id/wait", async (req, res) => {
  const { reason } = JSON.parse(await readBody(req));
  const sid = sanitizePath(params.id);

  if (waiters.has(sid)) {
    return errorResponse(res, "Already waiting", "CONFLICT", 409);
  }

  const promise = new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ action: "timeout" }), 10 * 60 * 1000);
    waiters.set(sid, { resolve, timer });
  });

  const result = await promise;
  waiters.delete(sid);
  jsonResponse(res, result);
});

router.post("/api/sessions/:id/advance", async (req, res) => {
  const { action } = JSON.parse(await readBody(req));
  const sid = sanitizePath(params.id);

  const waiter = waiters.get(sid);
  if (!waiter) {
    return errorResponse(res, "No one waiting", "NOT_FOUND", 404);
  }

  clearTimeout(waiter.timer);
  waiter.resolve({ action, data: {} });
  jsonResponse(res, { ok: true });
});
```

#### Concurrency

- At most one waiter per session (second `/wait` returns 409).
- Server shutdown cancels all waiters (server `close` event clears the map).
- Timeout prevents connections from hanging forever.

### 3. Browser UX Changes

#### Ready step (code / story sessions)

Replace the terminal card in `renderStep4()` with a "Start Review" button:

- Button click calls `POST /api/sessions/:id/advance { action: "start" }`
- Also calls `PUT /api/sessions/:id/status { status: "reviewing" }` (same as current `start review` command)
- On success, redirects to `#/progress/<session-id>` immediately
- Polling for status change still works as fallback

#### Project group step

The existing "Confirm Groups" button already calls `api.confirmGroups()`. Add an `/advance` call alongside it so it also unblocks the AI:

```js
await api.confirmGroups(state.sessionId);
await api.advance(state.sessionId, { action: "confirm-groups" });
```

#### Project ready step

Same as the Ready step — replace the terminal card with a "Start Review" button that calls `/advance` and sets status to `reviewing`.

#### API client

Add to `api.mjs`:

```js
advance(sessionId, body) {
  return this.fetch(`/api/sessions/${sessionId}/advance`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
```

### 4. SKILL.md Flow Update

The AI orchestration flow changes from:

```
start server → tell user to configure → STOP AND WAIT for manual input → user types "start review <sid>" → begin review
```

To:

```
start server → create session → call /wait { reason: "ready" } → BLOCKS (user configures in browser, clicks Start Review) → response arrives → begin review loop immediately
```

For project scans:

```
... scan completes → call /wait { reason: "grouping" } → BLOCKS (user confirms groups in browser) → response arrives → begin review loop
```

No manual text input from the user at any checkpoint. The AI drives the entire flow.

## Files Changed

| File | Change |
|------|--------|
| `lib/paths.mjs` | Add `resolveReportsDir()`, `resolveProjectName()`, `loadAuditSettings()` |
| `lib/session.mjs` | No changes (already uses `reportsDir` parameter) |
| `server/index.mjs` | Use `resolveReportsDir()` instead of hardcoded `.audit` |
| `server/handlers/wait.mjs` | New file — `/wait` and `/advance` endpoints |
| `server/handlers/settings.mjs` | Add `audit` section to settings read/write |
| `cli.mjs` | Use `resolveReportsDir()` in `getReportsDir()` |
| `public/js/api.mjs` | Add `advance()` method |
| `public/js/views/wizard.mjs` | Replace terminal card with Start Review button in `renderStep4()` |
| `public/js/views/wizard-project.mjs` | Replace terminal card in `renderProjectReady()`, add `/advance` call to group confirm |
| `SKILL.md` | Update flow to use `/wait` instead of manual commands |
