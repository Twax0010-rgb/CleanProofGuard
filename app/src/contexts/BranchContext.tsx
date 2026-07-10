import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { resolveLandingBranch } from '../lib/domain'
import { repo } from '../lib/repo'
import type { Branch } from '../lib/types'
import { useAdminAuth } from './AdminAuthContext'

/** 'all' = every branch the admin is allowed to see, when they have more than one. */
export type ActiveBranch = string | 'all'

interface BranchState {
  /** Active (non-archived) branches the current admin may access. */
  branches: Branch[]
  /** Currently selected branch, or 'all'. */
  activeBranchId: ActiveBranch
  setActiveBranchId: (id: ActiveBranch) => void
  /** The resolved active Branch, or null when 'all' (or none available). */
  activeBranch: Branch | null
  /** True when the admin can see more than one branch (enables the 'All assigned' option + switcher). */
  multiBranch: boolean
  loading: boolean
  reload: () => void
}

const BranchContext = createContext<BranchState | null>(null)

function storageKey(adminId: string) {
  return `cpg_active_branch_${adminId}`
}

export function BranchProvider({ children }: { children: ReactNode }) {
  const { admin } = useAdminAuth()
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [activeBranchId, setActiveBranchIdState] = useState<ActiveBranch>('all')

  const load = useCallback(() => {
    if (!admin) {
      setBranches([])
      setLoading(false)
      return
    }
    setLoading(true)
    repo.listBranches(admin.siteId).then((list) => {
      setBranches(list)
      // Restore the saved selection if still valid, else land on the default/first branch.
      const saved = localStorage.getItem(storageKey(admin.id))
      const validSaved = saved === 'all' || list.some((b) => b.id === saved)
      if (validSaved && saved) {
        setActiveBranchIdState(saved as ActiveBranch)
      } else {
        const landing = resolveLandingBranch(admin, list)
        setActiveBranchIdState(landing ?? 'all')
      }
      setLoading(false)
    })
  }, [admin])

  useEffect(() => {
    load()
  }, [load])

  // Keep in sync when another tab/screen mutates branches (create/archive/restore).
  useEffect(() => {
    if (!admin) return
    return repo.subscribe(admin.siteId, load)
  }, [admin, load])

  const setActiveBranchId = useCallback(
    (id: ActiveBranch) => {
      setActiveBranchIdState(id)
      if (admin) localStorage.setItem(storageKey(admin.id), id)
    },
    [admin],
  )

  const multiBranch = branches.length > 1
  const activeBranch = useMemo(
    () => (activeBranchId === 'all' ? null : branches.find((b) => b.id === activeBranchId) ?? null),
    [activeBranchId, branches],
  )

  // If an admin only has one branch, force the selection to it (no 'all').
  const effectiveActive: ActiveBranch = !multiBranch && branches[0] ? branches[0].id : activeBranchId

  const value: BranchState = {
    branches,
    activeBranchId: effectiveActive,
    setActiveBranchId,
    activeBranch: effectiveActive === 'all' ? null : branches.find((b) => b.id === effectiveActive) ?? activeBranch,
    multiBranch,
    loading,
    reload: load,
  }

  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>
}

export function useBranch() {
  const ctx = useContext(BranchContext)
  if (!ctx) throw new Error('useBranch must be used within BranchProvider')
  return ctx
}

/** True when a branch-scoped record should be visible for the current active-branch selection. */
export function inActiveBranch(branchId: string, active: ActiveBranch): boolean {
  return active === 'all' || branchId === active
}
