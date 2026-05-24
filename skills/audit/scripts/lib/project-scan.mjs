// skills/audit/scripts/lib/project-scan.mjs
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { sanitizePath } from "./session.mjs";
import { readYaml, writeYaml, writeIndexYaml, writeProjectTaskYaml } from "./yaml.mjs";

const EXCLUDED_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "vendor", "__pycache__",
  ".next", "coverage", ".venv", "venv", ".idea", ".vscode",
  "target", "bin", "obj", ".gradle", ".mvn", "logs",
]);

const CODE_EXTENSIONS = new Set([
  "mjs", "js", "ts", "cjs", "jsx", "tsx",
  "py", "rb", "go", "java", "kt", "scala", "cs",
  "php", "sh", "bash", "zsh", "sql", "plsql",
  "json", "yaml", "yml", "toml",
]);

const HIGH_PRIORITY_KEYWORDS = [
  "server", "handler", "controller", "service", "api", "route",
  "middleware", "model", "repository", "dao", "migration", "db",
  "script", "scripts", "cron", "job", "worker", "consumer",
  "trigger", "procedure",
];

const MED_PRIORITY_KEYWORDS = [
  "lib", "utils", "helpers", "common", "shared", "core", "config",
];

const MAX_FILES_PER_CHUNK = 15;

function classifyPriority(filePath) {
  const normalized = filePath.toLowerCase().replace(/\\/g, "/");
  for (const kw of HIGH_PRIORITY_KEYWORDS) {
    if (normalized.includes("/" + kw) || normalized.includes(kw + "/") || normalized.includes(kw + ".")) {
      return "high";
    }
  }
  if (normalized.endsWith(".sql") || normalized.endsWith(".sh")) return "high";
  for (const kw of MED_PRIORITY_KEYWORDS) {
    if (normalized.includes("/" + kw) || normalized.includes(kw + "/")) {
      return "medium";
    }
  }
  return "low";
}

const ENTRY_PATTERNS = [
  { type: "api", keywords: ["handler", "controller", "route", "api", "endpoint"] },
  { type: "scheduled", keywords: ["cron", "job", "scheduler"] },
  { type: "consumer", keywords: ["consumer", "subscriber", "worker", "queue", "listener"] },
  { type: "script", keywords: ["script", "bin", "cli", "migration"] },
];

function classifyEntryType(filePath) {
  const normalized = filePath.toLowerCase().replace(/\\/g, "/");
  const name = path.basename(normalized);
  for (const { type, keywords } of ENTRY_PATTERNS) {
    for (const kw of keywords) {
      if (normalized.includes("/" + kw) || normalized.includes(kw + "/") || name.includes(kw)) {
        return type;
      }
    }
  }
  return "unknown";
}

