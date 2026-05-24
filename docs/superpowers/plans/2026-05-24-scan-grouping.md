# Scan Task Grouping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add AI-based entry point grouping to project scan, so related endpoints sharing the same service/dao layer are reviewed together instead of independently.

**Architecture:** Insert three new steps into the existing `scanProject()` flow after call chain tracing: (1) compute a shared dependency matrix from entry point call chains, (2) call an AI model with compact summaries to produce a grouping scheme, (3) generate task YAMLs per group instead of per entry point. CodeGraph entry point discovery is also added as an improvement. Fallback to current behavior if AI grouping fails.

**Tech Stack:** Node.js ESM, CodeGraph CLI (optional), Anthropic API for grouping AI call.

---

## File Structure

| File | Responsibility |
|------|---------------|
| `skills/audit/scripts/lib/project-scan.mjs` | Existing scan engine — add CodeGraph entry discovery, dependency matrix, AI grouping, grouped YAML generation |
| `skills/audit/prompts/project-scan-grouping.md` | New file — AI grouping prompt template |

No other files need modification. The `entries` field in task YAML is additive — existing code reading `entry` and `files` continues to work.

---

### Task 1: Create the AI grouping prompt template

**Files:**
- Create: `skills/audit/prompts/project-scan-grouping.md`

- [ ] **Step 1: Create the prompt template file**

Write the prompt that will be sent to the AI for grouping. This prompt takes structured dependency data and returns a JSON grouping scheme.

```markdown
你是一个代码分析助手。以下是项目的入口点及其依赖信息。
请将相关的入口点合并为审查任务组。

## 输入数据

### 入口点摘要

{{entrySummaries}}

### 共享依赖矩阵

{{dependencyMatrix}}

## 规则

- 属于同一业务领域的入口点应合并（如：订单创建、查询、取消都属于"订单管理"）
- 共享核心 service/dao 的入口点倾向合并
- 不相关的入口点保持独立
- 自行决定每组的大小，没有硬限制
- 必须覆盖所有入口点，不能遗漏

## 输出格式

严格输出 JSON 数组，不要包含其他内容：

[{
  "name": "任务组名称（中文，体现业务领域）",
  "entries": ["入口点文件路径1", "入口点文件路径2"],
  "reason": "合并原因（一句话）"
}]
```

- [ ] **Step 2: Commit**

```bash
git add skills/audit/prompts/project-scan-grouping.md
git commit -m "feat: add AI grouping prompt template for project scan"
```

---

### Task 2: Add dependency matrix computation

**Files:**
- Modify: `skills/audit/scripts/lib/project-scan.mjs`

This adds the `computeDependencyMatrix()` function. It takes the entry points and their traced call chains, and outputs structured data for the AI grouping step.

- [ ] **Step 1: Add `SERVICE_PATTERNS` constant and `classifyFile()` helper**

Add these after the `ENTRY_RULES` constant (line 13):

```javascript
const SERVICE_PATTERNS = /service|dao|repository|model|entity/i;

function classifyFile(filePath) {
  if (SERVICE_PATTERNS.test(filePath)) {
    if (/service/i.test(filePath)) return "service";
    if (/dao|repository/i.test(filePath)) return "dao";
    if (/model|entity/i.test(filePath)) return "model";
  }
  return "other";
}
```

- [ ] **Step 2: Add `computeDependencyMatrix()` function**

Add after the `generateMermaidSource()` function (after line 155):

