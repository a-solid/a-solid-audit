# Simplified `/wait` Endpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the verbose session-scoped `/wait` long-poll with a simple `GET /wait` that returns plain text containing the session ID and action.

**Architecture:** A single global signal slot (in-memory variable) replaces the per-session `Map`. `GET /wait` blocks until `POST /advance` writes the signal. Response is `text/plain` with session ID and action.

**Tech Stack:** Node.js (no dependencies), vanilla browser JS, existing custom router.

---

### Task 1: Rewrite `wait.mjs` — global signal + `GET /wait` + updated `POST /advance`

**Files:**
- Modify: `skills/audit/scripts/server/handlers/wait.mjs` (full rewrite)

- [ ] **Step 1: Replace the entire file content**

Replace `skills/audit/scripts/server/handlers/wait.mjs` with:

```js
// skills/audit/scripts/server/handlers/wait.mjs
import { sanitizePath } from "../../lib/session.mjs";
import { jsonResponse, errorResponse, readBody } from "../index.mjs";

const WAIT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

let signal = null; // { sessionId, action } or null
let signalResolve = null; // () => void — resolves the pending /wait Promise

export function registerWaitRoutes(router) {
  // GET /wait
  // Blocks until /advance is called or timeout. Returns plain text.
  router.get("/wait", async (req, res) => {
    // If signal already set (advance arrived before /wait), return immediately
    if (signal) {
      const { sessionId, action } = signal;
      signal = null;
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(`Session ${sessionId} ready.\nAction: ${action}`);
      return;
    }

    // Block until advance arrives or timeout
    const result = await new Promise((resolve) => {
      const timer = setTimeout(() => {
        signalResolve = null;
        resolve(null);
      }, WAIT_TIMEOUT_MS);

      signalResolve = () => {
        clearTimeout(timer);
        const s = signal;
        signal = null;
        signalResolve = null;
        resolve(s);
      };
    });

    if (!result) {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("Timeout: no signal received within 600s.");
      return;
    }

    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(`Session ${result.sessionId} ready.\nAction: ${result.action}`);
  });

  // POST /api/sessions/:id/advance
  // Writes signal and resolves pending /wait if any.
  router.post("/api/sessions/:id/advance", async (req, res, params) => {
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      return errorResponse(res, "Invalid JSON", "PARSE_ERROR", 400);
    }

    const action = body.action;
    if (!action || !["start", "confirm-groups"].includes(action)) {
      return errorResponse(res, "Invalid action: must be 'start' or 'confirm-groups'", "VALIDATION_ERROR", 400);
    }

    const sessionId = sanitizePath(params.id);

    signal = { sessionId, action };

    if (signalResolve) {
      signalResolve();
    }

    jsonResponse(res, { ok: true });
  });
}

// Cancel pending waiter (for server shutdown)
export function cancelAllWaiters() {
  if (signalResolve) {
    signal = null;
    signalResolve();
  }
}
```

- [ ] **Step 2: Verify the server starts**

Run: `node skills/audit/scripts/cli.mjs server 3457 &` then `curl -s http://localhost:3457/api/sessions`, then kill the process.

Expected: server starts, responds with `[]`.

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/server/handlers/wait.mjs
git commit -m "refactor: replace per-session wait map with global signal slot"
```

---

### Task 2: Update `api.mjs` — add `sessionId` to advance body

**Files:**
- Modify: `skills/audit/scripts/public/js/api.mjs:32-33`

- [ ] **Step 1: Update the `advance` method**

In `skills/audit/scripts/public/js/api.mjs`, change line 32-33 from:

```js
  advance: (id, body) =>
    request("POST", `/api/sessions/${encodeURIComponent(id)}/advance`, body),
```

To:

```js
  advance: (id, body) =>
    request("POST", `/api/sessions/${encodeURIComponent(id)}/advance`, { sessionId: id, ...body }),
```

- [ ] **Step 2: Commit**

```bash
git add skills/audit/scripts/public/js/api.mjs
git commit -m "feat: include sessionId in advance request body"
```

---

### Task 3: Update `SKILL.md` — simplify all `/wait` references

**Files:**
- Modify: `skills/audit/SKILL.md`

- [ ] **Step 1: Replace the `/wait` curl in section 1 (startup)**

In `skills/audit/SKILL.md`, find this block (lines 39-43):

```markdown
   5. **Wait for user to finish configuring** by calling the long-poll endpoint:
   ```bash
   curl -s -X POST http://localhost:3456/api/sessions/<session-id>/wait -H 'Content-Type: application/json' -d '{"reason":"ready"}'
   ```
   This blocks until the user clicks "Start Review" in the browser, or times out after 10 minutes.
   6. When the response arrives with `{"action":"start"}`, proceed to the review loop.
```

Replace with:

```markdown
   5. **Wait for user to finish configuring** by calling:
   ```bash
   curl http://localhost:3456/wait
   ```
   This blocks until the user clicks "Start Review" in the browser, or times out after 10 minutes.
   6. When the response arrives with the session ID and action, proceed to the review loop.
```

- [ ] **Step 2: Update section 2 header**

Change line 46 from:

```markdown
### 2. Begin Review (after /wait resolves with action "start")
```

To:

```markdown
### 2. Begin Review (after /wait resolves)
```

- [ ] **Step 3: Replace the `/wait` curl in section 5 (project grouping)**

Find this block (lines 106-109):

```markdown
   ```bash
   curl -s -X POST http://localhost:3456/api/sessions/<session-id>/wait \
     -H 'Content-Type: application/json' \
     -d '{"reason":"grouping"}'
   ```
   This blocks until the user reviews and confirms groups in the browser.
   4. When the response arrives with `{"action":"confirm-groups"}`, the groups are confirmed and tasks are generated. Proceed to the review loop.
```

Replace with:

```markdown
   ```bash
   curl http://localhost:3456/wait
   ```
   This blocks until the user reviews and confirms groups in the browser.
   4. When the response arrives with the session ID and action, the groups are confirmed and tasks are generated. Proceed to the review loop.
```

- [ ] **Step 4: Commit**

```bash
git add skills/audit/SKILL.md
git commit -m "docs: simplify /wait curl commands in SKILL.md"
```

---

### Task 4: Manual smoke test

- [ ] **Step 1: Start the server**

```bash
node skills/audit/scripts/cli.mjs server 3456
```

- [ ] **Step 2: Create a session**

```bash
curl -s -X POST http://localhost:3456/api/sessions -H 'Content-Type: application/json' -d '{"type":"code"}'
```

Note the `id`.

- [ ] **Step 3: Test `GET /wait` timeout**

```bash
curl http://localhost:3456/wait
```

Wait a few seconds, then Ctrl+C. The endpoint is blocking — this confirms the long-poll works.

- [ ] **Step 4: Test the full flow — advance then wait**

In terminal 1:
```bash
curl http://localhost:3456/wait
```

In terminal 2 (while terminal 1 is blocking):
```bash
curl -s -X POST http://localhost:3456/api/sessions/<session-id-from-step-2>/advance -H 'Content-Type: application/json' -d '{"action":"start"}'
```

Expected terminal 1 output:
```
Session <session-id> ready.
Action: start
```

- [ ] **Step 5: Test advance-before-wait (immediate return)**

In terminal 2:
```bash
curl -s -X POST http://localhost:3456/api/sessions/<session-id>/advance -H 'Content-Type: application/json' -d '{"action":"start"}'
```

Then in terminal 1:
```bash
curl http://localhost:3456/wait
```

Expected: immediate response with `Session <session-id> ready.\nAction: start`.
