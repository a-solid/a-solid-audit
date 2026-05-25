# AI Terminal Prompt — Design Spec

**Date:** 2026-05-25
**Status:** Approved
**Scope:** Replace misleading web buttons with prominent AI terminal instructions

## Problem

The web UI cannot trigger AI code reviews — only the AI terminal can. Currently, the Ready page offers "Start AI Review" as a button and mentions the AI terminal as an afterthought (`Go to the Progress page or type start review in the AI terminal`). This misleads users into thinking the web button does something it doesn't. Similarly, the Grouping step shows the terminal command in a small amber banner that's easy to miss.

## Solution

Introduce a reusable **Terminal Card** component that visually mimics a terminal window, making the AI terminal instruction unmissable. Remove the misleading "Start AI Review" web buttons. Add secondary "View Progress" buttons for users to check status after typing the command.

## Component: Terminal Card

A reusable component styled as a mini terminal window.

### Visual Structure

```
┌─────────────────────────────────────────┐
│ ● ● ●    AI Terminal                    │  title bar
├─────────────────────────────────────────┤
│                                         │
│   Go to your AI terminal and type:      │  instruction text
│                                         │
│   ┌───────────────────────────────┐ 📋  │  code block + copy button
│   │ start review                 │     │
│   └───────────────────────────────┘     │
│                                         │
└─────────────────────────────────────────┘
```

### Styling

| Property | Value |
|----------|-------|
| Container background | `var(--bg-deep)` (#0f1117) |
| Title bar | `var(--bg-elevated)` with three decorative dots |
| Code block | `var(--bg-surface)` with `var(--accent)` green text |
| Border | `var(--border)` with subtle `var(--accent-glow)` box-shadow |
| Border radius | `var(--radius-lg)` (12px) |
| Code font | `var(--font-mono)`, `var(--text-lg)` |
| Instruction text | `var(--text-secondary)`, `var(--text-sm)` |

No glassmorphism blur — the card should feel "solid" to stand out from the glass cards around it.

### Copy Button

- On click: copy command to clipboard, change icon to checkmark, text to "Copied!"
- Reset after 2 seconds
- Use `navigator.clipboard.writeText()`
- `aria-label="Copy command"`

### Accessibility

- Container: `role="region"`, `aria-label="AI Terminal Instruction"`
- Code block: `role="textbox"`, `aria-readonly="true"`
- Copy button: `aria-label="Copy command"`

## Context 1: Project Scan Ready (Wizard Step 4 — `renderProjectReady`)

### Changes

1. **Remove** the `start-project-scan-btn` ("Start AI Review" button)
2. **Replace** the confirmation screen with a Terminal Card as the hero element
3. **Add** a "View Progress" ghost button below the Terminal Card

### Layout

```
┌─────────────────────────────────────────────┐
│  Review Ready                               │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  Type: Project Scan                 │    │  summary cards (unchanged)
│  │  Scope: 5 groups, 47 files          │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ╔═════════════════════════════════════╗    │
│  ║ Terminal Card (start review)        ║    │  hero element
│  ╚═════════════════════════════════════╝    │
│                                             │
│  [View Progress →]                          │  btn-ghost
└─────────────────────────────────────────────┘
```

### Behavior

- On load: show summary cards + Terminal Card with `start review`
- "View Progress" navigates to `#/progress/{sessionId}`
- No session state change on this page — session was already prepared in step 3

## Context 2: Code Review Ready (Wizard Step 4 — `renderStep4`)

### Changes

1. **Remove** the `start-review-btn` ("Start AI Review" button)
2. **Replace** the confirmation screen with a Terminal Card as the hero element
3. **Keep** the "View Progress" ghost button below
4. **Remove** the amber info-banner (the Terminal Card replaces it)

### Layout

Same as Context 1 but with Code Review summary cards.

### Behavior

- On load: show summary cards + review context accordion + Terminal Card with `start review`
- Save review context on load (no button click needed)
- "View Progress" navigates to `#/progress/{sessionId}`
- Remove `localStorage` cleanup and `setDirty(false)` from the button click — move to the "View Progress" click or remove entirely since there's no state change

## Context 3: Grouping Step (Wizard Step 3 — `renderGroupStep`, `renderPending`)

### Changes

1. **Replace** the `info-banner-amber` with a Terminal Card
2. **Keep** the scan summary (file count, entry points) above the Terminal Card
3. **Keep** the spinner + "Waiting for grouping..." text below the Terminal Card
4. **No** "View Progress" button here — user stays in wizard

### Layout

```
┌─────────────────────────────────────────────┐
│  Scan & Group Files                         │
│                                             │
│  Found 89 files • 12 entry points detected  │  scan summary (unchanged)
│                                             │
│  ╔═════════════════════════════════════╗    │
│  ║ Terminal Card (group <sessionId>)   ║    │  hero element
│  ╚═════════════════════════════════════╝    │
│                                             │
│  ⟳ Waiting for grouping...                 │  spinner + polling
│                                             │
│  [Back]            [Confirm Groups ✓]       │  confirm disabled until groups load
└─────────────────────────────────────────────┘
```

### Behavior

- On load (scan complete, no groups yet): show summary + Terminal Card with `group {sessionId}`
- Poll for groups every 3 seconds (unchanged)
- When groups load: replace Terminal Card with group cards (unchanged)

## Context 4: Progress Page (`renderProgress`, scan-overlay)

### Changes

When a project session is in `scanning`/`scanned`/`grouping` status, the scan-overlay currently says "Session is still being configured. Go to wizard to continue." This should instead show the Terminal Card if the session is in a state that requires terminal input.

### Behavior

- `scanning` state: keep current scan progress UI (no Terminal Card)
- `scanned` state: show Terminal Card with `group {sessionId}`
- `grouping` state: show spinner + "Grouping in progress..."
- `ready` state: show Terminal Card with `start review`

## Files to Modify

| File | Change |
|------|--------|
| `skills/audit/scripts/public/js/views/wizard.mjs` | `renderProjectReady`, `renderStep4`, `renderGroupStep`/`renderPending` |
| `skills/audit/scripts/public/js/views/progress.mjs` | `scan-overlay` section |
| `skills/audit/scripts/public/styles.css` | New `.terminal-card` styles |
| `skills/audit/scripts/public/js/app.mjs` | New `renderTerminalCard()` helper (shared component) |

## Implementation Notes

- Create a shared `renderTerminalCard(command, options)` function that returns HTML and wires up the copy button
- `options.viewProgressHref` — if provided, renders the "View Progress" button
- `options.instruction` — defaults to "Go to your AI terminal and type:" but can be overridden
- The Terminal Card should be rendered once and not re-rendered during polling (for Grouping step)
