// skills/audit/scripts/public/js/components/file-tree.mjs

// Renders a file list with checkboxes. Returns selected files getter.
export function renderFileTree(container, files) {
  let selected = new Set();

  function render() {
    container.innerHTML = files.map(f => {
      const isSelected = selected.has(f);
      return `
        <div class="file-tree-item ${isSelected ? "selected" : ""}" data-file="${escapeHtml(f)}">
          <input type="checkbox" ${isSelected ? "checked" : ""}>
          <span>${escapeHtml(f)}</span>
        </div>`;
    }).join("");

    container.querySelectorAll(".file-tree-item").forEach(item => {
      item.addEventListener("click", () => {
        const file = item.dataset.file;
        if (selected.has(file)) selected.delete(file);
        else selected.add(file);
        render();
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

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
