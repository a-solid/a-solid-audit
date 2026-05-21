// skills/audit/scripts/server/handlers/sessions.mjs
import fs from "node:fs";
import path from "node:path";
import {
  listSessions, getSession, createSession, updateSessionStatus, sessionId, sanitizePath,
} from "../../lib/session.mjs";
import { jsonResponse, readBody, errorResponse } from "../index.mjs";

const CONTEXT_FILE = "review-context.md";

function readContextFile(sessionDir) {
  const p = path.join(sessionDir, CONTEXT_FILE);
  if (!fs.existsSync(p)) return "";
  return fs.readFileSync(p, "utf-8");
}

function writeContextFile(sessionDir, userContext) {
  const p = path.join(sessionDir, CONTEXT_FILE);
  const existing = fs.existsSync(p) ? fs.readFileSync(p, "utf-8") : "";
  const notesMatch = existing.match(/## Review Notes\n([\s\S]*)/);
  const reviewNotes = notesMatch ? notesMatch[1].trim() : "";
  const content = `## User Context\n${userContext}\n\n## Review Notes\n${reviewNotes ? reviewNotes : "<!-- AI agents append shared observations here -->"}\n`;
  fs.writeFileSync(p, content, "utf-8");
}

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

  // GET /api/sessions/:id/review-context
  router.get("/api/sessions/:id/review-context", (req, res, params) => {
    try {
      const safeSid = sanitizePath(params.id);
      const sessionDir = path.join(reportsDir, safeSid);
      if (!fs.existsSync(path.join(sessionDir, "index.yaml"))) {
        return errorResponse(res, "Session not found", "NOT_FOUND", 404);
      }
      const context = readContextFile(sessionDir);
      jsonResponse(res, { context });
    } catch (e) {
      if (e.message.includes("Invalid path")) return errorResponse(res, e.message, "VALIDATION_ERROR", 400);
      throw e;
    }
  });

  // PUT /api/sessions/:id/review-context
  router.put("/api/sessions/:id/review-context", async (req, res, params) => {
    try {
      const safeSid = sanitizePath(params.id);
      const sessionDir = path.join(reportsDir, safeSid);
      if (!fs.existsSync(path.join(sessionDir, "index.yaml"))) {
        return errorResponse(res, "Session not found", "NOT_FOUND", 404);
      }
      const body = JSON.parse(await readBody(req));
      if (!body || typeof body.context !== "string") {
        return errorResponse(res, "Missing required field: context", "VALIDATION_ERROR", 400);
      }
      writeContextFile(sessionDir, body.context);
      jsonResponse(res, { ok: true });
    } catch (e) {
      if (e.message.includes("Invalid path")) return errorResponse(res, e.message, "VALIDATION_ERROR", 400);
      throw e;
    }
  });
}
