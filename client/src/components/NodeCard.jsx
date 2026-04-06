import { useState } from 'react'

export default function NodeCard({ node, onUpdate, updating }) {
  const hasUpdates = node?.updates > 0
  const allPkgNames = (node?.packages || []).map(p => p.name)
  const [selectedPkgs, setSelectedPkgs] = useState(null)

  const effectiveSelected = selectedPkgs ?? new Set(allPkgNames)
  const selectionCount = effectiveSelected.size

  function togglePkg(name) {
    const base = selectedPkgs ?? new Set(allPkgNames)
    const next = new Set(base)
    next.has(name) ? next.delete(name) : next.add(name)
    setSelectedPkgs(next.size === allPkgNames.length ? null : next)
  }

  function handleUpdate() {
    const pkgList = selectedPkgs ? [...selectedPkgs] : null
    onUpdate(pkgList)
  }

  return (
    <div className={`card p-5 transition-all duration-300 fade-up ${hasUpdates ? 'glow-accent' : ''}`}>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden border ${hasUpdates ? 'bg-accent/10 border-accent/30' : 'bg-base-700 border-border'}`}>
            <img src="/proxmox.svg" className="w-8 h-8" alt="Proxmox" />
          </div>
          <div>
            <div className="font-semibold text-white text-sm">Proxmox Node</div>
            <div className="text-xs text-muted">Host OS packages</div>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          {hasUpdates ? (
            <div className="flex flex-col items-end gap-1">
              <span className="text-2xl font-semibold text-white tabular-nums">{node.updates}</span>
              <span className="text-xs text-muted">update{node.updates !== 1 ? 's' : ''}</span>
            </div>
          ) : (
            <span className="text-xs px-2.5 py-1 rounded-full bg-success/10 text-success border border-success/20">Up to date</span>
          )}
        </div>
      </div>

      {hasUpdates && node.packages?.length > 0 && (
        <div className="mb-4 space-y-1">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-muted uppercase tracking-wider">
              {selectionCount === allPkgNames.length ? 'All selected' : `${selectionCount} of ${allPkgNames.length} selected`}
            </span>
            <div className="flex gap-2">
              <button className="text-[10px] text-accent/70 hover:text-accent transition-colors"
                onClick={() => setSelectedPkgs(null)}>All</button>
              <span className="text-[10px] text-border">·</span>
              <button className="text-[10px] text-accent/70 hover:text-accent transition-colors"
                onClick={() => setSelectedPkgs(new Set())}>None</button>
            </div>
          </div>
          {node.packages.map((pkg, i) => (
            <button key={i} onClick={() => togglePkg(pkg.name)}
              className={`w-full flex items-center gap-2 text-xs py-1.5 px-2.5 rounded-md border text-left transition-all ${
                effectiveSelected.has(pkg.name) ? 'bg-base-800 border-border' : 'bg-base-900 border-border/40 opacity-50'
              }`}>
              <div className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center text-[9px] transition-all ${
                effectiveSelected.has(pkg.name) ? 'bg-accent border-accent text-white' : 'border-base-500'
              }`}>{effectiveSelected.has(pkg.name) && '✓'}</div>
              <span className="font-mono text-white/80 flex-1 text-left min-w-0 truncate" title={pkg.name}>{pkg.name}</span>
              <span className="text-muted flex-shrink-0 max-w-[100px] truncate" title={pkg.newVersion}>{pkg.newVersion}</span>
            </button>
          ))}
        </div>
      )}

      {hasUpdates && (
        <button className="btn-primary w-full justify-center" onClick={handleUpdate}
          disabled={updating || selectionCount === 0}>
          {updating
            ? <><span className="pulse-dot w-2 h-2 rounded-full bg-white inline-block mr-1.5" />Updating...</>
            : selectionCount === allPkgNames.length
              ? '↑ Update node'
              : `↑ Update ${selectionCount} package${selectionCount !== 1 ? 's' : ''}`
          }
        </button>
      )}
    </div>
  )
}
