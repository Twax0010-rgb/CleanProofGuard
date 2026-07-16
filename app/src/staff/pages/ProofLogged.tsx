import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { useStaffAuth } from '../../contexts/StaffAuthContext'
import { formatClock, formatDuration, getNextAssignment, taskProgress } from '../../lib/domain'
import { repo } from '../../lib/repo'
import type { Assignment } from '../../lib/types'
import { PhoneScreen } from '../PhoneScreen'

export function ProofLogged() {
  const { assignmentId = '' } = useParams()
  const { staff } = useStaffAuth()
  const navigate = useNavigate()
  const [assignment, setAssignment] = useState<Assignment | null>(null)
  const [branchName, setBranchName] = useState<string | null>(null)
  const [next, setNext] = useState<Assignment | null>(null)

  useEffect(() => {
    if (!staff) return
    repo.getAssignment(assignmentId).then(setAssignment)
    repo.getBranch(staff.branchId).then((b) => setBranchName(b?.name ?? null))
    repo.getMyAssignments(staff.id).then((all) => setNext(getNextAssignment(all)))
  }, [assignmentId, staff])

  if (!assignment || !staff) {
    return <PhoneScreen className="items-center justify-center text-ink-soft">Loading…</PhoneScreen>
  }

  const { done, total } = taskProgress(assignment.tasks)
  const durationMs =
    assignment.startedAt && assignment.submittedAt
      ? new Date(assignment.submittedAt).getTime() - new Date(assignment.startedAt).getTime()
      : 0

  // When the only remaining work is the freshly-regenerated future cycle of the area that was
  // just cleaned, "Next up: <same room>" reads like a mistake. Treat it as "all caught up"
  // instead — the room will come back around on the route when its countdown runs down.
  const nextIsFutureCycleOfSameArea =
    !!next &&
    next.areaId === assignment.areaId &&
    !!next.dueAt &&
    new Date(next.dueAt).getTime() > Date.now()
  const actionableNext = nextIsFutureCycleOfSameArea ? null : next

  return (
    <PhoneScreen className="relative">
      <div className="flex flex-col items-center px-6 pt-[72px] text-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-verified-tint">
          <div className="flex h-[66px] w-[66px] items-center justify-center rounded-full bg-verified shadow-[0_10px_22px_rgba(15,157,107,0.4)]">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
        </div>
        <h1 className="mt-5.5 text-2xl font-extrabold tracking-tight">Area verified</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Proof logged to <strong className="text-ink">{branchName ?? 'your branch'}</strong>
        </p>
      </div>

      <div className="px-6 pt-6.5">
        <div className="overflow-hidden rounded-[18px] border border-line bg-white">
          <div className="flex items-center justify-between border-b border-line-soft px-4.5 py-4">
            <div className="text-[15px] font-bold">{assignment.areaName}</div>
            <span className="font-mono text-xs text-muted">{assignment.areaCode}</span>
          </div>
          <div className="grid grid-cols-2">
            <Stat label="Time on task" value={formatDuration(durationMs)} border="right bottom" />
            <Stat label="Tasks" value={`${done} / ${total}`} valueClass="text-verified-ink" border="bottom" />
            <Stat label="Photos" value={String(assignment.photos.length)} border="right" />
            <Stat label="Logged" value={formatClock(assignment.submittedAt)} mono />
          </div>
        </div>

        {actionableNext && (
          <button
            onClick={() => navigate(`/staff/scan/${actionableNext.id}`)}
            className="mt-4 flex w-full items-center gap-3.5 rounded-2xl bg-ink px-4.5 py-4 text-left"
          >
            <div className="flex h-9.5 w-9.5 flex-shrink-0 items-center justify-center rounded-[10px] bg-white/10">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] text-white/60">Next up</div>
              <div className="text-[15px] font-bold text-white">{actionableNext.areaName}</div>
            </div>
            <span className="font-mono text-xs text-white/55">
              {actionableNext.areaCode.slice(actionableNext.areaCode.indexOf('-') + 1)}
            </span>
          </button>
        )}

        {nextIsFutureCycleOfSameArea && next?.dueAt && (
          <div className="mt-4 flex w-full items-center gap-3.5 rounded-2xl border border-line bg-verified-tint px-4.5 py-4">
            <div className="flex h-9.5 w-9.5 flex-shrink-0 items-center justify-center rounded-[10px] bg-verified text-white">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] text-verified-ink">All caught up</div>
              <div className="text-[14px] font-bold text-ink">
                {next.areaName} comes around again in {formatDuration(new Date(next.dueAt).getTime() - Date.now())}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1" />
      <div className="flex flex-col gap-2.75 px-6 pb-8.5 pt-3.5">
        {actionableNext ? (
          <>
            <Button fullWidth onClick={() => navigate(`/staff/scan/${actionableNext.id}`)}>
              Scan next area
            </Button>
            <Button variant="secondary" size="md" fullWidth className="!h-13" onClick={() => navigate('/staff')}>
              Back to my route
            </Button>
          </>
        ) : (
          <>
            {/* Their route is clear, but they may well have been sent somewhere else — this is the
                moment they'd walk to it, so offer the scan here rather than only on the route screen. */}
            <Button fullWidth onClick={() => navigate('/staff/scan')}>
              Scan another area
            </Button>
            <Button variant="secondary" size="md" fullWidth className="!h-13" onClick={() => navigate('/staff')}>
              Back to my route
            </Button>
          </>
        )}
      </div>
    </PhoneScreen>
  )
}

function Stat({
  label,
  value,
  border,
  mono,
  valueClass = '',
}: {
  label: string
  value: string
  border?: string
  mono?: boolean
  valueClass?: string
}) {
  const borderClass = [
    border?.includes('right') ? 'border-r border-line-soft' : '',
    border?.includes('bottom') ? 'border-b border-line-soft' : '',
  ].join(' ')
  return (
    <div className={`px-4.5 py-4 ${borderClass}`}>
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-0.75 text-[19px] font-extrabold ${mono ? 'font-mono' : ''} ${valueClass}`}>{value}</div>
    </div>
  )
}
