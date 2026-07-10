import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAdminAuth } from '../../contexts/AdminAuthContext'
import { inActiveBranch, useBranch } from '../../contexts/BranchContext'
import { effectiveStatus } from '../../lib/domain'
import { repo } from '../../lib/repo'
import type { Area, Assignment } from '../../lib/types'
import { AdminLayout } from '../AdminLayout'

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

export function LiveMap() {
  const { admin } = useAdminAuth()
  const { activeBranchId, activeBranch } = useBranch()
  const navigate = useNavigate()
  const [areas, setAreas] = useState<Area[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!admin) return
    function load() {
      Promise.all([repo.listAreasForSite(admin!.siteId), repo.getSiteAssignments(admin!.siteId)]).then(
        ([ar, as]) => {
          setAreas(ar)
          setAssignments(as)
          setLoading(false)
        },
      )
    }
    load()
    const unsub = repo.subscribe(admin.siteId, load)
    return unsub
  }, [admin])

  const latestByArea = useMemo(() => {
    const map = new Map<string, Assignment>();
    for (const a of assignments) {
      const current = map.get(a.areaId)
      if (!current) {
        map.set(a.areaId, a)
        continue
      }
      const currentNotDone = current.status !== 'done'
      const aNotDone = a.status !== 'done'
      if (aNotDone && !currentNotDone) {
        map.set(a.areaId, a)
      } else if (aNotDone === currentNotDone) {
        const aTime = new Date(a.submittedAt ?? a.dueAt ?? 0).getTime()
        const currentTime = new Date(current.submittedAt ?? current.dueAt ?? 0).getTime()
        if (aTime > currentTime) map.set(a.areaId, a)
      }
    }
    return map
  }, [assignments])

  const floors = useMemo(() => {
    const groups = new Map<string, Area[]>()
    for (const area of areas) {
      if (!inActiveBranch(area.branchId, activeBranchId)) continue
      // The map mirrors Locations: deactivated areas drop off it the moment they're switched off.
      if (!area.active) continue
      const floor = floorOf(area.name)
      if (!groups.has(floor)) groups.set(floor, [])
      groups.get(floor)!.push(area)
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
  }, [areas, activeBranchId])

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
        <span className="text-sm text-muted">Status by floor · {activeBranch ? activeBranch.name : 'All branches'}</span>
        <div className="flex-1" />
        <span className="text-xs text-muted">Click a tile to manage it in Locations</span>
        <Legend />
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="flex flex-col gap-5">
          {floors.map(([floor, floorAreas]) => (
            <div key={floor} className="rounded-2xl border border-line bg-white p-4.5">
              <div className="mb-3 text-sm font-extrabold">{floor}</div>
              <div className="flex flex-wrap gap-2.5">
                {floorAreas.map((area) => {
                  const assignment = latestByArea.get(area.id)
                  const status = assignment ? effectiveStatus(assignment) : 'todo'
                  return (
                    <button
                      key={area.id}
                      type="button"
                      onClick={() => navigate('/admin/locations')}
                      title={`${area.name} — ${status.replace('_', ' ')} · click to manage in Locations`}
                      className={`flex h-16 w-28 flex-col justify-between rounded-xl p-2.5 text-left transition-transform hover:-translate-y-0.5 ${STATUS_STYLE[status]}`}
                    >
                      <div className="truncate text-[11px] font-bold leading-tight">{area.name}</div>
                      <div className="font-mono text-[10px] opacity-80">{area.code.split('-')[1]}</div>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AdminLayout>
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
