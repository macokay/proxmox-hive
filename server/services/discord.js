import axios from 'axios'
import { getConfig } from './ssh.js'

export async function sendDiscordNotification(type, data) {
  const config = getConfig()
  const url = config?.discord?.webhookUrl
  if (!url) return

  let embeds = []

  if (type === 'updates_found') {
    const total = data.nodeUpdates + data.lxcUpdates.reduce((a, l) => a + (l.updates || 0), 0)
    const fields = []

    if (data.nodeUpdates > 0) {
      fields.push({
        name: '🖥️ Proxmox Node',
        value: `${data.nodeUpdates} pakke${data.nodeUpdates !== 1 ? 'r' : ''} klar`,
        inline: true
      })
    }

    data.lxcUpdates.forEach(lxc => {
      if (lxc.updates > 0) {
        fields.push({
          name: `📦 ${lxc.name} (CT ${lxc.vmid})`,
          value: `${lxc.updates} pakke${lxc.updates !== 1 ? 'r' : ''} klar`,
          inline: true
        })
      }
    })

    embeds = [{
      title: `🔄 ${total} opdatering${total !== 1 ? 'er' : ''} fundet`,
      description: 'Log ind på Proxmox Hive for at opdatere.',
      color: 0x3b82f6,
      fields,
      footer: { text: 'Proxmox Hive' },
      timestamp: new Date().toISOString()
    }]
  } else if (type === 'update_complete') {
    embeds = [{
      title: data.success ? '✅ Opdatering fuldført' : '❌ Opdatering fejlede',
      description: `**${data.target}** -- ${data.success ? 'Alle pakker er opdateret.' : 'Tjek logs for detaljer.'}`,
      color: data.success ? 0x10b981 : 0xef4444,
      footer: { text: 'Proxmox Hive' },
      timestamp: new Date().toISOString()
    }]
  } else if (type === 'check_complete_no_updates') {
    embeds = [{
      title: '✅ Ingen opdateringer',
      description: 'Alt er opdateret.',
      color: 0x10b981,
      footer: { text: 'Proxmox Hive' },
      timestamp: new Date().toISOString()
    }]
  }

  try {
    await axios.post(url, { embeds }, { timeout: 5000 })
  } catch (e) {
    console.error('Discord webhook failed:', e.message)
  }
}
