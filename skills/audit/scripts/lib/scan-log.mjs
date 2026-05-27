// ── Scan log buffer (for SSE streaming) ──
const scanLogs = new Map();

export function pushLog(sid, level, message) {
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