```javascript
function computeDependencyMatrix(entryChains) {
  // entryChains: Map<entryPath, { type, files: string[] }>
  const entries = Array.from(entryChains.entries());

  // Classify files per entry
  const summaries = entries.map(([entryPath, info]) => {
    const services = [];
    const daos = [];
    const otherFiles = [];
    for (const f of info.files) {
      const cls = classifyFile(f);
      if (cls === "service") services.push(f);
      else if (cls === "dao") daos.push(f);
      else if (f !== entryPath) otherFiles.push(f);
    }
    return {
      path: entryPath,
      type: info.type,
      services,
      daos,
      totalFiles: info.files.length,
      mainFiles: otherFiles.slice(0, 5),
    };
  });

  // Build shared dependency pairs
  const pairs = [];
  for (let i = 0; i < summaries.length; i++) {
    for (let j = i + 1; j < summaries.length; j++) {
      const a = new Set(entries[i][1].files);
      const b = new Set(entries[j][1].files);
      const shared = [...a].filter(f => b.has(f));
      if (shared.length > 0) {
        const sharedServices = shared.filter(f => /service/i.test(f));
        const sharedDaos = shared.filter(f => /dao|repository/i.test(f));
        const ratio = shared.length / Math.min(a.size, b.size);
        pairs.push({
          entryA: summaries[i].path,
          entryB: summaries[j].path,
          sharedCount: shared.length,
          sharedRatio: Math.round(ratio * 100) / 100,
          sharedServices,
          sharedDaos,
          sharedOther: shared.filter(f =>
            !/service|dao|repository/i.test(f)
          ),
        });
      }
    }
  }

  return { summaries, pairs };
}
```

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/lib/project-scan.mjs
git commit -m "feat: add dependency matrix computation for scan grouping"
```

---

### Task 3: Add CodeGraph entry point discovery

**Files:**
- Modify: `skills/audit/scripts/lib/project-scan.mjs`

This adds a `discoverEntriesCodeGraph()` function that uses CodeGraph's framework-aware route detection instead of regex, when CodeGraph is available.

- [ ] **Step 1: Add `discoverEntriesCodeGraph()` function**

Add before the `scanProject()` function (before line 157):

```javascript
function discoverEntriesCodeGraph(projectDir) {
  const entries = new Map();
  try {
    // Use CodeGraph to find route/handler symbols
    const result = execSync(
      'codegraph query "" --kind route --json --limit 500',
      { cwd: projectDir, timeout: 30000, encoding: "utf-8" }
    );
    const data = JSON.parse(result);

    // CodeGraph query returns symbols array
    const symbols = Array.isArray(data) ? data : (data.symbols || []);
    for (const sym of symbols) {
      if (sym.file) {
        const relPath = path.relative(projectDir, sym.file);
        entries.set(relPath, { type: "api", entry: relPath });
      }
    }
  } catch (e) {
    console.log("[scan] CodeGraph entry discovery failed: " + e.message);
  }

  // Also check for cron/job/consumer/script entries via CodeGraph query
  const extraTypes = [
    { kind: "function", patterns: /cron|job|schedule|worker|consumer|subscribe/i, type: "scheduled" },
    { kind: "function", patterns: /consumer|subscribe|worker|queue|listen/i, type: "consumer" },
  ];
  for (const { kind, patterns, type } of extraTypes) {
    try {
      const result = execSync(
        `codegraph query "" --kind ${kind} --json --limit 500`,
        { cwd: projectDir, timeout: 30000, encoding: "utf-8" }
      );
      const data = JSON.parse(result);
      const symbols = Array.isArray(data) ? data : (data.symbols || []);
      for (const sym of symbols) {
        if (sym.file && patterns.test(sym.name || sym.file)) {
          const relPath = path.relative(projectDir, sym.file);
          if (!entries.has(relPath)) {
            entries.set(relPath, { type, entry: relPath });
          }
        }
      }
    } catch {
      // Silently skip — these are best-effort
    }
  }

  return entries;
}
```

- [ ] **Step 2: Integrate CodeGraph entry discovery into `scanProject()`**

Replace the entry discovery block in `scanProject()` (lines 178-191). Change this code:

```javascript
  const entries = new Map();

  for (const file of allFiles) {
    const type = identifyEntryType(file);
    if (type !== "unknown") {
      entries.set(file, { type, entry: file });
    }
  }

  for (const bin of detectBinEntries(projectDir)) {
    if (!entries.has(bin)) {
      entries.set(bin, { type: "script", entry: bin });
    }
  }
