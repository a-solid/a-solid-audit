// skills/audit/scripts/lib/providers.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROVIDERS_DIR = path.join(__dirname, "providers");

export function listProviders() {
  if (!fs.existsSync(PROVIDERS_DIR)) return [];
  return fs.readdirSync(PROVIDERS_DIR).filter(f => {
    const fullPath = path.join(PROVIDERS_DIR, f);
    try { fs.accessSync(fullPath, fs.constants.X_OK); return true; } catch { return false; }
  }).map(f => path.basename(f, path.extname(f)));
}

export function fetchFromProvider(providerName, storyIds) {
  if (!fs.existsSync(PROVIDERS_DIR)) throw new Error("No providers directory found");

  const candidates = fs.readdirSync(PROVIDERS_DIR).filter(f => {
    const base = path.basename(f, path.extname(f));
    return base === providerName;
  });
  if (candidates.length === 0) throw new Error("Provider not found: " + providerName);

  const providerPath = path.join(PROVIDERS_DIR, candidates[0]);

  let stdout;
  try {
    stdout = execFileSync(providerPath, storyIds, {
      encoding: "utf8", timeout: 60000, maxBuffer: 1024 * 1024 * 10,
    });
  } catch (e) {
    throw new Error("Provider '" + providerName + "' failed: " + (e.stderr || e.message));
  }

  let stories;
  try { stories = JSON.parse(stdout); } catch {
    throw new Error("Provider '" + providerName + "' returned invalid JSON");
  }
  if (!Array.isArray(stories)) throw new Error("Provider must return a JSON array");

  return stories;
}
