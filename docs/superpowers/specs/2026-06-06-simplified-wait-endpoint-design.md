# Simplified `/wait` Endpoint

## Problem

The current `/wait` flow requires the AI to pass a session ID and reason in a long-poll request:

```bash
curl -s -X POST http://localhost:3456/api/sessions/<session-id>/wait \
  -H 'Content-Type: application/json' -d '{"reason":"ready"}'
```

This is verbose, couples the AI to session management details, and requires the AI to know the session ID before waiting.

## Solution

Replace the per-session `Map<string, {resolve, timer}>` waiters with a single global signal slot. The AI calls a minimal `GET /wait` with no parameters; the response includes the session ID and action as plain text.

## Signal Mechanism

Replace `waiters` Map with:

```js
let signal = null;        // { sessionId, action, data } or null
let signalResolve = null; // () => void — resolves the pending /wait Promise
```

One slot, first-come-first-served. The server only handles one audit session at a time in practice.

## `GET /wait` Endpoint

- **Path:** `GET /wait` (root level, no `/api` prefix)
- **Response type:** `text/plain`
- **Behavior:**
  1. If `signal` is already set (user clicked before AI called `/wait`): return immediately, clear `signal`
  2. If `signal` is null: block on a Promise (10-minute timeout). When `/advance` resolves it, read `signal`, return text, clear
- **Response format:**
  ```
  Session 2026-06-06T13-24-54.663Z ready.
  Action: start
  ```
- **Timeout response:**
  ```
  Timeout: no signal received within 600s.
  ```
  HTTP 200 (not an error — the AI should handle this gracefully).

## `POST /api/sessions/:id/advance` Endpoint

- **Request body:** `{ sessionId: string, action: "start" | "confirm-groups" }`
- **Behavior:**
  1. Write `{ sessionId, action, data: {} }` to global `signal`
  2. If `signalResolve` is set (a `/wait` is pending): resolve the Promise, set `signalResolve = null`
  3. If no pending `/wait`: signal stays set for the next `GET /wait` to pick up immediately
- **Response:** `{ ok: true }` (unchanged)

## Frontend Changes

### `api.mjs`

- `advance(id, body)` sends `{ sessionId: id, ...body }` instead of just `body`

### `wizard.mjs`, `wizard-project.mjs`

- Existing `api.advance(sessionId, { action: "start" })` calls work as-is; the `api.mjs` change handles adding `sessionId` to the body

## SKILL.md Updates

Replace all occurrences of:
```bash
curl -s -X POST http://localhost:3456/api/sessions/<session-id>/wait \
  -H 'Content-Type: application/json' -d '{"reason":"ready"}'
```

With:
```bash
curl http://localhost:3456/wait
```

Update surrounding prose to note: no body, no session ID, plain text response.

## Cleanup

- Remove the old `POST /api/sessions/:id/wait` route
- Remove `reason` validation (`"ready"` / `"grouping"` checks)
- Simplify `cancelAllWaiters()` — resolve `signalResolve` if set, clear both variables
- Remove `WAIT_TIMEOUT_MS` constant (reuse same 600000 value)

## Files Changed

| File | Change |
|---|---|
| `skills/audit/scripts/server/handlers/wait.mjs` | Rewrite: global signal, `GET /wait`, updated `/advance` |
| `skills/audit/scripts/public/js/api.mjs` | `advance()` adds `sessionId` to body |
| `skills/audit/SKILL.md` | Replace all `/wait` curl commands with `curl localhost:3456/wait` |

## Non-Goals

- Multi-session concurrent waiting (already unsupported)
- Persisting signal across server restarts (unnecessary — server runs for the audit duration)
- Changing the `/advance` endpoint path (it's internal to the browser JS)
