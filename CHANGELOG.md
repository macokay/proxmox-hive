# Changelog

All notable changes to Proxmox Hive are documented here.

## [Unreleased]

### Added
- CI workflow to build and publish Docker image to GHCR on every push to `main` and on version tags
- Install script now prompts whether to deploy into a new LXC container or directly on the current machine — when run on a Proxmox node, a `whiptail` menu offers both options; the LXC path auto-selects the next available CT ID, downloads a Debian 12 template if needed, and runs the install inside the container

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
