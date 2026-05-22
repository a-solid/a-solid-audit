// skills/audit/scripts/lib/paths.mjs
import { execSync } from "node:child_process";
import fs from "node:fs";
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
