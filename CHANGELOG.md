# Changelog

All notable changes to Proxmox Hive are documented here.

## [1.0.4] - 2026-04-07

### Added
- Timezone support for scheduled checks — set an IANA timezone per site (e.g. `Europe/Copenhagen`) in Settings → Check Schedule so checks run at local time instead of UTC
- Proxmox Hive self-update via auto-update groups — add "Proxmox Hive" as a target in an auto-update group to apply new releases on a schedule, the same as clicking "Update now"

### Fixed
- Version display always visible in footer — non-release builds show `1.0.4-abc1234` (tag + commit hash) so you always know exactly what is running
- Self-update banner no longer triggers on post-release commits — comparison now uses base semver so `1.0.4-abc1234` is not considered behind `1.0.4`
- Self-update apply now pins `docker-compose.yml` to the specific release tag before pulling — prevents future `docker compose pull` from drifting to untagged commits
- Install script resolves the latest release tag from the GitHub API — new installs always get the latest stable release instead of the latest commit
- CI now fetches full git history so `git describe` correctly finds the nearest version tag

## [1.0.3] - 2026-04-06

### Added
- Self-update notifications — a banner appears when a new GitHub release is available, with an "Update now" button that pulls the latest image and restarts the container with live log output
- Non-apt LXC support — containers running Alpine (apk), Fedora/CentOS (dnf/yum) are now detected and updated with the correct package manager; unsupported OS shows a badge instead of an error

## [1.0.2] - 2026-04-06

### Fixed
- App version now injected at build time from git tag and served via `/api/version` — footer always reflects the running release

## [1.0.1] - 2026-04-06

### Added
- CI workflow to build and publish Docker image to GHCR on every push to `main` and on version tags
- Install script now prompts whether to deploy into a new LXC container or directly on the current machine — when run on a Proxmox node, a `whiptail` menu offers both options; the LXC path auto-selects the next available CT ID, downloads a Debian 12 template if needed, upgrades all packages, and runs the install inside the container

### Fixed
- LXC console auto-login (no password prompt when opening the Proxmox web console)
- Suppressed apt and locale output during install — only progress messages are shown

## [1.0.0] - 2026-04-04

### Added
- Multi-site support — manage multiple Proxmox hosts from a single dashboard
- Node update tracking via `apt list --upgradable` over SSH
- LXC container update tracking via `pct exec`
- VM update tracking via QEMU guest agent
- Docker app update detection (Watchtower-compatible)
- Live terminal log during updates via WebSocket
- Automated checks at 08:00 and 20:00 (configurable)
- Notification channels: Discord, Slack, Microsoft Teams, generic webhook
- Per-channel alert configuration (updates found, success, failure, all clear)
- Setup wizard for first-time configuration
- SSH key authentication with guided setup instructions
