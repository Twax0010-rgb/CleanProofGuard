import { Link } from 'react-router-dom'

export function Landing() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col items-center justify-center px-6 py-10">
      <div className="relative w-full max-w-sm">
        <div className="cpg-stamp absolute -top-4 right-1 z-10 text-[15px] text-verified" style={{ transform: 'rotate(7deg)' }}>
          Proof of clean
        </div>

        <div className="rounded-2xl border border-stroke bg-white px-7 pb-7 pt-5 shadow-[0_1px_0_rgba(29,35,31,0.06),0_18px_40px_-24px_rgba(29,35,31,0.35)]">
          {/* punch hole */}
          <div className="mx-auto h-4.5 w-4.5 rounded-full border-[3px] border-stroke bg-canvas" />

          <div className="mt-5 text-center font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            Gauteng · Multi-site compliance
          </div>
          <h1 className="font-display mt-1.5 text-center text-[44px] font-bold uppercase leading-[0.95] tracking-[0.01em]">
            Clean Proof
            <br />
            Guard
          </h1>
          <p className="mx-auto mt-3 max-w-[260px] text-center text-[13px] leading-relaxed text-ink-soft">
            Staff scan the tag in each area to log a verified clean. Admins assign routes and watch
            completion live.
          </p>

          <div className="mt-6 border-t border-dashed border-dash" />

          <div className="mt-6 flex flex-col gap-2.5">
            <Link
              to="/staff/auth"
              className="flex h-13 items-center justify-center rounded-xl bg-verified text-[15px] font-extrabold text-white hover:brightness-105"
            >
              Open staff app
            </Link>
            <Link
              to="/admin/auth"
              className="flex h-13 items-center justify-center rounded-xl border border-stroke bg-white text-[15px] font-bold text-ink hover:bg-line-softer"
            >
              Open admin dashboard
            </Link>
          </div>

          <div className="mt-6 flex items-baseline justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            <span>Form CPG-01</span>
            <span>Rev 4.0</span>
          </div>
        </div>
      </div>

      <p className="mt-6 max-w-xs text-center font-mono text-[11px] leading-relaxed text-ink-soft/70">
        Scan any area tag in the building to check when it was last cleaned.
      </p>
    </div>
  )
}
