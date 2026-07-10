import { useEffect, useMemo, useState } from 'react'
import { DateRangePicker } from '../../components/ui/DateRangePicker'
import { StatusPill } from '../../components/ui/StatusPill'
import { useAdminAuth } from '../../contexts/AdminAuthContext'
import { useBranch } from '../../contexts/BranchContext'
import { formatClock, hasPermission, PHOTO_REVIEW_LABELS, TASK_TYPE_LABELS } from '../../lib/domain'
import { exportRowsToCsv } from '../../lib/reportExport'
import { formatDateRangeLabel, resolveDateRange, toLocalDateStamp, type DateRange } from '../../lib/reports'
import { repo } from '../../lib/repo'
import type { PhotoReviewStatus, ProofPhotoView, Staff, TaskType } from '../../lib/types'
import { AdminLayout } from '../AdminLayout'

const REVIEW_TONE: Record<PhotoReviewStatus, 'verified' | 'todo' | 'overdue' | 'attention' | 'info'> = {
  pending: 'todo',
  approved: 'verified',
  rejected: 'overdue',
  flagged: 'attention',
  archived: 'info',
}

const REVIEW_ACTIONS: PhotoReviewStatus[] = ['approved', 'rejected', 'flagged']

/** One proof log's photos, kept together — before and after are a set, never split apart. */
interface PhotoSet {
  assignmentId: string
  branchName: string
  branchCode: string
  areaName: string
  areaCode: string
  staffName: string | null
  taskType: TaskType
  capturedAt: string
  hasOpenIssue: boolean
  before: ProofPhotoView | null
  after: ProofPhotoView | null
  photos: ProofPhotoView[]
  /** The set's headline status: pending while anything awaits review, else the sternest verdict. */
  status: PhotoReviewStatus
}

function statusOfSet(photos: ProofPhotoView[]): PhotoReviewStatus {
  if (photos.some((p) => p.reviewStatus === 'pending')) return 'pending'
  if (photos.some((p) => p.reviewStatus === 'rejected')) return 'rejected'
  if (photos.some((p) => p.reviewStatus === 'flagged')) return 'flagged'
  if (photos.every((p) => p.reviewStatus === 'archived')) return 'archived'
  return 'approved'
}

function groupIntoSets(photos: ProofPhotoView[]): PhotoSet[] {
  const byAssignment = new Map<string, ProofPhotoView[]>()
  for (const p of photos) {
    const list = byAssignment.get(p.assignmentId) ?? []
    list.push(p)
    byAssignment.set(p.assignmentId, list)
  }
  return [...byAssignment.values()].map((list) => {
    const first = list[0]
    return {
      assignmentId: first.assignmentId,
      branchName: first.branchName,
      branchCode: first.branchCode,
      areaName: first.areaName,
      areaCode: first.areaCode,
      staffName: first.staffName,
      taskType: first.taskType,
      capturedAt: first.capturedAt,
      hasOpenIssue: first.hasOpenIssue,
      before: list.find((p) => p.label === 'before') ?? null,
      after: list.find((p) => p.label === 'after') ?? null,
      photos: list,
      status: statusOfSet(list),
    }
  })
}

