import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { canManageRoutes, computeNotifications, formatClock } from '../lib/domain'
import { repo } from '../lib/repo'
import type { AdminUser, Assignment, Issue, Staff } from '../lib/types'
import type { NotificationItem } from '../lib/domain'

const SEVERITY_DOT: Record<NotificationItem['severity'], string> = {
  critical: 'bg-overdue',
  warning: 'bg-attention',
  info: 'bg-info',
}

const KIND_DESTINATION: Record<NotificationItem['kind'], string> = {
  issue: '/admin/reports',
  overdue: '/admin/assignments',
  not_started: '/admin/overview',
}

export function NotificationBell({ admin }: { admin: AdminUser }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [issues, setIssues] = useState<Issue[]>([])
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function load() {
      Promise.all([
        repo.getSiteAssignments(admin.siteId),
        repo.listStaffForSite(admin.siteId),
        repo.listIssuesForSite(admin.siteId),
      ]).then(([a, s, i]) => {
        setAssignments(a)
        setStaff(s)
        setIssues(i)
      })
    }
    load()
    const unsub = repo.subscribe(admin.siteId, load)
    return unsub
  }, [admin.siteId])

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  const notifications = useMemo(
    () => computeNotifications(assignments, staff, issues, Date.now()),
    [assignments, staff, issues],
  )

  const canResolve = canManageRoutes(admin.role)

  async function resolve(item: NotificationItem) {
    if (!item.id.startsWith('issue-')) return
    const issueId = item.id.slice('issue-'.length)
    await repo.resolveIssue(issueId)
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9.5 w-9.5 flex-shrink-0 items-center justify-center rounded-[11px] border border-line bg-white text-ink-soft"
        title="Notifications"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0112 0c0 4.5 1.5 6 2 6.5H4c.5-.5 2-2 2-6.5z" />
          <path d="M10 18a2 2 0 004 0" />
        </svg>
        {notifications.length > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-overdue px-1 text-[10px] font-bold text-white">
            {notifications.length > 9 ? '9+' : notifications.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-11 z-50 w-80 overflow-hidden rounded-2xl border border-line bg-white shadow-[0_16px_40px_rgba(23,33,43,0.18)]">
          <div className="flex items-center justify-between border-b border-line px-3.5 py-3">
            <div className="text-sm font-extrabold">Notifications</div>
            <div className="font-mono text-xs font-semibold text-muted">{notifications.length} OPEN</div>
          </div>
          <div className="max-h-96 overflow-auto">
            {notifications.length === 0 && (
              <div className="px-3.5 py-6 text-center text-sm text-muted">All clear — nothing needs attention.</div>
            )}
            {notifications.map((item) => (
              <div key={item.id} className="flex items-start gap-2.5 border-b border-line-softer px-3.5 py-3 last:border-b-0">
                <span className={`mt-1.5 h-1.75 w-1.75 flex-shrink-0 rounded-full ${SEVERITY_DOT[item.severity]}`} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold leading-snug text-ink">{item.message}</div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="font-mono text-[11px] text-muted">{formatClock(item.timestamp)}</span>
                    <button
                      onClick={() => {
                        setOpen(false)
                        navigate(KIND_DESTINATION[item.kind])
                      }}
                      className="text-[11px] font-bold text-info-ink"
                    >
                      View →
                    </button>
                    {item.kind === 'issue' && canResolve && (
                      <button onClick={() => resolve(item)} className="text-[11px] font-bold text-verified-ink">
                        Resolve
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
