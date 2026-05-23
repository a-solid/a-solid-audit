// skills/audit/scripts/lib/task.mjs
import fs from "node:fs";
import path from "node:path";
import { sanitizePath, sanitizeFilePath } from "./session.mjs";
import { readYaml, writeYaml, writeIndexYaml } from "./yaml.mjs";

const ALLOWED_STATUSES = ["pending", "reviewing", "reviewed"];

export function updateTask(reportsDir, sid, taskFile, status, score, reviewData) {
  if (!ALLOWED_STATUSES.includes(status)) {
    throw new Error("Invalid status: " + status + ". Allowed: " + ALLOWED_STATUSES.join(", "));
  }

  const safeSid = sanitizePath(sid);
  const sessionDir = path.join(reportsDir, safeSid);
  const safeTaskFile = sanitizeFilePath(taskFile);
  const taskPath = path.join(sessionDir, safeTaskFile);
  const indexPath = path.join(sessionDir, "index.yaml");

  if (!fs.existsSync(taskPath)) throw new Error("Task file not found: " + taskPath);
  if (!fs.existsSync(indexPath)) throw new Error("Session not found: " + safeSid);

  const task = readYaml(taskPath);
  task.status = status;
  if (score !== undefined && score !== null) task.review.score = parseInt(score, 10);
  if (reviewData) {
    task.review = { ...task.review, ...reviewData };
  }
  writeYaml(taskPath, task);

  const index = readYaml(indexPath);
  let allReviewed = true;
  for (const taskGroup of ["codeTasks", "storyTasks"]) {
    const tasks = index[taskGroup] || [];
    for (const t of tasks) {
      if (t.file === safeTaskFile) t.status = status;
      if (t.status !== "reviewed") allReviewed = false;
    }
  }
  if (allReviewed) index.session.status = "completed";
  writeIndexYaml(indexPath, index);

  return { file: safeTaskFile, status };
}

// Get all tasks for a session
export function getTasks(reportsDir, sid) {
  const safeSid = sanitizePath(sid);
  const sessionDir = path.join(reportsDir, safeSid);
  const indexPath = path.join(sessionDir, "index.yaml");
  if (!fs.existsSync(indexPath)) throw new Error("Session not found: " + safeSid);

  const index = readYaml(indexPath);
  const result = [];

  for (const ref of index.codeTasks || []) {
    const taskPath = path.join(sessionDir, ref.file);
    if (fs.existsSync(taskPath)) {
      const task = readYaml(taskPath);
      result.push({ type: "code", file: ref.file, ...task });
    }
  }

  for (const ref of index.storyTasks || []) {
    const taskPath = path.join(sessionDir, ref.file);
    if (fs.existsSync(taskPath)) {
      const task = readYaml(taskPath);
      result.push({ type: "story", file: ref.file, ...task });
    }
  }

  return result;
}

// Get single task detail
export function getTask(reportsDir, sid, taskFile) {
  const safeSid = sanitizePath(sid);
  const sessionDir = path.join(reportsDir, safeSid);
  const indexPath = path.join(sessionDir, "index.yaml");
  if (!fs.existsSync(indexPath)) throw new Error("Session not found: " + safeSid);

  const index = readYaml(indexPath);
  const allRefs = [...(index.codeTasks || []), ...(index.storyTasks || [])];
  const ref = allRefs.find(t => t.file === taskFile || decodeURIComponent(t.file) === taskFile);
  if (!ref) return null;

  const taskPath = path.join(sessionDir, ref.file);
  if (!fs.existsSync(taskPath)) return null;

  const task = readYaml(taskPath);
  const type = (index.codeTasks || []).some(t => t.file === ref.file) ? "code" : "story";
  return { type, file: ref.file, ...task };
}
