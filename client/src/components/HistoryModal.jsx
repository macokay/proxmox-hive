import { useState, useEffect, useCallback } from 'react'
import { useWebSocket } from '../hooks/useWebSocket.js'

const RANGES = [7, 14, 30]

const STATUS = {
  success: { label: 'Installed', cls: 'bg-success/10 text-success border-success/20' },
  failed: { label: 'Failed', cls: 'bg-danger/10 text-danger border-danger/20' },
  interrupted: { label: 'Interrupted', cls: 'bg-warning/10 text-warning border-warning/20' },
  running: { label: 'Running', cls: 'bg-accent/10 text-accent border-accent/20' },
}

function dayLabel(ts) {
  return new Date(ts).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

function timeLabel(ts) {
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function groupByDay(entries) {
  const groups = []
  for (const e of entries) {
    const day = dayLabel(e.startedAt)
    const last = groups[groups.length - 1]
    if (last?.day === day) last.entries.push(e)
    else groups.push({ day, entries: [e] })
  }
  return groups
}

function PackageLine({ pkg }) {
  let change
  if (pkg.action === 'remove') change = <span className="text-muted">removed {pkg.from}</span>
  else if (pkg.action === 'install') change = <span className="text-muted">new {pkg.to}</span>
  else change = <span className="text-muted">{pkg.from || '?'} <span className="text-accent">→</span> {pkg.to || '?'}</span>
  return (
    <div className="flex items-baseline justify-between gap-3 font-mono text-[11px] py-0.5">
      <span className="text-white/80 truncate">{pkg.name}</span>
      <span className="flex-shrink-0 text-right">{change}</span>
    </div>
  )
}

function EntryRow({ entry, showSite }) {
  const [open, setOpen] = useState(false)
  const status = STATUS[entry.status] || STATUS.running
  const count = entry.packages?.length || 0
  return (
    <div className="border-b border-border last:border-b-0">
      <button onClick={() => count && setOpen(o => !o)}
        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left ${count ? 'hover:bg-base-800' : 'cursor-default'} transition-colors`}>
        <span className="font-mono text-xs text-muted w-11 flex-shrink-0">{timeLabel(entry.startedAt)}</span>
        <span className="flex-1 min-w-0 text-sm text-white truncate">
          {entry.label}
          {showSite && entry.siteName && <span className="text-muted text-xs ml-2">{entry.siteName}</span>}
        </span>
        {entry.trigger === 'auto' && (
          <span className="hidden sm:inline text-[10px] px-1.5 py-0.5 rounded border border-border text-muted flex-shrink-0">auto: {entry.group}</span>
        )}
        <span className="text-xs text-muted flex-shrink-0 w-20 text-right">{count} package{count === 1 ? '' : 's'}</span>
        <span className={`text-[10px] px-2 py-0.5 rounded-full border flex-shrink-0 ${status.cls}`}>{status.label}</span>
      </button>
      {open && (
        <div className="px-4 pb-3 pl-[4.25rem]">
          {entry.packages.map((p, i) => <PackageLine key={`${p.name}-${i}`} pkg={p} />)}
        </div>
      )}
    </div>
  )
}

export default function HistoryModal({ siteId, onClose }) {
  const [days, setDays] = useState(7)
  const [entries, setEntries] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(() => {
    const params = new URLSearchParams({ days: String(days) })
    if (siteId) params.set('siteId', siteId)
    fetch(`/api/history?${params}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(d => { setEntries(d.entries || []); setError(null) })
      .catch(e => setError(e.message))
  }, [days, siteId])

  useEffect(() => { load() }, [load])

  useWebSocket(useCallback((msg) => {
    if (msg.type === 'history_updated') load()
  }, [load]))

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 flex items-start sm:items-center justify-center p-4" style={{ zIndex: 200, background: 'rgba(8,8,10,0.85)', backdropFilter: 'blur(6px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="slide-up w-full max-w-2xl card border-border flex flex-col" style={{ maxHeight: 'calc(100vh - 2rem)' }}>
        <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-white">Update history</h2>
          <div className="flex items-center gap-3">
            <div className="flex rounded-lg border border-border overflow-hidden">
              {RANGES.map(r => (
                <button key={r} onClick={() => setDays(r)}
                  className={`text-xs px-3 py-1 transition-colors ${days === r ? 'bg-accent/15 text-accent' : 'text-muted hover:text-white'}`}>
                  {r} days
                </button>
              ))}
            </div>
            <button onClick={onClose} className="text-muted hover:text-white text-sm transition-colors" aria-label="Close">✕</button>
          </div>
        </div>
        <div className="overflow-y-auto">
          {error && <p className="px-4 py-6 text-xs text-danger/80">Could not load history: {error}</p>}
          {!error && entries?.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-muted">No updates in the last {days} days</p>
          )}
          {!error && entries && groupByDay(entries).map(g => (
            <div key={g.day}>
              <div className="px-4 py-1.5 text-[11px] uppercase tracking-wide text-muted bg-base-800/60 border-b border-border sticky top-0">{g.day}</div>
              {g.entries.map(e => <EntryRow key={e.id} entry={e} showSite={!siteId} />)}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