const IMPORT_RE = /(?:import\s+.*?\s+from\s+['"])(\.{1,2}\/[^'"]+)(?:['"])|(?:require\s*\(\s*['"])(\.{1,2}\/[^'"]+)(?:['"])/g;

// ── Scan log buffer (for SSE streaming) ──
const scanLogs = new Map();

function pushLog(sid, level, message) {
  const entry = { timestamp: new Date().toISOString().slice(11, 19), level, message };
  console.log(`[project-scan] ${entry.timestamp} [${level}] ${message}`);
  if (!scanLogs.has(sid)) scanLogs.set(sid, []);
  scanLogs.get(sid).push(entry);
}

export function getScanLogs(sid) {
  return scanLogs.get(sid) || [];
}

export function clearScanLogs(sid) {
  scanLogs.delete(sid);
}

function resolveImports(filePath, projectDir) {
  const fullPath = path.join(projectDir, filePath);
  if (!fs.existsSync(fullPath)) return [];
  try {
    const src = fs.readFileSync(fullPath, "utf-8");
    const imports = [];
    let m;
    while ((m = IMPORT_RE.exec(src)) !== null) {
      const raw = m[1] || m[2];
      const resolved = path.normalize(path.join(path.dirname(filePath), raw));
      let rel = resolved.replace(/\\/g, "/");
      for (const ext of ["", ".mjs", ".js", ".ts", ".cjs"]) {
        if (fs.existsSync(path.join(projectDir, rel + ext))) {
          imports.push(rel + ext);
          break;
        }
      }
      for (const ext of ["/index.mjs", "/index.js", "/index.ts"]) {
        if (fs.existsSync(path.join(projectDir, rel + ext))) {
          imports.push(rel + ext);
          break;
        }
      }
    }
    return [...new Set(imports)];
  } catch {
    return [];
  }
}

// ── CodeGraph-based import resolver ──
let _codegraphCache = null;
let _codegraphCacheDir = null;

function resolveImportsViaCodegraph(filePath, projectDir, sid) {
  try {
    // One CLI call per scan — cache results per projectDir
    if (_codegraphCacheDir !== projectDir || !_codegraphCache) {
      const cmd = `codegraph query --json -k import -l 1000 "" -p "${projectDir}"`;
      pushLog(sid, "info", `codegraph: ${cmd}`);
      const start = Date.now();
      const raw = execSync(cmd, { encoding: "utf-8", timeout: 30000, stdio: ["pipe", "pipe", "pipe"] });
      const data = JSON.parse(raw);
      pushLog(sid, "info", `codegraph: returned ${data.length} import edges in ${Date.now() - start}ms`);

      // Build map: source file → [resolved target files]
      const fileImports = new Map();
      for (const item of data) {
        const n = item.node;
        const src = n.filePath;
        // Skip worktree/duplicate paths
        if (src.includes("worktree")) continue;
        const impPath = n.qualifiedName || n.name;
        if (!impPath || impPath.startsWith("node:")) continue;

        if (!fileImports.has(src)) fileImports.set(src, []);
        fileImports.get(src).push(impPath);
      }
      _codegraphCache = fileImports;
      _codegraphCacheDir = projectDir;
    }

    // Find imports for our file
    const rawImports = _codegraphCache.get(filePath) || [];
    const resolved = [];
    for (const imp of rawImports) {
      const resolvedPath = path.normalize(path.join(path.dirname(filePath), imp)).replace(/\\/g, "/");
      for (const ext of ["", ".mjs", ".js", ".ts", ".cjs"]) {
        if (fs.existsSync(path.join(projectDir, resolvedPath + ext))) {
          resolved.push(resolvedPath + ext);
          break;
        }
      }
      for (const ext of ["/index.mjs", "/index.js", "/index.ts"]) {
        if (fs.existsSync(path.join(projectDir, resolvedPath + ext))) {
          resolved.push(resolvedPath + ext);
          break;
        }
      }
    }
    return [...new Set(resolved)];
  } catch (e) {
    pushLog(sid, "warn", `codegraph: fallback to regex — ${e.message}`);
    return resolveImports(filePath, projectDir);
  }
}

export function resetCodegraphCache() {
  _codegraphCache = null;
  _codegraphCacheDir = null;
}

export function collectGraphData(projectDir, reportsDir, sid) {
  const safeSid = sanitizePath(sid);
  const sessionDir = path.join(reportsDir, safeSid);
  const startTime = Date.now();
  pushLog(safeSid, "info", `collectGraphData: starting graph collection for ${projectDir}`);

  // 1. Get full file list
  const files = scanProjectDir(projectDir, {}, safeSid);
  pushLog(safeSid, "info", `collectGraphData: scanned ${files.length} files`);

  // 2. Classify entry files
  const entryFiles = [];
  for (const f of files) {
    const type = classifyEntryType(f.path);
    if (type !== "unknown") {
      entryFiles.push({ path: f.path, entryType: type });
    }
  }
  pushLog(safeSid, "info", `collectGraphData: ${entryFiles.length} entry files identified`);

  // 3. Collect import edges via codegraph
  const imports = {};
  try {
    const cmd = `codegraph query --json -k import -l 2000 "" -p "${projectDir}"`;
    pushLog(safeSid, "info", `collectGraphData: ${cmd}`);
    const raw = execSync(cmd, { encoding: "utf-8", timeout: 30000, stdio: ["pipe", "pipe", "pipe"] });
    const data = JSON.parse(raw);
    for (const item of data) {
      const src = item.node.filePath;
      if (!src || src.includes("worktree")) continue;
      const target = item.node.qualifiedName || item.node.name;
      if (!target || target.startsWith("node:")) continue;
      if (!imports[src]) imports[src] = [];
      if (!imports[src].includes(target)) imports[src].push(target);
    }
    pushLog(safeSid, "info", `collectGraphData: collected imports for ${Object.keys(imports).length} source files`);
  } catch (e) {
    pushLog(safeSid, "warn", `collectGraphData: import collection failed — ${e.message}`);
  }

  // 4. Collect function/method symbols via codegraph
  const symbols = {};
  try {
    const cmd = `codegraph query --json -k function -l 2000 "" -p "${projectDir}"`;
    pushLog(safeSid, "info", `collectGraphData: ${cmd}`);
    const raw = execSync(cmd, { encoding: "utf-8", timeout: 30000, stdio: ["pipe", "pipe", "pipe"] });
    const data = JSON.parse(raw);
    for (const item of data) {
      const filePath = item.node.filePath;
      if (!filePath || filePath.includes("worktree")) continue;
      if (!symbols[filePath]) symbols[filePath] = [];
      symbols[filePath].push({
        name: item.node.name,
        kind: item.node.kind,
        signature: item.node.signature || "",
      });
    }
    pushLog(safeSid, "info", `collectGraphData: collected symbols for ${Object.keys(symbols).length} files`);
  } catch (e) {
    pushLog(safeSid, "warn", `collectGraphData: symbol collection failed — ${e.message}`);
  }

  // 5. Build graphData object
  const graphData = {
    projectDir,
    totalFiles: files.length,
    files: files.map(f => ({ path: f.path, priority: f.priority, entryType: classifyEntryType(f.path) })),
    imports,
    symbols,
    entryFiles,
  };

  // 6. Write to session directory
  fs.mkdirSync(sessionDir, { recursive: true });
  const graphDataPath = path.join(sessionDir, "graph-data.json");
  fs.writeFileSync(graphDataPath, JSON.stringify(graphData, null, 2), "utf-8");

  pushLog(safeSid, "info", `collectGraphData: completed in ${Date.now() - startTime}ms, written to ${graphDataPath}`);
  return graphData;
}

export function scanProjectDir(projectDir, options = {}, sid) {
  const excludeDirs = new Set([...EXCLUDED_DIRS, ...(options.excludeDirs || [])]);
  const minPriority = options.priority || "low";
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  const minIdx = priorityOrder[minPriority] ?? 2;

  const files = [];

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (excludeDirs.has(entry.name)) continue;
        if (entry.name.startsWith(".") && entry.name !== ".env") continue;
        walk(path.join(dir, entry.name));
      } else if (entry.isFile()) {
        const ext = entry.name.split(".").pop().toLowerCase();
        if (!CODE_EXTENSIONS.has(ext)) continue;
        const fullPath = path.join(dir, entry.name);
        const relative = path.relative(projectDir, fullPath).replace(/\\/g, "/");
        const priority = classifyPriority(relative);
        if (priorityOrder[priority] > minIdx) continue;
        files.push({ path: relative, priority });
      }
    }
  }

  walk(projectDir);
  pushLog(sid, "info", `scanProjectDir: found ${files.length} files (high: ${files.filter(f => f.priority === "high").length}, medium: ${files.filter(f => f.priority === "medium").length}, low: ${files.filter(f => f.priority === "low").length})`);
  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}

