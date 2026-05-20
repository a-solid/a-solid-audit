import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export function detectLanguage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    ".java": "java", ".js": "javascript", ".jsx": "javascript",
    ".ts": "typescript", ".tsx": "typescript", ".sql": "sql",
    ".yml": "yaml", ".yaml": "yaml", ".json": "json", ".xml": "xml",
    ".properties": "properties", ".gradle": "gradle",
    ".conf": "config", ".cfg": "config", ".ini": "config", ".toml": "config", ".env": "config",
    ".py": "python", ".go": "go", ".rs": "rust", ".rb": "ruby", ".php": "php",
    ".kt": "kotlin", ".scala": "scala", ".c": "c", ".cpp": "cpp", ".h": "c", ".hpp": "cpp",
    ".sh": "shell", ".bash": "shell", ".zsh": "shell", ".md": "markdown",
    ".html": "html", ".htm": "html", ".css": "css", ".scss": "scss", ".less": "less",
    ".mjs": "javascript", ".cjs": "javascript",
  };
  return map[ext] || "unknown";
}

function runGit(args, projectDir) {
  try {
    return execFileSync("git", args, { encoding: "utf8", cwd: projectDir });
  } catch (e) {
    if (e.stderr) process.stderr.write(e.stderr);
    return "";
  }
}

export function runGitDiff(scopeType, scopeRef, projectDir) {
  if (scopeType === "uncommitted") {
    return runGit(["diff"], projectDir) + runGit(["diff", "--cached"], projectDir);
  }
  if (scopeType === "commits") {
    const ids = scopeRef.split(" ");
    return runGit(["diff", ids[0], ids[1]], projectDir);
  }
  if (scopeType === "branch") {
    return runGit(["diff", scopeRef], projectDir);
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

// New: get latest 10 commits for scope selection UI
export function getCommits(projectDir) {
  const output = runGit(["log", "-10", "--format=%H|||%s|||%aI|||%an"], projectDir);
  if (!output.trim()) return [];
  return output.trim().split("\n").map(line => {
    const [hash, message, date, author] = line.split("|||");
    return { hash, message, date, author };
  });
}

// New: get local branches for scope selection UI
export function getBranches(projectDir) {
  const output = runGit(["branch", "--format=%(refname:short)"], projectDir);
  if (!output.trim()) return [];
  return output.trim().split("\n").filter(Boolean);
}

