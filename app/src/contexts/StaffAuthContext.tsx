import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { repo } from '../lib/repo'
import type { Staff } from '../lib/types'

const STORAGE_KEY = 'cpg_staff_session'
const POLL_MS = 45_000 // fallback in case the realtime subscription misses the change

interface StaffAuthState {
  staff: Staff | null
  loading: boolean
  /** Set when a session ends because an admin disabled/archived the account, not a normal logout. */
  revokedReason: string | null
  signIn: (staffCode: string, pin: string) => Promise<boolean>
  signOut: () => void
}

const StaffAuthContext = createContext<StaffAuthState | null>(null)

export function StaffAuthProvider({ children }: { children: ReactNode }) {
  const [staff, setStaff] = useState<Staff | null>(null)
  const [loading, setLoading] = useState(true)
  const [revokedReason, setRevokedReason] = useState<string | null>(null)
  const staffRef = useRef<Staff | null>(null)
  staffRef.current = staff

  function signOut() {
    setStaff(null)
    localStorage.removeItem(STORAGE_KEY)
  }

  function revoke() {
    signOut()
    setRevokedReason('Your account was disabled by an admin. Sign in again once it is reactivated.')
  }

  useEffect(() => {
    const id = localStorage.getItem(STORAGE_KEY)
    if (!id) {
      setLoading(false)
      return
    }
    repo
      .getStaff(id)
      .then((s) => {
        if (s && s.accountStatus === 'active') setStaff(s)
        else localStorage.removeItem(STORAGE_KEY)
      })
      .finally(() => setLoading(false))
  }, [])

  // Keep watching the signed-in staff record so a mid-session disable/archive
  // by an admin ends the session here too, not just on next sign-in attempt.
  useEffect(() => {
    if (!staff) return

    async function checkStatus() {
      const current = staffRef.current
      if (!current) return
      const fresh = await repo.getStaff(current.id)
      if (!fresh || fresh.accountStatus !== 'active') {
        revoke()
      } else if (fresh !== current) {
        setStaff(fresh)
      }
    }

    const unsub = repo.subscribe(staff.siteId, checkStatus)
    const interval = setInterval(checkStatus, POLL_MS)
    return () => {
      unsub()
      clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staff?.id, staff?.siteId])

  async function signIn(staffCode: string, pin: string) {
    const s = await repo.authenticateStaff(staffCode, pin)
    if (!s) return false
    setRevokedReason(null)
    setStaff(s)
    localStorage.setItem(STORAGE_KEY, s.id)
    return true
  }

  return (
    <StaffAuthContext.Provider value={{ staff, loading, revokedReason, signIn, signOut }}>
      {children}
    </StaffAuthContext.Provider>
  )
}

export function useStaffAuth() {
  const ctx = useContext(StaffAuthContext)
  if (!ctx) throw new Error('useStaffAuth must be used within StaffAuthProvider')
  return ctx
}
