// skills/audit/scripts/server/handlers/stories.mjs
import fs from "node:fs";
import path from "node:path";
import { sanitizePath } from "../../lib/session.mjs";
import { taskFileName } from "../../lib/git.mjs";
import { readYaml, writeYaml, writeIndexYaml, writeStoryTaskYaml } from "../../lib/yaml.mjs";
import { listProviders, fetchFromProvider } from "../../lib/providers.mjs";
import { jsonResponse, readBody, errorResponse } from "../index.mjs";

export function registerStoryRoutes(router, reportsDir) {
  // GET /api/providers
  router.get("/api/providers", (req, res, params) => {
    jsonResponse(res, listProviders());
  });

  // POST /api/providers/:name/fetch
  router.post("/api/providers/:name/fetch", async (req, res, params) => {
    try {
      const body = JSON.parse(await readBody(req));
      const ids = body?.ids;
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return errorResponse(res, "Missing required field: ids (non-empty array)", "VALIDATION_ERROR", 400);
      }
      const stories = fetchFromProvider(params.name, ids);
      jsonResponse(res, stories);
    } catch (e) {
      if (e.message.includes("Provider not found")) return errorResponse(res, e.message, "NOT_FOUND", 404);
      if (e.message.includes("Provider") && e.message.includes("failed")) {
        return errorResponse(res, e.message, "PROVIDER_ERROR", 502);
      }
      throw e;
    }
  });

  // GET /api/sessions/:id/stories — all story tasks
  router.get("/api/sessions/:id/stories", (req, res, params) => {
    try {
      const safeSid = sanitizePath(params.id);
      const sessionDir = path.join(reportsDir, safeSid);
      const indexPath = path.join(sessionDir, "index.yaml");
      if (!fs.existsSync(indexPath)) return errorResponse(res, "Session not found", "NOT_FOUND", 404);

      const index = readYaml(indexPath);
      const stories = [];
      for (const ref of index.storyTasks || []) {
        const taskPath = path.join(sessionDir, ref.file);
        if (fs.existsSync(taskPath)) {
          stories.push({ file: ref.file, ...readYaml(taskPath) });
        }
      }
      jsonResponse(res, stories);
    } catch (e) {
      if (e.message.includes("Invalid path")) return errorResponse(res, e.message, "VALIDATION_ERROR", 400);
      throw e;
    }
  });

  // POST /api/sessions/:id/stories — create story task
  router.post("/api/sessions/:id/stories", async (req, res, params) => {
    try {
      const body = JSON.parse(await readBody(req));
      if (!body || !body.name) return errorResponse(res, "Missing required field: name", "VALIDATION_ERROR", 400);

      const safeSid = sanitizePath(params.id);
      const sessionDir = path.join(reportsDir, safeSid);

      const safeName = body.name.replace(/[^a-zA-Z0-9\-_.]/g, "-");
      const storyFile = "story-tasks/" + safeName + ".yaml";
      const storyPath = path.join(sessionDir, storyFile);

      fs.mkdirSync(path.join(sessionDir, "story-tasks"), { recursive: true });
      writeStoryTaskYaml(storyPath, {
        name: safeName,
        status: "pending",
        description: body.description || "",
        acceptance: body.acceptance || "",
        files: body.files || [],
      });

      // Update index.yaml to include the new story task
      const indexPath = path.join(sessionDir, "index.yaml");
      if (fs.existsSync(indexPath)) {
        const index = readYaml(indexPath);
        const storyTasks = index.storyTasks || [];
        if (!storyTasks.some(t => t.file === storyFile)) {
          storyTasks.push({ file: storyFile, status: "pending" });
          // Upgrade session type to "all" if it was "code"
          if (index.session && index.session.type === "code") {
            index.session.type = "all";
          }
          writeIndexYaml(indexPath, {
            ...index,
            storyTasks,
          });
        }
      }

      jsonResponse(res, { file: storyFile, name: safeName }, 201);
    } catch (e) {
      if (e.message.includes("Invalid path")) return errorResponse(res, e.message, "VALIDATION_ERROR", 400);
      throw e;
    }
  });

  // PUT /api/sessions/:id/stories/map — replace file-story mappings
  router.put("/api/sessions/:id/stories/map", async (req, res, params) => {
    try {
      const body = JSON.parse(await readBody(req));
      if (!body || !body.mappings || !Array.isArray(body.mappings)) {
        return errorResponse(res, "Missing required field: mappings (array)", "VALIDATION_ERROR", 400);
      }

      const safeSid = sanitizePath(params.id);
      const sessionDir = path.join(reportsDir, safeSid);
      const indexPath = path.join(sessionDir, "index.yaml");
      if (!fs.existsSync(indexPath)) return errorResponse(res, "Session not found", "NOT_FOUND", 404);

      const index = readYaml(indexPath);
      const storyTasks = index.storyTasks || [];

      for (const storyTask of storyTasks) {
        const mapping = body.mappings.find(m => {
          const safeName = (m.storyName || "").replace(/[^a-zA-Z0-9\-_.]/g, "-");
          return storyTask.file === "story-tasks/" + safeName + ".yaml";
        });
        if (!mapping) continue;

        const taskPath = path.join(sessionDir, storyTask.file);
        if (fs.existsSync(taskPath)) {
          const task = readYaml(taskPath);
          task.files = (mapping.files || []).map(f => {
            const filePath = typeof f === "string" ? f : f.name;
            return { name: filePath, taskFile: "code-tasks/" + taskFileName(filePath) };
          });
          writeYaml(taskPath, task);
        }
      }

      jsonResponse(res, { ok: true });
    } catch (e) {
      if (e.message.includes("Invalid path")) return errorResponse(res, e.message, "VALIDATION_ERROR", 400);
      throw e;
    }
  });
}
