// skills/audit/scripts/public/js/components/scope-file-tree.mjs
import { escapeHtml, icon } from "../app.mjs";

export function renderScopeFileTree(container, files) {
  let checkedFiles = new Set(files.map(f => f.path));
  const allFilePaths = new Set(files.map(f => f.path));

  function render() {
    const { selected, total } = getCounts();
    container.innerHTML = `
      <div class="scope-tree-header">
        <label class="scope-tree-select-all">
          <input type="checkbox" id="scope-select-all" ${selected === total ? "checked" : ""}>
          <span>Select all</span>
        </label>
        <span class="scope-tree-count">${selected}/${total} files</span>
      </div>
      <div class="scope-tree">
        ${files.map(file => {
          const isChecked = checkedFiles.has(file.path);
          const isNew = file.additions > 0 && file.deletions === 0 && file.isNew;
          return `
            <div class="scope-tree-node" style="padding-left:12px">
              <input type="checkbox" data-action="toggle-file" data-path="${escapeHtml(file.path)}" ${isChecked ? "checked" : ""}>
              <span class="scope-tree-file-name" title="${escapeHtml(file.path)}">${escapeHtml(file.path)}</span>
              ${isNew ? '<span class="scope-tree-badge new">new</span>' : ""}
              <span class="scope-tree-stats">+${file.additions} −${file.deletions}</span>
            </div>`;
        }).join("")}
      </div>`;

    document.getElementById("scope-select-all")?.addEventListener("change", (e) => {
      checkedFiles = e.target.checked ? new Set(allFilePaths) : new Set();
      container.querySelectorAll("[data-action='toggle-file']").forEach(cb => {
        cb.checked = e.target.checked;
      });
      updateSelectAllState();
      container.dispatchEvent(new Event("change", { bubbles: true }));
    });

    container.querySelectorAll("[data-action='toggle-file']").forEach(el => {
      el.addEventListener("change", (e) => {
        e.stopPropagation();
        const filePath = el.dataset.path;
        if (checkedFiles.has(filePath)) checkedFiles.delete(filePath);
        else checkedFiles.add(filePath);
        updateSelectAllState();
        updateCounts();
        container.dispatchEvent(new Event("change", { bubbles: true }));
      });
    });

    updateSelectAllState();
  }

  function updateCounts() {
    const countEl = container.querySelector(".scope-tree-count");
    if (countEl) countEl.textContent = `${checkedFiles.size}/${allFilePaths.size} files`;
  }

  function updateSelectAllState() {
    const selectAll = document.getElementById("scope-select-all");
    if (selectAll) {
      selectAll.checked = checkedFiles.size === allFilePaths.size;
      selectAll.indeterminate = checkedFiles.size > 0 && checkedFiles.size < allFilePaths.size;
    }
    updateCounts();
  }

  function getCounts() {
    return { selected: checkedFiles.size, total: allFilePaths.size };
  }

  render();

  return {
    getExcludedFiles: () => [...allFilePaths].filter(f => !checkedFiles.has(f)),
    getSelectedCount: getCounts,
  };
}
