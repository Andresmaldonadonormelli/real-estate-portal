#!/usr/bin/env bash
# Shared helpers for bringing up Docker (in a nested Cloud Agent VM) and the
# local Supabase stack. Sourced by both install.sh and start.sh.
set -euo pipefail

DOCKERD_LOG=/var/log/cursor-dockerd.log

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

open_docker_socket() {
  # Let the non-root environment user (and the Supabase CLI it runs) reach the
  # daemon without sudo. usermod is durable but only applies to new logins, so
  # we also relax the live socket for the current session.
  sudo usermod -aG docker "$(id -un)" 2>/dev/null || true
  sudo chmod 666 /var/run/docker.sock 2>/dev/null || true
}

reset_supabase() {
  # Clear any leftover local Supabase state before starting. A base snapshot may
  # have captured running/half-started project containers; without this,
  # `supabase start` reports "already running" and fails on unhealthy containers.
  supabase stop --no-backup >/dev/null 2>&1 || true
  local stale
  stale="$(sudo docker ps -aq --filter 'name=supabase_' 2>/dev/null || true)"
  if [ -n "$stale" ]; then
    sudo docker rm -f $stale >/dev/null 2>&1 || true
  fi
}

start_dockerd() {
  if sudo docker info >/dev/null 2>&1; then
    echo "dockerd already running"
    open_docker_socket
    return 0
  fi
  echo "starting dockerd..."
  # Pre-create the log with open perms and background via `sudo -b` so the
  # redirect target is always writable regardless of who owns /tmp or /var/log.
  sudo mkdir -p "$(dirname "$DOCKERD_LOG")"
  sudo touch "$DOCKERD_LOG"
  sudo chmod 666 "$DOCKERD_LOG"
  sudo -b sh -c "exec dockerd >>'$DOCKERD_LOG' 2>&1"
  for _ in $(seq 1 60); do
    if sudo docker info >/dev/null 2>&1; then
      echo "dockerd is ready"
      open_docker_socket
      return 0
    fi
    sleep 1
  done
  echo "ERROR: dockerd did not become ready; see $DOCKERD_LOG" >&2
  sudo tail -n 30 "$DOCKERD_LOG" >&2 || true
  return 1
}
