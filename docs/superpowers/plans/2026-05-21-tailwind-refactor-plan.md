# Tailwind CSS Refactor + UI/UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate from hand-written CSS to Tailwind CSS with glassmorphism design direction and dark/light theme switching.

**Architecture:** CSS custom properties define all design tokens. Tailwind CDN with extended config references these variables. A new `theme.mjs` module manages dark/light toggle via `data-theme` attribute on `<html>`. Component styles that are too complex for utility classes remain in `styles.css` using `@apply` or custom CSS.

**Tech Stack:** Tailwind CSS CDN (runtime), CSS custom properties, vanilla JS ES modules

---

## File Structure

### Create
- `public/js/theme.mjs` — theme toggle logic (~30 lines)

### Modify
- `public/index.html` — update Tailwind config, add theme toggle button in header, add theme.mjs script
- `public/styles.css` — rewrite `:root` tokens, add `[data-theme="light"]` overrides, delete utility classes (~lines 778-864), rewrite components with glassmorphism
- `public/js/app.mjs` — add sun/moon icons, import theme.mjs
- `public/js/views/home.mjs` — update class names for glassmorphism, 2-col grid
- `public/js/views/progress.mjs` — update class names
- `public/js/views/review.mjs` — update class names, finding card states
- `public/js/views/summary.mjs` — update class names
- `public/js/views/wizard.mjs` — update class names, accordion animation
- `public/js/components/task-detail.mjs` — update finding card classes
- `public/js/components/notes-panel.mjs` — update class names
- `public/js/components/file-tree.mjs` — update class names
- `public/js/components/print-task-detail.mjs` — update class names

---

## Task 1: Foundation — Design Tokens + Theme Toggle

**Files:**
- Modify: `public/styles.css:1-90` (rewrite `:root`, add light theme)
- Modify: `public/index.html:7-10` (update Tailwind config), `:19-26` (add theme button)
- Create: `public/js/theme.mjs`
- Modify: `public/js/app.mjs:22-45` (add sun/moon icons), `:1-8` (import theme)

- [ ] **Step 1: Rewrite `:root` design tokens in styles.css**

Replace the entire `:root` block (lines 2-90) with new glassmorphism tokens. Keep all spacing, radius, shadow, transition, font, and type-scale variables unchanged. Only change color and background variables. Add `[data-theme="light"]` override block immediately after `:root`.

