// skills/audit/scripts/server/handlers/wait.mjs
import { jsonResponse, errorResponse, readBody } from "../index.mjs";
import { updateSessionStatus, resetReviewing } from "../../lib/session.mjs";

const WAIT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

let signal = null; // { roundName, version, action } or null
let signalResolve = null; // () => void — resolves the pending /wait Promise

export function registerWaitRoutes(router, reportsDir) {
  // GET /wait
  // Blocks until /advance is called or timeout. Returns plain text.
  router.get("/wait", async (req, res) => {
    // If signal already set (advance arrived before /wait), return immediately
    if (signal) {
      const { roundName, version, action } = signal;
      signal = null;
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(`Session ${roundName}/${version} ready.\nAction: ${action}`);
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
    res.end(`Session ${result.roundName}/${result.version} ready.\nAction: ${result.action}`);
  });

  // POST /api/rounds/:roundName/sessions/:version/advance
  // Writes signal and resolves pending /wait if any.
  router.post("/api/rounds/:roundName/sessions/:version/advance", async (req, res, params) => {
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      return errorResponse(res, "Invalid JSON", "PARSE_ERROR", 400);
    }

    const action = body.action;
    if (!action || !["start", "confirm-groups", "resume"].includes(action)) {
      return errorResponse(res, "Invalid action: must be 'start', 'confirm-groups', or 'resume'", "VALIDATION_ERROR", 400);
    }

    // On resume: transition paused → reviewing and reset stale tasks
    if (action === "resume") {
      try {
        updateSessionStatus(reportsDir, params.roundName, params.version, "reviewing");
        resetReviewing(reportsDir, params.roundName, params.version);
      } catch (e) {
        return errorResponse(res, e.message, e.code, e.status);
      }
    }

    signal = { roundName: params.roundName, version: params.version, action };

    if (signalResolve) {
      signalResolve();
    }

    jsonResponse(res, { ok: true });
  });
}

// Cancel pending waiter (for server shutdown)
export function cancelAllWaiters() {
  if (signalResolve) {
    signal = { roundName: "_server", version: "_shutdown", action: "cancelled" };
    signalResolve();
  }
}
