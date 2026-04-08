import { useState } from 'react'

const APP_BADGES = {
  arr:         { label: 'arr',        color: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  plex:        { label: 'plex',       color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
  jellyfin:    { label: 'jellyfin',   color: 'bg-purple-400/10 text-purple-300 border-purple-400/20' },
  qbittorrent: { label: 'qbit',       color: 'bg-blue-400/10 text-blue-300 border-blue-400/20' },
  overseerr:   { label: 'overseerr',  color: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
}

function AppBadge({ appType }) {
  const badge = APP_BADGES[appType] || { label: 'app', color: 'bg-base-600 text-muted border-border' }
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border flex-shrink-0 ${badge.color}`}>
      {badge.label}
    </span>
  )
}

export default function LXCCard({ lxc, onUpdate, updating, delay = 0, isCardSelected, onCardSelect }) {
  const aptCount = lxc?.packages?.length || 0
  const appCount = lxc?.appUpdates?.length || 0
  const totalUpdates = aptCount + appCount
  const hasUpdates = totalUpdates > 0

  const [selectedPkgs, setSelectedPkgs] = useState(null)
  const [confirmFullUpgrade, setConfirmFullUpgrade] = useState(false)

  const allPkgNames = [
    ...(lxc.appUpdates || []).map(p => p.name),
    ...(lxc.packages || []).map(p => p.name)
  ]
  const effectiveSelected = selectedPkgs ?? new Set(allPkgNames)
  const selectionCount = effectiveSelected.size

  // Kept-back packages that are in the current selection
  const selectedKeptBack = (lxc.packages || []).filter(p => p.keptBack && effectiveSelected.has(p.name))

  function togglePkg(name) {
    const base = selectedPkgs ?? new Set(allPkgNames)
    const next = new Set(base)
    next.has(name) ? next.delete(name) : next.add(name)
    setSelectedPkgs(next.size === allPkgNames.length ? null : next)
    setConfirmFullUpgrade(false)
  }

  function handleUpdateClick() {
    if (selectedKeptBack.length > 0 && !confirmFullUpgrade) {
      setConfirmFullUpgrade(true)
      return
    }
    const pkgList = selectedPkgs ? [...selectedPkgs] : null
    onUpdate(lxc.vmid, pkgList)
    setConfirmFullUpgrade(false)
  }

  return (
    <div className={`card p-5 transition-all duration-300 fade-up fade-up-delay-${Math.min(delay, 3)} ${hasUpdates ? 'glow-accent' : ''} ${!lxc.running ? 'opacity-60' : ''} ${isCardSelected ? 'ring-2 ring-accent/50' : ''}`}>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          {hasUpdates && lxc.running && onCardSelect && (
            <button onClick={e => { e.stopPropagation(); onCardSelect(lxc.vmid) }}
              className={`w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center text-[10px] transition-all ${
                isCardSelected ? 'bg-accent border-accent text-white' : 'border-base-500 hover:border-accent/60'
              }`} title="Select for batch update">
              {isCardSelected && '✓'}
            </button>
          )}
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden border ${hasUpdates ? 'bg-accent/10 border-accent/30' : 'bg-base-700 border-border'}`}>
            <img src="/lxc.svg" className="w-8 h-8" alt="LXC" />
          </div>
          <div>
            <div className="font-semibold text-white text-sm">{lxc.name}</div>
            <div className="text-xs text-muted flex items-center gap-1.5">
              <span>CT {lxc.vmid}</span>
              <span className="w-1 h-1 rounded-full bg-base-500" />
              <span className={lxc.running ? 'text-success' : 'text-muted'}>{lxc.running ? 'running' : 'stopped'}</span>
              {lxc.pm && lxc.pm !== 'apt' && lxc.pm !== 'unknown' && (
                <>
                  <span className="w-1 h-1 rounded-full bg-base-500" />
                  <span className="uppercase tracking-wide">{lxc.pm}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          {lxc.pending ? (
            <span className="text-xs px-2.5 py-1 rounded-full bg-base-700 text-muted border border-border italic">Pending check</span>
          ) : !lxc.running ? (
            <span className="text-xs px-2.5 py-1 rounded-full bg-base-700 text-muted border border-border">Offline</span>
          ) : lxc.pm === 'unknown' ? (
            <span className="text-xs px-2.5 py-1 rounded-full bg-base-700 text-muted border border-border">Unsupported OS</span>
          ) : hasUpdates ? (
            <div className="flex flex-col items-end gap-1">
              <span className="text-2xl font-semibold text-white tabular-nums">{totalUpdates}</span>
              <span className="text-xs text-muted">update{totalUpdates !== 1 ? 's' : ''}</span>
            </div>
          ) : (
            <span className="text-xs px-2.5 py-1 rounded-full bg-success/10 text-success border border-success/20">Up to date</span>
          )}
        </div>
      </div>

      {lxc.error && (
        <div className="mb-3 text-xs text-danger/80 bg-danger/5 border border-danger/10 rounded-md px-3 py-2">{lxc.error}</div>
      )}

      {hasUpdates && (
        <div className="mb-4 space-y-1">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-muted uppercase tracking-wider">
              {selectionCount === allPkgNames.length ? 'All selected' : `${selectionCount} of ${allPkgNames.length} selected`}
            </span>
            <div className="flex gap-2">
              <button className="text-[10px] text-accent/70 hover:text-accent transition-colors"
                onClick={() => { setSelectedPkgs(null); setConfirmFullUpgrade(false) }}>All</button>
              <span className="text-[10px] text-border">·</span>
              <button className="text-[10px] text-accent/70 hover:text-accent transition-colors"
                onClick={() => { setSelectedPkgs(new Set()); setConfirmFullUpgrade(false) }}>None</button>
            </div>
          </div>

          {lxc.appUpdates?.map((pkg, i) => (
            <button key={`app-${i}`} onClick={() => togglePkg(pkg.name)}
              className={`w-full flex items-center gap-2 text-xs py-1.5 px-2.5 rounded-md border text-left transition-all ${
                effectiveSelected.has(pkg.name) ? 'bg-base-800 border-border' : 'bg-base-900 border-border/40 opacity-50'
              }`}>
              <div className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center text-[9px] transition-all ${
                effectiveSelected.has(pkg.name) ? 'bg-accent border-accent text-white' : 'border-base-500'
              }`}>{effectiveSelected.has(pkg.name) && '✓'}</div>
              <span className="font-mono text-white/80 flex-1 text-left min-w-0" style={{wordBreak:'break-all'}} title={pkg.name}>{pkg.name}</span>
              <AppBadge appType={pkg.appType} />
              <span className="text-muted flex-shrink-0 max-w-[80px] truncate" title={pkg.newVersion}>{pkg.newVersion}</span>
            </button>
          ))}

          {lxc.packages?.map((pkg, i) => (
            <button key={`apt-${i}`} onClick={() => togglePkg(pkg.name)}
              className={`w-full flex items-center gap-2 text-xs py-1.5 px-2.5 rounded-md border text-left transition-all ${
                effectiveSelected.has(pkg.name) ? 'bg-base-800 border-border' : 'bg-base-900 border-border/40 opacity-50'
              }`}>
              <div className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center text-[9px] transition-all ${
                effectiveSelected.has(pkg.name) ? 'bg-accent border-accent text-white' : 'border-base-500'
              }`}>{effectiveSelected.has(pkg.name) && '✓'}</div>
              <span className="font-mono text-white/80 flex-1 text-left min-w-0 truncate" title={pkg.name}>{pkg.name}</span>
              {pkg.keptBack && (
                <span className="text-[9px] px-1 py-0.5 rounded border bg-warning/10 text-warning border-warning/20 flex-shrink-0">held back</span>
              )}
              <span className="text-muted flex-shrink-0 max-w-[100px] truncate" title={pkg.newVersion}>{pkg.newVersion}</span>
            </button>
          ))}
        </div>
      )}

      {hasUpdates && lxc.running && confirmFullUpgrade && (
        <div className="mb-3 rounded-md border border-warning/30 bg-warning/5 px-3 py-2.5">
          <p className="text-xs text-warning/90 mb-2">
            {selectedKeptBack.length} package{selectedKeptBack.length !== 1 ? 's' : ''} require <span className="font-mono">full-upgrade</span> — may install new packages or remove existing ones. Continue?
          </p>
          <div className="flex gap-2">
            <button className="text-[10px] px-2.5 py-1 rounded border border-warning/40 text-warning hover:bg-warning/10 transition-colors"
              onClick={handleUpdateClick}>
              Yes, run full-upgrade
            </button>
            <button className="text-[10px] px-2.5 py-1 rounded border border-border text-muted hover:text-white transition-colors"
              onClick={() => setConfirmFullUpgrade(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {hasUpdates && lxc.running && (
        <button className="btn-primary w-full justify-center" onClick={handleUpdateClick}
          disabled={updating || selectionCount === 0 || confirmFullUpgrade}>
          {updating
            ? <><span className="pulse-dot w-2 h-2 rounded-full bg-white inline-block mr-1.5" />Updating...</>
            : selectionCount === allPkgNames.length
              ? '↑ Update all'
              : `↑ Update ${selectionCount} package${selectionCount !== 1 ? 's' : ''}`
          }
        </button>
      )}
    </div>
  )
}
