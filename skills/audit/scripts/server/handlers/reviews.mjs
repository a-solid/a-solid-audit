// skills/audit/scripts/server/handlers/reviews.mjs
import fs from "node:fs";
import path from "node:path";
import { updateTask, getTask, appendReview } from "../../lib/task.mjs";
import { sanitizePath, sanitizeFilePath } from "../../lib/session.mjs";
import { AppError } from "../../lib/errors.mjs";
import { readYaml, parseYaml } from "../../lib/yaml.mjs";
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
      const sessionDir = path.join(reportsDir, safeSid);
      const safeTaskFile = sanitizeFilePath(body.file);
      const taskPath = path.join(sessionDir, safeTaskFile);

      if (!fs.existsSync(path.join(sessionDir, "index.yaml"))) {
        return errorResponse(res, "Session not found", "NOT_FOUND", 404);
      }
      if (!fs.existsSync(taskPath)) {
        return errorResponse(res, "Task not found", "NOT_FOUND", 404);
      }

      const currentTask = getTask(reportsDir, safeSid, safeTaskFile);
      if (!currentTask) return errorResponse(res, "Task not found", "NOT_FOUND", 404);
      validateTransition(currentTask.status, status);

      const result = updateTask(reportsDir, safeSid, safeTaskFile, status, score, review, overview);

      const index = readYaml(path.join(sessionDir, "index.yaml"));
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

      const taskFile = query.get("file");
      if (!taskFile) {
        return errorResponse(res, "Missing query parameter: file", "VALIDATION_ERROR", 400);
      }

      const parsed = parseYaml(raw);
      if (!parsed || typeof parsed.score !== "number") {
        return errorResponse(res, "Invalid YAML: missing or non-numeric score", "VALIDATION_ERROR", 400);
      }

      const result = appendReview(reportsDir, params.id, taskFile, raw.trim());

      const safeSid = sanitizePath(params.id);
      const index = readYaml(path.join(reportsDir, safeSid, "index.yaml"));
      jsonResponse(res, { ok: true, file: result.file, status: result.status, sessionStatus: index.session.status });
    } catch (e) {
      if (e instanceof AppError) return errorResponse(res, e.message, e.code, e.status);
      console.error(e);
      errorResponse(res, "Internal server error", "INTERNAL_ERROR", 500);
    }
  });
}
