import { useEffect, useMemo, useState } from 'react'
import { StatusPill } from '../../components/ui/StatusPill'
import { Field, inputCls, ModalShell } from '../../components/ui/Modal'
import { useAdminAuth } from '../../contexts/AdminAuthContext'
import { useBranch } from '../../contexts/BranchContext'
import { BRANCH_STATUS_LABELS, SA_PROVINCES, canManageBranches, effectiveStatus } from '../../lib/domain'
import { repo } from '../../lib/repo'
import type { CreateBranchInput, UpdateBranchInput } from '../../lib/repo/types'
import type { Assignment, Branch, BranchStatus } from '../../lib/types'
import { AdminLayout } from '../AdminLayout'

const STATUS_FILTERS: Array<BranchStatus | 'all'> = ['all', 'active', 'inactive', 'archived', 'pending']

const statusTone: Record<BranchStatus, 'verified' | 'todo' | 'overdue' | 'info'> = {
  active: 'verified',
  inactive: 'todo',
  archived: 'overdue',
  pending: 'info',
}

export function Branches() {
  const { admin } = useAdminAuth()
  const { reload: reloadBranches } = useBranch()
  const [branches, setBranches] = useState<Branch[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<BranchStatus | 'all'>('all')
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<Branch | null>(null)
  const [statusTarget, setStatusTarget] = useState<{ branch: Branch; next: BranchStatus } | null>(null)

  const canManage = admin ? canManageBranches(admin) : false

  function load() {
    if (!admin) return
    Promise.all([repo.listBranches(admin.siteId, true), repo.getSiteAssignments(admin.siteId)]).then(([b, a]) => {
      setBranches(b)
      setAssignments(a)
      setLoading(false)
    })
  }

  useEffect(() => {
    if (!admin) return
    load()
    const unsub = repo.subscribe(admin.siteId, load)
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin])

  const countsByBranch = useMemo(() => {
    const map = new Map<string, { areas: Set<string>; open: number; overdue: number }>()
    for (const a of assignments) {
      const entry = map.get(a.branchId) ?? { areas: new Set<string>(), open: 0, overdue: 0 }
      entry.areas.add(a.areaId)
      if (a.status !== 'done') entry.open++
      if (effectiveStatus(a) === 'overdue') entry.overdue++
      map.set(a.branchId, entry)
    }
    return map
  }, [assignments])

  const filtered = branches.filter((b) => filter === 'all' || b.status === filter)

  async function afterMutation() {
    load()
    reloadBranches()
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
      <div className="flex h-16 flex-shrink-0 items-center gap-3 border-b border-line bg-white px-6">
        <h2 className="font-display text-[24px] font-bold uppercase leading-none tracking-[0.01em]">Branches</h2>
        <span className="text-sm text-muted">{branches.length} facilities</span>
        <div className="flex-1" />
        {canManage && (
          <button onClick={() => setAddOpen(true)} className="flex h-9.5 items-center gap-2 rounded-[11px] bg-verified px-4 text-sm font-bold text-white">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            Add branch
          </button>
        )}
      </div>

      {!canManage && (
        <div className="border-b border-line bg-app px-6 py-2 text-xs text-ink-soft">
          You can view branches, but only a superuser can add, edit, or archive them.
        </div>
      )}

      <div className="flex-1 overflow-auto p-6">
        <div className="mb-4 flex gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold ${filter === f ? 'bg-ink text-white' : 'border border-line bg-white text-ink-soft'}`}
            >
              {f === 'all' ? 'All' : BRANCH_STATUS_LABELS[f]}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2.5">
          {filtered.length === 0 && <div className="rounded-2xl border border-dashed border-dash p-8 text-center text-sm text-muted">No branches match this filter.</div>}
          {filtered.map((b) => {
            const counts = countsByBranch.get(b.id)
            return (
              <div key={b.id} className={`flex items-center gap-4 rounded-2xl border p-4 ${b.status === 'archived' ? 'border-line bg-app opacity-75' : 'border-line bg-white'}`}>
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[12px] bg-verified-tint text-verified-ink">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" /></svg>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-extrabold">{b.name}</span>
                    <StatusPill tone={statusTone[b.status]}>{BRANCH_STATUS_LABELS[b.status].toUpperCase()}</StatusPill>
                  </div>
                  <div className="mt-0.5 font-mono text-xs text-muted">
                    {b.code} · {b.provinceState}
                    {b.contactPerson ? ` · ${b.contactPerson}` : ''}
                  </div>
                </div>
                <div className="flex-shrink-0 text-right">
                  <div className="text-[13px] font-bold">{counts?.areas.size ?? 0} areas</div>
                  <div className="font-mono text-[11px] text-muted">
                    {counts?.open ?? 0} open{counts?.overdue ? ` · ${counts.overdue} overdue` : ''}
                  </div>
                </div>
                {canManage && (
                  <div className="flex flex-shrink-0 gap-2">
                    <button onClick={() => setEditing(b)} className="h-9 rounded-lg border border-line px-3 text-xs font-bold text-ink-soft">Edit</button>
                    {b.status === 'archived' ? (
                      <button onClick={() => setStatusTarget({ branch: b, next: 'active' })} className="h-9 rounded-lg border border-line px-3 text-xs font-bold text-verified-ink">Restore</button>
                    ) : (
                      <button onClick={() => setStatusTarget({ branch: b, next: 'archived' })} className="h-9 rounded-lg border border-line px-3 text-xs font-bold text-overdue">Archive</button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {addOpen && <BranchFormModal siteId={admin.siteId} onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); afterMutation() }} />}
      {editing && <BranchFormModal siteId={admin.siteId} branch={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); afterMutation() }} />}
      {statusTarget && (
        <BranchStatusModal
          branch={statusTarget.branch}
          next={statusTarget.next}
          onClose={() => setStatusTarget(null)}
          onDone={() => { setStatusTarget(null); afterMutation() }}
        />
      )}
    </AdminLayout>
  )
}

function BranchFormModal({ siteId, branch, onClose, onSaved }: { siteId: string; branch?: Branch; onClose: () => void; onSaved: () => void }) {
  const [provinceState, setProvinceState] = useState(branch?.provinceState ?? 'Gauteng')
  const [name, setName] = useState(branch?.name ?? '')
  const [code, setCode] = useState(branch?.code ?? '')
  const [address, setAddress] = useState(branch?.address ?? '')
  const [timezone, setTimezone] = useState(branch?.timezone ?? 'Africa/Johannesburg')
  const [contactPerson, setContactPerson] = useState(branch?.contactPerson ?? '')
  const [phone, setPhone] = useState(branch?.phone ?? '')
  const [email, setEmail] = useState(branch?.email ?? '')
  const [notes, setNotes] = useState(branch?.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!provinceState.trim() || !name.trim()) {
      setError('Province/State and Branch name are required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (branch) {
        const patch: UpdateBranchInput = {
          provinceState: provinceState.trim(), name: name.trim(), address: address.trim() || null,
          timezone: timezone.trim() || null, contactPerson: contactPerson.trim() || null,
          phone: phone.trim() || null, email: email.trim() || null, notes: notes.trim() || null,
        }
        await repo.updateBranch(branch.id, patch)
      } else {
        const input: CreateBranchInput = {
          provinceState: provinceState.trim(), name: name.trim(), code: code.trim() || undefined,
          address: address.trim() || null, timezone: timezone.trim() || null, contactPerson: contactPerson.trim() || null,
          phone: phone.trim() || null, email: email.trim() || null, notes: notes.trim() || null,
        }
        await repo.createBranch(siteId, input)
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the branch.')
      setSaving(false)
    }
  }

  return (
    <ModalShell title={branch ? 'Edit branch' : 'Add branch'} subtitle={branch ? branch.code : 'Facilities appear in the branch switcher immediately.'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex max-h-[70vh] flex-col gap-3 overflow-auto pr-1">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Province / State">
            <select value={provinceState} onChange={(e) => setProvinceState(e.target.value)} className={inputCls}>
              {SA_PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Branch code (optional)"><input value={code} onChange={(e) => setCode(e.target.value)} disabled={!!branch} className={inputCls} placeholder="Auto: GAU-SWH" /></Field>
        </div>
        <Field label="Branch name"><input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Southwest Hospital" /></Field>
        <Field label="Address"><input value={address} onChange={(e) => setAddress(e.target.value)} className={inputCls} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Timezone"><input value={timezone} onChange={(e) => setTimezone(e.target.value)} className={inputCls} /></Field>
          <Field label="Contact person"><input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} className={inputCls} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone"><input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} /></Field>
          <Field label="Email"><input value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} /></Field>
        </div>
        <Field label="Notes"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inputCls} resize-none`} /></Field>
        {error && <div className="text-[13px] font-medium text-overdue">{error}</div>}
        <div className="mt-1 flex gap-2">
          <button type="submit" disabled={saving} className="flex h-11 flex-1 items-center justify-center rounded-xl bg-verified text-sm font-bold text-white disabled:opacity-50">
            {saving ? 'Saving…' : branch ? 'Save changes' : 'Create branch'}
          </button>
          <button type="button" onClick={onClose} className="h-11 flex-1 rounded-xl border border-stroke text-sm font-bold text-ink">Cancel</button>
        </div>
      </form>
    </ModalShell>
  )
}

function BranchStatusModal({ branch, next, onClose, onDone }: { branch: Branch; next: BranchStatus; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const archiving = next === 'archived'

  async function handleConfirm() {
    if (!reason.trim()) return
    setBusy(true)
    setError(null)
    try {
      await repo.setBranchStatus(branch.id, next, reason.trim())
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the branch.')
      setBusy(false)
    }
  }

  return (
    <ModalShell
      title={archiving ? 'Archive this branch?' : 'Restore this branch?'}
      subtitle={
        archiving
          ? `${branch.name}'s open work will be cleared from active boards. Its reports, proof, and photos stay accessible.`
          : `${branch.name} will return to active assignment screens.`
      }
      onClose={onClose}
    >
      <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-soft">
        Reason (required)
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} autoFocus placeholder={archiving ? 'e.g. facility closed for renovation' : 'e.g. reopening after renovation'} className="rounded-xl border border-line px-3.5 py-2.5 text-sm font-normal text-ink outline-none focus:border-verified" />
      </label>
      {error && <div className="mt-3 text-[13px] font-medium text-overdue">{error}</div>}
      <div className="mt-4 flex gap-2">
        <button onClick={handleConfirm} disabled={busy || !reason.trim()} className={`flex h-11 flex-1 items-center justify-center rounded-xl text-sm font-bold text-white disabled:opacity-50 ${archiving ? 'bg-overdue' : 'bg-verified'}`}>
          {busy ? 'Working…' : archiving ? 'Archive branch' : 'Restore branch'}
        </button>
        <button onClick={onClose} className="h-11 flex-1 rounded-xl border border-stroke text-sm font-bold text-ink">Cancel</button>
      </div>
    </ModalShell>
  )
}
