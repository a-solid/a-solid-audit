// skills/audit/scripts/lib/session.mjs
import fs from "node:fs";
import path from "node:path";
import { readYaml, writeYaml, writeIndexYaml } from "./yaml.mjs";
import { AppError } from "./errors.mjs";

const VALID_STATUSES = ["created", "scanned", "ready", "scanning", "grouping", "reviewing", "completed"];

const TRANSITIONS = {
  code: {
    created: ["ready"],
    ready: ["reviewing"],
    reviewing: ["completed"],
    completed: [],
  },
  all: {
    created: ["ready"],
    ready: ["reviewing"],
    reviewing: ["completed"],
    completed: [],
  },
  project: {
    created: ["scanning"],
    scanning: ["scanned"],
    scanned: ["grouping"],
    grouping: ["ready"],
    ready: ["reviewing"],
    reviewing: ["completed"],
    completed: [],
  },
};

export function sanitizePath(segment) {
  const s = String(segment);
  if (s.includes("..") || s.includes("/") || s.includes("\\") || s.includes("\0")) {
    throw new AppError("Invalid path segment: " + s, "VALIDATION_ERROR", 400);
  }
  return s;
}

export function sanitizeFilePath(segment) {
  const s = String(segment);
  if (s.includes("..") || s.includes("\\") || s.includes("\0") || path.isAbsolute(s)) {
    throw new AppError("Invalid file path: " + s, "VALIDATION_ERROR", 400);
  }
  return s;
}

export function validateVersion(version) {
  const s = String(version);
  if (!/^v\d+$/.test(s)) {
    throw new AppError("Invalid version format: " + s + " (expected v<N>)", "VALIDATION_ERROR", 400);
  }
  return s;
}

export function resolveSessionPath(reportsDir, roundName, version) {
  const safeRound = sanitizePath(roundName);
  const safeVersion = validateVersion(version);
  const candidate = path.join(reportsDir, safeRound, safeVersion, "index.yaml");
  if (fs.existsSync(candidate)) return candidate;
  return null;
}

export function resolveSessionDir(reportsDir, roundName, version) {
  const safeRound = sanitizePath(roundName);
  const safeVersion = validateVersion(version);
  const dir = path.join(reportsDir, safeRound, safeVersion);
  if (fs.existsSync(dir)) return dir;
  return null;
}

// List all sessions (versions) within a round directory
export function listSessions(reportsDir, roundName) {
  const safeRound = sanitizePath(roundName);
  const roundDir = path.join(reportsDir, safeRound);
  if (!fs.existsSync(roundDir)) return [];

  const entries = fs.readdirSync(roundDir).filter(e => {
    if (!/^v\d+$/.test(e)) return false;
    const full = path.join(roundDir, e);
    if (!fs.statSync(full).isDirectory()) return false;
    return fs.existsSync(path.join(full, "index.yaml"));
  });

  return entries.map(id => {
    const index = readYaml(path.join(roundDir, id, "index.yaml"));
    const taskRefs = [
      ...(index.codeTasks || []),
      ...(index.storyTasks || []),
      ...(index.projectTasks || []),
    ];
    const reviewed = taskRefs.filter(t => t.status === "reviewed").length;
    return {
      id: id,
      type: index.session.type,
      status: index.session.status || "created",
      created: index.session.created,
      roundName: index.session.roundName || roundName,
      version: parseInt(id.slice(1), 10),
      progress: {
        total: taskRefs.length,
        reviewed,
        percentage: taskRefs.length ? Math.round((reviewed / taskRefs.length) * 100) : 0,
      },
    };
  }).sort((a, b) => b.version - a.version);
}

// Get single session detail
export function getSession(reportsDir, roundName, version) {
  const safeRound = sanitizePath(roundName);
  validateVersion(version);
  const indexPath = resolveSessionPath(reportsDir, roundName, version);
  if (!indexPath) return null;
  const index = readYaml(indexPath);

  const codeTasks = [];
  const storyTasks = [];
  const projectTasks = [];
  const counts = { reviewed: 0, reviewing: 0, pending: 0 };

  for (const ref of index.codeTasks || []) {
    const status = ref.status || "pending";
    counts[status] = (counts[status] || 0) + 1;
    codeTasks.push({ ...ref, status });
  }
  for (const ref of index.storyTasks || []) {
    const status = ref.status || "pending";
    counts[status] = (counts[status] || 0) + 1;
    storyTasks.push({ ...ref, status });
  }
  for (const ref of index.projectTasks || []) {
    const status = ref.status || "pending";
    counts[status] = (counts[status] || 0) + 1;
    projectTasks.push({ ...ref, status });
  }

  const allTasks = [...codeTasks, ...storyTasks, ...projectTasks];
  return {
    ...index.session,
    status: index.session.status || "created",
    codeTasks,
    storyTasks,
    projectTasks,
    progress: {
      total: allTasks.length,
      ...counts,
      percentage: allTasks.length ? Math.round((counts.reviewed / allTasks.length) * 100) : 0,
    },
  };
}

