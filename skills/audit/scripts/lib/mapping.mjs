// skills/audit/scripts/lib/mapping.mjs
import fs from "node:fs";
import path from "node:path";
import { sanitizePath } from "./session.mjs";
import { taskFileName, runGitDiff, parseDiffByFile, detectLanguage } from "./git.mjs";
import { readYaml, writeIndexYaml, writeCodeTaskYaml, writeStoryTaskYaml } from "./yaml.mjs";

// Generate code task YAMLs from git diff scope and update index
export function setScope(projectDir, reportsDir, sid, scopeType, scopeRef, excludeFiles = []) {
  const safeSid = sanitizePath(sid);
  const sessionDir = path.join(reportsDir, safeSid);
  const indexPath = path.join(sessionDir, "index.yaml");
  if (!fs.existsSync(indexPath)) throw new Error("Session not found: " + safeSid);

  const diff = runGitDiff(scopeType, scopeRef, projectDir);
  if (!diff.trim()) throw new Error("No diff found for the selected scope");

  const filesMap = parseDiffByFile(diff);
  const exclude = new Set(excludeFiles || []);
  const tasksDir = path.join(sessionDir, "code-tasks");
  fs.mkdirSync(tasksDir, { recursive: true });

  const tasks = [];
  for (const [filePath, fileData] of Object.entries(filesMap)) {
    if (exclude.has(filePath)) continue;
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

  const index = readYaml(indexPath);
  const existingType = index.session.type;
  writeIndexYaml(indexPath, {
    session: {
      id: safeSid,
      type: existingType === "all" ? "all" : "code",
      status: "scoped",
      scope: { method: scopeType, ref: scopeRef || "" },
      created: index.session.created || new Date().toISOString(),
    },
    codeTasks: tasks,
    storyTasks: index.storyTasks || [],
  });

  return { scope: { method: scopeType, ref: scopeRef }, taskCount: tasks.length };
}

// Map stories to files
export function mapStories(reportsDir, sid, mapping) {
  const safeSid = sanitizePath(sid);
  const sessionDir = path.join(reportsDir, safeSid);
  const tasksDir = path.join(sessionDir, "story-tasks");
  const indexPath = path.join(sessionDir, "index.yaml");

  if (!fs.existsSync(indexPath)) throw new Error("Session not found: " + safeSid);
  fs.mkdirSync(tasksDir, { recursive: true });

  if (!Array.isArray(mapping)) throw new Error("Invalid mapping: expected array");

  const index = readYaml(indexPath);
  const existingStoryFiles = new Set((index.storyTasks || []).map(t => t.file));
  const newStoryTasks = [];

  for (const entry of mapping) {
    if (!entry.storyName) continue;
    const safeName = entry.storyName.replace(/[^a-zA-Z0-9\-_.]/g, "-");
    const storyFile = "story-tasks/" + safeName + ".yaml";
    if (existingStoryFiles.has(storyFile)) continue;

    const files = (entry.files || []).map(f => {
      const filePath = typeof f === "string" ? f : f.name;
      return { name: filePath, taskFile: "code-tasks/" + taskFileName(filePath) };
    });

    writeStoryTaskYaml(path.join(sessionDir, storyFile), {
      name: safeName,
      status: "pending",
      description: entry.description || "",
      acceptance: entry.acceptance || "",
      files,
    });

    newStoryTasks.push({ file: storyFile, status: "pending" });
  }

  index.storyTasks = [...(index.storyTasks || []), ...newStoryTasks];
  if (newStoryTasks.length > 0 && index.session.type === "code") {
    index.session.type = "all";
  }
  writeIndexYaml(indexPath, index);

  return { created: newStoryTasks.length };
}
