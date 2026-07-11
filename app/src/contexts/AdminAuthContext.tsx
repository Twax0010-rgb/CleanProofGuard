import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { repo } from '../lib/repo'
import type { AdminUser } from '../lib/types'

const STORAGE_KEY = 'cpg_admin_session'

interface AdminAuthState {
  admin: AdminUser | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<boolean>
  signOut: () => void
}

const AdminAuthContext = createContext<AdminAuthState | null>(null)

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const id = localStorage.getItem(STORAGE_KEY)
    if (!id) {
      setLoading(false)
      return
    }
    repo
      .getAdmin(id)
      .then((a) => {
        // A session for an admin who was since disabled/archived is no longer valid.
        const valid = a && a.accountStatus === 'active' ? a : null
        if (a && !valid) localStorage.removeItem(STORAGE_KEY)
        setAdmin(valid)
        repo.setActingAdmin(valid?.id ?? null)
      })
      .finally(() => setLoading(false))
  }, [])

  async function signIn(email: string, password: string) {
    const a = await repo.authenticateAdmin(email, password)
    if (!a) return false
    setAdmin(a)
    repo.setActingAdmin(a.id)
    localStorage.setItem(STORAGE_KEY, a.id)
    return true
  }

  function signOut() {
    setAdmin(null)
    repo.setActingAdmin(null)
    localStorage.removeItem(STORAGE_KEY)
  }

  return (
    <AdminAuthContext.Provider value={{ admin, loading, signIn, signOut }}>
      {children}
    </AdminAuthContext.Provider>
  )
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext)
  if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider')
  return ctx
}
