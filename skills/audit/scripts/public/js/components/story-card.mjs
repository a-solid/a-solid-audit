// skills/audit/scripts/public/js/components/story-card.mjs
import { escapeHtml, icon } from "../app.mjs";

export function renderStoryCard(story) {
  return `
    <div class="story-card">
      <div class="flex items-center gap-2">
        <span style="color:var(--accent)">${icon("clipboard", 14)}</span>
        <span class="font-medium">${escapeHtml(story.name || story.id || "Untitled")}</span>
      </div>
      ${story.description ? `<div class="text-sm text-secondary mt-2" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${escapeHtml(story.description.slice(0, 200))}</div>` : ""}
      ${story.acceptance ? `<div class="text-xs text-muted mt-2 flex items-start gap-1">
        ${icon("check", 12)}
        <span>${escapeHtml(story.acceptance.slice(0, 150))}</span>
      </div>` : ""}
    </div>`;
}
