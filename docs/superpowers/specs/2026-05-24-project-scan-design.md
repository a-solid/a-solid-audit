# Project Scan — 项目级安全与业务逻辑扫描（Redesign）

> 覆盖 2026-05-24 旧版设计文档。旧版保留在 git 历史中供参考。

## 概述

在 A-Solid Audit 系统中新增 `project` 审计类型。从项目入口出发，利用 CodeGraph（可选）进行 AST 级调用链追踪，对每个入口的完整调用链做深度安全与业务逻辑审查。

**核心简化**：旧版三阶段模型（知识生成 → 逐入口审查 → 横向关联审查）改为两阶段模型（Scan → Review），移除独立的知识生成和横向审查子代理，将共享上下文注入各任务的审查提示中。

## 1. 架构：两阶段模型

### 状态机

```
created → scanning → ready → reviewing → completed
```

| From | To | Trigger |
|------|----|---------|
| created | scanning | 用户点击 "Start Scan" |
| scanning | ready | 扫描完成，入口已发现 |
| ready | reviewing | 第一个 task 审查开始 |
| reviewing | completed | 所有 task 审查完成 |

`resetReviewing()` 支持 `reviewing → ready` 恢复路径。

### 阶段 1: Scan（扫描）

服务器端执行，无需 AI 介入：

1. **CodeGraph 索引**（可选）：`codegraph init -i && codegraph index`
2. **入口发现**：框架路由检测 + 启发式路径匹配
3. **调用链追踪**：CodeGraph `callees` 或正则 import 解析
4. **覆盖率分析**：CodeGraph `impact` 检测孤立文件
5. **Task 生成**：每个入口生成一个 project-task YAML

### 阶段 2: Review（审查）

AI sub-agent 逐任务审查：

1. 读取任务关联的所有源文件
2. 接收预生成的调用链信息和共享上下文
3. 执行安全、业务逻辑、错误处理审查
4. 生成 `overview`（Mermaid 图 + 描述）和 `review`（评分、发现、亮点、缺口）
5. POST 结果回 API

### 共享上下文注入

替代独立的横向审查阶段。扫描阶段一次性提取：

- 认证模式（如 "项目使用 JWT bearer token 认证"）
- 数据库访问模式（如 "所有数据库访问通过 `lib/database.mjs`"）
- 共享工具函数

作为头部块注入每个 sub-agent 的审查提示中。

## 2. CodeGraph CLI 集成

### 概述

CodeGraph 是可选的 AST 级代码分析工具，提供精确的调用链追踪。未安装时回退到启发式规则。

### 扫描集成

| 步骤 | CodeGraph 可用 | CodeGraph 不可用 |
|------|---------------|-----------------|
| 项目结构 | `codegraph files --json` | `fs.readdir` 递归扫描 |
| 入口发现 | 框架路由检测 + `callers` | 启发式路径匹配 |
| 调用链追踪 | `codegraph callees <file> --depth 5 --json` | 正则匹配 `import/require`（1 层）|
| 覆盖率 | `codegraph impact <file> --json` | 无覆盖率检查 |

### 检测逻辑

```javascript
async function detectCodeGraph() {
  try {
    const version = execSync("codegraph --version", { timeout: 5000 }).toString().trim();
    return { available: true, version };
  } catch {
    return { available: false };
  }
}
```

### 入口发现详细流程

1. **API 入口**：
   - CodeGraph 检测 Express/Koa/Fastify 等框架路由
   - 启发式回退：匹配 `handler|controller|route|api|endpoint` 路径关键词

2. **定时任务入口**：
   - 匹配 `cron|job|scheduler|task` 路径/文件名关键词

3. **消费者入口**：
   - 匹配 `consumer|subscriber|worker|queue|listener` 路径/文件名关键词

4. **脚本入口**：
   - 匹配 `script|bin|cli|migration` 路径/文件名关键词
   - 检查 `package.json` 的 `bin` 字段

5. **未知文件**：
   - 不匹配以上任何模式的文件归入 `unknown` 类型

### 调用链追踪

CodeGraph 可用时：

```
codegraph callees <entry-file> --depth 5 --json
```

输出每个入口的完整调用树，用于填充 `files[]` 列表。

仅启发式时：正则匹配 `import X from './xxx'`、`require('./xxx')`，只追踪相对路径，一层深度。

### 覆盖率分析