export function Photos() {
  const { admin } = useAdminAuth()
  const { activeBranchId, branches } = useBranch()
  const [photos, setPhotos] = useState<ProofPhotoView[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState<DateRange>(() => resolveDateRange('today'))
  const [staffId, setStaffId] = useState<string>('')
  const [taskType, setTaskType] = useState<TaskType | ''>('')
  const [reviewStatus, setReviewStatus] = useState<PhotoReviewStatus | ''>('')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const canExport = admin ? hasPermission(admin, 'photos', 'export') : false

  function load() {
    if (!admin) return
    Promise.all([
      repo.listProofPhotos(admin.siteId, {
        branchId: activeBranchId === 'all' ? null : activeBranchId,
        staffId: staffId || null,
        taskType: taskType || null,
        search: search || null,
        from: range.start.toISOString(),
        to: range.end.toISOString(),
      }),
      repo.listStaffForSite(admin.siteId),
    ]).then(([p, s]) => {
      setPhotos(p)
      setStaff(s)
      setLoading(false)
    })
  }

  useEffect(() => {
    if (!admin) return
    load()
    const unsub = repo.subscribe(admin.siteId, load)
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, activeBranchId, staffId, taskType, search, range])

  const staffOptions = useMemo(() => staff.filter((s) => s.accountStatus !== 'archived'), [staff])

  // Pair before/after into sets, then split into "needs review" (always on top, newest first)
  // and "reviewed" (below) so the queue never buries what still needs a decision.
  const sets = useMemo(() => {
    let all = groupIntoSets(photos)
    if (reviewStatus) all = all.filter((s) => s.status === reviewStatus)
    all.sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime())
    return all
  }, [photos, reviewStatus])

  const pendingSets = sets.filter((s) => s.status === 'pending')
  const reviewedSets = sets.filter((s) => s.status !== 'pending')
  const selected = selectedId ? sets.find((s) => s.assignmentId === selectedId) ?? null : null

  async function handleExport() {
    if (!admin) return
    const rows = photos.map((p) => ({
      branch: p.branchName, branch_code: p.branchCode, area: p.areaName, area_code: p.areaCode,
      staff: p.staffName ?? '', task_type: TASK_TYPE_LABELS[p.taskType], photo_type: p.label,
      captured: new Date(p.capturedAt).toLocaleString(), review_status: PHOTO_REVIEW_LABELS[p.reviewStatus], proof_log: p.assignmentId,
    }))
    const fields = [
      { key: 'branch', label: 'Branch', category: 'Photo' as const },
      { key: 'branch_code', label: 'Branch code', category: 'Photo' as const },
      { key: 'area', label: 'Area', category: 'Photo' as const },
      { key: 'area_code', label: 'Area code', category: 'Photo' as const },
      { key: 'staff', label: 'Staff', category: 'Photo' as const },
      { key: 'task_type', label: 'Task type', category: 'Photo' as const },
      { key: 'photo_type', label: 'Photo type', category: 'Photo' as const },
      { key: 'captured', label: 'Captured', category: 'Photo' as const },
      { key: 'review_status', label: 'Review status', category: 'Photo' as const },
      { key: 'proof_log', label: 'Proof log', category: 'Photo' as const },
    ]
    exportRowsToCsv(rows, fields, `Photo_proof_${toLocalDateStamp(new Date())}`)
    await repo.logPhotoExport(admin.siteId, `${rows.length} photos · ${formatDateRangeLabel(range)}`)
  }

  /** Reviews the whole set in one action — before and after are approved/rejected together. */
  async function reviewSet(set: PhotoSet, status: PhotoReviewStatus, note: string | null) {
    for (const p of set.photos) {
      await repo.reviewProofPhoto(p.id, status, note)
    }
    load()
  }

  if (!admin) return null

  return (
    <AdminLayout>
      <div className="flex h-16 flex-shrink-0 items-center gap-3 border-b border-line bg-white px-6">
        <h2 className="font-display text-[24px] font-bold uppercase leading-none tracking-[0.01em]">Photo Proof</h2>
        <span className="text-sm text-muted">{sets.length} proof sets · {formatDateRangeLabel(range)}</span>
        <div className="flex-1" />
        <DateRangePicker value={range} onChange={setRange} />
        {canExport && (
          <button onClick={handleExport} disabled={photos.length === 0} className="flex h-9.5 items-center gap-2 rounded-[11px] border border-line bg-white px-3.5 text-sm font-bold text-ink-soft disabled:opacity-50">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M8 11l4 4 4-4M5 21h14" /></svg>
            Export
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-app px-6 py-2.5">
        <select value={staffId} onChange={(e) => setStaffId(e.target.value)} className="h-8.5 rounded-lg border border-line bg-white px-2.5 text-[13px]">
          <option value="">All staff</option>
          {staffOptions.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
        </select>
        <select value={taskType} onChange={(e) => setTaskType(e.target.value as TaskType | '')} className="h-8.5 rounded-lg border border-line bg-white px-2.5 text-[13px]">
          <option value="">All task types</option>
          {(Object.keys(TASK_TYPE_LABELS) as TaskType[]).map((t) => <option key={t} value={t}>{TASK_TYPE_LABELS[t]}</option>)}
        </select>
        <select value={reviewStatus} onChange={(e) => setReviewStatus(e.target.value as PhotoReviewStatus | '')} className="h-8.5 rounded-lg border border-line bg-white px-2.5 text-[13px]">
          <option value="">Any review status</option>
          {(Object.keys(PHOTO_REVIEW_LABELS) as PhotoReviewStatus[]).map((r) => <option key={r} value={r}>{PHOTO_REVIEW_LABELS[r]}</option>)}
        </select>
        <button
          onClick={() => setReviewStatus((r) => (r === 'pending' ? '' : 'pending'))}
          className={`h-8.5 rounded-lg px-3 text-[12px] font-bold ${reviewStatus === 'pending' ? 'bg-ink text-white' : 'border border-line bg-white text-ink-soft'}`}
        >
          Needs review{reviewStatus !== 'pending' && pendingSets.length > 0 ? ` · ${pendingSets.length}` : ''}
        </button>
        <div className="flex h-8.5 flex-1 items-center gap-2 rounded-lg border border-line bg-white px-2.5">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#808B81" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" strokeLinecap="round" /></svg>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search staff, area, code, proof log…" className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted" />
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex flex-1 items-center justify-center py-16 text-ink-soft">Loading…</div>
        ) : sets.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-dash p-12 text-center text-sm text-muted">
            No photos match these filters {activeBranchId !== 'all' && branches.length > 1 ? 'in this branch' : ''}.
          </div>
        ) : (
          <>
            {pendingSets.length > 0 && (
              <section>
                <div className="mb-3 flex items-center gap-2.5">
                  <h3 className="text-base font-extrabold">Needs review</h3>
                  <span className="rounded-full bg-attention/15 px-2.5 py-0.75 text-[11px] font-bold text-attention">{pendingSets.length}</span>
                </div>
                <SetGrid sets={pendingSets} onOpen={setSelectedId} onQuickReview={reviewSet} />
              </section>
            )}
            {reviewedSets.length > 0 && (
              <section className={pendingSets.length > 0 ? 'mt-8' : ''}>
                <div className="mb-3 flex items-center gap-2.5">
                  <h3 className="text-base font-extrabold text-ink-soft">Reviewed</h3>
                  <span className="rounded-full bg-line-soft px-2.5 py-0.75 text-[11px] font-bold text-ink-soft">{reviewedSets.length}</span>
                </div>
                <SetGrid sets={reviewedSets} onOpen={setSelectedId} onQuickReview={reviewSet} dimmed />
              </section>
            )}
          </>
        )}
      </div>

      {selected && (
        <SetDetail set={selected} onReview={reviewSet} onClose={() => setSelectedId(null)} />
      )}
    </AdminLayout>
  )
}

