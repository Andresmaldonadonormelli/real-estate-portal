#!/usr/bin/env bash
# Shared helpers for bringing up Docker (in a nested Cloud Agent VM) and the
# local Supabase stack. Sourced by both install.sh and start.sh.
set -euo pipefail

DOCKERD_LOG=/tmp/dockerd.log

configure_docker() {
  # fuse-overlayfs is the only storage driver that mounts correctly inside the
  # nested Cloud Agent VM (overlay2 fails to mount, vfs is too slow and makes
  # Postgres time out during Supabase's schema init).
  sudo mkdir -p /etc/docker
  echo '{"storage-driver":"fuse-overlayfs"}' | sudo tee /etc/docker/daemon.json >/dev/null
}

fix_container_networking() {
  # Docker publishes its rules in the nft tables, but the legacy iptables
  # FORWARD chain defaults to DROP and bridge-nf routes container-to-container
  # traffic through it, which silently breaks the Supabase containers talking to
  # Postgres. Bypass bridge netfilter and open the legacy FORWARD policy.
  sudo sysctl -w net.bridge.bridge-nf-call-iptables=0 >/dev/null 2>&1 || true
  sudo sysctl -w net.bridge.bridge-nf-call-ip6tables=0 >/dev/null 2>&1 || true
  sudo iptables-legacy -P FORWARD ACCEPT 2>/dev/null || true
}

start_dockerd() {
  if sudo docker info >/dev/null 2>&1; then
    echo "dockerd already running"
    return 0
  fi
  echo "starting dockerd..."
  sudo bash -c "nohup dockerd >>'$DOCKERD_LOG' 2>&1 &"
  for _ in $(seq 1 30); do
    if sudo docker info >/dev/null 2>&1; then
      echo "dockerd is ready"
      return 0
    fi
    sleep 1
  done
  echo "ERROR: dockerd did not become ready; see $DOCKERD_LOG" >&2
  return 1
}
