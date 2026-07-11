import { useMemo, useState } from 'react'
import { Field, inputCls } from '../../components/ui/Modal'
import { repo } from '../../lib/repo'
import type { Benchmark, Branch, LocationCategory } from '../../lib/types'

/** Superuser (or benchmarks.manage) screen to view/add/edit/archive/delete cleaning-frequency
 * benchmarks. These drive the recommendation shown when building a schedule. */
export function ManageBenchmarksModal({
  siteId,
  branches,
  categories,
  benchmarks,
  onClose,
  onChanged,
}: {
  siteId: string
  branches: Branch[]
  categories: LocationCategory[]
  benchmarks: Benchmark[]
  onClose: () => void
  onChanged: (benchmarks: Benchmark[]) => void
}) {
  const [list, setList] = useState<Benchmark[]>(benchmarks)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived' | 'all'>('active')
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const catName = (id: string | null) => (id ? categories.find((c) => c.id === id)?.name ?? '—' : 'Any category')
  const branchName = (id: string | null) => (id ? branches.find((b) => b.id === id)?.name ?? '—' : null)

  function sync(next: Benchmark[]) { setList(next); onChanged(next) }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return list
      .filter((b) => (statusFilter === 'all' ? true : statusFilter === 'active' ? b.isActive : !b.isActive))
      .filter((b) => !q || b.name.toLowerCase().includes(q) || catName(b.categoryId).toLowerCase().includes(q))
      .sort((a, b) => catName(a.categoryId).localeCompare(catName(b.categoryId)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, query, statusFilter])

  async function run<T>(fn: () => Promise<T>) {
    setError(null)
    try { return await fn() } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong.'); return null }
  }

  async function toggleActive(b: Benchmark) {
    const updated = await run(() => repo.setBenchmarkActive(b.id, !b.isActive))
    if (updated) sync(list.map((x) => (x.id === updated.id ? updated : x)))
  }
  async function remove(b: Benchmark) {
    const ok = await run(async () => { await repo.deleteBenchmark(b.id); return true })
    if (ok) sync(list.filter((x) => x.id !== b.id))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={onClose}>
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-line px-6 py-4">
          <div>
            <div className="text-lg font-extrabold">Cleaning benchmarks</div>
            <div className="mt-0.5 text-sm text-ink-soft">Recommended cleans per day per category. Shown when building a schedule.</div>
          </div>
          <button onClick={() => setAddOpen(true)} className="ml-auto flex h-9.5 items-center gap-1.5 rounded-[11px] bg-verified px-4 text-sm font-bold text-white">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            Add benchmark
          </button>
        </div>

        <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-line-soft px-6 py-3">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search benchmarks" className="h-9 w-52 rounded-[11px] border border-line bg-app px-3 text-sm outline-none focus:border-stroke-soft" />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className="h-9 rounded-lg border border-line bg-white px-2.5 text-sm">
            <option value="active">Active</option>
            <option value="archived">Archived</option>
            <option value="all">All</option>
          </select>
        </div>

        {error && <div className="mx-6 mt-3 rounded-xl border border-overdue/30 bg-overdue/5 px-4 py-2.5 text-[13px] font-medium text-overdue">{error}</div>}

        <div className="flex-1 overflow-auto p-6">
          {addOpen && (
            <BenchmarkForm siteId={siteId} branches={branches} categories={categories} onCancel={() => setAddOpen(false)} onSaved={(b) => { sync([...list, b]); setAddOpen(false) }} onError={setError} />
          )}
          <div className="flex flex-col gap-2">
            {filtered.length === 0 && <div className="rounded-2xl border border-dashed border-dash py-8 text-center text-sm text-muted">No benchmarks match this view.</div>}
            {filtered.map((b) => {
              if (editingId === b.id) return <EditBenchmarkRow key={b.id} benchmark={b} onCancel={() => setEditingId(null)} onSaved={(u) => { sync(list.map((x) => (x.id === u.id ? u : x))); setEditingId(null) }} onError={setError} />
              return (
                <div key={b.id} className={`flex items-center gap-3 rounded-xl border border-line p-3 ${b.isActive ? 'bg-white' : 'bg-app opacity-70'}`}>
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-info/10 text-sm font-extrabold text-info">{b.requiredCleansPerDay}×</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold">{catName(b.categoryId)}</span>
                      {!b.isActive && <span className="rounded-full bg-line-soft px-1.75 py-0.5 text-[10px] font-bold uppercase text-ink-soft">Archived</span>}
                      <span className="rounded-full bg-ink/5 px-1.75 py-0.5 text-[10px] font-bold uppercase text-ink-soft">{b.isGlobal ? 'Global' : branchName(b.branchId)}</span>
                      {b.photoRequired && <span className="rounded-full bg-verified-tint px-1.75 py-0.5 text-[10px] font-bold uppercase text-verified-ink">Photo</span>}
                    </div>
                    <div className="font-mono text-[11px] text-muted">{b.requiredCleansPerDay} clean{b.requiredCleansPerDay === 1 ? '' : 's'} per day · {b.name}</div>
                  </div>
                  <button onClick={() => setEditingId(b.id)} className="h-9 flex-shrink-0 rounded-lg border border-line px-3 text-xs font-bold text-ink-soft">Edit</button>
                  <button onClick={() => toggleActive(b)} className="h-9 flex-shrink-0 rounded-lg border border-line px-3 text-xs font-bold text-ink-soft">{b.isActive ? 'Archive' : 'Restore'}</button>
                  <button onClick={() => remove(b)} className="h-9 flex-shrink-0 rounded-lg border border-line px-3 text-xs font-bold text-overdue">Delete</button>
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex flex-shrink-0 border-t border-line px-6 py-4">
          <button onClick={onClose} className="ml-auto h-11 rounded-xl border border-stroke px-6 text-sm font-bold text-ink">Done</button>
        </div>
      </div>
    </div>
  )
}

function BenchmarkForm({ siteId, branches, categories, onCancel, onSaved, onError }: { siteId: string; branches: Branch[]; categories: LocationCategory[]; onCancel: () => void; onSaved: (b: Benchmark) => void; onError: (m: string) => void }) {
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '')
  const [cleans, setCleans] = useState(4)
  const [photo, setPhoto] = useState(false)
  const [scope, setScope] = useState<'global' | string>('global')
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!categoryId || busy) return
    setBusy(true)
    try {
      const cat = categories.find((c) => c.id === categoryId)
      const created = await repo.createBenchmark(siteId, {
        name: `${cat?.name ?? 'Category'} benchmark`,
        categoryId,
        requiredCleansPerDay: cleans,
        photoRequired: photo,
        isGlobal: scope === 'global',
        branchId: scope === 'global' ? null : scope,
      })
      onSaved(created)
    } catch (e) { onError(e instanceof Error ? e.message : 'Could not create benchmark.') } finally { setBusy(false) }
  }

  return (
    <div className="mb-4 rounded-xl border border-line bg-app p-4">
      <div className="mb-2 text-sm font-bold">New benchmark</div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category">
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputCls}>
            {categories.filter((c) => c.isActive).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Cleans per day">
          <input type="number" min={1} max={24} value={cleans} onChange={(e) => setCleans(Math.max(1, Number(e.target.value)))} className={inputCls} />
        </Field>
        <Field label="Scope">
          <select value={scope} onChange={(e) => setScope(e.target.value)} className={inputCls}>
            <option value="global">All branches</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <Field label="Photo proof">
          <label className="flex h-10 items-center gap-2 rounded-xl border border-line px-3 text-sm font-semibold text-ink-soft">
            <input type="checkbox" checked={photo} onChange={(e) => setPhoto(e.target.checked)} /> Required
          </label>
        </Field>
      </div>
      <div className="mt-3 flex gap-2">
        <button onClick={save} disabled={busy || !categoryId} className="h-10 flex-1 rounded-xl bg-verified text-sm font-bold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Add benchmark'}</button>
        <button onClick={onCancel} className="h-10 flex-1 rounded-xl border border-stroke text-sm font-bold text-ink">Cancel</button>
      </div>
    </div>
  )
}

function EditBenchmarkRow({ benchmark, onCancel, onSaved, onError }: { benchmark: Benchmark; onCancel: () => void; onSaved: (b: Benchmark) => void; onError: (m: string) => void }) {
  const [cleans, setCleans] = useState(benchmark.requiredCleansPerDay)
  const [photo, setPhoto] = useState(benchmark.photoRequired)
  const [busy, setBusy] = useState(false)

  async function save() {
    if (busy) return
    setBusy(true)
    try {
      const updated = await repo.updateBenchmark(benchmark.id, { requiredCleansPerDay: cleans, photoRequired: photo })
      onSaved(updated)
    } catch (e) { onError(e instanceof Error ? e.message : 'Could not save benchmark.') } finally { setBusy(false) }
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-stroke-soft bg-white p-3">
      <span className="text-xs font-bold text-ink-soft">Cleans/day</span>
      <input type="number" min={1} max={24} value={cleans} onChange={(e) => setCleans(Math.max(1, Number(e.target.value)))} className="h-9 w-20 rounded-lg border border-line bg-app px-2 text-sm" />
      <label className="flex items-center gap-1.5 text-xs font-semibold text-ink-soft"><input type="checkbox" checked={photo} onChange={(e) => setPhoto(e.target.checked)} /> Photo</label>
      <div className="flex-1" />
      <button onClick={save} disabled={busy} className="h-9 rounded-lg bg-verified px-3 text-xs font-bold text-white disabled:opacity-50">{busy ? '…' : 'Save'}</button>
      <button onClick={onCancel} className="h-9 rounded-lg border border-stroke px-3 text-xs font-bold text-ink">Cancel</button>
    </div>
  )
}
