// skills/audit/scripts/lib/project-scan.mjs
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { writeYaml, readYaml, writeIndexYaml } from "./yaml.mjs";
import { sanitizePath } from "./session.mjs";

const ENTRY_RULES = [
  { type: "api", pathPatterns: /handler|controller|route|api|endpoint/i, filePatterns: /router|handler|controller/i },
  { type: "scheduled", pathPatterns: /cron|job|scheduler/i, filePatterns: /cron|job|schedule/i },
  { type: "consumer", pathPatterns: /consumer|subscriber|worker|queue|listener/i, filePatterns: /consumer|subscriber|worker|listener/i },
  { type: "script", pathPatterns: /script|bin|cli|migration/i, filePatterns: /cli|migrate|seed|setup/i },
];

const SERVICE_PATTERNS = /service|dao|repository|model|entity/i;

function classifyFile(filePath) {
  if (SERVICE_PATTERNS.test(filePath)) {
    if (/service/i.test(filePath)) return "service";
    if (/dao|repository/i.test(filePath)) return "dao";
    if (/model|entity/i.test(filePath)) return "model";
  }
  return "other";
}

const IGNORE_DIRS = new Set(["node_modules", ".git", "dist", "build", "vendor", "__pycache__", ".audit", ".codegraph", "coverage", ".next", ".nuxt"]);

function detectCodeGraph() {
  try {
    const version = execSync("codegraph --version", { timeout: 5000, encoding: "utf-8" }).trim();
    console.log("[scan] CodeGraph " + version + " detected — using AST-level analysis");
    return { available: true, version };
  } catch {
    console.log("[scan] CodeGraph not found — using heuristic fallback");
    return { available: false };
  }
}

function collectFiles(dir, base = dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      results.push(...collectFiles(path.join(dir, entry.name), base));
    } else {
      const ext = path.extname(entry.name);
      if ([".js", ".mjs", ".cjs", ".ts", ".mts", ".cts", ".jsx", ".tsx"].includes(ext)) {
        results.push(path.relative(base, path.join(dir, entry.name)));
      }
    }
  }
  return results;
}

function identifyEntryType(filePath) {
  for (const rule of ENTRY_RULES) {
    if (rule.pathPatterns.test(filePath) || rule.filePatterns.test(path.basename(filePath, path.extname(filePath)))) {
      return rule.type;
    }
  }
  return "unknown";
}

function parseImports(content, filePath) {
  const imports = [];
  const dir = path.dirname(filePath);
  const patterns = [
    /import\s+.*?\s+from\s+['"](\.\/[^'"]+)['"]/g,
    /import\s+.*?\s+from\s+['"](\.\.\/[^'"]+)['"]/g,
    /require\s*\(\s*['"](\.\/[^'"]+)['"]\s*\)/g,
    /require\s*\(\s*['"](\.\.\/[^'"]+)['"]\s*\)/g,
  ];
  for (const re of patterns) {
    let match;
    while ((match = re.exec(content)) !== null) {
      const raw = match[1];
      const resolved = path.normalize(path.join(dir, raw));
      imports.push(resolved);
    }
  }
  return imports;
}

function traceCallChainHeuristic(entryFile, projectDir, allFiles) {
  const visited = new Set();
  const chain = [];
  const exts = [".js", ".mjs", ".cjs", ".ts", ".mts", ".cts", ""];

  function walk(filePath) {
    if (visited.has(filePath)) return;
    visited.add(filePath);
    chain.push(filePath);

    const full = path.join(projectDir, filePath);
    if (!fs.existsSync(full)) return;
    const content = fs.readFileSync(full, "utf-8");
    const imports = parseImports(content, filePath);

    for (const imp of imports) {
      let resolved = imp.startsWith("/") ? imp : path.normalize(imp);
      let found = false;
      for (const ext of exts) {
        const candidate = resolved + ext;
        if (allFiles.includes(candidate) && !visited.has(candidate)) {
          walk(candidate);
          found = true;
          break;
        }
      }
      if (!found) {
        for (const ext of exts) {
          const candidate = path.join(resolved, "index" + ext);
          if (allFiles.includes(candidate) && !visited.has(candidate)) {
            walk(candidate);
            break;
          }
        }
      }
    }
  }

  walk(entryFile);
  return chain;
}

function traceCallChainCodeGraph(entryFile, projectDir) {
  try {
    const result = execSync(
      `codegraph callees "${entryFile}" --depth 5 --json`,
      { cwd: projectDir, timeout: 30000, encoding: "utf-8" }
    );
    const data = JSON.parse(result);
    return (data.files || []).map(f => path.relative(projectDir, f));
  } catch {
    return null;
  }
}

function detectBinEntries(projectDir) {
  const pkgPath = path.join(projectDir, "package.json");
  if (!fs.existsSync(pkgPath)) return [];
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    const bins = [];
    if (pkg.bin) {
      if (typeof pkg.bin === "string") bins.push(pkg.bin);
      else Object.values(pkg.bin).forEach(b => bins.push(b));
    }
    return bins.filter(b => typeof b === "string").map(b => path.normalize(b));
  } catch {
    return [];
  }
}

function generateMermaidSource(entryFile, files) {
  if (files.length <= 1) return "";
  const nodes = files.map((f, i) => {
    const name = path.basename(f, path.extname(f));
    return `  N${i}[${name}]`;
  });
  const edges = [];
  for (let i = 0; i < files.length - 1; i++) {
    edges.push(`  N${i} --> N${i + 1}`);
  }
  return "graph TD\n" + nodes.join("\n") + "\n" + edges.join("\n");
}

