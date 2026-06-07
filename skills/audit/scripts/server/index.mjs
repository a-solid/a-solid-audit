// skills/audit/scripts/server/index.mjs
import http from "node:http";
import { execSync } from "node:child_process";
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
import { registerWaitRoutes, cancelAllWaiters } from "./handlers/wait.mjs";
import { registerRoundRoutes } from "./handlers/rounds.mjs";
import { AppError } from "../lib/errors.mjs";
import { resolveReportsDir } from "../lib/paths.mjs";
import { pauseStaleSessions } from "../lib/session.mjs";

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

function killPortOccupant(port) {
  try {
    const out = execSync(`lsof -ti :${port}`, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    if (!out) return false;
    for (const pid of out.split("\n").map(Number)) {
      if (pid && pid !== process.pid) {
        try { process.kill(pid, "SIGKILL"); } catch {}
      }
    }
    return true;
  } catch {
    return false;
  }
}

export function startServer(projectDir, port = 12345) {
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
  registerWaitRoutes(router, reportsDir);
  registerRoundRoutes(router, projectDir);

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

  server.on("error", (e) => {
    if (e.code === "EADDRINUSE") {
      console.log(`Port ${port} in use, killing occupant...`);
      const killed = killPortOccupant(port);
      if (killed) {
        setTimeout(() => {
          server.listen(port);
        }, 200);
      } else {
        console.error(`Cannot free port ${port}`);
        process.exit(1);
      }
    } else {
      throw e;
    }
  });

  server.listen(port, () => {
    console.log("A-Solid Audit server running at http://localhost:" + port);
    console.log("Reports: " + reportsDir);
    pauseStaleSessions(reportsDir);
  });

  server.on("close", () => {
    cancelAllWaiters();
  });

  return server;
}

// Allow direct execution for testing
if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  import("../lib/paths.mjs").then(({ resolveProjectDir }) => {
    const projectDir = resolveProjectDir(process.argv[2]);
    const port = parseInt(process.argv[3], 10) || 12345;
    startServer(projectDir, port);
  });
}
