import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { ThemeToggle } from '../components/ui/ThemeToggle'
import { useAdminAuth } from '../contexts/AdminAuthContext'
import { useBranch } from '../contexts/BranchContext'
import { ADMIN_ROLE_LABELS, canView } from '../lib/domain'
import type { AdminFeature } from '../lib/types'
import { NotificationBell } from './NotificationCenter'

interface NavItem {
  label: string
  path: string
  feature: AdminFeature
  icon: ReactNode
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Overview', path: '/admin/overview', feature: 'overview',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    label: 'Live map', path: '/admin/live-map', feature: 'liveMap',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" />
      </svg>
    ),
  },
  {
    label: 'Assignments', path: '/admin/assignments', feature: 'assignments',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 6h16M4 12h16M4 18h10" />
      </svg>
    ),
  },
  {
    label: 'Staff', path: '/admin/staff', feature: 'staff',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5.5a3 3 0 010 5.6M21 20c0-2.2-1.2-4.1-3-5.1" />
      </svg>
    ),
  },
  {
    label: 'Locations', path: '/admin/locations', feature: 'locations',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 20V9l8-5 8 5v11M9 20v-6h6v6" />
      </svg>
    ),
  },
  {
    label: 'Branches', path: '/admin/branches', feature: 'branches',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-4h6v4M9 10h.01M15 10h.01M9 13.5h.01M15 13.5h.01" />
      </svg>
    ),
  },
  {
    label: 'Photos', path: '/admin/photos', feature: 'photos',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8.5" cy="10" r="1.5" /><path d="M21 16l-5-5-9 8" />
      </svg>
    ),
  },
  {
    label: 'Reports', path: '/admin/reports', feature: 'reports',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19V5M4 19h16M8 15v-4M13 15V8M18 15v-6" />
      </svg>
    ),
  },
  {
    label: 'Users & Access', path: '/admin/users', feature: 'users',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="3.4" /><path d="M5.5 20a6.5 6.5 0 0113 0M18 8l1.6 1.6L23 6" />
      </svg>
    ),
  },
]

