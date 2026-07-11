import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAdminAuth } from '../../contexts/AdminAuthContext'
import { inActiveBranch, useBranch } from '../../contexts/BranchContext'
import { categorySlugLabel, effectiveStatus } from '../../lib/domain'
import { repo } from '../../lib/repo'
import type { Area, Assignment, LocationCategory } from '../../lib/types'
import { AdminLayout } from '../AdminLayout'

type GroupBy = 'category' | 'floor' | 'branch'
const GROUP_BY_KEY = 'cpg_livemap_groupby'

function floorOf(areaName: string): string {
  const match = areaName.match(/^L(\d+)/)
  return match ? `Level ${match[1]}` : 'Other areas'
}

const STATUS_STYLE: Record<string, string> = {
  done: 'bg-verified text-white',
  in_progress: 'bg-info text-white',
  overdue: 'bg-overdue text-white',
  todo: 'bg-line-soft text-ink-soft',
}

interface Counts { total: number; done: number; inProgress: number; overdue: number; todo: number }

export function LiveMap() {
  const { admin } = useAdminAuth()
  const { activeBranchId, activeBranch, branches } = useBranch()
  const navigate = useNavigate()
  const [areas, setAreas] = useState<Area[]>([])
  const [categories, setCategories] = useState<LocationCategory[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  const [groupBy, setGroupBy] = useState<GroupBy>(() => (localStorage.getItem(GROUP_BY_KEY) as GroupBy) || 'category')
  const [catFilter, setCatFilter] = useState<string>('all')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  useEffect(() => {
    localStorage.setItem(GROUP_BY_KEY, groupBy)
  }, [groupBy])

  useEffect(() => {
    if (!admin) return
    function load() {
      Promise.all([
        repo.listAreasForSite(admin!.siteId),
        repo.getSiteAssignments(admin!.siteId),
        repo.listCategories(admin!.siteId),
      ]).then(([ar, as, cs]) => {
        setAreas(ar)
        setAssignments(as)
        setCategories(cs)
        setLoading(false)
      })
    }
    load()
    const unsub = repo.subscribe(admin.siteId, load)
    return unsub
  }, [admin])

  const categoriesById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const branchesById = useMemo(() => new Map(branches.map((b) => [b.id, b])), [branches])

  const latestByArea = useMemo(() => {
    const map = new Map<string, Assignment>()
    for (const a of assignments) {
      const current = map.get(a.areaId)
      if (!current) { map.set(a.areaId, a); continue }
      const currentNotDone = current.status !== 'done'
      const aNotDone = a.status !== 'done'
      if (aNotDone && !currentNotDone) map.set(a.areaId, a)
      else if (aNotDone === currentNotDone) {
        const aTime = new Date(a.submittedAt ?? a.dueAt ?? 0).getTime()
        const currentTime = new Date(current.submittedAt ?? current.dueAt ?? 0).getTime()
        if (aTime > currentTime) map.set(a.areaId, a)
      }
    }
    return map
  }, [assignments])

  const statusOf = (area: Area) => {
    const assignment = latestByArea.get(area.id)
    return assignment ? effectiveStatus(assignment) : 'todo'
  }

  const visibleAreas = useMemo(
    () =>
      areas
        .filter((a) => inActiveBranch(a.branchId, activeBranchId))
        .filter((a) => a.active)
        .filter((a) => catFilter === 'all' || a.categoryId === catFilter),
    [areas, activeBranchId, catFilter],
  )

  const categoryLabel = (area: Area) => (area.categoryId && categoriesById.get(area.categoryId)?.name) || categorySlugLabel(area.category)
  const categoryColor = (area: Area) => (area.categoryId && categoriesById.get(area.categoryId)?.color) || null

  // Two-level grouping: a primary key (per groupBy) then floor within it (except when grouping by floor).
  const groups = useMemo(() => {
    const primaryKey = (a: Area) =>
      groupBy === 'category' ? categoryLabel(a) : groupBy === 'branch' ? branchesById.get(a.branchId)?.name ?? '—' : floorOf(a.name)
    const primarySort = (a: Area) =>
      groupBy === 'category' ? (a.categoryId ? categoriesById.get(a.categoryId)?.sortOrder ?? 999 : 999) : 0

    const byPrimary = new Map<string, { areas: Area[]; sort: number; color: string | null }>()
    for (const area of visibleAreas) {
      const key = primaryKey(area)
      if (!byPrimary.has(key)) byPrimary.set(key, { areas: [], sort: primarySort(area), color: groupBy === 'category' ? categoryColor(area) : null })
      byPrimary.get(key)!.areas.push(area)
    }
    return [...byPrimary.entries()]
      .sort(([ka, va], [kb, vb]) => va.sort - vb.sort || ka.localeCompare(kb, undefined, { numeric: true }))
      .map(([key, { areas: groupAreas, color }]) => {
        const counts: Counts = { total: groupAreas.length, done: 0, inProgress: 0, overdue: 0, todo: 0 }
        for (const a of groupAreas) {
          const s = statusOf(a)
          if (s === 'done') counts.done++
          else if (s === 'in_progress') counts.inProgress++
          else if (s === 'overdue') counts.overdue++
          else counts.todo++
        }
        // Secondary grouping by floor (skip when the primary already is floor).
        const floors = new Map<string, Area[]>()
        for (const a of groupAreas) {
          const f = groupBy === 'floor' ? '' : floorOf(a.name)
          if (!floors.has(f)) floors.set(f, [])
          floors.get(f)!.push(a)
        }
        const floorList = [...floors.entries()].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
        return { key, color, counts, floors: floorList }
      })
  }, [visibleAreas, groupBy, categoriesById, branchesById, latestByArea])

  function toggle(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

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
        <h2 className="font-display text-[24px] font-bold uppercase leading-none tracking-[0.01em]">Live map</h2>
        <span className="text-sm text-muted">By {groupBy} · {activeBranch ? activeBranch.name : 'All branches'}</span>
        <div className="flex-1" />
        <Legend />
      </div>

      <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-line-soft bg-app px-6 py-2.5">
        <span className="text-xs font-bold text-ink-soft">Group by</span>
        {(['category', 'floor', 'branch'] as GroupBy[]).map((g) => (
          <button
            key={g}
            onClick={() => setGroupBy(g)}
            className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${groupBy === g ? 'bg-ink text-white' : 'border border-line bg-white text-ink-soft'}`}
          >
            {g}
          </button>
        ))}
        <div className="mx-1 h-4 w-px bg-line" />
        <span className="text-xs font-bold text-ink-soft">Category</span>
        <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="h-8 rounded-lg border border-line bg-white px-2.5 text-xs font-bold">
          <option value="all">All categories</option>
          {categories.filter((c) => c.isActive).sort((a, b) => a.sortOrder - b.sortOrder).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <span className="ml-auto text-xs text-muted">Click a tile to manage it in Locations</span>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="flex flex-col gap-4">
          {groups.length === 0 && <div className="rounded-2xl border border-dashed border-dash py-10 text-center text-sm text-muted">No areas to show for this view.</div>}
          {groups.map(({ key, color, counts, floors }) => {
            const isCollapsed = collapsed.has(key)
            return (
              <div key={key} className="overflow-hidden rounded-2xl border border-line bg-white">
                <button
                  onClick={() => toggle(key)}
                  className="flex w-full items-center gap-3 px-4.5 py-3.5 text-left"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`flex-shrink-0 text-ink-soft transition-transform ${isCollapsed ? '-rotate-90' : ''}`}>
                    <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {color && <span className="h-3 w-3 flex-shrink-0 rounded-full" style={{ background: color }} />}
                  <span className="text-sm font-extrabold">{key}</span>
                  <span className="text-xs text-muted">{counts.total} area{counts.total === 1 ? '' : 's'}</span>
                  <div className="ml-auto flex items-center gap-3 text-[11px] font-bold">
                    <CountPill className="bg-verified-tint text-verified-ink" n={counts.done} label="clean" />
                    <CountPill className="bg-info/10 text-info" n={counts.inProgress} label="in progress" />
                    <CountPill className="bg-overdue-tint text-overdue" n={counts.overdue} label="overdue" />
                    <CountPill className="bg-line-soft text-ink-soft" n={counts.todo} label="not recorded" />
                  </div>
                </button>
                {!isCollapsed && (
                  <div className="flex flex-col gap-3 border-t border-line-softer px-4.5 py-4">
                    {floors.map(([floor, floorAreas]) => (
                      <div key={floor || 'flat'}>
                        {floor && <div className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{floor}</div>}
                        <div className="flex flex-wrap gap-2.5">
                          {floorAreas.map((area) => {
                            const status = statusOf(area)
                            const cColor = categoryColor(area)
                            return (
                              <button
                                key={area.id}
                                type="button"
                                onClick={() => navigate('/admin/locations')}
                                title={`${area.name} — ${status.replace('_', ' ')} · ${categoryLabel(area)} · click to manage`}
                                className={`relative flex h-16 w-28 flex-col justify-between rounded-xl p-2.5 text-left transition-transform hover:-translate-y-0.5 ${STATUS_STYLE[status]}`}
                              >
                                {cColor && groupBy !== 'category' && (
                                  <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full ring-1 ring-white/60" style={{ background: cColor }} />
                                )}
                                <div className="truncate text-[11px] font-bold leading-tight">{area.name}</div>
                                <div className="font-mono text-[10px] opacity-80">{area.code.split('-')[1]}</div>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </AdminLayout>
  )
}

function CountPill({ n, label, className }: { n: number; label: string; className: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 ${n === 0 ? 'bg-line-soft text-muted' : className}`}>
      {n} {label}
    </span>
  )
}

function Legend() {
  const items: Array<[string, string]> = [
    ['bg-verified', 'Done'],
    ['bg-info', 'In progress'],
    ['bg-overdue', 'Overdue'],
    ['bg-line-soft', 'To do'],
  ]
  return (
    <div className="flex items-center gap-3.5">
      {items.map(([cls, label]) => (
        <div key={label} className="flex items-center gap-1.5 text-xs text-ink-soft">
          <span className={`h-2.5 w-2.5 rounded-full ${cls}`} />
          {label}
        </div>
      ))}
    </div>
  )
}
