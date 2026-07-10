import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useStaffAuth } from '../contexts/StaffAuthContext'

export function RequireStaff({ children }: { children: ReactNode }) {
  const { staff, loading } = useStaffAuth()
  if (loading) return null
  if (!staff) return <Navigate to="/staff/auth" replace />
  return <>{children}</>
}
