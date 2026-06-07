// skills/audit/scripts/server/handlers/project-scan.mjs
import fs from "node:fs";
import path from "node:path";
import { setProjectScope, getProjectMap, generateTasksFromGroups } from "../../lib/project-scan.mjs";
import { getScanLogs, clearScanLogs } from "../../lib/scan-log.mjs";
import { readYaml, writeIndexYaml } from "../../lib/yaml.mjs";
import { updateSessionStatus, resolveSessionPath } from "../../lib/session.mjs";
import { jsonResponse, errorResponse } from "../index.mjs";

export function registerProjectScanRoutes(router, reportsDir, projectDir) {
  // POST /api/rounds/:roundName/sessions/:version/scan
  router.post("/api/rounds/:roundName/sessions/:version/scan", async (req, res, params) => {
    try {
      const indexPath = resolveSessionPath(reportsDir, params.roundName, params.version);
      if (!indexPath) return errorResponse(res, "Session not found", "NOT_FOUND", 404);
      const sessionDir = path.dirname(indexPath);

      const index = readYaml(indexPath);
      if (!["project", "project-scan"].includes(index.session.type)) {
        return errorResponse(res, "Session is not a project scan", "VALIDATION_ERROR", 400);
      }

      const targetDir = index.session.projectDir || projectDir;
      if (!targetDir) {
        return errorResponse(res, "No project directory configured", "VALIDATION_ERROR", 400);
      }

      // created → scanning
      updateSessionStatus(reportsDir, params.roundName, params.version, "scanning");

      const sessionKey = params.roundName + "/" + params.version;
      let result;
      try {
        result = setProjectScope(targetDir, reportsDir, params.roundName, params.version, { mode: "scan" });
      } catch (e) {
        clearScanLogs(sessionKey);
        const revert = readYaml(indexPath);
        revert.session.status = "created";
        writeIndexYaml(indexPath, revert);
        throw e;
      }

      // scanning → scanned
      updateSessionStatus(reportsDir, params.roundName, params.version, "scanned");
      clearScanLogs(sessionKey);

      jsonResponse(res, { ok: true, ...result });
    } catch (e) {
      throw e;
    }
  });

  // GET /api/rounds/:roundName/sessions/:version/scan/status
  router.get("/api/rounds/:roundName/sessions/:version/scan/status", (req, res, params) => {
    try {
      const indexPath = resolveSessionPath(reportsDir, params.roundName, params.version);
      if (!indexPath) {
        return jsonResponse(res, { status: "none" });
      }
      const sessionDir = path.dirname(indexPath);
      const index = readYaml(indexPath);
      const status = index.session.status;
      if (status === "scanned") {
        const graphDataPath = path.join(sessionDir, "graph-data.json");
        let graphInfo = {};
        if (fs.existsSync(graphDataPath)) {
          const gd = JSON.parse(fs.readFileSync(graphDataPath, "utf-8"));
          graphInfo = { totalFiles: gd.totalFiles, entryFiles: gd.entryFiles?.length || 0, hasGraph: Object.keys(gd.imports || {}).length > 0 };
        }
        jsonResponse(res, { status: "scanned", ...graphInfo });
      } else if (status === "grouping") {
        jsonResponse(res, { status: "grouping", progress: "AI is analyzing dependencies..." });
      } else if (status === "scanning") {
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
      throw e;
    }
  });

  // GET /api/rounds/:roundName/sessions/:version/project-map
  router.get("/api/rounds/:roundName/sessions/:version/project-map", (req, res, params) => {
    try {
      const map = getProjectMap(reportsDir, params.roundName, params.version);
      if (!map) return errorResponse(res, "Project map not found", "NOT_FOUND", 404);
      jsonResponse(res, map);
    } catch (e) {
      throw e;
    }
  });

  // GET /api/rounds/:roundName/sessions/:version/scan/logs (SSE)
  router.get("/api/rounds/:roundName/sessions/:version/scan/logs", (req, res, params) => {
    try {
      const sessionKey = params.roundName + "/" + params.version;

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      // Send buffered logs
      const buffered = getScanLogs(sessionKey);
      for (const entry of buffered) {
        res.write(`data: ${JSON.stringify(entry)}\n\n`);
      }

      // Poll for new entries
      let lastIdx = buffered.length;
      const interval = setInterval(() => {
        const logs = getScanLogs(sessionKey);
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

  // GET /api/rounds/:roundName/sessions/:version/graph-data
  router.get("/api/rounds/:roundName/sessions/:version/graph-data", (req, res, params) => {
    try {
      const indexPath = resolveSessionPath(reportsDir, params.roundName, params.version);
      if (!indexPath) return errorResponse(res, "Session not found", "NOT_FOUND", 404);
      const sessionDir = path.dirname(indexPath);
      const graphDataPath = path.join(sessionDir, "graph-data.json");
      if (!fs.existsSync(graphDataPath)) {
        return errorResponse(res, "Graph data not found", "NOT_FOUND", 404);
      }
      const data = JSON.parse(fs.readFileSync(graphDataPath, "utf-8"));
      jsonResponse(res, data);
    } catch (e) {
      throw e;
    }
  });

  // GET /api/rounds/:roundName/sessions/:version/groups
  router.get("/api/rounds/:roundName/sessions/:version/groups", (req, res, params) => {
    try {
      const indexPath = resolveSessionPath(reportsDir, params.roundName, params.version);
      if (!indexPath) return errorResponse(res, "Session not found", "NOT_FOUND", 404);
      const sessionDir = path.dirname(indexPath);
      const groupsPath = path.join(sessionDir, "groups.json");
      if (!fs.existsSync(groupsPath)) {
        return jsonResponse(res, { status: "pending" });
      }
      const groups = JSON.parse(fs.readFileSync(groupsPath, "utf-8"));
      jsonResponse(res, { status: "ready", groups });
    } catch (e) {
      throw e;
    }
  });

  // PUT /api/rounds/:roundName/sessions/:version/groups
  router.put("/api/rounds/:roundName/sessions/:version/groups", async (req, res, params) => {
    try {
      const indexPath = resolveSessionPath(reportsDir, params.roundName, params.version);
      if (!indexPath) return errorResponse(res, "Session not found", "NOT_FOUND", 404);
      const sessionDir = path.dirname(indexPath);
      const groupsPath = path.join(sessionDir, "groups.json");

      let body = "";
      for await (const chunk of req) body += chunk;
      const data = JSON.parse(body);
      if (!data.groups || !Array.isArray(data.groups)) {
        return errorResponse(res, "groups array required", "VALIDATION_ERROR", 400);
      }

      fs.writeFileSync(groupsPath, JSON.stringify(data.groups, null, 2), "utf-8");
      jsonResponse(res, { ok: true });
    } catch (e) {
      throw e;
    }
  });

  // POST /api/rounds/:roundName/sessions/:version/groups/confirm
  router.post("/api/rounds/:roundName/sessions/:version/groups/confirm", async (req, res, params) => {
    try {
      const indexPath = resolveSessionPath(reportsDir, params.roundName, params.version);
      if (!indexPath) return errorResponse(res, "Session not found", "NOT_FOUND", 404);

      const result = generateTasksFromGroups(reportsDir, params.roundName, params.version);

      // grouping → ready
      updateSessionStatus(reportsDir, params.roundName, params.version, "ready");

      jsonResponse(res, { ok: true, ...result });
    } catch (e) {
      throw e;
    }
  });
}
