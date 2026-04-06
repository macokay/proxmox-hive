import { createSSHConnection } from './ssh.js'

// ─── SSH helpers ──────────────────────────────────────────────────────────────

async function execInLXC(sshConfig, vmid, cmd) {
  const isRoot = !sshConfig.username || sshConfig.username === 'root'
  const prefix = isRoot ? '' : 'sudo '
  const full = `${prefix}pct exec ${vmid} -- ${cmd}`
  const conn = await createSSHConnection(sshConfig)
  return new Promise((resolve, reject) => {
    let stdout = '', stderr = ''
    conn.exec(full, (err, stream) => {
      if (err) { conn.end(); return reject(err) }
      stream.on('data', d => { stdout += d })
      stream.stderr.on('data', d => { stderr += d })
      stream.on('close', code => { conn.end(); resolve({ stdout, stderr, code }) })
    })
  })
}

// Write content via base64 to avoid all quoting issues
async function writeFileInLXC(sshConfig, vmid, path, content) {
  const b64 = Buffer.from(content).toString('base64')
  const { code } = await execInLXC(sshConfig, vmid, `sh -c "echo ${b64} | base64 -d > ${path}"`)
  return code === 0
}

// Run curl inside LXC via base64 script
async function curlInLXC(sshConfig, vmid, url) {
  const script = `curl -sf --max-time 10 "${url}"`
  const b64 = Buffer.from(script).toString('base64')
  const scriptPath = `/tmp/pxd_curl.sh`
  await execInLXC(sshConfig, vmid, `sh -c "echo ${b64} | base64 -d > ${scriptPath}"`)
  const { stdout, code } = await execInLXC(sshConfig, vmid, `sh ${scriptPath}`)
  await execInLXC(sshConfig, vmid, `rm -f ${scriptPath} 2>/dev/null`)
  return { stdout, code }
}

// ─── *arr config finder ────────────────────────────────────────────────────────

async function findArrConfig(sshConfig, vmid, appName) {
  const candidates = [
    `/var/lib/${appName}/config.xml`,
    `/home/${appName}/.config/${appName.charAt(0).toUpperCase() + appName.slice(1)}/config.xml`,
    `/data/config.xml`,
    `/config/config.xml`,
    `/opt/${appName}/config.xml`,
  ]
  for (const path of candidates) {
    const { stdout, code } = await execInLXC(sshConfig, vmid, `cat "${path}" 2>/dev/null`)
    if (code === 0 && stdout.includes('<ApiKey>')) return stdout
  }
  return null
}

// ─── Check functions ──────────────────────────────────────────────────────────

async function checkArrApp(sshConfig, vmid, appName, defaultPort) {
  const { code: activeCode } = await execInLXC(sshConfig, vmid, `systemctl is-active ${appName} 2>/dev/null`)
  if (activeCode !== 0) return []

  const xml = await findArrConfig(sshConfig, vmid, appName)
  if (!xml) return []

  const apiKey = (xml.match(/<ApiKey>([^<]+)<\/ApiKey>/) || [])[1]
  const port = parseInt((xml.match(/<Port>([^<]+)<\/Port>/) || [])[1]) || defaultPort
  if (!apiKey) return []

  const { stdout, code } = await curlInLXC(sshConfig, vmid, `http://localhost:${port}/api/v3/update?apikey=${apiKey}`)
  if (code !== 0 || !stdout.trim()) return []

  try {
    const updates = JSON.parse(stdout)
    if (!Array.isArray(updates) || updates.length === 0) return []
    const latest = updates[0]
    // installed: true = already on latest, no update needed
    // installed: false = update available
    if (latest.installed) return []
    const currentEntry = updates.find(u => u.installed) || null
    return [{ name: appName, currentVersion: currentEntry?.version || 'unknown', newVersion: latest.version, source: 'app-api', appType: 'arr' }]
  } catch { return [] }
}

async function checkPlex(sshConfig, vmid) {
  const { stdout: dpkgOut, code } = await execInLXC(sshConfig, vmid, `dpkg-query -W -f='\${Version}' plexmediaserver 2>/dev/null`)
  if (code !== 0 || !dpkgOut.trim()) return []
  const installedVersion = dpkgOut.trim()

  const { stdout: jsonOut, code: curlCode } = await curlInLXC(sshConfig, vmid, 'https://plex.tv/api/downloads/5.json')
  if (curlCode !== 0 || !jsonOut.trim()) return []

  try {
    const data = JSON.parse(jsonOut)
    const latestVersion = data?.computer?.Linux?.version
    if (!latestVersion) return []
    if (latestVersion !== installedVersion && versionIsNewer(latestVersion, installedVersion)) {
      const releases = data?.computer?.Linux?.releases || []
      const { stdout: archOut } = await execInLXC(sshConfig, vmid, 'dpkg --print-architecture')
      const arch = archOut.trim() || 'amd64'
      const deb = releases.find(r => r.url?.endsWith('.deb') && r.url.includes(`_${arch}.deb`))
        || releases.find(r => r.url?.endsWith('.deb') && r.url.includes(arch))
        || releases.find(r => r.url?.endsWith('.deb'))
      return [{ name: 'plexmediaserver', currentVersion: installedVersion, newVersion: latestVersion, downloadUrl: deb?.url || null, source: 'app-api', appType: 'plex' }]
    }
  } catch { }
  return []
}

