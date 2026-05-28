// skills/audit/scripts/server/handlers/tasks.mjs
import { getTasks, getTask, getTasksSummary } from "../../lib/task.mjs";
import { jsonResponse, errorResponse } from "../index.mjs";

export function registerTaskRoutes(router, reportsDir) {
  // GET /api/sessions/:id/tasks — all tasks
  // GET /api/sessions/:id/tasks?file=xxx — single task detail
  router.get("/api/sessions/:id/tasks", (req, res, params, query) => {
    try {
      const file = query?.get("file");
      if (file) {
        const task = getTask(reportsDir, params.id, file);
        if (!task) return errorResponse(res, "Task not found", "NOT_FOUND", 404);
        return jsonResponse(res, task);
      }
      const tasks = getTasks(reportsDir, params.id);
      jsonResponse(res, tasks);
    } catch (e) {
      throw e;
    }
  });

  // GET /api/sessions/:id/tasks/summary — lightweight task list
  router.get("/api/sessions/:id/tasks/summary", (req, res, params) => {
    try {
      const tasks = getTasksSummary(reportsDir, params.id);
      jsonResponse(res, tasks);
    } catch (e) {
      throw e;
    }
  });
}
