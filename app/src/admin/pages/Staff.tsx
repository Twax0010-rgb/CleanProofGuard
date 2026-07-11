import { useEffect, useMemo, useState } from 'react'
import { Avatar } from '../../components/ui/Avatar'
import { Field, inputCls, ModalShell } from '../../components/ui/Modal'
import { useAdminAuth } from '../../contexts/AdminAuthContext'
import { inActiveBranch, useBranch } from '../../contexts/BranchContext'
import { ACCOUNT_STATUS_LABELS, canManageRoutes, canManageUsers, formatClock, generatePin } from '../../lib/domain'
import { repo } from '../../lib/repo'
import type { AccountStatus, Assignment, Branch, Staff as StaffMember, StaffStatus } from '../../lib/types'
import { AdminLayout } from '../AdminLayout'

const SHIFT_STATUS_LABEL: Record<StaffStatus, string> = {
  on_shift: 'On shift',
  on_break: 'On break',
  off_shift: 'Off shift',
}

const ACCOUNT_FILTERS: Array<AccountStatus | 'all'> = ['all', 'active', 'disabled', 'archived', 'deleted']

export function Staff() {
  const { admin } = useAdminAuth()
  const { activeBranchId, activeBranch, branches } = useBranch()
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<AccountStatus | 'all'>('all')
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<StaffMember | null>(null)
  const [confirming, setConfirming] = useState<{ member: StaffMember; next: AccountStatus } | null>(null)

  useEffect(() => {
    if (!admin) return
    function load() {
      Promise.all([repo.listStaffForSite(admin!.siteId), repo.getSiteAssignments(admin!.siteId)]).then(
        ([s, a]) => {
          setStaff(s)
          setAssignments(a)
          setLoading(false)
        },
      )
    }
    load()
    const unsub = repo.subscribe(admin.siteId, load)
    return unsub
  }, [admin])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return staff
      .filter((s) => inActiveBranch(s.branchId, activeBranchId))
      // Deleted users never show under "All" — they live in their own section.
      .filter((s) => (filter === 'all' ? s.accountStatus !== 'deleted' : s.accountStatus === filter))
      .filter(
        (s) =>
          !q ||
          s.fullName.toLowerCase().includes(q) ||
          s.staffCode.toLowerCase().includes(q) ||
          (s.email ?? '').toLowerCase().includes(q),
      )
      .sort((a, b) => {
        const order: StaffStatus[] = ['on_shift', 'on_break', 'off_shift']
        return order.indexOf(a.status) - order.indexOf(b.status) || a.fullName.localeCompare(b.fullName)
      })
  }, [staff, query, filter, activeBranchId])

  async function handleShiftStatusChange(staffId: string, status: StaffStatus) {
    const updated = await repo.setStaffStatus(staffId, status)
    setStaff((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
  }

  async function handleStatusChange(member: StaffMember, next: AccountStatus) {
    const updated = await repo.updateStaff(member.id, { accountStatus: next })
    setStaff((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
    setConfirming(null)
  }

  if (!admin || loading) {
    return (
      <AdminLayout>
        <div className="flex flex-1 items-center justify-center text-ink-soft">Loading…</div>
      </AdminLayout>
    )
  }

  const canEditUsers = canManageUsers(admin.role)
  const canEditRoutes = canManageRoutes(admin.role)

  return (
    <AdminLayout>
      <div className="flex h-16 flex-shrink-0 items-center gap-3.5 border-b border-line bg-white px-6">
        <h2 className="font-display text-[24px] font-bold uppercase leading-none tracking-[0.01em]">Staff</h2>
        <span className="text-sm text-muted">{filtered.length} people · {activeBranch ? activeBranch.name : 'All branches'}</span>
        <div className="flex-1" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, ID, or email"
          className="h-9.5 w-64 rounded-[11px] border border-line bg-app px-3 text-sm outline-none focus:border-stroke-soft"
        />
        {canEditUsers && (
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
      {!canEditUsers && (
        <div className="border-b border-line bg-app px-6 py-2 text-xs text-ink-soft">
          {canEditRoutes
            ? 'Your role can update shift status but not add, edit, or archive users.'
            : "Your role is read-only — you can view staff, but can't make changes here."}
        </div>
      )}

      <div className="flex-1 overflow-auto p-6">
        <div className="mb-4 flex gap-2">
          {ACCOUNT_FILTERS.map((f) => (
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

        <div className="flex flex-col gap-3">
          {filtered.length === 0 && (
            <div className="rounded-2xl border border-dashed border-dash bg-white py-10 text-center text-sm text-muted">
              No staff match this view.
            </div>
          )}
          {filtered.map((s) => {
            const mine = assignments.filter((a) => a.staffId === s.id)
            const done = mine.filter((a) => a.status === 'done').length
            const archived = s.accountStatus === 'archived'
            const deleted = s.accountStatus === 'deleted'
            return (
              <div
                key={s.id}
                className={`flex items-center gap-4 rounded-2xl border p-4 ${
                  archived || deleted ? 'border-line bg-app opacity-70' : 'border-line bg-white'
                }`}
              >
                <Avatar initials={s.initials} colorHex={s.colorHex} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-[15px] font-bold">{s.fullName}</div>
                    <span className="font-mono text-xs text-muted">{s.staffCode}</span>
                    <AccountBadge status={s.accountStatus} />
                  </div>
                  <div className="text-xs text-ink-soft">
                    {s.role}
                    {s.email && <> · {s.email}</>}
                    {s.shiftStart && s.shiftEnd && (
                      <>
                        {' '}
                        · {formatClock(s.shiftStart)} – {formatClock(s.shiftEnd)}
                      </>
                    )}
                  </div>
                </div>
                <div className="text-right text-xs text-muted">
                  {mine.length > 0 ? (
                    <>
                      <div className="text-sm font-bold text-ink">
                        {done}/{mine.length}
                      </div>
                      areas today
                    </>
                  ) : (
                    'No areas today'
                  )}
                </div>
                <select
                  value={s.status}
                  disabled={s.accountStatus !== 'active' || !canEditRoutes}
                  onChange={(e) => handleShiftStatusChange(s.id, e.target.value as StaffStatus)}
                  className={`h-9 rounded-lg border px-2.5 text-xs font-bold disabled:opacity-40 ${
                    s.status === 'on_shift'
                      ? 'border-verified-tint bg-verified-tint text-verified-ink'
                      : s.status === 'on_break'
                        ? 'border-attention/30 bg-attention/10 text-attention'
                        : 'border-line bg-line-soft text-ink-soft'
                  }`}
                >
                  {(Object.keys(SHIFT_STATUS_LABEL) as StaffStatus[]).map((key) => (
                    <option key={key} value={key}>
                      {SHIFT_STATUS_LABEL[key]}
                    </option>
                  ))}
                </select>
                {canEditUsers && !deleted && (
                  <button
                    onClick={() => setEditing(s)}
                    className="h-9 rounded-lg border border-line px-3 text-xs font-bold text-ink-soft"
                  >
                    Edit
                  </button>
                )}
                {canEditUsers &&
                  (confirming?.member.id === s.id ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-ink-soft">
                        {confirming.next === 'deleted' ? 'Delete?' : confirming.next === 'archived' ? 'Archive?' : 'Restore?'}
                      </span>
                      <button
                        onClick={() => handleStatusChange(confirming.member, confirming.next)}
                        className={`h-9 rounded-lg px-2.5 text-xs font-bold text-white ${
                          confirming.next === 'active' ? 'bg-verified' : 'bg-overdue'
                        }`}
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setConfirming(null)}
                        className="h-9 rounded-lg border border-line px-2.5 text-xs font-bold text-ink-soft"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      {(archived || deleted) && (
                        <button
                          onClick={() => setConfirming({ member: s, next: 'active' })}
                          className="h-9 rounded-lg border border-line px-3 text-xs font-bold text-verified-ink"
                        >
                          Restore
                        </button>
                      )}
                      {!archived && !deleted && (
                        <button
                          onClick={() => setConfirming({ member: s, next: 'archived' })}
                          className="h-9 rounded-lg border border-line px-3 text-xs font-bold text-ink-soft"
                        >
                          Archive
                        </button>
                      )}
                      {!deleted && (
                        <button
                          onClick={() => setConfirming({ member: s, next: 'deleted' })}
                          className="h-9 rounded-lg border border-line px-3 text-xs font-bold text-overdue"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  ))}
              </div>
            )
          })}
        </div>
      </div>

      {addOpen && (
        <AddUserModal
          siteId={admin.siteId}
          branches={branches}
          defaultBranchId={activeBranch?.id ?? branches[0]?.id ?? ''}
          onClose={() => setAddOpen(false)}
          onCreated={(created) => {
            // The repo's own change-subscription may already have refetched and
            // included this record by the time this callback fires — guard
            // against adding it twice.
            setStaff((prev) => (prev.some((s) => s.id === created.id) ? prev : [...prev, created]))
            setAddOpen(false)
          }}
        />
      )}
      {editing && (
        <EditUserModal
          staff={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setStaff((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
            setEditing(null)
          }}
        />
      )}
    </AdminLayout>
  )
}

function AccountBadge({ status }: { status: AccountStatus }) {
  const cls =
    status === 'active'
      ? 'bg-verified-tint text-verified-ink'
      : status === 'disabled'
        ? 'bg-attention/15 text-attention'
        : status === 'deleted'
          ? 'bg-overdue/10 text-overdue'
          : 'bg-line-soft text-ink-soft'
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${cls}`}>{ACCOUNT_STATUS_LABELS[status]}</span>
}


function AddUserModal({
  siteId,
  branches,
  defaultBranchId,
  onClose,
  onCreated,
}: {
  siteId: string
  branches: Branch[]
  defaultBranchId: string
  onClose: () => void
  onCreated: (staff: StaffMember) => void
}) {
  const [fullName, setFullName] = useState('')
  const [staffCode, setStaffCode] = useState('')
  const [role, setRole] = useState('Cleaner')
  const [branchId, setBranchId] = useState(defaultBranchId)
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState(() => generatePin())
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!branchId) {
      setError('Choose a branch for this user.')
      return
    }
    setSubmitting(true)
    try {
      const created = await repo.createStaff(siteId, {
        fullName: fullName.trim(),
        staffCode: staffCode.trim() || undefined,
        role,
        branchId,
        email: email.trim() || null,
        phone: phone.trim() || null,
        pin,
      })
      onCreated(created)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create user.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalShell title="Add user" subtitle="They'll be able to sign in to the staff app right away." onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Field label="Full name">
          <input required value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} placeholder="Jordan Ellis" />
        </Field>
        <Field label="Staff ID (optional)">
          <input
            value={staffCode}
            onChange={(e) => setStaffCode(e.target.value.toUpperCase())}
            className={`${inputCls} font-mono`}
            placeholder="Leave blank to auto-generate"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Role">
            <select value={role} onChange={(e) => setRole(e.target.value)} className={inputCls}>
              <option>Cleaner</option>
              <option>Supervisor</option>
            </select>
          </Field>
          <Field label="Branch">
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={inputCls}>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email (optional)">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="jordan@example.com" />
          </Field>
          <Field label="Phone (optional)">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} placeholder="+1 555-0100" />
          </Field>
        </div>
        <Field label="Starting PIN">
          <div className="flex gap-2">
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className={`${inputCls} font-mono`}
            />
            <button type="button" onClick={() => setPin(generatePin())} className="rounded-xl border border-line px-3 text-xs font-bold text-ink-soft">
              Shuffle
            </button>
          </div>
          <p className="mt-1 text-[11px] text-muted">Share this PIN with them — they can sign in with their Staff ID + this PIN.</p>
        </Field>
        {error && <div className="text-[13px] font-medium text-overdue">{error}</div>}
        <div className="mt-2 flex gap-2">
          <button type="submit" disabled={submitting || !fullName.trim() || pin.length < 4} className="flex h-11 flex-1 items-center justify-center rounded-xl bg-verified text-sm font-bold text-white disabled:opacity-50">
            {submitting ? 'Creating…' : 'Add user'}
          </button>
          <button type="button" onClick={onClose} className="h-11 flex-1 rounded-xl border border-stroke text-sm font-bold text-ink">
            Cancel
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

function EditUserModal({
  staff,
  onClose,
  onSaved,
}: {
  staff: StaffMember
  onClose: () => void
  onSaved: (staff: StaffMember) => void
}) {
  const [fullName, setFullName] = useState(staff.fullName)
  const [staffCode, setStaffCode] = useState(staff.staffCode)
  const [role, setRole] = useState(staff.role)
  const [email, setEmail] = useState(staff.email ?? '')
  const [phone, setPhone] = useState(staff.phone ?? '')
  const [accountStatus, setAccountStatus] = useState<'active' | 'disabled'>(
    staff.accountStatus === 'disabled' ? 'disabled' : 'active',
  )
  const [newPin, setNewPin] = useState('')
  const [pinBusy, setPinBusy] = useState(false)
  const [pinResetTo, setPinResetTo] = useState<string | null>(null)
  const [pinError, setPinError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const lockedStatus = staff.accountStatus === 'archived' || staff.accountStatus === 'deleted'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const updated = await repo.updateStaff(staff.id, {
        fullName: fullName.trim(),
        staffCode: staffCode.trim(),
        role,
        email: email.trim() || null,
        phone: phone.trim() || null,
        // Archived/deleted accounts are only ever restored via the explicit Restore action.
        ...(lockedStatus ? {} : { accountStatus }),
      })
      onSaved(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save changes.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResetPin() {
    if (newPin.length < 4 || pinBusy) return
    setPinError(null)
    setPinResetTo(null)
    setPinBusy(true)
    try {
      await repo.resetStaffPin(staff.id, newPin)
      setPinResetTo(newPin)
      setNewPin('')
    } catch (err) {
      setPinError(err instanceof Error ? err.message : 'Could not reset the PIN — try again.')
    } finally {
      setPinBusy(false)
    }
  }

  return (
    <ModalShell title="Edit user" subtitle={staff.staffCode} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Field label="Full name">
          <input required value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Staff ID">
            <input
              required
              value={staffCode}
              onChange={(e) => setStaffCode(e.target.value.toUpperCase())}
              className={`${inputCls} font-mono`}
            />
          </Field>
          <Field label="Role">
            <select value={role} onChange={(e) => setRole(e.target.value)} className={inputCls}>
              <option>Cleaner</option>
              <option>Supervisor</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Phone">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
          </Field>
        </div>
        {!lockedStatus && (
          <Field label="Account">
            <select
              value={accountStatus}
              onChange={(e) => setAccountStatus(e.target.value as 'active' | 'disabled')}
              className={inputCls}
            >
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </select>
          </Field>
        )}
        {error && <div className="text-[13px] font-medium text-overdue">{error}</div>}
        <div className="mt-1 flex gap-2">
          <button type="submit" disabled={submitting || !fullName.trim() || !staffCode.trim()} className="flex h-11 flex-1 items-center justify-center rounded-xl bg-verified text-sm font-bold text-white disabled:opacity-50">
            {submitting ? 'Saving…' : 'Save changes'}
          </button>
          <button type="button" onClick={onClose} className="h-11 flex-1 rounded-xl border border-stroke text-sm font-bold text-ink">
            Close
          </button>
        </div>
      </form>

      <div className="mt-5 border-t border-line-soft pt-4">
        <div className="mb-1.5 text-xs font-semibold text-ink-soft">Reset PIN</div>
        <div className="flex gap-2">
          <input
            value={newPin}
            onChange={(e) => {
              setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))
              setPinResetTo(null)
              setPinError(null)
            }}
            placeholder="New PIN (4-6 digits)"
            className={`${inputCls} font-mono`}
          />
          <button
            type="button"
            onClick={handleResetPin}
            disabled={newPin.length < 4 || pinBusy}
            className="rounded-xl border border-line px-3 text-xs font-bold text-ink-soft disabled:opacity-40"
          >
            {pinBusy ? 'Resetting…' : 'Reset'}
          </button>
        </div>
        {pinResetTo && (
          <p className="mt-1.5 text-[12px] font-semibold text-verified-ink">
            ✓ PIN reset to <span className="font-mono">{pinResetTo}</span>. It works immediately — share it with{' '}
            {fullName.split(' ')[0] || 'them'}.
          </p>
        )}
        {pinError && <p className="mt-1.5 text-[12px] font-medium text-overdue">{pinError}</p>}
      </div>
    </ModalShell>
  )
}
