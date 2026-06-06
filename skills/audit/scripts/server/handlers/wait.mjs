// skills/audit/scripts/server/handlers/wait.mjs
import { sanitizePath } from "../../lib/session.mjs";
import { jsonResponse, errorResponse, readBody } from "../index.mjs";

const WAIT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

const waiters = new Map(); // sessionId -> { resolve, timer }

export function registerWaitRoutes(router) {
  // POST /api/sessions/:id/wait
  // Blocks until /advance is called or timeout.
  router.post("/api/sessions/:id/wait", async (req, res, params) => {
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      return errorResponse(res, "Invalid JSON", "PARSE_ERROR", 400);
    }

    const reason = body.reason;
    if (!reason || !["ready", "grouping"].includes(reason)) {
      return errorResponse(res, "Invalid reason: must be 'ready' or 'grouping'", "VALIDATION_ERROR", 400);
    }

    const sid = sanitizePath(params.id);

    if (waiters.has(sid)) {
      return errorResponse(res, "Already waiting for this session", "CONFLICT", 409);
    }

    const result = await new Promise((resolve) => {
      const timer = setTimeout(() => {
        waiters.delete(sid);
        resolve({ action: "timeout" });
      }, WAIT_TIMEOUT_MS);

      waiters.set(sid, { resolve, timer });
    });

    jsonResponse(res, result);
  });

  // POST /api/sessions/:id/advance
  // Resolves a pending /wait call.
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

    const sid = sanitizePath(params.id);
    const waiter = waiters.get(sid);

    if (!waiter) {
      return errorResponse(res, "No one waiting for this session", "NOT_FOUND", 404);
    }

    clearTimeout(waiter.timer);
    waiters.delete(sid);
    waiter.resolve({ action, data: {} });
    jsonResponse(res, { ok: true });
  });
}

// Cancel all waiters (for server shutdown)
export function cancelAllWaiters() {
  for (const [sid, waiter] of waiters) {
    clearTimeout(waiter.timer);
    waiter.resolve({ action: "cancelled" });
  }
  waiters.clear();
}
