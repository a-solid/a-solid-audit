// skills/audit/scripts/server/handlers/rounds.mjs
import fs from "node:fs";
import path from "node:path";
import { sanitizePath } from "../../lib/session.mjs";
import { readYaml, writeYaml } from "../../lib/yaml.mjs";
import { jsonResponse, errorResponse, readBody } from "../index.mjs";
import { resolveReportsDir } from "../../lib/paths.mjs";

const VALID_STATUSES = ["pending", "need-fix", "wont-fix", "not-an-issue", "well-done"];

function findRoundDir(projectDir, rid) {
  const reportsDir = resolveReportsDir(projectDir);
  const safeRid = sanitizePath(rid);
  const roundDir = path.join(reportsDir, safeRid);
  if (!fs.existsSync(path.join(roundDir, "round.yaml"))) return null;
  return roundDir;
}

function readRoundNotes(roundDir) {
  const p = path.join(roundDir, "review-notes.yaml");
  if (!fs.existsSync(p)) return { tasks: [], summary: { notes: "", signoff: { name: "", role: "", date: "" } } };
  return readYaml(p);
}

function writeRoundNotes(roundDir, data) {
  writeYaml(path.join(roundDir, "review-notes.yaml"), data);
}

export function registerRoundRoutes(router, projectDir) {
  // POST /api/rounds — create round
  router.post("/api/rounds", async (req, res) => {
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      return errorResponse(res, "Invalid JSON", "PARSE_ERROR", 400);
    }

    const name = body?.name;
    if (!name || typeof name !== "string") {
      return errorResponse(res, "Missing required field: name", "VALIDATION_ERROR", 400);
    }

    const reportsDir = resolveReportsDir(projectDir);
    const rid = new Date().toISOString().replace(/:/g, "-");
    const roundDir = path.join(reportsDir, rid);
    fs.mkdirSync(roundDir, { recursive: true });

    writeYaml(path.join(roundDir, "round.yaml"), {
      name,
      description: body.description || "",
      created: new Date().toISOString(),
    });

    writeRoundNotes(roundDir, { tasks: [], summary: { notes: "", signoff: { name: "", role: "", date: "" } } });

    jsonResponse(res, { id: rid, name }, 201);
  });

  // GET /api/rounds — list rounds
  router.get("/api/rounds", (req, res) => {
    const reportsDir = resolveReportsDir(projectDir);
    if (!fs.existsSync(reportsDir)) return jsonResponse(res, []);

    const rounds = [];
    for (const entry of fs.readdirSync(reportsDir)) {
      const roundDir = path.join(reportsDir, entry);
      if (!fs.statSync(roundDir).isDirectory()) continue;
      const roundYaml = path.join(roundDir, "round.yaml");
      if (!fs.existsSync(roundYaml)) continue;
      const data = readYaml(roundYaml);

      const sessions = [];
      for (const sub of fs.readdirSync(roundDir)) {
        const subDir = path.join(roundDir, sub);
        if (!fs.statSync(subDir).isDirectory()) continue;
        if (fs.existsSync(path.join(subDir, "index.yaml"))) {
          const index = readYaml(path.join(subDir, "index.yaml"));
          sessions.push({
            id: index.session.id,
            type: index.session.type,
            status: index.session.status || "created",
            created: index.session.created,
          });
        }
      }
      sessions.sort((a, b) => b.created.localeCompare(a.created));

      rounds.push({ id: entry, name: data.name, description: data.description || "", created: data.created, sessions });
    }
    rounds.sort((a, b) => b.created.localeCompare(a.created));
    jsonResponse(res, rounds);
  });

  // GET /api/rounds/:roundId — round detail
  router.get("/api/rounds/:roundId", (req, res, params) => {
    const roundDir = findRoundDir(projectDir, params.roundId);
    if (!roundDir) return errorResponse(res, "Round not found", "NOT_FOUND", 404);

    const data = readYaml(path.join(roundDir, "round.yaml"));
    const notes = readRoundNotes(roundDir);

    const sessions = [];
    for (const entry of fs.readdirSync(roundDir)) {
      const subDir = path.join(roundDir, entry);
      if (!fs.statSync(subDir).isDirectory()) continue;
      if (fs.existsSync(path.join(subDir, "index.yaml"))) {
        const index = readYaml(path.join(subDir, "index.yaml"));
        const taskRefs = [...(index.codeTasks || []), ...(index.storyTasks || []), ...(index.projectTasks || [])];
        const reviewed = taskRefs.filter(t => t.status === "reviewed").length;
        sessions.push({
          id: index.session.id,
          type: index.session.type,
          status: index.session.status || "created",
          created: index.session.created,
          progress: { total: taskRefs.length, reviewed, percentage: taskRefs.length ? Math.round((reviewed / taskRefs.length) * 100) : 0 },
        });
      }
    }
    sessions.sort((a, b) => b.created.localeCompare(a.created));

    jsonResponse(res, { id: params.roundId, name: data.name, description: data.description || "", created: data.created, sessions, notes });
  });

  // GET /api/rounds/:roundId/notes
  router.get("/api/rounds/:roundId/notes", (req, res, params) => {
    const roundDir = findRoundDir(projectDir, params.roundId);
    if (!roundDir) return errorResponse(res, "Round not found", "NOT_FOUND", 404);
    jsonResponse(res, readRoundNotes(roundDir));
  });

  // POST /api/rounds/:roundId/notes — update findings
  router.post("/api/rounds/:roundId/notes", async (req, res, params) => {
    const roundDir = findRoundDir(projectDir, params.roundId);
    if (!roundDir) return errorResponse(res, "Round not found", "NOT_FOUND", 404);

    const body = JSON.parse(await readBody(req));
    if (!body || typeof body.file !== "string" || !body.file) {
      return errorResponse(res, "Missing required field: file", "VALIDATION_ERROR", 400);
    }
    if (body.findings !== undefined && !Array.isArray(body.findings)) {
      return errorResponse(res, "findings must be an array", "VALIDATION_ERROR", 400);
    }
    if (body.findings) {
      for (let i = 0; i < body.findings.length; i++) {
        const s = body.findings[i]?.status;
        if (s && !VALID_STATUSES.includes(s)) {
          return errorResponse(res, "Invalid status at findings[" + i + "]: " + s, "VALIDATION_ERROR", 400);
        }
      }
    }

    const safeFile = body.file;
    const notes = readRoundNotes(roundDir);
    let entry = notes.tasks.find(t => t.file === safeFile);
    if (!entry) {
      entry = { file: safeFile, findings: [] };
      notes.tasks.push(entry);
    }

    if (body.findings !== undefined) entry.findings = body.findings;

    writeRoundNotes(roundDir, notes);
    jsonResponse(res, { ok: true });
  });

  // POST /api/rounds/:roundId/summary — update summary + sign-off
  router.post("/api/rounds/:roundId/summary", async (req, res, params) => {
    const roundDir = findRoundDir(projectDir, params.roundId);
    if (!roundDir) return errorResponse(res, "Round not found", "NOT_FOUND", 404);

    const body = JSON.parse(await readBody(req));
    if (!body) return errorResponse(res, "Empty request body", "VALIDATION_ERROR", 400);

    const notes = readRoundNotes(roundDir);
    if (!notes.summary) notes.summary = { notes: "", signoff: { name: "", role: "", date: "" } };
    if (body.notes !== undefined) notes.summary.notes = body.notes;
    if (body.signoff !== undefined) {
      if (body.signoff === null) {
        notes.summary.signoff = { name: "", role: "", date: "" };
      } else {
        Object.assign(notes.summary.signoff, body.signoff);
      }
    }

    writeRoundNotes(roundDir, notes);
    jsonResponse(res, { ok: true });
  });
}
