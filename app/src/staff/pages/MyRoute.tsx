import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { ProgressRing } from '../../components/ui/ProgressRing'
import { StatusPill } from '../../components/ui/StatusPill'
import { useStaffAuth } from '../../contexts/StaffAuthContext'
import {
  assignmentProgress,
  effectiveStatus,
  formatClock,
  formatDuration,
  frequencyCountdown,
  getNextAssignment,
  onTimeRate,
  TASK_PRIORITY_LABELS,
} from '../../lib/domain'
import { repo } from '../../lib/repo'
import type { Area, Assignment, Issue } from '../../lib/types'
import { PhoneScreen } from '../PhoneScreen'

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function areaAbbrev(code: string) {
  return code.split('-')[1] ?? '??'
}

/** Small flag shown next to an area's name when it has an open issue reported against it. */
function IssueFlag() {
  return (
    <span title="Issue reported" className="inline-flex flex-shrink-0 text-overdue">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#B3261E" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 3v18M5 4h11l-2.5 4L16 12H5" />
      </svg>
    </span>
  )
}

/** Only shown for high/urgent tasks — low/medium priority is the default and doesn't need calling out. */
function PriorityBadge({ priority, dark = false }: { priority: Assignment['priority']; dark?: boolean }) {
  if (priority !== 'high' && priority !== 'urgent') return null
  return (
    <span
      className={`flex-shrink-0 rounded-full px-1.75 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
        priority === 'urgent' ? 'bg-overdue text-white' : dark ? 'bg-attention/20 text-attention' : 'bg-attention/15 text-attention'
      }`}
    >
      {TASK_PRIORITY_LABELS[priority]}
    </span>
  )
}

/** Shows the recurring-frequency countdown ("Due in 1h 20m") for areas on a schedule, resetting each time they're scanned. */
function FrequencyNote({
  area,
  now,
  dark = false,
}: {
  area: Area | undefined
  now: number
  dark?: boolean
}) {
  if (!area) return null
  const countdown = frequencyCountdown(area, now)
  if (!countdown) return null
  const toneClass = countdown.overdue ? 'text-overdue' : dark ? 'text-white/55' : 'text-muted'
  return (
    <span className={toneClass}>
      {' '}
      · {countdown.overdue ? 'overdue by ' : 'due in '}
      {formatDuration(Math.abs(countdown.remainingMs))}
    </span>
  )
}

