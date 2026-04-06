# Changelog

All notable changes to Proxmox Hive are documented here.

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