CodeGraph 可用时，使用 `impact` 检测未被任何入口覆盖的孤立文件，归入 `unknown` 类型任务。

### 日志

```
[scan] CodeGraph v0.x.x detected — using AST-level analysis
```

或

```
[scan] CodeGraph not found — using heuristic fallback
```

## 3. 数据模型

### index.yaml

```yaml
session:
  id: "abc123"
  type: "project"                    # "code" | "story" | "project"
  status: "scanning"                 # created | scanning | ready | reviewing | completed
  projectDir: "/path/to/project"     # project 类型专用，替代 scope
  created: "2026-05-24T10:00:00Z"

codeTasks: []                        # 不变
storyTasks: []                       # 不变
projectTasks:                        # 必须在 writeIndexYaml 中正确写入
  - file: "project-tasks/user-management.yaml"
    type: api
    entry: "scripts/server/handlers/users.mjs"
    status: pending
```

### Project Task YAML

```yaml
name: "user-management"
type: api                              # api | scheduled | consumer | script | unknown
entry: "scripts/server/handlers/users.mjs"
files:
  - "scripts/server/handlers/users.mjs"
  - "scripts/lib/user-service.mjs"
  - "scripts/lib/database.mjs"
status: pending                        # pending | reviewing | reviewed
_callChain: "graph TD\n  A[users.mjs] --> B[user-service.mjs]"  # 内部数据，审查后删除
overview:                              # 审查阶段填充
  diagram: ""
  description: ""
review:
  score: 0
  summary: ""
  findings: []
  positives: []
  gaps: []
```

### 目录结构

```
reports/<session-id>/
  index.yaml
  code-tasks/
  story-tasks/
  project-tasks/                       # 新增
    user-management.yaml
    order-processing.yaml
    ...
```

### 关键 Bug 修复

以下现有 bug 必须修复：

1. **`writeIndexYaml()`**：必须写入 `projectTasks`，当前静默丢弃
2. **`listSessions()` / `getSession()`**：必须聚合三个 task 数组，当前显示 0/0
3. **`initSession()`**：必须创建 `project-tasks/` 目录
4. **`createSession()`**：必须接受 `type` 参数，当前硬编码 `"code"`
5. **`resetReviewing()`**：必须迭代 `["codeTasks", "storyTasks", "projectTasks"]`

### 向后兼容

- `projectTasks` 默认 `[]`，旧 session 不受影响
- `session.type` 默认 `"code"`，旧 session 继续工作
- `projectDir` 仅 project 类型使用

## 4. Sub-agent 编排协议

### 审查触发

Session 状态为 `ready` 时，前端展示 task 列表。每个 task 独立审查。

### Sub-agent 输入

1. **任务 YAML**：files 列表、type、entry
2. **源文件内容**：所有 `files[]` 条目的完整源码
3. **调用链信息**：`_callChain` 中的 Mermaid 源码（扫描阶段预生成）
4. **共享上下文头部块**：认证模式、数据库访问模式、共享工具函数

### Sub-agent 输出

```json
{
  "status": "reviewed",
  "score": 7,
  "review": {
    "summary": "...",
    "findings": [],
    "positives": [],
    "gaps": []
  },
  "overview": {
    "diagram": "graph TD\n  A --> B",
    "description": "HTTP API 入口，接收用户请求..."
  }
}
```

### 服务端处理

1. 验证状态转换（pending → reviewed）
2. 写入 review + overview 到 task YAML
3. 移除 `_callChain` 内部字段
4. 更新 `index.yaml` — 所有 task reviewed 则设 `completed`

### 并发

每个 task 是独立 YAML 文件，理论上可并行审查。但 sub-agent 串行执行更简单可靠，作为默认行为。

### 错误处理

| 场景 | 行为 |
|------|------|
| Sub-agent 中途崩溃 | Task 保持 pending，可重试 |
| Review 提交失败 | 重试一次，然后告警 |
| 源文件读取失败 | Sub-agent 在 findings 中报告，继续审查可读文件 |
| CodeGraph 未安装 | 使用启发式回退，不报错 |

## 5. API 端点

