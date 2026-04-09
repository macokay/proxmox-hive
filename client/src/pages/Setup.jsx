import { SSHHowButton } from '../components/SSHHowModal.jsx'
import { NotificationChannels, TimezoneSelect, TimeInput } from './Settings.jsx'
import { useState } from 'react'

const STEPS = ['SSH Access', 'Select LXC', 'Schedule & Notifications', 'Name your site']

function CopyBlock({ icon, where, hint, steps }) {
  const [copied, setCopied] = useState(false)
  const copyable = steps
    .map(s => typeof s === 'string' ? s : s.cmd)
    .filter(l => !l.startsWith('# '))
    .join('\n')

  function copy() {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(copyable)
    } else {
      const el = document.createElement('textarea')
      el.value = copyable
      el.style.cssText = 'position:fixed;opacity:0'
      document.body.appendChild(el)
      el.focus()
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="border-b border-border/50 last:border-0">
      <div className="px-4 pt-3 pb-2 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-sm leading-none">{icon}</span>
            <span className="text-[10px] text-white/60 uppercase tracking-wider font-semibold">{where}</span>
          </div>
          {hint && <div className="text-[10px] text-muted mt-0.5 ml-5">{hint}</div>}
        </div>
        <button onClick={copy}
          className={`flex-shrink-0 flex items-center gap-1 text-[10px] font-medium px-2.5 py-1 rounded border transition-all ${
            copied ? 'border-success/40 text-success bg-success/10' : 'border-border text-muted hover:text-white hover:border-base-500'
          }`}>
          {copied ? '✓ Copied' : '⎘ Copy'}
        </button>
      </div>
      <div className="px-4 pb-3.5 font-mono text-xs space-y-1.5 leading-relaxed">
        {steps.map((s, i) => {
          const cmd = typeof s === 'string' ? s : s.cmd
          const note = typeof s === 'object' ? s.note : null
          if (cmd.startsWith('# ')) {
            return <div key={i} className="text-muted text-[10px] font-sans italic pt-0.5">{cmd.slice(2)}</div>
          }
          const m = cmd.match(/^(\S+)(.*)$/) || ['', cmd, '']
          return (
            <div key={i} className="flex items-baseline gap-2 flex-wrap">
              <span>
                <span className="text-accent">{m[1]}</span>
                <span className="text-white/80">{m[2]}</span>
              </span>
              {note && <span className="text-muted text-[10px] font-sans">{note}</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StepIndicator({ step }) {
  return (
    <div className="flex items-center gap-2 mb-10">
      {STEPS.map((label, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold transition-all duration-300 ${
            i < step ? 'bg-success text-white' :
            i === step ? 'bg-accent text-white glow-accent' :
            'bg-base-700 text-muted'
          }`}>
            {i < step ? '✓' : i + 1}
          </div>
          <span className={`text-sm hidden sm:block ${i === step ? 'text-white' : 'text-muted'}`}>{label}</span>
          {i < STEPS.length - 1 && (
            <div className={`w-8 h-px mx-1 transition-all duration-500 ${i < step ? 'bg-success' : 'bg-border'}`} />
          )}
        </div>
      ))}
    </div>
  )
}

function SSHStep({ data, onChange, onNext }) {
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState(null)
  const [authMode, setAuthMode] = useState('key')
  const [errors, setErrors] = useState({})
  const [openOption, setOpenOption] = useState('A')
  const [discovering, setDiscovering] = useState(false)
  const [discoveredHosts, setDiscoveredHosts] = useState(null)

  async function discover() {
    setDiscovering(true)
    setDiscoveredHosts(null)
    try {
      const r = await fetch('/api/setup/discover')
      const d = await r.json()
      setDiscoveredHosts(d.hosts || [])
    } catch {
      setDiscoveredHosts([])
    }
    setDiscovering(false)
  }

  function toggleOption(opt) {
    setOpenOption(prev => prev === opt ? null : opt)
  }

  function validate() {
    const e = {}
    if (!data.host?.trim()) e.host = 'Required'
    if (!data.username?.trim()) e.username = 'Required'
    if (authMode === 'key' && !data.privateKey?.trim()) e.auth = 'Paste your SSH private key'
    if (authMode === 'password' && !data.password?.trim()) e.auth = 'Enter a password'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function test() {
    if (!validate()) return
    setTesting(true)
    setResult(null)
    try {
      const r = await fetch('/api/setup/test-ssh', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      setResult(await r.json())
    } catch {
      setResult({ ok: false, error: 'Connection error' })
    }
    setTesting(false)
  }

  async function proceed() {
    if (!validate()) return
    if (result?.ok) { onNext(); return }
    setTesting(true)
    const r = await fetch('/api/setup/test-ssh', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(r => r.json()).catch(() => ({ ok: false, error: 'Connection error' }))
    setResult(r)
    setTesting(false)
    if (r.ok) setTimeout(onNext, 400)
  }

  // Clear error when field changes
  function field(key, val) {
    onChange(val)
    if (errors[key]) setErrors(e => { const n = {...e}; delete n[key]; return n })
  }

  return (
    <div className="fade-up space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-white mb-1">SSH Access</h2>
        <p className="text-sm text-muted">Create a dedicated user on your Proxmox host with limited sudo access.</p>

        <div className="mt-4 space-y-2 font-sans">

          {/* ── OPTION A ─────────────────────────────────────────── */}
          <div className={`rounded-lg bg-base-800 border overflow-hidden transition-all ${openOption === 'A' ? 'border-accent/30' : 'border-border'}`}>
            <button type="button" onClick={() => toggleOption('A')}
              className="w-full px-4 py-2.5 flex items-center justify-between text-left transition-colors hover:bg-base-700/40"
              style={{ background: openOption === 'A' ? 'rgba(79,142,247,0.08)' : undefined }}>
              <div className="flex items-center gap-2">
                <span className={`font-semibold text-xs ${openOption === 'A' ? 'text-accent' : 'text-white'}`}>Option A — Restricted user + SSH key</span>
                <span className="text-[10px] text-accent/70 bg-accent/10 px-1.5 py-0.5 rounded-full border border-accent/20">Recommended</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted">least privilege</span>
                <span className={`text-muted text-xs transition-transform duration-200 ${openOption === 'A' ? 'rotate-180' : ''}`}>▾</span>
              </div>
            </button>
            {openOption === 'A' && (
              <>
                <CopyBlock icon={<img src="/proxmox.svg" className="w-4 h-4 align-middle" alt="" />} where="Proxmox host — Step 1: Create user"
                  hint='Proxmox web UI → select your node → "Shell" tab, or: ssh root@PROXMOX-IP'
                  steps={[
                    'apt install sudo -y',
                    'id pvehive &>/dev/null && (deluser --remove-home pvehive 2>/dev/null || userdel -rf pvehive 2>/dev/null) || true',
                    'adduser pvehive --disabled-password --gecos ""',
                    'echo "pvehive ALL=(ALL) NOPASSWD: /usr/bin/apt-get,/usr/bin/apt,/usr/bin/dpkg,/usr/sbin/pct,/usr/bin/pct,/usr/sbin/qm,/usr/bin/qm" | tee /etc/sudoers.d/pvehive',
                    'chmod 440 /etc/sudoers.d/pvehive',
                  ]} />
                <CopyBlock icon={<img src="/proxmox.svg" className="w-4 h-4 align-middle" alt="" />} where="Proxmox host — Step 2: Generate & install SSH key"
                  steps={[
                    'rm -f ~/.ssh/pvehive ~/.ssh/pvehive.pub',
                    'ssh-keygen -t ed25519 -f ~/.ssh/pvehive -N ""',
                    'mkdir -p /home/pvehive/.ssh',
                    'cat ~/.ssh/pvehive.pub >> /home/pvehive/.ssh/authorized_keys',
                    'chmod 700 /home/pvehive/.ssh && chmod 600 /home/pvehive/.ssh/authorized_keys',
                    'chown -R pvehive:pvehive /home/pvehive/.ssh',
                    'ssh -i ~/.ssh/pvehive -o BatchMode=yes -o StrictHostKeyChecking=accept-new pvehive@localhost echo "Login OK"',
                  ]} />
                <CopyBlock icon={<img src="/proxmox.svg" className="w-4 h-4 align-middle" alt="" />} where="Proxmox host — Step 3: Get private key"
                  hint="Copy ALL output and paste it in the field below"
                  steps={['cat ~/.ssh/pvehive']} />
                <div className="px-4 py-2.5 bg-base-700/40 border-t border-border text-[10px] text-muted space-y-1">
                  <div>→ Username: <span className="font-mono text-white">pvehive</span></div>
                  <div>→ <span className="text-yellow-400 font-semibold">-N ""</span> means no passphrase — required, keys with passphrases are not supported</div>
                  <div>→ Paste the <span className="text-white">private key</span> (the file <span className="font-mono">~/.ssh/pvehive</span>, not <span className="font-mono">~/.ssh/pvehive.pub</span>)</div>
                </div>
              </>
            )}
          </div>

          {/* ── OPTION B ─────────────────────────────────────────── */}
          <div className={`rounded-lg bg-base-800 border overflow-hidden transition-all ${openOption === 'B' ? 'border-base-500' : 'border-border'}`}>
            <button type="button" onClick={() => toggleOption('B')}
              className="w-full px-4 py-2.5 flex items-center justify-between text-left transition-colors hover:bg-base-700/40"
              style={{ background: openOption === 'B' ? 'rgba(255,255,255,0.04)' : undefined }}>
              <div className="flex items-center gap-2">
                <span className="text-white font-semibold text-xs">Option B — Root + SSH key</span>
                <span className="text-[10px] text-muted bg-base-700 px-1.5 py-0.5 rounded-full border border-border">Simpler</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted">no extra user</span>
                <span className={`text-muted text-xs transition-transform duration-200 ${openOption === 'B' ? 'rotate-180' : ''}`}>▾</span>
              </div>
            </button>
            {openOption === 'B' && (
              <>
                <CopyBlock icon={<img src="/proxmox.svg" className="w-4 h-4 align-middle" alt="" />} where="Proxmox host — Step 1: Allow root SSH key login"
                  hint='Proxmox web UI → select your node → "Shell" tab, or: ssh root@PROXMOX-IP'
                  steps={[
                    "sed -i 's/^#*PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config",
                    'systemctl reload sshd',
                  ]} />
                <CopyBlock icon={<img src="/proxmox.svg" className="w-4 h-4 align-middle" alt="" />} where="Proxmox host — Step 2: Generate & install SSH key"
                  steps={[
                    'rm -f ~/.ssh/pvehive ~/.ssh/pvehive.pub',
                    'ssh-keygen -t ed25519 -f ~/.ssh/pvehive -N ""',
                    'cat ~/.ssh/pvehive.pub >> ~/.ssh/authorized_keys',
                    'chmod 600 ~/.ssh/authorized_keys',
                    'ssh -i ~/.ssh/pvehive -o BatchMode=yes -o StrictHostKeyChecking=accept-new root@localhost echo "Login OK"',
                  ]} />
                <CopyBlock icon={<img src="/proxmox.svg" className="w-4 h-4 align-middle" alt="" />} where="Proxmox host — Step 3: Get private key"
                  hint="Copy ALL output and paste it in the field below"
                  steps={['cat ~/.ssh/pvehive']} />
                <div className="px-4 py-2.5 bg-base-700/40 border-t border-border text-[10px] text-muted space-y-1">
                  <div>→ Username: <span className="font-mono text-white">root</span></div>
                  <div>→ <span className="text-yellow-400 font-semibold">-N ""</span> means no passphrase — required</div>
                  <div>→ Paste the <span className="text-white">private key</span> (the file <span className="font-mono">~/.ssh/pvehive</span>, not <span className="font-mono">~/.ssh/pvehive.pub</span>)</div>
                </div>
              </>
            )}
          </div>

          {/* ── OPTION C ─────────────────────────────────────────── */}
          <div className={`rounded-lg bg-base-800 border overflow-hidden transition-all opacity-80 ${openOption === 'C' ? 'border-warning/30' : 'border-warning/20'}`}>
            <button type="button" onClick={() => toggleOption('C')}
              className="w-full px-4 py-2.5 flex items-center justify-between text-left transition-colors hover:bg-warning/5"
              style={{ background: openOption === 'C' ? 'rgba(245,158,11,0.05)' : undefined }}>
              <div className="flex items-center gap-2">
                <span className="text-warning/80 font-semibold text-xs">Option C — Password</span>
                <span className="text-[10px] text-warning/60 bg-warning/10 px-1.5 py-0.5 rounded-full border border-warning/20">Not recommended</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted">only if you don't want keys</span>
                <span className={`text-muted text-xs transition-transform duration-200 ${openOption === 'C' ? 'rotate-180' : ''}`}>▾</span>
              </div>
            </button>
            {openOption === 'C' && (
              <>
                <CopyBlock icon={<img src="/proxmox.svg" className="w-4 h-4 align-middle" alt="" />} where="Proxmox host — as root"
                  hint='Proxmox web UI → select your node → "Shell" tab, or: ssh root@PROXMOX-IP'
                  steps={[
                    'apt install sudo -y',
                    'adduser pvehive --gecos ""',
                    'echo "pvehive ALL=(ALL) NOPASSWD: /usr/bin/apt-get,/usr/bin/apt,/usr/bin/dpkg,/usr/sbin/pct,/usr/bin/pct,/usr/sbin/qm,/usr/bin/qm" | tee /etc/sudoers.d/pvehive',
                    'chmod 440 /etc/sudoers.d/pvehive',
                    { cmd: 'passwd pvehive', note: '← set a password when prompted' },
                  ]} />
                <div className="px-4 py-2.5 bg-warning/5 border-t border-warning/20 text-[10px] text-muted space-y-1">
                  <div>→ Username: <span className="font-mono text-white">pvehive</span></div>
                  <div>→ Auth: select <span className="text-white">Password</span> below and enter the password you set with <span className="font-mono">passwd</span></div>
                  <div className="text-warning/70">⚠ Password auth is less secure — prefer SSH keys if possible</div>
                </div>
              </>
            )}
          </div>

        </div>
      </div>

      {/* Form fields */}
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <div className="flex items-center justify-between mb-1">
            <label className="label mb-0">Host / IP</label>
            <button type="button" onClick={discover} disabled={discovering}
              className="flex items-center gap-1 text-[10px] text-accent/70 hover:text-accent transition-colors disabled:opacity-50">
              {discovering
                ? <><span className="pulse-dot w-1.5 h-1.5 rounded-full bg-accent inline-block mr-1" />Scanning...</>
                : '⊕ Autodiscover'}
            </button>
          </div>
          <input className={`input ${errors.host ? 'border-danger/60 focus:border-danger/80' : ''}`}
            placeholder="192.168.1.10" value={data.host || ''}
            onChange={e => field('host', { host: e.target.value })} />
          {errors.host && <p className="text-xs text-danger mt-1">{errors.host}</p>}
          {discoveredHosts !== null && (
            <div className="mt-1.5">
              {discoveredHosts.length === 0 ? (
                <p className="text-xs text-muted">No Proxmox hosts found on port 8006 — enter IP manually.</p>
              ) : (
                <div className="rounded-lg border border-accent/30 bg-base-800 overflow-hidden">
                  <div className="px-3 py-1.5 text-[10px] text-muted border-b border-border">
                    {discoveredHosts.length} host{discoveredHosts.length !== 1 ? 's' : ''} found — click to select
                  </div>
                  {discoveredHosts.map(ip => (
                    <button key={ip} type="button"
                      onClick={() => { field('host', { host: ip }); setDiscoveredHosts(null) }}
                      className="w-full text-left px-3 py-2 text-xs font-mono text-accent hover:bg-accent/10 transition-colors border-b border-border last:border-0">
                      {ip}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div>
          <label className="label">Port</label>
          <input className="input" placeholder="22" value={data.port || ''}
            onChange={e => onChange({ port: e.target.value })} />
        </div>
      </div>

      <div>
        <label className="label">Username</label>
        <input className={`input ${errors.username ? 'border-danger/60 focus:border-danger/80' : ''}`}
          placeholder="pvehive" value={data.username || ''}
          onChange={e => field('username', { username: e.target.value })} />
        {errors.username && <p className="text-xs text-danger mt-1">{errors.username}</p>}
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="label mb-0">Authentication</label>
          <SSHHowButton />
        </div>
        <div className="flex gap-2 mb-3">
          {[
            ['key',      <><img src="/key.svg"    className="w-3.5 h-3.5 inline mr-1.5 align-middle" alt="" />SSH Key</>],
            ['password', <><img src="/unlock.svg" className="w-3.5 h-3.5 inline mr-1.5 align-middle" alt="" />Password</>],
          ].map(([m, label]) => (
            <button key={m} type="button" onClick={() => {
              setAuthMode(m)
              setErrors(e => { const n = {...e}; delete n.auth; return n })
              onChange(m === 'key' ? { password: undefined } : { privateKey: undefined })
            }}
              className={`btn text-xs ${authMode === m ? 'bg-accent/20 text-accent border border-accent/30' : 'btn-ghost'}`}>
              {label}
            </button>
          ))}
        </div>
        {authMode === 'key' ? (
          <div className="space-y-2">
            <textarea
              className={`input font-mono text-xs h-36 resize-none ${errors.auth ? 'border-danger/60' : ''}`}
              placeholder={"-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----"}
              value={data.privateKey || ''}
              onChange={e => field('auth', { privateKey: e.target.value, password: undefined })}
            />
            {errors.auth
              ? <p className="text-xs text-danger">{errors.auth}</p>
              : (
                <div className="rounded-lg bg-base-800 border border-border px-3 py-2.5 text-xs space-y-1.5 text-muted font-sans">
                  <div className="font-mono text-white/70">cat ~/.ssh/pvehive</div>
                  <div>Run this where you generated the key, then copy the entire output and paste it above.</div>
                  <div className="pt-1 border-t border-border space-y-1">
                    <div className="text-warning/80">⚠ No passphrase — generate with <span className="font-mono">-N ""</span></div>
                    <div className="text-warning/80">⚠ Private key only — not the <span className="font-mono">.pub</span> file</div>
                  </div>
                </div>
              )
            }
          </div>
        ) : (
          <div>
            <input className={`input ${errors.auth ? 'border-danger/60' : ''}`}
              type="password" placeholder="Password for the SSH user"
              value={data.password || ''}
              onChange={e => field('auth', { password: e.target.value, privateKey: undefined })} />
            {errors.auth && <p className="text-xs text-danger mt-1">{errors.auth}</p>}
          </div>
        )}
      </div>

      {result && (
        <div className={`p-3 rounded-lg text-sm ${result.ok ? 'bg-success/10 text-success border border-success/20' : 'bg-danger/10 text-danger border border-danger/20'}`}>
          <span className="flex items-center gap-2"><img src={result.ok ? '/check.svg' : '/cross.svg'} className="w-5 h-5 flex-shrink-0" alt="" />{result.ok ? 'Connection successful' : result.error}</span>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button className="btn-ghost" onClick={test} disabled={testing}>
          {testing ? 'Testing...' : 'Test connection'}
        </button>
        <button className="btn-primary ml-auto" disabled={testing} onClick={proceed}>
          {testing ? 'Testing...' : result?.ok ? 'Next →' : 'Test & continue →'}
        </button>
      </div>
    </div>
  )
}

function LXCStep({ sshData, selected, onSelect, onNext, onBack }) {
  const [lxcList, setLxcList] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [warnEmpty, setWarnEmpty] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch('/api/setup/list-lxc', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sshData)
      })
      const d = await r.json()
      if (d.error) throw new Error(d.error)
      setLxcList(d.lxc)
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  if (!lxcList && !loading && !error) load()

  function toggle(vmid) {
    onSelect(selected.includes(vmid) ? selected.filter(v => v !== vmid) : [...selected, vmid])
    setWarnEmpty(false)
  }

  function handleNext() {
    if (selected.length === 0 && lxcList && lxcList.length > 0) {
      setWarnEmpty(true)
      return
    }
    onNext()
  }

  return (
    <div className="fade-up space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-white mb-1">Select LXC Containers</h2>
        <p className="text-sm text-muted">Choose which containers to monitor for package and app updates.</p>
      </div>

      {loading && <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="shimmer h-14 rounded-lg bg-base-800 border border-border" />)}</div>}

      {error && (
        <div className="space-y-2">
          <div className="p-3 rounded-lg bg-danger/10 text-danger border border-danger/20 text-sm">
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium flex items-center gap-1.5"><img src="/cross.svg" className="w-4 h-4 flex-shrink-0" alt="" />Failed to list containers</span>
              <button className="underline text-xs" onClick={load}>Retry</button>
            </div>
            <div className="font-mono text-xs text-danger/70 mt-1 break-all">{error}</div>
            {error.includes('sudo: command not found') && (
              <div className="mt-2 p-2 rounded bg-warning/10 border border-warning/20 text-warning/90 text-[11px] font-sans">
                💡 <strong>sudo is not installed on Proxmox.</strong> Run this first on your Proxmox host:
                <div className="font-mono mt-1 text-white/70">apt install sudo -y</div>
              </div>
            )}
          </div>
          <div className="p-3 rounded-lg bg-base-800 border border-border text-xs text-muted space-y-1">
            <div className="text-white text-xs font-medium mb-1">Checklist:</div>
            <div>✓ Is <code className="text-white/70 font-mono">sudo</code> installed? Run: <code className="text-white/70 font-mono">apt install sudo -y</code></div>
            <div>✓ Is the <code className="text-white/70 font-mono">pvehive</code> user created on the Proxmox host?</div>
            <div>✓ Is <code className="text-white/70 font-mono">/etc/sudoers.d/pvehive</code> created with the right content?</div>
            <div>✓ Did you set a password (<code className="text-white/70 font-mono">passwd pvehive</code>) or copy an SSH key?</div>
            <div>✓ Can you SSH in manually? <code className="text-white/70 font-mono">ssh pvehive@{'{'}HOST{'}'}</code></div>
          </div>
        </div>
      )}

      {lxcList && (
        <div className="space-y-2">
          {lxcList.length === 0 && <p className="text-muted text-sm text-center py-6">No LXC containers found</p>}
          {lxcList.length > 0 && (
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted">{selected.length} of {lxcList.length} selected</span>
              <div className="flex gap-2">
                <button className="text-xs text-accent/70 hover:text-accent transition-colors"
                  onClick={() => { onSelect(lxcList.map(l => l.vmid)); setWarnEmpty(false) }}>Select all</button>
                <span className="text-border">·</span>
                <button className="text-xs text-accent/70 hover:text-accent transition-colors"
                  onClick={() => onSelect([])}>Deselect all</button>
              </div>
            </div>
          )}
          {lxcList.map(lxc => {
            const isSelected = selected.includes(lxc.vmid)
            return (
              <button key={lxc.vmid} onClick={() => toggle(lxc.vmid)}
                className={`w-full flex items-center gap-4 p-4 rounded-lg border text-left transition-all duration-150 ${
                  isSelected ? 'bg-accent/10 border-accent/40 text-white' : 'bg-base-800 border-border text-muted hover:border-base-500 hover:text-white'
                }`}>
                <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border text-xs transition-all ${isSelected ? 'bg-accent border-accent text-white' : 'border-base-500'}`}>
                  {isSelected && '✓'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{lxc.name}</div>
                  <div className="text-xs text-muted">CT {lxc.vmid}</div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full border ${lxc.status === 'running' ? 'bg-success/10 text-success border-success/20' : 'bg-base-700 text-muted border-border'}`}>
                  {lxc.status}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {warnEmpty && (
        <p className="text-sm text-danger">Please select at least one container to monitor.</p>
      )}

      <div className="flex gap-3 pt-2">
        <button className="btn-ghost" onClick={onBack}>← Back</button>
        <button className="btn-primary ml-auto" onClick={handleNext}>
          {selected.length > 0 ? `Next → (${selected.length} selected)` : 'Next →'}
        </button>
      </div>
    </div>
  )
}

function ScheduleStep({ data, onChange, onNext, onBack }) {
  const times = data.schedule?.times || ['08:00', '20:00']
  const timezone = data.schedule?.timezone || ''
  function updateTime(index, value) {
    const t = [...times]; t[index] = value
    onChange({ schedule: { times: t, timezone: timezone || undefined } })
  }

  return (
    <div className="fade-up space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-white mb-1">Schedule & Notifications</h2>
        <p className="text-sm text-muted">Configure when to check for updates and where to send alerts.</p>
      </div>

      <div>
        <label className="label">Check schedule</label>
        <div className="flex gap-3">
          {times.map((t, i) => (
            <div key={i} className="flex-1">
              <label className="text-xs text-muted mb-1 block">Check {i + 1}</label>
              <TimeInput value={t} onChange={v => updateTime(i, v)} />
            </div>
          ))}
        </div>
        <p className="text-xs text-muted mt-2">Runs automatically twice a day.</p>
      </div>

      <div>
        <label className="label">Timezone</label>
        <TimezoneSelect value={timezone} onChange={tz => onChange({ schedule: { times, timezone: tz || undefined } })} />
      </div>

      <div>
        <label className="label">Notification Channels <span className="text-base-500 normal-case">(optional)</span></label>
        <NotificationChannels
          channels={data.notifications?.channels || []}
          onChange={channels => onChange({ notifications: { channels } })}
        />
      </div>

      <div className="flex gap-3 pt-2">
        <button className="btn-ghost" onClick={onBack}>← Back</button>
        <button className="btn-primary ml-auto" onClick={onNext}>Next →</button>
      </div>
    </div>
  )
}

function NameStep({ siteName, onChange, onSave, onBack, saving }) {
  const [error, setError] = useState(false)

  function handleSave() {
    if (!siteName.trim()) { setError(true); return }
    onSave()
  }

  return (
    <div className="fade-up space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-white mb-1">Name your site</h2>
        <p className="text-sm text-muted">Give this Proxmox host a friendly name for the dashboard.</p>
      </div>
      <div>
        <label className="label">Site name</label>
        <input className={`input ${error ? 'border-danger/60 focus:border-danger/80' : ''}`}
          placeholder="e.g. Home Lab" value={siteName}
          autoFocus
          onChange={e => { onChange(e.target.value); if (e.target.value.trim()) setError(false) }} />
        {error && <p className="text-xs text-danger mt-1">Please enter a name for this site</p>}
      </div>
      <div className="flex gap-3 pt-2">
        <button className="btn-ghost" onClick={onBack}>← Back</button>
        <button className="btn-primary ml-auto" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : '✓ Save and open dashboard'}
        </button>
      </div>
    </div>
  )
}

export default function Setup({ onComplete, onCancel, isAdding }) {
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [siteName, setSiteName] = useState('')
  const [ssh, setSSH] = useState({ host: '', port: '22', username: 'pvehive', privateKey: '' })
  const [selectedLXC, setSelectedLXC] = useState([])
  const [notifications, setNotifications] = useState({ channels: [] })
  const [schedule, setSchedule] = useState({ times: ['08:00', '20:00'] })

  async function save() {
    setSaving(true)
    try {
      const res = await fetch('/api/setup/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: siteName || 'My Lab', ssh, notifications, schedule, monitoredLXC: selectedLXC, autoUpdate: { groups: [] } })
      }).then(r => r.json())

      if (res.ok && res.siteId) {
        fetch(`/api/sites/${res.siteId}/check`, { method: 'POST' }).catch(() => {})
      }
      onComplete()
    } catch { setSaving(false) }
  }

  return (
    <div className="min-h-full flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="mb-10 fade-up">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-3">
              <img src="/hive.svg" className="w-9 h-9" alt="Proxmox Hive" />
              <span className="font-semibold text-white text-lg tracking-tight">Proxmox Hive</span>
            </div>
            {onCancel && <button onClick={onCancel} className="text-muted hover:text-white text-sm transition-colors">✕ Cancel</button>}
          </div>
          <div className="ml-12 mt-1">
            <span className="text-muted text-sm">{isAdding ? 'Adding new site' : 'Setup'}</span>
          </div>
        </div>
        <StepIndicator step={step} />
        <div className="card p-6">
          {step === 0 && <SSHStep data={ssh} onChange={d => setSSH(p => ({ ...p, ...d }))} onNext={() => setStep(1)} />}
          {step === 1 && <LXCStep sshData={ssh} selected={selectedLXC} onSelect={setSelectedLXC} onNext={() => setStep(2)} onBack={() => setStep(0)} />}
          {step === 2 && <ScheduleStep
            data={{ notifications, schedule }}
            onChange={d => { if (d.notifications) setNotifications(d.notifications); if (d.schedule) setSchedule(d.schedule) }}
            onNext={() => setStep(3)} onBack={() => setStep(1)} />}
          {step === 3 && <NameStep siteName={siteName} onChange={setSiteName} onSave={save} onBack={() => setStep(2)} saving={saving} />}
        </div>
      </div>
    </div>
  )
}
