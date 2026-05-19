// skills/audit/scripts/server/handlers/sessions.mjs
import {
  listSessions, getSession, createSession, updateSessionStatus, sessionId,
} from "../../lib/session.mjs";
import { jsonResponse, readBody, errorResponse } from "../index.mjs";

export function registerSessionRoutes(router, reportsDir) {
  // GET /api/sessions — list all sessions
  router.get("/api/sessions", (req, res, params) => {
    const sessions = listSessions(reportsDir);
    jsonResponse(res, sessions);
  });

  // POST /api/sessions — create new session
  router.post("/api/sessions", (req, res, params) => {
    const sid = sessionId();
    const result = createSession(reportsDir, sid);
    jsonResponse(res, { id: result.id }, 201);
  });

  // GET /api/sessions/:id — single session detail
  router.get("/api/sessions/:id", (req, res, params) => {
    try {
      const session = getSession(reportsDir, params.id);
      if (!session) return errorResponse(res, "Session not found", "NOT_FOUND", 404);
      jsonResponse(res, session);
    } catch (e) {
      if (e.message.includes("Invalid path")) return errorResponse(res, e.message, "VALIDATION_ERROR", 400);
      throw e;
    }
  });

  // PUT /api/sessions/:id/status — update session status
  router.put("/api/sessions/:id/status", async (req, res, params) => {
    try {
      const body = JSON.parse(await readBody(req));
      if (!body || !body.status) {
        return errorResponse(res, "Missing required field: status", "VALIDATION_ERROR", 400);
      }
      const session = updateSessionStatus(reportsDir, params.id, body.status);
      jsonResponse(res, session);
    } catch (e) {
      if (e.message.includes("Cannot transition")) return errorResponse(res, e.message, "CONFLICT", 409);
      if (e.message.includes("Invalid status")) return errorResponse(res, e.message, "VALIDATION_ERROR", 400);
      if (e.message.includes("not found")) return errorResponse(res, e.message, "NOT_FOUND", 404);
      throw e;
    }
  });
}
