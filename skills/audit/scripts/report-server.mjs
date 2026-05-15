import fs from "node:fs";
import http from "node:http";
import path from "node:path";

import { getReportsDir, sanitizePath } from "./cli.mjs";
import { taskFileName } from "./git.mjs";
import { readYaml, writeYaml } from "./yaml.mjs";

const NOTES_FILE = "review-notes.yaml";

function readNotes(sessionDir) {
  const p = path.join(sessionDir, NOTES_FILE);
  if (!fs.existsSync(p)) return { tasks: [], summary: { notes: "", signoff: { name: "", role: "", date: "" } } };
  return migrateNotes(readYaml(p));
}

function writeNotes(sessionDir, data) {
  writeYaml(path.join(sessionDir, NOTES_FILE), data);
}

const OLD_TASK_STATUS_MAP = { accept: "confirmed", reviewed: "confirmed", "needs-work": "action-required", skip: "deferred" };

function migrateNoteEntry(entry) {
  if (!entry) return entry;
  if (OLD_TASK_STATUS_MAP[entry.status]) entry.status = OLD_TASK_STATUS_MAP[entry.status];
  if (Array.isArray(entry.findings)) {
    entry.findings = entry.findings.map(f => {
      if (typeof f === "string") return { status: f, reason: "" };
      return f;
    });
  }
  return entry;
}

function migrateNotes(notes) {
  if (!notes || !notes.tasks) return notes;
  notes.tasks = notes.tasks.map(migrateNoteEntry);
  return notes;
}

function jsonResponse(res, data, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
  });
}

function handleGetSession(req, res, sessionDir) {
  const index = readYaml(path.join(sessionDir, "index.yaml"));
  const allTasks = [...(index.codeTasks || []), ...(index.storyTasks || [])];
  const counts = { reviewed: 0, reviewing: 0, pending: 0 };
  for (const t of allTasks) {
    counts[t.status] = (counts[t.status] || 0) + 1;
  }
  jsonResponse(res, {
    ...index.session,
    progress: {
      total: allTasks.length,
      ...counts,
      percentage: allTasks.length ? Math.round((counts.reviewed / allTasks.length) * 100) : 0,
    },
  });
}

function handleGetTasks(req, res, sessionDir) {
  const index = readYaml(path.join(sessionDir, "index.yaml"));
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

  jsonResponse(res, result);
}

function handleGetTask(req, res, sessionDir, taskName) {
  const index = readYaml(path.join(sessionDir, "index.yaml"));
  const allRefs = [...(index.codeTasks || []), ...(index.storyTasks || [])];
  const ref = allRefs.find((t) => t.file === taskName || t.file.endsWith(taskName));
  if (!ref) { jsonResponse(res, { error: "Task not found" }, 404); return; }

  const taskPath = path.join(sessionDir, ref.file);
  if (!fs.existsSync(taskPath)) { jsonResponse(res, { error: "Task file missing" }, 404); return; }

  const task = readYaml(taskPath);
  const type = (index.codeTasks || []).some((t) => t.file === ref.file) ? "code" : "story";
  jsonResponse(res, { type, file: ref.file, ...task });
}

async function handlePostNotes(req, res, sessionDir) {
  const body = JSON.parse(await readBody(req));
  if (!body || typeof body.file !== 'string' || !body.file) {
    return jsonResponse(res, { error: "Missing required field: file" }, 400);
  }
  if (body.status !== undefined && !['confirmed', 'action-required', 'deferred', ''].includes(body.status)) {
    return jsonResponse(res, { error: "Invalid status value" }, 400);
  }
  if (body.findings !== undefined && !Array.isArray(body.findings)) {
    return jsonResponse(res, { error: "findings must be an array" }, 400);
  }
  const index = readYaml(path.join(sessionDir, "index.yaml"));
  const allRefs = [...(index.codeTasks || []), ...(index.storyTasks || [])];
  const ref = allRefs.find(t => t.file === body.file);
  if (!ref || ref.status !== "reviewed") {
    jsonResponse(res, { error: "Task AI review not yet completed" }, 409);
    return;
  }

  const notes = readNotes(sessionDir);
  let entry = notes.tasks.find(t => t.file === body.file);
  if (!entry) {
    const taskPath = path.join(sessionDir, body.file);
    const task = fs.existsSync(taskPath) ? readYaml(taskPath) : null;
    const findingCount = (task?.review?.findings || []).length;
    const findings = Array.from({ length: findingCount }, () => ({ status: "confirmed", reason: "" }));
    entry = { file: body.file, status: "", notes: "", findings };
    notes.tasks.push(entry);
  }

  if (body.status) entry.status = body.status;
  if (body.notes !== undefined) entry.notes = body.notes;
  if (body.findings !== undefined) entry.findings = body.findings;

  writeNotes(sessionDir, notes);
  jsonResponse(res, { ok: true });
}

