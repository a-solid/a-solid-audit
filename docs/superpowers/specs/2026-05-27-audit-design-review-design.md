# Audit Design Review — Spec

Date: 2026-05-27

Scope: targeted fixes and maintainability improvements to the audit skill's server, YAML layer, error handling, and frontend. No behavioral changes unless fixing a bug.

## 1. YAML Parser Correctness

### 1a. List-item key-value splitting

`yaml.mjs:123-126` uses `rest.split(": ")` then `restParts.join(": ")` which is correct for values containing `: `. However, line 133's regex `/^(\S+): (.*)$/` requires a space after `:` — keys with empty values followed by nested blocks fail to match. Unify key-value parsing to always split on the first `": "`.

### 1b. Inline flow sequences

`yaml.mjs:150-151` stores `[a, b]` as a raw string. `parseScalar` only handles empty `[]`. Add a `parseFlowSequence` helper that splits on `, `, trims, and recursively parses each element.

### 1c. Multiline scalar indent detection

`yaml.mjs:142,197` uses `substring(subIndent + 2)` — hardcoded 2-space assumption. Measure the leading-space count of the first non-blank content line and subtract the block's base indent to compute the actual content offset. Use that instead of the hardcoded `+ 2`.

### 1d. Empty array consistency

Lines 34-35 append ` []` to the last line; lines 76-77 write `key: []` inline. Both produce valid YAML but are inconsistent. Standardize on the inline `key: []` pattern for both cases.

## 2. Error Handling

### 2a. Structured `AppError` class

Add `lib/errors.mjs` with:
```js
export class AppError extends Error {
  constructor(message, code, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
```

Replace string-matching error throws in `session.mjs` and `task.mjs` with `AppError` instances. Simplify all handler catch blocks to:
```js
if (e instanceof AppError) return errorResponse(res, e.message, e.code, e.status);
```

### 2b. Fix `readBody` double-fire

In `server/index.mjs:30-34`, add a `destroyed` flag to prevent chunk pushing after `req.destroy()`.

## 3. `project-scan.mjs` Split

### 3a. Extract `lib/gitignore.mjs` (~80 lines)

Move: `parseGitignore`, `buildGitignoreMatcher`, `gitignorePatternToRegex`, `globToRegex`.

### 3b. Extract `lib/scan-log.mjs` (~30 lines)

Move: `scanLogs` Map, `pushLog`, `getScanLogs`, `clearScanLogs`.

### 3c. Remaining in `project-scan.mjs` (~550 lines)

File scanning, CodeGraph integration, chunking, group task generation. Update imports in handler files.

## 4. Duplicate Status Tracking

### 4a. Derive task status from task files

- `writeIndexYaml` stops writing `status` per task entry
- `getSession` / `listSessions` read each task file to get status
- `updateTask` removes the index.yaml sync step
- Eliminates status drift bugs

## 5. Frontend `wizard.mjs` Split

### 5a. Extract sub-flows

- `views/wizard.mjs` — shell (~400 lines): container, step management, delegation
- `views/wizard-scope.mjs` — scope selection: git branches/commits, file tree, exclude
- `views/wizard-stories.mjs` — story CRUD, provider fetching, mapping
- `views/wizard-project.mjs` — project scan flow, status polling, grouping UI

Each sub-module exports `render(container, session, options)`. No behavioral changes.