```

To:

```javascript
  const entries = new Map();

  if (codegraph.available) {
    const cgEntries = discoverEntriesCodeGraph(projectDir);
    for (const [entryPath, info] of cgEntries) {
      entries.set(entryPath, info);
    }
    console.log("[scan] CodeGraph discovered " + entries.size + " entry points");
  }

  // Regex fallback — always run to catch entries CodeGraph missed
  for (const file of allFiles) {
    const type = identifyEntryType(file);
    if (type !== "unknown" && !entries.has(file)) {
      entries.set(file, { type, entry: file });
    }
  }

  for (const bin of detectBinEntries(projectDir)) {
    if (!entries.has(bin)) {
      entries.set(bin, { type: "script", entry: bin });
    }
  }
```

- [ ] **Step 3: Commit**

```bash
git add skills/audit/scripts/lib/project-scan.mjs
git commit -m "feat: add CodeGraph-based entry point discovery"
```

---

### Task 4: Add AI grouping call

**Files:**
- Modify: `skills/audit/scripts/lib/project-scan.mjs`
- Read: `skills/audit/prompts/project-scan-grouping.md` (created in Task 1)

This adds the `aiGroupEntries()` function that reads the grouping prompt template, fills in dependency data, calls the Anthropic API, and parses the JSON grouping result.

- [ ] **Step 1: Add imports for AI call**

Add at the top of `project-scan.mjs`, after the existing imports (line 6):

```javascript
import https from "node:https";
import { fileURLToPath } from "node:url";
```

Add after the imports block:

```javascript
const __dirname = path.dirname(fileURLToPath(import.meta.url));
```

- [ ] **Step 2: Add `callAnthropicAPI()` helper**

Add after the `__dirname` line:

```javascript
function callAnthropicAPI(systemPrompt, userMessage) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const body = JSON.stringify({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Length": Buffer.byteLength(body),
      },
      timeout: 60000,
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        if (res.statusCode !== 200) {
          reject(new Error("Anthropic API " + res.statusCode + ": " + data));
          return;
        }
        try {
          const json = JSON.parse(data);
          const text = json.content?.[0]?.text || "";
          resolve(text);
        } catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Anthropic API timeout")); });
    req.write(body);
    req.end();
  });
}
```

- [ ] **Step 3: Add `aiGroupEntries()` function**

Add after `callAnthropicAPI()`:

```javascript
async function aiGroupEntries(matrix) {
  const promptPath = path.join(__dirname, "..", "..", "prompts", "project-scan-grouping.md");
  const promptTemplate = fs.readFileSync(promptPath, "utf-8");

  const entrySummaries = matrix.summaries.map(s =>
    `- ${s.path} (type: ${s.type}, files: ${s.totalFiles}, services: [${s.services.join(", ")}], daos: [${s.daos.join(", ")}])`
  ).join("\n");

  const depPairs = matrix.pairs.map(p =>
    `- ${p.entryA} <-> ${p.entryB}: shared ${p.sharedCount} files (${Math.round(p.sharedRatio * 100)}%), services: [${p.sharedServices.join(", ")}], daos: [${p.sharedDaos.join(", ")}]`
  ).join("\n");

  const userMessage = promptTemplate
    .replace("{{entrySummaries}}", entrySummaries)
    .replace("{{dependencyMatrix}}", depPairs || "（无共享依赖）");

  const response = await callAnthropicAPI(
    "你是一个代码分析助手，负责将项目入口点按业务领域分组。只输出 JSON。",
    userMessage
  );

  // Extract JSON from response (handle markdown code blocks)
  const jsonMatch = response.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error("AI response contains no JSON array");

  const groups = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(groups) || groups.length === 0) {
    throw new Error("AI returned invalid grouping");
  }

  return groups;
}
```

- [ ] **Step 4: Commit**

```bash
git add skills/audit/scripts/lib/project-scan.mjs
git commit -m "feat: add AI grouping call for scan entry points"
```

---

### Task 5: Rewrite `scanProject()` to use grouped YAML generation

**Files:**
- Modify: `skills/audit/scripts/lib/project-scan.mjs`

This is the main integration step. The `scanProject()` function becomes async and adds the dependency matrix → AI grouping → grouped YAML generation flow.

- [ ] **Step 1: Change `scanProject` to `async` and add grouping flow**

Replace the entire `scanProject` function (lines 157-255) with:

```javascript
export async function scanProject(projectDir, reportsDir, sid) {
  const safeSid = sanitizePath(sid);
  const sessionDir = path.join(reportsDir, safeSid);
  const indexPath = path.join(sessionDir, "index.yaml");
  if (!fs.existsSync(indexPath)) throw new Error("Session not found: " + safeSid);

  const codegraph = detectCodeGraph();

  if (codegraph.available) {
    try {
      execSync("codegraph init -i", { cwd: projectDir, timeout: 10000, stdio: "pipe" });
      execSync("codegraph index", { cwd: projectDir, timeout: 120000, stdio: "pipe" });
    } catch (e) {
      console.log("[scan] CodeGraph indexing failed, falling back: " + e.message);
      codegraph.available = false;
    }
  }

  const allFiles = collectFiles(projectDir);
  console.log("[scan] Found " + allFiles.length + " source files");

  const entries = new Map();

  if (codegraph.available) {
    const cgEntries = discoverEntriesCodeGraph(projectDir);
    for (const [entryPath, info] of cgEntries) {
      entries.set(entryPath, info);
    }
    console.log("[scan] CodeGraph discovered " + entries.size + " entry points");
  }

  // Regex fallback — always run to catch entries CodeGraph missed
  for (const file of allFiles) {
    const type = identifyEntryType(file);
    if (type !== "unknown" && !entries.has(file)) {
      entries.set(file, { type, entry: file });
    }
  }

  for (const bin of detectBinEntries(projectDir)) {
    if (!entries.has(bin)) {
      entries.set(bin, { type: "script", entry: bin });
    }
  }

  const entryFiles = new Set(entries.keys());
  const assignedFiles = new Set();

  const tasksDir = path.join(sessionDir, "project-tasks");
  fs.mkdirSync(tasksDir, { recursive: true });

  // Trace call chains for all entries
  const entryChains = new Map();
  for (const [entryFile, info] of entries) {
    let files;
    if (codegraph.available) {
      files = traceCallChainCodeGraph(entryFile, projectDir);
      if (!files) files = traceCallChainHeuristic(entryFile, projectDir, allFiles);
    } else {
      files = traceCallChainHeuristic(entryFile, projectDir, allFiles);
    }
    if (!files || files.length === 0) files = [entryFile];
    entryChains.set(entryFile, { type: info.type, files });
    for (const f of files) assignedFiles.add(f);
  }

  // AI grouping (only when multiple entry points)
  let groups = null;
  if (entryChains.size > 1) {
    console.log("[scan] Computing dependency matrix for " + entryChains.size + " entry points");
    const matrix = computeDependencyMatrix(entryChains);

    if (matrix.pairs.length > 0) {
      console.log("[scan] Found " + matrix.pairs.length + " shared dependency pairs, calling AI grouping");
      try {
        groups = await aiGroupEntries(matrix);
        console.log("[scan] AI grouped into " + groups.length + " task groups");
      } catch (e) {
        console.log("[scan] AI grouping failed, falling back to per-entry tasks: " + e.message);
        groups = null;
      }
    }
  }

  const projectTasks = [];

  if (groups) {
    // Generate YAML per group
    for (const group of groups) {
      const groupFiles = new Set();
      let groupType = "api";

      for (const entryPath of group.entries) {
        const chain = entryChains.get(entryPath);
        if (chain) {
          for (const f of chain.files) groupFiles.add(f);
          groupType = chain.type;
        }
      }

      const filesArr = [...groupFiles];
      const primaryEntry = group.entries[0];
      const name = group.name.replace(/[^a-zA-Z0-9_一-鿿-]/g, "-");
      const taskFile = "project-tasks/" + name.replace(/[^a-zA-Z0-9_-]/g, "-") + ".yaml";
      const callChain = generateMermaidSource(primaryEntry, filesArr);

      writeYaml(path.join(sessionDir, taskFile), {
        name: group.name,
        type: groupType,
        entries: group.entries,
        entry: primaryEntry,
        files: filesArr,
        status: "pending",
        _callChain: callChain,
        overview: { diagram: "", description: "" },
        review: { score: 0, summary: "", findings: [], positives: [], gaps: [] },
      });

      projectTasks.push({ file: taskFile, type: groupType, entry: primaryEntry, status: "pending" });
    }
  } else {
    // Fallback: one task per entry point (original behavior)
    for (const [entryFile, info] of entryChains) {
      const files = info.files;
      const name = path.basename(entryFile, path.extname(entryFile));
      const taskFile = "project-tasks/" + name.replace(/[^a-zA-Z0-9_-]/g, "-") + ".yaml";
      const callChain = generateMermaidSource(entryFile, files);

      writeYaml(path.join(sessionDir, taskFile), {
        name,
        type: info.type,
        entry: entryFile,
        files,
        status: "pending",
        _callChain: callChain,
        overview: { diagram: "", description: "" },
        review: { score: 0, summary: "", findings: [], positives: [], gaps: [] },
      });

      projectTasks.push({ file: taskFile, type: info.type, entry: entryFile, status: "pending" });
    }
  }

  // Handle unassigned files
  const orphans = allFiles.filter(f => !assignedFiles.has(f) && !entryFiles.has(f));
  if (orphans.length > 0) {
    const taskFile = "project-tasks/_unassigned.yaml";
    writeYaml(path.join(sessionDir, taskFile), {
      name: "unassigned-files",
      type: "unknown",
      entry: "",
      files: orphans,
      status: "pending",
      _callChain: "",
      overview: { diagram: "", description: "" },
      review: { score: 0, summary: "", findings: [], positives: [], gaps: [] },
    });
    projectTasks.push({ file: taskFile, type: "unknown", entry: "", status: "pending" });
  }

  const index = readYaml(indexPath);
  index.projectTasks = projectTasks;
  index.session.status = "ready";
  writeIndexYaml(indexPath, index);

  console.log("[scan] Discovered " + projectTasks.length + " tasks (" + entryChains.size + " entry points), " + orphans.length + " unassigned files");
  return { tasksFound: projectTasks.length, codegraphUsed: codegraph.available, orphans: orphans.length, groupingUsed: !!groups };
}
```

- [ ] **Step 2: Commit**

```bash
git add skills/audit/scripts/lib/project-scan.mjs
git commit -m "feat: integrate AI grouping into scanProject flow"
```

---

### Task 6: Update handler for async `scanProject`

**Files:**
- Modify: `skills/audit/scripts/server/handlers/project-scan.mjs`

The `scanProject()` function is now async, so the handler needs to `await` it.

- [ ] **Step 1: Update the scan handler to await `scanProject()`**

In `skills/audit/scripts/server/handlers/project-scan.mjs`, the handler on line 37 already uses `async` but calls `scanProject` synchronously. Change line 37:

```javascript
      result = scanProject(targetDir, reportsDir, safeSid);
```

To:

```javascript
      result = await scanProject(targetDir, reportsDir, safeSid);
```

- [ ] **Step 2: Commit**

```bash
git add skills/audit/scripts/server/handlers/project-scan.mjs
git commit -m "fix: await async scanProject in handler"
```

---

### Task 7: Verify and clean up

**Files:**
- Read: `skills/audit/scripts/lib/project-scan.mjs` (full review)

- [ ] **Step 1: Read the final `project-scan.mjs` and verify**

Read the entire file. Check:
- All imports are present (`https`, `fileURLToPath`, `__dirname`)
- No duplicate function definitions
- `scanProject` is exported as `async function`
- Fallback path works when AI grouping fails
- Single entry point skips AI grouping entirely
- `entries` field is written to grouped task YAMLs

- [ ] **Step 2: Run a syntax check**

```bash
node --check skills/audit/scripts/lib/project-scan.mjs
node --check skills/audit/scripts/server/handlers/project-scan.mjs
```

Expected: No output (no syntax errors).

- [ ] **Step 3: Commit any fixes**

If the syntax check or review found issues, fix them and commit:

```bash
git add -u
git commit -m "fix: address issues found during verification"
```
