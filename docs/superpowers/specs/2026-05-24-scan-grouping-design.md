# Project Scan Task Grouping Design

## Problem

Current scan creates one review task per entry point. When multiple entry points share the same service/dao layer (e.g., order create, query, cancel all use `order-service.js`), this causes:

1. **Redundant review** — shared service/dao files are read and reviewed independently by multiple sub-agents
2. **Lost context** — AI cannot analyze cross-endpoint interactions within the same business domain

## Solution

Insert an AI grouping step between call chain tracing and YAML generation. Structure tools ensure coverage (no entry points missed), AI ensures semantic accuracy (no incorrect merges).

## Flow

```
Entry point discovery (CodeGraph / regex)
  → Call chain tracing (CodeGraph / regex)
  → Shared dependency matrix (structured computation)
  → AI grouping (one AI call)
  → Generate YAML per group
```

### 1. Entry Point Discovery Improvement

**Priority**: CodeGraph framework-aware discovery first, regex `ENTRY_RULES` as fallback.

- **With CodeGraph**: Use `codegraph query --kind route` to discover route nodes, extract associated handler files as entry points
- **Without CodeGraph**: Keep current `ENTRY_RULES` regex matching (no change)

Entry point types unchanged: `api`, `scheduled`, `consumer`, `script`, `unknown`.

### 2. Shared Dependency Matrix

Pure structured computation, no AI.

**Input**: All entry points + their call chain file lists.

**Computation**:
- Build a dependency matrix: shared file count and ratio between any two entry points
- Identify service/dao files by path pattern (`service|dao|repository|model|entity`)
- Generate compact summary per entry point: `{path, functions[], services[], daos[], totalFiles}`

**Output**: Structured JSON for AI grouping input.

### 3. AI Grouping Step

**Trigger**: Only when entry point count > 1. Skipped for single entry point.

**Input**: Shared dependency matrix + compact entry point summaries (no source code).

**Prompt**:

```
你是一个代码分析助手。以下是项目的入口点及其依赖信息。
请将相关的入口点合并为审查任务组。

输入数据：
{共享依赖矩阵 + 各入口点紧凑摘要}

规则：
- 属于同一业务领域的入口点应合并（如：订单创建、查询、取消）
- 共享核心 service/dao 的入口点倾向合并
- 不相关的入口点保持独立
- 自行决定每组的大小，没有硬限制

输出格式（JSON）：
[{
  "name": "任务组名称（中文，体现业务领域）",
  "entries": ["入口点文件路径"],
  "reason": "合并原因（一句话）"
}]
```

**Output**: Grouping scheme as JSON array. Each group has a business-domain name, list of entry point paths, and a one-sentence reason.

### 4. Grouped YAML Generation

**Current**: One `project-tasks/<name>.yaml` per entry point.

**Improved**: One YAML per group.

```yaml
name: "订单管理"
type: api
entries:
  - "src/handlers/order-create.js"
  - "src/handlers/order-query.js"
  - "src/handlers/order-cancel.js"
entry: "src/handlers/order-create.js"
files:
  - "src/handlers/order-create.js"
  - "src/handlers/order-query.js"
  - "src/handlers/order-cancel.js"
  - "src/services/order-service.js"
  - "src/dao/order-dao.js"
  - "src/models/order.js"
```

- `entries` (new): all merged entry points
- `entry`: primary entry point (first or deepest call chain), compatible with existing `{{taskEntry}}` in review prompt
- `files`: deduplicated union of all call chain files
- `name`: business-domain name from AI grouping
- Ungrouped single-entry-point tasks keep original structure

### 5. Fallback and Compatibility

- **AI grouping failure** (timeout, format error): fall back to current behavior — one task per entry point, scan is not blocked
- **No CodeGraph**: entry discovery uses regex, call chain trace uses regex, AI grouping step unchanged
- **Single entry point**: skip dependency matrix and AI grouping, generate YAML directly
- **Existing review prompt**: `{{taskEntry}}` still points to primary entry, `{{taskFiles}}` includes all merged files — no prompt changes needed

## Files to Modify

| File | Change |
|------|--------|
| `skills/audit/scripts/lib/project-scan.mjs` | Add shared dependency matrix computation, AI grouping call, grouped YAML generation, CodeGraph entry point discovery |
| `skills/audit/prompts/project-scan-grouping.md` | New file — AI grouping prompt template |

## Files Unchanged

| File | Reason |
|------|--------|
| `skills/audit/prompts/project-review.md` | `{{taskEntry}}` and `{{taskFiles}}` still work with grouped YAML |
| `skills/audit/scripts/lib/session.mjs` | Task listing and progress aggregation unchanged |
| `skills/audit/scripts/lib/task.mjs` | Task CRUD and review submission unchanged |
| Frontend components | Task list and detail views render grouped tasks the same way |
