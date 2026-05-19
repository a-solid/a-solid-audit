// skills/audit/scripts/public/js/components/story-card.mjs

export function renderStoryCard(story) {
  return `
    <div class="story-card">
      <div class="font-medium text-gray-900">${escapeHtml(story.name || story.id || "Untitled")}</div>
      ${story.description ? `<div class="text-sm text-gray-500 mt-1 line-clamp-2">${escapeHtml(story.description.slice(0, 200))}</div>` : ""}
      ${story.acceptance ? `<div class="text-xs text-gray-400 mt-1 font-medium">AC: ${escapeHtml(story.acceptance.slice(0, 150))}</div>` : ""}
    </div>`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
