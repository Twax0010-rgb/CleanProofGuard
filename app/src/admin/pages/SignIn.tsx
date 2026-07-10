import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'

import { useAdminAuth } from '../../contexts/AdminAuthContext'

export function AdminSignIn() {
  const { signIn } = useAdminAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const ok = await signIn(email, password)
    setSubmitting(false)
    if (ok) navigate('/admin/overview', { replace: true })
    else setError('Email or password not recognized.')
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-stroke bg-white px-8 pb-8 pt-5 shadow-[0_1px_0_rgba(29,35,31,0.06),0_18px_40px_-24px_rgba(29,35,31,0.35)]"
      >
        <div className="mx-auto h-4.5 w-4.5 rounded-full border-[3px] border-stroke bg-canvas" />
        <div className="mt-5 flex flex-col items-center text-center">
          <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            Gauteng · Multi-site
          </div>
          <h1 className="font-display mt-1 text-[30px] font-bold uppercase leading-none tracking-[0.01em]">
            Admin sign in
          </h1>
        </div>

        <div className="mt-7 flex flex-col gap-3.5">
          <div>
            <div className="mb-1.5 text-xs font-semibold text-ink-soft">Email</div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="sara@cleanproofguard.com"
              className="w-full rounded-xl border border-line bg-app px-3.5 py-3 text-sm outline-none focus:border-stroke-soft"
            />
          </div>
          <div>
            <div className="mb-1.5 text-xs font-semibold text-ink-soft">Password</div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-xl border border-line bg-app px-3.5 py-3 text-sm outline-none focus:border-stroke-soft"
            />
          </div>
          {error && <div className="text-[13px] font-medium text-overdue">{error}</div>}
          <Button type="submit" fullWidth disabled={submitting || !email || !password} className="mt-1">
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
          <div className="text-center font-mono text-[11px] leading-relaxed text-muted">
            <div>Demo (any, password demo1234):</div>
            <div>owen@… — Superuser (all branches)</div>
            <div>sara@… — Manager (both hospitals)</div>
            <div>thabo@… — Manager (Southwest only)</div>
            <div>renee@… — Supervisor · chris@… — Read-only</div>
          </div>
        </div>
      </form>
    </div>
  )
}
