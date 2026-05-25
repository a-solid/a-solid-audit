// skills/audit/scripts/server/handlers/settings.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync, execFileSync } from "node:child_process";
import { jsonResponse, errorResponse, readBody } from "../index.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SETTINGS_PATH = path.join(__dirname, "..", "..", "settings.json");

export function loadSettings() {
  if (!fs.existsSync(SETTINGS_PATH)) return {};
  try { return JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8")); }
  catch { return {}; }
}

export function codegraphBin() {
  const settings = loadSettings();
  return settings.codegraph?.path || "codegraph";
}

function saveSettings(data) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

function toPublicResponse(settings) {
  const result = {};
  if (settings.jira) {
    result.jira = {
      configured: !!(settings.jira.baseUrl && settings.jira.token),
      baseUrl: settings.jira.baseUrl || "",
      email: settings.jira.email || "",
    };
  } else {
    result.jira = { configured: false, baseUrl: "", email: "" };
  }
  if (settings.database) {
    result.database = {
      configured: !!(settings.database.host && settings.database.name),
      host: settings.database.host || "",
      port: settings.database.port || 5432,
      name: settings.database.name || "",
      user: settings.database.user || "",
    };
  } else {
    result.database = { configured: false, host: "", port: 5432, name: "", user: "" };
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

  // GET /api/codegraph/status
  router.get("/api/codegraph/status", (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const dir = url.searchParams.get("dir") || "";
      const result = { available: false, initialized: false, indexed: false, fileCount: null, symbolCount: null };

      // Check CLI availability
      const bin = codegraphBin();
      try {
        execFileSync("which", [bin === "codegraph" ? "codegraph" : bin], { encoding: "utf-8", timeout: 5000 });
        result.available = true;
      } catch {
        return jsonResponse(res, result);
      }

      // Check .codegraph/ directory
      if (!dir) return jsonResponse(res, result);
      const codegraphDir = path.join(dir, ".codegraph");
      if (!fs.existsSync(codegraphDir)) return jsonResponse(res, result);
      result.initialized = true;

      // Get index stats
      try {
        const raw = execFileSync(bin, ["status", "--json", dir], { encoding: "utf-8", timeout: 5000 });
        const stats = JSON.parse(raw);
        result.indexed = stats.initialized;
        result.fileCount = stats.fileCount || null;
        result.symbolCount = stats.nodeCount || null;
      } catch {}

      jsonResponse(res, result);
    } catch (e) {
      errorResponse(res, "Failed to check codegraph status: " + e.message, "INTERNAL_ERROR", 500);
    }
  });

  // POST /api/codegraph/init
  router.post("/api/codegraph/init", async (req, res) => {
    try {
      const body = JSON.parse(await readBody(req));
      const dir = body?.projectDir;
      if (!dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
        return errorResponse(res, "Invalid project directory", "VALIDATION_ERROR", 400);
      }

      console.log(`[codegraph] Initializing: ${dir}`);
      const bin = codegraphBin();
      execFileSync(bin, ["init", "-i", dir], { encoding: "utf-8", timeout: 30000 });
      console.log(`[codegraph] Indexing: ${dir}`);
      execFileSync(bin, ["index", dir], { encoding: "utf-8", timeout: 120000 });
      console.log(`[codegraph] Done`);

      jsonResponse(res, { ok: true });
    } catch (e) {
      console.error(`[codegraph] Init failed: ${e.message}`);
      errorResponse(res, "CodeGraph init failed: " + e.message, "INTERNAL_ERROR", 500);
    }
  });
}
