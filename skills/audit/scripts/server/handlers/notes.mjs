// skills/audit/scripts/server/handlers/notes.mjs
import fs from "node:fs";
import path from "node:path";
import { sanitizePath, resolveSessionPath } from "../../lib/session.mjs";
import { readYaml, writeYaml } from "../../lib/yaml.mjs";
import { jsonResponse, readBody, errorResponse } from "../index.mjs";

const VALID_STATUSES = ["pending", "need-fix", "wont-fix", "not-an-issue", "well-done"];

function resolveRoundDirFromSession(reportsDir, sid) {
  const safeSid = sanitizePath(sid);
  const indexPath = resolveSessionPath(reportsDir, safeSid);
  if (!indexPath) return null;
  const index = readYaml(indexPath);
  if (index.session.roundId) {
    return path.join(reportsDir, sanitizePath(index.session.roundId));
  }
  // Fallback: session lives at top level, notes are in session dir
  return path.dirname(indexPath);
}

function readRoundNotes(roundDir) {
  const p = path.join(roundDir, "review-notes.yaml");
  if (!fs.existsSync(p)) return { tasks: [], summary: { notes: "", signoff: { name: "", role: "", date: "" } } };
  return readYaml(p);
}

function writeRoundNotes(roundDir, data) {
  writeYaml(path.join(roundDir, "review-notes.yaml"), data);
}

export function registerNoteRoutes(router, reportsDir) {
  // GET /api/sessions/:id/notes — delegates to round-level notes
  router.get("/api/sessions/:id/notes", (req, res, params) => {
    const roundDir = resolveRoundDirFromSession(reportsDir, params.id);
    if (!roundDir) return errorResponse(res, "Session not found", "NOT_FOUND", 404);
    jsonResponse(res, readRoundNotes(roundDir));
  });

  // POST /api/sessions/:id/notes — delegates to round-level notes
  router.post("/api/sessions/:id/notes", async (req, res, params) => {
    const roundDir = resolveRoundDirFromSession(reportsDir, params.id);
    if (!roundDir) return errorResponse(res, "Session not found", "NOT_FOUND", 404);

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
    const notes = readRoundNotes(roundDir);
    let entry = notes.tasks.find(t => t.file === safeFile);
    if (!entry) {
      entry = { file: safeFile, findings: [] };
      notes.tasks.push(entry);
    }

    if (body.findings !== undefined) entry.findings = body.findings;

    writeRoundNotes(roundDir, notes);
    jsonResponse(res, { ok: true });
  });

  // POST /api/sessions/:id/summary — delegates to round-level summary
  router.post("/api/sessions/:id/summary", async (req, res, params) => {
    const roundDir = resolveRoundDirFromSession(reportsDir, params.id);
    if (!roundDir) return errorResponse(res, "Session not found", "NOT_FOUND", 404);

    const body = JSON.parse(await readBody(req));
    if (!body) return errorResponse(res, "Empty request body", "VALIDATION_ERROR", 400);

    const notes = readRoundNotes(roundDir);
    if (!notes.summary) notes.summary = { notes: "", signoff: { name: "", role: "", date: "" } };
    if (body.notes !== undefined) notes.summary.notes = body.notes;
    if (body.signoff !== undefined) {
      if (body.signoff === null) {
        notes.summary.signoff = { name: "", role: "", date: "" };
      } else {
        Object.assign(notes.summary.signoff, body.signoff);
      }
    }

    writeRoundNotes(roundDir, notes);
    jsonResponse(res, { ok: true });
  });
}
