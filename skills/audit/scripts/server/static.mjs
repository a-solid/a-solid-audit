// skills/audit/scripts/server/static.mjs
import fs from "node:fs";
import path from "node:path";

const PUBLIC_DIR = path.join(import.meta.dirname, "..", "public");

const MIME_TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

export function serveStatic(req, res, urlPath) {
  let filePath;
  if (urlPath === "/") {
    filePath = path.join(PUBLIC_DIR, "index.html");
  } else {
    const safe = path.normalize(urlPath).replace(/^(\.\.[\/\\])+/, "");
    filePath = path.join(PUBLIC_DIR, safe);
  }

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": contentType });
  fs.createReadStream(filePath).pipe(res);
}