New `:root` colors:
```css
:root {
  color-scheme: dark;
  /* Background — subtle gradient */
  --bg-gradient-start: #0f1117;
  --bg-gradient-end: #151822;
  --bg-deep: #0f1117;
  --bg-base: #12131a;
  --bg-surface: rgba(255, 255, 255, 0.05);
  --bg-surface-solid: #15171f;
  --bg-elevated: rgba(255, 255, 255, 0.08);
  --bg-hover: rgba(255, 255, 255, 0.1);
  --bg-active: rgba(255, 255, 255, 0.1);
  --bg-muted: rgba(255, 255, 255, 0.04);
  --bg-input: rgba(255, 255, 255, 0.05);
  /* Text */
  --text-primary: #f0f0f3;
  --text-secondary: #8b8fa3;
  --text-muted: #4a4d5e;
  /* Accent (green) */
  --accent: #22c55e;
  --accent-hover: #4ade80;
  --accent-dim: rgba(34, 197, 94, 0.12);
  --accent-glow: rgba(34, 197, 94, 0.25);
  /* Semantic */
  --info: #3b82f6;
  --info-hover: #60a5fa;
  --info-dim: rgba(59, 130, 246, 0.12);
  --warning: #f59e0b;
  --warning-dim: rgba(245, 158, 11, 0.12);
  --danger: #ef4444;
  --danger-dim: rgba(239, 68, 68, 0.12);
  --purple: #a78bfa;
  --purple-dim: rgba(167, 139, 250, 0.12);
  --border: rgba(255, 255, 255, 0.08);
  --border-hover: rgba(255, 255, 255, 0.15);
  --border-accent: rgba(34, 197, 94, 0.3);
  --success: #22c55e;
  --success-dim: rgba(34, 197, 94, 0.12);
  /* Glassmorphism */
  --card-blur: 12px;
  /* ...keep all other variables (fonts, spacing, radius, shadows, transitions) unchanged... */
}

[data-theme="light"] {
  color-scheme: light;
  --bg-gradient-start: #f5f7fa;
  --bg-gradient-end: #eef1f6;
  --bg-deep: #f5f7fa;
  --bg-base: #f0f2f5;
  --bg-surface: rgba(255, 255, 255, 0.7);
  --bg-surface-solid: #ffffff;
  --bg-elevated: rgba(255, 255, 255, 0.85);
  --bg-hover: rgba(0, 0, 0, 0.04);
  --bg-active: rgba(0, 0, 0, 0.06);
  --bg-muted: rgba(0, 0, 0, 0.03);
  --bg-input: rgba(255, 255, 255, 0.8);
  --text-primary: #1a1d2e;
  --text-secondary: #5a5f72;
  --text-muted: #9498a8;
  --accent: #16a34a;
  --accent-hover: #22c55e;
  --accent-dim: rgba(22, 163, 74, 0.12);
  --accent-glow: rgba(22, 163, 74, 0.2);
  --border: rgba(0, 0, 0, 0.08);
  --border-hover: rgba(0, 0, 0, 0.15);
  --border-accent: rgba(22, 163, 74, 0.3);
  --card-blur: 16px;
  --shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.08);
  --shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.1);
  --shadow-md: 0 4px 16px rgba(0, 0, 0, 0.12);
  --shadow-lg: 0 8px 32px rgba(0, 0, 0, 0.15);
  --shadow-glow: 0 0 20px var(--accent-dim);
}
```

- [ ] **Step 2: Update body background to gradient**

In the `body` rule (~line 94), change `background: var(--bg-deep)` to `background: linear-gradient(135deg, var(--bg-gradient-start), var(--bg-gradient-end))` and add `background-attachment: fixed`. Also add `transition: background-color 300ms, color 200ms` for smooth theme switching.

- [ ] **Step 3: Update Tailwind config in index.html**

Replace lines 7-10 with extended Tailwind config:
```html
<script src="https://cdn.tailwindcss.com"></script>
<script>
tailwind.config = {
  corePlugins: { preflight: false },
  theme: {
    extend: {
      fontFamily: {
        ui: ['var(--font-ui)'],
        mono: ['var(--font-mono)'],
      },
      colors: {
        accent: 'var(--accent)',
        'accent-hover': 'var(--accent-hover)',
      },
    },
  },
};
</script>
```

- [ ] **Step 4: Add sun and moon icons to app.mjs**

In the `ICONS` object in `app.mjs`, add after `chevronDown` (line 44):
```javascript
sun: '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
```

- [ ] **Step 5: Create theme.mjs**

Create `public/js/theme.mjs`:
```javascript
const STORAGE_KEY = "audit-theme";

function getPreferredTheme() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) return stored;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const btn = document.getElementById("theme-toggle");
  if (btn) btn.innerHTML = theme === "dark" ? moonSVG : sunSVG;
}

const sunSVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';

const moonSVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

export function initTheme() {
  const theme = getPreferredTheme();
  applyTheme(theme);
  document.addEventListener("click", (e) => {
    if (e.target.closest("#theme-toggle")) {
      const current = document.documentElement.getAttribute("data-theme") || "dark";
      const next = current === "dark" ? "light" : "dark";
      localStorage.setItem(STORAGE_KEY, next);
      applyTheme(next);
    }
  });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    if (!localStorage.getItem(STORAGE_KEY)) applyTheme(e.matches ? "dark" : "light");
  });
}
```

- [ ] **Step 6: Add theme toggle button to index.html header**

In `index.html`, inside the `<header>` (after the breadcrumb nav on line 25, before closing `</header>`), add:
```html
<div class="header-spacer" style="flex:1"></div>
<button id="theme-toggle" class="btn btn-ghost btn-sm" aria-label="Toggle theme"></button>
```

