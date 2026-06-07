# Idempotent Session Status Transitions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `updateSessionStatus` return success when the session is already in the target status, instead of throwing CONFLICT.

**Architecture:** Add a single early-return guard in `updateSessionStatus` before the transition validation. The state machine stays unchanged — only same-state transitions become no-ops.

**Tech Stack:** Node.js (ESM), no test framework (manual verification)

---

### Task 1: Add idempotent guard to updateSessionStatus

**Files:**
- Modify: `skills/audit/scripts/lib/session.mjs:164-166`

- [ ] **Step 1: Add the idempotent early return**

In `skills/audit/scripts/lib/session.mjs`, inside `updateSessionStatus`, add a guard after line 164 (`const current = ...`) and before line 166 (`const type = ...`):

```javascript
  const current = index.session.status || "created";
  // Idempotent — already in target state
  if (newStatus === current) {
    return index.session;
  }
  const type = index.session.type || "code";
```

- [ ] **Step 2: Verify the fix with a manual test**

1. Start the server: `node skills/audit/scripts/cli.mjs server`
2. Create a round and session:
   ```bash
   curl -s -X POST http://localhost:3456/api/rounds -H 'Content-Type: application/json' -d '{"name":"test-idempotent"}'
   curl -s -X POST http://localhost:3456/api/rounds/test-idempotent/sessions -H 'Content-Type: application/json' -d '{"type":"code"}'
   ```
3. Transition to ready (simulates scope confirm):
   ```bash
   curl -s -X PUT http://localhost:3456/api/rounds/test-idempotent/sessions/v1/status -H 'Content-Type: application/json' -d '{"status":"ready"}'
   ```
4. Call ready again — should now return success instead of 409:
   ```bash
   curl -s -X PUT http://localhost:3456/api/rounds/test-idempotent/sessions/v1/status -H 'Content-Type: application/json' -d '{"status":"ready"}'
   ```
   Expected: `{"id":"v1","type":"code","status":"ready",...}` (no error)
5. Verify invalid transitions still fail:
   ```bash
   curl -s -X PUT http://localhost:3456/api/rounds/test-idempotent/sessions/v1/status -H 'Content-Type: application/json' -d '{"status":"completed"}'
   ```
   Expected: 409 CONFLICT ("Cannot transition from \"ready\" to \"completed\"")

- [ ] **Step 3: Clean up test data**

```bash
rm -rf .audit/test-idempotent
```

- [ ] **Step 4: Commit**

```bash
git add skills/audit/scripts/lib/session.mjs
git commit -m "fix: make session status transitions idempotent

updateSessionStatus now returns success when the session is already
in the target status instead of throwing CONFLICT. Fixes the error
when re-confirming scope after changing review type (code -> story+code)."
```
