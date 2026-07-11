import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { useStaffAuth } from '../../contexts/StaffAuthContext'
import { taskProgress } from '../../lib/domain'
import { repo } from '../../lib/repo'
import type { Assignment, IssueSeverity } from '../../lib/types'
import { enqueueSubmission, getOutbox, isNetworkError, syncOutbox } from '../outbox'
import { PhoneScreen } from '../PhoneScreen'

export function Checklist() {
  const { assignmentId = '' } = useParams()
  const navigate = useNavigate()
  const { staff } = useStaffAuth()
  const [assignment, setAssignment] = useState<Assignment | null>(null)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [reportingIssue, setReportingIssue] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  // True once any tick/photo failed to reach the backend (offline) — the screen keeps
  // working on local state and the final submit goes through the outbox replay instead.
  const [offlineDirty, setOfflineDirty] = useState(false)
  const beforeInputRef = useRef<HTMLInputElement>(null)
  const afterInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    repo.getAssignment(assignmentId).then((a) => {
      setAssignment(a)
      setNote(a?.note ?? '')
    })
  }, [assignmentId])

  async function refresh() {
    const a = await repo.getAssignment(assignmentId)
    setAssignment(a)
  }

  async function toggleTask(taskId: string) {
    // Optimistic: tick locally first so the checklist keeps working with no signal.
    setAssignment(
      (a) =>
        a && {
          ...a,
          tasks: a.tasks.map((t) => (t.id === taskId ? { ...t, completed: !t.completed } : t)),
        },
    )
    try {
      await repo.toggleTask(assignmentId, taskId)
      refresh()
    } catch (err) {
      if (!isNetworkError(err)) throw err
      setOfflineDirty(true)
    }
  }

  async function handlePhoto(label: 'before' | 'after', file: File | undefined) {
    if (!file) return
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
    setAssignment(
      (a) =>
        a && {
          ...a,
          photos: [...a.photos.filter((p) => p.label !== label), { id: `local-${label}`, label, dataUrl }],
        },
    )
    try {
      await repo.addPhoto(assignmentId, label, dataUrl)
      refresh()
    } catch (err) {
      if (!isNetworkError(err)) throw err
      setOfflineDirty(true)
    }
  }

  async function handleSubmit() {
    if (!assignment) return
    setSubmitting(true)
    setSubmitError(null)

    // Offline path: queue the full local state and replay it via the outbox — never
    // call submitProof directly when the backend is missing ticks/photos, or the
    // stored proof record would be incomplete.
    const queueAndGo = async () => {
      enqueueSubmission({
        assignmentId,
        areaName: assignment.areaName,
        areaCode: assignment.areaCode,
        completedTaskIds: assignment.tasks.filter((t) => t.completed).map((t) => t.id),
        photos: assignment.photos.map((p) => ({ label: p.label, dataUrl: p.dataUrl })),
        note: note.trim(),
      })
      if (navigator.onLine) await syncOutbox() // connection may be back — push it through now
      const stillQueued = getOutbox().some((i) => i.assignmentId === assignmentId)
      navigate(stillQueued ? '/staff/pending' : `/staff/proof/${assignmentId}`, { replace: true })
    }

    try {
      if (offlineDirty) {
        await queueAndGo()
        return
      }
      if (note.trim()) await repo.setNote(assignmentId, note.trim())
      await repo.submitProof(assignmentId)
      navigate(`/staff/proof/${assignmentId}`, { replace: true })
    } catch (err) {
      if (isNetworkError(err)) {
        await queueAndGo()
      } else {
        setSubmitError(err instanceof Error ? err.message : 'Could not submit — try again.')
        setSubmitting(false)
      }
    }
  }

  if (!assignment) {
    return <PhoneScreen className="items-center justify-center text-ink-soft">Loading…</PhoneScreen>
  }

  const { done, total } = taskProgress(assignment.tasks)
  const tasksDone = done === total
  const before = assignment.photos.find((p) => p.label === 'before')
  const after = assignment.photos.find((p) => p.label === 'after')
  // Photo-required tasks need the full pair — proof of a clean is the change between the
  // "before" and "after" shots, so an after-only record is incomplete evidence.
  const photoMissing = assignment.requirePhoto && (!before || !after)
  const canSubmit = tasksDone && !photoMissing

  return (
    <PhoneScreen className="relative">
      <div className="border-b border-line-soft bg-white px-[22px] pb-4" style={{ paddingTop: 58 }}>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex h-9.5 w-9.5 items-center justify-center rounded-full bg-app"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1D231F" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
          <div className="flex-1">
            <div className="text-lg font-extrabold tracking-tight">{assignment.areaName}</div>
            <div className="mt-0.5 font-mono text-xs text-muted">
              {assignment.areaCode} · started {assignment.startedAt ? new Date(assignment.startedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : 'now'}
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-verified-tint px-2.5 py-1 text-[11px] font-bold text-verified-ink">
            <span className="h-1.5 w-1.5 rounded-full bg-verified" />
            LIVE
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-[22px] pb-32 pt-4.5">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[15px] font-extrabold">Tasks</div>
          <div className="font-mono text-[13px] font-bold text-verified-ink">
            {done} / {total}
          </div>
        </div>
        <div className="mb-4.5 h-1.75 overflow-hidden rounded-full bg-line-soft" style={{ height: 7 }}>
          <div
            className="h-full rounded-full bg-verified transition-all"
            style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }}
          />
        </div>

        <div className="flex flex-col gap-2.5">
          {assignment.tasks.map((task) => (
            <button
              key={task.id}
              type="button"
              onClick={() => toggleTask(task.id)}
              className={`flex items-center gap-3.5 rounded-[14px] border bg-white p-3.5 text-left ${
                task.completed ? 'border-line' : 'border-line'
              }`}
            >
              <div
                className={`flex h-6.5 w-6.5 flex-shrink-0 items-center justify-center rounded-lg ${
                  task.completed ? 'bg-verified' : 'border-2 border-dash'
                }`}
              >
                {task.completed && (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
              </div>
              <div
                className={`flex-1 text-[15px] font-semibold ${
                  task.completed ? 'text-muted line-through' : 'font-bold text-ink'
                }`}
              >
                {task.label}
              </div>
            </button>
          ))}
        </div>

        <div className="mb-2.5 mt-5.5 flex items-center gap-2">
          <span className="text-[15px] font-extrabold">Photo proof</span>
          {assignment.requirePhoto && (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                photoMissing ? 'bg-overdue-tint text-overdue' : 'bg-verified-tint text-verified-ink'
              }`}
            >
              {photoMissing ? 'Before & after required' : 'Before & after ✓'}
            </span>
          )}
        </div>
        <div className="flex gap-2.5">
          <PhotoSlot
            label="before"
            photo={before}
            inputRef={beforeInputRef}
            onPick={(f) => handlePhoto('before', f)}
          />
          <PhotoSlot
            label="after"
            photo={after}
            inputRef={afterInputRef}
            onPick={(f) => handlePhoto('after', f)}
          />
        </div>

        <div className="mb-2.5 mt-5.5 text-[15px] font-extrabold">Note (optional)</div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => repo.setNote(assignmentId, note.trim()).catch(() => setOfflineDirty(true))}
          placeholder="Add any notes about this area…"
          rows={2}
          className="w-full resize-none rounded-[14px] border border-line bg-white p-3.5 text-sm text-ink outline-none placeholder:text-[#B4BDC2] focus:border-stroke-soft"
        />

        <button
          type="button"
          onClick={() => setReportingIssue(true)}
          className="mt-5.5 flex w-full items-center gap-2.5 rounded-[14px] border border-overdue-border bg-[#FAF0EA] p-3.5 text-left"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B3261E" strokeWidth="2.2" strokeLinecap="round" className="flex-shrink-0">
            <path d="M12 8v5M12 16v.5" />
            <circle cx="12" cy="12" r="9" />
          </svg>
          <div className="flex-1">
            <div className="text-sm font-bold text-overdue">Can't clean this area?</div>
            <div className="text-xs text-overdue/80">Report an issue instead of marking it clean</div>
          </div>
        </button>
      </div>

      {reportingIssue && staff && (
        <ReportIssueModal
          assignmentId={assignmentId}
          staffId={staff.id}
          onClose={() => setReportingIssue(false)}
          onReported={() => navigate('/staff', { replace: true })}
        />
      )}

      <div
        className="pointer-events-none fixed bottom-0 left-1/2 w-full max-w-[480px] -translate-x-1/2 px-[22px] pb-7 pt-3.5"
        style={{ background: 'linear-gradient(to top, var(--color-app) 62%, transparent)' }}
      >
        {offlineDirty && (
          <div className="pointer-events-auto mb-2 rounded-lg bg-attention/15 px-3 py-2 text-center text-[12px] font-bold text-attention">
            You're offline — this will be saved as Pending sync
          </div>
        )}
        {submitError && (
          <div className="pointer-events-auto mb-2 rounded-lg bg-overdue-tint px-3 py-2 text-center text-[12px] font-medium text-overdue">
            {submitError}
          </div>
        )}
        <Button
          fullWidth
          className="pointer-events-auto"
          disabled={!canSubmit || submitting}
          onClick={handleSubmit}
          icon={
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          }
        >
          {!tasksDone
            ? `${total - done} task${total - done === 1 ? '' : 's'} remaining`
            : photoMissing
              ? !before && !after
                ? 'Add before & after photos to finish'
                : !before
                  ? 'Add a before photo to finish'
                  : 'Add an after photo to finish'
              : submitting
                ? 'Logging…'
                : 'Mark area clean'}
        </Button>
      </div>
    </PhoneScreen>
  )
}

function PhotoSlot({
  label,
  photo,
  inputRef,
  onPick,
}: {
  label: 'before' | 'after'
  photo: { dataUrl: string } | undefined
  inputRef: React.RefObject<HTMLInputElement | null>
  onPick: (file: File | undefined) => void
}) {
  return (
    <label className="relative flex h-24 flex-1 cursor-pointer flex-col items-center justify-center gap-1.5 overflow-hidden rounded-[14px] border border-dash bg-white text-muted">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0])}
      />
      {photo ? (
        <>
          <img src={photo.dataUrl} alt={`${label} proof`} className="absolute inset-0 h-full w-full object-cover" />
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/55 px-1.5 py-0.5 font-mono text-[10px] text-white">
            {label}.jpg
          </span>
        </>
      ) : (
        <>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#808B81" strokeWidth="2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span className="text-[11px] font-semibold capitalize">Add {label}</span>
        </>
      )}
    </label>
  )
}

const SEVERITY_OPTIONS: Array<{ value: IssueSeverity; label: string }> = [
  { value: 'low', label: 'Low — minor, can wait' },
  { value: 'medium', label: 'Medium — needs attention today' },
  { value: 'high', label: 'High — urgent / unsafe' },
]

function ReportIssueModal({
  assignmentId,
  staffId,
  onClose,
  onReported,
}: {
  assignmentId: string
  staffId: string
  onClose: () => void
  onReported: () => void
}) {
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState<IssueSeverity>('medium')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!description.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      await repo.reportIssue(assignmentId, staffId, description.trim(), severity)
      onReported()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not report the issue.')
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[480px] rounded-t-3xl bg-white p-6 sm:rounded-3xl"
      >
        <div className="text-lg font-extrabold">Report an issue</div>
        <p className="mt-1 text-sm text-ink-soft">
          This lets your admin know without marking the area clean. They'll see it right away.
        </p>

        <div className="mt-4">
          <div className="mb-1.5 text-xs font-semibold text-ink-soft">What's wrong?</div>
          <textarea
            autoFocus
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Door is locked, out of supplies, biohazard…"
            rows={3}
            className="w-full resize-none rounded-xl border border-line bg-app p-3 text-sm outline-none focus:border-stroke-soft"
          />
        </div>

        <div className="mt-3">
          <div className="mb-1.5 text-xs font-semibold text-ink-soft">Severity</div>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as IssueSeverity)}
            className="w-full rounded-xl border border-line bg-app p-3 text-sm"
          >
            {SEVERITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {error && <div className="mt-3 text-[13px] font-medium text-overdue">{error}</div>}

        <div className="mt-5 flex gap-2">
          <button
            type="submit"
            disabled={submitting || !description.trim()}
            className="flex h-12 flex-1 items-center justify-center rounded-xl bg-overdue text-sm font-bold text-white disabled:opacity-50"
          >
            {submitting ? 'Reporting…' : 'Report issue'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-12 flex-1 rounded-xl border border-stroke text-sm font-bold text-ink"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
