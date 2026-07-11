import { useEffect, useState, useSyncExternalStore } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useStaffAuth } from '../../contexts/StaffAuthContext'
import { formatClock } from '../../lib/domain'
import { repo } from '../../lib/repo'
import { InstallStaffApp } from '../components/InstallStaffApp'
import { getOutbox, onOutboxChange } from '../outbox'
import { PhoneScreen } from '../PhoneScreen'

/** Staff profile & app menu: who's signed in, install-app, pending sync, sign out. */
export function Profile() {
  const { staff, signOut } = useStaffAuth()
  const navigate = useNavigate()
  const [branchName, setBranchName] = useState('')
  const outbox = useSyncExternalStore(onOutboxChange, getOutbox)

  useEffect(() => {
    if (!staff) return
    repo.getBranch(staff.branchId).then((b) => setBranchName(b?.name ?? ''))
  }, [staff])

  if (!staff) return null

  const rows: Array<[string, string]> = [
    ['Staff ID', staff.staffCode],
    ['Role', staff.role],
    ['Branch', branchName || '—'],
    [
      'Shift',
      staff.shiftStart
        ? `${formatClock(staff.shiftStart)} – ${staff.shiftEnd ? formatClock(staff.shiftEnd) : 'open'}`
        : 'Off shift',
    ],
  ]

  return (
    <PhoneScreen>
      <div className="border-b border-line-soft bg-white px-[22px] pb-4" style={{ paddingTop: 58 }}>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/staff')}
            className="flex h-9.5 w-9.5 items-center justify-center rounded-full bg-app"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1D231F" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
          <div className="text-lg font-extrabold tracking-tight">Profile</div>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-[22px] pb-10 pt-5">
        <div className="flex items-center gap-4 rounded-[18px] border border-line bg-white p-4.5">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-full text-lg font-bold text-white"
            style={{ background: staff.colorHex }}
          >
            {staff.initials}
          </div>
          <div className="min-w-0">
            <div className="text-lg font-extrabold">{staff.fullName}</div>
            <div className="font-mono text-xs text-muted">{staff.staffCode}</div>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-[18px] border border-line bg-white">
          {rows.map(([label, value], i) => (
            <div
              key={label}
              className={`flex items-center justify-between px-4.5 py-3.5 ${i > 0 ? 'border-t border-line-soft' : ''}`}
            >
              <span className="text-[13px] font-semibold text-muted">{label}</span>
              <span className="text-[14px] font-bold">{value}</span>
            </div>
          ))}
        </div>

        <Link
          to="/staff/pending"
          className="mt-4 flex items-center gap-3 rounded-[18px] border border-line bg-white p-4.5"
        >
          <div className="flex h-9.5 w-9.5 items-center justify-center rounded-[10px] bg-attention/15 text-attention">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 11-2.6-6.3M21 4v5h-5" />
            </svg>
          </div>
          <div className="flex-1">
            <div className="text-[14px] font-bold">Pending sync</div>
            <div className="text-xs text-muted">
              {outbox.length === 0
                ? 'Everything is synced'
                : `${outbox.length} update${outbox.length === 1 ? '' : 's'} waiting`}
            </div>
          </div>
          {outbox.length > 0 && (
            <span className="rounded-full bg-attention/15 px-2 py-0.5 text-[11px] font-bold text-attention">
              {outbox.length}
            </span>
          )}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#808B81" strokeWidth="2" strokeLinecap="round">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </Link>

        <div className="mt-4">
          <InstallStaffApp />
        </div>

        <button
          type="button"
          onClick={() => {
            signOut()
            navigate('/staff/auth', { replace: true })
          }}
          className="mt-4 flex h-[50px] w-full items-center justify-center gap-2 rounded-xl border border-overdue-border bg-white text-[14px] font-bold text-overdue"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
          </svg>
          Sign out
        </button>
      </div>
    </PhoneScreen>
  )
}
