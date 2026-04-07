<p align="center">
  <img src="client/public/hive.svg" width="96" alt="Proxmox Hive" />
</p>

<h1 align="center">Proxmox Hive</h1>

<p align="center">
  A self-hosted dashboard for monitoring and applying updates across your Proxmox infrastructure — nodes, LXC containers, and VMs — from a single interface.
</p>

<p align="center">
  <a href="https://github.com/macokay/proxmox-hive/releases">
    <img src="https://img.shields.io/github/v/release/macokay/proxmox-hive" alt="GitHub release" />
  </a>
  <img src="https://img.shields.io/badge/React-61DAFB?logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white" alt="Docker" />
  <a href="https://github.com/macokay/proxmox-hive/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/License-Non--Commercial-blue.svg" alt="License" />
  </a>
</p>

<p align="center">
  <a href="https://www.buymeacoffee.com/macokay">
    <img src="https://img.shields.io/badge/Buy%20Me%20A%20Coffee-%23FFDD00.svg?logo=buy-me-a-coffee&logoColor=black" alt="Buy Me A Coffee" />
  </a>
</p>

---

## Features

- **Multi-site** — manage multiple Proxmox hosts from one dashboard
- **Node updates** — detects available apt packages on the Proxmox host
- **LXC updates** — tracks package updates inside containers via `pct exec`
- **VM updates** — detects packages via QEMU guest agent
- **App updates** — detects new versions of Plex, Jellyfin, Sonarr, Radarr, and more
- **Scheduled checks** — automatic checks at 08:00 and 20:00 (configurable)
- **Live terminal** — real-time log output during updates via WebSocket
- **Notifications** — Discord, Slack, Microsoft Teams, and generic webhooks
- **Setup wizard** — guided first-time configuration

---

## Requirements

| Requirement | Details |
|---|---|
| Server | Any host that can run Docker |
| Proxmox | Reachable via SSH from the Docker host |
| SSH access | Key-based or password auth (key recommended) |

---

## Installation

### Automatic (recommended)

Run the following on your **Proxmox node**:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/macokay/proxmox-hive/main/install.sh)"
```

When run on a Proxmox node the script prompts you to choose between:

- **New LXC container** — creates a dedicated Debian 12 container, upgrades it, installs Docker and Proxmox Hive inside it, and configures console auto-login. Recommended.
- **This machine** — installs Docker and Proxmox Hive directly on the node.

When run on any other Debian/Ubuntu host (e.g. an existing LXC or VM) it installs directly without prompting.

After installation open `http://<ip>:3000` and follow the setup wizard.

### Manual

```bash
git clone https://github.com/macokay/proxmox-hive.git
cd proxmox-hive
docker compose up -d
```

Open `http://<your-server>:3000` and follow the setup wizard.

---

## Configuration

### SSH access to Proxmox

Proxmox Hive connects to your Proxmox host over SSH. Run all commands in the Proxmox **Shell** tab or via `ssh root@PROXMOX-IP`.

---

#### Option A — Restricted user + SSH key ✓ Recommended

Creates a dedicated low-privilege user. SSH keys only, no password. Limits blast radius if credentials are ever compromised.

```bash
# Step 1 — Create user + restricted sudo
apt install sudo -y
adduser pvedash --disabled-password --gecos ""
echo "pvedash ALL=(ALL) NOPASSWD: /usr/bin/apt*,/usr/sbin/pct" | tee /etc/sudoers.d/pvedash
chmod 440 /etc/sudoers.d/pvedash

# Step 2 — Generate & install SSH key
ssh-keygen -t ed25519 -f ~/.ssh/pvedash -N ""
mkdir -p /home/pvedash/.ssh
cat ~/.ssh/pvedash.pub >> /home/pvedash/.ssh/authorized_keys
chmod 700 /home/pvedash/.ssh && chmod 600 /home/pvedash/.ssh/authorized_keys
chown -R pvedash:pvedash /home/pvedash/.ssh

# Step 3 — Print private key (copy output → paste into Proxmox Hive)
cat ~/.ssh/pvedash
```

In the setup wizard: username `pvedash`, paste the private key (not the `.pub` file).

---

#### Option B — Root + SSH key

No extra user needed. Simpler, but the SSH key has full root access to the host.

```bash
# Step 1 — Allow root SSH key login
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
systemctl reload sshd

# Step 2 — Generate & install SSH key
ssh-keygen -t ed25519 -f ~/.ssh/pvedash -N ""
cat ~/.ssh/pvedash.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys

# Step 3 — Print private key (copy output → paste into Proxmox Hive)
cat ~/.ssh/pvedash
```

In the setup wizard: username `root`, paste the private key.

---

#### Option C — Password auth ✗ Not recommended

Uses password authentication instead of SSH keys. Less secure — switch to Option A when possible.

```bash
# Step 1 — Create user with password
apt install sudo -y
adduser pvedash --gecos ""
echo "pvedash ALL=(ALL) NOPASSWD: /usr/bin/apt*,/usr/sbin/pct" | tee /etc/sudoers.d/pvedash
chmod 440 /etc/sudoers.d/pvedash
passwd pvedash

# Step 2 — Enable password authentication
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config
systemctl reload sshd
```

In the setup wizard: username `pvedash`, select **Password** auth and enter the password set above.

---

### Data

Configuration is stored in a Docker volume (`proxmox-hive-data`) at `/data/config.json` inside the container.

---

## Updating

### Using the built-in self-update

When a new release is available, a banner appears at the top of the dashboard with an **Update now** button. Clicking it pulls the new release image and restarts the container automatically — no terminal needed.

You can also include **Proxmox Hive** as a target in an auto-update group (Settings → Auto-Update Groups). When the group runs at its scheduled time it checks GitHub for a new release and applies it the same way as the banner button.

### Manual update to latest release

```bash
TAG=$(curl -fsSL https://api.github.com/repos/macokay/proxmox-hive/releases/latest | grep -o '"tag_name": *"[^"]*"' | grep -o '"v[^"]*"' | tr -d '"') && [ -n "$TAG" ] && sed -i "s|image: .*proxmox-hive:.*|image: ghcr.io/macokay/proxmox-hive:${TAG}|" /opt/proxmox-hive/docker-compose.yml && docker compose -f /opt/proxmox-hive/docker-compose.yml pull && docker compose -f /opt/proxmox-hive/docker-compose.yml up -d
```

### Update to latest commit (pre-release)

> ⚠ The `latest` tag tracks the `main` branch and may include unreleased or unstable changes.

```bash
sed -i "s|image: .*proxmox-hive:.*|image: ghcr.io/macokay/proxmox-hive:latest|" /opt/proxmox-hive/docker-compose.yml && docker compose -f /opt/proxmox-hive/docker-compose.yml pull && docker compose -f /opt/proxmox-hive/docker-compose.yml up -d
```

---

## Known Limitations

- LXC containers must be **running** to have their packages checked or updated.
- VM package detection requires the **QEMU guest agent** to be installed and running.
- One Proxmox node per site.
- LXC containers running an unrecognised OS show an "Unsupported OS" badge and are skipped during updates.

---

## Credits

Built by [Mac O Kay](https://github.com/macokay).

---

## License

&copy; 2026 Mac O Kay

Free to use and modify for personal, non-commercial use. Attribution appreciated if you share or build upon this work. Commercial use is not permitted.
