import { useState, useEffect, useRef } from 'react'
import Setup from './pages/Setup.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Settings from './pages/Settings.jsx'
import { useWebSocket } from './hooks/useWebSocket.js'

function UpdateBanner({ info, onDismiss }) {
  const [applying, setApplying] = useState(false)
  const [logs, setLogs] = useState([])
  const [done, setDone] = useState(false)
  const logRef = useRef(null)

  useWebSocket((msg) => {
    if (msg.type === 'app_update_log') {
      setLogs(prev => [...prev, msg.data])
    }
    if (msg.type === 'app_update_done') {
      setDone(true)
    }
  })

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logs])

  async function handleApply() {
    setApplying(true)
    setLogs([])
    setDone(false)
    await fetch('/api/app-update/apply', { method: 'POST' })
  }

  return (
    <div className="border-b border-accent/30 bg-accent/5 px-5 py-2.5 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-accent font-medium">
          Proxmox Hive v{info.latest} is available
          <span className="text-muted font-normal ml-2">(current: v{info.current})</span>
        </span>
        <div className="flex items-center gap-2">
          {!applying && (
            <button
              onClick={handleApply}
              className="btn-primary text-xs px-3 py-1"
            >
              Update now
            </button>
          )}
          {!applying && (
            <button onClick={onDismiss} className="text-muted hover:text-white text-xs transition-colors">
              Dismiss
            </button>
          )}
        </div>
      </div>
      {applying && (
        <div>
          <div
            ref={logRef}
            className="bg-base-900 rounded font-mono text-xs text-muted p-3 max-h-40 overflow-y-auto whitespace-pre-wrap"
          >
            {logs.join('') || 'Starting update…'}
          </div>
          {done && (
            <p className="text-xs text-muted mt-1">Restarting — page will reload shortly…</p>
          )}
        </div>
      )}
    </div>
  )
}

export default function App() {
  const [configured, setConfigured] = useState(null)
  const [sites, setSites] = useState([])
  const [activeSiteId, setActiveSiteId] = useState(null)
  const [page, setPage] = useState('dashboard') // 'dashboard' | 'settings'
  const [openAddSite, setOpenAddSite] = useState(false)
  const [updateInfo, setUpdateInfo] = useState(null)
  const [bannerDismissed, setBannerDismissed] = useState(false)

  async function loadSites() {
    const [status, sitesRes] = await Promise.all([
      fetch('/api/config/status').then(r => r.json()),
      fetch('/api/sites').then(r => r.json()).catch(() => ({ sites: [] }))
    ])
    setConfigured(status.configured)
    const s = sitesRes.sites || []
    setSites(s)
    if (s.length > 0 && !activeSiteId) setActiveSiteId(s[0].id)
  }

  useEffect(() => {
    loadSites()
    fetch('/api/app-update').then(r => r.json()).then(d => {
      if (d.updateAvailable) setUpdateInfo(d)
    }).catch(() => {})
  }, [])

  if (configured === null) return (
    <div className="h-full flex items-center justify-center">
      <span className="pulse-dot w-2 h-2 rounded-full bg-accent block" />
    </div>
  )

  if (!configured || sites.length === 0) {
    return <Setup onComplete={() => { loadSites() }} />
  }

  const showBanner = updateInfo && !bannerDismissed

  if (page === 'settings') {
    return (
      <>
        {showBanner && (
          <UpdateBanner info={updateInfo} onDismiss={() => setBannerDismissed(true)} />
        )}
        <Settings
          sites={sites}
          activeSiteId={activeSiteId}
          onBack={async () => { await loadSites(); setPage('dashboard'); setOpenAddSite(false) }}
          onSitesChanged={loadSites}
          onReset={() => { setConfigured(false); setSites([]); setActiveSiteId(null) }}
          openAddSite={openAddSite}
        />
      </>
    )
  }

  return (
    <>
      {showBanner && (
        <UpdateBanner info={updateInfo} onDismiss={() => setBannerDismissed(true)} />
      )}
      <Dashboard
        sites={sites}
        activeSiteId={activeSiteId || sites[0]?.id}
        onSiteChange={setActiveSiteId}
        onSettings={() => { setOpenAddSite(false); setPage('settings') }}
        onAddSite={() => { setOpenAddSite(true); setPage('settings') }}
      />
    </>
  )
}
