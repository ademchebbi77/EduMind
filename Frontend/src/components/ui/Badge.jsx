import { cx } from '../../lib/cx'

const VARIANTS = {
  brand: 'bg-brand/10 text-brand-strong',
  sage: 'bg-sage/10 text-sage',
  clay: 'bg-clay/10 text-clay',
  neutral: 'bg-slate-100 text-slate-600',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-800',
  onDark: 'bg-gold/15 text-gold ring-1 ring-inset ring-gold/25',
}

export function Badge({ children, variant = 'neutral', dot = false, className }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
        VARIANTS[variant] || VARIANTS.neutral,
        className,
      )}
    >
      {dot ? (
        <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      ) : null}
      {children}
    </span>
  )
}
