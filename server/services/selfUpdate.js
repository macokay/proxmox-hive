import { execFile, execFileSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync } from 'fs'

function versionIsNewer(a, b) {
  const parse = v => String(v).replace(/[-+].*$/, '').split('.').map(n => parseInt(n) || 0)
  const pa = parse(a), pb = parse(b)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0)
    if (diff !== 0) return diff > 0
  }
  return false
}

function findComposeFile() {
  // Ask Docker for the compose project working dir of this container
  try {
    const out = execFileSync('docker', [
      'inspect', 'proxmox-hive',
      '--format', '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}'
    ], { encoding: 'utf8' }).trim()
    if (out && out !== '<no value>') {
      const candidate = `${out}/docker-compose.yml`
      if (existsSync(candidate)) return candidate
    }
  } catch {}

  const fallbacks = ['/opt/proxmox-hive/docker-compose.yml']
  for (const p of fallbacks) {
    if (existsSync(p)) return p
  }
  return null
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

export async function fetchLatestDevCommit() {
  const r = await fetch('https://api.github.com/repos/macokay/proxmox-hive/commits/dev', {
    headers: { 'User-Agent': 'proxmox-hive' }
  })
  if (!r.ok) throw new Error(`GitHub API ${r.status}`)
  const data = await r.json()
  return data.sha?.slice(0, 7) || null
}

export function isUpdateAvailable(current, latest) {
  if (!latest) return false
  const base = current.split('-')[0]
  return versionIsNewer(latest, base)
}

export function isDevUpdateAvailable(current, latestSha) {
  if (!latestSha) return false
  const currentSha = current.includes('-') ? current.split('-').pop() : null
  return currentSha !== latestSha
}

export async function applySelfUpdate(onLog, beta = false) {
  const latest = beta ? 'dev' : await fetchLatestRelease()
  if (!latest) throw new Error('Could not fetch latest release')

  function run(cmd, args) {
    return new Promise((resolve, reject) => {
      const child = execFile(cmd, args, { env: process.env })
      child.stdout.on('data', d => onLog(d.toString()))
      child.stderr.on('data', d => onLog(d.toString()))
      child.on('close', code => code === 0 ? resolve() : reject(new Error(`exit ${code}`)))
    })
  }

  const compose = findComposeFile()

  if (compose) {
    // Update the image tag in the compose file so it stays pinned to releases
    try {
      let content = readFileSync(compose, 'utf8')
      content = content.replace(
        /image:\s*ghcr\.io\/macokay\/proxmox-hive:[^\s\n]+/,
        `image: ghcr.io/macokay/proxmox-hive:${latest}`
      )
      writeFileSync(compose, content)
      onLog(`Pinned image to v${latest}\n`)
    } catch (e) {
      onLog(`Warning: could not update compose file: ${e.message}\n`)
    }
    onLog('--- Pulling latest image ---\n')
    await run('docker', ['compose', '-f', compose, 'pull'])
    onLog('--- Restarting container ---\n')
    await run('docker', ['compose', '-f', compose, 'up', '-d', '--remove-orphans'])
  } else {
    // No compose file found — pull directly and restart the container
    onLog('Compose file not found, using docker pull directly\n')
    onLog('--- Pulling latest image ---\n')
    await run('docker', ['pull', `ghcr.io/macokay/proxmox-hive:${latest}`])
    onLog('--- Restarting container ---\n')
    await run('docker', ['restart', 'proxmox-hive'])
  }
}
