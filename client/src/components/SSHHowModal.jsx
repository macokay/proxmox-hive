import { useState } from 'react'

function CopyBlock({ label, text }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="space-y-1">
      {label && <div className="text-[10px] text-white/50 uppercase tracking-wider font-medium">{label}</div>}
      <div className="relative group">
        <pre className="bg-base-950 border border-border rounded-lg px-4 py-3 font-mono text-xs text-white/80 overflow-x-auto whitespace-pre-wrap">{text}</pre>
        <button onClick={copy}
          className={`absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded border transition-all ${
            copied ? 'bg-success/10 border-success/40 text-success' : 'bg-base-700 border-border text-muted opacity-0 group-hover:opacity-100 hover:text-white'
          }`}>
          {copied ? '✓ Copied' : '⎘ Copy'}
        </button>
      </div>
    </div>
  )
}

function Tab({ label, active, onClick }) {
  return (
    <button onClick={onClick}
      className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${active ? 'border-accent text-white' : 'border-transparent text-muted hover:text-white'}`}>
      {label}
    </button>
  )
}

export function SSHKeyHowModal({ onClose }) {
  const [tab, setTab] = useState('a')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(8,8,10,0.88)', backdropFilter: 'blur(8px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="slide-up w-full max-w-xl card border-border flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <h3 className="text-white font-semibold text-sm">How to set up SSH access</h3>
          <button onClick={onClose} className="text-muted hover:text-white transition-colors">✕</button>
        </div>

        <div className="flex border-b border-border flex-shrink-0 overflow-x-auto">
          <Tab label="Option A — Restricted user" active={tab === 'a'} onClick={() => setTab('a')} />
          <Tab label="Option B — Root" active={tab === 'b'} onClick={() => setTab('b')} />
          <Tab label="Option C — Password" active={tab === 'c'} onClick={() => setTab('c')} />
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4 font-sans">
          {tab === 'a' && (
            <>
              <p className="text-xs text-muted">Create a dedicated low-privilege user. All commands run on the <strong className="text-white">Proxmox host as root</strong> — open the Shell tab in Proxmox web UI or <code className="font-mono text-white/70">ssh root@PROXMOX-IP</code>.</p>

              <CopyBlock
                label="Step 1 — Create user + sudo access"
                text={`apt install sudo -y\nadduser pvedash --disabled-password --gecos ""\necho "pvedash ALL=(ALL) NOPASSWD: /usr/bin/apt*,/usr/sbin/pct" | tee /etc/sudoers.d/pvedash\nchmod 440 /etc/sudoers.d/pvedash`}
              />

              <CopyBlock
                label="Step 2 — Generate & install SSH key"
                text={`ssh-keygen -t ed25519 -f ~/.ssh/pvedash -N ""\nmkdir -p /home/pvedash/.ssh\ncat ~/.ssh/pvedash.pub >> /home/pvedash/.ssh/authorized_keys\nchmod 700 /home/pvedash/.ssh && chmod 600 /home/pvedash/.ssh/authorized_keys\nchown -R pvedash:pvedash /home/pvedash/.ssh\nssh -i ~/.ssh/pvedash -o BatchMode=yes pvedash@localhost echo "Login OK"`}
              />

              <CopyBlock
                label="Step 3 — Get private key (copy output → paste in field)"
                text="cat ~/.ssh/pvedash"
              />

              <div className="p-3 rounded-lg bg-base-800 border border-border text-[10px] text-muted space-y-1">
                <div>→ Username: <span className="font-mono text-white">pvedash</span></div>
                <div>→ <span className="text-yellow-400 font-semibold">-N ""</span> = no passphrase — required, passphrases are not supported</div>
                <div>→ Paste the <span className="text-white">private key</span> (<span className="font-mono">~/.ssh/pvedash</span>), not the <span className="font-mono">.pub</span> file</div>
              </div>
            </>
          )}

          {tab === 'b' && (
            <>
              <p className="text-xs text-muted">Use the existing root user — no extra user needed. All commands run on the <strong className="text-white">Proxmox host as root</strong>.</p>

              <CopyBlock
                label="Step 1 — Allow root SSH key login"
                text={`sed -i 's/^#*PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config\nsystemctl reload sshd`}
              />

              <CopyBlock
                label="Step 2 — Generate & install SSH key"
                text={`ssh-keygen -t ed25519 -f ~/.ssh/pvedash -N ""\ncat ~/.ssh/pvedash.pub >> ~/.ssh/authorized_keys\nchmod 600 ~/.ssh/authorized_keys\nssh -i ~/.ssh/pvedash -o BatchMode=yes root@localhost echo "Login OK"`}
              />

              <CopyBlock
                label="Step 3 — Get private key (copy output → paste in field)"
                text="cat ~/.ssh/pvedash"
              />

              <div className="p-3 rounded-lg bg-base-800 border border-border text-[10px] text-muted space-y-1">
                <div>→ Username: <span className="font-mono text-white">root</span></div>
                <div>→ <span className="text-yellow-400 font-semibold">-N ""</span> = no passphrase — required</div>
                <div>→ Paste the <span className="text-white">private key</span> (<span className="font-mono">~/.ssh/pvedash</span>), not the <span className="font-mono">.pub</span> file</div>
              </div>
            </>
          )}

          {tab === 'c' && (
            <>
              <p className="text-xs text-muted">Use password authentication instead of SSH keys. Less secure — SSH keys are preferred. Commands run on the <strong className="text-white">Proxmox host as root</strong>.</p>

              <CopyBlock
                label="Step 1 — Create user with password"
                text={`apt install sudo -y\nadduser pvedash --gecos ""\necho "pvedash ALL=(ALL) NOPASSWD: /usr/bin/apt*,/usr/sbin/pct" | tee /etc/sudoers.d/pvedash\nchmod 440 /etc/sudoers.d/pvedash\npasswd pvedash`}
              />

              <CopyBlock
                label="Step 2 — Enable password authentication"
                text={`sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config\nsystemctl reload sshd`}
              />

              <div className="p-3 rounded-lg bg-warning/5 border border-warning/20 text-[10px] text-warning/70 space-y-1">
                <div>→ Username: <span className="font-mono text-white">pvedash</span></div>
                <div>→ Select <span className="text-white">Password</span> in the auth toggle and enter the password set with <span className="font-mono">passwd</span></div>
                <div>⚠ Password auth is less secure — switch to SSH keys when possible</div>
              </div>
            </>
          )}
        </div>

        <div className="px-5 py-4 border-t border-border flex-shrink-0">
          <button onClick={onClose} className="btn-primary w-full justify-center">Got it</button>
        </div>
      </div>
    </div>
  )
}

export function SSHHowButton({ className = '' }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`text-xs text-accent/70 hover:text-accent underline transition-colors ${className}`}>
        How?
      </button>
      {open && <SSHKeyHowModal onClose={() => setOpen(false)} />}
    </>
  )
}
