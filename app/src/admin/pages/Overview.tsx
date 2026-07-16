import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar } from '../../components/ui/Avatar'
import { DateRangePicker } from '../../components/ui/DateRangePicker'
import { StatusPill } from '../../components/ui/StatusPill'
import { useAdminAuth } from '../../contexts/AdminAuthContext'
import { inActiveBranch, useBranch } from '../../contexts/BranchContext'
import { activeStaff, canManageRoutes, computeSiteKpis, deriveActivity, formatClock, formatDuration } from '../../lib/domain'
import { repo } from '../../lib/repo'
import { filterAssignmentsInRange, filterIssuesInRange, formatDateRangeLabel, isoInRange, resolveDateRange } from '../../lib/reports'
import type { DateRange } from '../../lib/reports'
import { deriveTransitPeriods, formatTransit, idleNow, TRANSIT_THRESHOLD_MS } from '../../lib/transit'
import type { Assignment, Issue, Staff } from '../../lib/types'
import { AdminLayout } from '../AdminLayout'

export function Overview() {
  const { admin } = useAdminAuth()
  const { activeBranchId, activeBranch } = useBranch()
  const navigate = useNavigate()
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [issues, setIssues] = useState<Issue[]>([])
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState<DateRange>(() => resolveDateRange('today'))
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!admin) return
    function load() {
      Promise.all([
        repo.getSiteAssignments(admin!.siteId),
        repo.listStaffForSite(admin!.siteId),
        repo.listIssuesForSite(admin!.siteId),
      ]).then(([a, s, i]) => {
        setAssignments(a)
        setStaff(s)
        setIssues(i)
        setLoading(false)
      })
    }
    load()
    const unsub = repo.subscribe(admin.siteId, load)
    return unsub
  }, [admin])

  const branchAssignments = useMemo(() => assignments.filter((a) => inActiveBranch(a.branchId, activeBranchId)), [assignments, activeBranchId])
  const branchStaff = useMemo(() => staff.filter((s) => inActiveBranch(s.branchId, activeBranchId)), [staff, activeBranchId])
  const branchIssues = useMemo(() => issues.filter((i) => inActiveBranch(i.branchId, activeBranchId)), [issues, activeBranchId])
  const rangeAssignments = useMemo(() => filterAssignmentsInRange(branchAssignments, range), [branchAssignments, range])
  const rangeIssues = useMemo(() => filterIssuesInRange(branchIssues, range), [branchIssues, range])

  // Derived from every assignment, not the range-filtered set: a gap is measured between two cleans,
  // and slicing the list first would drop the clean on the far side of the boundary and invent a gap
  // that doesn't exist. The range is applied to the finished periods afterwards instead.
  const transitPeriods = useMemo(() => deriveTransitPeriods(branchAssignments, branchStaff), [branchAssignments, branchStaff])
  const idle = useMemo(() => idleNow(transitPeriods), [transitPeriods])
  const rangeTransit = useMemo(
    () => transitPeriods.filter((p) => !p.open && isoInRange(p.startedAt, range)),
    [transitPeriods, range],
  )
  const transitTotalMs = useMemo(() => rangeTransit.reduce((sum, p) => sum + p.durationMs, 0), [rangeTransit])
  /** What a supervisor could actually hand an idle cleaner right now. */
  const unassignedCount = useMemo(
    () => branchAssignments.filter((a) => !a.staffId && a.status !== 'done').length,
    [branchAssignments],
  )
  const staffById = useMemo(() => new Map(branchStaff.map((s) => [s.id, s])), [branchStaff])
  const kpis = useMemo(() => computeSiteKpis(rangeAssignments, branchStaff, rangeIssues), [rangeAssignments, branchStaff, rangeIssues])
  const query = search.trim().toLowerCase()
  const allActivity = useMemo(
    () => deriveActivity(rangeAssignments, staffById, Date.now(), rangeIssues),
    [rangeAssignments, staffById, rangeIssues],
  )
  const activity = useMemo(() => {
    const matched = query
      ? allActivity.filter(
          (e) =>
            e.areaName.toLowerCase().includes(query) ||
            e.areaCode.toLowerCase().includes(query) ||
            (e.staffName?.toLowerCase().includes(query) ?? false),
        )
      : allActivity
    return matched.slice(0, query ? 20 : 8)
  }, [allActivity, query])
  const onShiftStaff = activeStaff(branchStaff)
    .filter((s) => s.status !== 'off_shift')
    .filter((s) => !query || s.fullName.toLowerCase().includes(query))
  const isToday = range.preset === 'today'

  if (!admin || loading) {
    return (
      <AdminLayout>
        <div className="flex flex-1 items-center justify-center text-ink-soft">Loading…</div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div className="flex h-16 flex-shrink-0 items-center gap-4 border-b border-line bg-white px-6">
        <div className="flex items-center gap-2 text-[15px] font-extrabold">
          {activeBranch ? activeBranch.name : 'All branches'}
        </div>
        <div className="h-5.5 w-px bg-line" />
        <div className="text-sm text-ink-soft">{formatDateRangeLabel(range)}</div>
        <div className="flex-1" />
        <DateRangePicker value={range} onChange={setRange} />
        <div className="flex h-9.5 w-56 items-center gap-2.25 rounded-[11px] border border-line bg-app px-3.25 text-muted focus-within:border-stroke-soft">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#808B81" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" strokeLinecap="round" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search area or staff"
            className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-muted"
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="text-muted hover:text-ink">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          )}
        </div>
        {canManageRoutes(admin.role) && (
          <button
            onClick={() => navigate('/admin/assignments')}
            className="flex h-9.5 items-center gap-2 rounded-[11px] bg-verified px-4 text-sm font-bold text-white"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Assign work
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="mb-4.5 flex items-center gap-3">
          <h2 className="font-display text-[26px] font-bold uppercase leading-none tracking-[0.01em]">
            {isToday ? "Today's overview" : 'Overview'}
          </h2>
          {isToday && (
            <StatusPill tone="verified" dot className="animate-cpg-blink-soft">
              Live
            </StatusPill>
          )}
        </div>

        <div className="grid grid-cols-5 divide-x divide-line rounded-2xl border border-line bg-white">
          <div className="p-4.5">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Areas cleaned</div>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className="font-display text-[38px] font-bold leading-none">{kpis.cleaned}</span>
              <span className="font-mono text-[13px] font-semibold text-muted">/{kpis.total}</span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line-soft">
              <div
                className="h-full bg-verified"
                style={{ width: `${kpis.total > 0 ? (kpis.cleaned / kpis.total) * 100 : 0}%` }}
              />
            </div>
          </div>
          <div className="p-4.5">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">On-time rate</div>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className="font-display text-[38px] font-bold leading-none text-verified-ink">{kpis.onTimeRate}%</span>
            </div>
            <div className="mt-3 text-xs font-semibold text-ink-soft">
              Across {isToday ? "today's" : 'the selected range\'s'} completed areas
            </div>
          </div>
          <div className="p-4.5">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Staff on shift</div>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className="font-display text-[38px] font-bold leading-none">{kpis.staffOnShift}</span>
              <span className="font-mono text-[13px] font-semibold text-muted">/{kpis.staffTotal}</span>
            </div>
            <div className="mt-3 flex">
              {onShiftStaff.slice(0, 3).map((s, i) => (
                <div key={s.id} style={{ marginLeft: i === 0 ? 0 : -8 }}>
                  <Avatar initials={s.initials} colorHex={s.colorHex} size={26} ring />
                </div>
              ))}
              {onShiftStaff.length > 3 && (
                <div
                  className="flex h-6.5 w-6.5 items-center justify-center rounded-full border-2 border-white bg-line-soft text-[10px] font-bold text-ink-soft"
                  style={{ marginLeft: -8 }}
                >
                  +{onShiftStaff.length - 3}
                </div>
              )}
            </div>
          </div>
          <div className="p-4.5">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-overdue">Overdue areas</div>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className="font-display text-[38px] font-bold leading-none text-overdue">{kpis.overdueCount}</span>
            </div>
            <button
              onClick={() => navigate('/admin/assignments')}
              className="mt-3 text-xs font-semibold text-overdue"
            >
              Needs reassignment →
            </button>
          </div>
          <div className="p-4.5">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-overdue">Open issues</div>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className="font-display text-[38px] font-bold leading-none text-overdue">{kpis.openIssueCount}</span>
            </div>
            <button onClick={() => navigate('/admin/reports')} className="mt-3 text-xs font-semibold text-overdue">
              Review issues →
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-[1.5fr_1fr] gap-4">
          <div className="rounded-2xl border border-line bg-white p-4.5">
            <div className="mb-3.5 flex items-center justify-between">
              <div className="text-base font-extrabold">Live activity</div>
              <div className="font-mono text-xs font-semibold text-muted">RECENT</div>
            </div>
            <div className="flex flex-col">
              {activity.length === 0 && (
                <div className="py-6 text-center text-sm text-muted">
                  {query ? `No activity matches “${search.trim()}”.` : 'Nothing to show yet.'}
                </div>
              )}
              {activity.map((event, i) => (
                <div
                  key={event.id}
                  className={`flex items-center gap-3.25 py-2.75 ${i < activity.length - 1 ? 'border-b border-line-softer' : ''}`}
                >
                  {event.kind === 'overdue' || event.kind === 'issue' ? (
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-overdue-tint text-overdue">
                      {event.kind === 'overdue' ? (
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#B3261E" strokeWidth="2.2" strokeLinecap="round">
                          <path d="M12 8v5M12 16v.5" />
                          <circle cx="12" cy="12" r="9" />
                        </svg>
                      ) : (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#B3261E" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 3v18M5 4h11l-2.5 4L16 12H5" />
                        </svg>
                      )}
                    </div>
                  ) : (
                    <Avatar initials={event.staffInitials ?? '—'} colorHex={event.staffColorHex ?? '#808B81'} size={36} />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold">
                      {event.staffName ?? event.areaName}{' '}
                      <span className="font-medium text-ink-soft">
                        {event.kind === 'verified'
                          ? 'verified'
                          : event.kind === 'started'
                            ? 'started'
                            : event.kind === 'issue'
                              ? 'reported an issue at'
                              : 'missed window'}
                        {event.staffName ? ` ${event.areaName}` : ''}
                      </span>
                    </div>
                    <div className={`font-mono text-xs ${event.kind === 'overdue' || event.kind === 'issue' ? 'text-overdue' : 'text-muted'}`}>
                      {event.areaCode} · {event.detail}
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <StatusPill
                      tone={event.kind === 'verified' ? 'verified' : event.kind === 'started' ? 'info' : 'overdue'}
                    >
                      {event.kind === 'verified'
                        ? 'VERIFIED'
                        : event.kind === 'started'
                          ? 'SCANNING'
                          : event.kind === 'issue'
                            ? 'ISSUE'
                            : 'OVERDUE'}
                    </StatusPill>
                    <div className="mt-1 font-mono text-[11px] text-muted">{formatClock(event.timestamp)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-white p-4.5">
            <div className="mb-3.5 text-base font-extrabold">Staff on shift</div>
            <div className="flex flex-col gap-3.5">
              {onShiftStaff.length === 0 && (
                <div className="py-6 text-center text-sm text-muted">
                  {query ? `No staff on shift matches “${search.trim()}”.` : 'Nobody is on shift right now.'}
                </div>
              )}
              {onShiftStaff.map((s) => {
                const mine = rangeAssignments.filter((a) => a.staffId === s.id)
                const total = mine.length
                const done = mine.filter((a) => a.status === 'done').length
                return (
                  <div key={s.id}>
                    <div className="mb-1.75 flex items-center gap-2.75">
                      <Avatar initials={s.initials} colorHex={s.colorHex} size={30} />
                      <div className="flex-1 text-[13px] font-bold">
                        {s.fullName}
                        {s.status === 'on_break' && <span className="ml-1 text-[11px] font-medium text-attention">· on break</span>}
                      </div>
                      <span className="text-[11px] font-semibold text-verified-ink">
                        {done}/{total}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-line-soft">
                      <div
                        className="h-full"
                        style={{
                          width: `${total > 0 ? (done / total) * 100 : 0}%`,
                          background: s.status === 'on_break' ? '#B27A0F' : s.colorHex,
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-white p-4.5">
            <div className="mb-1 flex items-center justify-between">
              <div className="text-base font-extrabold">Between areas</div>
              {idle.length > 0 && (
                <span className="font-mono text-[11px] font-semibold text-attention">
                  {idle.length} OVER {formatDuration(TRANSIT_THRESHOLD_MS)}
                </span>
              )}
            </div>
            <p className="mb-3 text-[11px] leading-tight text-muted">
              Time between finishing one clean and scanning into the next.
            </p>

            <div className="flex flex-col gap-3">
              {idle.length === 0 ? (
                <div className="py-4 text-center text-sm text-muted">
                  Nobody has been waiting more than {formatDuration(TRANSIT_THRESHOLD_MS)}.
                </div>
              ) : (
                idle.map((p) => (
                  <div key={p.id} className="flex items-center gap-2.75">
                    <Avatar initials={p.staffInitials} colorHex={p.staffColorHex} size={30} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-bold">{p.staffName}</div>
                      <div className="truncate text-[11px] text-muted">since {p.fromAreaName}</div>
                    </div>
                    <span className="flex-shrink-0 font-mono text-[11px] font-semibold text-attention">
                      {formatTransit(p.durationMs)}
                    </span>
                  </div>
                ))
              )}
            </div>

            {idle.length > 0 && unassignedCount > 0 && canManageRoutes(admin.role) && (
              <button
                onClick={() => navigate('/admin/assignments')}
                className="mt-3.5 w-full rounded-xl bg-app py-2 text-xs font-bold text-ink-soft"
              >
                {unassignedCount} unassigned {unassignedCount === 1 ? 'job' : 'jobs'} to hand out →
              </button>
            )}

            <div className="mt-3.5 border-t border-line-softer pt-2.5 text-[11px] text-muted">
              {rangeTransit.length === 0
                ? 'No completed gaps in this range.'
                : `${formatDuration(transitTotalMs)} across ${rangeTransit.length} ${rangeTransit.length === 1 ? 'gap' : 'gaps'} · longest ${formatDuration(Math.max(...rangeTransit.map((p) => p.durationMs)))}`}
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