- [ ] **Step 7: Import and initialize theme.mjs in app.mjs**

Add at top of `app.mjs` imports:
```javascript
import { initTheme } from "./theme.mjs";
```

Add `initTheme();` call in the module body (after line 10, before `const container = ...` or right after it).

- [ ] **Step 8: Commit**

```bash
git add public/js/theme.mjs public/styles.css public/index.html public/js/app.mjs
git commit -m "feat: add glassmorphism design tokens, light/dark theme switching, theme.mjs"
```

---

## Task 2: Delete Utility Classes + Rewrite Reset

**Files:**
- Modify: `public/styles.css` (delete lines 778-864, rewrite body/reset)

- [ ] **Step 1: Delete all utility class sections from styles.css**

Delete lines 778 through 864 (Layout Utilities, Spacing Utilities, Text Utilities, Page Header, Other Utilities). These are all Tailwind equivalents:
- `.flex`, `.flex-col`, `.items-center`, `.justify-between`, `.justify-end`
- `.gap-2/3/4`, `.grid`, `.grid-cols-*`, `.col-span-*`, `.w-full`, `.max-h-*`, `.overflow-*`
- `.mb-*`, `.mt-*`, `.ml-*`, `.p-*`, `.px-*`, `.py-*`, `.space-y-*`
- `.text-center`, `.text-xs` through `.text-3xl`, `.font-*`, `.text-primary/secondary/muted/accent/success/danger/warning/info`
- `.page-header`, `.page-title`, `.page-subtitle`
- `.hidden`, `.truncate`, `.border`, `.border-b`, `.rounded`

- [ ] **Step 2: Rewrite body to use gradient background**

Update the `body` rule to:
```css
body {
  font-family: var(--font-ui);
  background: linear-gradient(135deg, var(--bg-gradient-start), var(--bg-gradient-end));
  background-attachment: fixed;
  color: var(--text-primary);
  font-size: var(--text-base);
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  overflow-y: scroll;
  transition: background 300ms ease, color 200ms ease;
}
```

- [ ] **Step 3: Commit**

```bash
git add public/styles.css
git commit -m "refactor: delete utility classes (replaced by Tailwind), add gradient body"
```

---

## Task 3: Rewrite Component Styles — Cards, Buttons, Badges

**Files:**
- Modify: `public/styles.css` (lines ~191-287 — card, btn, badge sections)

- [ ] **Step 1: Rewrite `.card` with glassmorphism**

Replace the `.card` block and variants (lines ~192-221):
```css
.card {
  background: var(--bg-surface);
  backdrop-filter: blur(var(--card-blur));
  -webkit-backdrop-filter: blur(var(--card-blur));
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  transition: border-color var(--duration-fast) var(--ease-spring),
              background var(--duration-fast) var(--ease-spring),
              box-shadow var(--duration-fast) var(--ease-spring),
              transform var(--duration-fast) var(--ease-spring);
}
.card:hover { border-color: var(--border-hover); }
.card-accent-success { border-left: 3px solid var(--success); }
.card-accent-warning { border-left: 3px solid var(--warning); }
.card-accent-info { border-left: 3px solid var(--info); }
.card-clickable { cursor: pointer; }
.card-clickable:hover {
  background: var(--bg-elevated);
  border-color: var(--border-hover);
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}
.card-clickable:active {
  transform: translateY(0);
  transition-duration: 80ms;
}
.card.selected {
  border-color: var(--accent);
  background: var(--accent-dim);
  box-shadow: inset 0 0 0 1px var(--border-accent);
}
```

- [ ] **Step 2: Rewrite `.btn` with glow effects**

