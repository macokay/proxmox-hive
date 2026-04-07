import { useState, useEffect } from 'react'
import Setup from './Setup.jsx'
import { SSHHowButton } from '../components/SSHHowModal.jsx'

export const CHANNEL_TYPES = [
  { value: 'discord', label: 'Discord',         placeholder: 'https://discord.com/api/webhooks/...' },
  { value: 'slack',   label: 'Slack',           placeholder: 'https://hooks.slack.com/services/...' },
  { value: 'teams',   label: 'Microsoft Teams', placeholder: 'https://org.webhook.office.com/...' },
  { value: 'webhook', label: 'Generic Webhook', placeholder: 'https://your-server.com/webhook' },
]

export const ALERT_TYPES = [
  { key: 'onUpdatesFound',    label: 'Updates found',       description: 'When new updates are detected' },
  { key: 'onUpdateSuccess',   label: 'Update succeeded',    description: 'When an update completes successfully' },
  { key: 'onUpdateFailed',    label: 'Update failed',       description: 'When an update errors out' },
  { key: 'onCheckFailed',     label: 'Check failed',        description: 'When the update check itself errors' },
  { key: 'onNoUpdates',       label: 'All up to date',      description: 'When check finds nothing to update' },
]

function Section({ title, description, children, danger }) {
  return (
    <div className={`card p-6 space-y-5 ${danger ? 'border-danger/30' : ''}`}>
      <div className="border-b border-border pb-4">
        <h2 className={`text-sm font-semibold ${danger ? 'text-danger' : 'text-white'}`}>{title}</h2>
        {description && <p className="text-xs text-muted mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  )
}

function Toggle({ value, onChange, label, description }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-sm text-white">{label}</div>
        {description && <div className="text-xs text-muted mt-0.5">{description}</div>}
      </div>
      <button onClick={() => onChange(!value)}
        className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${value ? 'bg-accent' : 'bg-base-600'}`}>
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-5' : ''}`} />
      </button>
    </div>
  )
}

export function NotificationChannels({ channels, onChange }) {
  const [testing, setTesting] = useState({})
  const [testResults, setTestResults] = useState({})

  function add() {
    const defaults = Object.fromEntries(ALERT_TYPES.map(a => [a.key, a.key !== 'onNoUpdates']))
    onChange([...channels, { id: `ch-${Date.now()}`, type: 'discord', name: 'Discord', url: '', enabled: true, alerts: defaults }])
  }
  function update(id, patch) { onChange(channels.map(c => c.id === id ? { ...c, ...patch } : c)) }
  function remove(id) { onChange(channels.filter(c => c.id !== id)) }

  async function test(channel) {
    setTesting(t => ({ ...t, [channel.id]: true }))
    try {
      const r = await fetch('/api/test-notification', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(channel)
      })
      const result = await r.json()
      setTestResults(t => ({ ...t, [channel.id]: result }))
    } catch { setTestResults(t => ({ ...t, [channel.id]: { ok: false, error: 'Error' } })) }
    setTesting(t => ({ ...t, [channel.id]: false }))
  }

  return (
    <div className="space-y-4">
      {channels.length === 0 && <p className="text-muted text-sm text-center py-3">No notification channels.</p>}
      {channels.map(ch => {
        const typeDef = CHANNEL_TYPES.find(t => t.value === ch.type) || CHANNEL_TYPES[0]
        const alerts = ch.alerts || {}
        return (
          <div key={ch.id} className="rounded-lg border border-border bg-base-800 overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
              <button onClick={() => update(ch.id, { enabled: !ch.enabled })}
                className={`relative w-8 h-4 rounded-full transition-colors flex-shrink-0 ${ch.enabled ? 'bg-accent' : 'bg-base-600'}`}>
                <span className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${ch.enabled ? 'translate-x-4' : ''}`} />
              </button>
              <input className="flex-1 bg-transparent text-white text-sm font-medium focus:outline-none"
                value={ch.name} onChange={e => update(ch.id, { name: e.target.value })} placeholder="Channel name" />
              <select value={ch.type} onChange={e => update(ch.id, { type: e.target.value })}
                className="bg-base-700 border border-border rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-accent/60">
                {CHANNEL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <button onClick={() => remove(ch.id)} className="text-muted hover:text-danger text-sm px-1 transition-colors">✕</button>
            </div>
            <div className="p-3 space-y-3">
              <div className="flex gap-2">
                <input className="input flex-1 text-xs" placeholder={typeDef.placeholder}
                  value={ch.url} onChange={e => update(ch.id, { url: e.target.value })} />
                <button className="btn-ghost text-xs flex-shrink-0" onClick={() => test(ch)} disabled={!ch.url || testing[ch.id]}>
                  {testing[ch.id] ? '...' : 'Test'}
                </button>
              </div>
              {testResults[ch.id] && (
                <p className={`text-xs ${testResults[ch.id].ok ? 'text-success' : 'text-danger'}`}>
                  <span className="flex items-center gap-1.5"><img src={testResults[ch.id].ok ? '/check.svg' : '/cross.svg'} className="w-4 h-4 flex-shrink-0" alt="" />{testResults[ch.id].ok ? 'Message sent' : testResults[ch.id].error}</span>
                </p>
              )}
              <div>
                <div className="text-[10px] text-muted uppercase tracking-wider mb-2">Alert types</div>
                <div className="grid grid-cols-1 gap-1.5">
                  {ALERT_TYPES.map(a => (
                    <label key={a.key} className="flex items-center gap-2.5 cursor-pointer group">
                      <div onClick={() => update(ch.id, { alerts: { ...alerts, [a.key]: !alerts[a.key] } })}
                        className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center text-[9px] transition-all cursor-pointer ${
                          alerts[a.key] ? 'bg-accent border-accent text-white' : 'border-base-500 group-hover:border-accent/50'
                        }`}>
                        {alerts[a.key] && '✓'}
                      </div>
                      <div>
                        <span className="text-xs text-white">{a.label}</span>
                        <span className="text-[10px] text-muted ml-1.5">{a.description}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )
      })}
      <button onClick={add} className="btn-ghost w-full justify-center text-xs border-dashed">+ Add channel</button>
    </div>
  )
}

