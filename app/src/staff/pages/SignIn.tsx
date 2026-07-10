import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { PinDots } from '../../components/ui/PinDots'
import { useStaffAuth } from '../../contexts/StaffAuthContext'
import { PhoneScreen } from '../PhoneScreen'

export function StaffSignIn() {
  const { signIn, revokedReason } = useStaffAuth()
  const navigate = useNavigate()
  const [staffCode, setStaffCode] = useState('')
  const [pin, setPin] = useState('')
  const [badgeHint, setBadgeHint] = useState(false)
  const [error, setError] = useState<string | null>(revokedReason)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const ok = await signIn(staffCode, pin)
    setSubmitting(false)
    if (ok) {
      navigate('/staff', { replace: true })
    } else {
      setError('Staff ID or PIN not recognized. Try again.')
      setPin('')
    }
  }

  return (
    <PhoneScreen bg="" className="text-white">
      <form
        onSubmit={handleSubmit}
        className="flex flex-1 flex-col box-border px-6 pt-24 pb-10"
        style={{ background: '#194B34' }}
      >
        <div className="flex flex-col items-center text-center">
          <div className="flex h-[66px] w-[66px] items-center justify-center rounded-2xl border border-white/22 bg-white/12">
            <svg width="34" height="34" viewBox="0 0 24 24">
              <g fill="#fff">
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" opacity="0.55" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" opacity="0.55" />
              </g>
              <path
                d="M14 15.5l2.2 2.2 4.3-4.3"
                fill="none"
                stroke="#fff"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h1 className="font-display mt-[20px] text-[34px] font-bold uppercase leading-none tracking-[0.02em]">
            Clean Proof Guard
          </h1>
          <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-white/60">
            Proof of a job well done
          </p>
        </div>

        <div className="mt-11 flex flex-col gap-3.5">
          <div>
            <div className="mb-1.5 text-xs font-semibold tracking-wide text-white/65">STAFF ID</div>
            <input
              value={staffCode}
              onChange={(e) => setStaffCode(e.target.value.toUpperCase())}
              placeholder="MB-4471"
              autoCapitalize="characters"
              className="w-full rounded-2xl border border-white/20 bg-white/10 px-4 font-mono text-base text-white placeholder-white/35 outline-none focus:border-white/40"
              style={{ height: 52 }}
            />
          </div>
          <div>
            <div className="mb-1.5 text-xs font-semibold tracking-wide text-white/65">PIN</div>
            <PinDots value={pin} onChange={setPin} length={6} />
          </div>

          {error && <div className="text-[13px] font-medium text-red-200">{error}</div>}

          <Button
            type="submit"
            variant="secondary"
            fullWidth
            disabled={submitting || !staffCode || pin.length < 4}
            className="mt-2 !bg-white !text-verified-ink !border-0 shadow-[0_8px_20px_rgba(0,0,0,0.18)]"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
          <Button
            type="button"
            variant="ghost-dark"
            fullWidth
            size="md"
            className="!h-[50px]"
            onClick={() => setBadgeHint(true)}
            icon={
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M7 8v8M11 8v8M15 8v8M18 8v8" strokeLinecap="round" />
              </svg>
            }
          >
            Scan my badge instead
          </Button>
          {badgeHint && (
            <p className="text-center text-[12px] text-white/60">
              Badge scanning isn't set up yet — sign in with your Staff ID and PIN.
            </p>
          )}
          <p className="mt-1 text-center font-mono text-[11px] text-white/45">
            Demo: MB-4471 · PIN 1234
          </p>
        </div>

        <div className="flex-1" />
        <div className="text-center font-mono text-xs text-white/50">v4.0 · Clean Proof Guard</div>
      </form>
    </PhoneScreen>
  )
}