export function chunkFiles(files, projectDir, sid) {
  const entries = [];
  const nonEntries = [];
  for (const f of files) {
    const entryType = classifyEntryType(f.path);
    if (entryType !== "unknown") {
      entries.push({ ...f, entryType });
    } else {
      nonEntries.push(f);
    }
  }

  pushLog(sid, "info", `chunkFiles: ${files.length} files, ${entries.length} entry points, ${nonEntries.length} non-entry files`);

  const claimed = new Set();
  const chunks = [];
  let chunkIdx = 1;

  for (const entry of entries) {
    const chain = new Set([entry.path]);
    for (const imp of resolveImportsViaCodegraph(entry.path, projectDir, sid)) {
      chain.add(imp);
      for (const imp2 of resolveImportsViaCodegraph(imp, projectDir, sid)) {
        chain.add(imp2);
      }
    }
    const chainFiles = [...chain].filter(p => files.some(f => f.path === p));
    chainFiles.forEach(p => claimed.add(p));

    chunks.push({
      id: "chunk-" + String(chunkIdx++).padStart(3, "0"),
      name: entry.path,
      type: entry.entryType,
      entry: entry.path,
      files: chainFiles,
      priority: entry.priority,
      fileCount: chainFiles.length,
    });
  }

  const remaining = nonEntries.filter(f => !claimed.has(f.path));
  const dirGroups = new Map();
  for (const f of remaining) {
    const dir = path.dirname(f.path);
    if (!dirGroups.has(dir)) dirGroups.set(dir, []);
    dirGroups.get(dir).push(f);
  }
  for (const [dir, dirFiles] of dirGroups) {
    chunks.push({
      id: "chunk-" + String(chunkIdx++).padStart(3, "0"),
      name: dir === "." ? "root" : dir + "/",
      type: "unknown",
      entry: null,
      files: dirFiles.map(f => f.path),
      priority: dirFiles[0].priority,
      fileCount: dirFiles.length,
    });
  }

  const merged = [];
  for (const chunk of chunks) {
    if (merged.length > 0 && merged[merged.length - 1].type === "unknown" && chunk.type === "unknown"
        && merged[merged.length - 1].fileCount + chunk.fileCount <= MAX_FILES_PER_CHUNK) {
      const last = merged[merged.length - 1];
      last.name = last.name + " + " + chunk.name;
      last.files = [...last.files, ...chunk.files];
      last.fileCount += chunk.fileCount;
    } else {
      merged.push({ ...chunk, files: [...chunk.files] });
    }
  }

  pushLog(sid, "info", `chunkFiles: produced ${merged.length} chunks`);
  return merged;
}

