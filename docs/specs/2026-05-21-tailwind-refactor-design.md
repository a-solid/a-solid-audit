# Tailwind CSS Full Refactor + UI/UX Redesign

Date: 2026-05-21

## Overview

Full migration from hand-written CSS to Tailwind CSS, combined with UI/UX improvements. The design direction is **Glassmorphism + Subtle Gradient** — frosted glass panels on a gradient background, with dark/light theme switching support.

## Design Direction: Glassmorphism + Subtle Gradient

- Cards and panels use `backdrop-filter: blur(12px)` + semi-transparent backgrounds + subtle borders
- Background has a soft gradient instead of flat solid color
- Dark mode: deep gray-blue gradient `#0f1117 → #151822` with frosted glass panels
- Light mode: light gray-white gradient `#f5f7fa → #eef1f6` with frosted white panels
- Both modes look cohesive — frosted glass works naturally in both

## Design Tokens

### Color System

**Dark mode (default, `[data-theme="dark"]` or no attribute):**

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-gradient-start` | `#0f1117` | Background gradient top |
| `--bg-gradient-end` | `#151822` | Background gradient bottom |
| `--bg-surface` | `rgba(255,255,255,0.05)` | Card/panel background |
| `--bg-elevated` | `rgba(255,255,255,0.08)` | Hover/active states |
| `--bg-hover` | `rgba(255,255,255,0.1)` | Hover overlay |
| `--text-primary` | `#f0f0f3` | Main text |
| `--text-secondary` | `#8b8fa3` | Secondary text |
| `--text-muted` | `#4a4d5e` | Muted/disabled text |
| `--accent` | `#22c55e` | Primary accent (green) |
| `--accent-glow` | `rgba(34,197,94,0.25)` | Glow effect for accent elements |
| `--border` | `rgba(255,255,255,0.08)` | Default border |
| `--card-blur` | `12px` | Backdrop blur amount |

**Light mode (`[data-theme="light"]`):**

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-gradient-start` | `#f5f7fa` | Background gradient top |
| `--bg-gradient-end` | `#eef1f6` | Background gradient bottom |
| `--bg-surface` | `rgba(255,255,255,0.7)` | Card/panel background |
| `--bg-elevated` | `rgba(255,255,255,0.85)` | Hover/active states |
| `--bg-hover` | `rgba(0,0,0,0.04)` | Hover overlay |
| `--text-primary` | `#1a1d2e` | Main text |
| `--text-secondary` | `#5a5f72` | Secondary text |
| `--text-muted` | `#9498a8` | Muted/disabled text |
| `--accent` | `#16a34a` | Primary accent (deeper green) |
| `--accent-glow` | `rgba(22,163,74,0.2)` | Glow effect |
| `--border` | `rgba(0,0,0,0.08)` | Default border |
| `--card-blur` | `16px` | More blur in light mode |

**Shared across themes:**

| Token | Value |
|-------|-------|
| `--info` | `#3b82f6` |
| `--warning` | `#f59e0b` |
| `--danger` | `#ef4444` |
| `--success` | `#22c55e` |
| `--purple` | `#a78bfa` |

### Typography

Keep Inter (UI) + Fira Code (mono). No changes.

### Spacing & Radius

Keep current spacing scale. Consolidate radius to:
- `--radius-sm: 6px` — inputs, small badges
- `--radius-md: 8px` — buttons, cards (default)
- `--radius-lg: 12px` — panels, major containers

### Shadows

Dark mode: lighter shadows (surfaces already dark).
Light mode: more prominent shadows for depth.

## Theme Switching

**Mechanism:**
- `<html>` gets `data-theme="dark"` or `data-theme="light"` attribute
- `:root` defines dark tokens as default
- `[data-theme="light"]` selector overrides all tokens
- `theme.mjs` (~30 lines) manages toggle logic:
  - Read from `localStorage("audit-theme")`
  - Fallback to `window.matchMedia("(prefers-color-scheme: light)")` system preference
  - Default to dark if no preference
- Header gets a sun/moon toggle button (right side)
- Body gets `transition: background-color 300ms, color 200ms` for smooth switching
- Print always uses light theme regardless of setting

**Tailwind config:**
```js
tailwind.config = {
  darkMode: ['selector', '[data-theme="dark"]'],
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        accent: 'var(--accent)',
        // ... reference CSS variables
      }
    }
  }
};
```

## Component Improvements

### Card
- `backdrop-blur-md` + semi-transparent bg + subtle border
- Hover: border brightens + slight `translate-y-[-1px]` + shadow deepens
- Dark mode: subtle inner glow

