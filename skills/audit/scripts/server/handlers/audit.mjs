// skills/audit/scripts/server/handlers/audit.mjs
import { getCommits, getBranches } from "../../lib/git.mjs";
import { setScope } from "../../lib/mapping.mjs";
import { jsonResponse, readBody, errorResponse } from "../index.mjs";

export function registerAuditRoutes(router, projectDir, reportsDir) {
  // GET /api/git/commits — latest 10 commits
  router.get("/api/git/commits", (req, res, params) => {
    try {
      const commits = getCommits(projectDir);
      jsonResponse(res, commits);
    } catch (e) {
      errorResponse(res, "Git error: " + e.message, "VALIDATION_ERROR", 400);
    }
  });

  // GET /api/git/branches — local branch list
  router.get("/api/git/branches", (req, res, params) => {
    try {
      const branches = getBranches(projectDir);
      jsonResponse(res, branches);
    } catch (e) {
      errorResponse(res, "Git error: " + e.message, "VALIDATION_ERROR", 400);
    }
  });

  // POST /api/sessions/:id/scope — set scope, generate code task YAMLs
  router.post("/api/sessions/:id/scope", async (req, res, params) => {
    try {
      const body = JSON.parse(await readBody(req));
      if (!body || !body.method) {
        return errorResponse(res, "Missing required field: method", "VALIDATION_ERROR", 400);
      }
      if (!["uncommitted", "commits", "branch"].includes(body.method)) {
        return errorResponse(res, "Invalid method. Allowed: uncommitted, commits, branch", "VALIDATION_ERROR", 400);
      }
      if (body.method !== "uncommitted" && !body.ref) {
        return errorResponse(res, "Missing required field: ref", "VALIDATION_ERROR", 400);
      }
      if (body.ref && !/^[a-zA-Z0-9._\-\/\s]+$/.test(body.ref)) {
        return errorResponse(res, "Invalid ref format", "VALIDATION_ERROR", 400);
      }
      const result = setScope(reportsDir, params.id, body.method, body.ref || "");
      jsonResponse(res, result);
    } catch (e) {
      if (e.message.includes("No diff found")) return errorResponse(res, e.message, "VALIDATION_ERROR", 400);
      if (e.message.includes("not found")) return errorResponse(res, e.message, "NOT_FOUND", 404);
      throw e;
    }
  });
}
