import fs from "node:fs";
import path from "node:path";

function yamlValue(v, indent = 0) {
  if (v === null || v === undefined) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") {
    if (v === "") return '""';
    if (v.includes("\n")) {
      const pad = "  ".repeat(indent + 1);
      const lines = v.split("\n").map(l => pad + l);
      return "|\n" + lines.join("\n");
    }
    if (/[:{}\[\],&*?|>!%#`@\\'" ]/.test(v) || v === "true" || v === "false" || v === "null" || /^\d/.test(v)) {
      return JSON.stringify(v);
    }
    return v;
  }
  return String(v);
}

export function writeYaml(filePath, data, indent = 0) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const lines = [];
  serializeYaml(data, indent, lines);
  fs.writeFileSync(filePath, lines.join("\n") + "\n", "utf8");
}

function serializeYaml(data, indent, lines) {
  const pad = "  ".repeat(indent);
  if (Array.isArray(data)) {
    if (data.length === 0) {
      lines[lines.length - 1] += " []";
      return;
    }
    for (const item of data) {
      if (typeof item === "string") {
        lines.push(pad + "- " + yamlValue(item, indent));
      } else if (typeof item === "object" && item !== null) {
        const entries = Object.entries(item);
        const first = entries[0];
        lines.push(pad + "- " + first[0] + ": " + yamlValue(first[1], indent + 1));
        for (let i = 1; i < entries.length; i++) {
          const [k, v] = entries[i];
          if (typeof v === "string" && v.includes("\n")) {
            lines.push(pad + "  " + k + ": " + yamlValue(v, indent + 1));
            continue;
          }
          if (Array.isArray(v)) {
            lines.push(pad + "  " + k + ":");
            serializeYaml(v, indent + 2, lines);
            continue;
          }
          if (typeof v === "object" && v !== null) {
            lines.push(pad + "  " + k + ":");
            serializeYaml(v, indent + 2, lines);
            continue;
          }
          lines.push(pad + "  " + k + ": " + yamlValue(v, indent + 1));
        }
      } else {
        lines.push(pad + "- " + yamlValue(item, indent));
      }
    }
    return;
  }
  if (typeof data === "object" && data !== null) {
    for (const [k, v] of Object.entries(data)) {
      if (typeof v === "string" && v.includes("\n")) {
        lines.push(pad + k + ": " + yamlValue(v, indent));
        continue;
      }
      if (Array.isArray(v)) {
        if (v.length === 0) {
          lines.push(pad + k + ": []");
        } else {
          lines.push(pad + k + ":");
          serializeYaml(v, indent + 1, lines);
        }
        continue;
      }
      if (typeof v === "object" && v !== null) {
        lines.push(pad + k + ":");
        serializeYaml(v, indent + 1, lines);
        continue;
      }
      lines.push(pad + k + ": " + yamlValue(v, indent));
    }
    return;
  }
}

function parseYaml(content) {
  const lines = content.split("\n");
  return parseBlock(lines, 0, 0).value;
}

function getIndent(line) {
  const m = line.match(/^(\s*)/);
  return m ? m[1].length : 0;
}

function getContentOffset(line) {
  return line.trim().length > 0 ? line.match(/^(\s*)/)[1].length : 0;
}