Replace the `.btn` block and variants (lines ~223-261):
```css
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  font-size: var(--text-sm); font-weight: 500; font-family: var(--font-ui);
  line-height: 1.4;
  border: 1px solid var(--border);
  background: var(--bg-surface);
  color: var(--text-primary);
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--duration-fast) var(--ease-spring);
}
.btn:hover { background: var(--bg-elevated); border-color: var(--border-hover); }
.btn:active { transform: scale(0.97); }
.btn:disabled { opacity: 0.4; cursor: not-allowed; pointer-events: none; }
.btn-primary {
  background: var(--accent); color: #052e16; border-color: var(--accent);
  font-weight: 600;
  box-shadow: 0 0 0 0 var(--accent-glow);
}
.btn-primary:hover {
  background: var(--accent-hover); border-color: var(--accent-hover);
  box-shadow: var(--shadow-glow);
}
.btn-primary:active { transform: scale(0.97); }
.btn-danger {
  background: transparent; color: var(--danger); border-color: rgba(239, 68, 68, 0.3);
}
.btn-danger:hover { background: var(--danger-dim); border-color: var(--danger); }
.btn-ghost {
  background: transparent; border-color: transparent; color: var(--text-secondary);
}
.btn-ghost:hover { background: var(--bg-elevated); color: var(--text-primary); }
.btn-sm {
  padding: var(--space-1) var(--space-3); font-size: var(--text-xs);
  border-radius: var(--radius-sm);
}
```

- [ ] **Step 3: Rewrite badges with gradient backgrounds**

Replace badge section (lines ~263-287):
```css
.badge {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 10px; border-radius: var(--radius-full);
  font-size: var(--text-xs); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;
  line-height: 1.6;
}
.badge-created { background: var(--bg-active); color: var(--text-muted); }
.badge-scoped { background: var(--info-dim); color: var(--info-hover); }
.badge-ready { background: var(--warning-dim); color: var(--warning); }
.badge-reviewing { background: var(--purple-dim); color: var(--purple); }
.badge-completed { background: var(--success-dim); color: var(--success); }
.badge-pending { background: var(--bg-active); color: var(--text-muted); }
.badge-reviewed { background: var(--success-dim); color: var(--success); }
.badge-reviewing-task { background: var(--purple-dim); color: var(--purple); }
.severity-critical { background: linear-gradient(135deg, rgba(239,68,68,0.2), rgba(239,68,68,0.1)); color: #fca5a5; }
.severity-major, .severity-high { background: linear-gradient(135deg, var(--danger-dim), rgba(239,68,68,0.08)); color: #fca5a5; }
.severity-minor, .severity-medium { background: linear-gradient(135deg, var(--warning-dim), rgba(245,158,11,0.08)); color: #fcd34d; }
.severity-info, .severity-low { background: linear-gradient(135deg, var(--info-dim), rgba(59,130,246,0.08)); color: var(--info-hover); }
.severity-met { background: var(--success-dim); color: #86efac; }
.severity-partially-met { background: var(--warning-dim); color: #fcd34d; }
.severity-not-met { background: var(--danger-dim); color: #fca5a5; }
```

- [ ] **Step 4: Commit**

```bash
git add public/styles.css
git commit -m "refactor: rewrite card/btn/badge with glassmorphism + gradient badges"
```

---

## Task 4: Rewrite Component Styles — Header, Forms, Tabs, Finding Card

**Files:**
- Modify: `public/styles.css` (header, form, tabs, finding-card sections)

- [ ] **Step 1: Rewrite header with enhanced glassmorphism**

Replace `.app-header` block (lines ~132-172):
```css
.app-header {
  background: rgba(18, 19, 26, 0.8);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--border);
  padding: 0 var(--space-6);
  display: flex; align-items: center; gap: var(--space-4);
  position: sticky; top: 0; z-index: 40;
  height: 52px;
}
```
Note: The `[data-theme="light"]` block needs a matching override:
```css
[data-theme="light"] .app-header {
  background: rgba(240, 242, 245, 0.85);
}
```
Add this inside the `[data-theme="light"]` block at the end of the selector list.

- [ ] **Step 2: Rewrite form elements with glow focus**

