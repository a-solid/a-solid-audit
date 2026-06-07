// skills/audit/scripts/server/handlers/tasks.mjs
import { getTasks, getTask, getTasksSummary } from "../../lib/task.mjs";
import { jsonResponse, errorResponse } from "../index.mjs";

export function registerTaskRoutes(router, reportsDir) {
  // GET /api/rounds/:roundName/sessions/:version/tasks — all tasks
  // GET /api/rounds/:roundName/sessions/:version/tasks?file=xxx — single task detail
  router.get("/api/rounds/:roundName/sessions/:version/tasks", (req, res, params, query) => {
    try {
      const file = query?.get("file");
      if (file) {
        const task = getTask(reportsDir, params.roundName, params.version, file);
        if (!task) return errorResponse(res, "Task not found", "NOT_FOUND", 404);
        return jsonResponse(res, task);
      }
      const tasks = getTasks(reportsDir, params.roundName, params.version);
      jsonResponse(res, tasks);
    } catch (e) {
      throw e;
    }
  });

  // GET /api/rounds/:roundName/sessions/:version/tasks/summary — lightweight task list
  router.get("/api/rounds/:roundName/sessions/:version/tasks/summary", (req, res, params) => {
    try {
      const tasks = getTasksSummary(reportsDir, params.roundName, params.version);
      jsonResponse(res, tasks);
    } catch (e) {
      throw e;
    }
  });
}
