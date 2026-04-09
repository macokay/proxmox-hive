import { Router } from 'express'
import net from 'net'
import os from 'os'
import { createSSHConnection } from '../services/ssh.js'
import {
  isConfigured, getAllSites, getSite, saveSite, deleteSite,
  resetAll, safeSiteForClient, newSiteId
} from '../services/config.js'
import { initScheduler, initSiteScheduler, runCheck, runTargetUpdate, runGroupUpdate, parseLXCList, parseQMList } from '../services/scheduler.js'
import { testChannel } from '../services/notifications.js'
import { broadcast } from '../broadcast.js'
import { getCurrentVersion, fetchLatestRelease, isUpdateAvailable, applySelfUpdate } from '../services/selfUpdate.js'

const router = Router()

// ─── Version ──────────────────────────────────────────────────────────────────

router.get('/version', (req, res) => {
  res.json({ version: getCurrentVersion() })
})

// ─── App self-update ──────────────────────────────────────────────────────────

let _updateCache = null
let _updateCacheAt = 0

router.get('/app-update', async (req, res) => {
  const current = getCurrentVersion()
  if (current === 'dev') return res.json({ current, latest: null, updateAvailable: false })

  const now = Date.now()
  if (_updateCache && now - _updateCacheAt < 60 * 60 * 1000) return res.json(_updateCache)

  try {
    const latest = await fetchLatestRelease()
    const updateAvailable = isUpdateAvailable(current, latest)
    _updateCache = { current, latest, updateAvailable }
    _updateCacheAt = now
    res.json(_updateCache)
  } catch (e) {
    res.json({ current, latest: null, updateAvailable: false, error: e.message })
  }
})

router.post('/app-update/apply', (req, res) => {
  res.json({ started: true })
  ;(async () => {
    try {
      await applySelfUpdate(data => broadcast({ type: 'app_update_log', data }))
    } catch (e) {
      broadcast({ type: 'app_update_log', data: `\nError: ${e.message}\n` })
      broadcast({ type: 'app_update_done', success: false })
    }
  })()
})

// ─── Config status ────────────────────────────────────────────────────────────

router.get('/config/status', (req, res) => {
  res.json({ configured: isConfigured() })
})

// ─── Sites ────────────────────────────────────────────────────────────────────

router.get('/sites', (req, res) => {
  res.json({ sites: getAllSites().map(safeSiteForClient) })
})

router.get('/sites/:id', (req, res) => {
  const site = getSite(req.params.id)
  if (!site) return res.status(404).json({ error: 'Site not found' })
  res.json(safeSiteForClient(site))
})

