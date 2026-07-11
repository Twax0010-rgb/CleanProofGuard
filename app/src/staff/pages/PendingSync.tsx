import { useEffect, useState, useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { formatClock } from '../../lib/domain'
import { getOutbox, isSyncing, onOutboxChange, syncOutbox } from '../outbox'
import { PhoneScreen } from '../PhoneScreen'

/** Queued proof submissions waiting for a connection, with a manual "Sync now". */
export function PendingSync() {
  const navigate = useNavigate()
  const outbox = useSyncExternalStore(onOutboxChange, getOutbox)
  const syncing = useSyncExternalStore(onOutboxChange, isSyncing)
  const [online, setOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])

  return (
    <PhoneScreen>
      <div className="border-b border-line-soft bg-white px-[22px] pb-4" style={{ paddingTop: 58 }}>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/staff')}
            className="flex h-9.5 w-9.5 items-center justify-center rounded-full bg-app"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1D231F" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
          <div className="flex-1">
            <div className="text-lg font-extrabold tracking-tight">Pending sync</div>
            <div className="mt-0.5 font-mono text-xs text-muted">
              {online ? 'Connected' : 'Offline — will sync when back online'}
            </div>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${
              online ? 'bg-verified-tint text-verified-ink' : 'bg-attention/15 text-attention'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${online ? 'bg-verified' : 'bg-attention'}`} />
            {online ? 'ONLINE' : 'OFFLINE'}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-[22px] pb-32 pt-4.5">
        {outbox.length === 0 ? (
          <div className="mt-16 flex flex-col items-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-verified-tint text-verified-ink">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <div className="text-[15px] font-extrabold">All synced</div>
            <p className="max-w-[240px] text-[13px] text-muted">
              Nothing is waiting — every completed task has reached the server.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {outbox.map((item) => (
              <div key={item.id} className="rounded-[15px] border border-line bg-white p-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex h-9.5 w-9.5 flex-shrink-0 items-center justify-center rounded-[10px] bg-attention/15 text-attention">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 12a9 9 0 11-2.6-6.3M21 4v5h-5" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-bold">{item.areaName}</div>
                    <div className="font-mono text-xs text-muted">
                      {item.areaCode} · queued {formatClock(item.queuedAt)}
                      {item.photos.length > 0 &&
                        ` · ${item.photos.length} photo${item.photos.length === 1 ? '' : 's'}`}
                    </div>
                  </div>
                  <span className="rounded-full bg-attention/15 px-2.5 py-1 text-[11px] font-bold text-attention">
                    PENDING
                  </span>
                </div>
                {item.lastError && (
                  <div className="mt-2 rounded-lg bg-overdue-tint px-3 py-2 text-xs font-medium text-overdue">
                    Last attempt: {item.lastError}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {outbox.length > 0 && (
        <div
          className="pointer-events-none fixed bottom-0 left-1/2 w-full max-w-[480px] -translate-x-1/2 px-[22px] pb-7 pt-3.5"
          style={{ background: 'linear-gradient(to top, var(--color-app) 62%, transparent)' }}
        >
          <Button
            fullWidth
            className="pointer-events-auto"
            disabled={syncing || !online}
            onClick={() => void syncOutbox()}
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 11-2.6-6.3M21 4v5h-5" />
              </svg>
            }
          >
            {syncing ? 'Syncing…' : online ? 'Sync now' : 'Waiting for connection'}
          </Button>
        </div>
      )}
    </PhoneScreen>
  )
}
