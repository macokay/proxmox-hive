export const wsClients = new Set()

export function broadcast(data) {
  const msg = JSON.stringify(data)
  wsClients.forEach(ws => {
    if (ws.readyState === 1) ws.send(msg)
  })
}

export function sendToClient(ws, data) {
  if (ws.readyState === 1) ws.send(JSON.stringify(data))
}
