import { Link } from 'react-router-dom'
import { cx } from '../../lib/cx'

export function BrandMark({ className }) {
  return (
    <span
      className={cx(
        'brand-gradient inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-paper shadow-md shadow-ink/20 ring-1 ring-inset ring-white/10',
        className,
      )}
      aria-hidden="true"
    >
      <svg viewBox="0 0 32 32" fill="none" className="size-6">
        <path
          d="M4.5 9.2c4.1-1.7 7.4-1.2 11.2 1.1v14.9c-3.8-2.3-7.1-2.8-11.2-1.1V9.2Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M27.5 9.2c-4.1-1.7-7.4-1.2-11.2 1.1v14.9c3.8-2.3 7.1-2.8 11.2-1.1V9.2Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path d="M15.7 10.3v14.9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path
          d="M7.6 13.2c2.2-.4 4.1-.2 6 .7M7.6 16.4c2.2-.4 4.1-.2 6 .7M18.4 13.9c1.9-.9 3.8-1.1 6-.7M18.4 17.1c1.9-.9 3.8-1.1 6-.7"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          opacity=".6"
        />
        <path
          d="M19.6 4.4h4.1v7.5l-2-1.3-2.1 1.3V4.4Z"
          fill="currentColor"
          className="text-gold"
        />
      </svg>
    </span>
  )
}

export function Logo({ to = '/dashboard', light = false, showTagline = false }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-3 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
    >
      <BrandMark />
      <span className="leading-none">
        <span
          className={cx(
            'font-display block text-[1.2rem] font-semibold tracking-tight',
            light ? 'text-paper' : 'text-ink',
          )}
        >
          EduMind <span className={light ? 'text-gold' : 'text-brand-strong'}>AI</span>
        </span>
        {showTagline ? (
          <span
            className={cx(
              'mt-1.5 block text-[9px] font-semibold uppercase tracking-[0.2em]',
              light ? 'text-white/50' : 'text-slate-500',
            )}
          >
            Learn differently
          </span>
        ) : null}
      </span>
    </Link>
  )
}
