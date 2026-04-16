import cron from 'node-cron'
import { createSSHConnection } from './ssh.js'
import { detectAppUpdates } from './appUpdates.js'
import { notify } from './notifications.js'
import { getAllSites, getSite, saveSite } from './config.js'
import { broadcast } from '../broadcast.js'
import { getCurrentVersion, fetchLatestRelease, isUpdateAvailable, applySelfUpdate } from './selfUpdate.js'

// Map of siteId -> array of cron tasks
const siteTasks = new Map()

export function initScheduler() {
  // Destroy all existing tasks
  for (const tasks of siteTasks.values()) tasks.forEach(t => t.destroy())
  siteTasks.clear()

  const sites = getAllSites()
  for (const site of sites) {
    initSiteScheduler(site)
  }
  console.log(`Scheduler initialized for ${sites.length} site(s)`)
}

export function initSiteScheduler(site) {
  // Clear existing tasks for this site
  if (siteTasks.has(site.id)) {
    siteTasks.get(site.id).forEach(t => t.destroy())
  }
  const tasks = []

  const checkTimes = site.schedule?.times || ['08:00', '20:00']
  const timezone = site.schedule?.timezone || undefined
  checkTimes.forEach(time => {
    const [hour, minute] = time.split(':').map(Number)
    tasks.push(cron.schedule(`${minute} ${hour} * * *`, () => {
      console.log(`[${site.name}] Scheduled check at ${time}`)
      runCheck(site.id)
    }, { timezone }))
  })

  const groups = site.autoUpdate?.groups || []
  groups.filter(g => g.enabled && g.time).forEach(group => {
    const [hour, minute] = group.time.split(':').map(Number)
    tasks.push(cron.schedule(`${minute} ${hour} * * *`, () => {
      console.log(`[${site.name}] Auto-update group "${group.name}"`)
      runGroupUpdate(site.id, group)
    }, { timezone }))
  })

  siteTasks.set(site.id, tasks)
}

// ─── SSH helpers per site ──────────────────────────────────────────────────────

async function siteExec(site, cmd) {
  const conn = await createSSHConnection(site.ssh)
  return new Promise((resolve, reject) => {
    let stdout = '', stderr = ''
    conn.exec(cmd, (err, stream) => {
      if (err) { conn.end(); return reject(err) }
      stream.on('data', d => { stdout += d })
      stream.stderr.on('data', d => { stderr += d })
      stream.on('close', (code) => { conn.end(); resolve({ stdout, stderr, code }) })
    })
  })
}

async function siteExecStream(site, cmd, onData, onDone) {
  const conn = await createSSHConnection(site.ssh)
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) { conn.end(); return reject(err) }
      stream.on('data', d => onData(d.toString(), 'stdout'))
      stream.stderr.on('data', d => onData(d.toString(), 'stderr'))
      stream.on('close', (code) => { conn.end(); onDone(code); resolve(code) })
    })
  })
}

// pct list works directly as root; with sudo for restricted user
async function getPctList(site) {
  let result = await siteExec(site, 'pct list')
  if (result.code !== 0 || !result.stdout.trim()) {
    result = await siteExec(site, 'sudo pct list')
  }
  return result.stdout
}

// qm list for VMs
async function getQMList(site) {
  const isRoot = !site.ssh.username || site.ssh.username === 'root'
  const prefix = isRoot ? '' : 'sudo '
  let result = await siteExec(site, `${prefix}qm list`)
  if (result.code !== 0 || !result.stdout.trim()) {
    result = await siteExec(site, 'sudo qm list')
  }
  return result.stdout
}

