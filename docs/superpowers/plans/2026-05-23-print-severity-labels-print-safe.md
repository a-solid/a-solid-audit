# Print-Safe Severity Labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make severity labels and badges visually distinct when printed to PDF by adding borders that survive browser background-stripping.

**Architecture:** Add `border` declarations to four CSS selectors in print.html's inline `<style>` block. Borders are never stripped during print, so elements remain visually contained even when `background` is lost.

**Tech Stack:** CSS only — no HTML or JS changes.

---

### Task 1: Add borders to gray-background elements

**Files:**
- Modify: `skills/audit/scripts/public/print.html:58-93` (inline CSS)

- [ ] **Step 1: Add border to `.sev-label`**

In `print.html`, change the `.sev-label` rule from:

```css
.sev-label {
  font-size: 10px; font-weight: 700; min-width: 60px; text-align: center;
  padding: 2px 6px; border-radius: 3px; letter-spacing: 0.3px;
  background: #f1f5f9; color: #1a1a2e;
}
```

to:

```css
.sev-label {
  font-size: 10px; font-weight: 700; min-width: 60px; text-align: center;
  padding: 2px 6px; border-radius: 3px; letter-spacing: 0.3px;
  border: 1px solid #94a3b8;
  background: #f1f5f9; color: #1a1a2e;
}
```

- [ ] **Step 2: Add border to `.sev-track`**

Change the `.sev-track` rule from:

```css
.sev-track { flex: 1; height: 8px; background: #f1f5f9; border-radius: 2px; overflow: hidden; }
```

to:

```css
.sev-track { flex: 1; height: 8px; background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 2px; overflow: hidden; }
```

- [ ] **Step 3: Add border to `.badge`**

Change the `.badge` rule from:

```css
.badge {
  display: inline-block; font-size: 10px; font-weight: 700;
  padding: 1px 6px; border-radius: 3px; line-height: 1.5;
  background: #f1f5f9; color: #1a1a2e;
}
```

to:

```css
.badge {
  display: inline-block; font-size: 10px; font-weight: 700;
  padding: 1px 6px; border-radius: 3px; line-height: 1.5;
  border: 1px solid #94a3b8;
  background: #f1f5f9; color: #1a1a2e;
}
```

- [ ] **Step 4: Add border to `.badge-sev`**

Change the `.badge-sev` rule from:

```css
.badge-sev { background: #f1f5f9; color: #1a1a2e; }
```

to:

```css
.badge-sev { background: #f1f5f9; color: #1a1a2e; border: 1px solid #94a3b8; }
```

- [ ] **Step 5: Verify visually**

Open `http://localhost:3456/print.html` in a browser, trigger print (Cmd+P), and confirm:
- Severity labels in "Findings by Severity" section have visible borders
- Severity badges on individual findings have visible borders
- Bar chart tracks have visible borders
- Elements look aligned and contained even with "Background graphics" unchecked

- [ ] **Step 6: Commit**

```bash
git add skills/audit/scripts/public/print.html
git commit -m "fix: add print-safe borders to severity labels and badges"
```
