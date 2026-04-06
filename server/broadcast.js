// Shared broadcast state - avoids circular deps between server.js and services
export const wsClients = new Set()

export function broadcast(data) {
  const msg = JSON.stringify(data)
  wsClients.forEach(ws => {
    if (ws.readyState === 1) ws.send(msg)
  })
}
