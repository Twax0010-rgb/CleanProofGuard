import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { categorySlugLabel, formatDuration, frequencyCountdown } from '../lib/domain'
import { CURRENT_SITE_ID, repo } from '../lib/repo'
import type { Area } from '../lib/types'

export function VerifyArea() {
  const { areaCode = '' } = useParams()
  const [area, setArea] = useState<Area | null | undefined>(undefined)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    repo.getAreaByCode(CURRENT_SITE_ID, areaCode).then(setArea)
  }, [areaCode])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  if (area === undefined) {
    return <CenteredShell>Loading…</CenteredShell>
  }

  if (area === null) {
    return (
      <CenteredShell>
        <TagCard>
          <div className="cpg-stamp mx-auto mt-2 text-[17px] text-muted">No record</div>
          <p className="mt-4 text-center text-sm text-ink-soft">
            No area is registered for tag <span className="font-mono">{areaCode}</span>.
          </p>
        </TagCard>
      </CenteredShell>
    )
  }

  const countdown = frequencyCountdown(area, now)
  const overdue = countdown?.overdue ?? false
  const lastCleaned = area.lastCleanedAt ? new Date(area.lastCleanedAt) : null
  const lastCleanedLabel = lastCleaned
    ? lastCleaned.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : 'Not yet recorded'

  return (
    <CenteredShell>
      <TagCard>
        <div className="mt-4 text-center font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
          {area.code} · {categorySlugLabel(area.category)}
        </div>
        <h1 className="font-display mt-1 text-center text-[34px] font-bold uppercase leading-[0.98]">
          {area.name}
        </h1>

        <div className="mt-6 flex justify-center">
          {overdue ? (
            <div className="cpg-stamp text-[22px] text-overdue">Overdue</div>
          ) : (
            <div className="cpg-stamp text-[22px] text-verified">Verified clean</div>
          )}
        </div>

        <div className="mt-7 flex flex-col gap-2.5">
          <LedgerRow label="Last cleaned" value={lastCleanedLabel} tone={overdue ? 'overdue' : 'ink'} />
          {lastCleaned && (
            <LedgerRow label="Elapsed" value={`${formatDuration(now - lastCleaned.getTime())} ago`} tone="soft" />
          )}
          {countdown && (
            <LedgerRow
              label={overdue ? 'Overdue by' : 'Next clean due in'}
              value={formatDuration(Math.abs(countdown.remainingMs))}
              tone={overdue ? 'overdue' : 'verified'}
            />
          )}
        </div>

        <div className="mt-7 border-t border-dashed border-dash pt-3.5 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          Live record · Clean Proof Guard
        </div>
      </TagCard>

      <p className="mt-5 max-w-[260px] text-center font-mono text-[11px] leading-relaxed text-ink-soft/70">
        Scan this tag any time — the record updates the moment the area is cleaned.
      </p>
    </CenteredShell>
  )
}

function LedgerRow({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'ink' | 'soft' | 'verified' | 'overdue'
}) {
  const valueCls =
    tone === 'overdue'
      ? 'text-overdue'
      : tone === 'verified'
        ? 'text-verified-ink'
        : tone === 'soft'
          ? 'text-ink-soft'
          : 'text-ink'
  return (
    <div className="flex items-baseline gap-2">
      <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{label}</span>
      <span className="flex-1 border-b border-dotted border-stroke-soft" />
      <span className={`font-mono text-[14px] font-semibold ${valueCls}`}>{value}</span>
    </div>
  )
}

function TagCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full rounded-2xl border border-stroke bg-white px-6 pb-6 pt-5 shadow-[0_1px_0_rgba(29,35,31,0.06),0_18px_40px_-24px_rgba(29,35,31,0.35)]">
      <div className="mx-auto h-4.5 w-4.5 rounded-full border-[3px] border-stroke bg-canvas" />
      {children}
    </div>
  )
}

function CenteredShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-sm flex-col items-center justify-center px-6 py-10">
      {children}
    </div>
  )
}