async function checkJellyfin(sshConfig, vmid) {
  const { code } = await execInLXC(sshConfig, vmid, 'systemctl is-active jellyfin 2>/dev/null')
  if (code !== 0) return []
  const { stdout: apiOut, code: apiCode } = await curlInLXC(sshConfig, vmid, 'http://localhost:8096/System/Info/Public')
  if (apiCode !== 0 || !apiOut.trim()) return []
  try {
    const info = JSON.parse(apiOut)
    const { stdout: ghOut, code: ghCode } = await curlInLXC(sshConfig, vmid, 'https://api.github.com/repos/jellyfin/jellyfin/releases/latest')
    if (ghCode !== 0 || !ghOut.trim()) return []
    const release = JSON.parse(ghOut)
    const latestVersion = release.tag_name?.replace(/^v/, '')
    if (latestVersion && info.Version && versionIsNewer(latestVersion, info.Version)) {
      return [{ name: 'jellyfin', currentVersion: info.Version, newVersion: latestVersion, source: 'app-api', appType: 'jellyfin' }]
    }
  } catch { }
  return []
}

async function checkSeerr(sshConfig, vmid) {
  for (const [appName, port] of [['overseerr', 5055], ['jellyseerr', 5055]]) {
    const { code } = await execInLXC(sshConfig, vmid, `systemctl is-active ${appName} 2>/dev/null`)
    if (code !== 0) continue
    const { stdout, code: apiCode } = await curlInLXC(sshConfig, vmid, `http://localhost:${port}/api/v1/status`)
    if (apiCode !== 0 || !stdout.trim()) continue
    try {
      const status = JSON.parse(stdout)
      if (status.updateAvailable) return [{ name: appName, currentVersion: status.version, newVersion: 'available', source: 'app-api', appType: 'overseerr' }]
    } catch { }
  }
  return []
}

const ARR_PORTS = { sonarr: 8989, radarr: 7878, prowlarr: 9696, lidarr: 8686, readarr: 8787 }

const SERVICE_REGISTRY = {
  'sonarr':          (sc, vmid) => checkArrApp(sc, vmid, 'sonarr',   ARR_PORTS.sonarr),
  'radarr':          (sc, vmid) => checkArrApp(sc, vmid, 'radarr',   ARR_PORTS.radarr),
  'prowlarr':        (sc, vmid) => checkArrApp(sc, vmid, 'prowlarr', ARR_PORTS.prowlarr),
  'lidarr':          (sc, vmid) => checkArrApp(sc, vmid, 'lidarr',   ARR_PORTS.lidarr),
  'readarr':         (sc, vmid) => checkArrApp(sc, vmid, 'readarr',  ARR_PORTS.readarr),
  'plexmediaserver': (sc, vmid) => checkPlex(sc, vmid),
  'jellyfin':        (sc, vmid) => checkJellyfin(sc, vmid),
  'overseerr':       (sc, vmid) => checkSeerr(sc, vmid),
  'jellyseerr':      (sc, vmid) => checkSeerr(sc, vmid),
}

export async function detectAppUpdates(vmid, site) {
  const sshConfig = site.ssh
  const isRoot = !sshConfig.username || sshConfig.username === 'root'
  const appUpdates = []

  const { stdout, code } = await execInLXC(sshConfig, vmid,
    'systemctl list-units --type=service --state=running --no-legend --plain 2>/dev/null'
  )
  if (code !== 0) return []

  const runningServices = stdout.split('\n')
    .map(line => line.trim().split(/\s+/)[0]?.replace('.service', ''))
    .filter(Boolean)

  const toCheck = [...new Set(runningServices.filter(svc => SERVICE_REGISTRY[svc]))]

  await Promise.allSettled(
    toCheck.map(async svc => {
      try {
        const results = await SERVICE_REGISTRY[svc](sshConfig, vmid)
        appUpdates.push(...results)
      } catch { }
    })
  )

  return appUpdates
}

// ─── Update functions (used by appUpdater.js) ─────────────────────────────────

export { execInLXC, curlInLXC, writeFileInLXC, findArrConfig, ARR_PORTS }

function versionIsNewer(a, b) {
  if (!a || !b) return false
  const parse = v => v.replace(/[-+].*$/, '').split('.').map(n => parseInt(n) || 0)
  const pa = parse(String(a)), pb = parse(String(b))
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0)
    if (diff !== 0) return diff > 0
  }
  return false
}
