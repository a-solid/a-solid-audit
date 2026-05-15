import fs from "node:fs";
import path from "node:path";

import { getReportsDir, sanitizePath, sanitizeFilePath } from "./cli.mjs";
import { taskFileName } from "./git.mjs";
import { readYaml, writeYaml, writeIndexYaml, writeStoryTaskYaml } from "./yaml.mjs";

const ALLOWED_STATUSES = ["pending", "reviewing", "reviewed"];

export function cmdUpdateTask(sessionId, taskFile, status, score) {
  if (!ALLOWED_STATUSES.includes(status)) throw new Error("Invalid status: " + status + ". Allowed: " + ALLOWED_STATUSES.join(", "));

  const safeSid = sanitizePath(sessionId);
  const sessionDir = path.join(getReportsDir(), safeSid);
  const safeTaskFile = sanitizeFilePath(taskFile);
  const taskPath = path.join(sessionDir, safeTaskFile);
  const indexPath = path.join(sessionDir, "index.yaml");

  if (!fs.existsSync(taskPath)) throw new Error("Task file not found: " + taskPath);
  if (!fs.existsSync(indexPath)) throw new Error("Session not found: " + sessionDir);

  // Update task file
  const task = readYaml(taskPath);
  task.status = status;
  if (score !== undefined && score !== null) task.review.score = parseInt(score, 10);
  writeYaml(taskPath, task);

  // Update index
  const index = readYaml(indexPath);
  let allReviewed = true;
  for (const taskGroup of ["codeTasks", "storyTasks"]) {
    const tasks = index[taskGroup] || [];
    for (const t of tasks) {
      if (t.file === safeTaskFile) t.status = status;
      if (t.status !== "reviewed") allReviewed = false;
    }
  }
  index.session.completed = allReviewed;
  writeIndexYaml(indexPath, index);

  console.log(`Updated ${safeTaskFile}: status=${status}` + (score ? `, score=${score}` : ""));
}

export function cmdMapStories(sessionId, mappingJson) {
  const safeSid = sanitizePath(sessionId);
  const sessionDir = path.join(getReportsDir(), safeSid);
  const tasksDir = path.join(sessionDir, "story-tasks");
  const indexPath = path.join(sessionDir, "index.yaml");

  if (!fs.existsSync(indexPath)) throw new Error("Session not found: " + sessionDir);
  fs.mkdirSync(tasksDir, { recursive: true });

  const mapping = JSON.parse(mappingJson);
  if (!Array.isArray(mapping)) throw new Error("Invalid JSON mapping: expected array");

  const index = readYaml(indexPath);
  const existingStoryFiles = new Set((index.storyTasks || []).map(t => t.file));
  const newStoryTasks = [];

  for (const entry of mapping) {
    if (!entry.storyName) continue;
    const safeName = entry.storyName.replace(/[^a-zA-Z0-9\-_.]/g, "-");
    const storyFile = "story-tasks/" + safeName + ".yaml";
    if (existingStoryFiles.has(storyFile)) continue;

    // Map file paths to taskFile references
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

  console.log(`Created ${newStoryTasks.length} story task(s) in ${tasksDir}`);
}
