import { useEffect, useMemo, useState } from 'react'
import { Avatar } from '../../components/ui/Avatar'
import { Field, inputCls } from '../../components/ui/Modal'
import { useAdminAuth } from '../../contexts/AdminAuthContext'
import { useBranch } from '../../contexts/BranchContext'
import {
  ACCOUNT_STATUS_LABELS,
  ADMIN_FEATURE_LABELS,
  ADMIN_FEATURES,
  ADMIN_ROLE_LABELS,
  generateStaffCode,
  roleDefaultPermissions,
} from '../../lib/domain'
import { repo } from '../../lib/repo'
import type { CreateAdminInput, UpdateAdminAccessInput, UpdateAdminInput } from '../../lib/repo/types'
import type { AccountStatus, AdminFeature, AdminRole, AdminUser, Branch, PermissionAction, PermissionOverrides } from '../../lib/types'
import { AdminLayout } from '../AdminLayout'

const ASSIGNABLE_ROLES: AdminRole[] = ['superuser', 'super_admin', 'manager', 'supervisor', 'read_only']
const ACTIONS: PermissionAction[] = ['view', 'manage', 'export']
// Admins only ever occupy these three lifecycle states ('deleted' is staff-only).
const STATUS_FILTERS: Array<AccountStatus | 'all'> = ['all', 'active', 'disabled', 'archived']

function accessSummary(a: AdminUser, branches: Branch[]): string {
  if (a.branchAll) return 'All branches'
  if (a.branchIds.length === 0) return 'No branch access'
  if (a.branchIds.length === 1) return branches.find((b) => b.id === a.branchIds[0])?.name ?? '1 branch'
  return `${a.branchIds.length} branches`
}

/** A throwaway starting password for a new dashboard login — they change it after first sign-in. */
function genPassword(): string {
  const n = Math.floor(1000 + Math.random() * 9000)
  return `Cpg-${n}-clean`
}

