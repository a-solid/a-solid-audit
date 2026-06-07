import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveProjectDir, resolveReportsDir } from "./lib/paths.mjs";
import { resetReviewing } from "./lib/session.mjs";
import { startServer } from "./server/index.mjs";

let projectDir = resolveProjectDir();

function getReportsDir() {
  return resolveReportsDir(projectDir);
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  const rawArgs = process.argv.slice(2);
  const filteredArgs = [];
  for (let i = 0; i < rawArgs.length; i++) {
    if (rawArgs[i] === "--project-dir" && rawArgs[i + 1]) {
      projectDir = resolveProjectDir(rawArgs[i + 1]);
      i++;
    } else {
      filteredArgs.push(rawArgs[i]);
    }
  }
  const [command, ...args] = filteredArgs;

  (async () => {
    try {
      switch (command) {
        case "reset-reviewing":
          resetReviewing(getReportsDir(), args[0]);
          console.log("Reset reviewing tasks for session: " + args[0]);
          break;
        case "server":
          startServer(projectDir, args[0] ? parseInt(args[0], 10) : 12345);
          break;
        default:
          console.log("Usage: node scripts/cli.mjs [--project-dir <path>] <command> [args]");
          console.log("Commands:");
          console.log("  server [port]            Start the web server (default port: 12345)");
          console.log("  reset-reviewing <sid>    Reset reviewing tasks to pending");
          break;
      }
    } catch (e) {
      process.stderr.write("Error: " + e.message + "\n");
      process.exit(1);
    }
  })();
}
