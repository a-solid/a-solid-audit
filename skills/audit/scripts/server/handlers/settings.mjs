// skills/audit/scripts/server/handlers/settings.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { jsonResponse, errorResponse, readBody } from "../index.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SETTINGS_PATH = path.join(__dirname, "..", "..", "settings.json");

function loadSettings() {
  if (!fs.existsSync(SETTINGS_PATH)) return {};
  try { return JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8")); }
  catch { return {}; }
}

function saveSettings(data) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

function toPublicResponse(settings) {
  const result = {};
  if (settings.anthropic) {
    result.anthropic = { configured: !!(settings.anthropic.apiKey) };
  } else {
    result.anthropic = { configured: false };
  }
  if (settings.jira) {
    result.jira = { configured: !!(settings.jira.baseUrl && settings.jira.token) };
  } else {
    result.jira = { configured: false };
  }
  if (settings.database) {
    result.database = { configured: !!(settings.database.host && settings.database.name) };
  } else {
    result.database = { configured: false };
  }
  result.codegraph = {
    path: settings.codegraph?.path || "~/.local/bin/codegraph",
  };
  result.customVars = (settings.customVars || []).map(v => ({
    key: v.key,
    configured: !!(v.value),
  }));
  return result;
}

export function registerSettingsRoutes(router) {
  // GET /api/settings
  router.get("/api/settings", (req, res) => {
    const settings = loadSettings();
    jsonResponse(res, toPublicResponse(settings));
  });

  // PUT /api/settings
  router.put("/api/settings", async (req, res) => {
    try {
      const body = JSON.parse(await readBody(req));
      if (!body || typeof body !== "object") {
        return errorResponse(res, "Invalid body", "VALIDATION_ERROR", 400);
      }
      const existing = loadSettings();

      if (body.anthropic) existing.anthropic = body.anthropic;
      if (body.jira) existing.jira = body.jira;
      if (body.database) existing.database = body.database;
      if (body.codegraph) existing.codegraph = body.codegraph;
      if (body.customVars) existing.customVars = body.customVars;

      saveSettings(existing);
      jsonResponse(res, toPublicResponse(existing));
    } catch (e) {
      errorResponse(res, "Failed to save settings: " + e.message, "INTERNAL_ERROR", 500);
    }
  });
}

export { loadSettings, SETTINGS_PATH };
