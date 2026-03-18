#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend-node"
FRONTEND_DIR="$ROOT_DIR/frontend"

install_if_missing() {
  local dir="$1"
  local label="$2"

  if [ ! -d "$dir/node_modules" ]; then
    echo "📦 Dépendances manquantes pour $label, installation en cours..."
    (cd "$dir" && npm install)
  fi
}

install_if_missing "$BACKEND_DIR" "backend"
install_if_missing "$FRONTEND_DIR" "frontend"

echo "🏗️ Build backend (vérification dépendances)..."
(cd "$BACKEND_DIR" && npm install)

echo "🏗️ Build frontend..."
(cd "$FRONTEND_DIR" && npm run build)