Replace `input, select, textarea` section (lines ~522-551):
```css
input, select, textarea {
  font-family: var(--font-ui); font-size: var(--text-base);
  background: var(--bg-input); color: var(--text-primary);
  border: 1px solid var(--border); border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-3); width: 100%;
  transition: border-color var(--duration-fast) var(--ease-spring),
              box-shadow var(--duration-fast) var(--ease-spring);
}
input:focus, select:focus, textarea:focus {
  border-color: var(--accent);
  outline: none;
  box-shadow: 0 0 0 3px var(--accent-dim);
}
input::placeholder, textarea::placeholder { color: var(--text-muted); }
label {
  font-size: var(--text-sm); font-weight: 500; color: var(--text-secondary);
  display: block; margin-bottom: var(--space-1);
}
select {
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238A8F98' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  padding-right: 30px;
}
textarea { resize: vertical; min-height: 60px; line-height: 1.5; }
```

- [ ] **Step 3: Rewrite tabs with gradient active state**

Replace `.tabs` and `.tab` section (lines ~372-395):
```css
.tabs {
  display: flex; gap: var(--space-1);
  margin-bottom: var(--space-4);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 3px;
  width: fit-content;
}
.tab {
  padding: var(--space-2) var(--space-4);
  font-size: var(--text-sm); font-weight: 500;
  color: var(--text-muted); cursor: pointer;
  border-radius: var(--radius-sm);
  transition: all var(--duration-fast) var(--ease-spring);
  white-space: nowrap;
  user-select: none;
}
.tab:hover { color: var(--text-secondary); background: var(--bg-hover); }
.tab.active {
  color: var(--text-primary);
  background: linear-gradient(135deg, var(--bg-active), var(--bg-elevated));
  box-shadow: var(--shadow-xs);
}
```

- [ ] **Step 4: Rewrite finding card with wider severity border + states**

Replace `.finding-card` section (lines ~623-639):
```css
.finding-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  border-left: 4px solid;
  transition: border-color var(--duration-fast), opacity var(--duration-fast);
}
.finding-card:hover { border-color: var(--border-hover); }
.finding-card.severity-critical { border-left-color: var(--danger); }
.finding-card.severity-major,
.finding-card.severity-high { border-left-color: var(--danger); }
.finding-card.severity-minor,
.finding-card.severity-medium { border-left-color: var(--warning); }
.finding-card.severity-info,
.finding-card.severity-low { border-left-color: var(--info); }
.finding-card.confirmed { background: linear-gradient(135deg, var(--success-dim), var(--bg-surface)); }
.finding-card.dismissed { opacity: 0.6; }
```

- [ ] **Step 5: Commit**

```bash
git add public/styles.css
git commit -m "refactor: rewrite header/forms/tabs/finding-card with glassmorphism"
```

---

## Task 5: Rewrite Sidebar Layout + Remaining Components

**Files:**
- Modify: `public/styles.css` (sidebar, file-tree, info-banner, empty-state, stat-card)

- [ ] **Step 1: Rewrite sidebar layout**

Replace `.sidebar-layout` and children (lines ~866-886):
```css
.sidebar-layout {
  display: grid; grid-template-columns: 300px 1fr;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  min-height: 480px;
  max-height: 75vh;
  background: var(--bg-surface-solid);
}
.sidebar-panel {
  border-right: 1px solid var(--border);
  overflow-y: auto;
  background: var(--bg-surface-solid);
}
.detail-panel {
  padding: var(--space-6);
  padding-bottom: 72px;
  overflow-y: auto;
  background: var(--bg-base);
}
```

- [ ] **Step 2: Rewrite stat-card**

Replace `.stat-card` section:
```css
.stat-card {
  background: var(--bg-surface);
  backdrop-filter: blur(var(--card-blur));
  -webkit-backdrop-filter: blur(var(--card-blur));
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-4) var(--space-5);
  text-align: center;
  transition: border-color var(--duration-fast) var(--ease-spring),
              box-shadow var(--duration-fast) var(--ease-spring);
}
.stat-card:hover {
  border-color: var(--border-hover);
  box-shadow: 0 0 0 1px var(--border-hover);
}
```

- [ ] **Step 3: Commit**

```bash
git add public/styles.css
git commit -m "refactor: rewrite sidebar/stat-card with glassmorphism"
```

---