### 新增端点

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/sessions/:id/scan` | 启动扫描（CodeGraph 索引 + 入口发现）|
| GET | `/api/sessions/:id/scan/status` | 轮询扫描进度 |

### 修改端点

| Method | Path | 变更 |
|--------|------|------|
| POST | `/api/sessions` | 接受 `type`（`code`/`story`/`project`）和 `projectDir` |
| GET | `/api/sessions/:id` | 包含 `projectTasks` 进度 |

### 不变端点

| Method | Path | 说明 |
|--------|------|------|
| POST | `/api/sessions/:id/tasks/:file/review` | 已支持 `overview`，无需修改 |

### Scan 端点详情

```
POST /api/sessions/:id/scan
Response: { ok: true, tasksFound: 12, codegraphUsed: true }
```

扫描异步执行：
1. 设置 session status 为 `scanning`
2. 运行 CodeGraph 索引（或启发式回退）
3. 发现入口，追踪调用链
4. 在 `project-tasks/` 创建 task YAML 文件
5. 更新 `index.yaml` 的 `projectTasks`
6. 设置 session status 为 `ready`

客户端轮询 `GET /api/sessions/:id/scan/status` 获取进度。

## 6. 前端变更

### Review 视图 — Scan 按钮

project 类型 session 在 `created` 状态显示 "Start Scan" 按钮。点击触发 `POST /api/sessions/:id/scan`，轮询完成。

### Review 视图 — Task 列表

在 progress 视图中，task name 旁显示入口类型图标：

```
[API]  user-management     7/10  reviewed
[Cron] daily-cleanup       -     pending
[Consumer] order-processor -     pending
```

### Task Detail（已实现）

当前 `task-detail.mjs` 已正确渲染：
- 入口类型 badge（颜色对应 `ENTRY_TYPES`）
- Mermaid 图表（`encodeURIComponent`/`decodeURIComponent`）
- 描述文本

无需修改。

### Summary / Overview

不变。

## 7. CodeGraph 安装

### 自动安装脚本

提供 `scripts/setup-codegraph.sh`：

```bash
#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${HOME}/.local/share/codegraph"
echo "==> Installing CodeGraph..."

git clone https://github.com/colbymchenry/codegraph.git "$INSTALL_DIR"
cd "$INSTALL_DIR"
npm install && npm run build

# Link binary to user's PATH
mkdir -p "${HOME}/.local/bin"
ln -sf "$INSTALL_DIR/bin/codegraph" "${HOME}/.local/bin/codegraph"

if command -v codegraph &>/dev/null; then
  echo "==> CodeGraph installed: $(codegraph --version)"
else
  echo "==> Add ${HOME}/.local/bin to your PATH"
fi
```

### 手动安装

```bash
git clone https://github.com/colbymchenry/codegraph.git
cd codegraph
npm install && npm run build
npm link
codegraph --version
```

### 可选性

CodeGraph 是可选依赖。未安装时 project scan 使用启发式规则工作，仅调用链追踪精度较低。

## 8. 文件影响范围

### 新增文件

- `skills/audit/scripts/lib/project-scan.mjs` — 扫描逻辑（CodeGraph CLI + 启发式回退）
- `skills/audit/scripts/server/handlers/project-scan.mjs` — scan API handler
- `skills/audit/prompts/project-review.md` — 项目审查 AI prompt 模板
- `scripts/setup-codegraph.sh` — CodeGraph 安装脚本

### 修改文件

- `skills/audit/scripts/lib/session.mjs` — 5 个 bug 修复（listSessions、getSession、initSession、createSession、resetReviewing）
- `skills/audit/scripts/lib/yaml.mjs` — `writeIndexYaml()` 写入 projectTasks
- `skills/audit/scripts/lib/task.mjs` — getTasks/getTask/updateTask 已支持 projectTasks
- `skills/audit/scripts/server/handlers/reviews.mjs` — 已支持 overview
- `skills/audit/scripts/server/router.mjs` — 注册 scan 路由
- `skills/audit/scripts/public/js/views/progress.mjs` — 入口类型图标
- `skills/audit/scripts/public/styles.css` — scan 按钮和进度样式

### 不变文件

- `skills/audit/scripts/public/js/components/task-detail.mjs` — 已完整实现
- `skills/audit/scripts/public/js/constants.mjs` — 已包含 ENTRY_TYPES
- `skills/audit/SKILL.md` — 后续实现时更新

### 删除文件（旧设计引用）

- `skills/audit/prompts/cross-cutting-review.md` — 不再需要，横向审查已移除
- `skills/audit/scripts/public/js/components/entry-tree.mjs` — 简化后无需入口选择树
- `skills/audit/scripts/public/js/views/wizard-project-scan.mjs` — 简化为 scan 按钮，不需要独立 wizard
