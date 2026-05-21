# Generalize AI Tool References — Replace "Claude Code" with Vendor-Neutral Terms

**Goal:** Replace all user-facing and documentation references to "Claude Code" with generic AI assistant terminology, so the tool works with any AI coding assistant (GitHub Copilot, OpenCode, Codex, etc.).

**Scope:** UI text, README files, .gitignore comments. Config files with technical dependencies (schema URLs, .claude/ paths) are NOT changed.

---

## Replacement Mapping

### UI Text (3 changes)

| File | Line | Before | After |
|------|------|--------|-------|
| `skills/audit/scripts/public/js/views/progress.mjs` | 19 | `Keep the Claude Code terminal open.` | `Keep the AI terminal open.` |
| `skills/audit/scripts/public/js/views/wizard.mjs` | 406 | `go back to the Claude Code terminal and type` | `go back to the AI terminal and type` |
| `skills/audit/scripts/public/js/views/wizard.mjs` | 470 | `Go back to the Claude Code terminal and type:` | `Go back to the AI terminal and type:` |

### README.md — English (4 changes)

| Line | Before | After |
|------|--------|-------|
| 3 | `AI-powered code review and story alignment audit for [Claude Code](https://docs.anthropic.com/en/docs/claude-code).` | `AI-powered code review and story alignment audit tool.` |
| 22 | `- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI installed` | `- An AI coding assistant CLI installed` |
| 27 | `This project is a Claude Code plugin distributed through its marketplace.` | `This project is an AI coding assistant plugin distributed through a marketplace.` |
| 59 | `1. Open your project in Claude Code:` | `1. Open your project in your AI coding assistant:` |

### README.zh-CN.md — Chinese (4 changes)

| Line | Before | After |
|------|--------|-------|
| 3 | `AI 驱动的代码审查与 Story 对齐审查工具，适用于 [Claude Code](https://docs.anthropic.com/en/docs/claude-code)。` | `AI 驱动的代码审查与 Story 对齐审查工具。` |
| 22 | `- 已安装 [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI` | `- 已安装 AI 编程助手 CLI` |
| 27 | `本项目是一个通过插件市场分发的 Claude Code 插件。` | `本项目是一个通过插件市场分发的 AI 编程助手插件。` |
| 59 | `1. 在 Claude Code 中打开你的项目：` | `1. 在 AI 编程助手中打开你的项目：` |

### .gitignore (1 change)

| Line | Before | After |
|------|--------|-------|
| 13 | `# Claude Code local settings (contains user-specific paths/perms)` | `# AI assistant local settings (contains user-specific paths/perms)` |

---

## NOT Changed

- `.claude-plugin/marketplace.json` — Anthropic schema URL is a technical dependency
- `.claude/settings.local.json` — .claude/ paths are plugin system internals
- `skills/audit/SKILL.md` — already vendor-neutral
- `skills/audit/prompts/*.md` — already vendor-neutral
- All server/API/backend code — no references found

---

## Files Changed (5 files, 12 replacements)

1. `skills/audit/scripts/public/js/views/progress.mjs` (1 replacement)
2. `skills/audit/scripts/public/js/views/wizard.mjs` (2 replacements)
3. `README.md` (4 replacements)
4. `README.zh-CN.md` (4 replacements)
5. `.gitignore` (1 replacement)
