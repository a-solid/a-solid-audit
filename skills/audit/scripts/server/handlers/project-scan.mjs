// skills/audit/scripts/server/handlers/project-scan.mjs
import fs from "node:fs";
import path from "node:path";
import { setProjectScope, getProjectMap, getScanLogs } from "../../lib/project-scan.mjs";
import { readYaml, writeIndexYaml } from "../../lib/yaml.mjs";
import { sanitizePath } from "../../lib/session.mjs";
import { jsonResponse, errorResponse } from "../index.mjs";

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
      if (!["project", "project-scan"].includes(index.session.type)) {
        return errorResponse(res, "Session is not a project scan", "VALIDATION_ERROR", 400);
      }

      const targetDir = index.session.projectDir || projectDir;
      if (!targetDir) {
        return errorResponse(res, "No project directory configured", "VALIDATION_ERROR", 400);
      }

      // Set scanning status
      index.session.status = "scanning";
      writeIndexYaml(indexPath, index);

      let result;
      try {
        result = setProjectScope(targetDir, reportsDir, safeSid);
      } catch (e) {
        // Revert to created on failure
        const revert = readYaml(indexPath);
        revert.session.status = "created";
        writeIndexYaml(indexPath, revert);
        throw e;
      }

      // Update status to ready so review can begin
      const updated = readYaml(indexPath);
      updated.session.status = "ready";
      writeIndexYaml(indexPath, updated);

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
      const sessionDir = path.join(reportsDir, safeSid);
      const indexPath = path.join(sessionDir, "index.yaml");
      if (!fs.existsSync(indexPath)) {
        return jsonResponse(res, { status: "none" });
      }
      const index = readYaml(indexPath);
      const status = index.session.status;
      if (status === "scanning") {
        jsonResponse(res, { status: "scanning", progress: "Scanning project files..." });
      } else if (status === "ready") {
        const taskCount = (index.projectTasks || []).length;
        const mapPath = path.join(sessionDir, "project-map.yaml");
        let totalFiles = null;
        if (fs.existsSync(mapPath)) {
          const map = readYaml(mapPath);
          totalFiles = map.totalFiles || null;
        }
        jsonResponse(res, { status: "done", taskCount, totalFiles });
      } else if (status === "created") {
        jsonResponse(res, { status: "waiting", progress: "Waiting to start..." });
      } else {
        jsonResponse(res, { status: "none" });
      }
    } catch (e) {
      if (e.message.includes("Invalid path")) return errorResponse(res, e.message, "VALIDATION_ERROR", 400);
      throw e;
    }
  });

  // GET /api/sessions/:id/project-map
  router.get("/api/sessions/:id/project-map", (req, res, params) => {
    try {
      const safeSid = sanitizePath(params.id);
      const map = getProjectMap(reportsDir, safeSid);
      if (!map) return errorResponse(res, "Project map not found", "NOT_FOUND", 404);
      jsonResponse(res, map);
    } catch (e) {
      if (e.message.includes("Invalid path")) return errorResponse(res, e.message, "VALIDATION_ERROR", 400);
      throw e;
    }
  });

  // GET /api/sessions/:id/scan/logs (SSE)
  router.get("/api/sessions/:id/scan/logs", (req, res, params) => {
    try {
      const safeSid = sanitizePath(params.id);

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      // Send buffered logs
      const buffered = getScanLogs(safeSid);
      for (const entry of buffered) {
        res.write(`data: ${JSON.stringify(entry)}\n\n`);
      }

      // Poll for new entries
      let lastIdx = buffered.length;
      const interval = setInterval(() => {
        const logs = getScanLogs(safeSid);
        while (lastIdx < logs.length) {
          res.write(`data: ${JSON.stringify(logs[lastIdx])}\n\n`);
          lastIdx++;
        }
      }, 200);

      // Cleanup on close
      req.on("close", () => {
        clearInterval(interval);
      });
    } catch (e) {
      if (e.message.includes("Invalid path")) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end(e.message);
      }
    }
  });
}
