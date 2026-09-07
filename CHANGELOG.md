# Changelog

All notable changes to Proxmox Hive are documented here.

## [1.0.27] - 2026-09-07

### Fixed
- Update terminals no longer spin forever after the server goes away mid-update. Job state lived only in the browser tab, so an update whose closing event never arrived — the server was restarted or killed while it ran — stayed "running" until a hard reload. The server now tracks running updates and sends the live set on every WebSocket connect; a tab reconciles against it and marks orphaned terminals `Interrupted`, which says the result is unknown rather than claiming success or failure
- Upgrading Docker inside the container that hosts Proxmox Hive now warns before it starts. dpkg restarts the Docker daemon, which stops Hive's own container mid-stream, so the log simply cut off with no explanation while the upgrade finished unattended on the target
- The terminal overlay header counted finished terminals as running ("2 updates running" with one of them already done). It now reports how many are actually still going, and says "finished" once they all are
- Beta updates now do what the toggle says. The check only entered the beta channel for installs that were *already* running a dev build, so turning the setting on from a stable release did nothing at all and no stable install ever saw a dev build. It now takes whichever build is newest — comparing the release tag against the dev branch decides which that is, so a fix landed straight on main still wins over an older dev branch

### Changed
- The update check lives in one function shared by the API and the background poll, instead of the same branching logic written twice in two files that could disagree

## [1.0.26] - 2026-08-11

### Fixed
- Stable installs can finally see updates. Before offering one, the app checked ghcr for an image tagged `v<version>`, but releases are published as `<version>` — that tag has never existed, so the update never appeared on the stable channel and only dev builds ever updated themselves. The check now asks for the tag that is actually published, and releases also publish a `v`-prefixed alias so installs on 1.0.25 and earlier, which still use the old check, are offered this one

## [1.0.25] - 2026-08-11

### Security
- Cleared 24 dependency advisories, 6 of them high: axios 1.19, express 4.22, ws 8.21, ssh2 1.17 and node-cron 4.6 on the server, vite 8, @vitejs/plugin-react 6, postcss 8.5 and autoprefixer 10.5 on the client. `npm audit` is clean in both workspaces
- The security audit workflow now runs on push, pull request and weekly instead of only on release, fails the build on high or critical findings, and scans the full git history for secrets with a pinned gitleaks image

### Fixed
- Updates no longer stall silently when a target cannot resolve its repository hosts. A DNS probe runs first and reports the unreachable host plus the `pct set --nameserver` fix, instead of letting every apt lookup block for ~40s (a container that inherits a host-only resolver such as Tailscale MagicDNS turned an upgrade into a multi-minute freeze with nothing on screen)
- apt, apk, dnf and yum now run under a timeout inside the target — 3 minutes for package lists, 30 minutes for the upgrade — so a stalled package manager is killed there instead of surviving as an orphaned `pct exec` after the SSH stream gives up
- SSH stream timeout raised from 5 to 35 minutes; large upgrades were abandoned mid-download while the remote apt kept running unsupervised
- App updates (Plex, Jellyfin, *arr) time out after 15 minutes instead of hanging indefinitely, and a Plex download that fails on name resolution now says so

### Changed
- Update terminals show numbered stage markers and `apt-get update` output (`-q` instead of `-qq`), so a slow phase no longer looks frozen
- A failing `apt-get update` is reported in the terminal instead of being swallowed silently
- Docker images build with `npm ci` on node 22 so they match the lockfiles exactly, and the container declares a `HEALTHCHECK`

## [1.0.24] - 2026-04-30

### Fixed
- Dev Docker builds always include commit SHA in app version — updating to a dev build no longer rolls back to a clean stable release version

## [1.0.22] - 2026-04-30

### Fixed
- Proxmox tag now uses `mac-o-kay` (hyphenated) instead of "Mac O Kay" — spaces caused Proxmox to split it into three separate tags
- Reduced Notes logo size from 96 to 64px
- "Buy us a coffee" corrected to "Buy me a coffee" in both Notes and about modal

## [1.0.21] - 2026-04-30

### Added
- install.sh now sets "Mac O Kay" tag and Notes panel (logo, buy us a coffee, GitHub, Issues) on the LXC automatically after creation

### Changed
- install.sh release version lookup now uses redirect URL instead of GitHub API to avoid rate limit errors
- Removed Discussions link from about modal (GitHub, Issues only)

## [1.0.20] - 2026-04-30