async function handlePostSummary(req, res, sessionDir) {
  const body = JSON.parse(await readBody(req));
  if (!body) {
    return jsonResponse(res, { error: "Empty request body" }, 400);
  }
  const notes = readNotes(sessionDir);

  if (!notes.summary) notes.summary = { notes: "", signoff: { name: "", role: "", date: "" } };
  if (body.notes !== undefined) notes.summary.notes = body.notes;
  if (body.signoff) Object.assign(notes.summary.signoff, body.signoff);

  writeNotes(sessionDir, notes);
  jsonResponse(res, { ok: true });
}

async function handleBatchConfirm(req, res, sessionDir) {
  const body = JSON.parse(await readBody(req));
  if (!body || typeof body.file !== 'string' || !body.file) {
    return jsonResponse(res, { error: "Missing required field: file" }, 400);
  }
  const index = readYaml(path.join(sessionDir, "index.yaml"));
  const allRefs = [...(index.codeTasks || []), ...(index.storyTasks || [])];
  const ref = allRefs.find(t => t.file === body.file);
  if (!ref || ref.status !== "reviewed") {
    jsonResponse(res, { error: "Task AI review not yet completed" }, 409);
    return;
  }

  const notes = readNotes(sessionDir);
  let entry = notes.tasks.find(t => t.file === body.file);
  if (!entry) {
    jsonResponse(res, { error: "No note entry found" }, 404);
    return;
  }

  let count = 0;
  entry.findings = (entry.findings || []).map(f => {
    const status = typeof f === "string" ? f : (f.status || "");
    if (!status) { count++; return { status: "confirmed", reason: "" }; }
    return typeof f === "string" ? { status: f, reason: "" } : f;
  });

  writeNotes(sessionDir, notes);
  jsonResponse(res, { ok: true, confirmed: count });
}

function serveTemplate(req, res) {
  const templatePath = path.join(import.meta.dirname, "report-template.html");
  if (!fs.existsSync(templatePath)) {
    res.writeHead(500);
    res.end("report-template.html not found");
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html" });
  fs.createReadStream(templatePath).pipe(res);
}

export function startReportServer(sessionId, port = 3456) {
  const safeSid = sanitizePath(sessionId);
  const sessionDir = path.join(getReportsDir(), safeSid);
  if (!fs.existsSync(sessionDir) || !fs.existsSync(path.join(sessionDir, "index.yaml"))) {
    throw new Error("Session not found: " + sessionDir);
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);

    if (req.method === "GET" && url.pathname === "/") return serveTemplate(req, res);
    if (req.method === "GET" && url.pathname === "/api/notes") {
      return jsonResponse(res, readNotes(sessionDir));
    }
    if (req.method === "GET" && url.pathname === "/api/session") return handleGetSession(req, res, sessionDir);
    if (req.method === "GET" && url.pathname === "/api/tasks") return handleGetTasks(req, res, sessionDir);
    if (req.method === "GET" && url.pathname.startsWith("/api/tasks/")) {
      return handleGetTask(req, res, sessionDir, decodeURIComponent(url.pathname.slice("/api/tasks/".length)));
    }
    if (req.method === "POST" && url.pathname === "/api/notes") return handlePostNotes(req, res, sessionDir);
    if (req.method === "POST" && url.pathname === "/api/notes/batch-confirm") return handleBatchConfirm(req, res, sessionDir);
    if (req.method === "POST" && url.pathname === "/api/summary") return handlePostSummary(req, res, sessionDir);

    res.writeHead(404);
    res.end("Not found");
  });

  server.listen(port, () => {
    console.log("Report server running at http://localhost:" + port);
    console.log("Session: " + safeSid);
    console.log("Press Ctrl+C to stop");
  });
}