function PhotoTile({ photo, label, areaName }: { photo: ProofPhotoView | null; label: 'before' | 'after'; areaName: string }) {
  if (!photo) {
    return (
      <div className="flex aspect-[4/3] flex-col items-center justify-center gap-1 bg-line-softer text-muted">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8.5" cy="10" r="1.5" /><path d="M21 16l-5-5-9 8M3 3l18 18" />
        </svg>
        <span className="font-mono text-[9px] font-semibold uppercase tracking-wide">No {label} photo</span>
      </div>
    )
  }
  return (
    <div className="relative aspect-[4/3] overflow-hidden bg-line-soft">
      <img src={photo.dataUrl} alt={`${label} — ${areaName}`} className="h-full w-full object-cover" />
      <span className="absolute bottom-1.5 left-1.5 rounded bg-black/55 px-1.5 py-0.5 font-mono text-[10px] uppercase text-white">{label}</span>
    </div>
  )
}

function SetGrid({ sets, onOpen, onQuickReview, dimmed = false }: { sets: PhotoSet[]; onOpen: (id: string) => void; onQuickReview: (set: PhotoSet, status: PhotoReviewStatus, note: string | null) => void; dimmed?: boolean }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3.5">
      {sets.map((set) => (
        <div
          key={set.assignmentId}
          role="button"
          tabIndex={0}
          onClick={() => onOpen(set.assignmentId)}
          onKeyDown={(e) => e.key === 'Enter' && onOpen(set.assignmentId)}
          className={`group cursor-pointer overflow-hidden rounded-xl border border-line bg-white text-left ${dimmed ? 'opacity-80 hover:opacity-100' : ''}`}
        >
          <div className="relative">
            {/* Before and after live in one card, side by side — never split across the grid.
                A missing shot renders as an explicit gap, so incomplete proof is visible at a glance. */}
            <div className="grid grid-cols-2 gap-px">
              <PhotoTile photo={set.before} label="before" areaName={set.areaName} />
              <PhotoTile photo={set.after} label="after" areaName={set.areaName} />
            </div>
            <span className="absolute right-1.5 top-1.5"><StatusPill tone={REVIEW_TONE[set.status]}>{PHOTO_REVIEW_LABELS[set.status].toUpperCase()}</StatusPill></span>
          </div>
          <div className="p-2.5">
            <div className="truncate text-[13px] font-bold">{set.areaName}</div>
            <div className="truncate font-mono text-[10.5px] text-muted">{set.branchCode} · {set.areaCode}</div>
            <div className="mt-1 flex items-center justify-between text-[11px] text-ink-soft">
              <span className="truncate">{set.staffName ?? 'Unassigned'}</span>
              <span className="font-mono text-muted">{formatClock(set.capturedAt)}</span>
            </div>
          </div>
          {set.status === 'pending' && (
            <div className="flex gap-1.5 px-2.5 pb-2.5" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => onQuickReview(set, 'approved', null)}
                className="flex h-7.5 flex-1 items-center justify-center gap-1 rounded-lg bg-verified text-[11px] font-bold text-white"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                Approve
              </button>
              <button
                type="button"
                onClick={() => onQuickReview(set, 'rejected', null)}
                className="flex h-7.5 flex-1 items-center justify-center gap-1 rounded-lg bg-overdue text-[11px] font-bold text-white"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                Reject
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function SetDetail({ set, onReview, onClose }: { set: PhotoSet; onReview: (set: PhotoSet, status: PhotoReviewStatus, note: string | null) => void; onClose: () => void }) {
  const [note, setNote] = useState('')
  const reviewer = set.photos.find((p) => p.reviewedByName)
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div className="flex h-full w-full max-w-md flex-col overflow-auto bg-white" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div className="text-base font-extrabold">Proof photos</div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-app text-ink-soft">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div className="flex flex-col gap-2 p-4">
          {set.before && (
            <div className="relative overflow-hidden rounded-xl">
              <img src={set.before.dataUrl} alt={`Before — ${set.areaName}`} className="aspect-[4/3] w-full object-cover" />
              <span className="absolute left-2 top-2 rounded bg-black/55 px-2 py-0.5 font-mono text-[11px] uppercase text-white">before</span>
            </div>
          )}
          {set.after && (
            <div className="relative overflow-hidden rounded-xl">
              <img src={set.after.dataUrl} alt={`After — ${set.areaName}`} className="aspect-[4/3] w-full object-cover" />
              <span className="absolute left-2 top-2 rounded bg-black/55 px-2 py-0.5 font-mono text-[11px] uppercase text-white">after</span>
            </div>
          )}
          {(!set.before || !set.after) && (
            <div className="rounded-xl border border-dashed border-dash bg-app px-3.5 py-3 text-center text-xs font-semibold text-muted">
              No {!set.before ? 'before' : 'after'} photo was captured for this proof log.
            </div>
          )}
        </div>
        <div className="flex flex-col gap-3 px-5 pb-5">
          <div className="flex items-center gap-2">
            <StatusPill tone={REVIEW_TONE[set.status]}>{PHOTO_REVIEW_LABELS[set.status].toUpperCase()}</StatusPill>
            {set.hasOpenIssue && <StatusPill tone="overdue">OPEN ISSUE</StatusPill>}
          </div>
          <div>
            <div className="text-lg font-extrabold">{set.areaName}</div>
            <div className="font-mono text-xs text-muted">{set.areaCode}</div>
          </div>
          <dl className="flex flex-col divide-y divide-line-softer text-sm">
            <Row k="Branch" v={`${set.branchName} · ${set.branchCode}`} />
            <Row k="Task type" v={TASK_TYPE_LABELS[set.taskType]} />
            <Row k="Staff" v={set.staffName ?? 'Unassigned'} />
            <Row k="Captured" v={new Date(set.capturedAt).toLocaleString()} />
            <Row k="Photos" v={`${set.photos.length} (${[set.before && 'before', set.after && 'after'].filter(Boolean).join(' + ') || '—'})`} />
            <Row k="Proof log" v={set.assignmentId} mono />
            {reviewer?.reviewedByName && <Row k="Reviewed by" v={reviewer.reviewedByName} />}
            {reviewer?.reviewNote && <Row k="Review note" v={reviewer.reviewNote} />}
          </dl>
          <div className="mt-1 rounded-xl border border-line bg-app p-3">
            <div className="mb-2 text-xs font-semibold text-ink-soft">Supervisor review — applies to the whole set</div>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note…" className="mb-2 w-full rounded-lg border border-line bg-white px-2.5 py-2 text-[13px] outline-none" />
            <div className="flex gap-2">
              {REVIEW_ACTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => onReview(set, s, note.trim() || null)}
                  className={`h-9 flex-1 rounded-lg text-xs font-bold text-white ${s === 'approved' ? 'bg-verified' : s === 'rejected' ? 'bg-overdue' : 'bg-attention'}`}
                >
                  {PHOTO_REVIEW_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({ k, v, mono = false }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <dt className="flex-shrink-0 text-xs font-semibold text-muted">{k}</dt>
      <dd className={`min-w-0 truncate text-right text-[13px] font-semibold ${mono ? 'font-mono text-xs' : ''}`}>{v}</dd>
    </div>
  )
}
