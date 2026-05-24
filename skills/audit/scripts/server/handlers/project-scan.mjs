// skills/audit/scripts/server/handlers/project-scan.mjs
import fs from "node:fs";
import path from "node:path";
import { scanProject } from "../../lib/project-scan.mjs";
import { loadSettings } from "./settings.mjs";
import { readYaml } from "../../lib/yaml.mjs";
import { sanitizePath } from "../../lib/session.mjs";
import { jsonResponse, errorResponse } from "../index.mjs";

const scanStatuses = new Map();

export function registerProjectScanRoutes(router, reportsDir, projectDir) {
  // POST /api/sessions/:id/scan
  router.post("/api/sessions/:id/scan", async (req, res, params) => {
    try {
      const safeSid = sanitizePath(params.id);
      const sessionDir = path.join(reportsDir, safeSid);
      const indexPath = path.join(sessionDir, "index.yaml");

      if (!fs.existsSync(indexPath)) {
        return errorResponse(res, "Session not found", "NOT_FOUND", 404);
      }

      const index = readYaml(indexPath);
      if (index.session.type !== "project") {
        return errorResponse(res, "Session is not a project scan", "VALIDATION_ERROR", 400);
      }

      const targetDir = index.session.projectDir || projectDir;
      if (!targetDir) {
        return errorResponse(res, "No project directory configured", "VALIDATION_ERROR", 400);
      }

      scanStatuses.set(safeSid, { status: "scanning", progress: "Starting scan..." });

      let result;
      try {
        const settings = loadSettings();
        const apiKey = settings.anthropic?.apiKey || process.env.ANTHROPIC_API_KEY || "";
        result = await scanProject(targetDir, reportsDir, safeSid, apiKey);
      } catch (e) {
        scanStatuses.set(safeSid, { status: "error", error: e.message });
        throw e;
      }

      scanStatuses.set(safeSid, { status: "done", result });
      jsonResponse(res, { ok: true, ...result });
    } catch (e) {
      if (e.message.includes("not found")) return errorResponse(res, e.message, "NOT_FOUND", 404);
      if (e.message.includes("Invalid path")) return errorResponse(res, e.message, "VALIDATION_ERROR", 400);
      throw e;
    }
  });

  // GET /api/sessions/:id/scan/status
  router.get("/api/sessions/:id/scan/status", (req, res, params) => {
    try {
      const safeSid = sanitizePath(params.id);
      const status = scanStatuses.get(safeSid) || { status: "none" };
      jsonResponse(res, status);
    } catch (e) {
      if (e.message.includes("Invalid path")) return errorResponse(res, e.message, "VALIDATION_ERROR", 400);
      throw e;
    }
  });
}
