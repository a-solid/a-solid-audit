# Re-Review Fixes: Story Scope & Manual Recovery

## Problem 1: Story task re-review pulls in unrelated code tasks

When a user selects only a story task for re-review, the backend expands it to include all referenced code tasks. This creates a larger session than intended.

**Root cause**: `rounds.mjs` lines 160-169 reads the story task's `files[]` array and adds every `f.taskFile` to `selectedTaskFiles`.

**Fix**: Two changes in `rounds.mjs`:

1. Remove the expansion loop (lines 160-169) that auto-adds referenced code tasks to `selectedTaskFiles`.
2. Rewrite the story task copy logic (lines 254-277): when a story task is in `selectedTaskFiles`, copy it with its full original `files[]` array (keeping the old `taskFile` paths pointing to the original session's code tasks). The story review sub-agent reads those code task diffs from the original session via the API, so the code tasks don't need to exist in the new session.

Current logic filters story `files[]` to only those with matching `newCodeTaskFiles` entries — this breaks when no code tasks are selected. The fix: for explicitly selected story tasks, copy the story YAML as-is (preserving all `files[]` and `taskFile` references).

**Files**: `skills/audit/scripts/server/handlers/rounds.mjs`

## Problem 2: Terminal card assumes manual start, but AI auto-detects

The progress page shows "Run the following command in your AI terminal. This page will update automatically once the review begins." This is misleading because the AI normally picks up sessions via `/wait` automatically.

The terminal card should be a **fallback** for when `/wait` fails (timeout, AI restart, connection error).

### Changes

#### `app.mjs` — renderTerminalCard default instruction

Change default instruction from:
> "Run the following command in your AI terminal. This page will update automatically once the review begins."

To:
> "If the review doesn't start automatically, type the command below in your AI terminal."

#### `progress.mjs` — Command shown in terminal card

Change the command from `start review <round>/<version>` (which looks like a CLI command that doesn't exist) to the same text but treated as a user instruction to the AI, not a shell command.

Actually, the text `start review <round>/<version>` is fine — it's what the user types to the AI. Keep it.

#### `SKILL.md` — Add manual recovery section

Add a new section between "Available Commands" and "Process":

```markdown
## Manual Recovery

If the AI's `/wait` loop is interrupted (timeout, crash, restart) and a session needs reviewing, the user can type:

```
start review <round-name>/<version>
```

When you receive this instruction:
1. Set the session status to reviewing:
   ```bash
   curl -s -X PUT http://localhost:12345/api/rounds/<round-name>/sessions/<version>/status \
     -H 'Content-Type: application/json' \
     -d '{"status":"reviewing"}'
   ```
2. Go directly to **step 2** (Begin Review) and run the review loop.
```

Also update the step 7 failure message to reference this instead of the current `start review <round>/<version>` text which has no defined behavior.
