import { execFileSync } from "node:child_process";
import path from "node:path";

export function adfToText(adf) {
  if (typeof adf === "string") return adf;
  if (!adf || typeof adf !== "object") return "";

  if (adf.type === "text") return adf.text || "";
  if (adf.type === "hardBreak") return "\n";
  if (!adf.content || !Array.isArray(adf.content)) return "";

  const parts = [];
  for (const node of adf.content) {
    switch (node.type) {
      case "paragraph": {
        const text = (node.content || []).map(c => adfToText(c)).join("");
        parts.push(text);
        break;
      }
      case "bulletList":
      case "numberedList": {
        const items = (node.content || []).map(c => {
          const inner = adfToText(c);
          return "- " + inner;
        });
        parts.push(items.join("\n"));
        break;
      }
      case "listItem": {
        const inner = (node.content || []).map(c => adfToText(c)).join("");
        parts.push(inner);
        break;
      }
      case "heading": {
        const text = (node.content || []).map(c => adfToText(c)).join("");
        parts.push(text);
        break;
      }
      case "codeBlock": {
        const text = (node.content || []).map(c => adfToText(c)).join("");
        parts.push(text);
        break;
      }
      case "blockquote": {
        const text = (node.content || []).map(c => adfToText(c)).join("\n");
        parts.push(text);
        break;
      }
      default:
        parts.push(adfToText(node));
        break;
    }
  }
  return parts.join("\n");
}

export function cmdJiraFetch(jiraId) {
  if (!/^[A-Z]+-\d+$/.test(jiraId)) {
    return Promise.reject(new Error("Invalid JIRA ID format: " + jiraId));
  }

  const providerPath = path.join(import.meta.dirname, "providers", "jira.mjs");
  let stdout;
  try {
    stdout = execFileSync(providerPath, [jiraId], { encoding: "utf8", timeout: 30000, maxBuffer: 1024 * 1024 * 10 });
  } catch (e) {
    return Promise.reject(new Error(e.stderr?.toString().trim() || e.message));
  }

  let stories;
  try {
    stories = JSON.parse(stdout);
  } catch {
    return Promise.reject(new Error("JIRA provider returned invalid JSON"));
  }
  if (!Array.isArray(stories) || stories.length === 0) {
    return Promise.reject(new Error("JIRA provider returned no results"));
  }

  const s = stories[0];
  const result = {
    key: s.id,
    summary: s.name,
    description: s.description,
    acceptance: s.acceptance,
  };
  console.log(JSON.stringify(result, null, 2));
  return Promise.resolve(result);
}
