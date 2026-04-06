#!/usr/bin/env bash

# Copyright (c) 2026 Mac O Kay
# Author: macokay
# License: MIT
# Source: https://github.com/macokay/proxmox-hive

set -euo pipefail

# ─── Colours ────────────────────────────────────────────────────────────────
YW=$(echo "\033[33m")
GN=$(echo "\033[1;92m")
RD=$(echo "\033[01;31m")
BL=$(echo "\033[36m")
CL=$(echo "\033[m")
CM="${GN}✓${CL}"
CROSS="${RD}✗${CL}"

msg_info()  { echo -e " ${BL}[i]${CL} $1 ..."; }
msg_ok()    { echo -e " ${CM} $1"; }
msg_error() { echo -e " ${CROSS} $1"; exit 1; }

header_info() {
  clear
  cat <<'EOF'
  ____   ____    ___ __  __ __  __   ___ __  __  _   _  ___ __     __ _____ 
  |  _ \ |  _ \  / _ \\ \/ /|  \/  | / _ \\ \/ / | | | ||_ _|\ \   / /| ____|
  | |_) || |_) || | | |\  / | |\/| || | | |\  /  | |_| | | |  \ \ / / |  _|  
  |  __/ |  _ < | |_| |/  \ | |  | || |_| |/  \  |  _  | | |   \ V /  | |___ 
  |_|    |_| \_\ \___//_/\_\|_|  |_| \___//_/\_\ |_| |_||___|   \_/   |_____|

EOF
  echo -e " ${YW}Proxmox Hive — unified Proxmox update dashboard${CL}"
  echo
}

# ─── Requirements ────────────────────────────────────────────────────────────
check_root() {
  if [[ $EUID -ne 0 ]]; then
    msg_error "This script must be run as root (try: sudo bash install.sh)"
  fi
}

check_os() {
  if ! command -v apt-get &>/dev/null; then
    msg_error "This installer requires a Debian / Ubuntu based system"
  fi
}

# ─── Docker ──────────────────────────────────────────────────────────────────
install_docker() {
  if command -v docker &>/dev/null; then
    msg_ok "Docker already installed ($(docker --version | awk '{print $3}' | tr -d ','))"
    return
  fi

  msg_info "Installing Docker"
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg lsb-release

  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/$(. /etc/os-release && echo "$ID")/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg

  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/$(. /etc/os-release && echo "$ID") \
    $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list

  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable --now docker
  msg_ok "Installed Docker"
}

# ─── Proxmox Hive ────────────────────────────────────────────────────────────
INSTALL_DIR="/opt/proxmox-hive"
IMAGE="ghcr.io/macokay/proxmox-hive:latest"
PORT="${PORT:-3000}"

deploy_proxmox_hive() {
  msg_info "Setting up Proxmox Hive in ${INSTALL_DIR}"
  mkdir -p "$INSTALL_DIR"

  cat > "$INSTALL_DIR/docker-compose.yml" <<EOF
services:
  proxmox-hive:
    image: ${IMAGE}
    container_name: proxmox-hive
    ports:
      - "${PORT}:3000"
    volumes:
      - proxmox-hive-data:/data
    restart: unless-stopped
    environment:
      - NODE_ENV=production

volumes:
  proxmox-hive-data:
EOF
  msg_ok "Created ${INSTALL_DIR}/docker-compose.yml"

  msg_info "Pulling Proxmox Hive image"
  docker compose -f "$INSTALL_DIR/docker-compose.yml" pull -q
  msg_ok "Pulled image"

  msg_info "Starting Proxmox Hive"
  docker compose -f "$INSTALL_DIR/docker-compose.yml" up -d --remove-orphans
  msg_ok "Started Proxmox Hive"
}

# ─── Entry point ─────────────────────────────────────────────────────────────
header_info
check_root
check_os
install_docker
deploy_proxmox_hive

IP=$(hostname -I | awk '{print $1}')
echo
echo -e " ${GN}Proxmox Hive is running!${CL}"
echo -e " Access it at: ${BL}http://${IP}:${PORT}${CL}"
echo
