import { createSSHConnection } from './ssh.js'
import { execInLXC, findArrConfig, ARR_PORTS } from './appUpdates.js'

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function execStreamInLXC(sshConfig, vmid, cmd, onLog) {
  const isRoot = !sshConfig.username || sshConfig.username === 'root'
  const prefix = isRoot ? '' : 'sudo '
  const full = `${prefix}pct exec ${vmid} -- ${cmd}`
  const conn = await createSSHConnection(sshConfig)
  return new Promise((resolve, reject) => {
    conn.exec(full, (err, stream) => {
      if (err) { conn.end(); return reject(err) }
      stream.on('data', d => onLog(d.toString()))
      stream.stderr.on('data', d => onLog(d.toString()))
      stream.on('close', code => { conn.end(); resolve(code) })
    })
  })
}

export async function updateApp(vmid, appUpdate, onLog, site) {
  const { name, appType, newVersion, downloadUrl } = appUpdate
  const sshConfig = site.ssh
  onLog(`\n[app-updater] Updating ${name} (${appType})\n`)

  switch (appType) {
    case 'arr':      return updateArrApp(sshConfig, vmid, name, onLog)
    case 'plex':     return updatePlex(sshConfig, vmid, newVersion, downloadUrl, onLog)
    case 'jellyfin': return updateJellyfin(sshConfig, vmid, onLog)
    case 'overseerr': return updateSeerr(sshConfig, vmid, name, onLog)
    default:         return updateViaApt(sshConfig, vmid, name, onLog)
  }
}

async function updateArrApp(sshConfig, vmid, appName, onLog) {
  const xml = await findArrConfig(sshConfig, vmid, appName)
  if (!xml) { onLog(`[app-updater] config.xml not found\n`); return false }

  const apiKey = (xml.match(/<ApiKey>([^<]+)<\/ApiKey>/) || [])[1]
  const port = parseInt((xml.match(/<Port>([^<]+)<\/Port>/) || [])[1]) || ARR_PORTS[appName] || 8989
  if (!apiKey) { onLog(`[app-updater] No API key found\n`); return false }

  onLog(`[app-updater] Triggering ${appName} built-in update on port ${port}...\n`)

  // Write JSON body and curl script via base64
  const jsonBody = JSON.stringify({ name: 'ApplicationUpdate' })
  const jsonB64 = Buffer.from(jsonBody).toString('base64')
  const jsonPath = `/tmp/pxd_body.json`
  await execInLXC(sshConfig, vmid, `sh -c "echo ${jsonB64} | base64 -d > ${jsonPath}"`)

  const curlScript = `#!/bin/sh\ncurl -sf -X POST "http://localhost:${port}/api/v3/command" -H "X-Api-Key: ${apiKey}" -H "Content-Type: application/json" --data @${jsonPath}\n`
  const scriptB64 = Buffer.from(curlScript).toString('base64')
  const scriptPath = `/tmp/pxd_arr.sh`
  await execInLXC(sshConfig, vmid, `sh -c "echo ${scriptB64} | base64 -d > ${scriptPath} && chmod +x ${scriptPath}"`)

  const { stdout: curlOut, code } = await execInLXC(sshConfig, vmid, `sh ${scriptPath}`)
  await execInLXC(sshConfig, vmid, `rm -f ${scriptPath} ${jsonPath} 2>/dev/null`)

  onLog(`[app-updater] curl exit ${code}, response: ${curlOut.slice(0, 200) || '(empty)'}\n`)

  if (code !== 0) {
    const { stdout: portCheck } = await execInLXC(sshConfig, vmid, `sh -c "ss -tlnp 2>/dev/null | grep :${port} || echo 'nothing on port ${port}'"`)
    onLog(`[app-updater] Port ${port}: ${portCheck.trim()}\n`)
    onLog(`[app-updater] Try updating ${appName} from its web UI (System > Updates).\n`)
    return false
  }

  onLog(`[app-updater] Update accepted. Waiting for ${appName} to restart...\n`)
  await sleep(5000)
  for (let i = 0; i < 6; i++) {
    await sleep(5000)
    const { code: alive } = await execInLXC(sshConfig, vmid, `systemctl is-active ${appName} 2>/dev/null`)
    if (alive === 0) { onLog(`[app-updater] ${appName} is running.\n`); return true }
    onLog(`[app-updater] Still restarting... (${(i + 1) * 5}s)\n`)
  }
  onLog(`[app-updater] Did not restart in 35s — check manually.\n`)
  return true // soft success
}

