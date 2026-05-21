// skills/audit/scripts/public/js/components/file-tree.mjs
import { escapeHtml, icon } from "../app.mjs";

export function renderFileTree(container, files) {
  let selected = new Set();

  function render() {
    container.innerHTML = files.map(f => {
      const isSelected = selected.has(f);
      return `
        <div class="file-tree-item ${isSelected ? "selected" : ""}" data-file="${escapeHtml(f)}">
          <input type="checkbox" ${isSelected ? "checked" : ""}>
          <span style="color:var(--text-muted);flex-shrink:0">${icon("file", 14)}</span>
          <span>${escapeHtml(f)}</span>
        </div>`;
    }).join("");

    container.querySelectorAll(".file-tree-item").forEach(item => {
      item.addEventListener("click", (e) => {
        if (e.target.tagName === "INPUT") return;
        const file = item.dataset.file;
        if (selected.has(file)) selected.delete(file);
        else selected.add(file);
        render();
        container.dispatchEvent(new Event("change", { bubbles: true }));
      });
      const checkbox = item.querySelector("input[type=checkbox]");
      checkbox?.addEventListener("change", () => {
        const file = item.dataset.file;
        if (selected.has(file)) selected.delete(file);
        else selected.add(file);
        render();
        container.dispatchEvent(new Event("change", { bubbles: true }));
      });
    });
  }

  render();

  return {
    getSelected: () => [...selected],
    setSelected: (files) => { selected = new Set(files); render(); },
    clear: () => { selected.clear(); render(); },
  };
}
