// skills/audit/scripts/server/handlers/tasks.mjs
import { getTasks, getTask } from "../../lib/task.mjs";
import { jsonResponse, errorResponse } from "../index.mjs";

export function registerTaskRoutes(router, reportsDir) {
  // GET /api/sessions/:id/tasks — all tasks
  router.get("/api/sessions/:id/tasks", (req, res, params) => {
    try {
      const tasks = getTasks(reportsDir, params.id);
      jsonResponse(res, tasks);
    } catch (e) {
      if (e.message.includes("not found")) return errorResponse(res, e.message, "NOT_FOUND", 404);
      if (e.message.includes("Invalid path")) return errorResponse(res, e.message, "VALIDATION_ERROR", 400);
      throw e;
    }
  });

  // GET /api/sessions/:id/tasks/:file — single task detail
  router.get("/api/sessions/:id/tasks/:file", (req, res, params) => {
    try {
      const task = getTask(reportsDir, params.id, params.file);
      if (!task) return errorResponse(res, "Task not found", "NOT_FOUND", 404);
      jsonResponse(res, task);
    } catch (e) {
      if (e.message.includes("not found")) return errorResponse(res, e.message, "NOT_FOUND", 404);
      if (e.message.includes("Invalid path")) return errorResponse(res, e.message, "VALIDATION_ERROR", 400);
      throw e;
    }
  });
}