### Button
- Three tiers: primary (filled green), ghost (transparent), danger (red border)
- Primary: subtle pulse glow on idle, stronger glow on hover
- Ghost: transparent → bg color block on hover
- All: `active:scale-[0.97]` press feedback

### Badge
- Keep current sizing and shape
- Severity badges: gradient background instead of flat color
- Status badges: ensure sufficient contrast in light mode

### Toast
- Keep top-right position
- Dark: dark background + left color bar
- Light: white background + shadow + left color bar
- Keep current slide-in animation

### Tabs
- Keep pill style (rounded container)
- Active tab: subtle gradient background instead of flat color block

### Accordion (file mapping)
- Smooth height transition on expand (replace `display:none` toggle with `max-height` transition)
- Expanded header gets bottom border separator

### Finding Card
- Severity left border widened to 4px
- Confirmed: entire card gets a subtle green overlay tint
- Dismissed: card opacity drops to 0.6, visually de-emphasized

### Score Ring
- Entry animation: ring draws from 0 to target value on view
- Dark mode: ring has subtle glow halo
- Light mode: solid color ring

### Form Elements
- Input focus: accent-colored glow effect (`box-shadow: 0 0 0 3px var(--accent-dim)`)
- Keep custom select styling
- Keep `resize: vertical` on textarea

## Page Layout Improvements

### Header
- Keep sticky position
- Enhanced glassmorphism effect
- Add theme toggle button (sun/moon icon) on the right

### Home (Session List)
- Session cards: left status color band + hover float + shadow deepen
- Empty state: improved icon/animation
- Desktop: 2-column grid for session cards (single column on mobile)

### Wizard
- Steps indicator: keep horizontal dots, improve visual clarity
- Step content cards: more padding/breathing room
- Loading states: animated spinner (replace plain text)
- Scope tab switching: smoother transitions

### Review
- Overview: score ring entry animation (draw from 0)
- Tasks sidebar: stronger active highlight with left color band
- Finding cards: severity band 4px, confirmed/dismissed visual states

### Summary / Sign-off
- Stats grid: subtle gradient background to separate from content
- Sign-off: confirmation animation after successful sign-off

## Code Structure Changes

### Files to Delete
- 72 lines of utility classes from `styles.css` (replaced by Tailwind in HTML)

### Files to Create
- `public/js/theme.mjs` — theme toggle logic (~30 lines)

### Files to Modify
- `styles.css` — reduce from 1022 to ~450 lines:
  - `:root` + `[data-theme="light"]` design tokens
  - Component styles rewritten with `@apply` where appropriate
  - 7 keyframe animations (kept as-is)
  - Print / responsive / reduced-motion media queries
  - All utility class section deleted
- `index.html` — update Tailwind config, add theme toggle button
- All view/component `.mjs` files — update class names where utility classes were used, add new Tailwind classes for glassmorphism effects
- `constants.mjs` — kept as-is (business logic, not styling)

### JS Template Changes
- Existing Tailwind-name classes (`flex`, `items-center`, `gap-2`, etc.) work unchanged
- `.text-muted` → `text-[var(--text-muted)]` (or keep as `@apply` component class)
- New classes added: `backdrop-blur-md`, `bg-[var(--bg-surface)]`, `border-[var(--border)]`, etc.

## Migration Phases

### Phase 1 — Foundation
1. Update `tailwind.config` in index.html with theme extensions
2. Rewrite `:root` design tokens + add `[data-theme="light"]` overrides
3. Create `theme.mjs` + add toggle button to header
4. Update `index.html` structure
5. Verify theme switching works

### Phase 2 — Component Migration
For each component (card, btn, badge, toast, tabs, accordion, finding-card, etc.):
1. Rewrite CSS using `@apply` + Tailwind utilities where possible
2. Update JS template class names
3. Test in both themes

### Phase 3 — Page Optimization
1. Home page layout improvements (2-col grid, card styling)
2. Wizard step transitions and spacing
3. Review page animations and finding states
4. Summary stats styling
5. Add glassmorphism effects throughout

### Phase 4 — Cleanup
1. Delete unused utility classes from CSS
2. Remove dead CSS rules
3. Final cross-theme visual QA
4. Print styling verification

## Tailwind CDN

Keep `cdn.tailwindcss.com` — this is an internal tool run locally, no production deployment needed. No build system required.

## Print Mode

Always prints in light theme regardless of user setting. Existing print CSS overrides remain, updated to work with new variable names.
