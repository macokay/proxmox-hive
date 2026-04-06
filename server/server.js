import express from 'express'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import apiRouter from './routes/api.js'
import { wsClients } from './broadcast.js'
import { initScheduler } from './services/scheduler.js'
import { isConfigured } from './services/config.js'

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

wss.on('connection', (ws) => {
  wsClients.add(ws)
  ws.on('close', () => wsClients.delete(ws))
  ws.on('error', () => wsClients.delete(ws))
})

if (isConfigured()) {
  try { initScheduler(); console.log('Scheduler initialized') }
  catch (e) { console.error('Scheduler init failed:', e.message) }
}

const PORT = process.env.PORT || 3000
server.listen(PORT, () => console.log(`Proxmox Hive running on http://localhost:${PORT}`))
