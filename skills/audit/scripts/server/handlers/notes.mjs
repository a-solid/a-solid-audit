// skills/audit/scripts/server/handlers/notes.mjs
import fs from "node:fs";
import path from "node:path";
import { sanitizePath, resolveSessionPath } from "../../lib/session.mjs";
import { readYaml, writeYaml } from "../../lib/yaml.mjs";
import { jsonResponse, readBody, errorResponse } from "../index.mjs";

const NOTES_FILE = "review-notes.yaml";
const VALID_STATUSES = ["pending", "need-fix", "wont-fix", "not-an-issue", "well-done"];

function resolveSessionDir(reportsDir, sid) {
  const safeSid = sanitizePath(sid);
  const indexPath = resolveSessionPath(reportsDir, safeSid);
  if (!indexPath) return null;
  return path.dirname(indexPath);
}

function readNotes(sessionDir) {
  const p = path.join(sessionDir, NOTES_FILE);
  if (!fs.existsSync(p)) return { tasks: [], summary: { notes: "", signoff: { name: "", role: "", date: "" } } };
  return readYaml(p);
}

function writeNotes(sessionDir, data) {
  writeYaml(path.join(sessionDir, NOTES_FILE), data);
}

export function registerNoteRoutes(router, reportsDir) {
  // GET /api/sessions/:id/notes
  router.get("/api/sessions/:id/notes", (req, res, params) => {
    const sessionDir = resolveSessionDir(reportsDir, params.id);
    if (!sessionDir) return errorResponse(res, "Session not found", "NOT_FOUND", 404);
    jsonResponse(res, readNotes(sessionDir));
  });

  // POST /api/sessions/:id/notes — update task review
  router.post("/api/sessions/:id/notes", async (req, res, params) => {
    const sessionDir = resolveSessionDir(reportsDir, params.id);
    if (!sessionDir) return errorResponse(res, "Session not found", "NOT_FOUND", 404);

    const body = JSON.parse(await readBody(req));
    if (!body || typeof body.file !== "string" || !body.file) {
      return errorResponse(res, "Missing required field: file", "VALIDATION_ERROR", 400);
    }
    if (body.findings !== undefined && !Array.isArray(body.findings)) {
      return errorResponse(res, "findings must be an array", "VALIDATION_ERROR", 400);
    }
    if (body.findings) {
      for (let i = 0; i < body.findings.length; i++) {
        const s = body.findings[i]?.status;
        if (s && !VALID_STATUSES.includes(s)) {
          return errorResponse(res, "Invalid status at findings[" + i + "]: " + s, "VALIDATION_ERROR", 400);
        }
      }
    }

    const safeFile = body.file;
    const notes = readNotes(sessionDir);
    let entry = notes.tasks.find(t => t.file === safeFile);
    if (!entry) {
      entry = { file: safeFile, findings: [] };
      notes.tasks.push(entry);
    }

    if (body.findings !== undefined) entry.findings = body.findings;

    writeNotes(sessionDir, notes);
    jsonResponse(res, { ok: true });
  });

  // POST /api/sessions/:id/summary — update summary + sign-off
  router.post("/api/sessions/:id/summary", async (req, res, params) => {
    const sessionDir = resolveSessionDir(reportsDir, params.id);
    if (!sessionDir) return errorResponse(res, "Session not found", "NOT_FOUND", 404);

    const body = JSON.parse(await readBody(req));
    if (!body) return errorResponse(res, "Empty request body", "VALIDATION_ERROR", 400);

    const notes = readNotes(sessionDir);
    if (!notes.summary) notes.summary = { notes: "", signoff: { name: "", role: "", date: "" } };
    if (body.notes !== undefined) notes.summary.notes = body.notes;
    if (body.signoff !== undefined) {
      if (body.signoff === null) {
        notes.summary.signoff = { name: "", role: "", date: "" };
      } else {
        Object.assign(notes.summary.signoff, body.signoff);
      }
    }

    writeNotes(sessionDir, notes);
    jsonResponse(res, { ok: true });
  });
}
