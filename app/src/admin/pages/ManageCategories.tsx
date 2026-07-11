import { useMemo, useState } from 'react'
import { Field, inputCls } from '../../components/ui/Modal'
import { repo } from '../../lib/repo'
import type { Area, Branch, LocationCategory } from '../../lib/types'

/** Superuser (or categories.manage) screen to view, search, add, edit, archive/restore,
 * reassign, and delete location categories. Opened from the Locations page. */
export function ManageCategoriesModal({
  siteId,
  branches,
  categories,
  areas,
  onClose,
  onChanged,
  onAreasChanged,
}: {
  siteId: string
  branches: Branch[]
  categories: LocationCategory[]
  areas: Area[]
  onClose: () => void
  onChanged: (categories: LocationCategory[]) => void
  onAreasChanged: () => void
}) {
  const [list, setList] = useState<LocationCategory[]>(categories)
  const [query, setQuery] = useState('')
  const [scopeFilter, setScopeFilter] = useState<'all' | 'global' | 'branch'>('all')
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived' | 'all'>('active')
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [reassignFor, setReassignFor] = useState<LocationCategory | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const usageById = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of areas) if (a.categoryId) m.set(a.categoryId, (m.get(a.categoryId) ?? 0) + 1)
    return m
  }, [areas])

  const branchName = (id: string | null) => (id ? branches.find((b) => b.id === id)?.name ?? '—' : null)

  function sync(next: LocationCategory[]) {
    setList(next)
    onChanged(next)
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return list
      .filter((c) => (statusFilter === 'all' ? true : statusFilter === 'active' ? c.isActive : !c.isActive))
      .filter((c) => (scopeFilter === 'all' ? true : scopeFilter === 'global' ? c.isGlobal : !c.isGlobal))
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q))
      .sort((a, b) => a.sortOrder - b.sortOrder)
  }, [list, query, scopeFilter, statusFilter])

  async function run<T>(fn: () => Promise<T>) {
    setError(null)
    try {
      return await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
      return null
    }
  }

  async function toggleActive(cat: LocationCategory) {
    const updated = await run(() => repo.setCategoryActive(cat.id, !cat.isActive))
    if (updated) sync(list.map((c) => (c.id === updated.id ? updated : c)))
  }

  async function move(cat: LocationCategory, dir: -1 | 1) {
    const ordered = [...list].sort((a, b) => a.sortOrder - b.sortOrder)
    const idx = ordered.findIndex((c) => c.id === cat.id)
    const swapWith = ordered[idx + dir]
    if (!swapWith) return
    const a = await run(() => repo.updateCategory(cat.id, { sortOrder: swapWith.sortOrder }))
    const b = a ? await run(() => repo.updateCategory(swapWith.id, { sortOrder: cat.sortOrder })) : null
    if (a && b) sync(list.map((c) => (c.id === a.id ? a : c.id === b.id ? b : c)))
  }

  async function remove(cat: LocationCategory) {
    const uses = usageById.get(cat.id) ?? 0
    if (uses > 0) {
      setReassignFor(cat)
      return
    }
    const ok = await run(async () => {
      await repo.deleteCategory(cat.id)
      return true
    })
    if (ok) sync(list.filter((c) => c.id !== cat.id))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={onClose}>
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-line px-6 py-4">
          <div>
            <div className="text-lg font-extrabold">Location categories</div>
            <div className="mt-0.5 text-sm text-ink-soft">{list.length} categories · edits apply everywhere immediately.</div>
          </div>
          <button onClick={() => setAddOpen(true)} className="ml-auto flex h-9.5 items-center gap-1.5 rounded-[11px] bg-verified px-4 text-sm font-bold text-white">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            Add category
          </button>
        </div>

        <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-line-soft px-6 py-3">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search categories" className="h-9 w-52 rounded-[11px] border border-line bg-app px-3 text-sm outline-none focus:border-stroke-soft" />
          <select value={scopeFilter} onChange={(e) => setScopeFilter(e.target.value as typeof scopeFilter)} className="h-9 rounded-lg border border-line bg-white px-2.5 text-sm">
            <option value="all">All scopes</option>
            <option value="global">Global</option>
            <option value="branch">Branch-specific</option>
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className="h-9 rounded-lg border border-line bg-white px-2.5 text-sm">
            <option value="active">Active</option>
            <option value="archived">Archived</option>
            <option value="all">All</option>
          </select>
        </div>

        {error && <div className="mx-6 mt-3 rounded-xl border border-overdue/30 bg-overdue/5 px-4 py-2.5 text-[13px] font-medium text-overdue">{error}</div>}

        <div className="flex-1 overflow-auto p-6">
          {addOpen && (
            <NewCategoryForm
              siteId={siteId}
              branches={branches}
              onCancel={() => setAddOpen(false)}
              onCreated={(c) => { sync([...list, c]); setAddOpen(false) }}
              onError={setError}
            />
          )}
          <div className="flex flex-col gap-2">
            {filtered.length === 0 && <div className="rounded-2xl border border-dashed border-dash py-8 text-center text-sm text-muted">No categories match this view.</div>}
            {filtered.map((cat) => {
              const uses = usageById.get(cat.id) ?? 0
              if (editingId === cat.id) {
                return <EditCategoryRow key={cat.id} cat={cat} onCancel={() => setEditingId(null)} onSaved={(u) => { sync(list.map((c) => (c.id === u.id ? u : c))); setEditingId(null) }} onError={setError} />
              }
              return (
                <div key={cat.id} className={`flex items-center gap-3 rounded-xl border border-line p-3 ${cat.isActive ? 'bg-white' : 'bg-app opacity-70'}`}>
                  <span className="h-4 w-4 flex-shrink-0 rounded-full border border-line" style={{ background: cat.color ?? '#ccc' }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold">{cat.icon ? `${cat.icon} ` : ''}{cat.name}</span>
                      {!cat.isActive && <span className="rounded-full bg-line-soft px-1.75 py-0.5 text-[10px] font-bold uppercase text-ink-soft">Archived</span>}
                      <span className="rounded-full bg-ink/5 px-1.75 py-0.5 text-[10px] font-bold uppercase text-ink-soft">{cat.isGlobal ? 'Global' : branchName(cat.branchId)}</span>
                    </div>
                    <div className="font-mono text-[11px] text-muted">{uses} location{uses === 1 ? '' : 's'}</div>
                  </div>
                  {cat.isActive && (
                    <div className="flex flex-shrink-0 flex-col">
                      <button onClick={() => move(cat, -1)} title="Move up" className="text-ink-soft hover:text-ink">▲</button>
                      <button onClick={() => move(cat, 1)} title="Move down" className="text-ink-soft hover:text-ink">▼</button>
                    </div>
                  )}
                  <button onClick={() => setEditingId(cat.id)} className="h-9 flex-shrink-0 rounded-lg border border-line px-3 text-xs font-bold text-ink-soft">Edit</button>
                  <button onClick={() => toggleActive(cat)} className="h-9 flex-shrink-0 rounded-lg border border-line px-3 text-xs font-bold text-ink-soft">
                    {cat.isActive ? 'Archive' : 'Restore'}
                  </button>
                  <button onClick={() => remove(cat)} className="h-9 flex-shrink-0 rounded-lg border border-line px-3 text-xs font-bold text-overdue">Delete</button>
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex flex-shrink-0 border-t border-line px-6 py-4">
          <button onClick={onClose} className="ml-auto h-11 rounded-xl border border-stroke px-6 text-sm font-bold text-ink">Done</button>
        </div>
      </div>

      {reassignFor && (
        <ReassignModal
          from={reassignFor}
          categories={list.filter((c) => c.id !== reassignFor.id && c.isActive)}
          count={usageById.get(reassignFor.id) ?? 0}
          onCancel={() => setReassignFor(null)}
          onDone={() => { setReassignFor(null); onAreasChanged() }}
          onError={setError}
        />
      )}
    </div>
  )
}

function NewCategoryForm({ siteId, branches, onCancel, onCreated, onError }: { siteId: string; branches: Branch[]; onCancel: () => void; onCreated: (c: LocationCategory) => void; onError: (m: string) => void }) {
  const [name, setName] = useState('')
  const [color, setColor] = useState('#35668C')
  const [icon, setIcon] = useState('')
  const [scope, setScope] = useState<'global' | string>('global')
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!name.trim() || busy) return
    setBusy(true)
    try {
      const created = await repo.createCategory(siteId, {
        name: name.trim(),
        color,
        icon: icon.trim() || null,
        isGlobal: scope === 'global',
        branchId: scope === 'global' ? null : scope,
      })
      onCreated(created)
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not create category.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mb-4 rounded-xl border border-line bg-app p-4">
      <div className="mb-2 text-sm font-bold">New category</div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Isolation Ward" />
        </Field>
        <Field label="Scope">
          <select value={scope} onChange={(e) => setScope(e.target.value)} className={inputCls}>
            <option value="global">All branches</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <Field label="Color">
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-full rounded-xl border border-line" />
        </Field>
        <Field label="Icon (optional)">
          <input value={icon} onChange={(e) => setIcon(e.target.value)} className={inputCls} placeholder="🧴" />
        </Field>
      </div>
      <div className="mt-3 flex gap-2">
        <button onClick={save} disabled={busy || !name.trim()} className="h-10 flex-1 rounded-xl bg-verified text-sm font-bold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Add category'}</button>
        <button onClick={onCancel} className="h-10 flex-1 rounded-xl border border-stroke text-sm font-bold text-ink">Cancel</button>
      </div>
    </div>
  )
}

function EditCategoryRow({ cat, onCancel, onSaved, onError }: { cat: LocationCategory; onCancel: () => void; onSaved: (c: LocationCategory) => void; onError: (m: string) => void }) {
  const [name, setName] = useState(cat.name)
  const [color, setColor] = useState(cat.color ?? '#35668C')
  const [icon, setIcon] = useState(cat.icon ?? '')
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!name.trim() || busy) return
    setBusy(true)
    try {
      const updated = await repo.updateCategory(cat.id, { name: name.trim(), color, icon: icon.trim() || null })
      onSaved(updated)
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not save category.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-stroke-soft bg-white p-3">
      <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-11 flex-shrink-0 rounded-lg border border-line" />
      <input value={name} onChange={(e) => setName(e.target.value)} className={`${inputCls} flex-1`} />
      <input value={icon} onChange={(e) => setIcon(e.target.value)} className="h-10 w-16 rounded-xl border border-line bg-app px-2 text-center text-sm" placeholder="icon" />
      <button onClick={save} disabled={busy || !name.trim()} className="h-9 rounded-lg bg-verified px-3 text-xs font-bold text-white disabled:opacity-50">{busy ? '…' : 'Save'}</button>
      <button onClick={onCancel} className="h-9 rounded-lg border border-stroke px-3 text-xs font-bold text-ink">Cancel</button>
    </div>
  )
}

function ReassignModal({ from, categories, count, onCancel, onDone, onError }: { from: LocationCategory; categories: LocationCategory[]; count: number; onCancel: () => void; onDone: () => void; onError: (m: string) => void }) {
  const [toId, setToId] = useState(categories[0]?.id ?? '')
  const [busy, setBusy] = useState(false)

  async function reassign() {
    if (!toId || busy) return
    setBusy(true)
    try {
      await repo.reassignCategory(from.id, toId)
      onDone()
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not reassign.')
      onCancel()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-6" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <div className="text-lg font-extrabold">Reassign “{from.name}”</div>
        <p className="mt-2 text-sm text-ink-soft">
          This category is used by {count} location{count === 1 ? '' : 's'}. Move them to another category, then it can be deleted.
        </p>
        {categories.length === 0 ? (
          <p className="mt-3 text-sm font-medium text-overdue">Create another active category first — there's nowhere to move these locations.</p>
        ) : (
          <select value={toId} onChange={(e) => setToId(e.target.value)} className={`${inputCls} mt-3`}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <div className="mt-5 flex gap-2">
          <button onClick={reassign} disabled={busy || !toId} className="h-11 flex-1 rounded-xl bg-verified text-sm font-bold text-white disabled:opacity-50">{busy ? 'Moving…' : `Reassign ${count}`}</button>
          <button onClick={onCancel} className="h-11 flex-1 rounded-xl border border-stroke text-sm font-bold text-ink">Cancel</button>
        </div>
      </div>
    </div>
  )
}
