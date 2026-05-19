// skills/audit/scripts/session.mjs
import { getReportsDir } from "./cli.mjs";
import { createSession, resetReviewing } from "./lib/session.mjs";

export {
  sanitizePath, sanitizeFilePath, sessionId,
  listSessions, getSession, updateSessionStatus,
  initSession, createSession, resetReviewing,
} from "./lib/session.mjs";

export function cmdInit(sid) {
  if (!sid) throw new Error("Session ID is required");
  const reportsDir = getReportsDir();
  const { id, dir } = createSession(reportsDir, sid);
  console.log(`Initialized session: ${dir}`);
}

export function cmdResetReviewing(sid) {
  const reportsDir = getReportsDir();
  const resetCount = resetReviewing(reportsDir, sid);
  console.log(`Reset ${resetCount} task(s) to pending in session ${sid}`);
}
