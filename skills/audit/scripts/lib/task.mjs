// skills/audit/scripts/lib/task.mjs
import fs from "node:fs";
import path from "node:path";
import { sanitizePath, sanitizeFilePath, updateSessionStatus } from "./session.mjs";
import { readYaml, writeYaml, writeIndexYaml } from "./yaml.mjs";
import { AppError } from "./errors.mjs";

const ALLOWED_STATUSES = ["pending", "reviewing", "reviewed"];

export function updateTask(reportsDir, sid, taskFile, status, score, reviewData, overview) {
  if (!ALLOWED_STATUSES.includes(status)) {
    throw new AppError("Invalid status: " + status + ". Allowed: " + ALLOWED_STATUSES.join(", "), "VALIDATION_ERROR", 400);
  }

  const safeSid = sanitizePath(sid);
  const sessionDir = path.join(reportsDir, safeSid);
  const safeTaskFile = sanitizeFilePath(taskFile);
  const taskPath = path.join(sessionDir, safeTaskFile);
  const indexPath = path.join(sessionDir, "index.yaml");

  if (!fs.existsSync(taskPath)) throw new AppError("Task file not found", "NOT_FOUND", 404);
  if (!fs.existsSync(indexPath)) throw new AppError("Session not found: " + safeSid, "NOT_FOUND", 404);

  // Update task file (review data only, no status)
  const task = readYaml(taskPath);
  if (score !== undefined && score !== null) task.review.score = parseInt(score, 10);
  if (reviewData) {
    task.review = { ...task.review, ...reviewData };
  }
  if (overview && (overview.diagram || overview.description)) {
    task.overview = overview;
  }
  writeYaml(taskPath, task);

  // Update status in index.yaml
  const index = readYaml(indexPath);
  const allTaskGroups = ["codeTasks", "storyTasks", "projectTasks"];
  for (const group of allTaskGroups) {
    const ref = (index[group] || []).find(t => t.file === safeTaskFile);
    if (ref) {
      ref.status = status;
      break;
    }
  }
  writeIndexYaml(indexPath, index);

  // Check if all tasks are reviewed
  const allReviewed = allTaskGroups.every(group =>
    (index[group] || []).every(t => t.status === "reviewed")
  );
  if (allReviewed) {
    updateSessionStatus(reportsDir, safeSid, "completed");
  }

  return { file: safeTaskFile, status };
}

// Get all tasks for a session
export function getTasks(reportsDir, sid) {
  const safeSid = sanitizePath(sid);
  const sessionDir = path.join(reportsDir, safeSid);
  const indexPath = path.join(sessionDir, "index.yaml");
  if (!fs.existsSync(indexPath)) throw new AppError("Session not found: " + safeSid, "NOT_FOUND", 404);

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

  for (const ref of index.projectTasks || []) {
    const taskPath = path.join(sessionDir, ref.file);
    if (fs.existsSync(taskPath)) {
      const task = readYaml(taskPath);
      result.push({ type: "project", file: ref.file, ...task });
    }
  }

  return result;
}

// Get single task detail
export function getTask(reportsDir, sid, taskFile) {
  const safeSid = sanitizePath(sid);
  const sessionDir = path.join(reportsDir, safeSid);
  const indexPath = path.join(sessionDir, "index.yaml");
  if (!fs.existsSync(indexPath)) throw new AppError("Session not found: " + safeSid, "NOT_FOUND", 404);

  const index = readYaml(indexPath);
  const allRefs = [...(index.codeTasks || []), ...(index.storyTasks || []), ...(index.projectTasks || [])];
  const ref = allRefs.find(t => t.file === taskFile || decodeURIComponent(t.file) === taskFile);
  if (!ref) return null;

  const taskPath = path.join(sessionDir, ref.file);
  if (!fs.existsSync(taskPath)) return null;

  const task = readYaml(taskPath);
  const type = (index.codeTasks || []).some(t => t.file === ref.file) ? "code"
    : (index.storyTasks || []).some(t => t.file === ref.file) ? "story"
    : "project";
  return { type, file: ref.file, ...task };
}
