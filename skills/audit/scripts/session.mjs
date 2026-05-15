import fs from "node:fs";
import path from "node:path";

import { getReportsDir, sanitizePath } from "./cli.mjs";
import { readYaml, writeIndexYaml, patchYaml } from "./yaml.mjs";

export function cmdInit(sid) {
  if (!sid) throw new Error("Session ID is required");
  const safeSid = sanitizePath(sid);
  const base = path.join(getReportsDir(), safeSid);
  fs.mkdirSync(path.join(base, "code-tasks"), { recursive: true });
  fs.mkdirSync(path.join(base, "story-tasks"), { recursive: true });
  console.log(`Initialized session: ${base}`);
}

export function cmdResetReviewing(sessionId) {
  const safeSid = sanitizePath(sessionId);
  const sessionDir = path.join(getReportsDir(), safeSid);
  const indexPath = path.join(sessionDir, "index.yaml");
  if (!fs.existsSync(indexPath)) throw new Error("Session not found: " + sessionDir);

  const index = readYaml(indexPath);
  let resetCount = 0;

  for (const taskGroup of ["codeTasks", "storyTasks"]) {
    const tasks = index[taskGroup] || [];
    for (let i = 0; i < tasks.length; i++) {
      if (tasks[i].status === "reviewing") {
        tasks[i].status = "pending";
        resetCount++;
        const taskPath = path.join(sessionDir, tasks[i].file);
        if (fs.existsSync(taskPath)) {
          patchYaml(taskPath, { status: "pending" });
        }
      }
    }
  }

  writeIndexYaml(indexPath, index);
  console.log(`Reset ${resetCount} task(s) to pending in session ${safeSid}`);
}