export function setProjectScope(projectDir, reportsDir, sid, scanOptions = {}) {
  const safeSid = sanitizePath(sid);
  const sessionDir = path.join(reportsDir, safeSid);
  const indexPath = path.join(sessionDir, "index.yaml");
  if (!fs.existsSync(indexPath)) throw new Error("Session not found: " + safeSid);

  const startTime = Date.now();
  resetCodegraphCache();
  pushLog(safeSid, "info", `setProjectScope: starting scan of ${projectDir}`);

  const files = scanProjectDir(projectDir, scanOptions, safeSid);
  const chunks = chunkFiles(files, projectDir, safeSid);
  const exclude = new Set(scanOptions.excludeFiles || []);

  const tasksDir = path.join(sessionDir, "project-tasks");
  fs.mkdirSync(tasksDir, { recursive: true });

  const tasks = [];
  for (const chunk of chunks) {
    const filtered = chunk.files.filter(f => !exclude.has(f));
    if (filtered.length === 0) continue;
    const tf = chunk.id + ".yaml";
    writeProjectTaskYaml(path.join(tasksDir, tf), {
      name: chunk.name,
      type: chunk.type || "unknown",
      entry: chunk.entry || null,
      files: filtered,
    });
    tasks.push({ file: "project-tasks/" + tf, status: "pending" });
  }

  writeYaml(path.join(sessionDir, "project-map.yaml"), {
    projectDir,
    totalFiles: files.length,
    scannedFiles: files.length,
    excludedDirs: [...(scanOptions.excludeDirs || [])],
    chunks: chunks.map(c => ({
      id: c.id,
      name: c.name,
      type: c.type,
      entry: c.entry,
      files: c.files,
      priority: c.priority,
      fileCount: c.fileCount,
    })),
  });

  const index = readYaml(indexPath);
  writeIndexYaml(indexPath, {
    session: {
      ...index.session,
      type: "project",
      scope: { method: "directory-scan", ref: "" },
      projectDir,
    },
    codeTasks: index.codeTasks || [],
    storyTasks: index.storyTasks || [],
    projectTasks: tasks,
  });

  pushLog(safeSid, "info", `setProjectScope: ${tasks.length} tasks from ${files.length} files in ${Date.now() - startTime}ms`);
  return { taskCount: tasks.length, totalFiles: files.length, chunks };
}

export function getProjectMap(reportsDir, sid) {
  const safeSid = sanitizePath(sid);
  const mapPath = path.join(reportsDir, safeSid, "project-map.yaml");
  if (!fs.existsSync(mapPath)) return null;
  return readYaml(mapPath);
}
