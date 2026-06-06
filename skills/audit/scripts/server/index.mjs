// skills/audit/scripts/server/index.mjs
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRouter } from "./router.mjs";
import { serveStatic } from "./static.mjs";
import { registerSessionRoutes } from "./handlers/sessions.mjs";
import { registerAuditRoutes } from "./handlers/audit.mjs";
import { registerStoryRoutes } from "./handlers/stories.mjs";
import { registerTaskRoutes } from "./handlers/tasks.mjs";
import { registerNoteRoutes } from "./handlers/notes.mjs";
import { registerReviewRoutes } from "./handlers/reviews.mjs";
import { registerProjectScanRoutes } from "./handlers/project-scan.mjs";
import { registerSettingsRoutes } from "./handlers/settings.mjs";
import { AppError } from "../lib/errors.mjs";
import { resolveReportsDir } from "../lib/paths.mjs";

export function jsonResponse(res, data, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

export function errorResponse(res, message, code, status = 400) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: message, code }));
}

export function readBody(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let destroyed = false;
    req.on("data", (c) => {
      if (destroyed) return;
      size += c.length;
      if (size > maxBytes) {
        destroyed = true;
        req.destroy();
        reject(new Error("Request body too large"));
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

export function startServer(projectDir, port = 3456) {
  const reportsDir = resolveReportsDir(projectDir);

  const router = createRouter();
  registerSessionRoutes(router, reportsDir);
  registerAuditRoutes(router, projectDir, reportsDir);
  registerStoryRoutes(router, reportsDir);
  registerTaskRoutes(router, reportsDir);
  registerNoteRoutes(router, reportsDir);
  registerReviewRoutes(router, reportsDir);
  registerProjectScanRoutes(router, reportsDir, projectDir);
  registerSettingsRoutes(router);

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);

    const match = router.resolve(req.method, url.pathname);
    if (match) {
      const handleError = (e) => {
        if (e instanceof AppError) return errorResponse(res, e.message, e.code, e.status);
        if (e instanceof SyntaxError) {
          return errorResponse(res, "Invalid JSON", "PARSE_ERROR", 400);
        }
        console.error(e);
        errorResponse(res, "Internal server error", "INTERNAL_ERROR", 500);
      };
      try {
        const result = match.handler(req, res, match.params, url.searchParams);
        if (result && typeof result.catch === "function") {
          result.catch(handleError);
        }
      } catch (e) {
        handleError(e);
      }
      return;
    }

    serveStatic(req, res, url.pathname);
  });

  server.listen(port, () => {
    console.log("A-Solid Audit server running at http://localhost:" + port);
    console.log("Reports: " + reportsDir);
  });

  return server;
}

// Allow direct execution for testing
if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  import("../lib/paths.mjs").then(({ resolveProjectDir }) => {
    const projectDir = resolveProjectDir(process.argv[2]);
    const port = parseInt(process.argv[3], 10) || 3456;
    startServer(projectDir, port);
  });
}
