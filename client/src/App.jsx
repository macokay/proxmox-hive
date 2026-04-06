import { useState, useEffect } from 'react'
import Setup from './pages/Setup.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Settings from './pages/Settings.jsx'

export default function App() {
  const [configured, setConfigured] = useState(null)
  const [sites, setSites] = useState([])
  const [activeSiteId, setActiveSiteId] = useState(null)
  const [page, setPage] = useState('dashboard') // 'dashboard' | 'settings'
  const [openAddSite, setOpenAddSite] = useState(false)

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

  useEffect(() => { loadSites() }, [])

  if (configured === null) return (
    <div className="h-full flex items-center justify-center">
      <span className="pulse-dot w-2 h-2 rounded-full bg-accent block" />
    </div>
  )

  if (!configured || sites.length === 0) {
    return <Setup onComplete={() => { loadSites() }} />
  }

  if (page === 'settings') {
    return (
      <Settings
        sites={sites}
        activeSiteId={activeSiteId}
        onBack={async () => { await loadSites(); setPage('dashboard'); setOpenAddSite(false) }}
        onSitesChanged={loadSites}
        onReset={() => { setConfigured(false); setSites([]); setActiveSiteId(null) }}
        openAddSite={openAddSite}
      />
    )
  }

  return (
    <Dashboard
      sites={sites}
      activeSiteId={activeSiteId || sites[0]?.id}
      onSiteChange={setActiveSiteId}
      onSettings={() => { setOpenAddSite(false); setPage('settings') }}
      onAddSite={() => { setOpenAddSite(true); setPage('settings') }}
    />
  )
}
