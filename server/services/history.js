import fs from 'fs'

const HISTORY_PATH = '/data/history.json'
const RETENTION_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

// ─── Storage ──────────────────────────────────────────────────────────────────

function readHistory() {
  try {
    const data = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'))
    return { entries: data.entries || [], lastSeenVersion: data.lastSeenVersion || null }
  } catch {
    return { entries: [], lastSeenVersion: null }
  }
}

// Written via rename so a restart mid-write (Hive updating its own host) can
// never leave a truncated file behind.
function writeHistory(data) {
  const cutoff = Date.now() - RETENTION_DAYS * DAY_MS
  data.entries = data.entries.filter(e => new Date(e.startedAt).getTime() >= cutoff)
  fs.mkdirSync('/data', { recursive: true })
  const tmp = `${HISTORY_PATH}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, HISTORY_PATH)
}

function newId() {
  return `h-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function startEntry({ siteId, siteName, target, vmid = null, label, trigger = 'manual', group = null }) {
  const data = readHistory()
  const entry = {
    id: newId(), siteId, siteName, target, vmid, label, trigger, group,
    startedAt: new Date().toISOString(), finishedAt: null, status: 'running', packages: []
  }
  data.entries.push(entry)
  writeHistory(data)
  return entry.id
}

export function finishEntry(id, { status, packages = [] }) {
  const data = readHistory()
  const entry = data.entries.find(e => e.id === id)
  if (!entry) return
  entry.status = status
  entry.packages = packages
  entry.finishedAt = new Date().toISOString()
  writeHistory(data)
}

export function getHistory({ days, siteId = null }) {
  const cutoff = Date.now() - days * DAY_MS
  return readHistory().entries
    .filter(e => new Date(e.startedAt).getTime() >= cutoff)
    .filter(e => !siteId || e.siteId === siteId || e.target === 'hive')
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}

// An entry still running at boot belongs to a process that died mid-update —
// most often Hive itself, stopped by a Docker upgrade in its own container.
export function markInterrupted() {
  const data = readHistory()
  const running = data.entries.filter(e => e.status === 'running')
  if (running.length === 0) return
  running.forEach(e => { e.status = 'interrupted' })
  writeHistory(data)
}

// Self-updates end by restarting the process that started them, so the update
// path never lives to record its own result. The next boot does it instead,
// which also catches updates made by hand through docker compose.
export function recordSelfUpdateIfChanged(currentVersion) {
  if (!currentVersion || currentVersion === 'dev') return
  const data = readHistory()
  const previous = data.lastSeenVersion
  if (previous === currentVersion) return
  data.lastSeenVersion = currentVersion
  if (previous) {
    const now = new Date().toISOString()
    data.entries.push({
      id: newId(), siteId: null, siteName: null, target: 'hive', vmid: null, label: 'Proxmox Hive',
      trigger: 'manual', group: null, startedAt: now, finishedAt: now, status: 'success',
      packages: [{ name: 'proxmox-hive', from: previous, to: currentVersion, action: 'upgrade' }]
    })
  }
  writeHistory(data)
}

// ─── Output parsing ───────────────────────────────────────────────────────────

const APT_UNPACK = /^Unpacking (\S+?)(?::\S+)? \((\S+)\)(?: over \((\S+)\))?/
const APT_REMOVE = /^Removing (\S+?)(?::\S+)? \((\S+)\)/
const APK_LINE = /^\(\d+\/\d+\) (Upgrading|Installing|Purging|Downgrading) (\S+) \(([^)]+)\)/

// Reads what the package manager actually did from its own output, so the log
// holds real old → new versions instead of what the last check expected.
export function parseInstalled(output) {
  const packages = []
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.trim()
    let m = line.match(APT_UNPACK)
    if (m) {
      packages.push(m[3]
        ? { name: m[1], from: m[3], to: m[2], action: 'upgrade' }
        : { name: m[1], from: null, to: m[2], action: 'install' })
      continue
    }
    m = line.match(APT_REMOVE)
    if (m) {
      packages.push({ name: m[1], from: m[2], to: null, action: 'remove' })
      continue
    }
    m = line.match(APK_LINE)
    if (m) {
      const [from, to] = m[3].includes(' -> ') ? m[3].split(' -> ') : [null, m[3]]
      if (m[1] === 'Purging') packages.push({ name: m[2], from: to, to: null, action: 'remove' })
      else if (m[1] === 'Installing') packages.push({ name: m[2], from: null, to, action: 'install' })
      else packages.push({ name: m[2], from, to, action: 'upgrade' })
    }
  }
  return packages
}
