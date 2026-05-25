# UI/UX Overhaul Design

**Date:** 2026-05-25
**Status:** Approved

## Problem

The A-Solid Audit app has accumulated UI inconsistencies from iterative development:

1. **Design system drift** — 4 separate collapsible implementations, hardcoded colors outside tokens, missing spacing tokens, btn-sm taller than base button, no z-index scale
2. **Wizard lacks polish** — no step transitions, minimal scan progress feedback, text-only summaries
3. **Review page underutilizes visual hierarchy** — findings lack severity icons, task sidebar has no progress, no keyboard shortcut documentation
4. **Home page is utilitarian** — no type icons on cards, raw dates, weak empty state

## Approach

Systematic layer-by-layer: fix the design system foundation first, then polish each view bottom-up.

## Changes

### Layer 1: Design System Cleanup

#### 1.1 Unify collapsible patterns

**File:** `skills/audit/scripts/public/styles.css`, `skills/audit/scripts/public/js/views/review.mjs`, `skills/audit/scripts/public/js/views/wizard.mjs`

Replace 4 separate collapsible implementations with a single `.collapse` component:

```css
.collapse {}
.collapse-header { /* shared clickable header */ }
.collapse-body { overflow: hidden; max-height: 0; transition: max-height var(--duration-base) var(--ease-spring); }
.collapse.open .collapse-body { /* max-height set dynamically via JS scrollHeight */ }
.collapse-icon { transition: transform var(--duration-fast) var(--ease-spring); }
.collapse.open .collapse-icon { transform: rotate(180deg); }
```

Current patterns replaced:
- `.accordion-item/header/body` → `.collapse` (general)
- `.finding-collapse-toggle/collapsible` → `.finding-card.collapse`
- `.group-card` header/body → `.group-card.collapse`
- `.scan-log-toggle/panel` → `.collapse` variant

JS: Centralize the toggle logic — on click, toggle `.open` class and set `max-height` to `scrollHeight` (open) or `0` (close).

#### 1.2 Fix `.btn-sm` min-height

**File:** `skills/audit/scripts/public/styles.css`

Change `.btn-sm` from `min-height: 44px` to `min-height: 32px; padding: 4px 12px; font-size: var(--text-xs)`.

The `.finding-card .btn-sm` override at 28px stays for that compact context.

#### 1.3 Add z-index scale tokens

**File:** `skills/audit/scripts/public/styles.css`

Add to `:root`:
```css
--z-base: 0;
--z-sticky: 10;
--z-overlay: 40;
--z-toast: 50;
--z-modal: 100;
--z-skip: 999;
```

Replace hardcoded values:
- `.skip-link`: 999 → `var(--z-skip)`
- `.app-header`: 40 → `var(--z-sticky)`
- `.toast-container`: 50 → `var(--z-toast)`
- `.notes-fab`, `.notes-panel`: 45 → `var(--z-overlay)`

#### 1.4 Extract hardcoded colors to tokens

**File:** `skills/audit/scripts/public/styles.css`

Add to `:root`:
```css
--toast-error-bg: #1A0808;
--toast-success-bg: #081A0D;
--toast-warning-bg: #1A1208;
--btn-primary-text: #052e16;
--sev-text-critical: #fca5a5;
--sev-text-major: #fcd34d;
```

Light theme overrides:
```css
--toast-error-bg: #fef2f2;
--toast-success-bg: #f0fdf4;
--toast-warning-bg: #fffbeb;
--btn-primary-text: #ffffff;
--sev-text-critical: #b91c1c;
--sev-text-major: #a16207;
```

Replace hardcoded values in component rules to reference these tokens.

#### 1.5 Spacing scale fill + token usage

**File:** `skills/audit/scripts/public/styles.css`

Add:
```css
--space-7: 28px;
--space-10: 40px;
```

Replace hardcoded values throughout:
- `20px` → `var(--space-5)`
- `24px` → `var(--space-6)`
- `28px` → `var(--space-7)`
- `40px` → `var(--space-10)`

#### 1.6 Stat card extends card base

**File:** `skills/audit/scripts/public/styles.css`

Add a shared `.card-base` class with the common glassmorphism properties (`background`, `backdrop-filter`, `border`, `border-radius`). Both `.card` and `.stat-card` extend this base. Remove duplicate properties from `.stat-card`.

#### 1.7 Light theme consolidation

**File:** `skills/audit/scripts/public/styles.css`

Merge all light theme overrides into the single `[data-theme="light"]` block. Add overrides for semantic dim tokens:
```css
--info-dim: rgba(59, 130, 246, 0.1);
--warning-dim: rgba(245, 158, 11, 0.1);
--danger-dim: rgba(239, 68, 68, 0.1);
--purple-dim: rgba(167, 139, 250, 0.1);
```

