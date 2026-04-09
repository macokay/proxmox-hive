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

msg_info()  { echo -e " ${BL}[i]${CL} $1 ..." >&2; }
msg_ok()    { echo -e " ${CM} $1" >&2; }
msg_error() { echo -e " ${CROSS} $1" >&2; exit 1; }

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
  apt-get update -qq >/dev/null 2>&1
  apt-get install -y -qq ca-certificates curl gnupg lsb-release >/dev/null 2>&1

  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/$(. /etc/os-release && echo "$ID")/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg 2>/dev/null
  chmod a+r /etc/apt/keyrings/docker.gpg

  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/$(. /etc/os-release && echo "$ID") \
    $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list

  apt-get update -qq >/dev/null 2>&1
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin >/dev/null 2>&1
  systemctl enable --now docker >/dev/null 2>&1
  msg_ok "Installed Docker"
}

# ─── Proxmox Hive ────────────────────────────────────────────────────────────
INSTALL_DIR="/opt/proxmox-hive"
PORT="${PORT:-3000}"

resolve_image() {
  local tag
  tag=$(curl -fsSL https://api.github.com/repos/macokay/proxmox-hive/releases/latest \
    | grep -o '"tag_name": *"[^"]*"' | grep -o '[0-9][^"]*')
  if [[ -n "$tag" ]]; then
    echo "ghcr.io/macokay/proxmox-hive:${tag}"
  else
    echo "ghcr.io/macokay/proxmox-hive:latest"
  fi
}

IMAGE=$(resolve_image)

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

# ─── LXC creation ────────────────────────────────────────────────────────────
LXC_HOSTNAME="proxmox-hive"
LXC_CORES=1
LXC_RAM=1536
LXC_DISK=4

get_template() {
  # Use already-downloaded Debian 12 template if available
  local tmpl
  tmpl=$(pveam list local 2>/dev/null \
    | awk '/debian-12-standard/ {print $1}' \
    | sed 's|local:vztmpl/||' \
    | sort -V | tail -1)

  if [[ -z "$tmpl" ]]; then
    msg_info "Downloading Debian 12 template"
    tmpl=$(pveam available --section system 2>/dev/null \
      | awk '/debian-12-standard/ {print $2}' \
      | sort -V | tail -1)
    [[ -z "$tmpl" ]] && msg_error "Could not find Debian 12 template in catalog"
    pveam download local "$tmpl" >/dev/null
    msg_ok "Downloaded $tmpl"
  fi

  echo "$tmpl"
}

get_storage() {
  # Pick first storage that supports rootdir content
  pvesh get /nodes/localhost/storage --output-format json 2>/dev/null \
    | grep -o '"storage":"[^"]*",".*?"content":"[^"]*rootdir[^"]*"' \
    | head -1 \
    | grep -o '"storage":"[^"]*"' \
    | cut -d'"' -f4 \
    || echo "local-lvm"
}

create_lxc() {
  local ctid
  ctid=$(pvesh get /cluster/nextid 2>/dev/null || echo 200)

  local template
  template=$(get_template)

  local storage
  storage=$(get_storage)

  msg_info "Creating LXC container ${ctid} (${LXC_CORES} cores, ${LXC_RAM}MB RAM, ${LXC_DISK}GB)"
  pct create "$ctid" "local:vztmpl/${template}" \
    -hostname "$LXC_HOSTNAME" \
    -features nesting=1,keyctl=1 \
    -cores "$LXC_CORES" \
    -memory "$LXC_RAM" \
    -rootfs "${storage}:${LXC_DISK}" \
    -net0 name=eth0,bridge=vmbr0,ip=dhcp \
    -onboot 1 \
    -unprivileged 1 \
    -start 1 >/dev/null
  msg_ok "Created LXC ${ctid}"

  msg_info "Waiting for network"
  local ip=""
  for i in {1..30}; do
    ip=$(pct exec "$ctid" -- ip -4 addr show dev eth0 2>/dev/null \
      | awk '/inet / {gsub(/\/.*/, "", $2); print $2; exit}')
    [[ -n "$ip" ]] && break
    sleep 1
  done
  [[ -z "$ip" ]] && msg_error "LXC did not get an IP address"
  msg_ok "LXC is up at ${ip}"

  msg_info "Updating LXC packages"
  pct exec "$ctid" -- bash -c \
    "apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get dist-upgrade -y -qq && apt-get install -y -qq curl locales && locale-gen en_US.UTF-8 >/dev/null" >/dev/null 2>&1
  msg_ok "Packages up to date"

  msg_info "Configuring console auto-login"
  local _override
  _override=$(mktemp)
  cat > "$_override" << 'EOF'
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin root --noclear --keep-baud tty%I 115200,38400,9600 $TERM
EOF
  pct exec "$ctid" -- mkdir -p /etc/systemd/system/container-getty@1.service.d
  pct push "$ctid" "$_override" /etc/systemd/system/container-getty@1.service.d/override.conf
  rm -f "$_override"
  pct exec "$ctid" -- bash -c \
    "systemctl daemon-reload && systemctl restart 'container-getty@1'" >/dev/null
  msg_ok "Console auto-login enabled"

  msg_info "Installing Proxmox Hive inside LXC ${ctid}"
  pct exec "$ctid" -- bash -c \
    "export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 && bash <(curl -fsSL https://raw.githubusercontent.com/macokay/proxmox-hive/main/install.sh)"
}

# ─── Entry point ─────────────────────────────────────────────────────────────
header_info
check_root

# If running on a Proxmox node, offer LXC vs direct install
if command -v pct &>/dev/null; then
  CHOICE=$(whiptail --title "Proxmox Hive — Installation" \
    --menu "\nWhere should Proxmox Hive be installed?" 14 55 2 \
    "1" "New LXC container (recommended)" \
    "2" "This Proxmox node directly" \
    3>&1 1>&2 2>&3) || msg_error "Installation cancelled"

  case "$CHOICE" in
    1) create_lxc ;;
    2)
      check_os
      install_docker
      deploy_proxmox_hive
      IP=$(hostname -I | awk '{print $1}')
      echo
      echo -e " ${GN}Proxmox Hive is running!${CL}"
      echo -e " Access it at: ${BL}http://${IP}:${PORT}${CL}"
      echo
      ;;
  esac
else
  check_os
  install_docker
  deploy_proxmox_hive
  IP=$(hostname -I | awk '{print $1}')
  echo
  echo -e " ${GN}Proxmox Hive is running!${CL}"
  echo -e " Access it at: ${BL}http://${IP}:${PORT}${CL}"
  echo
fi
