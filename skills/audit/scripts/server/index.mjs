// skills/audit/scripts/server/index.mjs
import http from "node:http";
import path from "node:path";
import { createRouter } from "./router.mjs";
import { serveStatic } from "./static.mjs";
import { registerSessionRoutes } from "./handlers/sessions.mjs";
import { registerAuditRoutes } from "./handlers/audit.mjs";
import { registerStoryRoutes } from "./handlers/stories.mjs";
import { registerTaskRoutes } from "./handlers/tasks.mjs";
import { registerNoteRoutes } from "./handlers/notes.mjs";

export function jsonResponse(res, data, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

export function errorResponse(res, message, code, status = 400) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: message, code }));
}

export function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
  });
}

export function startServer(projectDir, port = 3456) {
  const reportsDir = path.join(projectDir, ".audit");

  const router = createRouter();
  registerSessionRoutes(router, reportsDir);
  registerAuditRoutes(router, projectDir, reportsDir);
  registerStoryRoutes(router, reportsDir);
  registerTaskRoutes(router, reportsDir);
  registerNoteRoutes(router, reportsDir);

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);

    const match = router.resolve(req.method, url.pathname);
    if (match) {
      try {
        return match.handler(req, res, match.params);
      } catch (e) {
        if (e instanceof SyntaxError) {
          return errorResponse(res, "Invalid JSON", "PARSE_ERROR", 400);
        }
        console.error(e);
        errorResponse(res, "Internal server error", "INTERNAL_ERROR", 500);
      }
    }

    serveStatic(req, res, url.pathname);
  });

  server.listen(port, () => {
    console.log("A-Solid Audit server running at http://localhost:" + port);
    console.log("Project: " + projectDir);
  });

  return server;
}

// Allow direct execution for testing
if (process.argv[1] && process.argv[1] === import.meta.filename) {
  const projectDir = process.argv[2] || process.cwd();
  const port = parseInt(process.argv[3], 10) || 3456;
  startServer(projectDir, port);
}
