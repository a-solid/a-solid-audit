// skills/audit/scripts/lib/mapping.mjs
import fs from "node:fs";
import path from "node:path";
import { sanitizePath, updateSessionStatus, resolveSessionPath } from "./session.mjs";
import { taskFileName, runGitDiff, parseDiffByFile, detectLanguage } from "./git.mjs";
import { readYaml, writeIndexYaml, writeCodeTaskYaml } from "./yaml.mjs";

// Generate code task YAMLs from git diff scope and update index
export function setScope(projectDir, reportsDir, sid, scopeType, scopeRef, excludeFiles = []) {
  const safeSid = sanitizePath(sid);
  const resolvedIndex = resolveSessionPath(reportsDir, safeSid);
  if (!resolvedIndex) throw new Error("Session not found: " + safeSid);
  const sessionDir = path.dirname(resolvedIndex);
  const indexPath = resolvedIndex;

  const index = readYaml(indexPath);
  const existingType = index.session.type;

  // Exclude files where all prior findings are resolved
  const resolvedFiles = new Set();
  if (index.session.roundId) {
    const roundNotesPath = path.join(reportsDir, sanitizePath(index.session.roundId), "review-notes.yaml");
    if (fs.existsSync(roundNotesPath)) {
      const roundNotes = readYaml(roundNotesPath);
      for (const task of roundNotes.tasks || []) {
        const taskFindings = task.findings || [];
        if (taskFindings.length > 0 && taskFindings.every(f => ["wont-fix", "not-an-issue", "well-done"].includes(f.status))) {
          resolvedFiles.add(task.file);
        }
      }
    }
  }

  const diff = runGitDiff(scopeType, scopeRef, projectDir);
  if (!diff.trim()) throw new Error("No diff found for the selected scope");

  const filesMap = parseDiffByFile(diff);
  const exclude = new Set(excludeFiles || []);
  const tasksDir = path.join(sessionDir, "code-tasks");
  fs.mkdirSync(tasksDir, { recursive: true });

  const tasks = [];
  for (const [filePath, fileData] of Object.entries(filesMap)) {
    if (exclude.has(filePath)) continue;
    if (resolvedFiles.has("code-tasks/" + taskFileName(filePath))) continue;
    const diffText = fileData.diff;
    const hasChanges = diffText.split("\n").some(
      l => (l.startsWith("+") && !l.startsWith("+++")) || (l.startsWith("-") && !l.startsWith("---"))
    );
    if (!hasChanges) continue;
    const tf = taskFileName(filePath);
    const task = {
      name: filePath, status: "pending", language: detectLanguage(filePath),
      diff: diffText, review: { score: 0, summary: "", findings: [], positives: [] },
    };
    writeCodeTaskYaml(path.join(tasksDir, tf), task);
    tasks.push({ file: "code-tasks/" + tf, status: "pending" });
  }

  const sessionType = existingType === "all" ? "all" : "code";
  writeIndexYaml(indexPath, {
    session: {
      id: safeSid,
      type: sessionType,
      status: index.session.status,
      scope: { method: scopeType, ref: scopeRef || "" },
      created: index.session.created || new Date().toISOString(),
    },
    codeTasks: tasks,
    storyTasks: index.storyTasks || [],
    projectTasks: index.projectTasks || [],
  });
  // Only mark as ready for code-only sessions; "all" type needs story configuration first
  if (sessionType !== "all") {
    updateSessionStatus(reportsDir, safeSid, "ready");
  }

  return { scope: { method: scopeType, ref: scopeRef }, taskCount: tasks.length };
}
