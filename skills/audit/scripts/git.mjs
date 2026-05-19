import fs from "node:fs";
import path from "node:path";

import { getReportsDir, sanitizePath, getProjectDir } from "./cli.mjs";
import { writeIndexYaml, writeCodeTaskYaml, readYaml } from "./yaml.mjs";

export {
  detectLanguage, runGitDiff, parseDiffByFile, taskFileName,
  getCommits, getBranches, getDiffFileList,
} from "./lib/git.mjs";

import { runGitDiff as _runGitDiff, parseDiffByFile as _parseDiffByFile, taskFileName as _taskFileName, detectLanguage as _detectLanguage } from "./lib/git.mjs";

export function cmdGitDiff(sessionId, scopeType, scopeRef) {
  const safeSid = sanitizePath(sessionId);
  const sessionDir = path.join(getReportsDir(), safeSid);
  if (!fs.existsSync(sessionDir)) {
    throw new Error("Session not found: " + sessionDir);
  }
  const diff = _runGitDiff(scopeType, scopeRef, getProjectDir());
  if (!diff.trim()) {
    console.log("No diff found.");
    return;
  }
  const filesMap = _parseDiffByFile(diff);
  const tasksDir = path.join(sessionDir, "code-tasks");
  fs.mkdirSync(tasksDir, { recursive: true });
  const tasks = [];
  for (const [filePath, diffText] of Object.entries(filesMap)) {
    const hasChanges = diffText.split("\n").some(
      l => (l.startsWith("+") && !l.startsWith("+++")) || (l.startsWith("-") && !l.startsWith("---"))
    );
    if (!hasChanges) continue;
    const tf = _taskFileName(filePath);
    const task = { name: filePath, status: "pending", language: _detectLanguage(filePath), diff: diffText, review: { score: 0, summary: "", findings: [], positives: [] } };
    writeCodeTaskYaml(path.join(tasksDir, tf), task);
    tasks.push({ file: "code-tasks/" + tf, status: "pending" });
  }
  const indexPath = path.join(sessionDir, "index.yaml");
  const existingIndex = fs.existsSync(indexPath) ? readYaml(indexPath) : null;
  writeIndexYaml(indexPath, {
    session: {
      id: safeSid,
      type: existingIndex?.session?.type === "all" ? "all" : "code",
      scope: { method: scopeType, ref: scopeRef || "" },
      created: existingIndex?.session?.created || new Date().toISOString(),
      completed: false,
    },
    codeTasks: tasks,
    storyTasks: existingIndex?.storyTasks || [],
  });
  console.log(`Created ${tasks.length} task file(s) in ${tasksDir}`);
}
