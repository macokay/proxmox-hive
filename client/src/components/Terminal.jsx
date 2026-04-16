import { useEffect, useRef } from 'react'

export default function Terminal({ logs, target, onClose, done, success }) {
  const bottomRef = useRef(null)
  const containerRef = useRef(null)
  const userScrolledUp = useRef(false)

  const handleScroll = () => {
    const el = containerRef.current
    if (!el) return
    userScrolledUp.current = el.scrollHeight - el.scrollTop - el.clientHeight > 50
  }

  useEffect(() => {
    if (!userScrolledUp.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs])

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6"
      style={{ background: 'rgba(8,8,10,0.85)', backdropFilter: 'blur(6px)' }}
      onClick={e => e.target === e.currentTarget && done && onClose()}>
      <div className="slide-up w-full sm:max-w-3xl card border-border flex flex-col" style={{ height: 'min(90vh, 560px)' }}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border flex-shrink-0">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-danger/70" />
            <div className="w-3 h-3 rounded-full bg-warning/70" />
            <div className="w-3 h-3 rounded-full bg-success/70" />
          </div>
          <div className="flex-1 text-center">
            <span className="font-mono text-xs text-muted">{target || 'Terminal'}</span>
          </div>
          <div className="flex items-center gap-2">
            {!done && <span className="pulse-dot w-2 h-2 rounded-full bg-accent block" />}
            {done && !success && <span className="text-xs font-medium text-danger">Error</span>}
            {done && success && <img src="/check.svg" className="w-5 h-5" alt="Done" />}
            {done && <button onClick={onClose} className="text-muted hover:text-white transition-colors text-sm px-2">Close</button>}
          </div>
        </div>
        <div ref={containerRef} onScroll={handleScroll} className="terminal flex-1 overflow-y-auto p-4">
          {logs.length === 0 && <span className="text-muted">Starting...</span>}
          {logs.map((entry, i) => (
            <span key={i} className={entry.type === 'stderr' ? 'stderr' : ''}>{entry.text}</span>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  )
}