export function Users() {
  const { admin } = useAdminAuth()
  const { reload: reloadBranches, activeBranch } = useBranch()
  const [admins, setAdmins] = useState<AdminUser[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<AccountStatus | 'all'>('all')
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<AdminUser | null>(null)
  const [managing, setManaging] = useState<AdminUser | null>(null)
  const [confirming, setConfirming] = useState<AdminUser | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)

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

  const canManage = admin?.role === 'superuser'

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return admins
      // Archived users only show under their own tab, never in "All".
      .filter((a) => (filter === 'all' ? a.accountStatus !== 'archived' : a.accountStatus === filter))
      .filter((a) => {
        if (!q) return true
        const branchText = a.branchAll ? 'all branches' : a.branchIds.map((id) => branches.find((b) => b.id === id)?.name ?? '').join(' ')
        return (
          a.name.toLowerCase().includes(q) ||
          (a.staffCode ?? '').toLowerCase().includes(q) ||
          a.email.toLowerCase().includes(q) ||
          (a.phone ?? '').toLowerCase().includes(q) ||
          ADMIN_ROLE_LABELS[a.role].toLowerCase().includes(q) ||
          branchText.toLowerCase().includes(q)
        )
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [admins, query, filter, branches])

  async function applyStatus(user: AdminUser, status: 'active' | 'disabled' | 'archived') {
    setRowError(null)
    try {
      const updated = await repo.setAdminStatus(user.id, status)
      setAdmins((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
    } catch (err) {
      setRowError(err instanceof Error ? err.message : 'Could not update the user.')
    } finally {
      setConfirming(null)
    }
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
        <h2 className="font-display text-[24px] font-bold uppercase leading-none tracking-[0.01em]">Users &amp; Access</h2>
        <span className="text-sm text-muted">
          {filtered.length} admin accounts · {activeBranch ? activeBranch.name : 'All branches'}
        </span>
        <div className="flex-1" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, ID, email, role, or branch"
          className="h-9.5 w-72 rounded-[11px] border border-line bg-app px-3 text-sm outline-none focus:border-stroke-soft"
        />
        {canManage && (
          <button
            onClick={() => setAddOpen(true)}
            className="flex h-9.5 items-center gap-1.5 rounded-[11px] bg-verified px-4 text-sm font-bold text-white"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add user
          </button>
        )}
      </div>
      {!canManage && (
        <div className="border-b border-line bg-app px-6 py-2 text-xs text-ink-soft">
          Your role can view dashboard users, but only a superuser can add, edit, archive, or change access.
        </div>
      )}

      <div className="flex-1 overflow-auto p-6">
        <div className="mb-4 flex gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-bold ${
                filter === f ? 'bg-ink text-white' : 'border border-line bg-white text-ink-soft'
              }`}
            >
              {f === 'all' ? 'All' : ACCOUNT_STATUS_LABELS[f]}
            </button>
          ))}
        </div>

        {rowError && <div className="mb-3 rounded-xl border border-overdue/30 bg-overdue/5 px-4 py-2.5 text-[13px] font-medium text-overdue">{rowError}</div>}

        <div className="flex flex-col gap-3">
          {filtered.length === 0 && (
            <div className="rounded-2xl border border-dashed border-dash bg-white py-10 text-center text-sm text-muted">
              No users match this view.
            </div>
          )}
          {filtered.map((a) => {
            const archived = a.accountStatus === 'archived'
            const isSelf = a.id === admin.id
            return (
              <div
                key={a.id}
                className={`flex items-center gap-4 rounded-2xl border p-4 ${
                  archived ? 'border-line bg-app opacity-70' : 'border-line bg-white'
                }`}
              >
                <Avatar initials={a.initials} colorHex={a.colorHex} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-[15px] font-bold">{a.name}</div>
                    {a.staffCode && <span className="font-mono text-xs text-muted">{a.staffCode}</span>}
                    <StatusBadge status={a.accountStatus} />
                    <RoleBadge role={a.role} />
                  </div>
                  <div className="text-xs text-ink-soft">
                    {a.email}
                    {a.phone && <> · {a.phone}</>}
                  </div>
                </div>
                <div className="flex-shrink-0 text-right">
                  <div className="text-[13px] font-bold">{accessSummary(a, branches)}</div>
                  <div className="font-mono text-[11px] text-muted">
                    {a.defaultBranchId ? `Default: ${branches.find((b) => b.id === a.defaultBranchId)?.code ?? '—'}` : 'No default'}
                  </div>
                </div>

                {canManage && !archived && (
                  <select
                    value={a.accountStatus}
                    onChange={(e) => applyStatus(a, e.target.value as 'active' | 'disabled')}
                    className={`h-9 rounded-lg border px-2.5 text-xs font-bold ${
                      a.accountStatus === 'active'
                        ? 'border-verified-tint bg-verified-tint text-verified-ink'
                        : 'border-attention/30 bg-attention/10 text-attention'
                    }`}
                  >
                    <option value="active">Active</option>
                    <option value="disabled">Disabled</option>
                  </select>
                )}
                {canManage && !archived && (
                  <>
                    <button
                      onClick={() => setEditing(a)}
                      className="h-9 rounded-lg border border-line px-3 text-xs font-bold text-ink-soft"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setManaging(a)}
                      className="h-9 rounded-lg border border-line px-3 text-xs font-bold text-ink-soft"
                    >
                      Manage access
                    </button>
                    <button
                      onClick={() => setConfirming(a)}
                      className="h-9 rounded-lg border border-line px-3 text-xs font-bold text-overdue"
                    >
                      Archive
                    </button>
                  </>
                )}
                {canManage && archived && (
                  <button
                    onClick={() => applyStatus(a, 'active')}
                    className="h-9 rounded-lg border border-line px-3 text-xs font-bold text-verified-ink"
                  >
                    Restore
                  </button>
                )}
                {!canManage && isSelf && <span className="text-xs text-muted">You</span>}
              </div>
            )
          })}
        </div>
      </div>

      {addOpen && (
        <AddAdminModal
          siteId={admin.siteId}
          branches={branches}
          defaultBranchId={activeBranch?.id ?? branches[0]?.id ?? null}
          onClose={() => setAddOpen(false)}
          onCreated={(created) => {
            setAdmins((prev) => (prev.some((a) => a.id === created.id) ? prev : [...prev, created]))
            setAddOpen(false)
          }}
        />
      )}

      {editing && (
        <EditAdminModal
          user={editing}
          isSelf={editing.id === admin.id}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setAdmins((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
            setEditing(null)
          }}
        />
      )}

      {managing && (
        <AccessModal
          user={managing}
          branches={branches}
          isSelf={managing.id === admin.id}
          onClose={() => setManaging(null)}
          onSaved={(updated) => {
            setAdmins((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
            setManaging(null)
            if (updated.id === admin.id) reloadBranches()
          }}
        />
      )}

      {confirming && (
        <ArchiveConfirm
          user={confirming}
          onCancel={() => setConfirming(null)}
          onConfirm={() => applyStatus(confirming, 'archived')}
        />
      )}
    </AdminLayout>
  )
}

function StatusBadge({ status }: { status: AccountStatus }) {
  const cls =
    status === 'active'
      ? 'bg-verified-tint text-verified-ink'
      : status === 'disabled'
        ? 'bg-attention/15 text-attention'
        : status === 'archived'
          ? 'bg-line-soft text-ink-soft'
          : 'bg-overdue/10 text-overdue'
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${cls}`}>{ACCOUNT_STATUS_LABELS[status]}</span>
}

function RoleBadge({ role }: { role: AdminRole }) {
  return (
    <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-soft">
      {ADMIN_ROLE_LABELS[role]}
    </span>
  )
}

function ArchiveConfirm({ user, onCancel, onConfirm }: { user: AdminUser; onCancel: () => void; onConfirm: () => void }) {
  const isSuperuser = user.role === 'superuser'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <div className="text-lg font-extrabold">Archive {user.name}?</div>
        <p className="mt-2 text-sm text-ink-soft">
          {isSuperuser
            ? 'This user has high-level access. Are you sure you want to archive them?'
            : 'They will no longer be able to log in, but their history will remain.'}
        </p>
        <div className="mt-5 flex gap-2">
          <button onClick={onConfirm} className="h-11 flex-1 rounded-xl bg-overdue text-sm font-bold text-white">
            Archive user
          </button>
          <button onClick={onCancel} className="h-11 flex-1 rounded-xl border border-stroke text-sm font-bold text-ink">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

function AddAdminModal({
  siteId,
  branches,
  defaultBranchId: initialBranch,
  onClose,
  onCreated,
}: {
  siteId: string
  branches: Branch[]
  defaultBranchId: string | null
  onClose: () => void
  onCreated: (a: AdminUser) => void
}) {
  const [name, setName] = useState('')
  const [staffCode, setStaffCode] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [title, setTitle] = useState('')
  const [role, setRole] = useState<AdminRole>('manager')
  const [branchAll, setBranchAll] = useState(false)
  const [branchIds, setBranchIds] = useState<string[]>(initialBranch ? [initialBranch] : [])
  const [defaultBranchId, setDefaultBranchId] = useState<string | null>(initialBranch)
  const [password, setPassword] = useState(() => genPassword())
  const [accountStatus, setAccountStatus] = useState<'active' | 'disabled'>('active')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function toggleBranch(id: string) {
    setBranchIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const selectableDefaults = branchAll ? branches : branches.filter((b) => branchIds.includes(b.id))

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
    if (!password || password.length < 6) {
      setError('Set a starting password of at least 6 characters.')
      return
    }
    setSubmitting(true)
    try {
      const input: CreateAdminInput = {
        name: name.trim(),
        staffCode: staffCode.trim() || undefined,
        email: email.trim(),
        phone: phone.trim() || null,
        title: title.trim() || 'Dashboard user',
        role,
        password,
        accountStatus,
        branchAll,
        branchIds,
        defaultBranchId: branchAll ? null : defaultBranchId && branchIds.includes(defaultBranchId) ? defaultBranchId : branchIds[0] ?? null,
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
      <form onSubmit={handleSubmit} className="flex max-h-[90vh] w-full max-w-md flex-col gap-3 overflow-auto rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <div>
          <div className="text-lg font-extrabold">Add dashboard user</div>
          <div className="mt-0.5 text-sm text-ink-soft">They sign in at /admin/auth with their email and this password.</div>
        </div>
        <Field label="Full name">
          <input required value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Lerato Molefe" />
        </Field>
        <Field label="Staff ID">
          <div className="flex gap-2">
            <input value={staffCode} onChange={(e) => setStaffCode(e.target.value.toUpperCase())} className={`${inputCls} font-mono`} placeholder="AR-2290" />
            <button type="button" onClick={() => setStaffCode(generateStaffCode(name || 'AD Admin'))} className="rounded-xl border border-line px-3 text-xs font-bold text-ink-soft">
              Generate ID
            </button>
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email">
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="lerato@cleanproofguard.com" />
          </Field>
          <Field label="Phone (optional)">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} placeholder="+27 82 555 0100" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Role">
            <select value={role} onChange={(e) => setRole(e.target.value as AdminRole)} className={inputCls}>
              {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{ADMIN_ROLE_LABELS[r]}</option>)}
            </select>
          </Field>
          <Field label="Job title (optional)">
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="Hospital Admin" />
          </Field>
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-semibold text-ink-soft">Branch access</span>
            <label className="flex items-center gap-1.5 text-xs font-bold text-ink-soft">
              <input type="checkbox" checked={branchAll} onChange={(e) => setBranchAll(e.target.checked)} />
              All branches
            </label>
          </div>
          <div className={`max-h-36 overflow-auto rounded-xl border border-line ${branchAll ? 'opacity-50' : ''}`}>
            {branches.map((b) => (
              <label key={b.id} className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-app">
                <input type="checkbox" checked={branchAll || branchIds.includes(b.id)} disabled={branchAll} onChange={() => toggleBranch(b.id)} />
                <span className="flex-1 font-semibold">{b.name}</span>
                <span className="font-mono text-xs text-muted">{b.code}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Default branch">
            <select value={defaultBranchId ?? ''} onChange={(e) => setDefaultBranchId(e.target.value || null)} className={inputCls} disabled={branchAll}>
              <option value="">{branchAll ? 'All assigned' : 'First assigned'}</option>
              {selectableDefaults.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select value={accountStatus} onChange={(e) => setAccountStatus(e.target.value as 'active' | 'disabled')} className={inputCls}>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </select>
          </Field>
        </div>
        <Field label="Starting password">
          <div className="flex gap-2">
            <input value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputCls} font-mono`} />
            <button type="button" onClick={() => setPassword(genPassword())} className="rounded-xl border border-line px-3 text-xs font-bold text-ink-soft">
              Shuffle
            </button>
          </div>
          <p className="mt-1 text-[11px] text-muted">Share this with them — they can change it after first sign-in.</p>
        </Field>
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

function EditAdminModal({ user, isSelf, onClose, onSaved }: { user: AdminUser; isSelf: boolean; onClose: () => void; onSaved: (u: AdminUser) => void }) {
  const [name, setName] = useState(user.name)
  const [staffCode, setStaffCode] = useState(user.staffCode ?? '')
  const [email, setEmail] = useState(user.email)
  const [phone, setPhone] = useState(user.phone ?? '')
  const [title, setTitle] = useState(user.title)
  const [role, setRole] = useState<AdminRole>(user.role)
  const [status, setStatus] = useState<'active' | 'disabled'>(user.accountStatus === 'disabled' ? 'disabled' : 'active')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (isSelf && role === 'superuser' && user.role !== 'superuser') {
      setError('You cannot change your own role to superuser.')
      return
    }
    setSubmitting(true)
    try {
      const patch: UpdateAdminInput = {
        name: name.trim(),
        staffCode: staffCode.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
        title: title.trim(),
        role,
      }
      let updated = await repo.updateAdmin(user.id, patch)
      // Status changes go through the guarded lifecycle path.
      if (status !== (user.accountStatus === 'disabled' ? 'disabled' : 'active')) {
        updated = await repo.setAdminStatus(user.id, status)
      }
      onSaved(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save changes.')
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={onClose}>
      <form onSubmit={handleSubmit} className="flex max-h-[90vh] w-full max-w-md flex-col gap-3 overflow-auto rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <div>
          <div className="text-lg font-extrabold">Edit user</div>
          <div className="mt-0.5 font-mono text-sm text-ink-soft">{user.staffCode ?? user.email}</div>
        </div>
        <Field label="Full name">
          <input required value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Staff ID">
            <input required value={staffCode} onChange={(e) => setStaffCode(e.target.value.toUpperCase())} className={`${inputCls} font-mono`} />
          </Field>
          <Field label="Role">
            <select value={role} onChange={(e) => setRole(e.target.value as AdminRole)} className={inputCls}>
              {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{ADMIN_ROLE_LABELS[r]}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email">
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Phone">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Job title">
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Account">
            <select value={status} onChange={(e) => setStatus(e.target.value as 'active' | 'disabled')} className={inputCls}>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </select>
          </Field>
        </div>
        <p className="text-[11px] text-muted">Branch access and feature permissions are set under “Manage access”.</p>
        {error && <div className="text-[13px] font-medium text-overdue">{error}</div>}
        <div className="mt-1 flex gap-2">
          <button type="submit" disabled={submitting || !name.trim() || !staffCode.trim() || !email.trim()} className="flex h-11 flex-1 items-center justify-center rounded-xl bg-verified text-sm font-bold text-white disabled:opacity-50">
            {submitting ? 'Saving…' : 'Save changes'}
          </button>
          <button type="button" onClick={onClose} className="h-11 flex-1 rounded-xl border border-stroke text-sm font-bold text-ink">Close</button>
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
    if (isSelf && !branchAll && branchIds.length === 0) {
      setError("You can't remove all of your own branch access — you'd lock yourself out.")
      setSaving(false)
      return
    }
    if (isSelf && role === 'superuser' && user.role !== 'superuser') {
      setError('You cannot change your own role to superuser.')
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
