// skills/audit/scripts/lib/paths.mjs
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function resolveProjectDir(explicitDir) {
  if (explicitDir) return path.resolve(explicitDir);

  try {
    const gitRoot = execSync("git rev-parse --show-toplevel", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    if (gitRoot && fs.existsSync(path.join(gitRoot, ".git"))) return gitRoot;
  } catch {}

  let dir = process.cwd();
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, ".git"))) return dir;
    dir = path.dirname(dir);
  }

  return process.cwd();
}

function loadAuditSettings() {
  const settingsPath = path.join(import.meta.dirname, "..", "settings.json");
  if (!fs.existsSync(settingsPath)) return {};
  try {
    const data = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    return data.audit || {};
  } catch {
    return {};
  }
}

export function resolveProjectName(projectDir, settings) {
  if (settings.projectName) return settings.projectName;
  return path.basename(path.resolve(projectDir));
}

export function resolveReportsDir(projectDir) {
  const settings = loadAuditSettings();
  const rawRoot = settings.rootDir || "~/.audit";
  const rootDir = rawRoot.startsWith("~")
    ? path.join(os.homedir(), rawRoot.slice(1))
    : path.resolve(rawRoot);
  const projectName = resolveProjectName(projectDir, settings);
  return path.join(rootDir, projectName);
}