router.patch('/sites/:id', async (req, res) => {
  try {
    const existing = getSite(req.params.id)
    if (!existing) return res.status(404).json({ error: 'Site not found' })

    const incoming = req.body
    // Preserve sensitive fields if placeholder sent
    if (incoming.ssh?.privateKey === '[set]' || incoming.ssh?.privateKey === '') incoming.ssh.privateKey = existing.ssh?.privateKey
    if (incoming.ssh?.password === '[set]' || incoming.ssh?.password === '') incoming.ssh.password = existing.ssh?.password

    // Sync lastCheck.lxc with new monitoredLXC
    let lastCheck = existing.lastCheck
    if (lastCheck && incoming.monitoredLXC) {
      const monitoredSet = new Set(incoming.monitoredLXC)
      const existingVmids = new Set((lastCheck.lxc || []).map(l => l.vmid))
      const newVmids = incoming.monitoredLXC.filter(v => !existingVmids.has(v))
      if (newVmids.length > 0) {
        let lxcMap = {}
        try {
          const raw = await siteExecSimple(incoming.ssh || existing.ssh, 'pct list').catch(() =>
            siteExecSimple(incoming.ssh || existing.ssh, 'sudo pct list')
          )
          lxcMap = parseLXCList(raw)
        } catch { }
        for (const vmid of newVmids) {
          const info = lxcMap[vmid] || { name: `CT-${vmid}`, status: 'unknown' }
          lastCheck.lxc.push({ vmid, name: info.name, updates: 0, packages: [], appUpdates: [], running: info.status === 'running', pending: true })
        }
      }
      lastCheck.lxc = lastCheck.lxc.filter(l => monitoredSet.has(l.vmid))
    }

    // Sync lastCheck.vms with new monitoredVMs
    if (lastCheck && incoming.monitoredVMs !== undefined) {
      const monitoredSet = new Set(incoming.monitoredVMs || [])
      const existingVmids = new Set((lastCheck.vms || []).map(v => v.vmid))
      const newVmids = (incoming.monitoredVMs || []).filter(v => !existingVmids.has(v))
      if (newVmids.length > 0) {
        let vmMap = {}
        try {
          const isRoot = !existing.ssh.username || existing.ssh.username === 'root'
          const prefix = isRoot ? '' : 'sudo '
          const raw = await siteExecSimple(existing.ssh, `${prefix}qm list`).catch(() =>
            siteExecSimple(existing.ssh, 'sudo qm list')
          )
          vmMap = parseQMList(raw)
        } catch { }
        if (!lastCheck.vms) lastCheck.vms = []
        for (const vmid of newVmids) {
          const info = vmMap[vmid] || { name: `VM-${vmid}`, status: 'unknown' }
          lastCheck.vms.push({ vmid, name: info.name, updates: 0, packages: [], running: info.status === 'running', pending: true })
        }
      }
      lastCheck.vms = (lastCheck.vms || []).filter(v => monitoredSet.has(v.vmid))
    }

    const updated = { ...existing, ...incoming, lastCheck }
    saveSite(updated)
    initSiteScheduler(updated)
    if (lastCheck) broadcast({ type: 'status_update', siteId: updated.id, lastCheck })
    res.json({ ok: true, site: safeSiteForClient(updated) })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.delete('/sites/:id', (req, res) => {
  deleteSite(req.params.id)
  initScheduler()
  broadcast({ type: 'site_deleted', siteId: req.params.id })
  res.json({ ok: true })
})

// ─── Setup ────────────────────────────────────────────────────────────────────

// ─── Autodiscover ─────────────────────────────────────────────────────────────

router.get('/setup/discover', async (req, res) => {
  // Probe a single host:port with TCP connect, resolve true/false
  function probe(host, port, timeout = 800) {
    return new Promise(resolve => {
      const s = net.createConnection({ host, port, timeout })
      s.once('connect', () => { s.destroy(); resolve(true) })
      s.once('error', () => resolve(false))
      s.once('timeout', () => { s.destroy(); resolve(false) })
    })
  }

  // Collect unique /24 subnets from local interfaces
  const subnets = new Set()
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces) {
      if (iface.family === 'IPv4' && !iface.internal) {
        const parts = iface.address.split('.')
        subnets.add(`${parts[0]}.${parts[1]}.${parts[2]}`)
      }
    }
  }

  if (subnets.size === 0) return res.json({ hosts: [] })

  const targets = []
  for (const subnet of subnets) {
    for (let i = 1; i <= 254; i++) targets.push(`${subnet}.${i}`)
  }

  // Scan in batches of 40 concurrent probes
  const BATCH = 40
  const found = []
  for (let i = 0; i < targets.length; i += BATCH) {
    const batch = targets.slice(i, i + BATCH)
    const results = await Promise.all(batch.map(async ip => ({ ip, ok: await probe(ip, 8006) })))
    results.filter(r => r.ok).forEach(r => found.push(r.ip))
  }

  res.json({ hosts: found })
})

router.post('/setup/test-ssh', async (req, res) => {
  try {
    const conn = await createSSHConnection(req.body)
    await new Promise((resolve, reject) => {
      conn.exec('echo ok', (err, stream) => {
        if (err) { conn.end(); return reject(err) }
        let out = ''
        stream.on('data', d => { out += d })
        stream.on('close', () => { conn.end(); out.trim() === 'ok' ? resolve() : reject(new Error('Unexpected response')) })
      })
    })
    res.json({ ok: true })
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message })
  }
})

