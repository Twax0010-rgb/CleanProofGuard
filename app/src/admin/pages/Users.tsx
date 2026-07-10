import { useEffect, useMemo, useState } from 'react'
import { Avatar } from '../../components/ui/Avatar'
import { Field, inputCls } from '../../components/ui/Modal'
import { useAdminAuth } from '../../contexts/AdminAuthContext'
import { useBranch } from '../../contexts/BranchContext'
import {
  ADMIN_FEATURE_LABELS,
  ADMIN_FEATURES,
  ADMIN_ROLE_LABELS,
  roleDefaultPermissions,
} from '../../lib/domain'
import { repo } from '../../lib/repo'
import type { CreateAdminInput, UpdateAdminAccessInput } from '../../lib/repo/types'
import type { AdminFeature, AdminRole, AdminUser, Branch, PermissionAction, PermissionOverrides } from '../../lib/types'
import { AdminLayout } from '../AdminLayout'

const ASSIGNABLE_ROLES: AdminRole[] = ['superuser', 'super_admin', 'manager', 'supervisor', 'read_only']
const ACTIONS: PermissionAction[] = ['view', 'manage', 'export']

function accessSummary(a: AdminUser, branches: Branch[]): string {
  if (a.branchAll) return 'All branches'
  if (a.branchIds.length === 0) return 'No branch access'
  if (a.branchIds.length === 1) return branches.find((b) => b.id === a.branchIds[0])?.name ?? '1 branch'
  return `${a.branchIds.length} branches`
}

export function Users() {
  const { admin } = useAdminAuth()
  const { reload: reloadBranches } = useBranch()
  const [admins, setAdmins] = useState<AdminUser[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<AdminUser | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  function load() {
    if (!admin) return
    Promise.all([repo.listAdmins(admin.siteId), repo.listBranches(admin.siteId, false)]).then(([a, b]) => {
      setAdmins(a)
      setBranches(b)
      setLoading(false)
    })
  }

  useEffect(() => {
    if (!admin) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin])

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
        <h2 className="font-display text-[24px] font-bold uppercase leading-none tracking-[0.01em]">Users &amp; Access</h2>
        <span className="text-sm text-muted">{admins.length} admin accounts</span>
        <div className="flex-1" />
        <button onClick={() => setAddOpen(true)} className="flex h-9.5 items-center gap-2 rounded-[11px] bg-verified px-4 text-sm font-bold text-white">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          Add user
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="flex flex-col gap-2.5">
          {admins.map((a) => (
            <div key={a.id} className="flex items-center gap-4 rounded-2xl border border-line bg-white p-4">
              <Avatar initials={a.initials} colorHex={a.colorHex} size={44} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-extrabold">{a.name}</span>
                  <span className="rounded-full bg-line-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-soft">{ADMIN_ROLE_LABELS[a.role]}</span>
                </div>
                <div className="mt-0.5 font-mono text-xs text-muted">{a.email}</div>
              </div>
              <div className="flex-shrink-0 text-right">
                <div className="text-[13px] font-bold">{accessSummary(a, branches)}</div>
                <div className="font-mono text-[11px] text-muted">
                  {a.defaultBranchId ? `Default: ${branches.find((b) => b.id === a.defaultBranchId)?.code ?? '—'}` : 'No default'}
                </div>
              </div>
              <button onClick={() => setEditing(a)} className="h-9 flex-shrink-0 rounded-lg border border-line px-3 text-xs font-bold text-ink-soft">Manage access</button>
            </div>
          ))}
        </div>
      </div>

      {editing && (
        <AccessModal
          user={editing}
          branches={branches}
          isSelf={editing.id === admin.id}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setAdmins((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
            setEditing(null)
            if (updated.id === admin.id) reloadBranches()
          }}
        />
      )}

      {addOpen && (
        <AddAdminModal
          siteId={admin.siteId}
          branches={branches}
          onClose={() => setAddOpen(false)}
          onCreated={(created) => {
            setAdmins((prev) => (prev.some((a) => a.id === created.id) ? prev : [...prev, created]))
            setAddOpen(false)
          }}
        />
      )}
    </AdminLayout>
  )
}

