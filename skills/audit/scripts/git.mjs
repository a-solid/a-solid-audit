import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { getReportsDir, sanitizePath } from "./cli.mjs";
import { writeIndexYaml, writeCodeTaskYaml, readYaml } from "./yaml.mjs";

export function detectLanguage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    ".java": "java",
    ".js": "javascript",
    ".jsx": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".sql": "sql",
    ".yml": "yaml",
    ".yaml": "yaml",
    ".json": "json",
    ".xml": "xml",
    ".properties": "properties",
    ".gradle": "gradle",
    ".conf": "config",
    ".cfg": "config",
    ".ini": "config",
    ".toml": "config",
    ".env": "config",
    ".py": "python",
    ".go": "go",
    ".rs": "rust",
    ".rb": "ruby",
    ".php": "php",
    ".kt": "kotlin",
    ".scala": "scala",
    ".c": "c",
    ".cpp": "cpp",
    ".h": "c",
    ".hpp": "cpp",
    ".sh": "shell",
    ".bash": "shell",
    ".zsh": "shell",
    ".md": "markdown",
    ".html": "html",
    ".htm": "html",
    ".css": "css",
    ".scss": "scss",
    ".less": "less",
    ".mjs": "javascript",
    ".cjs": "javascript",
  };
  return map[ext] || "unknown";
}

export function runGitDiff(scopeType, scopeRef) {
  function runGit(args) {
    try {
      return execFileSync("git", args, { encoding: "utf8" });
    } catch (e) {
      if (e.stderr) process.stderr.write(e.stderr);
      return "";
    }
  }
  if (scopeType === "uncommitted") {
    return runGit(["diff"]) + runGit(["diff", "--cached"]);
  }
  if (scopeType === "commits") {
    const ids = scopeRef.split(" ");
    return runGit(["diff", ids[0], ids[1]]);
  }
  if (scopeType === "branch") {
    return runGit(["diff", scopeRef]);
  }
  return "";
}

export function parseDiffByFile(diffOutput) {
  const files = {};
  const lines = diffOutput.split("\n");
  let currentFile = null;
  let currentChunks = [];
  for (const line of lines) {
    const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (match) {
      if (currentFile) files[currentFile] = currentChunks.join("\n");
      currentFile = match[2].trim();
      currentChunks = [line];
    } else if (currentFile) {
      currentChunks.push(line);
    }
  }
  if (currentFile) files[currentFile] = currentChunks.join("\n");
  return files;
}

export function taskFileName(filePath) {
  return filePath.replace(/\//g, ".") + ".yaml";
}

export function cmdGitDiff(sessionId, scopeType, scopeRef) {
  const safeSid = sanitizePath(sessionId);
  const sessionDir = path.join(getReportsDir(), safeSid);
  if (!fs.existsSync(sessionDir)) {
    throw new Error("Session not found: " + sessionDir);
  }
  const diff = runGitDiff(scopeType, scopeRef);
  if (!diff.trim()) {
    console.log("No diff found.");
    return;
  }
  const filesMap = parseDiffByFile(diff);
  const tasksDir = path.join(sessionDir, "code-tasks");
  fs.mkdirSync(tasksDir, { recursive: true });
  const tasks = [];
  for (const [filePath, diffText] of Object.entries(filesMap)) {
    const hasChanges = diffText.split("\n").some(
      l => (l.startsWith("+") && !l.startsWith("+++")) || (l.startsWith("-") && !l.startsWith("---"))
    );
    if (!hasChanges) continue;
    const tf = taskFileName(filePath);
    const task = { name: filePath, status: "pending", language: detectLanguage(filePath), diff: diffText, review: { score: 0, summary: "", findings: [], positives: [] } };
    writeCodeTaskYaml(path.join(tasksDir, tf), task);
    tasks.push({ file: "code-tasks/" + tf, status: "pending" });
  }
  const indexPath = path.join(sessionDir, "index.yaml");
  const existingIndex = fs.existsSync(indexPath) ? readYaml(indexPath) : null;
  writeIndexYaml(indexPath, {
    session: {
      id: safeSid,
      type: existingIndex?.session?.type === "all" ? "all" : "code",
      scope: { method: scopeType, ref: scopeRef || "" },
      created: existingIndex?.session?.created || new Date().toISOString(),
      completed: false,
    },
    codeTasks: tasks,
    storyTasks: existingIndex?.storyTasks || [],
  });
  console.log(`Created ${tasks.length} task file(s) in ${tasksDir}`);
}
