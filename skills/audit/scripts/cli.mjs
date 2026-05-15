import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

import { cmdInit, cmdResetReviewing } from "./session.mjs";
import { cmdGitDiff } from "./git.mjs";
import { cmdJiraFetch } from "./jira.mjs";
import { cmdUpdateTask, cmdMapStories } from "./task.mjs";
import { startReportServer } from "./report-server.mjs";
import { readYaml, writeIndexYaml, writeStoryTaskYaml } from "./yaml.mjs";

let projectDir = process.cwd();

export function setProjectDir(dir) {
  projectDir = dir;
}

export function getReportsDir() {
  return path.join(projectDir, ".audit");
}

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

export function findLatestSession() {
  const reportsDir = getReportsDir();
  if (!fs.existsSync(reportsDir)) return null;
  const entries = fs.readdirSync(reportsDir).filter(e => {
    return fs.statSync(path.join(reportsDir, e)).isDirectory();
  });
  if (entries.length === 0) return null;
  entries.sort();
  const unindexed = entries.filter(e => !fs.existsSync(path.join(reportsDir, e, "index.yaml")));
  if (unindexed.length > 0) return unindexed[unindexed.length - 1];
  return entries[entries.length - 1];
}

export function cmdStoryInit(sessionId, jsonArg) {
  const safeSid = sanitizePath(sessionId);
  const sessionDir = path.join(getReportsDir(), safeSid);
  const indexPath = path.join(sessionDir, "index.yaml");
  if (!fs.existsSync(sessionDir)) throw new Error("Session not found: " + sessionDir);

  let storyData;
  try {
    storyData = JSON.parse(jsonArg);
  } catch {
    throw new Error("Invalid JSON for story-init. Expected: '{\"name\":\"...\",\"description\":\"...\",\"acceptance\":\"...\"}'");
  }

  const safeName = (storyData.name || "untitled").replace(/[^a-zA-Z0-9\-_.]/g, "-");
  const storyFile = "story-tasks/" + safeName + ".yaml";
  const storyPath = path.join(sessionDir, storyFile);

  fs.mkdirSync(path.join(sessionDir, "story-tasks"), { recursive: true });

  writeStoryTaskYaml(storyPath, {
    name: safeName,
    status: "pending",
    description: storyData.description || "",
    acceptance: storyData.acceptance || "",
    files: [],
  });

  let index;
  if (fs.existsSync(indexPath)) {
    index = readYaml(indexPath);
  } else {
    index = {
      session: { id: safeSid, type: "story", scope: { method: "", ref: "" }, created: new Date().toISOString(), completed: false },
      codeTasks: [],
      storyTasks: [],
    };
  }
  index.storyTasks = index.storyTasks || [];
  index.storyTasks.push({ file: storyFile, status: "pending" });
  if (index.session.type === "code") index.session.type = "all";
  writeIndexYaml(indexPath, index);

  console.log("Created story task: " + storyPath);
}

export function listProviders() {
  const providersDir = path.join(import.meta.dirname, "providers");
  if (!fs.existsSync(providersDir)) { console.log("No providers found."); return []; }
  const entries = fs.readdirSync(providersDir).filter(f => {
    const fullPath = path.join(providersDir, f);
    try { fs.accessSync(fullPath, fs.constants.X_OK); return true; } catch { return false; }
  });
  const names = entries.map(f => path.basename(f, path.extname(f)));
  if (names.length > 0) console.log("Available providers: " + names.join(", "));
  else console.log("No providers found.");
  return names;
}

export function cmdProviderFetch(providerName, storyIds) {
  const providersDir = path.join(import.meta.dirname, "providers");
  if (!fs.existsSync(providersDir)) throw new Error("No providers directory found");

  const candidates = fs.readdirSync(providersDir).filter(f => {
    const base = path.basename(f, path.extname(f));
    return base === providerName;
  });
  if (candidates.length === 0) throw new Error("Provider not found: " + providerName);

  const providerPath = path.join(providersDir, candidates[0]);

  let stdout;
  try {
    stdout = execFileSync(providerPath, storyIds, { encoding: "utf8", timeout: 60000, maxBuffer: 1024 * 1024 * 10 });
  } catch (e) {
    throw new Error("Provider '" + providerName + "' failed: " + (e.stderr || e.message));
  }

  let stories;
  try {
    stories = JSON.parse(stdout);
  } catch {
    throw new Error("Provider '" + providerName + "' returned invalid JSON");
  }
  if (!Array.isArray(stories)) throw new Error("Provider must return a JSON array");

  console.log("Fetched " + stories.length + " stories from " + providerName);
  return stories;
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  const rawArgs = process.argv.slice(2);
  const filteredArgs = [];
  for (let i = 0; i < rawArgs.length; i++) {
    if (rawArgs[i] === "--project-dir" && rawArgs[i + 1]) {
      setProjectDir(rawArgs[i + 1]);
      i++;
    } else {
      filteredArgs.push(rawArgs[i]);
    }
  }
  const [command, ...args] = filteredArgs;

  (async () => {
    try {
      switch (command) {
        case "init":
          cmdInit(args[0] || sessionId());
          break;
        case "git-diff":
          cmdGitDiff(args[0], args[1], args.slice(2).join(" "));
          break;
        case "jira-fetch":
          cmdJiraFetch(args[0]);
          break;
        case "map-stories":
          cmdMapStories(args[0], args.slice(1).join(" "));
          break;
        case "update-task":
          cmdUpdateTask(args[0], args[1], args[2], args[3]);
          break;
        case "reset-reviewing":
          cmdResetReviewing(args[0]);
          break;
        case "report":
          startReportServer(args[0], args[1] ? parseInt(args[1], 10) : 3456);
          break;
        case "story-init":
          cmdStoryInit(args[0], args.slice(1).join(" "));
          break;
        case "list-providers":
          listProviders();
          break;
        case "provider-fetch":
          if (args.length < 2) { console.log("Usage: provider-fetch <provider-name> <story-id> [<story-id> ...]"); break; }
          try {
            const stories = await cmdProviderFetch(args[0], args.slice(1));
            for (const s of stories) {
              console.log("  - " + s.id + ": " + (s.name || "").slice(0, 60));
            }
          } catch (e) { process.stderr.write("Error: " + e.message + "\n"); process.exit(1); }
          break;
        default:
          console.log("Usage: node scripts/cli.mjs [--project-dir <path>] <command> [args]");
          console.log("Options:");
          console.log("  --project-dir <path>  Target project root (default: current directory)");
          console.log("Commands:");
          console.log("  init              Initialize a new session");
          console.log("  git-diff          Analyze git diff");
          console.log("  update-task       Update task status/score");
          console.log("  jira-fetch        Fetch Jira stories");
          console.log("  map-stories       Map stories to code changes");
          console.log("  reset-reviewing   Reset reviewing tasks to pending");
          console.log("  list-providers    List available story providers");
          console.log("  provider-fetch    Fetch stories from a provider");
          break;
      }
    } catch (e) {
      process.stderr.write("Error: " + e.message + "\n");
      process.exit(1);
    }
  })();
}
