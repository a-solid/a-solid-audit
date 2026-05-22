# Fix .audit Path Resolution

## Problem

The audit server uses `process.cwd()` to determine the project root. When the Node.js process is launched from `skills/audit/` (e.g., Claude agent's cwd is the skill directory), `.audit` gets generated under `skills/audit/.audit` instead of the project root.

Additionally, `mapping.mjs` reconstructs `projectDir` from `reportsDir` using a fragile regex: `reportsDir.replace(/\/\.audit$/, "")`. This breaks when `.audit` is not at the expected path.

## Solution: Dual Git Root Detection

Add a `resolveProjectDir()` utility with a fallback chain:

1. **Explicit `--project-dir`** — if passed, use directly (kept for edge cases)
2. **`git rev-parse --show-toplevel`** — run from `process.cwd()`, returns the git worktree root
3. **Walk up from `process.cwd()` looking for `.git`** — backup if git command fails
4. **Fallback: `process.cwd()`** — last resort

## Changes

### New: `scripts/lib/paths.mjs`

Export `resolveProjectDir(explicitDir)`:

```js
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
```

### Edit: `scripts/cli.mjs`

- Import `resolveProjectDir` from `lib/paths.mjs`
- Replace `let projectDir = process.cwd()` with `let projectDir = resolveProjectDir()`
- `--project-dir` flag passes its value to `resolveProjectDir(value)`

### Edit: `scripts/server/index.mjs`

- Import `resolveProjectDir`
- Self-execution block (line 69): replace `process.argv[2] || process.cwd()` with `resolveProjectDir(process.argv[2])`

### Edit: `scripts/lib/mapping.mjs`

- `setScope` signature changes from `(reportsDir, sid, scopeType, scopeRef)` to `(projectDir, reportsDir, sid, scopeType, scopeRef)`
- Replace `reportsDir.replace(/\/\.audit$/, "")` with the new `projectDir` parameter
- `mapStories` is unchanged (it doesn't use projectDir)

### Edit: `scripts/server/handlers/audit.mjs`

- Line 43: pass `projectDir` to `setScope`: `setScope(projectDir, reportsDir, params.id, body.method, body.ref || "")`

### Edit: `skills/audit/SKILL.md`

- Update command docs to explicitly say **do not pass `--project-dir`** — the script auto-detects the project root via git
- Keep `--project-dir` mentioned as a rare escape hatch only

## What Doesn't Change

- `startServer(projectDir, port)` signature — unchanged
- All downstream `reportsDir` consumers — unchanged
- `mapStories` function — unchanged
