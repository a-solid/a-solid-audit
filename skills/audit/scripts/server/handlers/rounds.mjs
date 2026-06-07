// skills/audit/scripts/server/handlers/rounds.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sanitizePath, createSession, resolveSessionPath, listSessions } from "../../lib/session.mjs";
import { readYaml, writeYaml, writeIndexYaml, writeCodeTaskYaml } from "../../lib/yaml.mjs";
import { runGitDiff, parseDiffByFile, detectLanguage, taskFileName } from "../../lib/git.mjs";
import { jsonResponse, errorResponse, readBody } from "../index.mjs";
import { resolveReportsDir, resolveProjectDir, loadAuditSettings } from "../../lib/paths.mjs";

function findRoundDir(projectDir, roundName) {
  const reportsDir = resolveReportsDir(projectDir);
  const safeRound = sanitizePath(roundName);
  const roundDir = path.join(reportsDir, safeRound);
  if (!fs.existsSync(path.join(roundDir, "round.yaml"))) return null;
  return roundDir;
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
    const safeRound = sanitizePath(name);
    const roundDir = path.join(reportsDir, safeRound);

    if (fs.existsSync(roundDir)) {
      return errorResponse(res, "Round already exists: " + safeRound, "CONFLICT", 409);
    }

    fs.mkdirSync(roundDir, { recursive: true });

    writeYaml(path.join(roundDir, "round.yaml"), {
      name,
      description: body.description || "",
      created: new Date().toISOString(),
    });

    jsonResponse(res, { name }, 201);
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

      const sessions = listSessions(reportsDir, entry);
      rounds.push({
        name: data.name,
        description: data.description || "",
        created: data.created,
        sessions,
      });
    }
    rounds.sort((a, b) => b.created.localeCompare(a.created));
    jsonResponse(res, rounds);
  });

  // GET /api/rounds/:roundName — round detail
  router.get("/api/rounds/:roundName", (req, res, params) => {
    const roundDir = findRoundDir(projectDir, params.roundName);
    if (!roundDir) return errorResponse(res, "Round not found", "NOT_FOUND", 404);

    const data = readYaml(path.join(roundDir, "round.yaml"));
    const reportsDir = resolveReportsDir(projectDir);
    const sessions = listSessions(reportsDir, params.roundName);

    jsonResponse(res, {
      name: data.name,
      description: data.description || "",
      created: data.created,
      sessions,
    });
  });

  // POST /api/rounds/:roundName/sessions — create session within round
  router.post("/api/rounds/:roundName/sessions", async (req, res, params) => {
    const roundDir = findRoundDir(projectDir, params.roundName);
    if (!roundDir) return errorResponse(res, "Round not found", "NOT_FOUND", 404);

    let body = {};
    try { body = JSON.parse(await readBody(req)); } catch {}

    const reportsDir = resolveReportsDir(projectDir);
    const sessions = listSessions(reportsDir, params.roundName);
    const maxVersion = sessions.reduce((max, s) => Math.max(max, s.version || 0), 0);
    const nextVersion = maxVersion + 1;
    const versionStr = "v" + nextVersion;

    createSession(reportsDir, params.roundName, versionStr, {
      type: body.type || "code",
      projectDir: resolveProjectDir(),
    });

    jsonResponse(res, { version: nextVersion, roundName: params.roundName }, 201);
  });

  // POST /api/rounds/:roundName/re-review — create new versioned session with need-fix files
  router.post("/api/rounds/:roundName/re-review", async (req, res, params) => {
    const roundDir = findRoundDir(projectDir, params.roundName);
    if (!roundDir) return errorResponse(res, "Round not found", "NOT_FOUND", 404);

    let body = {};
    try { body = JSON.parse(await readBody(req)); } catch {}

    const reportsDir = resolveReportsDir(projectDir);
    const sessions = listSessions(reportsDir, params.roundName);
    if (sessions.length === 0) {
      return errorResponse(res, "No sessions in this round", "NOT_FOUND", 404);
    }

    // Find latest session
    const latest = sessions.reduce((a, b) => (a.version || 0) > (b.version || 0) ? a : b);
    const latestIndexPath = resolveSessionPath(reportsDir, params.roundName, latest.id);
    if (!latestIndexPath) return errorResponse(res, "Latest session not found", "NOT_FOUND", 404);
    const latestDir = path.dirname(latestIndexPath);

    // Read latest session's review-notes to find need-fix files
    const notesPath = path.join(latestDir, "review-notes.yaml");
    const needFixFiles = new Set();
    if (fs.existsSync(notesPath)) {
      const notes = readYaml(notesPath);
      for (const task of notes.tasks || []) {
        const hasNeedFix = (task.findings || []).some(f => f.status === "need-fix");
        if (hasNeedFix) {
          for (const f of task.findings || []) {
            if (f.file) needFixFiles.add(f.file);
          }
        }
      }
    }

    // Merge with user-specified files
    if (Array.isArray(body.files)) {
      for (const f of body.files) needFixFiles.add(f);
    }

    if (needFixFiles.size === 0) {
      return errorResponse(res, "No files to re-review", "VALIDATION_ERROR", 400);
    }

    // Create new session
    const maxVersion = sessions.reduce((max, s) => Math.max(max, s.version || 0), 0);
    const nextVersion = maxVersion + 1;
    const versionStr = "v" + nextVersion;
    const result = createSession(reportsDir, params.roundName, versionStr, {
      type: "code",
      projectDir: resolveProjectDir(),
    });

    // Generate task YAMLs from uncommitted diff for the need-fix files
    const diff = runGitDiff("uncommitted", "", projectDir);
    const filesMap = parseDiffByFile(diff);
    const tasksDir = path.join(result.dir, "code-tasks");
    fs.mkdirSync(tasksDir, { recursive: true });
    const tasks = [];

    for (const filePath of needFixFiles) {
      const fileData = filesMap[filePath];
      if (!fileData) continue;
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
      tasks.push({ file: "code-tasks/" + tf, name: filePath, status: "pending" });
    }

    // Update index.yaml with tasks
    const indexPath = path.join(result.dir, "index.yaml");
    const index = readYaml(indexPath);
    writeIndexYaml(indexPath, {
      session: { ...index.session, status: "ready" },
      codeTasks: tasks,
      storyTasks: [],
      projectTasks: [],
    });

    jsonResponse(res, {
      ok: true,
      version: nextVersion,
      roundName: params.roundName,
      taskCount: tasks.length,
      files: tasks.map(t => t.name),
    });
  });

  // GET /api/rounds/:roundName/summary — round-level summary
  router.get("/api/rounds/:roundName/summary", (req, res, params) => {
    const roundDir = findRoundDir(projectDir, params.roundName);
    if (!roundDir) return errorResponse(res, "Round not found", "NOT_FOUND", 404);

    const reportsDir = resolveReportsDir(projectDir);
    const sessions = listSessions(reportsDir, params.roundName);
    if (sessions.length === 0) {
      return jsonResponse(res, { files: [], stats: { totalFiles: 0, totalFindings: 0, needFix: 0, wontFix: 0, notAnIssue: 0, wellDone: 0, pending: 0 } });
    }

    // For each file, find latest session that has it
    const fileMap = new Map();

    // Process sessions from oldest to newest so later versions overwrite
    const sorted = [...sessions].sort((a, b) => (a.version || 0) - (b.version || 0));

    for (const session of sorted) {
      const indexPath = resolveSessionPath(reportsDir, params.roundName, session.id);
      if (!indexPath) continue;
      const sessionDir = path.dirname(indexPath);
      const index = readYaml(indexPath);

      // Read tasks
      const allTaskRefs = [...(index.codeTasks || []), ...(index.storyTasks || []), ...(index.projectTasks || [])];
      for (const ref of allTaskRefs) {
        const taskPath = path.join(sessionDir, ref.file);
        if (!fs.existsSync(taskPath)) continue;
        const task = readYaml(taskPath);

        fileMap.set(ref.name || ref.file, {
          name: ref.name || ref.file,
          latestVersion: session.version || 1,
          sessionId: session.id,
          review: task.review || { score: 0, summary: "", findings: [] },
        });
      }

      // Read review-notes for this session
      const notesPath = path.join(sessionDir, "review-notes.yaml");
      if (fs.existsSync(notesPath)) {
        const notes = readYaml(notesPath);
        for (const noteTask of notes.tasks || []) {
          const matchingRef = allTaskRefs.find(r => r.file === noteTask.file);
          if (matchingRef) {
            const name = matchingRef.name || matchingRef.file;
            const existing = fileMap.get(name);
            if (existing && existing.sessionId === session.id) {
              existing.findings = noteTask.findings || [];
            }
          }
        }
      }
    }

    const files = [...fileMap.values()];
    const stats = { totalFiles: files.length, totalFindings: 0, needFix: 0, wontFix: 0, notAnIssue: 0, wellDone: 0, pending: 0 };

    for (const f of files) {
      for (const finding of f.findings || []) {
        stats.totalFindings++;
        const s = finding.status || "pending";
        if (s === "need-fix") stats.needFix++;
        else if (s === "wont-fix") stats.wontFix++;
        else if (s === "not-an-issue") stats.notAnIssue++;
        else if (s === "well-done") stats.wellDone++;
        else stats.pending++;
      }
    }

    jsonResponse(res, { files, stats });
  });

  // GET /api/projects — list all projects
  router.get("/api/projects", (req, res) => {
    const settings = loadAuditSettings();
    const rawRoot = settings.rootDir || path.join(os.tmpdir(), "a-solid-audit");
    const rootDir = rawRoot.startsWith("~")
      ? path.join(os.homedir(), rawRoot.slice(1))
      : path.resolve(rawRoot);
    const currentProject = path.basename(projectDir);

    if (!fs.existsSync(rootDir)) return jsonResponse(res, { currentProject, projects: [] });

    const projects = [];
    for (const entry of fs.readdirSync(rootDir)) {
      const projDir = path.join(rootDir, entry);
      if (!fs.statSync(projDir).isDirectory()) continue;

      let roundCount = 0;
      let latestActivity = null;
      for (const sub of fs.readdirSync(projDir)) {
        const roundDir = path.join(projDir, sub);
        if (!fs.statSync(roundDir).isDirectory()) continue;
        if (!fs.existsSync(path.join(roundDir, "round.yaml"))) continue;
        roundCount++;
        const data = readYaml(path.join(roundDir, "round.yaml"));
        if (data.created && (!latestActivity || data.created > latestActivity)) {
          latestActivity = data.created;
        }
      }

      projects.push({
        name: entry,
        isCurrent: entry === currentProject,
        roundCount,
        latestActivity,
      });
    }

    jsonResponse(res, { currentProject, projects });
  });

  // GET /api/projects/:projectName/rounds — read-only round listing for any project
  router.get("/api/projects/:projectName/rounds", (req, res, params) => {
    const settings = loadAuditSettings();
    const rawRoot = settings.rootDir || path.join(os.tmpdir(), "a-solid-audit");
    const rootDir = rawRoot.startsWith("~")
      ? path.join(os.homedir(), rawRoot.slice(1))
      : path.resolve(rawRoot);
    const safeName = sanitizePath(params.projectName);
    const projReportsDir = path.join(rootDir, safeName);

    if (!fs.existsSync(projReportsDir)) return jsonResponse(res, []);

    const rounds = [];
    for (const entry of fs.readdirSync(projReportsDir)) {
      const roundDir = path.join(projReportsDir, entry);
      if (!fs.statSync(roundDir).isDirectory()) continue;
      const roundYaml = path.join(roundDir, "round.yaml");
      if (!fs.existsSync(roundYaml)) continue;
      const data = readYaml(roundYaml);
      const sessions = listSessions(projReportsDir, entry);
      rounds.push({
        name: data.name,
        description: data.description || "",
        created: data.created,
        sessions,
      });
    }
    rounds.sort((a, b) => b.created.localeCompare(a.created));
    jsonResponse(res, rounds);
  });

  // GET /api/projects/:projectName/rounds/:roundName/summary — read-only findings summary
  router.get("/api/projects/:projectName/rounds/:roundName/summary", (req, res, params) => {
    const settings = loadAuditSettings();
    const rawRoot = settings.rootDir || path.join(os.tmpdir(), "a-solid-audit");
    const rootDir = rawRoot.startsWith("~")
      ? path.join(os.homedir(), rawRoot.slice(1))
      : path.resolve(rawRoot);
    const safeProject = sanitizePath(params.projectName);
    const safeRound = sanitizePath(params.roundName);
    const projReportsDir = path.join(rootDir, safeProject);
    const roundDir = path.join(projReportsDir, safeRound);

    if (!fs.existsSync(roundDir) || !fs.existsSync(path.join(roundDir, "round.yaml"))) {
      return errorResponse(res, "Round not found", "NOT_FOUND", 404);
    }

    const sessions = listSessions(projReportsDir, safeRound);
    if (sessions.length === 0) {
      return jsonResponse(res, { files: [], stats: { totalFiles: 0, totalFindings: 0, needFix: 0, wontFix: 0, notAnIssue: 0, wellDone: 0, pending: 0 } });
    }

    const fileMap = new Map();
    const sorted = [...sessions].sort((a, b) => (a.version || 0) - (b.version || 0));

    for (const session of sorted) {
      const indexPath = resolveSessionPath(projReportsDir, safeRound, session.id);
      if (!indexPath) continue;
      const sessionDir = path.dirname(indexPath);
      const index = readYaml(indexPath);

      const allTaskRefs = [...(index.codeTasks || []), ...(index.storyTasks || []), ...(index.projectTasks || [])];
      for (const ref of allTaskRefs) {
        const taskPath = path.join(sessionDir, ref.file);
        if (!fs.existsSync(taskPath)) continue;
        const task = readYaml(taskPath);
        fileMap.set(ref.name || ref.file, {
          name: ref.name || ref.file,
          latestVersion: session.version || 1,
          sessionId: session.id,
          review: task.review || { score: 0, summary: "", findings: [] },
        });
      }

      const notesPath = path.join(sessionDir, "review-notes.yaml");
      if (fs.existsSync(notesPath)) {
        const notes = readYaml(notesPath);
        for (const noteTask of notes.tasks || []) {
          const matchingRef = allTaskRefs.find(r => r.file === noteTask.file);
          if (matchingRef) {
            const name = matchingRef.name || matchingRef.file;
            const existing = fileMap.get(name);
            if (existing && existing.sessionId === session.id) {
              existing.findings = noteTask.findings || [];
            }
          }
        }
      }
    }

    const files = [...fileMap.values()];
    const stats = { totalFiles: files.length, totalFindings: 0, needFix: 0, wontFix: 0, notAnIssue: 0, wellDone: 0, pending: 0 };
    for (const f of files) {
      for (const finding of f.findings || []) {
        stats.totalFindings++;
        const s = finding.status || "pending";
        if (s === "need-fix") stats.needFix++;
        else if (s === "wont-fix") stats.wontFix++;
        else if (s === "not-an-issue") stats.notAnIssue++;
        else if (s === "well-done") stats.wellDone++;
        else stats.pending++;
      }
    }

    jsonResponse(res, { files, stats });
  });
}
