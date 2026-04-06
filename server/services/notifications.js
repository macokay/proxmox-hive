import axios from 'axios'

// ─── Channel type definitions ─────────────────────────────────────────────────

const CHANNEL_TYPES = {
  discord: { name: 'Discord', placeholder: 'https://discord.com/api/webhooks/...' },
  slack:   { name: 'Slack',   placeholder: 'https://hooks.slack.com/services/...' },
  teams:   { name: 'Microsoft Teams', placeholder: 'https://your-org.webhook.office.com/...' },
  webhook: { name: 'Generic Webhook', placeholder: 'https://your-server.com/webhook' },
}

export { CHANNEL_TYPES }

// ─── Build payloads per type ──────────────────────────────────────────────────

function discordPayload(type, data) {
  const embeds = []
  if (type === 'updates_found') {
    const total = data.nodeUpdates + data.lxcUpdates.reduce((a, l) => a + (l.updates || 0), 0)
    const fields = []
    if (data.nodeUpdates > 0) fields.push({ name: '🖥️ Proxmox Node', value: `${data.nodeUpdates} package${data.nodeUpdates !== 1 ? 's' : ''}`, inline: true })
    data.lxcUpdates.forEach(lxc => {
      if (lxc.updates > 0) fields.push({ name: `📦 ${lxc.name} (CT ${lxc.vmid})`, value: `${lxc.updates} package${lxc.updates !== 1 ? 's' : ''}`, inline: true })
    })
    embeds.push({ title: `🔄 ${total} update${total !== 1 ? 's' : ''} available`, description: `**${data.siteName || 'Proxmox'}** has updates ready.`, color: 0x3b82f6, fields, footer: { text: 'Proxmox Hive' }, timestamp: new Date().toISOString() })
  } else if (type === 'update_complete') {
    embeds.push({ title: data.success ? '✅ Update complete' : '❌ Update failed', description: `**${data.siteName || ''}** — **${data.target}**`, color: data.success ? 0x10b981 : 0xef4444, footer: { text: 'Proxmox Hive' }, timestamp: new Date().toISOString() })
  } else if (type === 'check_complete_no_updates') {
    embeds.push({ title: '✅ All up to date', description: `**${data.siteName || 'Proxmox'}** — nothing to update.`, color: 0x10b981, footer: { text: 'Proxmox Hive' }, timestamp: new Date().toISOString() })
  }
  return { embeds }
}

function slackPayload(type, data) {
  let text = ''
  if (type === 'updates_found') {
    const total = data.nodeUpdates + data.lxcUpdates.reduce((a, l) => a + (l.updates || 0), 0)
    text = `🔄 *${data.siteName || 'Proxmox'}*: ${total} update${total !== 1 ? 's' : ''} available`
  } else if (type === 'update_complete') {
    text = `${data.success ? '✅' : '❌'} *${data.siteName || ''}* — ${data.target}: ${data.success ? 'updated successfully' : 'update failed'}`
  } else if (type === 'check_complete_no_updates') {
    text = `✅ *${data.siteName || 'Proxmox'}*: All up to date`
  }
  return { text }
}

function teamsPayload(type, data) {
  let text = ''
  if (type === 'updates_found') {
    const total = data.nodeUpdates + data.lxcUpdates.reduce((a, l) => a + (l.updates || 0), 0)
    text = `**${data.siteName || 'Proxmox'}**: ${total} update${total !== 1 ? 's' : ''} available`
  } else if (type === 'update_complete') {
    text = `**${data.siteName || ''}** — ${data.target}: ${data.success ? 'updated successfully ✅' : 'update failed ❌'}`
  } else if (type === 'check_complete_no_updates') {
    text = `**${data.siteName || 'Proxmox'}**: All up to date ✅`
  }
  return { type: 'message', attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', content: { type: 'AdaptiveCard', body: [{ type: 'TextBlock', text, wrap: true }] } }] }
}

function webhookPayload(type, data) {
  return { type, timestamp: new Date().toISOString(), ...data }
}

function buildPayload(channelType, type, data) {
  switch (channelType) {
    case 'discord': return discordPayload(type, data)
    case 'slack':   return slackPayload(type, data)
    case 'teams':   return teamsPayload(type, data)
    default:        return webhookPayload(type, data)
  }
}

// ─── Send to all channels of a site ──────────────────────────────────────────

// Map event type to alert key
const ALERT_KEY_MAP = {
  'updates_found':              'onUpdatesFound',
  'update_complete_success':    'onUpdateSuccess',
  'update_complete_failure':    'onUpdateFailed',
  'check_failed':               'onCheckFailed',
  'check_complete_no_updates':  'onNoUpdates',
}

export async function notify(site, type, data) {
  const channels = site?.notifications?.channels || []
  const enriched = { ...data, siteName: site?.name }

  // Handle update_complete split by success flag
  let alertType = type
  if (type === 'update_complete') {
    alertType = data.success ? 'update_complete_success' : 'update_complete_failure'
  }
  const alertKey = ALERT_KEY_MAP[alertType] || alertType

  for (const channel of channels) {
    if (!channel.enabled || !channel.url) continue

    // Check per-channel alert preferences
    const alerts = channel.alerts
    if (alerts) {
      if (!alerts[alertKey]) continue
    } else {
      // Legacy: use notifyNoUpdates for backwards compat
      if (alertType === 'check_complete_no_updates' && !channel.notifyNoUpdates) continue
    }

    try {
      const payload = buildPayload(channel.type, type, enriched)
      await axios.post(channel.url, payload, { timeout: 5000 })
    } catch (e) {
      console.error(`Notification failed [${channel.name}]:`, e.message)
    }
  }
}

// ─── Test a single channel ────────────────────────────────────────────────────

export async function testChannel(channel) {
  const payload = buildPayload(channel.type, 'check_complete_no_updates', { siteName: 'Proxmox Hive' })
  // Override with a clearer test message
  let testPayload
  if (channel.type === 'discord') {
    testPayload = { embeds: [{ title: '✅ Proxmox Hive connected', description: `Channel **${channel.name}** is working.`, color: 0x10b981, timestamp: new Date().toISOString() }] }
  } else if (channel.type === 'slack') {
    testPayload = { text: `✅ Proxmox Hive — channel *${channel.name}* is connected.` }
  } else if (channel.type === 'teams') {
    testPayload = { type: 'message', attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', content: { type: 'AdaptiveCard', body: [{ type: 'TextBlock', text: `✅ Proxmox Hive — ${channel.name} is connected.`, wrap: true }] } }] }
  } else {
    testPayload = { test: true, channel: channel.name, timestamp: new Date().toISOString() }
  }
  await axios.post(channel.url, testPayload, { timeout: 5000 })
}
