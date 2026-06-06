// skills/audit/scripts/server/handlers/sessions.mjs
import fs from "node:fs";
import path from "node:path";
import {
  listSessions, getSession, createSession, updateSessionStatus, updateSession, sessionId, sanitizePath, resolveSessionPath,
} from "../../lib/session.mjs";
import { jsonResponse, readBody, errorResponse } from "../index.mjs";
import { resolveProjectDir } from "../../lib/paths.mjs";

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

  // POST /api/sessions — create new session (requires roundId)
  router.post("/api/sessions", async (req, res, params) => {
    const sid = sessionId();
    let options = { type: "code", projectDir: null, roundId: null, version: undefined };
    try {
      const body = JSON.parse(await readBody(req));
      options = {
        type: body.type || "code",
        projectDir: body.projectDir || null,
        roundId: body.roundId || null,
        version: body.version || undefined,
      };
    } catch { /* use defaults */ }
    if (!options.roundId) {
      return errorResponse(res, "Missing required field: roundId", "VALIDATION_ERROR", 400);
    }
    const result = createSession(reportsDir, sid, options);
    jsonResponse(res, { id: result.id, projectDir: resolveProjectDir(), roundId: options.roundId, version: options.version || 1 }, 201);
  });

  // GET /api/sessions/:id — single session detail
  router.get("/api/sessions/:id", (req, res, params) => {
    try {
      const session = getSession(reportsDir, params.id);
      if (!session) return errorResponse(res, "Session not found", "NOT_FOUND", 404);
      jsonResponse(res, session);
    } catch (e) {
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
      throw e;
    }
  });

  // PATCH /api/sessions/:id — update mutable session fields
  router.patch("/api/sessions/:id", async (req, res, params) => {
    try {
      const body = JSON.parse(await readBody(req));
      if (!body || Object.keys(body).length === 0) {
        return errorResponse(res, "No fields to update", "VALIDATION_ERROR", 400);
      }
      const session = updateSession(reportsDir, params.id, body);
      jsonResponse(res, session);
    } catch (e) {
      throw e;
    }
  });

  // GET /api/sessions/:id/review-context
  router.get("/api/sessions/:id/review-context", (req, res, params) => {
    try {
      const safeSid = sanitizePath(params.id);
      const resolvedIndex = resolveSessionPath(reportsDir, safeSid);
      if (!resolvedIndex) return errorResponse(res, "Session not found", "NOT_FOUND", 404);
      const sessionDir = path.dirname(resolvedIndex);
      const context = readContextFile(sessionDir);
      jsonResponse(res, { context });
    } catch (e) {
      throw e;
    }
  });

  // PUT /api/sessions/:id/review-context
  router.put("/api/sessions/:id/review-context", async (req, res, params) => {
    try {
      const safeSid = sanitizePath(params.id);
      const resolvedIndex = resolveSessionPath(reportsDir, safeSid);
      if (!resolvedIndex) return errorResponse(res, "Session not found", "NOT_FOUND", 404);
      const sessionDir = path.dirname(resolvedIndex);
      const body = JSON.parse(await readBody(req));
      if (!body || typeof body.context !== "string") {
        return errorResponse(res, "Missing required field: context", "VALIDATION_ERROR", 400);
      }
      writeContextFile(sessionDir, body.context);
      jsonResponse(res, { ok: true });
    } catch (e) {
      throw e;
    }
  });

  // POST /api/sessions/:id/review-notes — atomically append to Review Notes section
  router.post("/api/sessions/:id/review-notes", async (req, res, params) => {
    try {
      const safeSid = sanitizePath(params.id);
      const resolvedIndex = resolveSessionPath(reportsDir, safeSid);
      if (!resolvedIndex) return errorResponse(res, "Session not found", "NOT_FOUND", 404);
      const sessionDir = path.dirname(resolvedIndex);
      const body = JSON.parse(await readBody(req));
      if (!body || typeof body.notes !== "string") {
        return errorResponse(res, "Missing required field: notes", "VALIDATION_ERROR", 400);
      }

      const contextPath = path.join(sessionDir, CONTEXT_FILE);
      let existing = "";
      if (fs.existsSync(contextPath)) {
        existing = fs.readFileSync(contextPath, "utf-8");
      }

      // Extract User Context and Review Notes sections
      const userMatch = existing.match(/## User Context\n([\s\S]*?)(?=\n## Review Notes)/);
      const notesMatch = existing.match(/## Review Notes\n([\s\S]*)/);
      const userContext = userMatch ? userMatch[1].trimEnd() : "";
      const existingNotes = notesMatch ? notesMatch[1].trim() : "";

      const newNotes = existingNotes === "" || existingNotes.startsWith("<!--")
        ? body.notes.trim()
        : existingNotes + "\n" + body.notes.trim();

      const content = `## User Context\n${userContext}\n\n## Review Notes\n${newNotes}\n`;
      fs.writeFileSync(contextPath, content, "utf-8");
      jsonResponse(res, { ok: true });
    } catch (e) {
      throw e;
    }
  });
}