function parseBlock(lines, startIdx, baseIndent) {
  const result = {};
  let i = startIdx;
  let foundArray = false;
  const arrayItems = [];

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "" || line.trim().startsWith("#")) { i++; continue; }
    const indent = getIndent(line);
    if (indent < baseIndent && baseIndent > 0) break;

    const listMatch = line.match(/^(\s*)- (.*)$/);
    if (listMatch) {
      foundArray = true;
      const itemIndent = listMatch[1].length;
      const rest = listMatch[2].trim();
      if (/^\S+: /.test(rest)) {
        const obj = {};
        const [firstKey, ...restParts] = rest.split(": ");
        const firstVal = restParts.join(": ").trim();
        obj[firstKey] = parseScalar(firstVal);
        i++;
        while (i < lines.length) {
          const subLine = lines[i];
          if (subLine.trim() === "") { i++; continue; }
          const subIndent = getIndent(subLine);
          if (subIndent <= itemIndent) break;
          const trimmed = subLine.trim();
          const colonIdx = trimmed.indexOf(": ");
          const kv = colonIdx > 0;
          if (kv) {
            const subKey = trimmed.slice(0, colonIdx);
            const subValRaw = trimmed.slice(colonIdx + 2);
            if (subValRaw === "|" || subValRaw === ">" || subValRaw === "") {
              const folded = subValRaw === ">";
              i++;
              if (subValRaw === "|" || subValRaw === ">") {
                const blockLines = [];
                while (i < lines.length && (lines[i].trim() === "" || getIndent(lines[i]) > subIndent)) {
                  blockLines.push(lines[i].substring(getContentOffset(lines[i])));
                  i++;
                }
                const raw = blockLines.join("\n").replace(/\n+$/, "");
                obj[subKey] = folded ? raw.replace(/(?<!\n)\n(?!\n)/g, " ") : raw;
              } else {
                obj[subKey] = "";
              }
            } else if (subValRaw.startsWith("[")) {
              obj[subKey] = subValRaw === "[]" ? [] : subValRaw;
              i++;
            } else {
              obj[subKey] = parseScalar(subValRaw);
              i++;
            }
          } else {
            const bareKey = subLine.trim().replace(/:$/, "");
            i++;
            if (i < lines.length) {
              const nextIndent = getIndent(lines[i]);
              if (nextIndent > subIndent) {
                const sub = parseBlock(lines, i, nextIndent);
                obj[bareKey] = sub.value;
                i = sub.nextIdx;
              } else {
                obj[bareKey] = null;
              }
            } else {
              obj[bareKey] = null;
            }
          }
        }
        arrayItems.push(obj);
      } else {
        arrayItems.push(parseScalar(rest));
        i++;
      }
      continue;
    }

    const kvMatch = line.match(/^(\s*)(\S+): (.*)$/);
    const bareMatch = !kvMatch ? line.match(/^(\s*)(\S+):$/) : null;

    if (!kvMatch && !bareMatch) { i++; continue; }

    const [, rawPad, key] = kvMatch || bareMatch;
    const valRaw = kvMatch ? kvMatch[3] : "";
    const kvIndent = rawPad.length;
    if (kvIndent < baseIndent && baseIndent > 0) break;

    if (valRaw === "|" || valRaw === ">") {
      const folded = valRaw === ">";
      i++;
      const blockLines = [];
      while (i < lines.length && (lines[i].trim() === "" || getIndent(lines[i]) > kvIndent)) {
        blockLines.push(lines[i].substring(getContentOffset(lines[i])));
        i++;
      }
      const raw = blockLines.join("\n").replace(/\n+$/, "");
      if (folded) {
        result[key] = raw.replace(/(?<!\n)\n(?!\n)/g, " ");
      } else {
        result[key] = raw;
      }
    } else if (valRaw === "") {
      i++;
      if (i < lines.length) {
        const nextIndent = getIndent(lines[i]);
        if (nextIndent > kvIndent) {
          const sub = parseBlock(lines, i, nextIndent);
          result[key] = sub.value;
          i = sub.nextIdx;
        } else {
          result[key] = null;
        }
      } else {
        result[key] = null;
      }
    } else {
      result[key] = parseScalar(valRaw);
      i++;
    }
  }

  if (foundArray) return { value: arrayItems, nextIdx: i };
  return { value: result, nextIdx: i };
}

function parseFlowSequence(v) {
  const inner = v.slice(1, -1);
  return inner.split(", ").map(s => parseScalar(s.trim()));
}

function parseScalar(v) {
  if (v === "null") return null;
  if (v === "true") return true;
  if (v === "false") return false;
  if (v === "[]") return [];
  if (v.startsWith("[") && v.endsWith("]")) return parseFlowSequence(v);
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  if (/^-?\d+\.\d+$/.test(v)) return parseFloat(v);
  if (v.startsWith('"') && v.endsWith('"')) return v.slice(1, -1).replace(/\\"/g, '"');
  if (v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1);
  return v;
}

export function readYaml(filePath) {
  const content = fs.readFileSync(filePath, "utf8").replace(/\r\n?/g, "\n");
  return parseYaml(content);
}

export function patchYaml(filePath, patches) {
  const data = readYaml(filePath);
  for (const [key, value] of Object.entries(patches)) {
    data[key] = value;
  }
  writeYaml(filePath, data);
}

export function writeCodeTaskYaml(filePath, data) {
  writeYaml(filePath, {
    name: data.name,
    language: data.language || "unknown",
    status: data.status || "pending",
    diff: data.diff || "",
    review: data.review || { score: 0, summary: "", findings: [], positives: [] },
  });
}

export function writeStoryTaskYaml(filePath, data) {
  writeYaml(filePath, {
    name: data.name,
    status: data.status || "pending",
    description: data.description || "",
    acceptance: data.acceptance || "",
    files: data.files || [],
    review: data.review || { score: 0, summary: "", findings: [], gaps: [], positives: [] },
  });
}

export function writeProjectTaskYaml(filePath, data) {
  writeYaml(filePath, {
    name: data.name,
    status: data.status || "pending",
    type: data.type || "unknown",
    entry: data.entry || null,
    files: data.files || [],
    review: data.review || { score: 0, summary: "", findings: [], positives: [] },
  });
}

export function writeIndexYaml(filePath, data) {
  const session = {
    id: data.session.id,
    type: data.session.type,
    status: data.session.status || "created",
    scope: data.session.scope,
    created: data.session.created,
  };
  if (data.session.projectDir) session.projectDir = data.session.projectDir;
  writeYaml(filePath, {
    session,
    codeTasks: (data.codeTasks || data.tasks || []).map(t => ({ file: t.file, status: t.status })),
    storyTasks: (data.storyTasks || []).map(t => ({ file: t.file, status: t.status })),
    projectTasks: (data.projectTasks || []).map(t => {
      const entry = { file: t.file, status: t.status };
      if (t.type) entry.type = t.type;
      if (t.entry) entry.entry = t.entry;
      return entry;
    }),
  });
}