### Layer 2: Wizard UX Polish

#### 2.1 Step transition animations

**File:** `skills/audit/scripts/public/js/views/wizard.mjs`, `skills/audit/scripts/public/styles.css`

Add directional slide transitions between wizard steps:

- Forward (Next): new step enters from right, old exits to left
- Backward (Back): new step enters from left, old exits to right
- Duration: `var(--duration-base)` (250ms) with `--ease-spring`
- Reduced motion: instant swap (respects `prefers-reduced-motion`)

CSS:
```css
.step-container { position: relative; overflow: hidden; }
.step-content { transition: transform var(--duration-base) var(--ease-spring), opacity var(--duration-base) var(--ease-spring); }
.step-enter-right { transform: translateX(30px); opacity: 0; }
.step-enter-left { transform: translateX(-30px); opacity: 0; }
```

JS: Before rendering new step, add enter class, render content, then remove enter class to trigger transition.

#### 2.2 Scan progress improvement

**File:** `skills/audit/scripts/public/js/views/wizard.mjs`, `skills/audit/scripts/public/styles.css`

During the scan phase of the Group step:

- Add an indeterminate progress bar (shimmer animation) at the top of the scan area
- When scan completes, show file count badge: "Found 47 files" using the accent color
- Scan log: add auto-scroll toggle (scrolls by default, user scroll up pauses it)
- After scan completes: add "Collapse log" toggle to hide detailed log

#### 2.3 Group cards improvement

**File:** `skills/audit/scripts/public/js/views/wizard.mjs`, `skills/audit/scripts/public/styles.css`

- Add file count badge on each group card header: `<span class="badge">12 files</span>`
- Add folder icon before group name
- Confirm area shows totals: "5 groups, 47 files selected"
- On confirm: show a checkmark pulse animation (brief success feedback)

#### 2.4 Configure step improvements

**File:** `skills/audit/scripts/public/js/views/wizard.mjs`, `skills/audit/scripts/public/styles.css`

CodeGraph status indicator redesign:
- Replace text-only status with icon + color + label:
  - Available: green checkmark + "CodeGraph Available"
  - Not initialized: yellow warning + "Not Initialized"
  - Indexing: spinning loader + "Indexing..."
  - Error: red X + "Unavailable"
- Add skeleton loading state while checking CodeGraph status
- Project directory input: add folder icon prefix

#### 2.5 Ready step redesign

**File:** `skills/audit/scripts/public/js/views/wizard.mjs`, `skills/audit/scripts/public/styles.css`

Replace text summary with visual summary cards:

```
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ 📋 Type     │ │ 📂 Scope    │ │ 📝 Context  │
│ Code Review │ │ 12 files    │ │ "Focus on   │
│             │ │ 3 commits   │ │  security"  │
└─────────────┘ └─────────────┘ └─────────────┘
```

- Each card: icon + label + value
- "Start AI Review" button: full-width, prominent, subtle pulse animation on hover
- After clicking: smooth fade to confirmation state with session ID

### Layer 3: Review Page Improvements

#### 3.1 Finding cards visual enhancement

**File:** `skills/audit/scripts/public/js/views/review.mjs`, `skills/audit/scripts/public/js/views/task-detail.mjs`, `skills/audit/scripts/public/styles.css`

- Add severity icon before the label (use existing `icon()` factory from app.mjs):
  - critical → `shield-alert`
  - major → `alert-triangle`
  - minor → `info`
  - low → `minus-circle`
- Increase left border from 3px to 4px
- Add subtle severity-tinted background using `var(--danger-dim)` / `var(--warning-dim)` etc.
- Finding title: `font-weight: 600`, `font-size: var(--text-sm)`

#### 3.2 Task sidebar improvements

**File:** `skills/audit/scripts/public/js/views/review.mjs`, `skills/audit/scripts/public/styles.css`

- Add mini progress bar under each task card showing findings reviewed / total findings
- Active task: brighter left border (`var(--accent)`) + subtle background highlight (`var(--accent-dim)`)
- Auto-scroll: when selecting a task via keyboard (`j`/`k`), scroll the sidebar to keep it visible
- Visual separator: "Pending" tasks get a header row separating them from reviewed tasks

#### 3.3 Overview tab redesign

**File:** `skills/audit/scripts/public/js/views/review.mjs`, `skills/audit/scripts/public/styles.css`

Summary cards:
- Keep current layout, no trend icons (YAGNI — no baseline to compare against)

Severity chart:
- Add percentage labels inside each bar (right-aligned, `var(--text-muted)` color)
- Add a legend row below the chart with severity color swatches + labels

