#!/usr/bin/env bash
# Cloud Agent start: per-boot reconciliation. Brings up the Docker daemon and
# the local Supabase stack (fast, because images are already cached), then
# returns. The Next.js dev server runs separately as a terminal.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
# shellcheck source=/dev/null
source "$REPO_ROOT/.cursor/docker-supabase.sh"

configure_docker
start_dockerd
fix_container_networking

if [ ! -f .env.local ]; then
  cp .cursor/env.local.example .env.local
fi

echo "==> Starting local Supabase"
# Idempotent: if the stack is already up this is effectively a no-op.
supabase start

echo "==> Environment ready. Supabase API on http://127.0.0.1:54321, app will run on http://localhost:3000"