// Execute a command inside a VM via QEMU guest agent
async function qmGuestExecSimple(site, vmid, cmd, timeout = 60) {
  const isRoot = !site.ssh.username || site.ssh.username === 'root'
  const prefix = isRoot ? '' : 'sudo '
  // Escape single quotes in cmd for embedding in shell string
  const escaped = cmd.replace(/'/g, `'\\''`)
  const fullCmd = `${prefix}qm guest exec ${vmid} --timeout ${timeout} -- bash -c '${escaped}'`
  const { stdout, stderr, code } = await siteExec(site, fullCmd)
  if (code !== 0 && !stdout.trim()) {
    throw new Error(stderr.trim() || `qm guest exec exited with code ${code}`)
  }
  try {
    const json = JSON.parse(stdout.trim())
    return {
      stdout: json['out-data'] || '',
      stderr: json['err-data'] || '',
      exitcode: json['exitcode'] ?? 0,
      exited: json['exited'] ?? 1
    }
  } catch {
    // Fallback if output is not JSON (older Proxmox)
    return { stdout, stderr, exitcode: code ?? 0, exited: 1 }
  }
}

function pctExecCmd(site, vmid, inner) {
  // If SSH user is root, no sudo needed
  const isRoot = !site.ssh.username || site.ssh.username === 'root'
  const prefix = isRoot ? '' : 'sudo '
  return `${prefix}pct exec ${vmid} -- ${inner}`
}

function aptUpdateCmd(site) {
  const isRoot = !site.ssh.username || site.ssh.username === 'root'
  const p = isRoot ? '' : 'sudo '
  return `DEBIAN_FRONTEND=noninteractive ${p}apt-get update -qq ${APT_TIMEOUT_OPTS} 2>/dev/null || true`
}

const DPKG_OPTS = `-o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold -o Dpkg::Options::=--force-overwrite`
const APT_TIMEOUT_OPTS = `-o Acquire::http::Timeout=15 -o Acquire::https::Timeout=15`

function aptUpgradeCmd(site) {
  const isRoot = !site.ssh.username || site.ssh.username === 'root'
  const p = isRoot ? '' : 'sudo '
  const script = [
    `DEBIAN_FRONTEND=noninteractive ${p}dpkg --configure -a 2>&1 || true`,
    `DEBIAN_FRONTEND=noninteractive ${p}apt-get install -f -y ${DPKG_OPTS} 2>&1 || true`,
    `DEBIAN_FRONTEND=noninteractive ${p}apt-get update -qq ${APT_TIMEOUT_OPTS} 2>&1 || true`,
    `DEBIAN_FRONTEND=noninteractive ${p}apt-get dist-upgrade -y ${DPKG_OPTS} 2>&1; RC=$?`,
    `DEBIAN_FRONTEND=noninteractive ${p}apt-get autoremove -y 2>&1 || true`,
    `exit $RC`,
  ].join('; ')
  return `sh -c '${script}'`
}

function lxcAptUpgradeCmd(site, vmid) {
  const isRoot = !site.ssh.username || site.ssh.username === 'root'
  const p = isRoot ? '' : 'sudo '
  const script = [
    `DEBIAN_FRONTEND=noninteractive dpkg --configure -a 2>&1 || true`,
    `DEBIAN_FRONTEND=noninteractive apt-get install -f -y ${DPKG_OPTS} 2>&1 || true`,
    `DEBIAN_FRONTEND=noninteractive apt-get update -qq ${APT_TIMEOUT_OPTS} 2>&1 || true`,
    `DEBIAN_FRONTEND=noninteractive apt-get dist-upgrade -y ${DPKG_OPTS} 2>&1; RC=$?`,
    `DEBIAN_FRONTEND=noninteractive apt-get autoremove -y 2>&1 || true`,
    `exit $RC`,
  ].join('; ')
  return `${p}pct exec ${vmid} -- sh -c '${script}'`
}

function lxcAptForceInstallCmd(site, vmid, packages) {
  const isRoot = !site.ssh.username || site.ssh.username === 'root'
  const p = isRoot ? '' : 'sudo '
  const pkgList = packages.map(pkg => pkg.replace(/[^a-zA-Z0-9._:+~-]/g, '')).filter(Boolean).join(' ')
  const script = [
    `DEBIAN_FRONTEND=noninteractive apt-get install -y ${DPKG_OPTS} ${pkgList} 2>&1; RC=$?`,
    `exit $RC`,
  ].join('; ')
  return `${p}pct exec ${vmid} -- sh -c '${script}'`
}

function lxcAptSelectiveUpgradeCmd(site, vmid, packages) {
  const isRoot = !site.ssh.username || site.ssh.username === 'root'
  const p = isRoot ? '' : 'sudo '
  // Sanitize package names
  const pkgList = packages.map(pkg => pkg.replace(/[^a-zA-Z0-9._:+~-]/g, '')).filter(Boolean).join(' ')
  const script = [
    `DEBIAN_FRONTEND=noninteractive apt-get update -qq ${APT_TIMEOUT_OPTS} 2>&1 || true`,
    `DEBIAN_FRONTEND=noninteractive apt-get install --only-upgrade -y ${DPKG_OPTS} ${pkgList} 2>&1; RC=$?`,
    `exit $RC`,
  ].join('; ')
  return `${p}pct exec ${vmid} -- sh -c '${script}'`
}

function nodeAptSelectiveUpgradeCmd(site, packages) {
  const isRoot = !site.ssh.username || site.ssh.username === 'root'
  const p = isRoot ? '' : 'sudo '
  const pkgList = packages.map(pkg => pkg.replace(/[^a-zA-Z0-9._:+~-]/g, '')).filter(Boolean).join(' ')
  const script = [
    `DEBIAN_FRONTEND=noninteractive ${p}apt-get update -qq ${APT_TIMEOUT_OPTS} 2>&1 || true`,
    `DEBIAN_FRONTEND=noninteractive ${p}apt-get install --only-upgrade -y ${DPKG_OPTS} ${pkgList} 2>&1; RC=$?`,
    `exit $RC`,
  ].join('; ')
  return `sh -c '${script}'`
}

// ─── Package manager detection ───────────────────────────────────────────────

async function detectLxcPackageManager(site, vmid) {
  const cmd = pctExecCmd(site, vmid,
    `sh -c 'command -v apk >/dev/null 2>&1 && echo apk || command -v dnf >/dev/null 2>&1 && echo dnf || command -v yum >/dev/null 2>&1 && echo yum || command -v apt-get >/dev/null 2>&1 && echo apt || echo unknown'`
  )
  try {
    const { stdout } = await siteExec(site, cmd)
    return stdout.trim().split('\n').pop().trim() || 'unknown'
  } catch {
    return 'unknown'
  }
}

function lxcApkUpgradeCmd(site, vmid) {
  const p = (!site.ssh.username || site.ssh.username === 'root') ? '' : 'sudo '
  return `${p}pct exec ${vmid} -- sh -c 'apk update -q 2>&1 || true; apk upgrade 2>&1; RC=$?; exit $RC'`
}

function lxcDnfUpgradeCmd(site, vmid) {
  const p = (!site.ssh.username || site.ssh.username === 'root') ? '' : 'sudo '
  return `${p}pct exec ${vmid} -- sh -c 'dnf upgrade -y 2>&1; RC=$?; dnf autoremove -y 2>&1 || true; exit $RC'`
}

function lxcYumUpgradeCmd(site, vmid) {
  const p = (!site.ssh.username || site.ssh.username === 'root') ? '' : 'sudo '
  return `${p}pct exec ${vmid} -- sh -c 'yum upgrade -y 2>&1; RC=$?; yum autoremove -y 2>&1 || true; exit $RC'`
}

// ─── Check ────────────────────────────────────────────────────────────────────

export async function runCheck(siteId) {
  const site = getSite(siteId)
  if (!site) return null

  broadcast({ type: 'check_start', siteId, timestamp: new Date().toISOString() })

  const results = {
    timestamp: new Date().toISOString(),
    node: { updates: 0, packages: [] },
    lxc: [],
    vms: [],
    error: null
  }

  try {
    await siteExec(site, aptUpdateCmd(site))
    const { stdout: nodeOut } = await siteExec(site, 'apt list --upgradable 2>/dev/null')
    const nodePackages = parseAptOutput(nodeOut)
    results.node = { updates: nodePackages.length, packages: nodePackages }

    // ── LXC containers ──
    const lxcListOut = await getPctList(site)
    const lxcMap = parseLXCList(lxcListOut)

    for (const vmid of (site.monitoredLXC || [])) {
      const lxcInfo = lxcMap[vmid] || { name: `CT-${vmid}`, status: 'unknown' }
      try {
        if (lxcInfo.status !== 'running') {
          results.lxc.push({ vmid, name: lxcInfo.name, updates: 0, packages: [], appUpdates: [], running: false })
          continue
        }

        const pm = await detectLxcPackageManager(site, vmid)

        let packages = []
        if (pm === 'apt') {
          await siteExec(site, pctExecCmd(site, vmid, 'apt-get update -qq -o Acquire::http::Timeout=15 -o Acquire::https::Timeout=15 2>/dev/null || true'))
          const { stdout } = await siteExec(site, pctExecCmd(site, vmid, 'apt list --upgradable 2>/dev/null'))
          packages = parseAptOutput(stdout)
        } else if (pm === 'apk') {
          await siteExec(site, pctExecCmd(site, vmid, 'apk update -q 2>/dev/null || true'))
          const { stdout } = await siteExec(site, pctExecCmd(site, vmid, 'apk list --upgradable 2>/dev/null'))
          packages = parseApkOutput(stdout)
        } else if (pm === 'dnf' || pm === 'yum') {
          const { stdout } = await siteExec(site, pctExecCmd(site, vmid, `${pm} check-update 2>/dev/null; true`))
          packages = parseDnfOutput(stdout)
        }

        let appUpdates = []
        if (pm === 'apt') {
          try { appUpdates = await detectAppUpdates(vmid, site) } catch { }
        }

        // Detect kept-back packages (require full-upgrade)
        let keptBackNames = new Set()
        try {
          const { stdout: dryRun } = await siteExec(site, pctExecCmd(site, vmid, 'apt-get -s upgrade 2>/dev/null || true'))
          keptBackNames = parseKeptBack(dryRun)
        } catch { }

        const appNames = new Set(appUpdates.map(a => a.name))
        const filteredPkgs = packages
          .filter(p => !appNames.has(p.name))
          .map(p => keptBackNames.has(p.name) ? { ...p, keptBack: true } : p)
        results.lxc.push({ vmid, name: lxcInfo.name, updates: filteredPkgs.length + appUpdates.length, packages: filteredPkgs, appUpdates, running: true, pm })
      } catch (e) {
        results.lxc.push({ vmid, name: lxcInfo.name, updates: 0, packages: [], appUpdates: [], running: false, error: e.message })
      }
    }

    // ── QEMU VMs ──
    if ((site.monitoredVMs || []).length > 0) {
      let vmMap = {}
      try {
        const vmListOut = await getQMList(site)
        vmMap = parseQMList(vmListOut)
      } catch (e) {
        console.error(`[${site.name}] Failed to list VMs: ${e.message}`)
      }

      for (const vmid of (site.monitoredVMs || [])) {
        const vmInfo = vmMap[vmid] || { name: `VM-${vmid}`, status: 'unknown' }
        try {
          if (vmInfo.status !== 'running') {
            results.vms.push({ vmid, name: vmInfo.name, updates: 0, packages: [], running: false })
            continue
          }
          // Test QEMU guest agent availability
          const agentOk = await qmGuestExecSimple(site, vmid, 'echo ok', 8)
            .then(r => r.stdout.trim() === 'ok')
            .catch(() => false)

          if (!agentOk) {
            results.vms.push({ vmid, name: vmInfo.name, updates: 0, packages: [], running: true, noAgent: true })
            continue
          }

          const { stdout: vmOut } = await qmGuestExecSimple(site, vmid,
            'apt-get update -qq -o Acquire::http::Timeout=15 -o Acquire::https::Timeout=15 2>/dev/null; apt list --upgradable 2>/dev/null', 90)
          const vmPackages = parseAptOutput(vmOut)
          results.vms.push({ vmid, name: vmInfo.name, updates: vmPackages.length, packages: vmPackages, running: true })
        } catch (e) {
          results.vms.push({ vmid, name: vmInfo.name, updates: 0, packages: [], running: false, error: e.message })
        }
      }
    }
  } catch (e) {
    results.error = e.message
    console.error(`[${site.name}] Check failed:`, e.message)
  }

  const updated = { ...site, lastCheck: results }
  saveSite(updated)
  broadcast({ type: 'check_complete', siteId, data: results })

  const totalUpdates = results.node.updates
    + results.lxc.reduce((a, l) => a + (l.packages?.length || 0) + (l.appUpdates?.length || 0), 0)
    + results.vms.reduce((a, v) => a + (v.packages?.length || 0), 0)

  if (totalUpdates > 0) {
    await notify(site, 'updates_found', {
      nodeUpdates: results.node.updates,
      lxcUpdates: results.lxc.map(l => ({ ...l, updates: (l.packages?.length || 0) + (l.appUpdates?.length || 0) }))
    })
  } else if (site.notifications?.notifyNoUpdates) {
    await notify(site, 'check_complete_no_updates', {})
  }

  return results
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function runTargetUpdate(siteId, target, vmid, targetLabel, appUpdates = [], packages = null) {
  const site = getSite(siteId)
  if (!site) return false
  const { updateApp } = await import('./appUpdater.js')

  // Unique key for multi-terminal routing
  const updateKey = target === 'node' ? 'node' : `${target}-${vmid}`

  broadcast({ type: 'update_start', siteId, target, vmid, targetLabel, key: updateKey })
  const onLog = (data) => broadcast({ type: 'log', siteId, data, key: updateKey })

  let success = true
  try {
    if (target === 'node') {
      const cmd = (packages && packages.length > 0)
        ? nodeAptSelectiveUpgradeCmd(site, packages)
        : aptUpgradeCmd(site)
      await siteExecStream(site, cmd, onLog, (code) => { success = code === 0 })

    } else if (target === 'lxc') {
      const pm = await detectLxcPackageManager(site, vmid)

      if (pm === 'apt') {
        const appApiUpdates = appUpdates.filter(u => u.source === 'app-api')
        for (const appUpdate of appApiUpdates) {
          const ok = await updateApp(vmid, appUpdate, onLog, site)
          if (!ok) success = false
        }
        onLog('\n[apt] Running package upgrade...\n')
        const cmd = (packages && packages.length > 0)
          ? lxcAptSelectiveUpgradeCmd(site, vmid, packages)
          : lxcAptUpgradeCmd(site, vmid)
        await siteExecStream(site, cmd, onLog, (code) => { if (code !== 0) success = false })

        // Force-install any held-back packages (apt-get install bypasses the hold where dist-upgrade cannot)
        const lxcData = site.lastCheck?.lxc?.find(l => l.vmid === vmid)
        const keptBackPkgs = (lxcData?.packages || [])
          .filter(p => p.keptBack)
          .filter(p => !packages || packages.includes(p.name))
          .map(p => p.name)
        if (keptBackPkgs.length > 0) {
          onLog(`\n[apt] Force-installing ${keptBackPkgs.length} held-back package(s): ${keptBackPkgs.join(' ')}\n`)
          await siteExecStream(site, lxcAptForceInstallCmd(site, vmid, keptBackPkgs), onLog, (code) => { if (code !== 0) success = false })
        }
      } else if (pm === 'apk') {
        onLog('\n[apk] Running package upgrade...\n')
        await siteExecStream(site, lxcApkUpgradeCmd(site, vmid), onLog, (code) => { if (code !== 0) success = false })
      } else if (pm === 'dnf') {
        onLog('\n[dnf] Running package upgrade...\n')
        await siteExecStream(site, lxcDnfUpgradeCmd(site, vmid), onLog, (code) => { if (code !== 0) success = false })
      } else if (pm === 'yum') {
        onLog('\n[yum] Running package upgrade...\n')
        await siteExecStream(site, lxcYumUpgradeCmd(site, vmid), onLog, (code) => { if (code !== 0) success = false })
      } else {
        onLog('\n[update] Unsupported package manager — skipping.\n')
      }

    } else if (target === 'vm') {
      onLog('\n[VM] Running update via QEMU guest agent...\n')
      onLog('[VM] Note: output appears when update completes (buffered)\n\n')
      const script = packages && packages.length > 0
        ? [
            `DEBIAN_FRONTEND=noninteractive apt-get update -qq ${APT_TIMEOUT_OPTS} 2>&1 || true`,
            `DEBIAN_FRONTEND=noninteractive apt-get install --only-upgrade -y ${DPKG_OPTS} ${packages.map(p => p.replace(/[^a-zA-Z0-9._:+~-]/g, '')).join(' ')} 2>&1; RC=$?`,
            `exit $RC`
          ].join('; ')
        : [
            `DEBIAN_FRONTEND=noninteractive dpkg --configure -a 2>&1 || true`,
            `DEBIAN_FRONTEND=noninteractive apt-get install -f -y ${DPKG_OPTS} 2>&1 || true`,
            `DEBIAN_FRONTEND=noninteractive apt-get update -qq ${APT_TIMEOUT_OPTS} 2>&1 || true`,
            `DEBIAN_FRONTEND=noninteractive apt-get dist-upgrade -y ${DPKG_OPTS} 2>&1; RC=$?`,
            `DEBIAN_FRONTEND=noninteractive apt-get autoremove -y 2>&1 || true`,
            `exit $RC`
          ].join('; ')

      const result = await qmGuestExecSimple(site, vmid, script, 300)
      if (result.stdout) onLog(result.stdout)
      if (result.stderr) onLog(result.stderr)
      success = result.exitcode === 0
    }
  } catch (e) {
    onLog(`\nError: ${e.message}\n`)
    success = false
  }

  broadcast({ type: 'update_done', siteId, target, vmid, success, key: updateKey })
  await notify(site, 'update_complete', { target: targetLabel, success })
  return success
}

export async function runGroupUpdate(siteId, group) {
  const site = getSite(siteId)
  if (!site) return
  broadcast({ type: 'auto_update_start', siteId, groupName: group.name, timestamp: new Date().toISOString() })
  const checkResult = await runCheck(siteId)
  if (!checkResult) return
  for (const target of (group.targets || [])) {
    if (target === 'node') {
      if (checkResult.node.updates > 0) await runTargetUpdate(siteId, 'node', null, 'Proxmox Node')
    } else if (target === 'hive') {
      try {
        const current = getCurrentVersion()
        if (current === 'dev') continue
        const latest = await fetchLatestRelease()
        if (!isUpdateAvailable(current, latest)) continue
        broadcast({ type: 'update_start', siteId, target: 'hive', vmid: null, targetLabel: 'Proxmox Hive', key: 'hive' })
        const onLog = (data) => broadcast({ type: 'log', siteId, data, key: 'hive' })
        await applySelfUpdate(onLog)
        broadcast({ type: 'update_done', siteId, target: 'hive', vmid: null, success: true, key: 'hive' })
      } catch (e) {
        console.error(`[${site.name}] Hive self-update failed:`, e.message)
        broadcast({ type: 'update_done', siteId, target: 'hive', vmid: null, success: false, key: 'hive' })
      }
    } else {
      const vmid = Number(target)
      // Check LXC first
      const lxcInfo = checkResult.lxc.find(l => l.vmid === vmid)
      if (lxcInfo) {
        const total = (lxcInfo?.packages?.length || 0) + (lxcInfo?.appUpdates?.length || 0)
        if (lxcInfo?.running && total > 0) {
          await runTargetUpdate(siteId, 'lxc', vmid, `${lxcInfo.name} (CT ${vmid})`, lxcInfo.appUpdates)
        }
        continue
      }
      // Check VM
      const vmInfo = checkResult.vms?.find(v => v.vmid === vmid)
      if (vmInfo?.running && (vmInfo.packages?.length || 0) > 0) {
        await runTargetUpdate(siteId, 'vm', vmid, `${vmInfo.name} (VM ${vmid})`)
      }
    }
  }
  broadcast({ type: 'auto_update_done', siteId, groupName: group.name })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function parseLXCList(output) {
  const map = {}
  output.split('\n').forEach(line => {
    const parts = line.trim().split(/\s+/)
    if (parts.length >= 3 && /^\d+$/.test(parts[0])) {
      map[Number(parts[0])] = { name: parts[2] || `CT-${parts[0]}`, status: parts[1] || 'unknown' }
    }
  })
  return map
}

export function parseQMList(output) {
  const map = {}
  output.split('\n').forEach(line => {
    const parts = line.trim().split(/\s+/)
    // qm list header: VMID NAME STATUS MEM(MB) BOOTDISK(GB) PID
    if (parts.length >= 3 && /^\d+$/.test(parts[0])) {
      map[Number(parts[0])] = { name: parts[1] || `VM-${parts[0]}`, status: parts[2] || 'unknown' }
    }
  })
  return map
}

export function parseAptOutput(output) {
  return output.split('\n')
    .filter(line => line.includes('/') && !line.startsWith('Listing') && line.trim())
    .map(line => {
      const parts = line.split(/\s+/)
      const name = (parts[0] || '').split('/')[0]
      return { name, newVersion: parts[1] || '', arch: parts[2] || '' }
    })
    .filter(p => p.name)
}

export function parseApkOutput(output) {
  // `apk list --upgradable` output: name-version [repo]
  return output.split('\n')
    .filter(line => line.trim() && !line.startsWith('fetch'))
    .map(line => {
      const match = line.match(/^([a-zA-Z0-9._+-]+)-([^\s]+)\s/)
      if (!match) return null
      return { name: match[1], newVersion: match[2], arch: '' }
    })
    .filter(Boolean)
}

export function parseKeptBack(output) {
  const names = new Set()
  const lines = output.split('\n')
  let inSection = false
  for (const line of lines) {
    if (/kept back:/i.test(line)) { inSection = true; continue }
    if (inSection) {
      if (line.startsWith(' ') || line.startsWith('\t')) {
        line.trim().split(/\s+/).forEach(n => { if (n) names.add(n) })
      } else {
        inSection = false
      }
    }
  }
  return names
}

export function parseDnfOutput(output) {
  // `dnf check-update` lists: name.arch  newVersion  repo
  return output.split('\n')
    .filter(line => line.trim() && !line.startsWith('Last') && !line.startsWith('Loaded') && !line.startsWith('Obsoleting') && !/^[A-Z]/.test(line))
    .map(line => {
      const parts = line.trim().split(/\s+/)
      if (parts.length < 2) return null
      const name = (parts[0] || '').split('.')[0]
      return { name, newVersion: parts[1] || '', arch: '' }
    })
    .filter(p => p?.name)
}
