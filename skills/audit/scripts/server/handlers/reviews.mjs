// skills/audit/scripts/server/handlers/reviews.mjs
import fs from "node:fs";
import path from "node:path";
import { updateTask, getTask, appendReview } from "../../lib/task.mjs";
import { sanitizePath, sanitizeFilePath, resolveSessionPath } from "../../lib/session.mjs";
import { AppError } from "../../lib/errors.mjs";
import { readYaml, parseYaml, writeYaml } from "../../lib/yaml.mjs";
import { jsonResponse, errorResponse, readBody } from "../index.mjs";

const ALLOWED_TRANSITIONS = {
  pending: ["reviewing"],
  reviewing: ["reviewed"],
  reviewed: [],
};

function validateTransition(currentStatus, newStatus) {
  const allowed = ALLOWED_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(newStatus)) {
    throw new AppError(
      "Cannot transition task from " + currentStatus + " to " + newStatus +
      ". Allowed transitions: pending -> reviewing, reviewing -> reviewed",
      "CONFLICT", 409
    );
  }
}

export function registerReviewRoutes(router, reportsDir) {
  // POST /api/sessions/:id/tasks/review — body: { file, status, score?, review?, overview? }
  router.post("/api/sessions/:id/tasks/review", async (req, res, params) => {
    try {
      const body = JSON.parse(await readBody(req));
      if (!body || !body.status) {
        return errorResponse(res, "Missing required field: status", "VALIDATION_ERROR", 400);
      }
      if (!body.file || typeof body.file !== "string") {
        return errorResponse(res, "Missing required field: file", "VALIDATION_ERROR", 400);
      }

      const { status, score, review, overview } = body;
      if (!["reviewing", "reviewed"].includes(status)) {
        return errorResponse(res, "Invalid status: " + status + ". Must be reviewing or reviewed", "VALIDATION_ERROR", 400);
      }

      const safeSid = sanitizePath(params.id);
      const indexPath = resolveSessionPath(reportsDir, safeSid);
      if (!indexPath) return errorResponse(res, "Session not found", "NOT_FOUND", 404);
      const sessionDir = path.dirname(indexPath);
      const safeTaskFile = sanitizeFilePath(body.file);
      const taskPath = path.join(sessionDir, safeTaskFile);

      if (!fs.existsSync(taskPath)) {
        return errorResponse(res, "Task not found", "NOT_FOUND", 404);
      }

      const currentTask = getTask(reportsDir, safeSid, safeTaskFile);
      if (!currentTask) return errorResponse(res, "Task not found", "NOT_FOUND", 404);
      validateTransition(currentTask.status, status);

      const result = updateTask(reportsDir, safeSid, safeTaskFile, status, score, review, overview);

      const index = readYaml(indexPath);
      jsonResponse(res, { ok: true, file: result.file, status: result.status, sessionStatus: index.session.status });
    } catch (e) {
      throw e;
    }
  });

  // POST /api/sessions/:id/tasks/review-yaml?file=<task-file> — body: raw YAML text
  router.post("/api/sessions/:id/tasks/review-yaml", async (req, res, params, query) => {
    try {
      const raw = await readBody(req);
      if (!raw || !raw.trim()) {
        return errorResponse(res, "Empty body", "VALIDATION_ERROR", 400);
      }

      const rawFile = query.get("file");
      if (!rawFile) {
        return errorResponse(res, "Missing query parameter: file", "VALIDATION_ERROR", 400);
      }

      let parsed;
      try {
        parsed = parseYaml(raw);
      } catch {
        return errorResponse(res, "Invalid YAML syntax", "PARSE_ERROR", 400);
      }
      if (!parsed || typeof parsed.review?.score !== "number") {
        return errorResponse(res, "Invalid YAML: missing or non-numeric review.score", "VALIDATION_ERROR", 400);
      }

      const safeSid = sanitizePath(params.id);
      const safeFile = sanitizeFilePath(rawFile);
      const indexPath = resolveSessionPath(reportsDir, safeSid);
      if (!indexPath) return errorResponse(res, "Session not found", "NOT_FOUND", 404);
      const sessionDir = path.dirname(indexPath);
      const index = readYaml(indexPath);
      const allRefs = [
        ...(index.codeTasks || []),
        ...(index.storyTasks || []),
        ...(index.projectTasks || []),
      ];
      const taskRef = allRefs.find(t => t.file === safeFile);
      if (!taskRef) {
        return errorResponse(res, "Task not found in session", "NOT_FOUND", 404);
      }

      const currentStatus = taskRef.status || "pending";
      if (currentStatus === "reviewed") {
        return errorResponse(res, "Task already reviewed", "CONFLICT", 409);
      }

      const result = appendReview(reportsDir, safeSid, safeFile, raw.trim());

      // Auto-populate session-level review-notes.yaml with finding descriptions
      const notesPath = path.join(sessionDir, "review-notes.yaml");
      let sessionNotes;
      if (fs.existsSync(notesPath)) {
        sessionNotes = readYaml(notesPath);
      } else {
        sessionNotes = { tasks: [], summary: { notes: "", signoff: { name: "", role: "", date: "" } } };
      }

      const reviewFindings = parsed.review?.findings || [];
      let noteEntry = sessionNotes.tasks.find(t => t.file === safeFile);
      if (!noteEntry) {
        noteEntry = { file: safeFile, findings: [] };
        sessionNotes.tasks.push(noteEntry);
      }

      for (const f of reviewFindings) {
        noteEntry.findings.push({
          status: "pending",
          reason: "",
          description: f.description || "",
          severity: f.severity || "",
          file: f.file || "",
          line: f.line || null,
        });
      }

      writeYaml(notesPath, sessionNotes);

      jsonResponse(res, { ok: true, file: result.file, status: result.status, sessionStatus: index.session.status });
    } catch (e) {
      if (e instanceof AppError) return errorResponse(res, e.message, e.code, e.status);
      console.error(e);
      errorResponse(res, "Internal server error", "INTERNAL_ERROR", 500);
    }
  });
}