// Update session status with type-aware state machine validation
export function updateSessionStatus(reportsDir, roundName, version, newStatus) {
  if (!VALID_STATUSES.includes(newStatus)) {
    throw new AppError("Invalid status: " + newStatus, "VALIDATION_ERROR", 400);
  }
  const safeRound = sanitizePath(roundName);
  validateVersion(version);
  const indexPath = resolveSessionPath(reportsDir, roundName, version);
  if (!indexPath) throw new AppError("Session not found: " + safeRound + "/" + version, "NOT_FOUND", 404);
  const index = readYaml(indexPath);
  const current = index.session.status || "created";
  const type = index.session.type || "code";

  const transitions = TRANSITIONS[type] || TRANSITIONS.code;
  const allowed = transitions[current] || [];
  if (!allowed.includes(newStatus)) {
    throw new AppError(`Cannot transition from "${current}" to "${newStatus}" (type: ${type}). Allowed: ${allowed.join(", ") || "none"}`, "CONFLICT", 409);
  }

  index.session.status = newStatus;
  writeIndexYaml(indexPath, index);
  return index.session;
}

// Update mutable session fields (projectDir, etc.)
const MUTABLE_FIELDS = ["projectDir"];
export function updateSession(reportsDir, roundName, version, updates) {
  const safeRound = sanitizePath(roundName);
  validateVersion(version);
  const indexPath = resolveSessionPath(reportsDir, roundName, version);
  if (!indexPath) throw new AppError("Session not found: " + safeRound + "/" + version, "NOT_FOUND", 404);
  const index = readYaml(indexPath);
  for (const key of MUTABLE_FIELDS) {
    if (key in updates) {
      index.session[key] = updates[key];
    }
  }
  writeIndexYaml(indexPath, index);
  return index.session;
}

// Create a new session with initial index.yaml
export function createSession(reportsDir, roundName, version, options = {}) {
  const safeRound = sanitizePath(roundName);
  const safeVersion = validateVersion(version);
  const roundDir = path.join(reportsDir, safeRound);

  if (!fs.existsSync(path.join(roundDir, "round.yaml"))) {
    throw new AppError("Round not found: " + safeRound, "NOT_FOUND", 404);
  }

  const sessionDir = path.join(roundDir, safeVersion);
  if (fs.existsSync(sessionDir)) {
    throw new AppError("Session version already exists: " + safeRound + "/" + safeVersion, "CONFLICT", 409);
  }

  fs.mkdirSync(path.join(sessionDir, "code-tasks"), { recursive: true });
  fs.mkdirSync(path.join(sessionDir, "story-tasks"), { recursive: true });
  fs.mkdirSync(path.join(sessionDir, "project-tasks"), { recursive: true });
  fs.writeFileSync(
    path.join(sessionDir, "review-context.md"),
    "## User Context\n\n\n## Review Notes\n<!-- AI agents append shared observations here -->\n",
    "utf-8",
  );
  writeIndexYaml(path.join(sessionDir, "index.yaml"), {
    session: {
      id: safeVersion,
      type: options.type || "code",
      status: "created",
      version: parseInt(safeVersion.slice(1), 10),
      scope: options.type === "project" ? null : { method: "", ref: "" },
      projectDir: options.projectDir || null,
      roundName: safeRound,
      created: new Date().toISOString(),
    },
    codeTasks: [],
    storyTasks: [],
    projectTasks: [],
  });
  return { id: safeVersion, dir: sessionDir };
}

// Reset reviewing tasks to pending (for resume)
export function resetReviewing(reportsDir, roundName, version) {
  const safeRound = sanitizePath(roundName);
  validateVersion(version);
  const indexPath = resolveSessionPath(reportsDir, roundName, version);
  if (!indexPath) throw new AppError("Session not found: " + safeRound + "/" + version, "NOT_FOUND", 404);

  const index = readYaml(indexPath);
  let resetCount = 0;

  for (const taskGroup of ["codeTasks", "storyTasks", "projectTasks"]) {
    for (const ref of index[taskGroup] || []) {
      if (ref.status === "reviewing") {
        ref.status = "pending";
        resetCount++;
      }
    }
  }

  if (resetCount > 0) {
    writeIndexYaml(indexPath, index);
  }

  return resetCount;
}
