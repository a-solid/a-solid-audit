// skills/audit/scripts/public/js/components/scope-file-tree.mjs
import { escapeHtml, icon } from "../app.mjs";

export function renderScopeFileTree(container, files) {
  let checkedFiles = new Set(files.map(f => f.path));
  let expandedDirs = new Set();
  const allFilePaths = new Set(files.map(f => f.path));

  const tree = buildTree(files);

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
        ${renderNodes(tree.children, 0)}
      </div>`;

    document.getElementById("scope-select-all")?.addEventListener("change", (e) => {
      if (e.target.checked) {
        checkedFiles = new Set(allFilePaths);
      } else {
        checkedFiles = new Set();
      }
      // Update all file checkboxes directly
      container.querySelectorAll("[data-action='toggle-file']").forEach(cb => {
        cb.checked = e.target.checked;
      });
      container.querySelectorAll("[data-action='toggle-folder']").forEach(cb => {
        cb.checked = e.target.checked;
        cb.indeterminate = false;
      });
      updateSelectAllState();
      container.dispatchEvent(new Event("change", { bubbles: true }));
    });

    wireEvents();
  }

  function renderCounts() {
    const { selected, total } = getCounts();
    const countEl = container.querySelector(".scope-tree-count");
    if (countEl) countEl.textContent = `${selected}/${total} files`;
    updateSelectAllState();
  }

  function updateSelectAllState() {
    const { selected, total } = getCounts();
    const selectAll = document.getElementById("scope-select-all");
    if (selectAll) {
      selectAll.checked = selected === total;
      selectAll.indeterminate = selected > 0 && selected < total;
    }
  }

  function updateFolderCheckboxes(changedPath) {
    // Walk up from the changed file's parent folders
    const parts = changedPath.split("/");
    for (let i = parts.length - 1; i > 0; i--) {
      const dirPath = parts.slice(0, i).join("/");
      const node = findFolderNode(tree, dirPath);
      if (!node) continue;
      const cb = container.querySelector(`[data-action="toggle-folder"][data-path="${CSS.escape(dirPath)}"]`);
      if (!cb) continue;
      const isChecked = isFolderChecked(node);
      const isPartial = isFolderPartial(node);
      cb.checked = isChecked;
      cb.indeterminate = !isChecked && isPartial;
    }
  }

  function renderNodes(nodes, depth) {
    if (!nodes || nodes.length === 0) return "";
    return nodes.map(node => {
      const indent = depth * 20;
      if (node.type === "folder") {
        const isExpanded = expandedDirs.has(node.path);
        const isChecked = isFolderChecked(node);
        const isIndeterminate = !isChecked && isFolderPartial(node);
        return `
          <div class="scope-tree-node" data-folder-path="${escapeHtml(node.path)}" style="padding-left:${12 + indent}px">
            <input type="checkbox" data-action="toggle-folder" data-path="${escapeHtml(node.path)}" ${isChecked ? "checked" : ""} ${isIndeterminate ? 'class="indeterminate"' : ""}>
            <span class="scope-tree-folder-toggle ${isExpanded ? "expanded" : ""}" data-action="expand" data-path="${escapeHtml(node.path)}">${icon("chevronRight", 12)}</span>
            <span class="scope-tree-folder-icon">${icon("folder", 14)}</span>
            <span class="scope-tree-folder-name">${escapeHtml(node.name)}</span>
          </div>
          ${isExpanded ? renderNodes(node.children, depth + 1) : ""}`;
      }
      const file = node.file;
      const isChecked = checkedFiles.has(file.path);
      return `
        <div class="scope-tree-node" data-file-path="${escapeHtml(file.path)}" style="padding-left:${12 + indent + 20}px">
          <input type="checkbox" data-action="toggle-file" data-path="${escapeHtml(file.path)}" ${isChecked ? "checked" : ""}>
          <span class="scope-tree-file-name" title="${escapeHtml(file.path)}">${escapeHtml(node.name)}</span>
          <span class="scope-tree-stats">+${file.additions} −${file.deletions}</span>
        </div>`;
    }).join("");
  }

  function wireEvents() {
    container.querySelectorAll("[data-action='expand']").forEach(el => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const dirPath = el.dataset.path;
        if (expandedDirs.has(dirPath)) expandedDirs.delete(dirPath);
        else expandedDirs.add(dirPath);
        render();
      });
    });

    container.querySelectorAll("[data-action='toggle-folder']").forEach(el => {
      el.addEventListener("change", (e) => {
        e.stopPropagation();
        const dirPath = el.dataset.path;
        const node = findFolderNode(tree, dirPath);
        if (!node) return;
        const folderFiles = getFolderFiles(node);
        const shouldCheck = !isFolderChecked(node);
        if (shouldCheck) {
          folderFiles.forEach(f => checkedFiles.add(f));
        } else {
          folderFiles.forEach(f => checkedFiles.delete(f));
        }
        // Update descendant file checkboxes directly
        folderFiles.forEach(f => {
          const fileCb = container.querySelector(`[data-action="toggle-file"][data-path="${CSS.escape(f)}"]`);
          if (fileCb) fileCb.checked = shouldCheck;
        });
        // Update descendant folder checkboxes
        updateDescendantFolderCheckboxes(node, shouldCheck);
        // Walk up and update parent folder checkboxes
        const parts = dirPath.split("/");
        for (let i = parts.length - 1; i > 0; i--) {
          const parentPath = parts.slice(0, i).join("/");
          const parentNode = findFolderNode(tree, parentPath);
          if (!parentNode) continue;
          const parentCb = container.querySelector(`[data-action="toggle-folder"][data-path="${CSS.escape(parentPath)}"]`);
          if (!parentCb) continue;
          parentCb.checked = isFolderChecked(parentNode);
          parentCb.indeterminate = !isFolderChecked(parentNode) && isFolderPartial(parentNode);
        }
        renderCounts();
        container.dispatchEvent(new Event("change", { bubbles: true }));
      });
    });

    container.querySelectorAll("[data-action='toggle-file']").forEach(el => {
      el.addEventListener("change", (e) => {
        e.stopPropagation();
        const filePath = el.dataset.path;
        if (checkedFiles.has(filePath)) checkedFiles.delete(filePath);
        else checkedFiles.add(filePath);
        // Update parent folder checkbox states (walk up)
        updateFolderCheckboxes(filePath);
        renderCounts();
        container.dispatchEvent(new Event("change", { bubbles: true }));
      });
    });

    // Set indeterminate state on folder checkboxes
    container.querySelectorAll(".indeterminate").forEach(el => {
      el.indeterminate = true;
    });

    // Set indeterminate state on Select All checkbox
    updateSelectAllState();
  }

  function updateDescendantFolderCheckboxes(node, checked) {
    for (const child of node.children) {
      if (child.type === "folder") {
        const cb = container.querySelector(`[data-action="toggle-folder"][data-path="${CSS.escape(child.path)}"]`);
        if (cb) {
          cb.checked = checked;
          cb.indeterminate = false;
        }
        updateDescendantFolderCheckboxes(child, checked);
      }
    }
  }

  function isFolderChecked(node) {
    const files = getFolderFiles(node);
    return files.length > 0 && files.every(f => checkedFiles.has(f));
  }

  function isFolderPartial(node) {
    const files = getFolderFiles(node);
    return files.some(f => checkedFiles.has(f));
  }

  function getFolderFiles(node) {
    const result = [];
    for (const child of node.children) {
      if (child.type === "file") result.push(child.file.path);
      else result.push(...getFolderFiles(child));
    }
    return result;
  }

  function findFolderNode(node, path) {
    if (node.type === "folder" && node.path === path) return node;
    if (node.children) {
      for (const child of node.children) {
        const found = findFolderNode(child, path);
        if (found) return found;
      }
    }
    return null;
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

function buildTree(files) {
  const root = { type: "folder", name: "", path: "", children: [] };

  for (const file of files) {
    const parts = file.path.split("/");
    let current = root;

    for (let i = 0; i < parts.length - 1; i++) {
      const dirPath = parts.slice(0, i + 1).join("/");
      let child = current.children.find(c => c.type === "folder" && c.path === dirPath);
      if (!child) {
        child = { type: "folder", name: parts[i], path: dirPath, children: [] };
        current.children.push(child);
      }
      current = child;
    }

    current.children.push({
      type: "file",
      name: parts[parts.length - 1],
      file,
    });
  }

  sortTree(root);
  return root;
}

function sortTree(node) {
  if (!node.children) return;
  node.children.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  node.children.forEach(sortTree);
}
