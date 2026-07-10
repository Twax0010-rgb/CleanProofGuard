import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { repo } from '../../lib/repo'
import type { Area, Assignment } from '../../lib/types'
import { QrScanner } from '../components/QrScanner'
import { PhoneScreen } from '../PhoneScreen'

function normalizeCode(v: string) {
  const trimmed = v.trim()
  // Physical tags encode the public /verify/:code URL — pull the code out of the
  // path so a real camera scan and manual entry both resolve the same way.
  const urlMatch = trimmed.match(/\/verify\/([A-Za-z0-9-]+)/i)
  const raw = urlMatch ? urlMatch[1] : trimmed
  return raw.toUpperCase()
}

/** The branch-specific prefix of an area code, e.g. "SWH-" for "SWH-WB-005" or "CPG-" for
 * "CPG-3M-014". Manual entry shows this as a fixed prefix so codes across branches all resolve. */
function codePrefixOf(areaCode: string) {
  const dash = areaCode.indexOf('-')
  return dash >= 0 ? areaCode.slice(0, dash + 1) : ''
}

export function ScanTag() {
  const { assignmentId = '' } = useParams()
  const navigate = useNavigate()
  const [assignment, setAssignment] = useState<Assignment | null>(null)
  const [area, setArea] = useState<Area | null>(null)
  const [manualCode, setManualCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [matched, setMatched] = useState(false)
  const [torch, setTorch] = useState<{ supported: boolean; on: boolean; toggle: () => void }>({
    supported: false,
    on: false,
    toggle: () => {},
  })
  const manualInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    repo.getAssignment(assignmentId).then((a) => {
      setAssignment(a)
      if (a) repo.getArea(a.areaId).then(setArea)
    })
  }, [assignmentId])

  const complete = useCallback(
    async (code: string) => {
      if (!assignment || matched) return
      if (area && !area.active) {
        setError('This area has been deactivated. Check with your supervisor.')
        return
      }
      if (normalizeCode(code) !== normalizeCode(assignment.areaCode)) {
        setError(`That tag doesn't match ${assignment.areaName}. Try again.`)
        return
      }
      setMatched(true)
      await repo.startAssignment(assignment.id)
      navigate(`/staff/checklist/${assignment.id}`, { replace: true })
    },
    [assignment, area, matched, navigate],
  )

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!manualCode) return
    // Re-attach the branch prefix the input shows as a fixed label before matching.
    complete(assignment ? codePrefixOf(assignment.areaCode) + manualCode : manualCode)
  }

  if (!assignment) {
    return (
      <PhoneScreen bg="bg-[#0C0F12]" className="items-center justify-center text-white/60">
        Loading…
      </PhoneScreen>
    )
  }

  return (
    <PhoneScreen bg="bg-[#0C0F12]" className="relative text-white">
      <div className="relative z-10 flex items-center justify-between px-6 pt-16">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-white/12"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <div className="text-[15px] font-bold">Scan area tag</div>
        <div className="h-[38px] w-[38px]" />
      </div>

      <div className="relative flex flex-1 flex-col items-center justify-center px-6">
        <div className="relative h-[230px] w-[230px]">
          <div className="absolute inset-0 overflow-hidden rounded-[28px] bg-[#15191d]">
            <QrScanner onDecode={complete} paused={matched} onTorchChange={setTorch} />
          </div>
          <div className="pointer-events-none absolute -left-1.5 -top-1.5 h-11 w-11 rounded-tl-2xl border-l-4 border-t-4 border-verified" />
          <div className="pointer-events-none absolute -right-1.5 -top-1.5 h-11 w-11 rounded-tr-2xl border-r-4 border-t-4 border-verified" />
          <div className="pointer-events-none absolute -bottom-1.5 -left-1.5 h-11 w-11 rounded-bl-2xl border-b-4 border-l-4 border-verified" />
          <div className="pointer-events-none absolute -bottom-1.5 -right-1.5 h-11 w-11 rounded-br-2xl border-b-4 border-r-4 border-verified" />
          {!matched && (
            <div className="pointer-events-none absolute left-2 right-2 top-1/2 h-0.5 animate-cpg-scan bg-verified shadow-[0_0_14px_2px_rgba(15,157,107,0.7)]" />
          )}
        </div>
        <p className="mt-7 max-w-[250px] text-center text-[15px] leading-relaxed text-white/70">
          Point at the QR tag near the entrance to{' '}
          <strong className="font-bold text-white">{assignment.areaName}</strong>
        </p>
        {area && !area.active && (
          <p className="mt-3 max-w-[260px] text-center text-[13px] text-red-300">
            This area has been deactivated. Check with your supervisor.
          </p>
        )}
        {error && <p className="mt-3 max-w-[260px] text-center text-[13px] text-red-300">{error}</p>}
      </div>

      <div className="px-6 pb-10">
        <div className="mb-3.5 flex gap-3">
          <button
            type="button"
            onClick={torch.toggle}
            disabled={!torch.supported}
            className={`flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border text-sm font-semibold ${
              torch.on ? 'border-verified bg-verified/20' : 'border-white/18 bg-white/6'
            } disabled:opacity-40`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
              <path d="M12 3v2M12 19v2M5 12H3M21 12h-2M6 6l1.5 1.5M18 6l-1.5 1.5" />
              <circle cx="12" cy="12" r="3.5" />
            </svg>
            Torch
          </button>
          <button
            type="button"
            onClick={() => manualInputRef.current?.focus()}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-white/18 bg-white/6 text-sm font-semibold"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="M7 9h4M7 13h6" />
            </svg>
            Enter code
          </button>
        </div>
        <form
          onSubmit={handleManualSubmit}
          className="flex items-center gap-3 rounded-xl border border-white/14 bg-white/7 px-4"
          style={{ height: 52 }}
        >
          <span className="text-[13px] text-white/50">{codePrefixOf(assignment.areaCode)}</span>
          <input
            ref={manualInputRef}
            value={manualCode}
            onChange={(e) => {
              setManualCode(e.target.value.toUpperCase())
              setError(null)
            }}
            placeholder={assignment.areaCode.slice(codePrefixOf(assignment.areaCode).length)}
            className="flex-1 bg-transparent font-mono text-base tracking-wider text-white placeholder-white/25 outline-none"
          />
          <button
            type="submit"
            className="rounded-lg bg-verified px-3 py-1.5 text-xs font-bold disabled:opacity-40"
            disabled={!manualCode || (area ? !area.active : false)}
          >
            Go
          </button>
        </form>
      </div>
    </PhoneScreen>
  )
}
