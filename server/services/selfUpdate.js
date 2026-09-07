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
  // Use the redirect URL — no API key, no rate limit
  const r = await fetch('https://github.com/macokay/proxmox-hive/releases/latest', {
    headers: { 'User-Agent': 'proxmox-hive' },
    redirect: 'manual'
  })
  const location = r.headers.get('location') || ''
  const match = location.match(/\/releases\/tag\/v?([\d.]+)$/)
  if (!match) throw new Error('Could not parse latest release')
  return match[1]
}

export async function fetchLatestDevCommit() {
  const r = await fetch('https://api.github.com/repos/macokay/proxmox-hive/commits/dev', {
    headers: { 'User-Agent': 'proxmox-hive' }
  })
  if (!r.ok) throw new Error(`GitHub API ${r.status}`)
  const data = await r.json()
  return data.sha?.slice(0, 7) || null
}


export async function isDockerImageAvailable(tag) {
  try {
    const tokenRes = await fetch(
      'https://ghcr.io/token?scope=repository:macokay/proxmox-hive:pull&service=ghcr.io',
      { headers: { 'User-Agent': 'proxmox-hive' } }
    )
    if (!tokenRes.ok) return false
    const { token } = await tokenRes.json()
    const manifestRes = await fetch(
      `https://ghcr.io/v2/macokay/proxmox-hive/manifests/${tag}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.oci.image.index.v1+json,application/vnd.docker.distribution.manifest.v2+json' } }
    )
    return manifestRes.ok
  } catch {
    return false
  }
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

// With beta updates on, the newest build wins whether it came from a release or
// from the dev branch, so something has to decide which of the two that is.
// dev normally contains the latest release, but a fix landed straight on main
// does not reach dev, and then the release is the newer one.
export async function isDevAheadOfRelease(releaseVersion) {
  if (!releaseVersion) return false
  try {
    const r = await fetch(
      `https://api.github.com/repos/macokay/proxmox-hive/compare/v${releaseVersion}...dev`,
      { headers: { 'User-Agent': 'proxmox-hive' } }
    )
    if (!r.ok) return false
    const data = await r.json()
    return (data.ahead_by || 0) > 0
  } catch {
    // Never move an install onto dev because a lookup failed — fall back to releases.
    return false
  }
}

// Single answer to "is there something newer than what is running", shared by
// the polling check and the API so the two can never disagree about it.
export async function resolveUpdate(betaUpdates) {
  const current = getCurrentVersion()
  const latest = await fetchLatestRelease()

  if (betaUpdates && await isDevAheadOfRelease(latest)) {
    const latestSha = await fetchLatestDevCommit()
    const updateAvailable = isDevUpdateAvailable(current, latestSha) && await isDockerImageAvailable('dev')
    return { current, latest: 'dev', latestSha, updateAvailable, beta: true }
  }

  const updateAvailable = isUpdateAvailable(current, latest) && await isDockerImageAvailable(latest)
  return { current, latest, updateAvailable, beta: false }
}

export function checkDockerSocket() {
  return existsSync('/var/run/docker.sock')
}

// The Docker daemon reports the hostname of the machine it runs on, which for
// Hive is the LXC container hosting it. Knowing that name is what lets an
// update recognise it is about to upgrade Docker underneath itself.
let _dockerHostname
export function getDockerHostname() {
  if (_dockerHostname !== undefined) return _dockerHostname
  try {
    _dockerHostname = execFileSync('docker', ['info', '--format', '{{.Name}}'], {
      encoding: 'utf8', timeout: 10000
    }).trim() || null
  } catch {
    _dockerHostname = null
  }
  return _dockerHostname
}

export async function applySelfUpdate(onLog, beta = false, knownVersion = null) {
  if (!checkDockerSocket()) {
    onLog('ERROR: Docker socket not mounted into container.\n\n')
    onLog('Your docker-compose.yml is missing required volume mounts.\n')
    onLog('Add these lines under "volumes:" and restart manually:\n\n')
    onLog('  - /var/run/docker.sock:/var/run/docker.sock\n')
    onLog('  - /opt/proxmox-hive:/opt/proxmox-hive\n\n')
    onLog('Then run: cd /opt/proxmox-hive && docker compose up -d\n')
    throw new Error('Docker socket not accessible — see instructions above')
  }

  const latest = beta ? 'dev' : (knownVersion || await fetchLatestRelease())
  if (!latest) throw new Error('Could not fetch latest release')

  function run(cmd, args) {
    return new Promise((resolve, reject) => {
      const child = execFile(cmd, args, { env: process.env })
      child.stdout.on('data', d => onLog(d.toString()))
      child.stderr.on('data', d => onLog(d.toString()))
      child.on('error', err => reject(err))
      child.on('close', code => code === 0 ? resolve() : reject(new Error(`exit ${code}`)))
    })
  }

  const compose = findComposeFile()
  const image = `ghcr.io/macokay/proxmox-hive:${latest}`

  if (compose) {
    try {
      let content = readFileSync(compose, 'utf8')
      content = content.replace(
        /image:\s*ghcr\.io\/macokay\/proxmox-hive:[^\s\n]+/,
        `image: ${image}`
      )
      writeFileSync(compose, content)
      onLog(`Pinned image to ${latest}\n`)
    } catch (e) {
      onLog(`Warning: could not update compose file: ${e.message}\n`)
    }
    onLog('--- Pulling latest image ---\n')
    await run('docker', ['compose', '-f', compose, 'pull'])

    // Spawn a detached helper container that restarts us after we finish.
    // Running compose up -d from inside the container kills our process mid-execution;
    // the helper is independent of our container's lifecycle.
    onLog('--- Scheduling restart ---\n')
    await run('docker', [
      'run', '--rm', '--detach',
      '--entrypoint', 'sh',
      '-v', '/var/run/docker.sock:/var/run/docker.sock',
      '-v', `${compose}:${compose}`,
      image,
      '-c', `sleep 3 && docker compose -f ${compose} up -d --remove-orphans --force-recreate`
    ])
    onLog('Restarting in a few seconds…\n')
  } else {
    onLog('Compose file not found, using docker pull directly\n')
    onLog('--- Pulling latest image ---\n')
    await run('docker', ['pull', image])
    onLog('--- Restarting container ---\n')
    await run('docker', ['restart', 'proxmox-hive'])
  }
}
