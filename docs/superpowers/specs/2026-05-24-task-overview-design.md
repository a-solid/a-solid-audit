# Task Overview — 调用链路概览与前端展示

> **注意**：本文档已被 `2026-05-24-project-scan-design.md`（Redesign）吸收。YAML schema、入口识别规则、前端展示等内容已整合到主设计文档中。本文档保留供参考，以主设计文档为准。

## 概述

为 Project Task YAML 新增 `type`、`entry`、`overview` 字段，在 AI sub-agent 审阅时自动生成调用链路图（Mermaid）和执行流程描述，前端 task 详情页展示概览区域。

## 1. YAML Schema 变更

### 新增字段

在现有 Project Task YAML 基础上新增 3 个顶层字段：

```yaml
name: "user management"
status: pending
type: api                              # NEW: api | scheduled | consumer | script | unknown
entry: scripts/server/handlers/users.mjs  # NEW: 入口文件路径
files:
  - "scripts/server/handlers/users.mjs"
  - "scripts/lib/user-service.mjs"
  - "scripts/lib/database.mjs"
overview:                               # NEW: AI sub-agent 审阅时填充
  diagram: |                            # Mermaid 语法的调用链路/数据流图
    graph TD
      A[users.mjs<br/>Handler] -->|validate & route| B[user-service.mjs<br/>Service]
      B -->|query & persist| C[database.mjs<br/>Repository]
  description: >-                       # 1-3 句话描述执行流程
    HTTP API 入口，接收用户 CRUD 请求后由 user-service
    处理业务逻辑，最终通过 database 模块持久化。
review:
  score: 0
  summary: ""
  findings: []
  positives: []
```

### 字段说明

| 字段 | 类型 | 填充时机 | 说明 |
|------|------|----------|------|
| `type` | enum | 扫描阶段 | 入口类型，启发式识别 |
| `entry` | string | 扫描阶段 | 入口文件路径，指向 `files[]` 中的某一个 |
| `overview` | object \| null | AI 审阅阶段 | 整体可选，无概览时为 null 或省略 |
| `overview.diagram` | string | AI 审阅阶段 | Mermaid 语法图表 |
| `overview.description` | string | AI 审阅阶段 | 自然语言执行流程描述 |

### 不变的部分

`review` 结构完全不变，现有审阅逻辑和 code-task、story-task 不受影响。

## 2. 扫描阶段 — 入口识别

### 入口类型识别规则

启发式匹配文件路径和文件名：

| type | 路径关键词 | 文件名关键词 |
|------|-----------|-------------|
| `api` | handler, controller, route, api, endpoint | router, handler, controller |
| `scheduled` | cron, job, scheduler, task | cron, job, schedule, task |
| `consumer` | consumer, subscriber, worker, queue, listener | consumer, subscriber, worker, listener |
| `script` | script, bin, cli, migration | cli, migrate, seed, setup |
| `unknown` | — | 不匹配以上任何模式 |

### 分块逻辑变更

当前按目录分块 → 改为按入口分块：

1. 扫描所有文件，标记每个文件的入口类型
2. 每个入口文件作为 task 起点，`entry` = 该文件路径，`type` = 识别到的类型
3. 通过轻量 import 解析（正则匹配 `import ... from` / `require()`）收集关联文件到同一 task
4. 没有明确入口的文件归入最近的 `unknown` 类型 task
5. `overview` 字段在扫描阶段留空，AI 审阅时填充

### Import 解析范围

仅做一层正则匹配，不做完整 AST 解析：

- `import X from './xxx'`
- `import { X } from '../xxx'`
- `require('./xxx')`
- `require('../xxx')`

只追踪相对路径引用（`./` 和 `../`），忽略 node_modules 和绝对路径。

## 3. AI Sub-agent 填充概览

### Prompt 指令

在 project-review prompt 中增加以下指令：

```
完成代码审阅后，填充 task YAML 的 overview 字段：

1. diagram：用 Mermaid graph TD 语法画出调用链路/数据流图
   - 节点格式：filename.mjs<br/>角色（handler / service / repository / util 等）
   - 边上标注关系（"调用"、"查询"、"写入"、"返回"）
   - 只包含 files[] 中的文件
   - 保持简洁，不超过 10 个节点

2. description：用 1-3 句话描述执行流程
   - 从入口开始，说明请求/数据如何流转
   - 提及关键模块及其职责
```

### 写入流程

1. Sub-agent 读取 task YAML 和全部关联源文件
2. 完成代码审阅（现有逻辑不变）
3. 额外分析调用关系，生成 diagram 和 description
4. POST 审阅结果时一并提交 `overview`

### 服务端变更

`POST /api/sessions/:id/project-tasks/:name/review` handler：
- body 可包含 `overview` 字段
- 存在时写入 task YAML 的 `overview` 字段
- 不存在时跳过（兼容旧 task）

## 4. 前端展示

### Review 视图 — Task 详情页

在 score ring 上方新增概览区域，展示顺序：

```
┌─────────────────────────────────────┐
│  [API]  users.mjs                   │  ← type badge + entry 文件名
├─────────────────────────────────────┤
│                                     │
│  ┌──────┐   ┌──────────┐          │
│  │Handler│──→│ Service   │          │  ← Mermaid 渲染的调用链路图
│  └──────┘   └────┬─────┘          │
│                   │                 │
│              ┌────▼─────┐          │
│              │Database   │          │
│              └──────────┘          │
│                                     │
├─────────────────────────────────────┤
│  HTTP API 入口，接收用户请求后由    │  ← description 文本
│  user-service 处理业务逻辑...       │
├─────────────────────────────────────┤
│  Score: 7/10                        │  ← 现有审阅内容
│  Summary: ...                       │
│  Findings: ...                      │
└─────────────────────────────────────┘
```

### Type Badge 颜色

| type | 颜色 |
|------|------|
| api | 蓝 |
| scheduled | 橙 |
| consumer | 紫 |
| script | 绿 |
| unknown | 灰 |

### 前端变更清单

1. **Mermaid.js 引入**：CDN 或 npm 安装
2. **task-detail 组件**：
   - 顶部新增 type badge + entry 文件路径
   - `overview.diagram` 存在时渲染 Mermaid 图表
   - `overview.description` 存在时显示描述文本
3. **Progress 视图**：task 列表中 name 旁显示 type 图标
4. **降级处理**：无 overview 的 task（旧数据、code task、story task）不展示概览区域

### 不需要改的部分

Overview 页、Summary 页保持不变。

## 5. 文件影响范围

### 修改文件

- `skills/audit/scripts/lib/project-scan.mjs` — 入口识别逻辑 + 按入口分块
- `skills/audit/scripts/lib/yaml.mjs` — `writeProjectTaskYaml()` 新增 type/entry/overview 字段
- `skills/audit/prompts/project-review.md` — 新增 overview 生成指令
- `skills/audit/scripts/server/handlers/project-scan.mjs` — review handler 接受 overview
- `skills/audit/scripts/public/js/components/task-detail.mjs` — 概览区域渲染
- `skills/audit/scripts/public/js/views/progress.mjs` — type 图标
- `skills/audit/scripts/public/styles.css` — 概览区域样式
