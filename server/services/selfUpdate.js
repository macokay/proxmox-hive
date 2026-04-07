import { execFile } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'

const COMPOSE = '/opt/proxmox-hive/docker-compose.yml'

function versionIsNewer(a, b) {
  const parse = v => String(v).replace(/[-+].*$/, '').split('.').map(n => parseInt(n) || 0)
  const pa = parse(a), pb = parse(b)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0)
    if (diff !== 0) return diff > 0
  }
  return false
}

export function getCurrentVersion() {
  return process.env.APP_VERSION || 'dev'
}

export async function fetchLatestRelease() {
  const r = await fetch('https://api.github.com/repos/macokay/proxmox-hive/releases/latest', {
    headers: { 'User-Agent': 'proxmox-hive' }
  })
  if (!r.ok) throw new Error(`GitHub API ${r.status}`)
  const data = await r.json()
  return data.tag_name?.replace(/^v/, '') || null
}

export function isUpdateAvailable(current, latest) {
  if (!latest) return false
  // current may be "1.0.3" (release) or "1.0.3-0abd6b1" (post-release commit)
  const base = current.split('-')[0]
  return versionIsNewer(latest, base)
}

export async function applySelfUpdate(onLog) {
  const latest = await fetchLatestRelease()
  if (!latest) throw new Error('Could not fetch latest release')

  // Pin the compose file to the new release tag so future pulls stay on releases
  try {
    let content = readFileSync(COMPOSE, 'utf8')
    content = content.replace(
      /image:\s*ghcr\.io\/macokay\/proxmox-hive:[^\s\n]+/,
      `image: ghcr.io/macokay/proxmox-hive:v${latest}`
    )
    writeFileSync(COMPOSE, content)
    onLog(`Pinned image to v${latest}\n`)
  } catch (e) {
    onLog(`Warning: could not update compose file: ${e.message}\n`)
  }

  function run(cmd, args) {
    return new Promise((resolve, reject) => {
      const child = execFile(cmd, args, { env: process.env })
      child.stdout.on('data', d => onLog(d.toString()))
      child.stderr.on('data', d => onLog(d.toString()))
      child.on('close', code => code === 0 ? resolve() : reject(new Error(`exit ${code}`)))
    })
  }

  onLog('--- Pulling latest image ---\n')
  await run('docker', ['compose', '-f', COMPOSE, 'pull'])
  onLog('--- Restarting container ---\n')
  await run('docker', ['compose', '-f', COMPOSE, 'up', '-d', '--remove-orphans'])
}
