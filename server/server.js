import express from 'express'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import apiRouter from './routes/api.js'
import { wsClients, broadcast, sendToClient, getActiveJobs } from './broadcast.js'
import { initScheduler } from './services/scheduler.js'
import { isConfigured, getAppSettings } from './services/config.js'
import { getCurrentVersion, resolveUpdate } from './services/selfUpdate.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
const server = createServer(app)
const wss = new WebSocketServer({ server, path: '/ws' })

app.use(express.json({ limit: '10mb' }))
app.use('/api', apiRouter)

const staticPath = path.join(__dirname, 'public')
if (fs.existsSync(staticPath)) {
  app.use(express.static(staticPath))
  app.get('*', (req, res) => res.sendFile(path.join(staticPath, 'index.html')))
}

let pendingUpdate = null

wss.on('connection', (ws) => {
  wsClients.add(ws)
  ws.on('close', () => wsClients.delete(ws))
  ws.on('error', () => wsClients.delete(ws))
  // A tab that was open through a server restart still shows the updates that
  // were running then, spinning forever because their closing event died with
  // the process. Send the truth on every connect and let it reconcile.
  sendToClient(ws, { type: 'active_jobs', keys: getActiveJobs() })
  if (pendingUpdate) sendToClient(ws, { type: 'app_update_available', ...pendingUpdate })
})

if (isConfigured()) {
  try { initScheduler(); console.log('Scheduler initialized') }
  catch (e) { console.error('Scheduler init failed:', e.message) }
}

async function checkAndBroadcastUpdate() {
  const current = getCurrentVersion()
  if (current === 'dev') return
  try {
    const { betaUpdates } = getAppSettings()
    const result = await resolveUpdate(betaUpdates)
    console.log(`[update check] current=${current} latest=${result.latest} updateAvailable=${result.updateAvailable} beta=${result.beta}`)
    if (result.updateAvailable) {
      pendingUpdate = result
      broadcast({ type: 'app_update_available', ...result })
    } else {
      pendingUpdate = null
    }
  } catch (e) {
    console.error('[update check] failed:', e.message)
  }
}

// Check on startup and every 15 minutes
checkAndBroadcastUpdate()
setInterval(checkAndBroadcastUpdate, 15 * 60 * 1000)

const PORT = process.env.PORT || 3000
server.listen(PORT, () => console.log(`Proxmox Hive running on http://localhost:${PORT}`))