async function updatePlex(sshConfig, vmid, newVersion, downloadUrl, onLog) {
  if (!downloadUrl) {
    onLog(`[app-updater] Fetching Plex download info...\n`)

    // Detect container architecture
    const { stdout: archOut } = await execInLXC(sshConfig, vmid, 'dpkg --print-architecture')
    const arch = archOut.trim() || 'amd64'
    onLog(`[app-updater] Container architecture: ${arch}\n`)

    const { stdout: jsonOut, code } = await execInLXC(sshConfig, vmid, 'curl -sf --max-time 15 https://plex.tv/api/downloads/5.json')
    if (code !== 0 || !jsonOut.trim()) { onLog(`[app-updater] Could not reach plex.tv\n`); return false }
    try {
      const data = JSON.parse(jsonOut)
      const releases = data?.computer?.Linux?.releases || []
      // Match .deb for correct architecture
      const deb = releases.find(r => r.url?.endsWith('.deb') && r.url.includes(`_${arch}.deb`))
        || releases.find(r => r.url?.endsWith('.deb') && r.url.includes(arch))
        || releases.find(r => r.url?.endsWith('.deb'))
      if (!deb) { onLog(`[app-updater] No .deb found for ${arch}\n`); return false }
      onLog(`[app-updater] Selected: ${deb.url.split('/').pop()}\n`)
      downloadUrl = deb.url
    } catch (e) { onLog(`[app-updater] Parse error: ${e.message}\n`); return false }
  }

  onLog(`[app-updater] Downloading ${downloadUrl}\n`)
  const { code: dlCode } = await execInLXC(sshConfig, vmid, `curl -sfL --max-time 300 "${downloadUrl}" -o /tmp/plex.deb`)
  if (dlCode !== 0) { onLog(`[app-updater] Download failed (exit ${dlCode})\n`); return false }

  await execInLXC(sshConfig, vmid, 'systemctl stop plexmediaserver 2>/dev/null')
  onLog(`[app-updater] Installing...\n`)
  const code = await execStreamInLXC(sshConfig, vmid, 'dpkg -i /tmp/plex.deb 2>&1', onLog)
  await execInLXC(sshConfig, vmid, 'rm -f /tmp/plex.deb 2>/dev/null')
  if (code === 0) {
    await execInLXC(sshConfig, vmid, 'systemctl start plexmediaserver 2>/dev/null')
    onLog(`[app-updater] Plex updated and started.\n`)
  }
  return code === 0
}

async function updateJellyfin(sshConfig, vmid, onLog) {
  onLog(`[app-updater] Upgrading jellyfin via apt...\n`)
  const code = await execStreamInLXC(sshConfig, vmid, `sh -c 'apt-get install --only-upgrade -y jellyfin && apt-get autoremove -y' 2>&1`, onLog)
  return code === 0
}

async function updateSeerr(sshConfig, vmid, appName, onLog) {
  onLog(`[app-updater] Restarting ${appName}...\n`)
  const { code } = await execInLXC(sshConfig, vmid, `systemctl restart ${appName} 2>/dev/null`)
  onLog(code === 0 ? `[app-updater] Restarted.\n` : `[app-updater] Restart failed.\n`)
  return code === 0
}

async function updateViaApt(sshConfig, vmid, packageName, onLog) {
  onLog(`[app-updater] Upgrading ${packageName} via apt...\n`)
  const code = await execStreamInLXC(sshConfig, vmid, `sh -c 'apt-get install --only-upgrade -y ${packageName} && apt-get autoremove -y' 2>&1`, onLog)
  return code === 0
}