function computeDependencyMatrix(entryChains) {
  // entryChains: Map<entryPath, { type, files: string[] }>
  const entries = Array.from(entryChains.entries());

  // Classify files per entry
  const summaries = entries.map(([entryPath, info]) => {
    const services = [];
    const daos = [];
    const otherFiles = [];
    for (const f of info.files) {
      const cls = classifyFile(f);
      if (cls === "service") services.push(f);
      else if (cls === "dao") daos.push(f);
      else if (f !== entryPath) otherFiles.push(f);
    }
    return {
      path: entryPath,
      type: info.type,
      services,
      daos,
      totalFiles: info.files.length,
      mainFiles: otherFiles.slice(0, 5),
    };
  });

  // Build shared dependency pairs
  const pairs = [];
  for (let i = 0; i < summaries.length; i++) {
    for (let j = i + 1; j < summaries.length; j++) {
      const a = new Set(entries[i][1].files);
      const b = new Set(entries[j][1].files);
      const shared = [...a].filter(f => b.has(f));
      if (shared.length > 0) {
        const sharedServices = shared.filter(f => /service/i.test(f));
        const sharedDaos = shared.filter(f => /dao|repository/i.test(f));
        const ratio = shared.length / Math.min(a.size, b.size);
        pairs.push({
          entryA: summaries[i].path,
          entryB: summaries[j].path,
          sharedCount: shared.length,
          sharedRatio: Math.round(ratio * 100) / 100,
          sharedServices,
          sharedDaos,
          sharedOther: shared.filter(f =>
            !/service|dao|repository/i.test(f)
          ),
        });
      }
    }
  }

  return { summaries, pairs };
}

export function scanProject(projectDir, reportsDir, sid) {
  const safeSid = sanitizePath(sid);
  const sessionDir = path.join(reportsDir, safeSid);
  const indexPath = path.join(sessionDir, "index.yaml");
  if (!fs.existsSync(indexPath)) throw new Error("Session not found: " + safeSid);

  const codegraph = detectCodeGraph();

  if (codegraph.available) {
    try {
      execSync("codegraph init -i", { cwd: projectDir, timeout: 10000, stdio: "pipe" });
      execSync("codegraph index", { cwd: projectDir, timeout: 120000, stdio: "pipe" });
    } catch (e) {
      console.log("[scan] CodeGraph indexing failed, falling back: " + e.message);
      codegraph.available = false;
    }
  }

  const allFiles = collectFiles(projectDir);
  console.log("[scan] Found " + allFiles.length + " source files");

  const entries = new Map();

  for (const file of allFiles) {
    const type = identifyEntryType(file);
    if (type !== "unknown") {
      entries.set(file, { type, entry: file });
    }
  }

  for (const bin of detectBinEntries(projectDir)) {
    if (!entries.has(bin)) {
      entries.set(bin, { type: "script", entry: bin });
    }
  }

  const entryFiles = new Set(entries.keys());
  const assignedFiles = new Set();

  const tasksDir = path.join(sessionDir, "project-tasks");
  fs.mkdirSync(tasksDir, { recursive: true });

  const projectTasks = [];

  for (const [entryFile, info] of entries) {
    let files;
    if (codegraph.available) {
      files = traceCallChainCodeGraph(entryFile, projectDir);
      if (!files) files = traceCallChainHeuristic(entryFile, projectDir, allFiles);
    } else {
      files = traceCallChainHeuristic(entryFile, projectDir, allFiles);
    }

    if (!files || files.length === 0) files = [entryFile];

    for (const f of files) assignedFiles.add(f);

    const name = path.basename(entryFile, path.extname(entryFile));
    const taskFile = "project-tasks/" + name.replace(/[^a-zA-Z0-9_-]/g, "-") + ".yaml";
    const callChain = generateMermaidSource(entryFile, files);

    writeYaml(path.join(sessionDir, taskFile), {
      name,
      type: info.type,
      entry: entryFile,
      files,
      status: "pending",
      _callChain: callChain,
      overview: { diagram: "", description: "" },
      review: { score: 0, summary: "", findings: [], positives: [], gaps: [] },
    });

    projectTasks.push({ file: taskFile, type: info.type, entry: entryFile, status: "pending" });
  }

  const orphans = allFiles.filter(f => !assignedFiles.has(f) && !entryFiles.has(f));
  if (orphans.length > 0) {
    const taskFile = "project-tasks/_unassigned.yaml";
    writeYaml(path.join(sessionDir, taskFile), {
      name: "unassigned-files",
      type: "unknown",
      entry: "",
      files: orphans,
      status: "pending",
      _callChain: "",
      overview: { diagram: "", description: "" },
      review: { score: 0, summary: "", findings: [], positives: [], gaps: [] },
    });
    projectTasks.push({ file: taskFile, type: "unknown", entry: "", status: "pending" });
  }

  const index = readYaml(indexPath);
  index.projectTasks = projectTasks;
  index.session.status = "ready";
  writeIndexYaml(indexPath, index);

  console.log("[scan] Discovered " + projectTasks.length + " entry points, " + orphans.length + " unassigned files");
  return { tasksFound: projectTasks.length, codegraphUsed: codegraph.available, orphans: orphans.length };
}