function GroupEditor({ groups, lxcList, vmList, onChange }) {
  function add() {
    onChange([...groups, { id: `grp-${Date.now()}`, name: `Group ${groups.length + 1}`, targets: [], time: '03:00', enabled: true }])
  }
  function upd(id, patch) { onChange(groups.map(g => g.id === id ? { ...g, ...patch } : g)) }
  function remove(id) { onChange(groups.filter(g => g.id !== id)) }
  function toggleTarget(group, target) {
    const targets = group.targets.includes(target) ? group.targets.filter(t => t !== target) : [...group.targets, target]
    upd(group.id, { targets })
  }

  const allTargets = [
    { id: 'node', icon: 'proxmox', name: 'Node' },
    ...lxcList.map(l => ({ id: l.vmid, icon: 'lxc', name: l.name })),
    ...vmList.map(v => ({ id: v.vmid, icon: 'vm', name: `${v.name} (VM)` })),
    { id: 'hive', icon: 'hive', name: 'Proxmox Hive' },
  ]

  return (
    <div className="space-y-4">
      {groups.length === 0 && <p className="text-muted text-sm text-center py-3">No auto-update groups.</p>}
      {groups.map(group => (
        <div key={group.id} className="rounded-lg border border-border bg-base-800 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <button onClick={() => upd(group.id, { enabled: !group.enabled })}
              className={`relative w-8 h-4 rounded-full transition-colors flex-shrink-0 ${group.enabled ? 'bg-accent' : 'bg-base-600'}`}>
              <span className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${group.enabled ? 'translate-x-4' : ''}`} />
            </button>
            <input className="flex-1 bg-transparent text-white text-sm font-medium focus:outline-none"
              value={group.name} onChange={e => upd(group.id, { name: e.target.value })} />
            <input type="time" value={group.time} onChange={e => upd(group.id, { time: e.target.value })}
              className="bg-base-700 border border-border rounded px-2 py-1 text-xs text-white focus:outline-none" />
            <button onClick={() => remove(group.id)} className="text-muted hover:text-danger text-sm px-1 transition-colors">✕</button>
          </div>
          <div className="p-3">
            <div className="text-[10px] text-muted uppercase tracking-wider mb-2">Targets</div>
            <div className="flex flex-wrap gap-2">
              {allTargets.map(t => (
                <button key={t.id} onClick={() => toggleTarget(group, t.id)}
                  className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border transition-all ${
                    group.targets.includes(t.id) ? 'bg-accent/20 border-accent/40 text-accent' : 'bg-base-700 border-border text-muted hover:text-white'
                  }`}>
                  <img src={`/${t.icon}.svg`} className="w-4 h-4 rounded flex-shrink-0" alt="" />
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      ))}
      <button onClick={add} className="btn-ghost w-full justify-center text-xs border-dashed">+ Add group</button>
      {groups.length > 0 && (
        <div className="p-3 rounded-lg bg-warning/5 border border-warning/20 text-xs text-warning/80">
          ⚠ Runs <strong>apt-get dist-upgrade</strong> automatically. Ensure backups exist.
        </div>
      )}
    </div>
  )
}

