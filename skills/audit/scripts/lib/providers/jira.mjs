#!/usr/bin/env node
import https from "node:https";

function adfToText(adf) {
  if (typeof adf === "string") return adf;
  if (!adf || typeof adf !== "object") return "";
  if (adf.type === "text") return adf.text || "";
  if (adf.type === "hardBreak") return "\n";
  if (!adf.content || !Array.isArray(adf.content)) return "";
  const parts = [];
  for (const node of adf.content) {
    switch (node.type) {
      case "paragraph": { parts.push((node.content || []).map(c => adfToText(c)).join("")); break; }
      case "bulletList":
      case "numberedList": { parts.push((node.content || []).map(c => "- " + adfToText(c)).join("\n")); break; }
      case "listItem": { parts.push((node.content || []).map(c => adfToText(c)).join("")); break; }
      case "heading": { parts.push((node.content || []).map(c => adfToText(c)).join("")); break; }
      case "codeBlock": { parts.push((node.content || []).map(c => adfToText(c)).join("")); break; }
      case "blockquote": { parts.push((node.content || []).map(c => adfToText(c)).join("\n")); break; }
      default: parts.push(adfToText(node)); break;
    }
  }
  return parts.join("\n");
}

function extractAcFromDescription(descriptionText) {
  const markers = ["Acceptance Criteria:", "Acceptance criteria:", "AC:"];
  for (const marker of markers) {
    const idx = descriptionText.indexOf(marker);
    if (idx !== -1) return descriptionText.slice(idx + marker.length).trim();
  }
  return "";
}

function extractAc(fields, description) {
  const acFields = ["customfield_10001", "customfield_10002", "customfield_10026"];
  for (const f of acFields) {
    const val = fields[f];
    if (val) {
      if (typeof val === "string") return val;
      if (typeof val === "object" && val.content) return adfToText(val);
    }
  }
  return extractAcFromDescription(description);
}

function fetchIssue(jiraId) {
  return new Promise((resolve, reject) => {
    const baseUrl = process.env.JIRA_BASE_URL;
    const token = process.env.JIRA_API_TOKEN;
    const email = process.env.JIRA_USER_EMAIL;
    if (!baseUrl || !token || !email) {
      reject(new Error("Missing JIRA env vars: JIRA_BASE_URL, JIRA_API_TOKEN, JIRA_USER_EMAIL"));
      return;
    }
    const url = new URL("/rest/api/2/issue/" + jiraId + "?fields=summary,description,issuelinks,customfield_10001,customfield_10002,customfield_10026", baseUrl);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: "GET",
      headers: { "Authorization": "Basic " + Buffer.from(email + ":" + token).toString("base64"), "Accept": "application/json" },
      timeout: 30000,
    };
    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        if (res.statusCode !== 200) { reject(new Error("JIRA API returned status " + res.statusCode + ": " + body)); return; }
        try {
          const issue = JSON.parse(body);
          const fields = issue.fields || {};
          const description = fields.description ? adfToText(fields.description) : "";
          const acceptance = extractAc(fields, description);
          resolve({
            id: issue.key,
            name: issue.key,
            description: (fields.summary || "") + (description ? "\n\n" + description : ""),
            acceptance,
          });
        } catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("JIRA API request timed out")); });
    req.end();
  });
}

async function main() {
  const ids = process.argv.slice(2);
  if (ids.length === 0) { process.stderr.write("Usage: jira.mjs <jira-id> [<jira-id> ...]\n"); process.exit(1); }
  const results = [];
  for (const id of ids) {
    try {
      results.push(await fetchIssue(id));
    } catch (e) {
      process.stderr.write("Failed to fetch " + id + ": " + e.message + "\n");
    }
  }
  console.log(JSON.stringify(results, null, 2));
  if (results.length === 0) process.exit(1);
}

main();
