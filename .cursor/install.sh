#!/usr/bin/env bash
# Cloud Agent install: one-time, idempotent bootstrap that bakes everything the
# app needs into the environment build snapshot.
#   - system packages (Docker + fuse-overlayfs) for a self-contained backend
#   - the Supabase CLI
#   - Node dependencies
#   - a local .env.local pointing at the local Supabase stack
#   - pre-pulled Supabase images (so per-boot `start` is fast)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
# shellcheck source=/dev/null
source "$REPO_ROOT/.cursor/docker-supabase.sh"

export DEBIAN_FRONTEND=noninteractive

echo "==> Installing system packages (Docker, fuse-overlayfs)"
if ! command -v dockerd >/dev/null 2>&1 || ! command -v fuse-overlayfs >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y docker.io fuse3 fuse-overlayfs
  # fuse3 ships a conffile prompt that blocks non-interactive installs.
  sudo DEBIAN_FRONTEND=noninteractive dpkg --configure -a --force-confnew || true
fi
configure_docker

echo "==> Installing the Supabase CLI"
if ! command -v supabase >/dev/null 2>&1; then
  ARCH="$(dpkg --print-architecture)"
  curl -fsSL "https://github.com/supabase/cli/releases/latest/download/supabase_linux_${ARCH}.tar.gz" -o /tmp/supabase.tar.gz
  tar -xzf /tmp/supabase.tar.gz -C /tmp
  sudo mv /tmp/supabase /usr/local/bin/supabase
fi
supabase --version

echo "==> Installing Node dependencies"
npm ci

echo "==> Writing .env.local (local Supabase, static local dev keys)"
if [ ! -f .env.local ]; then
  cp .cursor/env.local.example .env.local
fi

# NOTE: We intentionally do NOT start Supabase or pre-pull its Docker images
# here. Baking the multi-GB Supabase image set into the environment build
# snapshot exceeds the snapshot finalization limit and fails the build. The
# images are pulled on demand by the first `supabase start` in .cursor/start.sh
# (egress is open), which keeps install fast and the build snapshot small.
echo "==> Install complete"