function ContainerList({ items, selectedSet, onToggle, onRetry, loading, error, type }) {
  const iconSrc = type === 'vm' ? '/vm.svg' : '/lxc.svg'
  const prefix = type === 'vm' ? 'VM' : 'CT'
  const allSelected = items.length > 0 && items.every(i => selectedSet.has(i.vmid))

  return (
    <div>
      {loading && <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="shimmer h-12 rounded-lg bg-base-800" />)}</div>}
      {error && (
        <div className="p-3 rounded-lg bg-danger/10 text-danger border border-danger/20 text-sm space-y-1">
          <div className="flex justify-between"><span className="flex items-center gap-1.5"><img src="/cross.svg" className="w-4 h-4 flex-shrink-0" alt="" />{error}</span><button className="underline text-xs" onClick={onRetry}>Retry</button></div>
        </div>
      )}
      {!loading && !error && items.length > 0 && (
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-muted">{selectedSet.size} of {items.length} selected</span>
          <div className="flex gap-3">
            <button className="text-xs text-accent/70 hover:text-accent transition-colors"
              onClick={() => items.forEach(i => !selectedSet.has(i.vmid) && onToggle(i.vmid))} disabled={allSelected}>Select all</button>
            <span className="text-border">·</span>
            <button className="text-xs text-accent/70 hover:text-accent transition-colors"
              onClick={() => items.filter(i => selectedSet.has(i.vmid)).forEach(i => onToggle(i.vmid))} disabled={selectedSet.size === 0}>Deselect all</button>
          </div>
        </div>
      )}
      {!loading && !error && items.length === 0 && (
        <div className="text-center py-3"><p className="text-muted text-sm">No {type === 'vm' ? 'VMs' : 'containers'} found.</p><button className="text-xs text-accent underline mt-1" onClick={onRetry}>Retry</button></div>
      )}
      <div className="space-y-2">
        {items.map(item => {
          const isSelected = selectedSet.has(item.vmid)
          return (
            <button key={item.vmid} onClick={() => onToggle(item.vmid)}
              className={`w-full flex items-center gap-3 p-3.5 rounded-lg border text-left transition-all ${isSelected ? 'bg-accent/10 border-accent/40 text-white' : 'bg-base-800 border-border text-muted hover:border-base-500 hover:text-white'}`}>
              <div className={`w-4 h-4 rounded border flex items-center justify-center text-xs flex-shrink-0 transition-all ${isSelected ? 'bg-accent border-accent text-white' : 'border-base-500'}`}>{isSelected && '✓'}</div>
              <img src={iconSrc} className="w-5 h-5 rounded flex-shrink-0" alt="" />
              <span className="font-medium text-sm flex-1">{item.name}</span>
              <span className="text-xs text-muted">{prefix} {item.vmid}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full border ${item.status === 'running' ? 'bg-success/10 text-success border-success/20' : 'bg-base-700 text-muted border-border'}`}>{item.status}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function CopyLine({ children }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex items-center justify-between gap-2 font-mono text-xs bg-base-900 rounded px-3 py-2 border border-border">
      <span className="text-white/80 select-all flex-1">{children}</span>
      <button onClick={() => { navigator.clipboard.writeText(children); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
        className={`flex-shrink-0 text-[10px] px-2 py-0.5 rounded border transition-all ${copied ? 'border-success/40 text-success' : 'border-border text-muted hover:text-white hover:border-base-500'}`}>
        {copied ? '✓' : '⎘'}
      </button>
    </div>
  )
}

function OffboardModal({ site, onClose }) {
  const [status, setStatus] = useState('idle') // idle | running | success | fallback
  const [result, setResult] = useState(null)
  const username = site.ssh?.username || 'root'

  async function run() {
    setStatus('running')
    try {
      const r = await fetch(`/api/sites/${site.id}/offboard`, { method: 'POST' })
      const d = await r.json()
      setResult(d)
      setStatus(d.ok ? 'success' : 'fallback')
    } catch {
      setResult({ fallback: true, error: 'Network error', username })
      setStatus('fallback')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(8,8,10,0.88)', backdropFilter: 'blur(6px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="slide-up w-full max-w-md card border-danger/30">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-white font-semibold text-sm">Off-board Proxmox user</h3>
          <button onClick={onClose} className="text-muted hover:text-white text-sm transition-colors">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {status === 'idle' && (
            <>
              <p className="text-sm text-muted">
                This will remove the <span className="font-mono text-white">{username}</span> user and its sudoers rule from <span className="text-white">{site.ssh?.host}</span> via SSH.
              </p>
              <div className="p-3 rounded-lg bg-warning/5 border border-warning/20 text-xs text-warning/80 space-y-1">
                <div>⚠ The SSH connection will be used to run the cleanup — the session may drop after the user is deleted.</div>
              </div>
            </>
          )}

          {status === 'running' && (
            <div className="flex items-center gap-3 py-4 justify-center">
              <span className="pulse-dot w-2 h-2 rounded-full bg-accent block" />
              <span className="text-sm text-muted">Connecting and running cleanup...</span>
            </div>
          )}

          {status === 'success' && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 text-success">
                <img src="/check.svg" className="w-6 h-6 flex-shrink-0" alt="" />
                <div className="text-sm space-y-1">
                  {result.isRoot ? (
                    <>
                      <div className="font-medium">Root user cleaned up.</div>
                      <div className="text-success/70 text-xs space-y-0.5">
                        {result.hasKey && <div>• SSH key pair removed from /root/.ssh/</div>}
                        {result.hasKey && <div>• Public key removed from authorized_keys</div>}
                        <div>• sudo left installed (intentional)</div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="font-medium">User &quot;{username}&quot; fully removed.</div>
                      <div className="text-success/70 text-xs space-y-0.5">
                        <div>• User account and home directory deleted</div>
                        <div>• /etc/sudoers.d/{username} removed</div>
                        {result.hasKey && <div>• SSH key pair removed from /root/.ssh/</div>}
                        <div>• sudo left installed (intentional)</div>
                      </div>
                    </>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted">You can now delete this site from Proxmox Hive.</p>
            </div>
          )}

          {status === 'fallback' && (
            <div className="space-y-4">
              <div className="flex items-start gap-2 text-danger/80 text-sm">
                <img src="/cross.svg" className="w-5 h-5 flex-shrink-0 mt-0.5" alt="" />
                <span>Automatic cleanup failed{result?.error ? `: ${result.error}` : ''}. Run these commands on your Proxmox host (Web UI → Node → Shell):</span>
              </div>
              <div className="space-y-2">
                <div className="text-[10px] text-muted uppercase tracking-wider mb-1">Proxmox host — as root</div>
                {result?.isRoot ? (
                  <>
                    <p className="text-xs text-muted">Remove the generated key from authorized_keys, then delete the key files:</p>
                    <CopyLine>{`PUBKEY=$(cat /root/.ssh/pvedash.pub); grep -vF "$PUBKEY" /root/.ssh/authorized_keys > /tmp/_ak && mv /tmp/_ak /root/.ssh/authorized_keys`}</CopyLine>
                    <CopyLine>rm -f /root/.ssh/pvedash /root/.ssh/pvedash.pub</CopyLine>
                  </>
                ) : (
                  <>
                    <CopyLine>deluser --remove-home {result?.username || username}</CopyLine>
                    <CopyLine>rm -f /etc/sudoers.d/{result?.username || username}</CopyLine>
                    <CopyLine>rm -f /root/.ssh/pvedash /root/.ssh/pvedash.pub</CopyLine>
                  </>
                )}
              </div>
              <p className="text-xs text-muted italic">Note: sudo itself is intentionally left installed — removing it could break other things.</p>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
          <button className="btn-ghost text-xs" onClick={onClose}>
            {status === 'success' ? 'Close' : 'Cancel'}
          </button>
          {status === 'idle' && (
            <button className="btn-danger text-xs" onClick={run}>
              Off-board user
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function SiteSettings({ site, onSaved, onDeleted }) {
  const [config, setConfig] = useState(null)
  const [lxcList, setLxcList] = useState([])
  const [lxcLoading, setLxcLoading] = useState(false)
  const [lxcError, setLxcError] = useState(null)
  const [vmList, setVmList] = useState([])
  const [vmLoading, setVmLoading] = useState(false)
  const [vmError, setVmError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testingSSH, setTestingSSH] = useState(false)
  const [sshResult, setSSHResult] = useState(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [showOffboard, setShowOffboard] = useState(false)

  useEffect(() => {
    setConfig({ ...site })
    fetchLXC()
    fetchVMs()
  }, [site.id])

  async function fetchLXC() {
    setLxcLoading(true); setLxcError(null)
    try {
      const r = await fetch(`/api/sites/${site.id}/lxc`)
      const d = await r.json()
      if (!r.ok || d.error) throw new Error(d.error || `HTTP ${r.status}`)
      setLxcList(d.lxc || [])
    } catch (e) { setLxcError(e.message) }
    setLxcLoading(false)
  }

  async function fetchVMs() {
    setVmLoading(true); setVmError(null)
    try {
      const r = await fetch(`/api/sites/${site.id}/vms`)
      const d = await r.json()
      if (!r.ok || d.error) throw new Error(d.error || `HTTP ${r.status}`)
      setVmList(d.vms || [])
    } catch (e) { setVmError(e.message) }
    setVmLoading(false)
  }

  function update(path, value) {
    setConfig(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      const keys = path.split('.')
      let obj = next
      for (let i = 0; i < keys.length - 1; i++) {
        if (!obj[keys[i]]) obj[keys[i]] = {}
        obj = obj[keys[i]]
      }
      obj[keys[keys.length - 1]] = value
      return next
    })
  }

  async function testSSH() {
    setTestingSSH(true); setSSHResult(null)
    try {
      const r = await fetch('/api/setup/test-ssh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config.ssh) })
      setSSHResult(await r.json())
    } catch { setSSHResult({ ok: false, error: 'Connection error' }) }
    setTestingSSH(false)
  }

  async function save() {
    setSaving(true); setSaved(false)
    try {
      const r = await fetch(`/api/sites/${site.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) })
      const d = await r.json()
      if (d.ok) { setSaved(true); setTimeout(() => setSaved(false), 3000); onSaved(d.site) }
    } catch { }
    setSaving(false)
  }

  async function deleteSite() {
    await fetch(`/api/sites/${site.id}`, { method: 'DELETE' })
    onDeleted(site.id)
  }

  async function resetEverything() {
    await fetch('/api/reset', { method: 'POST' })
    window.location.reload()
  }

  function toggleLXC(vmid) {
    const current = config.monitoredLXC || []
    update('monitoredLXC', current.includes(vmid) ? current.filter(v => v !== vmid) : [...current, vmid])
  }

  function toggleVM(vmid) {
    const current = config.monitoredVMs || []
    update('monitoredVMs', current.includes(vmid) ? current.filter(v => v !== vmid) : [...current, vmid])
  }

  if (!config) return null
  const lxcMonitoredSet = new Set(config.monitoredLXC || [])
  const vmMonitoredSet = new Set(config.monitoredVMs || [])

  return (
    <div className="space-y-5">
      {showOffboard && <OffboardModal site={site} onClose={() => setShowOffboard(false)} />}
      {/* Site name */}
      <Section title="Site">
        <div><label className="label">Name</label>
          <input className="input" value={config.name || ''} onChange={e => update('name', e.target.value)} /></div>
      </Section>

      {/* SSH */}
      <Section title="SSH Connection">
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2"><label className="label">Host / IP</label><input className="input" value={config.ssh?.host || ''} onChange={e => update('ssh.host', e.target.value)} /></div>
          <div><label className="label">Port</label><input className="input" value={config.ssh?.port || '22'} onChange={e => update('ssh.port', e.target.value)} /></div>
        </div>
        <div><label className="label">Username</label><input className="input" placeholder="root or pvedash" value={config.ssh?.username || ''} onChange={e => update('ssh.username', e.target.value)} /></div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="label mb-0">SSH Private Key <span className="text-base-500 normal-case">(leave empty to keep)</span></label>
            <SSHHowButton />
          </div>
          <textarea className="input font-mono text-xs h-20 resize-none" placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
            value={config.ssh?.privateKey === '[set]' ? '' : (config.ssh?.privateKey || '')}
            onChange={e => update('ssh.privateKey', e.target.value)} />
          {config.ssh?.privateKey === '[set]' && <p className="text-xs text-success mt-1">✓ Key configured</p>}
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="label mb-0">Password <span className="text-base-500 normal-case">(alternative to key)</span></label>
            <SSHHowButton />
          </div>
          <input className="input" type="password" placeholder="Leave empty to keep existing" onChange={e => update('ssh.password', e.target.value)} />
        </div>
        <div className="flex items-center gap-3">
          <button className="btn-ghost text-xs" onClick={testSSH} disabled={testingSSH}>{testingSSH ? 'Testing...' : 'Test connection'}</button>
          {sshResult && <span className={`text-xs flex items-center gap-1.5 ${sshResult.ok ? 'text-success' : 'text-danger'}`}><img src={sshResult.ok ? '/check.svg' : '/cross.svg'} className="w-4 h-4 flex-shrink-0" alt="" />{sshResult.ok ? 'Connected' : sshResult.error}</span>}
        </div>
      </Section>

      {/* LXC */}
      <Section title="Monitored LXC Containers" description="Which containers are scanned for package and app updates.">
        <ContainerList
          items={lxcList}
          selectedSet={lxcMonitoredSet}
          onToggle={toggleLXC}
          onRetry={fetchLXC}
          loading={lxcLoading}
          error={lxcError}
          type="lxc"
        />
      </Section>

      {/* VMs */}
      <Section title="Monitored Linux VMs" description="QEMU VMs with the guest agent installed. Requires qemu-guest-agent running inside the VM.">
        <ContainerList
          items={vmList}
          selectedSet={vmMonitoredSet}
          onToggle={toggleVM}
          onRetry={fetchVMs}
          loading={vmLoading}
          error={vmError}
          type="vm"
        />
        {!vmLoading && !vmError && vmList.length > 0 && (
          <p className="text-xs text-muted mt-2">
            VMs need <span className="font-mono text-white/70">qemu-guest-agent</span> installed and VM Options → QEMU Guest Agent enabled.
          </p>
        )}
      </Section>

      {/* Check schedule */}
      <Section title="Check Schedule">
        <div className="flex gap-3">
          {(config.schedule?.times || ['08:00', '20:00']).map((t, i) => (
            <div key={i} className="flex-1">
              <label className="label">Check {i + 1}</label>
              <input type="time" className="input" value={t} onChange={e => {
                const times = [...(config.schedule?.times || ['08:00', '20:00'])]
                times[i] = e.target.value; update('schedule.times', times)
              }} />
            </div>
          ))}
        </div>
        <div className="mt-3">
          <label className="label">Timezone</label>
          <input
            type="text"
            className="input"
            placeholder="e.g. Europe/Copenhagen"
            value={config.schedule?.timezone || ''}
            onChange={e => update('schedule.timezone', e.target.value || undefined)}
          />
          <p className="text-xs text-muted mt-1">IANA timezone name. Leave empty to use UTC.</p>
        </div>
      </Section>

      {/* Auto-update */}
      <Section title="Auto-Update Groups" description="Schedule automatic updates per group at different times.">
        <GroupEditor
          groups={config.autoUpdate?.groups || []}
          lxcList={lxcList}
          vmList={vmList}
          onChange={groups => update('autoUpdate.groups', groups)}
        />
      </Section>

      {/* Notifications */}
      <Section title="Notification Channels" description="Discord, Slack, Teams, or any webhook. Configure which alerts each channel receives.">
        <NotificationChannels channels={config.notifications?.channels || []} onChange={channels => update('notifications.channels', channels)} />
      </Section>

      {/* Danger Zone */}
      <Section title="Danger Zone" danger>
        <div className="space-y-4">
          {/* Off-board */}
          <div className="flex items-center justify-between gap-4 pb-4 border-b border-border">
            <div>
              <div className="text-sm text-white">Off-board Proxmox user</div>
              <div className="text-xs text-muted mt-0.5">
                Remove the <span className="font-mono">{config.ssh?.username || 'root'}</span> user and its sudoers rule from <span className="font-mono">{config.ssh?.host}</span>.
              </div>
            </div>
            <button className="btn-danger text-xs flex-shrink-0" onClick={() => setShowOffboard(true)}>
              Off-board
            </button>
          </div>

          <div className="flex items-center justify-between gap-4 pb-4 border-b border-border">
            <div>
              <div className="text-sm text-white">Delete this site</div>
              <div className="text-xs text-muted mt-0.5">Removes <strong>{site.name}</strong> from Proxmox Hive. Other sites are unaffected.</div>
            </div>
            {!showDeleteConfirm ? (
              <button className="btn-danger text-xs flex-shrink-0" onClick={() => setShowDeleteConfirm(true)}>Delete site</button>
            ) : (
              <div className="flex gap-2">
                <button className="btn-danger text-xs" onClick={deleteSite}>Confirm delete</button>
                <button className="btn-ghost text-xs" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm text-white">Reset everything</div>
              <div className="text-xs text-muted mt-0.5">Deletes all sites and configuration. Returns to the setup wizard. Cannot be undone.</div>
            </div>
            {!showResetConfirm ? (
              <button className="btn-danger text-xs flex-shrink-0" onClick={() => setShowResetConfirm(true)}>Fresh reset</button>
            ) : (
              <div className="flex gap-2">
                <button className="btn-danger text-xs" onClick={resetEverything}>Yes, reset all</button>
                <button className="btn-ghost text-xs" onClick={() => setShowResetConfirm(false)}>Cancel</button>
              </div>
            )}
          </div>
        </div>
      </Section>

      <div className="flex items-center justify-end gap-3 pt-2 pb-8">
        {saved && <span className="text-xs text-success fade-up">✓ Saved</span>}
        <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save changes'}</button>
      </div>
    </div>
  )
}

export default function Settings({ sites, activeSiteId, onBack, onSitesChanged, onReset, openAddSite }) {
  const [selectedSiteId, setSelectedSiteId] = useState(activeSiteId || sites[0]?.id)
  // If openAddSite prop is true, start directly in add-site mode
  const [showAddSite, setShowAddSite] = useState(openAddSite || false)

  const selectedSite = sites.find(s => s.id === selectedSiteId) || sites[0]

  if (showAddSite) {
    return <Setup onComplete={() => { onSitesChanged(); setShowAddSite(false) }} onCancel={() => setShowAddSite(false)} isAdding />
  }

  return (
    <div className="min-h-full flex flex-col">
      <header className="border-b border-border bg-base-900/80 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-5 h-14 flex items-center gap-4">
          <button onClick={onBack} className="text-muted hover:text-white transition-colors text-sm">← Dashboard</button>
          <span className="text-border">|</span>
          <span className="text-white text-sm font-medium">Settings</span>
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-5 py-8 space-y-5">
        <div className="flex gap-2 flex-wrap items-center">
          {sites.map(s => (
            <button key={s.id} onClick={() => setSelectedSiteId(s.id)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-all ${s.id === selectedSiteId ? 'bg-accent/20 border-accent/40 text-accent' : 'bg-base-800 border-border text-muted hover:text-white'}`}>
              {s.name}
            </button>
          ))}
          <button onClick={() => setShowAddSite(true)}
            className="text-xs px-3 py-1.5 rounded-full border border-dashed border-border text-muted hover:text-white hover:border-base-500 transition-all">
            + New site
          </button>
        </div>

        {selectedSite && (
          <SiteSettings
            key={selectedSite.id}
            site={selectedSite}
            onSaved={() => onSitesChanged()}
            onDeleted={id => { onSitesChanged(); if (sites.length <= 1) onReset() }}
          />
        )}
      </main>
    </div>
  )
}