## Task 6: Update JS Templates — Semantic Color Classes

**Files:**
- Modify: `public/js/views/home.mjs`
- Modify: `public/js/views/progress.mjs`
- Modify: `public/js/views/review.mjs`
- Modify: `public/js/views/summary.mjs`
- Modify: `public/js/views/wizard.mjs`
- Modify: `public/js/components/task-detail.mjs`
- Modify: `public/js/components/notes-panel.mjs`
- Modify: `public/js/components/print-task-detail.mjs`

- [ ] **Step 1: Replace `.text-muted` with inline style in all files**

Since `.text-muted` was deleted from CSS, replace all `class="text-muted"` with `class="text-[var(--text-muted)]"` in every .mjs file. Same for `.text-secondary` → `class="text-[var(--text-secondary)]"`, `.text-danger` → `class="text-[var(--danger)]"`, `.text-success` → `class="text-[var(--success)]"`, `.text-warning` → `class="text-[var(--warning)]"`, `.text-info` → `class="text-[var(--info)]"`.

Alternatively, add these as `@apply` component classes in `styles.css` to avoid changing every JS file:
```css
.text-muted { color: var(--text-muted); }
.text-secondary { color: var(--text-secondary); }
.text-danger { color: var(--danger); }
.text-success { color: var(--success); }
.text-warning { color: var(--warning); }
.text-info { color: var(--info); }
.text-primary { color: var(--text-primary); }
.text-accent { color: var(--accent); }
```
**Recommended approach:** Add these 8 lines back to `styles.css` after the badge section. They are semantic classes that reference CSS variables and are NOT direct Tailwind duplicates. This avoids touching every JS file.

- [ ] **Step 2: Commit**

```bash
git add public/styles.css
git commit -m "fix: restore semantic color classes as CSS variable references"
```

---

## Task 7: Add Finding Card States to JS Templates

**Files:**
- Modify: `public/js/components/task-detail.mjs`
- Modify: `public/js/views/review.mjs`

- [ ] **Step 1: Add confirmed/dismissed CSS classes to finding cards in task-detail.mjs**

In `task-detail.mjs`, update the finding card `<div>` to include state classes:
Find: `<div class="finding-card severity-${f.severity}" data-finding="${i}">`
Replace with:
```javascript
`<div class="finding-card severity-${f.severity}${isConfirmed ? " confirmed" : ""}${isDismissed ? " dismissed" : ""}" data-finding="${i}">`
```

- [ ] **Step 2: Commit**

```bash
git add public/js/components/task-detail.mjs
git commit -m "feat: add confirmed/dismissed visual states to finding cards"
```

---

## Task 8: Update Print CSS for New Variables

**Files:**
- Modify: `public/styles.css` (print media query section)

- [ ] **Step 1: Update `@media print` to use new variable names and always use light theme**

Update the print `:root` overrides to include new gradient/background variables:
```css
@media print {
  .no-print { display: none !important; }
  body { background: white !important; color: black; }
  :root {
    --bg-gradient-start: #fff;
    --bg-gradient-end: #fff;
    --bg-deep: #fff;
    --bg-base: #fff;
    --bg-surface: #f9fafb;
    --bg-surface-solid: #fff;
    --bg-elevated: #f3f4f6;
    --bg-hover: #e5e7eb;
    --bg-active: #d1d5db;
    --bg-muted: #f3f4f6;
    --bg-input: #fff;
    --text-primary: #111827;
    --text-secondary: #4b5563;
    --text-muted: #9ca3af;
    --accent: #166534;
    --danger: #991b1b;
    --warning: #92400e;
    --info: #1e40af;
    --border: #e5e7eb;
    --border-hover: #d1d5db;
    --border-accent: rgba(22, 101, 52, 0.3);
    --card-blur: 0px;
  }
  /* ...keep existing print card/badge overrides... */
}
```

- [ ] **Step 2: Commit**

```bash
git add public/styles.css
git commit -m "fix: update print CSS for new glassmorphism variables"
```

---

## Task 9: Accordion Smooth Expand Animation

