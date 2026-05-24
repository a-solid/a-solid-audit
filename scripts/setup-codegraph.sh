#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${HOME}/.local/share/codegraph"
echo "==> Installing CodeGraph..."

if [ -d "$INSTALL_DIR" ]; then
  echo "==> Existing installation found at $INSTALL_DIR, updating..."
  cd "$INSTALL_DIR"
  git pull
else
  git clone https://github.com/colbymchenry/codegraph.git "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

npm install && npm run build

mkdir -p "${HOME}/.local/bin"
ln -sf "$INSTALL_DIR/bin/codegraph" "${HOME}/.local/bin/codegraph"

if command -v codegraph &>/dev/null; then
  echo "==> CodeGraph installed: $(codegraph --version)"
  echo "==> You can now use AST-level analysis in project scans."
else
  echo "==> Add ${HOME}/.local/bin to your PATH, or run codegraph via:"
  echo "    ${HOME}/.local/bin/codegraph"
fi