function BranchSwitcher() {
  const { branches, activeBranchId, setActiveBranchId, multiBranch } = useBranch()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  if (branches.length === 0) {
    return (
      <div className="mx-2 mb-4 rounded-[10px] border border-dashed border-dash px-2.5 py-2 text-[11px] font-semibold text-muted">
        No branches assigned. Contact a superuser.
      </div>
    )
  }

  const label =
    activeBranchId === 'all' ? 'All assigned branches' : branches.find((b) => b.id === activeBranchId)?.name ?? 'Select branch'
  const code = activeBranchId === 'all' ? `${branches.length} branches` : branches.find((b) => b.id === activeBranchId)?.code ?? ''

  // Group by province for a calm, drill-down list when there are many.
  const byProvince = new Map<string, typeof branches>()
  for (const b of branches) {
    const list = byProvince.get(b.provinceState) ?? []
    list.push(b)
    byProvince.set(b.provinceState, list)
  }

  return (
    <div ref={rootRef} className="relative mx-2 mb-4">
      <button
        onClick={() => multiBranch && setOpen((v) => !v)}
        className={`flex w-full items-center gap-2 rounded-[10px] border border-line bg-white px-2.5 py-2 text-left ${multiBranch ? 'hover:border-stroke-soft' : 'cursor-default'}`}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#216B4B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
          <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" />
        </svg>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-bold leading-tight">{label}</div>
          <div className="font-mono text-[10px] uppercase tracking-wide text-muted">{code}</div>
        </div>
        {multiBranch && (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#808B81" strokeWidth="2.2" strokeLinecap="round" className="flex-shrink-0">
            <path d="M6 9l6 6 6-6" />
          </svg>
        )}
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-line bg-white py-1 shadow-[0_16px_40px_rgba(23,33,43,0.18)]">
          <button
            onClick={() => { setActiveBranchId('all'); setOpen(false) }}
            className={`flex w-full items-center justify-between px-3 py-2 text-left text-[13px] font-semibold ${activeBranchId === 'all' ? 'bg-verified text-white' : 'hover:bg-app'}`}
          >
            All assigned branches
            <span className={`font-mono text-[10px] ${activeBranchId === 'all' ? 'text-white/80' : 'text-muted'}`}>{branches.length}</span>
          </button>
          {[...byProvince.entries()].map(([province, list]) => (
            <div key={province}>
              <div className="px-3 pb-0.5 pt-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-muted">{province}</div>
              {list.map((b) => (
                <button
                  key={b.id}
                  onClick={() => { setActiveBranchId(b.id); setOpen(false) }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-[13px] ${activeBranchId === b.id ? 'bg-verified font-bold text-white' : 'font-semibold hover:bg-app'}`}
                >
                  <span className="truncate">{b.name}</span>
                  <span className={`ml-2 flex-shrink-0 font-mono text-[10px] ${activeBranchId === b.id ? 'text-white/80' : 'text-muted'}`}>{b.code}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function AdminLayout({ children }: { children: ReactNode }) {
  const { admin, signOut } = useAdminAuth()
  const navigate = useNavigate()
  const visibleNav = admin ? NAV_ITEMS.filter((item) => canView(admin, item.feature)) : []

  return (
    <div className="flex h-dvh bg-app text-ink">
      <div className="flex w-[230px] flex-shrink-0 flex-col border-r border-line bg-panel p-3.5">
        <div className="flex items-start gap-2.5 px-2 pb-3 pt-1.5">
          <div className="flex h-8.5 w-8.5 flex-shrink-0 items-center justify-center rounded-[9px] bg-verified">
            <svg width="19" height="19" viewBox="0 0 24 24">
              <g fill="#fff">
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" opacity="0.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" opacity="0.5" />
              </g>
              <path d="M14 15.5l2.2 2.2 4.3-4.3" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="font-display text-[19px] font-bold uppercase leading-[0.95] tracking-[0.02em]">
            Clean Proof
            <br />
            Guard
          </div>
          <div className="flex-1" />
          {admin && <NotificationBell admin={admin} />}
        </div>

        <BranchSwitcher />

        <div className="mx-2 mb-2 flex items-center justify-between">
          <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-muted">Menu</span>
          <ThemeToggle />
        </div>

        <div className="mt-0.5 flex flex-col gap-0.75 overflow-auto">
          {visibleNav.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-2.75 rounded-[11px] px-3 py-2.5 text-sm font-bold ${
                  isActive ? 'bg-verified text-white' : 'text-ink-soft hover:bg-line-softer'
                }`
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </div>

        <div className="flex-1" />
        {/* Preview link only — the admin system never starts in the staff app. */}
        <a
          href="/staff"
          target="_blank"
          rel="noopener"
          className="mb-1.5 flex items-center gap-2.75 rounded-[11px] border border-dashed border-line px-3 py-2.5 text-sm font-bold text-ink-soft hover:bg-line-softer"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="7" y="2" width="10" height="20" rx="2.5" />
            <path d="M11 18.5h2" />
          </svg>
          Open Staff App
          <svg className="ml-auto" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 17L17 7M9 7h8v8" />
          </svg>
        </a>
        {admin && (
          <button
            onClick={() => {
              signOut()
              navigate('/admin/auth', { replace: true })
            }}
            className="flex items-center gap-2.75 rounded-[11px] border-t border-line-soft px-2 pt-2.5 text-left"
          >
            <div
              className="flex h-8.5 w-8.5 flex-shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white"
              style={{ background: admin.colorHex }}
            >
              {admin.initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-bold">{admin.name}</div>
              <div className="text-[11px] text-muted">
                {admin.title} · {ADMIN_ROLE_LABELS[admin.role]}
              </div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#808B81" strokeWidth="2" strokeLinecap="round">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  )
}
