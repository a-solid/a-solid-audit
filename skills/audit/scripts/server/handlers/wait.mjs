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
    signal = { sessionId: "_server", action: "cancelled" };
    signalResolve();
  }
}
