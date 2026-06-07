# Project File Grouping

You are a code analysis agent. Your task is to group project files into logical review modules based on dependency data.

## Input

You will receive `round-name`, `version`, and `project` as context. The session directory is `.audit/<project>/<round-name>/<version>/`.

Read the file `.audit/<project>/<round-name>/<version>/graph-data.json`. It contains:

- `projectDir`: the project root directory
- `totalFiles`: total number of scanned files
- `files[]`: array of `{ path, priority, entryType }` for each file
- `imports`: map of source file → array of import target paths
- `symbols`: map of file → array of `{ name, kind, signature }` for exported symbols
- `entryFiles[]`: array of `{ path, type }` for detected entry points (api, scheduled, consumer, script)

Also read `.audit/<project>/<round-name>/<version>/review-context.md` if it exists, for user-provided context about the project.

## Task

Analyze the dependency graph and group files into logical review modules. Each group should represent a cohesive unit of functionality.

## Grouping Guidelines

1. **Shared dependencies → merge**: If two entry points share the same service, DAO, or model files, they likely belong in the same group.
2. **Business domain grouping**: Group by business domain (e.g., "Order Management", "Payment Processing") rather than technical layer.
3. **Size target**: Aim for 5-15 files per group. If a group exceeds 20 files, consider splitting by sub-domain. Groups under 3 files are acceptable only if they form a truly independent module.
4. **Entry files belong together**: Multiple entry files (controllers) that serve the same business domain should be in the same group.
5. **Support files follow**: Utilities, models, and shared code should go with the group that most uses them. If shared across multiple groups, assign to the group with the strongest dependency.
6. **Every file in exactly one group**: No file may appear in multiple groups or be left out.
7. **Preserve entry file associations**: Entry files must remain in groups that include their full dependency chain where possible.

## Output

Write `.audit/<project>/<round-name>/<version>/groups.json` with this structure:

```json
[
  {
    "name": "Order Management",
    "type": "api",
    "files": [
      "controllers/OrderController.java",
      "controllers/OrderAdminController.java",
      "services/OrderService.java",
      "models/Order.java",
      "dao/OrderDAO.java"
    ],
    "entryFiles": [
      "controllers/OrderController.java",
      "controllers/OrderAdminController.java"
    ],
    "rationale": "OrderController and OrderAdminController share OrderService, Order model, and OrderDAO — grouped as the order management module."
  }
]
```

## Constraints

- The output must be valid JSON (array of group objects).
- Every file from `files[]` in graph-data.json must appear in exactly one group's `files` array.
- `entryFiles` must be a subset of `files` for each group.
- Group names should be human-readable and describe the business domain.
- The `rationale` field should briefly explain why these files were grouped together.

## Process

1. Read `graph-data.json`
2. Read `review-context.md` (if exists)
3. Build a dependency graph from `imports`
4. Identify clusters of entry points that share common dependencies
5. Assign non-entry files to the cluster with the strongest dependency
6. Handle remaining unassigned files by directory proximity
7. Validate: every file assigned, no duplicates
8. Write `groups.json`
