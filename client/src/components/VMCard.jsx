import { useState } from 'react'

export default function VMCard({ vm, onUpdate, updating, delay = 0, isCardSelected, onCardSelect }) {
  const totalUpdates = vm?.packages?.length || 0
  const hasUpdates = totalUpdates > 0

  const [selectedPkgs, setSelectedPkgs] = useState(null)

  const allPkgNames = (vm.packages || []).map(p => p.name)
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
    onUpdate(vm.vmid, pkgList)
  }

  const statusBadge = () => {
    if (vm.pending) return <span className="text-xs px-2.5 py-1 rounded-full bg-base-700 text-muted border border-border italic">Pending check</span>
    if (!vm.running) return <span className="text-xs px-2.5 py-1 rounded-full bg-base-700 text-muted border border-border">Offline</span>
    if (vm.noAgent) return <span className="text-xs px-2.5 py-1 rounded-full bg-warning/10 text-warning border border-warning/20">No agent</span>
    if (hasUpdates) return (
      <div className="flex flex-col items-end gap-1">
        <span className="text-2xl font-semibold text-white tabular-nums">{totalUpdates}</span>
        <span className="text-xs text-muted">update{totalUpdates !== 1 ? 's' : ''}</span>
      </div>
    )
    return <span className="text-xs px-2.5 py-1 rounded-full bg-success/10 text-success border border-success/20">Up to date</span>
  }

  return (
    <div className={`card p-5 transition-all duration-300 fade-up fade-up-delay-${Math.min(delay, 3)} ${hasUpdates ? 'glow-accent' : ''} ${!vm.running ? 'opacity-60' : ''} ${isCardSelected ? 'ring-2 ring-accent/50' : ''}`}>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          {hasUpdates && vm.running && !vm.noAgent && onCardSelect && (
            <button onClick={e => { e.stopPropagation(); onCardSelect(vm.vmid) }}
              className={`w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center text-[10px] transition-all ${
                isCardSelected ? 'bg-accent border-accent text-white' : 'border-base-500 hover:border-accent/60'
              }`} title="Select for batch update">
              {isCardSelected && '✓'}
            </button>
          )}
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden border ${hasUpdates ? 'bg-accent/10 border-accent/30' : 'bg-base-700 border-border'}`}>
            <img src="/vm.svg" className="w-8 h-8" alt="VM" />
          </div>
          <div>
            <div className="font-semibold text-white text-sm">{vm.name}</div>
            <div className="text-xs text-muted flex items-center gap-1.5">
              <span>VM {vm.vmid}</span>
              <span className="w-1 h-1 rounded-full bg-base-500" />
              <span className={vm.running ? 'text-success' : 'text-muted'}>{vm.running ? 'running' : 'stopped'}</span>
            </div>
          </div>
        </div>
        <div className="text-right flex-shrink-0">{statusBadge()}</div>
      </div>

      {vm.error && (
        <div className="mb-3 text-xs text-danger/80 bg-danger/5 border border-danger/10 rounded-md px-3 py-2">{vm.error}</div>
      )}

      {vm.noAgent && (
        <div className="mb-3 text-xs text-warning/70 bg-warning/5 border border-warning/10 rounded-md px-3 py-2">
          QEMU guest agent not running. Install <span className="font-mono">qemu-guest-agent</span> inside the VM and enable it in Proxmox VM Options.
        </div>
      )}

      {hasUpdates && (
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
          {vm.packages?.map((pkg, i) => (
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

      {hasUpdates && vm.running && !vm.noAgent && (
        <button className="btn-primary w-full justify-center" onClick={handleUpdate}
          disabled={updating || selectionCount === 0}>
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
