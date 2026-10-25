import { cx } from '../../lib/cx'

const VARIANTS = {
  primary: 'bg-ink text-paper shadow-sm shadow-ink/20 hover:bg-ink-soft active:bg-ink',
  accent:
    'bg-brand text-paper shadow-sm shadow-brand/25 hover:bg-brand-strong active:bg-brand-strong',
  secondary:
    'border border-line bg-paper text-ink-soft hover:border-slate-300 hover:bg-slate-50',
  ghost: 'text-ink-soft hover:bg-slate-100',
  danger: 'bg-clay text-paper shadow-sm shadow-clay/20 hover:bg-[#9a2f12]',
}

const SIZES = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-5 text-sm',
  lg: 'h-12 px-6 text-base',
}

export function buttonClasses({ variant = 'primary', size = 'md', className }) {
  return cx(
    'inline-flex shrink-0 items-center justify-center gap-2 rounded-xl font-semibold transition',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
    'disabled:cursor-not-allowed disabled:opacity-60',
    VARIANTS[variant] || VARIANTS.primary,
    SIZES[size] || SIZES.md,
    className,
  )
}
