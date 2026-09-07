export const wsClients = new Set()

// Every update the UI can render opens with an `*_start` event and closes with
// the matching `*_done`. Recording both here — the single point every event
// already passes through — keeps a live set of running jobs without any caller
// having to register itself, so a code path that forgets to close a job cannot
// exist. A browser reconciles against this set on reconnect, which is the only
// way a tab can tell "still running" from "the server died mid-update".
const activeJobs = new Set()

// Mirrors the key the client builds for its terminal map.
function jobKey(data) {
  if (data.type === 'update_start' || data.type === 'update_done') {
    const key = data.key || (data.target === 'node' ? 'node' : `${data.target}-${data.vmid}`)
    return `${data.siteId}:${key}`
  }
  if (data.type === 'auto_update_start' || data.type === 'auto_update_done') {
    return `${data.siteId}:auto-${data.groupName}`
  }
  return null
}

function trackJob(data) {
  const key = jobKey(data)
  if (!key) return
  if (data.type.endsWith('_done')) activeJobs.delete(key)
  else activeJobs.add(key)
}

export function getActiveJobs() {
  return [...activeJobs]
}

export function broadcast(data) {
  trackJob(data)
  const msg = JSON.stringify(data)
  wsClients.forEach(ws => {
    if (ws.readyState === 1) ws.send(msg)
  })
}

export function sendToClient(ws, data) {
  if (ws.readyState === 1) ws.send(JSON.stringify(data))
}
