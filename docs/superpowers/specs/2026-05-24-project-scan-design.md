# Project Scan — 项目级安全与业务逻辑扫描

## 概述

在现有 A-Solid Audit 系统中新增 `project-scan` 审计类型，对整个项目进行安全、业务逻辑、代码质量的全量扫描。区别于现有的基于 git diff 的逐文件审查，project-scan 从项目入口出发，追踪完整调用链，进行深度业务逻辑审查。

## 1. Session 类型扩展

### 新增类型

```
Session types: code | all | project-scan
```

### 状态机

保持不变：`created -> scoped -> ready -> reviewing -> completed`

`scoped` 阶段行为差异：
- `code`/`all`：基于 git diff 生成 task
- `project-scan`：基于项目目录结构 + 入口识别生成 task

### 数据模型变更

**`index.yaml` 新增字段**：
```yaml
session:
  id: "..."
  type: project-scan
  status: "..."
  projectDir: "/path/to/project"  # 外部项目路径，为空则用当前仓库
  created: "..."
projectTasks:
  - file: "project-tasks/<entry-name>.yaml"
    status: pending | reviewing | reviewed
```

**新增目录**：`project-tasks/` 存放项目扫描 task YAML

### Project Task YAML 结构

```yaml
name: "POST /api/users/create"
type: api | scheduled | consumer | script
entry: "scripts/server/handlers/users.mjs"
files:
  - "scripts/server/handlers/users.mjs"
  - "scripts/lib/user-service.mjs"
  - "scripts/lib/db.mjs"
status: pending | reviewing | reviewed
review:
  score: 0-10
  summary: "..."
  findings:
    - severity: critical | major | minor | info
      category: security | bug | logic | performance | best-practice
      description: "..."
      file: "path"
      line: 42
      code: "snippet"
      suggestion: "fix"
  positives: ["..."]
```

与 code-task 相比，新增 `type`（入口类型）、`entry`（入口文件）、`files`（调用链文件列表）和 `category`（发现分类）。

### Review Context 扩展

`review-context.md` 新增 `## Project Knowledge` 部分：

```markdown
## User Context
<用户提供的项目背景>

## Project Knowledge
<!-- AI 自动生成并持续补充 -->
- **技术栈**: ...
- **架构模式**: ...
- **关键模块**: ...
- **数据流概览**: ...

## Review Notes
<!-- Subagent 交叉引用笔记 -->
```

## 2. 扫描流程 — 入口识别与 Task 拆分

### 整体流程

入口驱动的 task 拆分方案。从各种调用入口串联所有被引用的类和代码，形成一个 task。

**步骤**：

1. **目录结构扫描**：读取项目目录树，识别后端/数据库/脚本文件，排除噪音目录（node_modules, .git, dist, build, vendor, __pycache__ 等）
2. **入口识别**：AI agent 分析项目结构，识别所有调用入口：
   - API 路由（HTTP endpoints）
   - 定时任务 / Cron jobs
   - 消息队列消费者
   - 脚本入口（CLI commands, main 函数）
   - 数据库触发器 / 存储过程
3. **调用链追踪**：对每个入口，沿 import/require/调用关系追踪所有涉及的文件
4. **Task 生成**：每个入口 + 其调用链文件组合 = 一个 project-task
5. **覆盖率报告**：识别未被任何 task 覆盖的文件，作为"未覆盖文件"列出

**关键决策**：
- 入口识别和调用链追踪由 AI agent 在 `setScope` 阶段执行（需要代码语义理解）
- Task 拆分结果写入 `project-tasks/` 目录
- 大项目（>50 个入口）支持用户在 UI 上选择要扫描的入口范围

### Wizard 步骤（project-scan 专用）

| 步骤 | 内容 |
|------|------|
| 1. 选择类型 | 选择 `project-scan` |
| 2. 选择项目 | 当前仓库 或 输入外部目录路径 |
| 3. 提供背景 | 文本输入 + URL 输入（AI 抓取内容，可选） |
| 4. 确认范围 | 展示识别出的入口列表 + 未覆盖文件，用户可排除 |
| 5. 启动扫描 | 进入 reviewing 状态 |

## 3. AI 审查流程与 Subagent 编排

### 阶段 1：项目知识生成

一个专用 subagent：
- 读取项目背景信息和目录结构
- 生成项目知识摘要写入 `review-context.md` 的 `## Project Knowledge` 部分
- 内容：技术栈、架构模式、关键模块、数据流概览、已知风险点

### 阶段 2：逐入口深度审查

对每个 `project-task`，dispatch 一个 subagent：
- 读取 `review-context.md`（项目知识 + 用户背景）
- 读取 task 关联的所有源文件（完整源码，不仅是 diff）
- 按需调用数据库 skill 获取存储过程定义
- 审查维度：安全漏洞、业务逻辑 Bug、性能问题、异常处理、数据一致性
- 结果 POST 回 API
- 补充 `review-context.md` 的 Review Notes 和 Project Knowledge

### 阶段 3：横向关联审查

所有入口审查完成后，一个汇总 subagent：
- 读取所有 task 审查结果
- 识别入口间关联关系（共享数据、调用依赖、状态流转）
- 发现跨入口业务逻辑问题（数据不一致、缺失校验、竞态条件）
- 生成 `cross-cutting-review.yaml` 作为特殊 project-task

