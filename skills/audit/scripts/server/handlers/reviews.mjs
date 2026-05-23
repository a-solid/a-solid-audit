// skills/audit/scripts/server/handlers/reviews.mjs
import fs from "node:fs";
import path from "node:path";
import { updateTask } from "../../lib/task.mjs";
import { sanitizePath, sanitizeFilePath } from "../../lib/session.mjs";
import { readYaml } from "../../lib/yaml.mjs";
import { jsonResponse, errorResponse, readBody } from "../index.mjs";

const ALLOWED_TRANSITIONS = {
  pending: ["reviewing"],
  reviewing: ["reviewed"],
  reviewed: [],
};

function validateTransition(currentStatus, newStatus) {
  const allowed = ALLOWED_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(newStatus)) {
    throw new Error(
      "Cannot transition task from " + currentStatus + " to " + newStatus +
      ". Allowed transitions: pending -> reviewing, reviewing -> reviewed"
    );
  }
}

export function registerReviewRoutes(router, reportsDir) {
  // POST /api/sessions/:id/tasks/:file/review
  router.post("/api/sessions/:id/tasks/:file/review", async (req, res, params) => {
    try {
      const body = JSON.parse(await readBody(req));
      if (!body || !body.status) {
        return errorResponse(res, "Missing required field: status", "VALIDATION_ERROR", 400);
      }

      const { status, score, review } = body;
      if (!["reviewing", "reviewed"].includes(status)) {
        return errorResponse(res, "Invalid status: " + status + ". Must be reviewing or reviewed", "VALIDATION_ERROR", 400);
      }

      const safeSid = sanitizePath(params.id);
      const sessionDir = path.join(reportsDir, safeSid);
      const safeTaskFile = sanitizeFilePath(params.file);
      const taskPath = path.join(sessionDir, safeTaskFile);

      if (!fs.existsSync(path.join(sessionDir, "index.yaml"))) {
        return errorResponse(res, "Session not found", "NOT_FOUND", 404);
      }
      if (!fs.existsSync(taskPath)) {
        return errorResponse(res, "Task not found", "NOT_FOUND", 404);
      }

      const currentTask = readYaml(taskPath);
      validateTransition(currentTask.status, status);

      const result = updateTask(reportsDir, safeSid, safeTaskFile, status, score, review);

      const index = readYaml(path.join(sessionDir, "index.yaml"));
      jsonResponse(res, { ok: true, file: result.file, status: result.status, sessionStatus: index.session.status });
    } catch (e) {
      if (e.message.includes("Cannot transition")) return errorResponse(res, e.message, "CONFLICT", 409);
      if (e.message.includes("not found")) return errorResponse(res, e.message, "NOT_FOUND", 404);
      if (e.message.includes("Invalid status")) return errorResponse(res, e.message, "VALIDATION_ERROR", 400);
      if (e.message.includes("Invalid path")) return errorResponse(res, e.message, "VALIDATION_ERROR", 400);
      throw e;
    }
  });
}