Needs attention section:
- Add severity icon per item (color-coded)
- Items get hover state (background lift)
- Already clickable — ensure cursor-pointer is present

Quick stats row (new):
```
┌──────────┐ ┌──────────┐ ┌──────────┐
│ 78%      │ │ 15%      │ │ 7%       │
│ Confirmed│ │ Dismissed│ │ Unreviewed│
└──────────┘ └──────────┘ └──────────┘
```
Three small stat cards showing disposition percentages. Use semantic colors: confirmed → accent, dismissed → warning-dim, unreviewed → muted.

#### 3.4 Keyboard shortcut overlay

**File:** `skills/audit/scripts/public/js/views/review.mjs`, `skills/audit/scripts/public/styles.css`

- Press `?` to toggle a shortcuts modal/overlay
- Small `?` icon in the bottom-right corner of the review page as a visual hint
- Overlay content:

```
Keyboard Shortcuts
─────────────────
j / ↓    Next task
k / ↑    Previous task
o        Overview tab
s        Tasks tab
?        Show shortcuts
Esc      Close this panel
```

- Overlay: glassmorphism card, centered, `var(--z-modal)` z-index
- Close on `Esc` or click outside

### Layer 4: Home & Navigation

#### 4.1 Session card improvements

**File:** `skills/audit/scripts/public/js/views/home.mjs`, `skills/audit/scripts/public/styles.css`

- Add type icon to each card header (left of session ID):
  - Code Review → `code` icon
  - Code + Story → `book-open` icon
  - Project Scan → `folder-search` icon
- Relative time: replace raw date with relative time ("2 hours ago", "3 days ago"), exact date as `title` tooltip
- Progress bar: add percentage label (e.g., "3/10")
- `reviewing` status badge: subtle pulse animation to indicate active work
- Card hover: `transform: translateY(-2px)` + `border-color: var(--accent)` glow

#### 4.2 Empty state improvement

**File:** `skills/audit/scripts/public/js/views/home.mjs`, `skills/audit/scripts/public/styles.css`

Replace text-only empty state with:
- SVG illustration (inline SVG, not an external asset) — magnifying glass over code lines
- Two CTA buttons: "Code Review" and "Project Scan" that link to `#/wizard/new?type=code` and `#/wizard/new?type=project` respectively. Wizard reads `params.type` on render to pre-select the review type card.
- Description text: "Start by auditing specific code changes, or scan an entire project for comprehensive analysis."

#### 4.3 Breadcrumb consistency

**File:** `skills/audit/scripts/public/js/views/home.mjs`, `skills/audit/scripts/public/js/views/review.mjs`, `skills/audit/scripts/public/js/views/summary.mjs`

- Ensure "Sessions" is always a clickable link to `#/home` (not plain text)
- Add hover underline slide-in animation on breadcrumb links
- Remove redundant back buttons where breadcrumb provides navigation

#### 4.4 Header improvement

**File:** `skills/audit/scripts/public/js/app.mjs`, `skills/audit/scripts/public/styles.css`

- Theme toggle: add `title="Switch theme"` attribute for tooltip
- Active session indicator: if any session is in `reviewing` state, show a small pulsing green dot next to the app logo. Poll `api.listSessions()` on a 30s interval to check. Stop polling when navigating away.

## Files Changed

| File | Changes |
|------|---------|
| `skills/audit/scripts/public/styles.css` | All 4 layers: tokens, unified collapsible, step transitions, severity enhancements, keyboard overlay, empty state, breadcrumb animations |
| `skills/audit/scripts/public/js/views/wizard.mjs` | Step transitions, scan progress, group card badges, CodeGraph indicator, ready step redesign |
| `skills/audit/scripts/public/js/views/review.mjs` | Finding severity icons, task sidebar progress bars, overview quick stats, keyboard shortcut overlay |
| `skills/audit/scripts/public/js/views/home.mjs` | Type icons, relative time, reviewing pulse, empty state illustration, breadcrumb fix |
| `skills/audit/scripts/public/js/views/app.mjs` | Active session indicator, theme toggle tooltip |
| `skills/audit/scripts/public/js/views/summary.mjs` | Breadcrumb link fix |
| `skills/audit/scripts/public/js/views/task-detail.mjs` | Finding card severity icons |

## Not Changed

- `skills/audit/scripts/public/js/views/progress.mjs` — Only handles reviewing state now, no changes needed
- `skills/audit/scripts/public/js/views/settings.mjs` — Functional page, no UX issues identified
- `skills/audit/scripts/public/index.html` — No structural changes
- `skills/audit/scripts/public/js/api.mjs` — No API changes needed
- Server-side files — No backend changes
