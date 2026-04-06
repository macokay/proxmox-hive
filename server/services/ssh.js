import { Client } from 'ssh2'
import fs from 'fs'

const CONFIG_PATH = '/data/config.json'

export function getConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return null
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
}

export function saveConfig(config) {
  fs.mkdirSync('/data', { recursive: true })
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))
}

export function isConfigured() {
  return fs.existsSync(CONFIG_PATH)
}

function buildConnectConfig(sshConfig) {
  const cfg = {
    host: sshConfig.host,
    port: sshConfig.port || 22,
    username: sshConfig.username,
    readyTimeout: 10000,
  }
  if (sshConfig.privateKey) {
    cfg.privateKey = sshConfig.privateKey
  } else if (sshConfig.password) {
    cfg.password = sshConfig.password
  }
  return cfg
}

export function createSSHConnection(sshConfig) {
  return new Promise((resolve, reject) => {
    const conn = new Client()
    const timeout = setTimeout(() => {
      conn.destroy()
      reject(new Error('SSH connection timed out'))
    }, 12000)

    conn.on('ready', () => {
      clearTimeout(timeout)
      resolve(conn)
    })
    conn.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })
    conn.connect(buildConnectConfig(sshConfig))
  })
}

export async function execCommand(cmd) {
  const config = getConfig()
  if (!config) throw new Error('Not configured')
  const conn = await createSSHConnection(config.ssh)
  return new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    conn.exec(cmd, (err, stream) => {
      if (err) { conn.end(); return reject(err) }
      stream.on('data', d => { stdout += d.toString() })
      stream.stderr.on('data', d => { stderr += d.toString() })
      stream.on('close', (code) => {
        conn.end()
        resolve({ stdout, stderr, code })
      })
    })
  })
}

export async function execStream(cmd, onData, onDone) {
  const config = getConfig()
  if (!config) throw new Error('Not configured')
  const conn = await createSSHConnection(config.ssh)
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) { conn.end(); return reject(err) }
      stream.on('data', d => onData(d.toString(), 'stdout'))
      stream.stderr.on('data', d => onData(d.toString(), 'stderr'))
      stream.on('close', (code) => {
        conn.end()
        onDone(code)
        resolve(code)
      })
    })
  })
}

export async function testConnection(sshConfig) {
  const conn = await createSSHConnection(sshConfig)
  return new Promise((resolve, reject) => {
    conn.exec('echo ok', (err, stream) => {
      if (err) { conn.end(); return reject(err) }
      let out = ''
      stream.on('data', d => { out += d.toString() })
      stream.on('close', () => {
        conn.end()
        if (out.trim() === 'ok') resolve(true)
        else reject(new Error('Unexpected response'))
      })
    })
  })
}

export function parseAptOutput(output) {
  return output
    .split('\n')
    .filter(line => line.includes('/') && !line.startsWith('Listing') && line.trim())
    .map(line => {
      const parts = line.split(/\s+/)
      const namePart = parts[0] || ''
      const name = namePart.split('/')[0]
      const newVersion = parts[1] || ''
      const arch = parts[2] || ''
      return { name, newVersion, arch }
    })
    .filter(p => p.name)
}
