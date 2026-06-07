---
name: report-pdf-redesign
description: Optimize the Summary/Report page layout and PDF export for professional quality
---

# Report Page & PDF Export Redesign

## Problem

The current Summary (Report) page has several issues:
1. Stat cards are small and generic — no visual hierarchy for the key takeaway (overall health)
2. File table is plain — scores are just colored text, hard to scan
3. Findings section lacks grouping and visual weight
4. PDF export uses `window.print()` with basic print CSS — output looks generic and lacks professional polish
5. No executive summary or overall score on the report
6. Print forces all text to black (#000) and serif font — unnecessary and degrading

## Design

### 1. Overall Score Hero Section

Add a prominent overall score at the top of the report (below the header, above stat cards):
- Large circular score indicator (average of all file scores, out of 10)
- Color-coded: green (7+), amber (4-6), red (<4)
- Subtitle: "X files reviewed · Y findings"
- Only shown when there are files with scores

### 2. Stat Cards Redesign

Current: 6 equal cards in a grid. New layout:
- Top row: 2-3 key metrics (Total Files, Total Findings, Overall Score) — larger cards
- Bottom row: status breakdown (Need Fix, Won't Fix, Not an Issue, Well Done) — smaller pills/badges inline
- On mobile: stack vertically

### 3. File Table Improvements

- Add a colored progress-bar style score indicator next to each score value
- Show score as a mini bar (filled proportion, colored by scoreColor)
- Wrap status badges more cleanly

### 4. Findings by File Section

- Add severity distribution summary per file (e.g., "2 high, 1 medium")
- High-priority findings get a subtle left border accent by severity color
- Accordion items (from previous task) remain as-is

### 5. PDF Export Improvements

**Print CSS overhaul:**
- Remove serif font override (keep Inter/sans-serif — more professional for tech reports)
- Expand all accordions in print (force `<details>` open)
- Show all findings (both high-priority and resolved) in print
- Add a report footer with generation timestamp
- Add page header with project name on subsequent pages
- Improve table borders for print (heavier lines)
- Ensure severity badges keep their colors in print (don't force all to black)
- Add `@page` margin rules for consistent print margins
- Add "page X of Y" style consideration (via CSS counters if feasible)

**Report metadata:**
- Show round name, date, reviewer info prominently
- Add a legend for severity colors and status badges

### 6. Summary Finding Enhancement

For the report view specifically (not the interactive view), high-priority findings should also show suggestion and line number inline (no accordion needed in print — everything expanded).

## Files Changed

| File | Change |
|------|--------|
| `js/views/round-summary.mjs` | Add overall score hero, redesign stat cards, enhance file table, add print metadata |
| `styles.css` | Overhaul `@media print` section, add report-specific styles |

## Scope Notes

- This is a visual/structural redesign of the existing summary page
- No data model changes — same API, same data
- PDF export still uses `window.print()` but with much better print CSS
- Interactive features (toggle, accordion) still work on screen; print shows everything expanded
