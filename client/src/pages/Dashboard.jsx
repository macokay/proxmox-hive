import { useState, useEffect, useCallback, useRef } from 'react'
import { useWebSocket } from '../hooks/useWebSocket.js'
import NodeCard from '../components/NodeCard.jsx'
import LXCCard from '../components/LXCCard.jsx'
import VMCard from '../components/VMCard.jsx'
import Terminal from '../components/Terminal.jsx'

function formatRelative(ts) {
  if (!ts) return null
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(mins / 60)
  if (hours > 0) return `${hours}h ago`
  if (mins > 0) return `${mins}m ago`
  return 'Just now'
}

// ─── Site Dropdown ─────────────────────────────────────────────────────────────

function SiteDropdown({ sites, activeSiteId, onSiteChange, onAddSite }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const activeSite = activeSiteId === 'all'
    ? { id: 'all', name: 'All Sites' }
    : sites.find(s => s.id === activeSiteId) || sites[0]

  useEffect(() => {
    function handle(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  return (
    <div className="relative" ref={ref} style={{ zIndex: 100 }}>
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 text-white text-sm font-medium hover:text-white/80 transition-colors">
        <span className="w-2 h-2 rounded-full bg-success block flex-shrink-0" />
        {activeSite?.name || 'Select site'}
        <span className="text-muted text-xs">▾</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', left: 0,
          width: '13rem', zIndex: 9999,
          background: '#0e0e12', border: '1px solid #1e1e28',
          borderRadius: '12px', boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          padding: '4px 0'
        }}>
          {/* All Sites option */}
          {sites.length > 1 && (
            <button onClick={() => { onSiteChange('all'); setOpen(false) }}
              className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2.5 transition-colors ${
                activeSiteId === 'all' ? 'text-accent bg-accent/10' : 'text-white hover:bg-[#1a1a22]'
              }`}>
              <span className="text-base leading-none">⬡</span>
              All Sites
            </button>
          )}
          {sites.map(site => (
            <button key={site.id} onClick={() => { onSiteChange(site.id); setOpen(false) }}
              className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2.5 transition-colors ${
                site.id === activeSiteId ? 'text-accent bg-accent/10' : 'text-white hover:bg-[#1a1a22]'
              }`}>
              <span className="w-1.5 h-1.5 rounded-full bg-success flex-shrink-0" />
              {site.name}
            </button>
          ))}
          <div style={{ borderTop: '1px solid #1e1e28', marginTop: '4px', paddingTop: '4px' }}>
            <button onClick={() => { onAddSite(); setOpen(false) }}
              className="w-full text-left px-4 py-2.5 text-sm text-muted hover:text-white hover:bg-[#1a1a22] transition-colors flex items-center gap-2">
              + New site
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Update Selection Modal ────────────────────────────────────────────────────

function UpdateSelectionModal({ nodeData, lxcData, vmData, onClose, onUpdate }) {
  const [selected, setSelected] = useState(() => {
    const s = new Set()
    if ((nodeData?.updates || 0) > 0) s.add('node')
    lxcData.forEach(l => { if (((l.packages?.length || 0) + (l.appUpdates?.length || 0)) > 0 && l.running) s.add(`lxc-${l.vmid}`) })
    vmData.forEach(v => { if ((v.packages?.length || 0) > 0 && v.running && !v.noAgent) s.add(`vm-${v.vmid}`) })
    return s
  })
  const [running, setRunning] = useState(false)

  function toggle(id) {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  async function start() {
    setRunning(true)
    const targets = []
    if (selected.has('node') && (nodeData?.updates || 0) > 0) targets.push({ type: 'node', vmid: null, label: 'Proxmox Node' })
    lxcData.forEach(l => {
      const key = `lxc-${l.vmid}`
      if (selected.has(key) && ((l.packages?.length || 0) + (l.appUpdates?.length || 0)) > 0 && l.running)
        targets.push({ type: 'lxc', vmid: l.vmid, label: l.name })
    })
    vmData.forEach(v => {
      const key = `vm-${v.vmid}`
      if (selected.has(key) && (v.packages?.length || 0) > 0 && v.running && !v.noAgent)
        targets.push({ type: 'vm', vmid: v.vmid, label: v.name })
    })
    onClose()
    // Run all updates concurrently
    await Promise.all(targets.map(t => onUpdate(t.type, t.vmid)))
  }

  const totalSelected = [...selected].reduce((acc, id) => {
    if (id === 'node') return acc + (nodeData?.updates || 0)
    if (id.startsWith('lxc-')) {
      const vmid = Number(id.slice(4))
      const l = lxcData.find(x => x.vmid === vmid)
      return acc + (l ? (l.packages?.length || 0) + (l.appUpdates?.length || 0) : 0)
    }
    if (id.startsWith('vm-')) {
      const vmid = Number(id.slice(3))
      const v = vmData.find(x => x.vmid === vmid)
      return acc + (v ? v.packages?.length || 0 : 0)
    }
    return acc
  }, 0)

  const allItems = [
    ...(nodeData?.updates > 0 ? [{ key: 'node', icon: 'proxmox', name: 'Proxmox Node', count: nodeData.updates }] : []),
    ...lxcData.filter(l => ((l.packages?.length || 0) + (l.appUpdates?.length || 0)) > 0).map(l => ({
      key: `lxc-${l.vmid}`, icon: 'lxc', name: l.name, count: (l.packages?.length || 0) + (l.appUpdates?.length || 0),
      disabled: !l.running
    })),
    ...vmData.filter(v => (v.packages?.length || 0) > 0).map(v => ({
      key: `vm-${v.vmid}`, icon: 'vm', name: `${v.name} (VM)`, count: v.packages?.length || 0,
      disabled: !v.running || v.noAgent
    })),
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(8,8,10,0.85)', backdropFilter: 'blur(6px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="slide-up w-full max-w-md card border-border">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-white font-semibold text-sm">Select updates to apply</h3>
          <button onClick={onClose} className="text-muted hover:text-white text-sm transition-colors">✕</button>
        </div>
        <div className="p-4 space-y-2 max-h-80 overflow-y-auto">
          {allItems.map(item => (
            <button key={item.key} onClick={() => !item.disabled && toggle(item.key)} disabled={item.disabled}
              className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                item.disabled ? 'opacity-40 cursor-not-allowed bg-base-800 border-border' :
                selected.has(item.key) ? 'bg-accent/10 border-accent/40' : 'bg-base-800 border-border hover:border-base-500'
              }`}>
              <div className={`w-4 h-4 rounded border flex items-center justify-center text-xs flex-shrink-0 ${
                selected.has(item.key) ? 'bg-accent border-accent text-white' : 'border-base-500'
              }`}>{selected.has(item.key) && '✓'}</div>
              <img src={`/${item.icon}.svg`} className="w-5 h-5 rounded flex-shrink-0" alt="" />
              <span className="text-white text-sm flex-1">{item.name}</span>
              <span className="text-muted text-xs">{item.count} pkg</span>
            </button>
          ))}
        </div>
        <div className="px-5 py-4 border-t border-border flex items-center justify-between">
          <span className="text-xs text-muted">{selected.size} target{selected.size !== 1 ? 's' : ''}, {totalSelected} update{totalSelected !== 1 ? 's' : ''}</span>
          <div className="flex gap-2">
            <button className="btn-ghost text-xs" onClick={onClose}>Cancel</button>
            <button className="btn-primary text-xs" onClick={start} disabled={selected.size === 0 || running}>
              {running ? 'Starting...' : '↑ Apply updates'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Multi-Terminal overlay ────────────────────────────────────────────────────

function MultiTerminal({ terminals, onCloseAll, onClose }) {
  const keys = Object.keys(terminals)
  if (keys.length === 0) return null
  const allDone = keys.every(k => terminals[k].done)

  return (
    <div className="fixed inset-0 z-50 flex flex-col p-4 sm:p-6 gap-4 overflow-y-auto"
      style={{ background: 'rgba(8,8,10,0.9)', backdropFilter: 'blur(8px)' }}>
      <div className="flex items-center justify-between flex-shrink-0">
        <span className="text-white font-semibold text-sm">{keys.length} update{keys.length !== 1 ? 's' : ''} running</span>
        {allDone && (
          <button onClick={onCloseAll} className="btn-ghost text-xs">Close all</button>
        )}
      </div>
      <div className={`grid gap-4 flex-1 ${keys.length > 1 ? 'sm:grid-cols-2' : ''}`}>
        {keys.map(key => {
          const term = terminals[key]
          return (
            <TerminalPanel key={key} term={term} onClose={() => onClose(key)} />
          )
        })}
      </div>
    </div>
  )
}

function TerminalPanel({ term, onClose }) {
  const bottomRef = useRef(null)
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [term.logs])

  return (
    <div className="card border-border flex flex-col" style={{ minHeight: '320px', maxHeight: '480px' }}>
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border flex-shrink-0">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-danger/70" />
          <div className="w-3 h-3 rounded-full bg-warning/70" />
          <div className="w-3 h-3 rounded-full bg-success/70" />
        </div>
        <div className="flex-1 text-center">
          <span className="font-mono text-xs text-muted">{term.target || 'Terminal'}</span>
        </div>
        <div className="flex items-center gap-2">
          {!term.done && <span className="pulse-dot w-2 h-2 rounded-full bg-accent block" />}
          {term.done && !term.success && <span className="text-xs font-medium text-danger">Error</span>}
          {term.done && term.success && <img src="/check.svg" className="w-5 h-5" alt="Done" />}
          {term.done && <button onClick={onClose} className="text-muted hover:text-white transition-colors text-sm px-2">✕</button>}
        </div>
      </div>
      <div className="terminal flex-1 overflow-y-auto p-4 text-xs">
        {term.logs.length === 0 && <span className="text-muted">Starting...</span>}
        {term.logs.map((entry, i) => (
          <span key={i} className={entry.type === 'stderr' ? 'stderr' : ''}>{entry.text}</span>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

// ─── Single Site View ──────────────────────────────────────────────────────────

function SiteView({ site, activeUpdates, onUpdate, onCheck, checking }) {
  const [showUpdateModal, setShowUpdateModal] = useState(false)
  const [selectedCards, setSelectedCards] = useState(new Set())

  // Auto-run first check when site has no data yet
  const autoCheckedRef = useRef(false)
  useEffect(() => {
    if (!site.lastCheck && !checking && !autoCheckedRef.current) {
      autoCheckedRef.current = true
      onCheck(site.id)
    }
  }, [site.id, site.lastCheck, checking])

  const nodeData = site.lastCheck?.node
  const lxcData = site.lastCheck?.lxc || []
  const vmData = site.lastCheck?.vms || []
  const totalUpdates = (nodeData?.updates || 0)
    + lxcData.reduce((a, l) => a + (l.packages?.length || 0) + (l.appUpdates?.length || 0), 0)
    + vmData.reduce((a, v) => a + (v.packages?.length || 0), 0)

  // All selectable (updatable) containers
  const updatableLXC = lxcData.filter(l => ((l.packages?.length || 0) + (l.appUpdates?.length || 0)) > 0 && l.running)
  const updatableVMs = vmData.filter(v => (v.packages?.length || 0) > 0 && v.running && !v.noAgent)
  const allUpdatableKeys = [
    ...updatableLXC.map(l => `lxc-${l.vmid}`),
    ...updatableVMs.map(v => `vm-${v.vmid}`),
  ]
  const allCardsSelected = allUpdatableKeys.length > 0 && allUpdatableKeys.every(k => selectedCards.has(k))

  function toggleCard(type, vmid) {
    const key = `${type}-${vmid}`
    setSelectedCards(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function selectAllCards() {
    setSelectedCards(new Set(allUpdatableKeys))
  }

  function clearSelection() {
    setSelectedCards(new Set())
  }

  async function updateSelected() {
    const targets = []
    for (const key of selectedCards) {
      if (key.startsWith('lxc-')) {
        const vmid = Number(key.slice(4))
        targets.push({ type: 'lxc', vmid })
      } else if (key.startsWith('vm-')) {
        const vmid = Number(key.slice(3))
        targets.push({ type: 'vm', vmid })
      }
    }
    clearSelection()
    await Promise.all(targets.map(t => onUpdate(site.id, t.type, t.vmid, null)))
  }

  return (
    <div>
      {showUpdateModal && (
        <UpdateSelectionModal
          nodeData={nodeData}
          lxcData={lxcData}
          vmData={vmData}
          onClose={() => setShowUpdateModal(false)}
          onUpdate={(target, vmid) => onUpdate(site.id, target, vmid)}
        />
      )}

      {!checking && site.lastCheck && (
        <div className={`card px-5 py-4 mb-8 flex items-center gap-4 fade-up ${totalUpdates > 0 ? 'border-accent/30' : ''}`}>
          <div className="w-8 h-8 flex-shrink-0"><img src={totalUpdates > 0 ? '/sync.svg' : '/check.svg'} className="w-8 h-8" alt="" /></div>
          <div className="flex-1">
            <div className="font-semibold text-white text-sm">
              {totalUpdates > 0 ? `${totalUpdates} update${totalUpdates !== 1 ? 's' : ''} available` : 'Everything is up to date'}
            </div>
            <div className="text-xs text-muted mt-0.5">Next check: {site.schedule?.times?.join(' and ')}</div>
          </div>
          {totalUpdates > 0 && (
            <button className="btn-primary text-xs" disabled={Object.keys(activeUpdates).length > 0}
              onClick={() => setShowUpdateModal(true)}>
              ↑ Update all ({totalUpdates})
            </button>
          )}
        </div>
      )}

      {checking && !site.lastCheck && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1,2,3].map(i => <div key={i} className="shimmer card h-40" />)}
        </div>
      )}

      {!checking && !site.lastCheck && (
        <div className="text-center py-20 fade-up">
          <div className="text-5xl mb-4">⬡</div>
          <div className="text-white font-semibold mb-2">Ready for first check</div>
          <p className="text-muted text-sm mb-6">Click "Check now" to scan for updates</p>
          <button className="btn-primary" onClick={() => onCheck(site.id)}><img src="/sync.svg" className="w-4 h-4 inline mr-1.5 align-middle" alt="" />Run check</button>
        </div>
      )}

      {site.lastCheck && (
        <div className="space-y-8">
          <section>
            <h2 className="text-xs font-semibold text-muted uppercase tracking-widest mb-3">Node</h2>
            <NodeCard node={nodeData}
              onUpdate={(pkgs) => onUpdate(site.id, 'node', null, pkgs)}
              updating={!!activeUpdates['node']} />
          </section>

          {lxcData.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-semibold text-muted uppercase tracking-widest">LXC Containers</h2>
                {updatableLXC.length > 1 && (
                  <div className="flex items-center gap-3">
                    {selectedCards.size > 0 && (
                      <>
                        <button className="text-xs text-muted hover:text-white transition-colors" onClick={clearSelection}>
                          Clear
                        </button>
                        <button className="btn-primary text-xs py-1 px-3"
                          disabled={Object.keys(activeUpdates).length > 0}
                          onClick={updateSelected}>
                          ↑ Update {selectedCards.size} selected
                        </button>
                      </>
                    )}
                    {selectedCards.size === 0 && (
                      <button className="text-xs text-accent/70 hover:text-accent transition-colors"
                        onClick={selectAllCards}>
                        Select all
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {lxcData.map((lxc, i) => (
                  <LXCCard key={lxc.vmid} lxc={lxc} delay={i + 1}
                    onUpdate={(vmid, pkgs) => onUpdate(site.id, 'lxc', vmid, pkgs)}
                    updating={!!activeUpdates[`lxc-${lxc.vmid}`]}
                    isCardSelected={selectedCards.has(`lxc-${lxc.vmid}`)}
                    onCardSelect={updatableLXC.length > 1 ? (vmid) => toggleCard('lxc', vmid) : null} />
                ))}
              </div>
            </section>
          )}

          {vmData.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-semibold text-muted uppercase tracking-widest">Linux VMs</h2>
                {updatableVMs.length > 1 && (
                  <div className="flex items-center gap-3">
                    {selectedCards.size > 0 && (
                      <>
                        <button className="text-xs text-muted hover:text-white transition-colors" onClick={clearSelection}>
                          Clear
                        </button>
                        <button className="btn-primary text-xs py-1 px-3"
                          disabled={Object.keys(activeUpdates).length > 0}
                          onClick={updateSelected}>
                          ↑ Update {selectedCards.size} selected
                        </button>
                      </>
                    )}
                    {selectedCards.size === 0 && (
                      <button className="text-xs text-accent/70 hover:text-accent transition-colors"
                        onClick={selectAllCards}>
                        Select all
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {vmData.map((vm, i) => (
                  <VMCard key={vm.vmid} vm={vm} delay={i + 1}
                    onUpdate={(vmid, pkgs) => onUpdate(site.id, 'vm', vmid, pkgs)}
                    updating={!!activeUpdates[`vm-${vm.vmid}`]}
                    isCardSelected={selectedCards.has(`vm-${vm.vmid}`)}
                    onCardSelect={updatableVMs.length > 1 ? (vmid) => toggleCard('vm', vmid) : null} />
                ))}
              </div>
            </section>
          )}

          {site.lastCheck.error && (
            <div className="card p-4 border-danger/20 bg-danger/5 text-danger text-sm flex items-center gap-2"><img src="/cross.svg" className="w-5 h-5 flex-shrink-0" alt="" />{site.lastCheck.error}</div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Global View (all sites) ───────────────────────────────────────────────────

function GlobalView({ sites, activeUpdates, onUpdate, onCheck }) {
  const totalUpdates = sites.reduce((sum, site) => {
    const lc = site.lastCheck
    if (!lc) return sum
    return sum + (lc.node?.updates || 0)
      + (lc.lxc || []).reduce((a, l) => a + (l.packages?.length || 0) + (l.appUpdates?.length || 0), 0)
      + (lc.vms || []).reduce((a, v) => a + (v.packages?.length || 0), 0)
  }, 0)

  const sitesWithData = sites.filter(s => s.lastCheck)

  return (
    <div className="space-y-12">
      {sitesWithData.length > 0 && (
        <div className={`card px-5 py-4 flex items-center gap-4 fade-up ${totalUpdates > 0 ? 'border-accent/30' : ''}`}>
          <div className="w-8 h-8 flex-shrink-0"><img src={totalUpdates > 0 ? '/sync.svg' : '/check.svg'} className="w-8 h-8" alt="" /></div>
          <div className="flex-1">
            <div className="font-semibold text-white text-sm">
              {totalUpdates > 0 ? `${totalUpdates} total update${totalUpdates !== 1 ? 's' : ''} across ${sitesWithData.length} site${sitesWithData.length !== 1 ? 's' : ''}` : 'All sites up to date'}
            </div>
            <div className="text-xs text-muted mt-0.5">{sitesWithData.length} of {sites.length} site{sites.length !== 1 ? 's' : ''} checked</div>
          </div>
        </div>
      )}

      {sites.map(site => {
        const lc = site.lastCheck
        const siteUpdates = lc
          ? (lc.node?.updates || 0)
            + (lc.lxc || []).reduce((a, l) => a + (l.packages?.length || 0) + (l.appUpdates?.length || 0), 0)
            + (lc.vms || []).reduce((a, v) => a + (v.packages?.length || 0), 0)
          : 0

        return (
          <div key={site.id}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-success block" />
                <h2 className="text-sm font-semibold text-white">{site.name}</h2>
                {siteUpdates > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-accent/20 text-accent border border-accent/30">
                    {siteUpdates} update{siteUpdates !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <button className="text-xs text-muted hover:text-white transition-colors"
                onClick={() => onCheck(site.id)}><img src="/sync.svg" className="w-3.5 h-3.5 inline mr-1 align-middle" alt="" />Check</button>
            </div>

            {!lc && (
              <div className="card p-4 text-center text-muted text-sm">
                No data yet — <button className="text-accent underline" onClick={() => onCheck(site.id)}>run check</button>
              </div>
            )}

            {lc && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-xs font-medium text-muted uppercase tracking-widest mb-2">Node</h3>
                  <NodeCard node={lc.node}
                    onUpdate={(pkgs) => onUpdate(site.id, 'node', null, pkgs)}
                    updating={!!activeUpdates[`${site.id}:node`]} />
                </div>
                {(lc.lxc || []).length > 0 && (
                  <div>
                    <h3 className="text-xs font-medium text-muted uppercase tracking-widest mb-2">LXC</h3>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {lc.lxc.map((lxc, i) => (
                        <LXCCard key={lxc.vmid} lxc={lxc} delay={i}
                          onUpdate={(vmid, pkgs) => onUpdate(site.id, 'lxc', vmid, pkgs)}
                          updating={!!activeUpdates[`${site.id}:lxc-${lxc.vmid}`]} />
                      ))}
                    </div>
                  </div>
                )}
                {(lc.vms || []).length > 0 && (
                  <div>
                    <h3 className="text-xs font-medium text-muted uppercase tracking-widest mb-2">VMs</h3>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {lc.vms.map((vm, i) => (
                        <VMCard key={vm.vmid} vm={vm} delay={i}
                          onUpdate={(vmid, pkgs) => onUpdate(site.id, 'vm', vmid, pkgs)}
                          updating={!!activeUpdates[`${site.id}:vm-${vm.vmid}`]} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Main Dashboard ────────────────────────────────────────────────────────────

export default function Dashboard({ sites, activeSiteId, onSiteChange, onSettings, onAddSite }) {
  const [appVersion, setAppVersion] = useState(null)
  const [lastChecks, setLastChecks] = useState({}) // siteId → lastCheck data
  const [checking, setChecking] = useState({})     // siteId → bool
  const [terminals, setTerminals] = useState({})   // updateKey → terminal data
  const [activeUpdates, setActiveUpdates] = useState({}) // key → bool

  useEffect(() => {
    fetch('/api/version').then(r => r.json()).then(d => setAppVersion(d.version)).catch(() => {})
  }, [])

  // Seed lastChecks from initial sites data
  useEffect(() => {
    const initial = {}
    sites.forEach(s => { if (s.lastCheck) initial[s.id] = s.lastCheck })
    setLastChecks(prev => ({ ...initial, ...prev }))
  }, [sites])

  // Compute the active site with merged lastCheck
  const activeSite = activeSiteId === 'all'
    ? null
    : (sites.find(s => s.id === activeSiteId) || sites[0])

  const activeSiteWithCheck = activeSite
    ? { ...activeSite, lastCheck: lastChecks[activeSite.id] ?? activeSite.lastCheck }
    : null

  const sitesWithChecks = sites.map(s => ({ ...s, lastCheck: lastChecks[s.id] ?? s.lastCheck }))

  useWebSocket(useCallback((msg) => {
    const sId = msg.siteId

    if (msg.type === 'check_start') {
      setChecking(prev => ({ ...prev, [sId]: true }))
    }
    if (msg.type === 'check_complete') {
      setChecking(prev => ({ ...prev, [sId]: false }))
      setLastChecks(prev => ({ ...prev, [sId]: msg.data }))
    }
    if (msg.type === 'update_start') {
      const key = msg.key || (msg.target === 'node' ? 'node' : `${msg.target}-${msg.vmid}`)
      const scopedKey = `${sId}:${key}`
      setActiveUpdates(prev => ({ ...prev, [scopedKey]: true, [key]: true }))
      setTerminals(prev => ({ ...prev, [scopedKey]: { logs: [], target: msg.targetLabel, done: false, success: false } }))
    }
    if (msg.type === 'log') {
      const key = msg.key || ''
      const scopedKey = `${sId}:${key}`
      setTerminals(prev => {
        if (!prev[scopedKey]) return prev
        return { ...prev, [scopedKey]: { ...prev[scopedKey], logs: [...prev[scopedKey].logs, { text: msg.data, type: 'stdout' }] } }
      })
    }
    if (msg.type === 'update_done') {
      const key = msg.key || (msg.target === 'node' ? 'node' : `${msg.target}-${msg.vmid}`)
      const scopedKey = `${sId}:${key}`
      setActiveUpdates(prev => { const n = { ...prev }; delete n[scopedKey]; delete n[key]; return n })
      setTerminals(prev => prev[scopedKey]
        ? { ...prev, [scopedKey]: { ...prev[scopedKey], done: true, success: msg.success } }
        : prev
      )
    }
    if (msg.type === 'status_update') {
      setLastChecks(prev => ({ ...prev, [sId]: msg.lastCheck }))
    }
    if (msg.type === 'auto_update_start') {
      const scopedKey = `${sId}:auto-${msg.groupName}`
      setTerminals(prev => ({ ...prev, [scopedKey]: { logs: [{ text: `Auto-update group "${msg.groupName}" started\n`, type: 'stdout' }], target: msg.groupName, done: false, success: false } }))
    }
    if (msg.type === 'auto_update_done') {
      const scopedKey = `${sId}:auto-${msg.groupName}`
      setTerminals(prev => prev[scopedKey] ? { ...prev, [scopedKey]: { ...prev[scopedKey], done: true, success: true } } : prev)
    }
  }, []))

  async function runCheck(siteId) {
    setChecking(prev => ({ ...prev, [siteId]: true }))
    await fetch(`/api/sites/${siteId}/check`, { method: 'POST' })
  }

  async function runUpdate(siteId, target, vmid, packages) {
    await fetch(`/api/sites/${siteId}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target, vmid, packages: packages || null })
    })
  }

function closeTerminal(key) {
    setTerminals(prev => { const n = { ...prev }; delete n[key]; return n })
  }

  const isGlobal = activeSiteId === 'all'
  const activeCheckId = activeSite?.id
  const isChecking = checking[activeCheckId] || false

  // Latest check for display in header
  const latestCheck = activeSiteWithCheck?.lastCheck

  const terminalCount = Object.keys(terminals).length

  return (
    <div className="min-h-full flex flex-col">
      {terminalCount > 0 && (
        <MultiTerminal
          terminals={terminals}
          onClose={closeTerminal}
          onCloseAll={() => setTerminals({})}
        />
      )}

      <header className="border-b border-border bg-base-900/80 backdrop-blur-md sticky top-0" style={{ zIndex: 10 }}>
        <div className="max-w-5xl mx-auto px-5 h-14 flex items-center gap-4" style={{ overflow: 'visible' }}>
          <img src="/hive.svg" className="w-7 h-7 flex-shrink-0" alt="Proxmox Hive" />
          <SiteDropdown sites={sites} activeSiteId={activeSiteId} onSiteChange={onSiteChange} onAddSite={onAddSite} />
          <div className="flex-1" />
          {!isGlobal && latestCheck && (
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-success block" />
              {formatRelative(latestCheck.timestamp)}
            </div>
          )}
          {!isGlobal && (
            <button className={`btn-ghost text-xs ${isChecking ? 'opacity-60 pointer-events-none' : ''}`}
              onClick={() => activeSite && runCheck(activeSite.id)} disabled={isChecking || !activeSite}>
              {isChecking ? <><span className="pulse-dot w-2 h-2 rounded-full bg-accent inline-block mr-1.5" />Checking...</> : <><img src="/sync.svg" className="w-3.5 h-3.5 inline mr-1.5 align-middle" alt="" />Check now</>}
            </button>
          )}
          <button className="btn-ghost text-xs" onClick={onSettings}>⚙ Settings</button>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-5 py-8">
        {isGlobal ? (
          <GlobalView
            sites={sitesWithChecks}
            activeUpdates={activeUpdates}
            onUpdate={runUpdate}
            onCheck={runCheck}
          />
        ) : activeSiteWithCheck ? (
          <SiteView
            site={activeSiteWithCheck}
            activeUpdates={activeUpdates}
            onUpdate={runUpdate}
            onCheck={runCheck}
            checking={isChecking}
          />
        ) : null}
      </main>

      <footer className="border-t border-border px-5 py-3 text-center">
        <span className="text-xs text-muted">
          {(() => {
            const isRelease = appVersion && /^\d+\.\d+\.\d+$/.test(appVersion)
            const href = isRelease
              ? `https://github.com/macokay/proxmox-hive/releases/tag/v${appVersion}`
              : 'https://github.com/macokay/proxmox-hive'
            const label = appVersion ? `Proxmox Hive v${appVersion}` : 'Proxmox Hive'
            return <a href={href} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">{label}</a>
          })()} · <a href="https://github.com/macokay/proxmox-hive" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">GitHub</a>
        </span>
      </footer>
    </div>
  )
}