### Changed
- Revert footer Mac O Kay badge — about panel accessible via hive logo click in header only

## [1.0.19] - 2026-04-30

### Fixed
- Update check no longer uses GitHub REST API — uses the releases redirect URL instead, eliminating 403 rate limit errors

## [1.0.18] - 2026-04-30

### Added
- About panel with logo, Buy us a coffee, GitHub, Discussions and Issues links — open by clicking the hive logo in the header or the "Mac O Kay" badge in the footer
- "Mac O Kay" author badge in footer

## [1.0.17] - 2026-04-30

### Fixed
- "Update now" no longer triggers a GitHub API call — version already known from the banner is passed directly, preventing 403 rate limit errors during the update apply step

## [1.0.16] - 2026-04-30

### Fixed
- Dev update banner no longer appears when running a clean release — beta updates only offered when already on a dev build, breaking the infinite update loop

## [1.0.15] - 2026-04-30

### Fixed
- Client no longer bypasses server cache when polling for updates — removes direct GitHub API calls that caused 403 rate limit errors
- API cache TTL reduced to 10 minutes so update banner appears faster without hitting rate limits

## [1.0.14] - 2026-04-30

### Fixed
- Server now checks for updates every 5 minutes instead of hourly — banner appears much faster after a new release
- Update check logs result to Docker logs for easier debugging

## [1.0.13] - 2026-04-30

### Fixed
- Added 15-minute client-side polling as fallback — update banner now appears even when staying on the same tab without switching focus

## [1.0.12] - 2026-04-30

### Fixed
- "Update now" now installs the correct Docker image — previously beta mode would always pull the `dev` tag even when the banner was showing a stable release

## [1.0.11] - 2026-04-30

### Fixed
- Stable release now takes priority over dev build in beta mode — banner correctly shows "Proxmox Hive vX.Y.Z is available" instead of "New dev build available" when a release is pending
- After updating to a stable release in beta mode, the version number now reflects the release and the banner no longer reappears

## [1.0.10] - 2026-04-30

### Fixed
- Beta update check simplified — uses GHCR `dev` tag existence instead of GitHub Actions API, which was unreliable and caused update banners to never appear
- Release updates in beta mode now show immediately based on version number alone, without waiting for GHCR image verification

## [1.0.9] - 2026-04-30

### Fixed
- Beta update check now falls back to stable release detection — running a dev build no longer blocks the banner when a new stable release is available
- Docker image existence verified on GHCR before showing update banner — prevents prompting for an update before the build pipeline has finished publishing

## [1.0.8] - 2026-04-30

### Added
- Live relative-time ticker in dashboard header — "last checked X ago" updates every second without a page reload
- QEMU guest agent setup guide — a step-by-step modal explains how to install and enable the agent on VMs, with a reboot reminder; guide is generalized across distros
- App update banner now pushed to newly connected WebSocket clients — joining the dashboard mid-update still shows the notification
- Update check runs when the browser tab regains focus — no need to reload to see a new release banner

### Fixed
- Relative-time ticker resets immediately when a new check completes instead of waiting for the next tick
- Update banner for beta channel only shows after the dev Docker image is confirmed published on GHCR, preventing false positives

## [1.0.7] - 2026-04-19

### Added
- Beta updates toggle in Settings — enable to receive dev-branch builds instead of stable releases, useful for testing new features before they ship
- Docker socket warning banner — existing installs without socket access see a persistent yellow banner with a one-liner to re-run the installer and fix the missing volume mounts automatically
- Self-update banner shows commit SHA with link for dev builds, release name with link for stable builds

### Fixed
- Self-update now survives container restart — a short-lived detached helper container runs `docker compose up -d` independently so the process is not killed mid-execution when the current container stops
- `docker compose` subcommand now available inside container (`docker-cli-compose` added to image)
- `--force-recreate` ensures the new image is always used even when the compose tag has not changed
- Page auto-reloads after a successful self-update — polls `/api/version` until server goes down and comes back up, with a 60-second fallback
- Update failed banner shows "Update failed — see error above" instead of the restart message on error

## [1.0.6] - 2026-04-18

### Fixed
- Self-update now works: Docker socket and install directory are mounted into the container so the app can run docker commands and find the compose file
- Self-update check re-polls every 30 minutes (with cache bypass) so the banner appears after a release without requiring a page reload
- Error handler added to child process runner so missing `docker` binary gives a clear error instead of crashing silently

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