**Files:**
- Modify: `public/styles.css` (accordion section)
- Modify: `public/js/views/wizard.mjs` (accordion expand/collapse logic)

- [ ] **Step 1: Change accordion body from display:none to max-height transition**

In `styles.css`, replace the accordion body rules:
```css
.accordion-body {
  max-height: 0;
  overflow: hidden;
  padding: 0 var(--space-4);
  border-top: 1px solid transparent;
  background: var(--bg-base);
  transition: max-height 250ms var(--ease-spring), padding 250ms var(--ease-spring);
}
.accordion-item.expanded .accordion-body {
  max-height: 300px;
  padding: var(--space-3) var(--space-4);
  border-top-color: var(--border);
}
```

- [ ] **Step 2: Remove the `display: none` / `display: block` toggle from wizard.mjs**

In `wizard.mjs`, the accordion expand currently relies on CSS `.accordion-item.expanded .accordion-body { display: block }`. Since we switched to `max-height`, remove any JS that sets `display` on accordion bodies — the CSS transition handles it.

- [ ] **Step 3: Commit**

```bash
git add public/styles.css public/js/views/wizard.mjs
git commit -m "feat: smooth accordion expand animation with max-height transition"
```

---

## Task 10: Home Page Layout — 2-Column Grid

**Files:**
- Modify: `public/js/views/home.mjs`

- [ ] **Step 1: Change session list to 2-column grid on desktop**

In `home.mjs`, find the session cards rendering (the `listEl.innerHTML = sessions.map(...)` block). Wrap the card grid in a container with responsive grid classes.

Change: `<div class="card card-clickable ${cfg.accent} mb-3" ...>`
To: `<div class="card card-clickable ${cfg.accent}" ...>`

And change the `listEl.innerHTML` to wrap the mapped cards in a grid container:
```javascript
listEl.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
  ${sessions.map(s => { /* ...existing card template, minus mb-3... */ }).join("")}
</div>`;
```

Note: `md:grid-cols-2` requires Tailwind's responsive prefix to work with CDN. If it doesn't work (CDN scans DOM at runtime), use a CSS media query instead:
```css
@media (min-width: 768px) { .session-grid { grid-template-columns: repeat(2, 1fr); } }
```
Add this to `styles.css` responsive section and use `class="session-grid"`.

- [ ] **Step 2: Commit**

```bash
git add public/js/views/home.mjs public/styles.css
git commit -m "feat: 2-column session grid on desktop"
```

---

## Task 11: Final Cleanup + Responsive Updates

**Files:**
- Modify: `public/styles.css` (responsive section)

- [ ] **Step 1: Update responsive media queries for new structure**

Update `@media (max-width: 768px)` to handle sidebar and grid collapse. The existing rules are fine — just verify they still work after the utility class deletion.

- [ ] **Step 2: Add `[data-theme="light"]` overrides for print-related and any missed components**

Verify all components render correctly in light mode. Add any missing `[data-theme="light"]` overrides (header background, code blocks, pre blocks, etc.).

- [ ] **Step 3: Test theme toggle in browser**

Run the server (`node scripts/cli.mjs server`) and verify:
- Dark mode renders correctly with glassmorphism
- Light mode toggle works
- Theme preference persists on reload
- Print always uses light theme
- All pages (home, wizard, progress, review, summary) render in both themes

- [ ] **Step 4: Final commit and push**

```bash
git add -A
git commit -m "feat: complete Tailwind CSS refactor with glassmorphism UI/UX redesign"
```

---

## Self-Review Checklist

- [ ] **Spec coverage:** Each section of the spec maps to a task: design tokens (Task 1), theme switching (Task 1), utility class deletion (Task 2), components (Tasks 3-5), JS templates (Tasks 6-7), print (Task 8), accordion animation (Task 9), home layout (Task 10), cleanup (Task 11).
- [ ] **Placeholder scan:** No TBD/TODO found. All steps have concrete code or instructions.
- [ ] **Type consistency:** All CSS variable names are consistent between `:root`, `[data-theme="light"]`, and `@media print` blocks.
