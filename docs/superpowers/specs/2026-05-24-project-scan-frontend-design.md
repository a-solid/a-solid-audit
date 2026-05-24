# Project Scan Frontend Integration Design

## Problem

The project scan backend (API, scan logic, AI grouping) is fully implemented, but there is no way for users to create a project-type session from the frontend. The wizard only offers "Code Review" and "Code + Story" options. Additionally, there is no settings page for managing API keys, JIRA credentials, and database connections.

## Solution

1. Add "Project Scan" as a third option in wizard Step 1, with a simplified 3-step wizard flow
2. Add a global settings page for managing credentials and configuration
3. Store settings alongside SKILL.md, read directly from file instead of process.env

## 1. Wizard Step 1: Add Project Scan Card

Add a third card to the existing "Choose Review Type" step in `views/wizard.mjs`:

- Icon: `search` (magnifying glass)
- Title: Project Scan
- Description: Full project security and quality audit
- Sets `reviewType = "project"`

Step count per type:
- Code Review: 3 steps (Type → Scope → Ready)
- Code + Story: 4 steps (Type → Scope → Stories → Ready)
- **Project Scan: 3 steps (Type → Configure → Ready)**

Step labels for project scan: `["Review Type", "Configure", "Ready"]`

## 2. Project Scan Step 2 (Configure)

Replaces the git scope step for project sessions.

**Fields:**
- **Project Directory** — text input, pre-filled from session creation
- **CodeGraph** — checkbox, default checked "Use CodeGraph (if available)"
- **Review Context** — optional textarea for project background (same pattern as existing Step 4)

**Button:** "Start Scan" — calls `api.updateSessionStatus(sessionId, "ready")` then navigates to `#/progress/{sessionId}`

Progress view detects project session with status `ready` and auto-triggers `api.startScan(sessionId)`.

## 3. Global Settings Page

**Route:** `#/settings`

**Entry point:** Gear icon button in header (next to theme toggle).

**Fixed configuration form:**
- Anthropic — API Key (password input)
- JIRA — Base URL / Email / Token (three fields)
- Database — Host / Port / Database Name / User / Password
- CodeGraph — Path (text input, default `~/.local/bin/codegraph`)

**Custom environment variables:**
- Key-value list, add/remove rows
- For additional config not covered by the fixed form

**Security:**
- GET API returns only whether each field is configured (not actual values)
- Settings page shows "已配置 ••••••••" for populated password fields
- PUT API accepts full values for update

## 4. API Design

### Settings API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/settings` | Get config status (sensitive fields show configured: true/false only) |
| PUT | `/api/settings` | Update config |

**GET response:**
```json
{
  "anthropic": { "configured": true },
  "jira": { "configured": false },
  "database": { "configured": false },
  "codegraph": { "path": "~/.local/bin/codegraph" },
  "customVars": [{ "key": "MY_VAR", "configured": true }]
}
```

**PUT request:**
```json
{
  "anthropic": { "apiKey": "sk-ant-..." },
  "jira": { "baseUrl": "...", "email": "...", "token": "..." },
  "database": { "host": "...", "port": 5432, "name": "...", "user": "...", "password": "..." },
  "codegraph": { "path": "..." },
  "customVars": [{ "key": "MY_VAR", "value": "..." }]
}
```

### Storage

Settings stored at `skills/audit/settings.json` (alongside SKILL.md), resolved via `__dirname` relative path. This travels with the skill regardless of which project it's installed in.

**Runtime config reading:**
- `callAnthropicAPI()` receives API key as parameter instead of reading `process.env`
- Server reads settings.json and passes config to `scanProject()`
- `scanProject()` passes config down to internal functions
- No process.env pollution for the host project

## 5. Files to Change

### Frontend

| File | Change |
|------|--------|
| `skills/audit/scripts/public/js/views/wizard.mjs` | Add "Project Scan" card to Step 1; add project configure step (Step 2) and simplified ready step (Step 3) |
| `skills/audit/scripts/public/js/views/settings.mjs` | New file — settings page with fixed form + custom vars |
| `skills/audit/scripts/public/js/app.mjs` | Add `#/settings` route |
| `skills/audit/scripts/public/js/api.mjs` | Add `getSettings()` and `updateSettings()` |

### Backend

| File | Change |
|------|--------|
| `skills/audit/scripts/server/handlers/settings.mjs` | New file — GET/PUT settings handler |
| `skills/audit/scripts/server/index.mjs` | Register settings routes |
| `skills/audit/scripts/lib/project-scan.mjs` | `callAnthropicAPI()` accepts apiKey parameter instead of process.env |

### No changes needed

| File | Reason |
|------|--------|
| `views/progress.mjs` | Already has project scan support (scan overlay, start button, status polling) |
| `views/home.mjs` | Entry point stays as single "New Audit" button (方案 A) |
| `views/review.mjs` | Already session-type-agnostic |
| `views/summary.mjs` | Already session-type-agnostic |