export function MyRoute() {
  const { staff } = useStaffAuth()
  const navigate = useNavigate()
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [areas, setAreas] = useState<Area[]>([])
  const [issues, setIssues] = useState<Issue[]>([])
  const [branchName, setBranchName] = useState('')
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!staff) return
    let unsub: (() => void) | undefined
    function load() {
      Promise.all([
        repo.getMyAssignments(staff!.id),
        repo.listAreasForSite(staff!.siteId),
        repo.listIssuesForSite(staff!.siteId),
      ]).then(([a, ar, is]) => {
        setAssignments(a)
        setAreas(ar)
        setIssues(is)
        setLoading(false)
      })
    }
    load()
    repo.getBranch(staff.branchId).then((b) => setBranchName(b?.name ?? ''))
    unsub = repo.subscribe(staff.siteId, load)
    return () => unsub?.()
  }, [staff])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const areasById = useMemo(() => new Map(areas.map((a) => [a.id, a])), [areas])
  const openIssueAssignmentIds = useMemo(
    () => new Set(issues.filter((i) => i.status === 'open' && i.assignmentId).map((i) => i.assignmentId)),
    [issues],
  )

  if (!staff || loading) {
    return (
      <PhoneScreen className="items-center justify-center text-ink-soft">Loading…</PhoneScreen>
    )
  }

  const { done, total } = assignmentProgress(assignments)
  const remaining = total - done
  const next = getNextAssignment(assignments)
  const onTime = onTimeRate(assignments)
  const onShiftMs = staff.shiftStart ? Date.now() - new Date(staff.shiftStart).getTime() : 0
  const pending = assignments.filter((a) => effectiveStatus(a) !== 'done')
  const completed = assignments.filter((a) => effectiveStatus(a) === 'done')

  return (
    <PhoneScreen>
      <div className="px-[22px] pb-4 pt-15" style={{ paddingTop: 60 }}>
        <div className="flex items-start justify-between">
          <div>
            <div className="text-sm text-ink-soft">{greeting()}</div>
            <div className="mt-0.5 text-2xl font-extrabold tracking-tight">{staff.fullName}</div>
          </div>
          <div
            className="flex h-11 w-11 items-center justify-center rounded-full text-[15px] font-bold text-white"
            style={{ background: staff.colorHex }}
          >
            {staff.initials}
          </div>
        </div>
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1.5 text-xs font-semibold text-ink-soft">
          <span className="h-1.5 w-1.5 rounded-full bg-verified" />
          {staff.status === 'on_break' ? 'On break' : 'Day shift'}
          {staff.shiftEnd && <> · ends {formatClock(staff.shiftEnd)}</>}
          {branchName && <> · {branchName}</>}
        </div>
      </div>

      <div className="flex-1 overflow-auto px-[22px] pb-32">
        <div className="flex items-center gap-4.5 rounded-[18px] border border-line bg-white p-4.5">
          <ProgressRing done={done} total={total} />
          <div className="flex-1">
            <div className="text-[15px] font-bold">Areas cleaned today</div>
            <div className="mt-2.5 flex gap-4">
              <div>
                <div className="text-lg font-extrabold text-verified-ink">{onTime}%</div>
                <div className="text-[11px] text-muted">on time</div>
              </div>
              <div className="w-px bg-line-soft" />
              <div>
                <div className="text-lg font-extrabold">{formatDuration(onShiftMs)}</div>
                <div className="text-[11px] text-muted">on shift</div>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-3 mt-6 flex items-center justify-between px-1">
          <div className="text-base font-extrabold">My route</div>
          <div className="font-mono text-xs font-semibold text-muted">{remaining} LEFT</div>
        </div>

        <div className="flex flex-col gap-2.5">
          {pending.map((a) => {
            const status = effectiveStatus(a)
            const isNext = next?.id === a.id
            if (isNext) {
              return (
                <button
                  key={a.id}
                  onClick={() => navigate(`/staff/scan/${a.id}`)}
                  className="flex items-center gap-3.5 rounded-2xl bg-ink p-3.5 text-left shadow-[0_12px_26px_rgba(23,33,43,0.22)]"
                >
                  <div className="flex h-9.5 w-9.5 items-center justify-center rounded-[10px] bg-white/12">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                      <rect x="3" y="3" width="7" height="7" rx="1.5" />
                      <rect x="14" y="3" width="7" height="7" rx="1.5" />
                      <rect x="3" y="14" width="7" height="7" rx="1.5" />
                      <path d="M14 14h3v3M20 14v.01M20 20v-3M14 20h3" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[15px] font-bold text-white">
                      {a.areaName}
                      {openIssueAssignmentIds.has(a.id) && <IssueFlag />}
                      <PriorityBadge priority={a.priority} dark />
                    </div>
                    <div className="font-mono text-xs text-white/55">
                      {a.areaCode} · next up
                      <FrequencyNote area={areasById.get(a.areaId)} now={now} dark />
                    </div>
                  </div>
                  <StatusPill tone="ink">SCAN</StatusPill>
                </button>
              )
            }
            if (status === 'overdue') {
              return (
                <div
                  key={a.id}
                  className="flex items-center gap-3.5 rounded-[15px] border border-overdue-border bg-white p-3.5"
                >
                  <div className="flex h-9.5 w-9.5 items-center justify-center rounded-[10px] bg-overdue-tint text-overdue">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#B3261E" strokeWidth="2.4" strokeLinecap="round">
                      <path d="M12 7v6M12 16.5v.5" />
                      <circle cx="12" cy="12" r="9" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[15px] font-bold">
                      {a.areaName}
                      {openIssueAssignmentIds.has(a.id) && <IssueFlag />}
                      <PriorityBadge priority={a.priority} />
                    </div>
                    <div className="font-mono text-xs text-overdue">
                      {a.areaCode}
                      {areasById.get(a.areaId)?.frequencyMinutes ? (
                        <FrequencyNote area={areasById.get(a.areaId)} now={now} />
                      ) : (
                        ` · due ${formatClock(a.dueAt)}`
                      )}
                    </div>
                  </div>
                  <StatusPill tone="overdue">OVERDUE</StatusPill>
                </div>
              )
            }
            return (
              <div
                key={a.id}
                className="flex items-center gap-3.5 rounded-[15px] border border-line bg-white p-3.5"
              >
                <div className="flex h-9.5 w-9.5 items-center justify-center rounded-[10px] bg-line-soft font-mono text-[13px] font-semibold text-muted">
                  {areaAbbrev(a.areaCode)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[15px] font-bold">
                    {a.areaName}
                    {openIssueAssignmentIds.has(a.id) && <IssueFlag />}
                    <PriorityBadge priority={a.priority} />
                  </div>
                  <div className="font-mono text-xs text-muted">
                    {a.areaCode}
                    <FrequencyNote area={areasById.get(a.areaId)} now={now} />
                  </div>
                </div>
                <StatusPill tone="todo">TO DO</StatusPill>
              </div>
            )
          })}
          {pending.length === 0 && completed.length > 0 && (
            <div className="rounded-[15px] border border-dashed border-line bg-white/50 p-4 text-center text-[13px] font-semibold text-muted">
              All areas complete for this shift
            </div>
          )}
          {completed.length > 0 && (
            <>
              <div className="mt-2 flex items-center gap-2.5 px-1">
                <span className="flex-shrink-0 text-[10px] font-bold uppercase tracking-wide text-muted">
                  Completed · {completed.length}
                </span>
                <span className="h-px flex-1 bg-line-soft" />
              </div>
              {completed.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-3.5 rounded-[15px] border border-line bg-white p-3.5"
                >
                  <div className="flex h-9.5 w-9.5 items-center justify-center rounded-[10px] bg-verified-tint text-verified-ink">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1A5539" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[15px] font-bold">
                      {a.areaName}
                      {openIssueAssignmentIds.has(a.id) && <IssueFlag />}
                      <PriorityBadge priority={a.priority} />
                    </div>
                    <div className="font-mono text-xs text-muted">
                      {a.areaCode} · {formatClock(a.submittedAt)}
                    </div>
                  </div>
                  <StatusPill tone="verified">DONE</StatusPill>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      <div
        className="pointer-events-none fixed bottom-0 left-1/2 w-full max-w-[480px] -translate-x-1/2 px-[22px] pb-7 pt-3.5"
        style={{ background: 'linear-gradient(to top, var(--color-app) 62%, transparent)' }}
      >
        <Button
          fullWidth
          className="pointer-events-auto"
          disabled={!next}
          onClick={() => next && navigate(`/staff/scan/${next.id}`)}
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2" />
              <path d="M7 12h10" />
            </svg>
          }
        >
          {next ? 'Scan next area' : 'All areas complete'}
        </Button>
      </div>
    </PhoneScreen>
  )
}
