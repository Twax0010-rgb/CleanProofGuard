import type { ReactNode } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAdminAuth } from '../contexts/AdminAuthContext'
import { ADMIN_FEATURE_LABELS, canView } from '../lib/domain'
import type { AdminFeature } from '../lib/types'

/** Gates an admin route on auth and, optionally, a feature permission — so typing a URL for a page
 * the user can't access shows a friendly message instead of leaking the screen. */
export function RequireAdmin({ children, feature }: { children: ReactNode; feature?: AdminFeature }) {
  const { admin, loading } = useAdminAuth()
  const navigate = useNavigate()
  if (loading) return null
  if (!admin) return <Navigate to="/admin/auth" replace />
  if (feature && !canView(admin, feature)) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-app px-6 text-center text-ink">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-overdue-tint text-overdue">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" />
          </svg>
        </div>
        <div className="text-lg font-extrabold">No access to {ADMIN_FEATURE_LABELS[feature]}</div>
        <p className="max-w-sm text-sm text-ink-soft">
          Your role doesn't have permission to view this section. Contact a superuser if you think this is a mistake.
        </p>
        <button
          onClick={() => navigate('/admin/overview')}
          className="mt-1 h-10 rounded-xl bg-verified px-4 text-sm font-bold text-white"
        >
          Back to Overview
        </button>
      </div>
    )
  }
  return <>{children}</>
}
