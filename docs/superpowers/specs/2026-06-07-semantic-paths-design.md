# Semantic Paths for Rounds and Sessions

Date: 2026-06-07

## Problem

Current storage uses ISO timestamps for both round and session directory names:
```
~/.audit/<project>/2026-06-07T07-43-01.248Z/2026-06-07T07-43-04.336Z/index.yaml
```
This is unreadable, makes debugging hard, and causes bugs — the stories handler constructs paths via direct concatenation instead of using `resolveSessionPath`, so round-scoped sessions return 404.

## Solution

Use human-readable names: round name for round directories, version numbers (`v1`, `v2`) for session directories.

### New directory layout

```
~/.audit/<project>/
  audit-round-1/
    round.yaml
    v1/
      index.yaml
      code-tasks/
      story-tasks/
      project-tasks/
      review-context.md
    v2/
      index.yaml
      ...
```

### Round creation

- `POST /api/rounds` creates `reportsDir/<name>/round.yaml`
- If directory already exists, return 409 Conflict
- Round name is the sole identifier (no separate `id` field)
- `sanitizePath` validates the name (no `..`, `/`, `\`, `\0`)

### Session creation

- `POST /api/rounds/:roundName/sessions` scans existing `v*` directories, picks `max + 1`
- Session directory is `v<N>/`, session ID is the string `v<N>`
- No timestamp generation

### Path resolution

`resolveSessionPath(reportsDir, roundName, version)`:
- Validates `roundName` via `sanitizePath`
- Validates `version` matches `^v\d+$`
- Returns `reportsDir/roundName/version/index.yaml`
- No directory scanning needed

## API route changes

All session routes nest under rounds. The flat `/api/sessions` routes are removed entirely.

### Round routes (unchanged path pattern, `:roundId` → `:roundName`)

| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/rounds` | Returns `{ name }` instead of `{ id, name }` |
| GET | `/api/rounds` | Each item's `id` field becomes `name` |
| GET | `/api/rounds/:roundName` | |
| POST | `/api/rounds/:roundName/sessions` | Returns `{ version, roundName }` |
| POST | `/api/rounds/:roundName/re-review` | |
| GET | `/api/rounds/:roundName/summary` | |

### Session routes (all nested, `:version` matches `v\d+`)

| Method | Path |
|--------|------|
| GET | `/api/rounds/:roundName/sessions/:version` |
| PUT | `/api/rounds/:roundName/sessions/:version/status` |
| PATCH | `/api/rounds/:roundName/sessions/:version` |
| GET | `/api/rounds/:roundName/sessions/:version/review-context` |
| PUT | `/api/rounds/:roundName/sessions/:version/review-context` |
| POST | `/api/rounds/:roundName/sessions/:version/review-notes` |
| GET | `/api/rounds/:roundName/sessions/:version/stories` |
| POST | `/api/rounds/:roundName/sessions/:version/stories` |
| PUT | `/api/rounds/:roundName/sessions/:version/stories/map` |
| PUT | `/api/rounds/:roundName/sessions/:version/stories/:name` |
| DELETE | `/api/rounds/:roundName/sessions/:version/stories/:name` |
| GET | `/api/rounds/:roundName/sessions/:version/tasks` |
| GET | `/api/rounds/:roundName/sessions/:version/tasks/summary` |
| POST | `/api/rounds/:roundName/sessions/:version/tasks/review` |
| GET | `/api/rounds/:roundName/sessions/:version/notes` |
| POST | `/api/rounds/:roundName/sessions/:version/notes` |
| POST | `/api/rounds/:roundName/sessions/:version/scan` |
| GET | `/api/rounds/:roundName/sessions/:version/scan/status` |
| POST | `/api/rounds/:roundName/sessions/:version/scope` |
| GET | `/api/rounds/:roundName/sessions/:version/graph-data` |
| GET | `/api/rounds/:roundName/sessions/:version/groups` |
| PUT | `/api/rounds/:roundName/sessions/:version/groups` |
| POST | `/api/rounds/:roundName/sessions/:version/groups/confirm` |

### Removed routes

| Method | Path | Reason |
|--------|------|--------|
| GET | `/api/sessions` | Superseded by sessions nested in `GET /api/rounds` |
| POST | `/api/sessions` | Must create via round |
| GET/PUT/PATCH | `/api/sessions/:id/*` | All nested under rounds |

### `/wait` endpoint

Returns `{ roundName, version, action }` instead of `{ sessionId, action }`.

## Files to modify

### Backend (`scripts/`)

1. **`lib/session.mjs`** — Core rewrite:
   - Remove `sessionId()` (no timestamp generation)
   - `resolveSessionPath(reportsDir, roundName, version)` — direct path join, no scanning
   - `createSession(reportsDir, roundName, version, options)` — uses `v<N>` dir
   - `listSessions(reportsDir, roundName)` — scans `v*` dirs only
   - `getSession`, `updateSessionStatus`, `updateSession`, `resetReviewing` — all take `roundName` param
   - `index.yaml` session object: `id` = `v<N>`, `roundId` → `roundName`

2. **`server/handlers/rounds.mjs`** — `:roundId` → `:roundName`, duplicate name → 409, version-numbered sessions

3. **`server/handlers/sessions.mjs`** — Re-register all routes as nested under rounds

4. **`server/handlers/stories.mjs`** — Nested routes + use `resolveSessionPath` (fixes the 404 bug)

5. **`server/handlers/tasks.mjs`**, **`notes.mjs`**, **`reviews.mjs`**, **`project-scan.mjs`** — Nested routes

6. **`server/handlers/audit.mjs`** — `/wait` returns `{ roundName, version, action }`

7. **`server/index.mjs`** — Update route registration order for nested patterns

### Frontend (`scripts/public/js/`)

8. **`api.mjs`** — All session methods take `(roundName, version, ...)` instead of `(id, ...)`

9. **`app.mjs`** — Hash routes change to `#/round/<name>/v<N>/<view>`

10. **`views/*.mjs`**, **`components/*.mjs`** — Adapt API calls and URL construction

### Skill prompt

11. **`skills/audit/SKILL.md`** — Updated curl examples using round name + version

### Sub-agent prompts

12. **`skills/audit/prompts/*.md`** — Context fields change from `session-id` + `round-id` to `round-name` + `version`

## Backward compatibility

None. Old timestamp-based directories are not supported. Clean `~/.audit/` before upgrading.
