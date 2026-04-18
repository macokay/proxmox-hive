import fs from 'fs'

const DATA_PATH = '/data/sites.json'
const LEGACY_PATH = '/data/config.json'

// ─── Migration from single config to multi-site ───────────────────────────────

function migrateIfNeeded() {
  if (fs.existsSync(DATA_PATH)) return
  if (!fs.existsSync(LEGACY_PATH)) return
  try {
    const legacy = JSON.parse(fs.readFileSync(LEGACY_PATH, 'utf8'))
    const sites = [{
      id: 'site-1',
      name: 'Home Lab',
      ssh: legacy.ssh,
      notifications: migrateNotifications(legacy),
      schedule: legacy.schedule || { times: ['08:00', '20:00'] },
      monitoredLXC: legacy.monitoredLXC || [],
      autoUpdate: legacy.autoUpdate || { groups: [] },
      lastCheck: legacy.lastCheck || null
    }]
    fs.mkdirSync('/data', { recursive: true })
    fs.writeFileSync(DATA_PATH, JSON.stringify({ sites }, null, 2))
    console.log('Migrated legacy config to multi-site format')
  } catch (e) {
    console.error('Migration failed:', e.message)
  }
}

function migrateNotifications(legacy) {
  const channels = []
  if (legacy.discord?.webhookUrl) {
    channels.push({
      id: 'ch-1',
      type: 'discord',
      name: 'Discord',
      url: legacy.discord.webhookUrl,
      enabled: true,
      notifyNoUpdates: legacy.discord.notifyNoUpdates || false
    })
  }
  return { channels }
}

// ─── Core API ─────────────────────────────────────────────────────────────────

export function isConfigured() {
  migrateIfNeeded()
  if (!fs.existsSync(DATA_PATH)) return false
  const data = readData()
  return data.sites?.length > 0
}

function readData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'))
  } catch {
    return { sites: [] }
  }
}

function writeData(data) {
  fs.mkdirSync('/data', { recursive: true })
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2))
}

export function getAllSites() {
  migrateIfNeeded()
  return readData().sites || []
}

export function getSite(id) {
  return getAllSites().find(s => s.id === id) || null
}

export function saveSite(site) {
  const data = readData()
  const idx = data.sites.findIndex(s => s.id === site.id)
  if (idx >= 0) {
    data.sites[idx] = site
  } else {
    data.sites.push(site)
  }
  writeData(data)
}

export function deleteSite(id) {
  const data = readData()
  data.sites = data.sites.filter(s => s.id !== id)
  writeData(data)
}

export function resetAll() {
  if (fs.existsSync(DATA_PATH)) fs.unlinkSync(DATA_PATH)
  if (fs.existsSync(LEGACY_PATH)) fs.unlinkSync(LEGACY_PATH)
}

export function safeSiteForClient(site) {
  if (!site) return null
  return {
    ...site,
    ssh: {
      ...site.ssh,
      privateKey: site.ssh?.privateKey ? '[set]' : null,
      password: site.ssh?.password ? '[set]' : null
    }
  }
}

export function newSiteId() {
  return `site-${Date.now()}`
}

export function getAppSettings() {
  const data = readData()
  return data.appSettings || { betaUpdates: false }
}

export function saveAppSettings(settings) {
  const data = readData()
  data.appSettings = { ...getAppSettings(), ...settings }
  writeData(data)
}
