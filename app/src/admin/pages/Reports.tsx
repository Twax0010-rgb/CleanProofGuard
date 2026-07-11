import { useEffect, useMemo, useState } from 'react'
import { useAdminAuth } from '../../contexts/AdminAuthContext'
import { inActiveBranch, useBranch } from '../../contexts/BranchContext'
import { AUDIT_ACTION_LABELS, canManageRoutes, categorySlugLabel, effectiveStatus, formatClock, formatDuration, ISSUE_SEVERITY_LABELS } from '../../lib/domain'
import { repo } from '../../lib/repo'
import type { Area, Assignment, AuditLogEntry, Issue, Staff } from '../../lib/types'
import { AdminLayout } from '../AdminLayout'
import { ReportBuilderPanel } from '../ReportBuilderPanel'

type Tab = 'summary' | 'builder'

export function Reports() {
  const { admin } = useAdminAuth()
  const { activeBranchId, activeBranch } = useBranch()
  const [tab, setTab] = useState<Tab>('summary')
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [areas, setAreas] = useState<Area[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [issues, setIssues] = useState<Issue[]>([])
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!admin) return
    function load() {
      Promise.all([
        repo.getSiteAssignments(admin!.siteId),
        repo.listAreasForSite(admin!.siteId),
        repo.listStaffForSite(admin!.siteId),
        repo.listIssuesForSite(admin!.siteId),
        repo.listAuditLogForSite(admin!.siteId),
      ]).then(([a, ar, s, i, log]) => {
        setAssignments(a)
        setAreas(ar)
        setStaff(s)
        setIssues(i)
        setAuditLog(log)
        setLoading(false)
      })
    }
    load()
    const unsub = repo.subscribe(admin.siteId, load)
    return unsub
  }, [admin])

  const canResolve = admin ? canManageRoutes(admin.role) : false

  // Everything on this page is scoped to the active branch (or all allowed branches).
  const bAssignments = useMemo(() => assignments.filter((a) => inActiveBranch(a.branchId, activeBranchId)), [assignments, activeBranchId])
  const bAreas = useMemo(() => areas.filter((a) => inActiveBranch(a.branchId, activeBranchId)), [areas, activeBranchId])
  const bStaff = useMemo(() => staff.filter((s) => inActiveBranch(s.branchId, activeBranchId)), [staff, activeBranchId])
  const bIssues = useMemo(() => issues.filter((i) => inActiveBranch(i.branchId, activeBranchId)), [issues, activeBranchId])

  const openIssues = useMemo(
    () => bIssues.filter((i) => i.status === 'open').sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [bIssues],
  )

  async function resolve(issueId: string) {
    await repo.resolveIssue(issueId)
  }

  const areasById = useMemo(() => new Map(bAreas.map((a) => [a.id, a])), [bAreas])

  const byCategory = useMemo(() => {
    const groups = new Map<string, { total: number; done: number; overdue: number }>()
    for (const a of bAssignments) {
      const category = areasById.get(a.areaId)?.category ?? 'other'
      const bucket = groups.get(category) ?? { total: 0, done: 0, overdue: 0 }
      bucket.total += 1
      if (a.status === 'done') bucket.done += 1
      if (effectiveStatus(a) === 'overdue') bucket.overdue += 1
      groups.set(category, bucket)
    }
    return [...groups.entries()].sort(([, a], [, b]) => b.total - a.total)
  }, [bAssignments, areasById])

  const byStaff = useMemo(() => {
    return bStaff
      .map((s) => {
        const mine = bAssignments.filter((a) => a.staffId === s.id)
        const done = mine.filter((a) => a.status === 'done').length
        const overdue = mine.filter((a) => effectiveStatus(a) === 'overdue').length
        return { staff: s, total: mine.length, done, overdue }
      })
      .filter((row) => row.total > 0)
      .sort((a, b) => b.total - a.total)
  }, [bAssignments, bStaff])

  const overdueLog = useMemo(
    () =>
      bAssignments
        .filter((a) => effectiveStatus(a) === 'overdue')
        .sort((a, b) => new Date(a.dueAt ?? 0).getTime() - new Date(b.dueAt ?? 0).getTime()),
    [bAssignments],
  )

  if (!admin || loading) {
    return (
      <AdminLayout>
        <div className="flex flex-1 items-center justify-center text-ink-soft">Loading…</div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div className="flex h-16 flex-shrink-0 items-center gap-3.5 border-b border-line bg-white px-6">
        <h2 className="font-display text-[24px] font-bold uppercase leading-none tracking-[0.01em]">Reports</h2>
        <span className="text-sm text-muted">{activeBranch ? activeBranch.name : 'All branches'}</span>
        <div className="ml-2 flex gap-1 rounded-[11px] bg-app p-1">
          <button
            onClick={() => setTab('summary')}
            className={`rounded-lg px-3 py-1.5 text-sm font-bold ${tab === 'summary' ? 'bg-white shadow-sm' : 'text-ink-soft'}`}
          >
            Summary
          </button>
          <button
            onClick={() => setTab('builder')}
            className={`rounded-lg px-3 py-1.5 text-sm font-bold ${tab === 'builder' ? 'bg-white shadow-sm' : 'text-ink-soft'}`}
          >
            Report builder
          </button>
        </div>
      </div>

      {tab === 'builder' ? (
        <div className="flex-1 overflow-auto p-6">
          <ReportBuilderPanel admin={admin} assignments={bAssignments} areas={bAreas} staff={bStaff} issues={bIssues} auditLog={auditLog} />
        </div>
      ) : (
      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-2xl border border-line bg-white p-4.5">
            <div className="mb-3 text-base font-extrabold">By category</div>
            <div className="flex flex-col gap-2.5">
              {byCategory.map(([category, stats]) => (
                <div key={category} className="flex items-center gap-3">
                  <div className="w-28 flex-shrink-0 text-sm font-semibold">{categorySlugLabel(category)}</div>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-line-soft">
                    <div
                      className="h-full bg-verified"
                      style={{ width: `${stats.total > 0 ? (stats.done / stats.total) * 100 : 0}%` }}
                    />
                  </div>
                  <div className="w-16 flex-shrink-0 text-right text-xs text-ink-soft">
                    {stats.done}/{stats.total}
                  </div>
                  {stats.overdue > 0 && (
                    <span className="flex-shrink-0 text-xs font-bold text-overdue">{stats.overdue} overdue</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-white p-4.5">
            <div className="mb-3 text-base font-extrabold">By staff</div>
            <div className="flex flex-col gap-2.5">
              {byStaff.map(({ staff: s, total, done, overdue }) => (
                <div key={s.id} className="flex items-center gap-3">
                  <div className="w-28 flex-shrink-0 truncate text-sm font-semibold">{s.fullName}</div>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-line-soft">
                    <div className="h-full" style={{ width: `${total > 0 ? (done / total) * 100 : 0}%`, background: s.colorHex }} />
                  </div>
                  <div className="w-16 flex-shrink-0 text-right text-xs text-ink-soft">
                    {done}/{total}
                  </div>
                  {overdue > 0 && <span className="flex-shrink-0 text-xs font-bold text-overdue">{overdue} overdue</span>}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-overdue-border bg-white p-4.5">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-base font-extrabold">Open issues</div>
            {openIssues.length > 0 && (
              <span className="font-mono text-xs font-semibold text-overdue">{openIssues.length} OPEN</span>
            )}
          </div>
          {openIssues.length === 0 ? (
            <div className="py-4 text-center text-sm text-muted">No open issues right now.</div>
          ) : (
            <div className="flex flex-col">
              {openIssues.map((issue, i) => (
                <div
                  key={issue.id}
                  className={`flex items-center gap-3 py-2.75 ${i < openIssues.length - 1 ? 'border-b border-line-softer' : ''}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold">
                      {issue.areaName}{' '}
                      <span className="font-mono text-xs font-normal text-muted">{issue.areaCode}</span>
                    </div>
                    <div className="text-xs text-ink-soft">
                      {issue.staffName ?? 'Unknown staff'} · {ISSUE_SEVERITY_LABELS[issue.severity]} severity ·{' '}
                      {issue.description}
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <div className="font-mono text-[11px] text-muted">{formatClock(issue.createdAt)}</div>
                    {canResolve && (
                      <button onClick={() => resolve(issue.id)} className="mt-1 text-xs font-bold text-verified-ink">
                        Resolve
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 rounded-2xl border border-line bg-white p-4.5">
          <div className="mb-3 text-base font-extrabold">Overdue log</div>
          {overdueLog.length === 0 ? (
            <div className="py-4 text-center text-sm text-muted">Nothing overdue right now.</div>
          ) : (
            <div className="flex flex-col">
              {overdueLog.map((a, i) => (
                <div
                  key={a.id}
                  className={`flex items-center gap-3 py-2.5 ${i < overdueLog.length - 1 ? 'border-b border-line-softer' : ''}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold">{a.areaName}</div>
                    <div className="font-mono text-xs text-muted">{a.areaCode}</div>
                  </div>
                  <div className="text-xs text-overdue">
                    due {formatClock(a.dueAt)} · +{formatDuration(Date.now() - new Date(a.dueAt ?? 0).getTime())}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 rounded-2xl border border-line bg-white p-4.5">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-base font-extrabold">Admin activity log</div>
            <span className="text-xs text-muted">Who did what, for accountability</span>
          </div>
          {auditLog.length === 0 ? (
            <div className="py-4 text-center text-sm text-muted">No admin actions recorded yet.</div>
          ) : (
            <div className="flex flex-col">
              {auditLog.slice(0, 20).map((entry, i) => (
                <div
                  key={entry.id}
                  className={`flex items-center gap-3 py-2.5 ${i < Math.min(auditLog.length, 20) - 1 ? 'border-b border-line-softer' : ''}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">
                      <span className="font-bold">{entry.actorName}</span>{' '}
                      <span className="text-ink-soft">{AUDIT_ACTION_LABELS[entry.action].toLowerCase()}</span>{' '}
                      <span className="font-semibold">{entry.targetLabel}</span>
                    </div>
                    {entry.detail && <div className="text-xs text-muted">{entry.detail}</div>}
                  </div>
                  <div className="flex-shrink-0 font-mono text-[11px] text-muted">{formatClock(entry.createdAt)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-muted">
          Reflects today's assignments only — multi-day trend history will build up as the app is
          used over time.
        </p>
      </div>
      )}
    </AdminLayout>
  )
}