router.post('/setup/list-lxc', async (req, res) => {
  try {
    const conn = await createSSHConnection(req.body)
    const tryCmd = (cmd) => new Promise((resolve) => {
      let out = '', err = ''
      conn.exec(cmd, (e, stream) => {
        if (e) return resolve({ out: '', err: e.message, code: 1 })
        stream.on('data', d => { out += d })
        stream.stderr.on('data', d => { err += d })
        stream.on('close', (code) => resolve({ out, err, code }))
      })
    })

    // Try without sudo first (works as root), then with sudo
    let result = await tryCmd('pct list')
    if (result.code !== 0 || !result.out.trim()) {
      result = await tryCmd('sudo pct list')
    }
    conn.end()

    if (result.code !== 0 && !result.out.trim()) {
      return res.status(400).json({ error: `pct list failed: ${result.err.trim() || 'no output'}` })
    }

    const lxcMap = parseLXCList(result.out)
    res.json({ lxc: Object.entries(lxcMap).map(([vmid, info]) => ({ vmid: Number(vmid), ...info })) })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

router.post('/setup/list-vms', async (req, res) => {
  try {
    const conn = await createSSHConnection(req.body)
    const tryCmd = (cmd) => new Promise((resolve) => {
      let out = '', err = ''
      conn.exec(cmd, (e, stream) => {
        if (e) return resolve({ out: '', err: e.message, code: 1 })
        stream.on('data', d => { out += d })
        stream.stderr.on('data', d => { err += d })
        stream.on('close', (code) => resolve({ out, err, code }))
      })
    })

    let result = await tryCmd('qm list')
    if (result.code !== 0 || !result.out.trim()) {
      result = await tryCmd('sudo qm list')
    }
    conn.end()

    if (result.code !== 0 && !result.out.trim()) {
      return res.status(400).json({ error: `qm list failed: ${result.err.trim() || 'no output'}` })
    }

    const vmMap = parseQMList(result.out)
    res.json({ vms: Object.entries(vmMap).map(([vmid, info]) => ({ vmid: Number(vmid), ...info })) })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

router.post('/setup/save', (req, res) => {
  try {
    const { name, ssh, notifications, schedule, monitoredLXC, monitoredVMs, autoUpdate } = req.body
    const site = {
      id: newSiteId(),
      name: name || 'Home Lab',
      ssh,
      notifications: notifications || { channels: [] },
      schedule: schedule || { times: ['08:00', '20:00'] },
      monitoredLXC: monitoredLXC || [],
      monitoredVMs: monitoredVMs || [],
      autoUpdate: autoUpdate || { groups: [] },
      lastCheck: null
    }
    saveSite(site)
    initSiteScheduler(site)
    res.json({ ok: true, siteId: site.id })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── LXC list (live, for settings) ────────────────────────────────────────────

router.get('/sites/:id/lxc', async (req, res) => {
  try {
    const site = getSite(req.params.id)
    if (!site) return res.status(404).json({ error: 'Site not found' })

    let raw = ''
    let lastErr = ''

    for (const cmd of ['pct list', 'sudo pct list']) {
      try {
        raw = await siteExecSimple(site.ssh, cmd)
        if (raw.trim()) break
      } catch (e) {
        lastErr = e.message
      }
    }

    if (!raw.trim()) {
      return res.status(500).json({ error: lastErr || 'pct list returned no output. Is pct in PATH?' })
    }

    const lxc = Object.entries(parseLXCList(raw)).map(([vmid, info]) => ({ vmid: Number(vmid), ...info }))
    res.json({ lxc })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── VM list (live, for settings) ──────────────────────────────────────────────

router.get('/sites/:id/vms', async (req, res) => {
  try {
    const site = getSite(req.params.id)
    if (!site) return res.status(404).json({ error: 'Site not found' })

    const isRoot = !site.ssh.username || site.ssh.username === 'root'
    const prefix = isRoot ? '' : 'sudo '
    let raw = ''
    let lastErr = ''

    for (const cmd of [`${prefix}qm list`, 'sudo qm list']) {
      try {
        raw = await siteExecSimple(site.ssh, cmd)
        if (raw.trim()) break
      } catch (e) {
        lastErr = e.message
      }
    }

    if (!raw.trim()) {
      return res.status(500).json({ error: lastErr || 'qm list returned no output' })
    }

    const vms = Object.entries(parseQMList(raw)).map(([vmid, info]) => ({ vmid: Number(vmid), ...info }))
    res.json({ vms })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── Actions ──────────────────────────────────────────────────────────────────

router.post('/sites/:id/check', (req, res) => {
  res.json({ ok: true })
  runCheck(req.params.id).catch(e => console.error('Check error:', e.message))
})

router.post('/sites/:id/update', async (req, res) => {
  const { target, vmid, packages } = req.body
  if (!target) return res.status(400).json({ error: 'Missing target' })
  const site = getSite(req.params.id)
  if (!site) return res.status(404).json({ error: 'Site not found' })

  let targetLabel = target === 'node' ? 'Proxmox Node' : `${target.toUpperCase()}-${vmid}`
  let appUpdates = []

  if (vmid && target === 'lxc' && site.lastCheck?.lxc) {
    const found = site.lastCheck.lxc.find(l => l.vmid === vmid)
    if (found) { targetLabel = `${found.name} (CT ${vmid})`; appUpdates = found.appUpdates || [] }
  }
  if (vmid && target === 'vm' && site.lastCheck?.vms) {
    const found = site.lastCheck.vms.find(v => v.vmid === vmid)
    if (found) { targetLabel = `${found.name} (VM ${vmid})` }
  }

  res.json({ ok: true })

  runTargetUpdate(req.params.id, target, vmid, targetLabel, appUpdates, packages || null).then(success => {
    if (success) {
      const s = getSite(req.params.id)
      if (s?.lastCheck) {
        if (target === 'node') {
          s.lastCheck.node = { updates: 0, packages: [] }
        } else if (target === 'lxc') {
          const e = s.lastCheck.lxc?.find(l => l.vmid === vmid)
          if (e) { e.updates = 0; e.packages = []; e.appUpdates = [] }
        } else if (target === 'vm') {
          const e = s.lastCheck.vms?.find(v => v.vmid === vmid)
          if (e) { e.updates = 0; e.packages = [] }
        }
        saveSite(s)
        broadcast({ type: 'status_update', siteId: s.id, lastCheck: s.lastCheck })
      }
    }
  })
})

router.post('/sites/:id/group-update', (req, res) => {
  const { group } = req.body
  if (!group) return res.status(400).json({ error: 'Missing group' })
  res.json({ ok: true })
  runGroupUpdate(req.params.id, group).catch(e => console.error('Group update error:', e.message))
})

// ─── Notifications ────────────────────────────────────────────────────────────

router.post('/test-notification', async (req, res) => {
  try {
    await testChannel(req.body)
    res.json({ ok: true })
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message })
  }
})

// ─── Offboard ─────────────────────────────────────────────────────────────────

router.post('/sites/:id/offboard', async (req, res) => {
  const site = getSite(req.params.id)
  if (!site) return res.status(404).json({ error: 'Site not found' })

  const username = site.ssh?.username || 'root'
  const isRoot = username === 'root'
  const hasKey = !!site.ssh?.privateKey && site.ssh.privateKey !== '[set]'
    ? true
    : !!(site.ssh?.privateKey) // '[set]' means key was configured

  // Undo everything done during setup:
  // 1. Remove user + home dir (includes ~/.ssh/authorized_keys) — non-root only
  // 2. Remove /etc/sudoers.d/<username>
  // 3. Remove the generated key pair /root/.ssh/pvehive{,.pub}
  // 4. For root: remove the specific public key from /root/.ssh/authorized_keys
  //    (done before removing key files so we can read the pub key)
  // NOTE: sudo itself is intentionally left installed.

  const p = isRoot ? '' : 'sudo '

  let script
  if (isRoot) {
    // Can't delete root user. Remove key pair + strip from authorized_keys.
    script = [
      // Remove specific key from authorized_keys BEFORE deleting key files
      `if [ -f /root/.ssh/pvehive.pub ]; then PUBKEY=$(cat /root/.ssh/pvehive.pub); grep -vF "$PUBKEY" /root/.ssh/authorized_keys > /tmp/_ak_tmp 2>/dev/null && mv /tmp/_ak_tmp /root/.ssh/authorized_keys || true; fi`,
      // Remove generated key pair
      `rm -f /root/.ssh/pvehive /root/.ssh/pvehive.pub 2>/dev/null || true`,
      // Remove sudoers file if present (option B doesn't create one, but just in case)
      `rm -f /etc/sudoers.d/root 2>/dev/null || true`,
      `echo __offboard_ok__`,
    ].join('; ')
  } else {
    script = [
      // Kill any active sessions for the user first
      `${p}pkill -u ${username} 2>/dev/null || true`,
      // Try deluser first, then force userdel
      `${p}deluser --remove-home ${username} 2>/dev/null || ${p}userdel -rf ${username} 2>/dev/null || true`,
      // Belt-and-braces: remove home manually if still there
      `${p}rm -rf /home/${username} 2>/dev/null || true`,
      // Remove sudoers file
      `${p}rm -f /etc/sudoers.d/${username} 2>/dev/null || true`,
      // Remove generated key pair from root's home
      `${p}rm -f /root/.ssh/pvehive /root/.ssh/pvehive.pub 2>/dev/null || true`,
      `echo __offboard_ok__`,
    ].join('; ')
  }

  try {
    const out = await siteExecSimple(site.ssh, script)
    if (out.includes('__offboard_ok__')) {
      res.json({ ok: true, isRoot, hasKey })
    } else {
      res.json({ ok: false, fallback: true, error: 'Commands ran but no confirmation received', username, isRoot, hasKey })
    }
  } catch (e) {
    res.json({ ok: false, fallback: true, error: e.message, username, isRoot, hasKey })
  }
})

// ─── Reset ────────────────────────────────────────────────────────────────────

router.post('/reset', (req, res) => {
  try {
    resetAll()
    broadcast({ type: 'reset' })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function siteExecSimple(sshConfig, cmd) {
  const conn = await createSSHConnection(sshConfig)
  return new Promise((resolve, reject) => {
    let out = '', err = ''
    conn.exec(cmd, (e, stream) => {
      if (e) { conn.end(); return reject(e) }
      stream.on('data', d => { out += d })
      stream.stderr.on('data', d => { err += d })
      stream.on('close', code => {
        conn.end()
        if (code !== 0 && !out.trim()) reject(new Error(err.trim() || `exit ${code}`))
        else resolve(out)
      })
    })
  })
}

export default router
