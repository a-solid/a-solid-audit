// skills/audit/scripts/server/handlers/sessions.mjs
import fs from "node:fs";
import path from "node:path";
import {
  getSession, updateSessionStatus, updateSession, resolveSessionPath,
} from "../../lib/session.mjs";
import { jsonResponse, readBody, errorResponse } from "../index.mjs";

const CONTEXT_FILE = "review-context.md";

function resolveSession(reportsDir, params) {
  const indexPath = resolveSessionPath(reportsDir, params.roundName, params.version);
  if (!indexPath) return null;
  return { roundName: params.roundName, version: params.version, indexPath, sessionDir: path.dirname(indexPath) };
}

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
  // GET /api/rounds/:roundName/sessions/:version — single session detail
  router.get("/api/rounds/:roundName/sessions/:version", (req, res, params) => {
    try {
      const session = getSession(reportsDir, params.roundName, params.version);
      if (!session) return errorResponse(res, "Session not found", "NOT_FOUND", 404);
      jsonResponse(res, session);
    } catch (e) {
      throw e;
    }
  });

  // PUT /api/rounds/:roundName/sessions/:version/status — update session status
  router.put("/api/rounds/:roundName/sessions/:version/status", async (req, res, params) => {
    try {
      const body = JSON.parse(await readBody(req));
      if (!body || !body.status) {
        return errorResponse(res, "Missing required field: status", "VALIDATION_ERROR", 400);
      }
      const session = updateSessionStatus(reportsDir, params.roundName, params.version, body.status);
      jsonResponse(res, session);
    } catch (e) {
      throw e;
    }
  });

  // PATCH /api/rounds/:roundName/sessions/:version — update mutable session fields
  router.patch("/api/rounds/:roundName/sessions/:version", async (req, res, params) => {
    try {
      const body = JSON.parse(await readBody(req));
      if (!body || Object.keys(body).length === 0) {
        return errorResponse(res, "No fields to update", "VALIDATION_ERROR", 400);
      }
      const session = updateSession(reportsDir, params.roundName, params.version, body);
      jsonResponse(res, session);
    } catch (e) {
      throw e;
    }
  });

  // GET /api/rounds/:roundName/sessions/:version/review-context
  router.get("/api/rounds/:roundName/sessions/:version/review-context", (req, res, params) => {
    try {
      const resolved = resolveSession(reportsDir, params);
      if (!resolved) return errorResponse(res, "Session not found", "NOT_FOUND", 404);
      const context = readContextFile(resolved.sessionDir);
      jsonResponse(res, { context });
    } catch (e) {
      throw e;
    }
  });

  // PUT /api/rounds/:roundName/sessions/:version/review-context
  router.put("/api/rounds/:roundName/sessions/:version/review-context", async (req, res, params) => {
    try {
      const resolved = resolveSession(reportsDir, params);
      if (!resolved) return errorResponse(res, "Session not found", "NOT_FOUND", 404);
      const body = JSON.parse(await readBody(req));
      if (!body || typeof body.context !== "string") {
        return errorResponse(res, "Missing required field: context", "VALIDATION_ERROR", 400);
      }
      writeContextFile(resolved.sessionDir, body.context);
      jsonResponse(res, { ok: true });
    } catch (e) {
      throw e;
    }
  });

  // POST /api/rounds/:roundName/sessions/:version/review-notes — atomically append to Review Notes section
  router.post("/api/rounds/:roundName/sessions/:version/review-notes", async (req, res, params) => {
    try {
      const resolved = resolveSession(reportsDir, params);
      if (!resolved) return errorResponse(res, "Session not found", "NOT_FOUND", 404);
      const body = JSON.parse(await readBody(req));
      if (!body || typeof body.notes !== "string") {
        return errorResponse(res, "Missing required field: notes", "VALIDATION_ERROR", 400);
      }

      const contextPath = path.join(resolved.sessionDir, CONTEXT_FILE);
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