### 与现有流程的关系

- 审查结果通过 `POST /api/sessions/:id/project-tasks/:name/review` 提交
- 前端 progress 视图沿用轮询机制
- `review-context.md` 持续积累知识，后续 task 审查质量递增

## 4. 数据库连接 Skill

### 概述

独立的 Claude Code skill（`/audit-db-connect`），供 AI agent 在审查过程中按需调用。

### 功能

- 获取存储过程定义
- 查询表结构和索引
- 分析 SQL 性能（慢查询、全表扫描等）
- 支持数据库：MySQL / PostgreSQL / SQL Server

### 配置

连接信息通过 wizard 中的配置步骤或环境变量提供：
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_TYPE`

### 实现方式

遵循项目零依赖原则，通过 AI agent 调用系统已安装的数据库 CLI 工具：
- MySQL: `mysql` CLI
- PostgreSQL: `psql` CLI
- SQL Server: `sqlcmd` CLI

Skill 提供标准化的查询接口，agent 通过 Bash 工具执行 CLI 命令获取结果。无需安装 npm 依赖。

### 输出

数据库相关发现归入 `category: performance` 或 `category: security`，写入对应 project-task 的 findings。

## 5. 前端集成

### Wizard

新增 `project-scan` 类型的 wizard 流程（4 步），复用现有 wizard 组件模式：
- 步骤 2：目录选择器（当前仓库 / 外部路径输入）
- 步骤 3：背景输入区（文本框 + URL 输入框，AI 抓取 URL 内容后精简整合到 review-context）
- 步骤 4：入口列表展示（checkbox tree，可排除）

### Progress

复用现有 progress 视图，增加状态提示：
- "正在生成项目知识..."
- "正在审查入口 (3/15)..."
- "正在执行横向关联审查..."

### Review

复用现有 review 视图，增加：
- Task 详情展示增加 `category` 彩色标签
- 横向审查结果单独展示
- 入口类型图标（API / 定时任务 / 消费者 / 脚本）

### Summary

复用现有 summary 视图，统计增加：
- 按 category 分布的图表
- 项目知识概览部分
- 横向关联审查摘要

## 6. PDF 导出

沿用现有 `print.html` 方式，增加：
- 项目概览部分（项目知识摘要）
- 按 category 分组的发现汇总
- 横向关联审查结果
- 入口类型标注

## 7. API 新增端点

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/sessions/:id/project-scan/scope` | 设置项目扫描范围（目录 + 入口识别）|
| GET | `/api/sessions/:id/project-scan/entries` | 获取识别出的入口列表 |
| PUT | `/api/sessions/:id/project-scan/entries` | 用户确认/排除入口 |
| GET | `/api/sessions/:id/project-tasks` | 获取项目扫描 task 列表 |
| GET | `/api/sessions/:id/project-tasks/:name` | 获取单个 project-task 详情 |
| POST | `/api/sessions/:id/project-tasks/:name/review` | 提交 project-task 审查结果 |

## 8. 文件影响范围

### 新增文件

- `skills/audit/scripts/server/handlers/project-scan.mjs` — project-scan API handler
- `skills/audit/scripts/lib/project-scan.mjs` — project-scan 业务逻辑（目录扫描、入口识别、调用链追踪）
- `skills/audit/prompts/project-review.md` — 项目扫描 AI prompt 模板
- `skills/audit/prompts/cross-cutting-review.md` — 横向关联审查 AI prompt 模板
- `skills/audit/scripts/public/js/views/wizard-project-scan.mjs` — project-scan wizard 视图
- `skills/audit/scripts/public/js/components/entry-tree.mjs` — 入口选择树组件
- `skills/db-connect/SKILL.md` — 数据库连接 skill 定义
- `skills/db-connect/scripts/connect.mjs` — 数据库连接脚本

### 修改文件

- `skills/audit/SKILL.md` — 增加 project-scan 类型支持
- `skills/audit/scripts/server/router.mjs` — 注册新路由
- `skills/audit/scripts/server/index.mjs` — 加载新 handler
- `skills/audit/scripts/lib/session.mjs` — 支持 `project-scan` 类型和 `projectDir` 字段
- `skills/audit/scripts/lib/yaml.mjs` — 可能需要调整序列化
- `skills/audit/scripts/lib/paths.mjs` — 支持外部项目目录路径解析
- `skills/audit/scripts/public/js/app.mjs` — 注册 project-scan wizard 路由
- `skills/audit/scripts/public/js/api.mjs` — 新增 API 调用方法
- `skills/audit/scripts/public/js/views/wizard.mjs` — 增加 project-scan 类型选项
- `skills/audit/scripts/public/js/views/progress.mjs` — 增加阶段状态提示
- `skills/audit/scripts/public/js/views/review.mjs` — 增加 category 标签展示
- `skills/audit/scripts/public/js/views/summary.mjs` — 增加 category 统计
- `skills/audit/scripts/public/js/constants.mjs` — 增加 category 颜色/标签定义
- `skills/audit/scripts/public/styles.css` — project-scan 相关样式
- `skills/audit/scripts/public/print.html` — 增加 project-scan 打印内容
- `.claude-plugin/plugin.json` — 注册 db-connect skill
