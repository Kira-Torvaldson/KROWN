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

cleanup() {
  echo
  echo "🛑 Arrêt des services..."
  if [ -n "${BACKEND_PID:-}" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
  if [ -n "${FRONTEND_PID:-}" ] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
    kill "$FRONTEND_PID" 2>/dev/null || true
  fi
}

trap cleanup INT TERM EXIT

echo "🚀 Démarrage backend..."
(cd "$BACKEND_DIR" && npm run dev) &
BACKEND_PID=$!

echo "🚀 Démarrage frontend..."
(cd "$FRONTEND_DIR" && npm run dev) &
FRONTEND_PID=$!

wait "$BACKEND_PID" "$FRONTEND_PID"