function AddAdminModal({ siteId, branches, onClose, onCreated }: { siteId: string; branches: Branch[]; onClose: () => void; onCreated: (a: AdminUser) => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [title, setTitle] = useState('')
  const [role, setRole] = useState<AdminRole>('manager')
  const [branchAll, setBranchAll] = useState(false)
  const [branchIds, setBranchIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function toggleBranch(id: string) {
    setBranchIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim() || !email.trim()) {
      setError('Name and email are required.')
      return
    }
    if (!branchAll && branchIds.length === 0) {
      setError('Give them at least one branch (or All branches) — otherwise they sign in to an empty dashboard.')
      return
    }
    setSubmitting(true)
    try {
      const input: CreateAdminInput = {
        name: name.trim(),
        email: email.trim(),
        title: title.trim() || 'Dashboard user',
        role,
        branchAll,
        branchIds,
        defaultBranchId: branchAll ? null : branchIds[0] ?? null,
      }
      const created = await repo.createAdmin(siteId, input)
      onCreated(created)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the user.')
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={onClose}>
      <form onSubmit={handleSubmit} className="flex max-h-[86vh] w-full max-w-md flex-col gap-3 overflow-auto rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <div>
          <div className="text-lg font-extrabold">Add dashboard user</div>
          <div className="mt-0.5 text-sm text-ink-soft">They sign in at /admin/auth. Demo mode: the password is demo1234 for every account.</div>
        </div>
        <Field label="Full name">
          <input required value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Lerato Molefe" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email">
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="lerato@cleanproofguard.com" />
          </Field>
          <Field label="Job title">
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="Hospital Admin" />
          </Field>
        </div>
        <Field label="Role">
          <select value={role} onChange={(e) => setRole(e.target.value as AdminRole)} className={inputCls}>
            {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{ADMIN_ROLE_LABELS[r]}</option>)}
          </select>
        </Field>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-semibold text-ink-soft">Branch access</span>
            <label className="flex items-center gap-1.5 text-xs font-bold text-ink-soft">
              <input type="checkbox" checked={branchAll} onChange={(e) => setBranchAll(e.target.checked)} />
              All branches
            </label>
          </div>
          <div className={`max-h-40 overflow-auto rounded-xl border border-line ${branchAll ? 'opacity-50' : ''}`}>
            {branches.map((b) => (
              <label key={b.id} className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-app">
                <input type="checkbox" checked={branchAll || branchIds.includes(b.id)} disabled={branchAll} onChange={() => toggleBranch(b.id)} />
                <span className="flex-1 font-semibold">{b.name}</span>
                <span className="font-mono text-xs text-muted">{b.code}</span>
              </label>
            ))}
          </div>
        </div>
        {error && <div className="text-[13px] font-medium text-overdue">{error}</div>}
        <div className="mt-1 flex gap-2">
          <button type="submit" disabled={submitting} className="flex h-11 flex-1 items-center justify-center rounded-xl bg-verified text-sm font-bold text-white disabled:opacity-50">
            {submitting ? 'Creating…' : 'Add user'}
          </button>
          <button type="button" onClick={onClose} className="h-11 flex-1 rounded-xl border border-stroke text-sm font-bold text-ink">Cancel</button>
        </div>
      </form>
    </div>
  )
}

function AccessModal({ user, branches, isSelf, onClose, onSaved }: { user: AdminUser; branches: Branch[]; isSelf: boolean; onClose: () => void; onSaved: (u: AdminUser) => void }) {
  const [role, setRole] = useState<AdminRole>(user.role)
  const [branchAll, setBranchAll] = useState(user.branchAll)
  const [branchIds, setBranchIds] = useState<string[]>(user.branchIds)
  const [defaultBranchId, setDefaultBranchId] = useState<string | null>(user.defaultBranchId)
  const [overrides, setOverrides] = useState<PermissionOverrides>(structuredClone(user.permissions ?? {}))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const effectiveAllowed = branchAll ? branches.map((b) => b.id) : branchIds

  function toggleBranch(id: string) {
    setBranchIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  // Effective permission for the *previewed* role + current overrides.
  function effective(feature: AdminFeature, action: PermissionAction): boolean {
    if (role === 'superuser') return true
    const ov = overrides[feature]?.[action]
    if (ov !== undefined) return ov
    return roleDefaultPermissions(role)[feature]?.[action] ?? false
  }

  function togglePermission(feature: AdminFeature, action: PermissionAction) {
    const current = effective(feature, action)
    setOverrides((prev) => {
      const next = structuredClone(prev)
      next[feature] = { ...(next[feature] ?? {}), [action]: !current }
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    // Guard against a superuser locking themselves out of every branch.
    if (isSelf && !branchAll && branchIds.length === 0) {
      setError("You can't remove all of your own branch access — you'd lock yourself out.")
      setSaving(false)
      return
    }
    const patch: UpdateAdminAccessInput = {
      role,
      branchAll,
      branchIds,
      defaultBranchId: defaultBranchId && effectiveAllowed.includes(defaultBranchId) ? defaultBranchId : (effectiveAllowed[0] ?? null),
      permissions: overrides,
    }
    try {
      const updated = await repo.updateAdminAccess(user.id, patch)
      onSaved(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
      setSaving(false)
    }
  }

  const byProvince = useMemo(() => {
    const map = new Map<string, Branch[]>()
    for (const b of branches) {
      const list = map.get(b.provinceState) ?? []
      list.push(b)
      map.set(b.provinceState, list)
    }
    return [...map.entries()]
  }, [branches])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={onClose}>
      <div className="flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white" onClick={(e) => e.stopPropagation()}>
        <div className="flex-shrink-0 border-b border-line px-6 py-4">
          <div className="text-lg font-extrabold">Access · {user.name}</div>
          <div className="mt-0.5 text-sm text-ink-soft">Control which branches and features this user can reach. Enforced on the backend.</div>
        </div>

        <div className="flex flex-col gap-5 overflow-auto p-6">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Role">
              <select value={role} onChange={(e) => setRole(e.target.value as AdminRole)} className={inputCls}>
                {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{ADMIN_ROLE_LABELS[r]}</option>)}
              </select>
            </Field>
            <Field label="Default branch (first-login landing)">
              <select value={defaultBranchId ?? ''} onChange={(e) => setDefaultBranchId(e.target.value || null)} className={inputCls} disabled={branchAll && branches.length === 0}>
                <option value="">All assigned</option>
                {branches.filter((b) => branchAll || branchIds.includes(b.id)).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold text-ink-soft">Branch access {!branchAll && <span className="text-muted">· {branchIds.length} selected</span>}</div>
              <div className="flex gap-1.5">
                <button onClick={() => { setBranchAll(true) }} className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${branchAll ? 'bg-ink text-white' : 'border border-line text-ink-soft'}`}>All branches</button>
                <button onClick={() => { setBranchAll(false); setBranchIds(branches.map((b) => b.id)) }} className="rounded-full border border-line px-2.5 py-1 text-[11px] font-bold text-ink-soft">Select all</button>
                <button onClick={() => { setBranchAll(false); setBranchIds([]) }} className="rounded-full border border-line px-2.5 py-1 text-[11px] font-bold text-overdue">Clear</button>
              </div>
            </div>
            <div className={`rounded-xl border border-line ${branchAll ? 'opacity-50' : ''}`}>
              {byProvince.map(([province, list]) => (
                <div key={province} className="border-b border-line-softer last:border-b-0">
                  <div className="px-3 pt-2 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-muted">{province}</div>
                  {list.map((b) => (
                    <label key={b.id} className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-app">
                      <input type="checkbox" checked={branchAll || branchIds.includes(b.id)} disabled={branchAll} onChange={() => toggleBranch(b.id)} />
                      <span className="flex-1 font-semibold">{b.name}</span>
                      <span className="font-mono text-xs text-muted">{b.code}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-xs font-semibold text-ink-soft">Feature permissions {role === 'superuser' && <span className="text-muted">· superuser has full access</span>}</div>
            <div className="overflow-hidden rounded-xl border border-line">
              <div className="grid grid-cols-[1.6fr_repeat(3,1fr)] bg-app text-[10px] font-bold uppercase tracking-wide text-muted">
                <div className="px-3 py-2">Feature</div>
                {ACTIONS.map((a) => <div key={a} className="px-3 py-2 text-center">{a}</div>)}
              </div>
              {ADMIN_FEATURES.map((f) => (
                <div key={f} className="grid grid-cols-[1.6fr_repeat(3,1fr)] border-t border-line-softer text-[13px]">
                  <div className="px-3 py-2 font-semibold">{ADMIN_FEATURE_LABELS[f]}</div>
                  {ACTIONS.map((a) => (
                    <label key={a} className="flex items-center justify-center py-2">
                      <input type="checkbox" checked={effective(f, a)} disabled={role === 'superuser'} onChange={() => togglePermission(f, a)} />
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {error && <div className="text-[13px] font-medium text-overdue">{error}</div>}
        </div>

        <div className="flex flex-shrink-0 gap-2 border-t border-line px-6 py-4">
          <button onClick={handleSave} disabled={saving} className="flex h-11 flex-1 items-center justify-center rounded-xl bg-verified text-sm font-bold text-white disabled:opacity-50">
            {saving ? 'Saving…' : 'Save access'}
          </button>
          <button onClick={onClose} className="h-11 flex-1 rounded-xl border border-stroke text-sm font-bold text-ink">Cancel</button>
        </div>
      </div>
    </div>
  )
}
