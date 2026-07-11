import { useMemo, useState } from 'react'
import { Field, inputCls, ModalShell } from '../components/ui/Modal'
import { repo } from '../lib/repo'
import type { CreateScheduleInput, ScheduleBreakInput } from '../lib/repo/types'
import type { Area, Assignment, Benchmark, Branch, LocationCategory, Staff, TaskTemplate } from '../lib/types'

const UNASSIGNED = '__unassigned__'

type Frequency = 'once' | 'twice' | 'every_2h' | 'every_4h' | 'custom'

function floorOf(name: string): string {
  const m = name.match(/^L(\d+)/)
  return m ? `Level ${m[1]}` : 'Other'
}

export function ScheduleTaskModal({
  siteId,
  createdByName,
  branches,
  defaultBranchId,
  areas,
  categories,
  benchmarks,
  staff,
  templates,
  onClose,
  onCreated,
}: {
  siteId: string
  createdByName: string
  branches: Branch[]
  defaultBranchId: string
  areas: Area[]
  categories: LocationCategory[]
  benchmarks: Benchmark[]
  staff: Staff[]
  templates: TaskTemplate[]
  onClose: () => void
  onCreated: (created: Assignment[]) => void
}) {
  const [name, setName] = useState('')
  const [branchId, setBranchId] = useState(defaultBranchId)
  const [categoryId, setCategoryId] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [floor, setFloor] = useState<string>('all')
  const [selectedAreas, setSelectedAreas] = useState<string[]>([])
  const [rangeStart, setRangeStart] = useState('')
  const [rangeEnd, setRangeEnd] = useState('')
  const [assignedUserId, setAssignedUserId] = useState<string>(UNASSIGNED)
  const [shift, setShift] = useState<'day' | 'night' | 'custom'>('day')
  const [startTime, setStartTime] = useState('08:00')
  const [endTime, setEndTime] = useState('17:00')
  const [breaks, setBreaks] = useState<ScheduleBreakInput[]>([{ start: '13:00', end: '13:30', label: 'Lunch' }])
  const [frequency, setFrequency] = useState<Frequency>('custom')
  const [customCleans, setCustomCleans] = useState(4)
  const [recurrence, setRecurrence] = useState<CreateScheduleInput['recurrenceType']>('daily')
  const [templateId, setTemplateId] = useState<string>('')
  const [requirePhoto, setRequirePhoto] = useState(false)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function applyShift(s: 'day' | 'night' | 'custom') {
    setShift(s)
    if (s === 'day') { setStartTime('08:00'); setEndTime('17:00') }
    else if (s === 'night') { setStartTime('18:00'); setEndTime('23:00') }
  }

  const branchAreas = useMemo(
    () => areas.filter((a) => a.branchId === branchId && a.active).sort((x, y) => x.name.localeCompare(y.name, undefined, { numeric: true })),
    [areas, branchId],
  )
  const floors = useMemo(() => [...new Set(branchAreas.map((a) => floorOf(a.name)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [branchAreas])

  const filteredAreas = useMemo(() => {
    const q = search.trim().toLowerCase()
    return branchAreas
      .filter((a) => categoryId === 'all' || a.categoryId === categoryId)
      .filter((a) => floor === 'all' || floorOf(a.name) === floor)
      .filter((a) => !q || a.name.toLowerCase().includes(q) || a.code.toLowerCase().includes(q))
  }, [branchAreas, categoryId, floor, search])

  // The most specific active benchmark for the chosen category: branch-specific beats global.
  const benchmark = useMemo(() => {
    if (categoryId === 'all') return null
    const matches = benchmarks.filter((b) => b.isActive && b.categoryId === categoryId && (b.isGlobal || b.branchId === branchId))
    if (matches.length === 0) return null
    const best = matches.find((b) => !b.isGlobal && b.branchId === branchId) ?? matches[0]
    const catName = categories.find((c) => c.id === categoryId)?.name ?? 'This category'
    return { cleans: best.requiredCleansPerDay, label: `${catName} should be cleaned ${best.requiredCleansPerDay}× per day`, photo: best.photoRequired }
  }, [categoryId, benchmarks, branchId, categories])

  const requiredCleans = useMemo(() => {
    const windowHours = Math.max(1, timeToHours(endTime) - timeToHours(startTime))
    if (frequency === 'once') return 1
    if (frequency === 'twice') return 2
    if (frequency === 'every_2h') return Math.max(1, Math.round(windowHours / 2))
    if (frequency === 'every_4h') return Math.max(1, Math.round(windowHours / 4))
    return Math.max(1, customCleans)
  }, [frequency, customCleans, startTime, endTime])

  function toggleArea(id: string) {
    setSelectedAreas((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function applyRange() {
    if (!rangeStart || !rangeEnd) return
    const ids = filteredAreas.map((a) => a.id)
    const i = ids.indexOf(rangeStart)
    const j = ids.indexOf(rangeEnd)
    if (i === -1 || j === -1) return
    const [lo, hi] = i <= j ? [i, j] : [j, i]
    const range = ids.slice(lo, hi + 1)
    setSelectedAreas((prev) => [...new Set([...prev, ...range])])
  }

  async function submit(generate: boolean) {
    setError(null)
    if (!name.trim()) { setError('Give the schedule a name.'); return }
    if (selectedAreas.length === 0) { setError('Select at least one area.'); return }
    setSubmitting(true)
    try {
      const tmpl = templates.find((t) => t.id === templateId)
      const input: CreateScheduleInput = {
        name: name.trim(),
        branchId,
        categoryId: categoryId === 'all' ? null : categoryId,
        assignedUserId: assignedUserId === UNASSIGNED ? null : assignedUserId,
        recurrenceType: recurrence,
        frequencyType: frequency,
        requiredCleansPerDay: requiredCleans,
        intervalMinutes: frequency === 'every_2h' ? 120 : frequency === 'every_4h' ? 240 : null,
        startTime,
        endTime,
        shift,
        areaIds: selectedAreas,
        breaks: breaks.filter((b) => b.start && b.end),
        checklistItems: tmpl ? tmpl.checklistItems : [],
        templateId: tmpl?.id ?? null,
        templateName: tmpl?.name ?? null,
        requirePhoto: tmpl ? tmpl.requirePhoto || requirePhoto : requirePhoto,
        notes: notes.trim() || null,
        isActive: generate,
        generateToday: generate,
      }
      const created = await repo.createSchedule(siteId, input, createdByName)
      // Log an override if the admin scheduled a different frequency than the category benchmark.
      if (benchmark && requiredCleans !== benchmark.cleans) {
        const catName = categories.find((c) => c.id === (categoryId === 'all' ? '' : categoryId))?.name ?? 'category'
        await repo.logBenchmarkOverride(siteId, `${name.trim()}: ${requiredCleans}×/day vs ${catName} benchmark ${benchmark.cleans}×/day`)
      }
      onCreated(created)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the schedule.')
      setSubmitting(false)
    }
  }

  const activeStaffList = staff.filter((s) => s.accountStatus === 'active' && s.branchId === branchId)

  return (
    <ModalShell title="Create schedule" subtitle="Recurring cleans generate today's occurrences on the board right away." onClose={onClose}>
      <div className="flex max-h-[70vh] flex-col gap-3 overflow-auto pr-1">
        <Field label="Schedule name">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Morning restroom clean" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Branch">
            <select value={branchId} onChange={(e) => { setBranchId(e.target.value); setSelectedAreas([]) }} className={inputCls}>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
          <Field label="Location category">
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputCls}>
              <option value="all">All categories</option>
              {categories.filter((c) => c.isActive).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        </div>

        {benchmark && (
          <div className="flex items-center gap-2 rounded-xl border border-info/30 bg-info/5 px-3 py-2 text-[13px] text-info">
            <span className="font-bold">Benchmark:</span>
            <span className="flex-1">{benchmark.label}.</span>
            <button
              type="button"
              onClick={() => { setFrequency('custom'); setCustomCleans(benchmark.cleans); if (benchmark.photo) setRequirePhoto(true) }}
              className="rounded-lg bg-info px-2.5 py-1 text-[11px] font-bold text-white"
            >
              Use {benchmark.cleans}×/day
            </button>
          </div>
        )}

        <Field label="Select areas">
          <div className="rounded-xl border border-line">
            <div className="flex flex-wrap gap-2 border-b border-line-soft p-2">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search areas" className="h-8 flex-1 rounded-lg border border-line bg-app px-2.5 text-sm outline-none" />
              <select value={floor} onChange={(e) => setFloor(e.target.value)} className="h-8 rounded-lg border border-line bg-white px-2 text-xs">
                <option value="all">All floors</option>
                {floors.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2 border-b border-line-soft p-2 text-xs">
              <span className="font-bold text-ink-soft">Range:</span>
              <select value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} className="h-8 flex-1 rounded-lg border border-line bg-white px-2">
                <option value="">Start area</option>
                {filteredAreas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <span className="text-muted">to</span>
              <select value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} className="h-8 flex-1 rounded-lg border border-line bg-white px-2">
                <option value="">End area</option>
                {filteredAreas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <button type="button" onClick={applyRange} className="h-8 rounded-lg border border-line px-2.5 font-bold text-ink-soft">Add range</button>
            </div>
            <div className="max-h-40 overflow-auto">
              {filteredAreas.length === 0 && <div className="px-3 py-3 text-center text-xs text-muted">No areas match.</div>}
              {filteredAreas.map((a) => (
                <label key={a.id} className="flex cursor-pointer items-center gap-2.5 px-3 py-1.75 text-sm hover:bg-app">
                  <input type="checkbox" checked={selectedAreas.includes(a.id)} onChange={() => toggleArea(a.id)} />
                  <span className="flex-1 font-semibold">{a.name}</span>
                  <span className="font-mono text-xs text-muted">{a.code}</span>
                </label>
              ))}
            </div>
            <div className="border-t border-line-soft px-3 py-1.5 text-xs font-bold text-ink-soft">
              {selectedAreas.length} area{selectedAreas.length === 1 ? '' : 's'} selected
              {selectedAreas.length > 0 && (
                <button type="button" onClick={() => setSelectedAreas([])} className="ml-2 font-bold text-overdue">Clear</button>
              )}
            </div>
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Assigned staff">
            <select value={assignedUserId} onChange={(e) => setAssignedUserId(e.target.value)} className={inputCls}>
              <option value={UNASSIGNED}>Unassigned (Unassigned column)</option>
              {activeStaffList.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
            </select>
          </Field>
          <Field label="Shift">
            <select value={shift} onChange={(e) => applyShift(e.target.value as 'day' | 'night' | 'custom')} className={inputCls}>
              <option value="day">Day shift</option>
              <option value="night">Night shift</option>
              <option value="custom">Custom</option>
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Start time">
            <input type="time" value={startTime} onChange={(e) => { setStartTime(e.target.value); setShift('custom') }} className={inputCls} />
          </Field>
          <Field label="End time">
            <input type="time" value={endTime} onChange={(e) => { setEndTime(e.target.value); setShift('custom') }} className={inputCls} />
          </Field>
        </div>

        <Field label="Break windows (cleans are pushed out of these)">
          <div className="flex flex-col gap-2">
            {breaks.map((b, i) => (
              <div key={i} className="flex items-center gap-2">
                <input type="time" value={b.start} onChange={(e) => setBreaks((prev) => prev.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} className="h-9 rounded-lg border border-line bg-app px-2 text-sm" />
                <span className="text-xs text-muted">to</span>
                <input type="time" value={b.end} onChange={(e) => setBreaks((prev) => prev.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} className="h-9 rounded-lg border border-line bg-app px-2 text-sm" />
                <input value={b.label ?? ''} onChange={(e) => setBreaks((prev) => prev.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="Label" className="h-9 flex-1 rounded-lg border border-line bg-app px-2 text-sm" />
                <button type="button" onClick={() => setBreaks((prev) => prev.filter((_, j) => j !== i))} className="flex h-9 w-9 items-center justify-center rounded-lg border border-line text-ink-soft">✕</button>
              </div>
            ))}
            <button type="button" onClick={() => setBreaks((prev) => [...prev, { start: '10:00', end: '10:15', label: '' }])} className="self-start text-xs font-bold text-verified-ink">+ Add break</button>
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Frequency">
            <select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)} className={inputCls}>
              <option value="once">Once per day</option>
              <option value="twice">Twice per day</option>
              <option value="every_2h">Every 2 hours</option>
              <option value="every_4h">Every 4 hours</option>
              <option value="custom">Custom cleans/day</option>
            </select>
          </Field>
          <Field label="Recurrence">
            <select value={recurrence} onChange={(e) => setRecurrence(e.target.value as CreateScheduleInput['recurrenceType'])} className={inputCls}>
              <option value="today">Today only</option>
              <option value="daily">Daily</option>
              <option value="weekdays">Weekdays</option>
              <option value="weekends">Weekends</option>
              <option value="custom">Custom days</option>
            </select>
          </Field>
        </div>
        {frequency === 'custom' && (
          <Field label="Cleans per day">
            <input type="number" min={1} max={24} value={customCleans} onChange={(e) => setCustomCleans(Math.max(1, Number(e.target.value)))} className={inputCls} />
          </Field>
        )}
        <div className="rounded-lg bg-app px-3 py-2 text-[13px] font-semibold text-ink-soft">
          Generates <span className="text-verified-ink">{requiredCleans}</span> clean{requiredCleans === 1 ? '' : 's'} × <span className="text-verified-ink">{selectedAreas.length}</span> area{selectedAreas.length === 1 ? '' : 's'} = <span className="text-verified-ink">{requiredCleans * selectedAreas.length}</span> occurrences today.
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Checklist template">
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className={inputCls}>
              <option value="">Each area's own checklist</option>
              {templates.filter((t) => t.status === 'active').map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
          <Field label="Photo proof">
            <label className="flex h-10 items-center gap-2 rounded-xl border border-line px-3 text-sm font-semibold text-ink-soft">
              <input type="checkbox" checked={requirePhoto} onChange={(e) => setRequirePhoto(e.target.checked)} />
              Required
            </label>
          </Field>
        </div>
        <Field label="Notes / instructions (optional)">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inputCls} py-2`} placeholder="e.g. focus on high-touch surfaces" />
        </Field>

        {error && <div className="text-[13px] font-medium text-overdue">{error}</div>}
      </div>

      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => submit(true)} disabled={submitting} className="flex h-11 flex-1 items-center justify-center rounded-xl bg-verified text-sm font-bold text-white disabled:opacity-50">
          {submitting ? 'Creating…' : 'Create schedule'}
        </button>
        <button type="button" onClick={() => submit(false)} disabled={submitting} className="h-11 flex-1 rounded-xl border border-stroke text-sm font-bold text-ink disabled:opacity-50">
          Save as draft
        </button>
        <button type="button" onClick={onClose} className="h-11 rounded-xl border border-stroke px-5 text-sm font-bold text-ink">
          Cancel
        </button>
      </div>
    </ModalShell>
  )
}

function timeToHours(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h + (m || 0) / 60
}
