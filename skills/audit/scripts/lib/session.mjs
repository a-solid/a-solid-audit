// skills/audit/scripts/lib/session.mjs
import fs from "node:fs";
import path from "node:path";
import { readYaml, writeIndexYaml, patchYaml } from "./yaml.mjs";

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
    throw new Error("Invalid path segment: " + s);
  }
  return s;
}

export function sanitizeFilePath(segment) {
  const s = String(segment);
  if (s.includes("..") || s.includes("\\") || s.includes("\0")) {
    throw new Error("Invalid file path: " + s);
  }
  return s;
}

export function sessionId() {
  return new Date().toISOString().replace(/:/g, "-");
}

// List all sessions in .audit/ directory
export function listSessions(reportsDir) {
  if (!fs.existsSync(reportsDir)) return [];
  const entries = fs.readdirSync(reportsDir).filter(e => {
    const full = path.join(reportsDir, e);
    if (!fs.statSync(full).isDirectory()) return false;
    return fs.existsSync(path.join(full, "index.yaml"));
  });
  return entries.map(id => {
    const index = readYaml(path.join(reportsDir, id, "index.yaml"));
    const allTasks = [...(index.codeTasks || []), ...(index.storyTasks || []), ...(index.projectTasks || [])];
    const reviewed = allTasks.filter(t => t.status === "reviewed").length;
    return {
      id: index.session.id,
      type: index.session.type,
      status: index.session.status || "created",
      created: index.session.created,
      progress: {
        total: allTasks.length,
        reviewed,
        percentage: allTasks.length ? Math.round((reviewed / allTasks.length) * 100) : 0,
      },
    };
  }).sort((a, b) => b.id.localeCompare(a.id));
}

// Get single session detail
export function getSession(reportsDir, sid) {
  const safeSid = sanitizePath(sid);
  const sessionDir = path.join(reportsDir, safeSid);
  const indexPath = path.join(sessionDir, "index.yaml");
  if (!fs.existsSync(indexPath)) return null;
  const index = readYaml(indexPath);
  const allTasks = [...(index.codeTasks || []), ...(index.storyTasks || []), ...(index.projectTasks || [])];
  const counts = { reviewed: 0, reviewing: 0, pending: 0 };
  for (const t of allTasks) {
    counts[t.status] = (counts[t.status] || 0) + 1;
  }
  return {
    ...index.session,
    status: index.session.status || "created",
    codeTasks: index.codeTasks || [],
    storyTasks: index.storyTasks || [],
    projectTasks: index.projectTasks || [],
    progress: {
      total: allTasks.length,
      ...counts,
      percentage: allTasks.length ? Math.round((counts.reviewed / allTasks.length) * 100) : 0,
    },
  };
}

// Update session status with type-aware state machine validation
export function updateSessionStatus(reportsDir, sid, newStatus) {
  if (!VALID_STATUSES.includes(newStatus)) {
    throw new Error("Invalid status: " + newStatus);
  }
  const safeSid = sanitizePath(sid);
  const indexPath = path.join(reportsDir, safeSid, "index.yaml");
  if (!fs.existsSync(indexPath)) throw new Error("Session not found: " + safeSid);
  const index = readYaml(indexPath);
  const current = index.session.status || "created";
  const type = index.session.type || "code";

  const transitions = TRANSITIONS[type] || TRANSITIONS.code;
  const allowed = transitions[current] || [];
  if (!allowed.includes(newStatus)) {
    throw new Error(`Cannot transition from "${current}" to "${newStatus}" (type: ${type}). Allowed: ${allowed.join(", ") || "none"}`);
  }

  index.session.status = newStatus;
  writeIndexYaml(indexPath, index);
  return index.session;
}

// Update mutable session fields (projectDir, etc.)
const MUTABLE_FIELDS = ["projectDir"];
export function updateSession(reportsDir, sid, updates) {
  const safeSid = sanitizePath(sid);
  const indexPath = path.join(reportsDir, safeSid, "index.yaml");
  if (!fs.existsSync(indexPath)) throw new Error("Session not found: " + safeSid);
  const index = readYaml(indexPath);
  for (const key of MUTABLE_FIELDS) {
    if (key in updates) {
      index.session[key] = updates[key];
    }
  }
  writeIndexYaml(indexPath, index);
  return index.session;
}

// Initialize a new session directory
export function initSession(reportsDir, sid) {
  const safeSid = sanitizePath(sid);
  const base = path.join(reportsDir, safeSid);
  fs.mkdirSync(path.join(base, "code-tasks"), { recursive: true });
  fs.mkdirSync(path.join(base, "story-tasks"), { recursive: true });
  fs.mkdirSync(path.join(base, "project-tasks"), { recursive: true });
  fs.writeFileSync(
    path.join(base, "review-context.md"),
    "## User Context\n\n\n## Review Notes\n<!-- AI agents append shared observations here -->\n",
    "utf-8",
  );
  return base;
}

// Create a new session with initial index.yaml
export function createSession(reportsDir, sid, options = {}) {
  const safeSid = sanitizePath(sid);
  const base = initSession(reportsDir, safeSid);
  const indexPath = path.join(base, "index.yaml");
  writeIndexYaml(indexPath, {
    session: {
      id: safeSid,
      type: options.type || "code",
      status: "created",
      scope: options.type === "project" ? null : { method: "", ref: "" },
      projectDir: options.projectDir || null,
      created: new Date().toISOString(),
    },
    codeTasks: [],
    storyTasks: [],
    projectTasks: [],
  });
  return { id: safeSid, dir: base };
}

// Reset reviewing tasks to pending (for resume)
export function resetReviewing(reportsDir, sid) {
  const safeSid = sanitizePath(sid);
  const sessionDir = path.join(reportsDir, safeSid);
  const indexPath = path.join(sessionDir, "index.yaml");
  if (!fs.existsSync(indexPath)) throw new Error("Session not found: " + safeSid);

  const index = readYaml(indexPath);
  let resetCount = 0;

  for (const taskGroup of ["codeTasks", "storyTasks", "projectTasks"]) {
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
  return resetCount;
}
