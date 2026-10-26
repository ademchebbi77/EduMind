import { Accessibility } from 'lucide-react'
import { useOptionalAccessibility } from '../../context/AccessibilityContext'
import { isCustomized } from '../../lib/accessibility'
import { cx } from '../../lib/cx'

const VARIANTS = {
  // Dark sidebar, styled like the navigation links.
  sidebar:
    'w-full gap-3 rounded-xl border-l-2 border-transparent px-3 py-2.5 text-sm font-medium text-white/70 hover:bg-white/[0.04] hover:text-paper focus-visible:outline-gold',
  // Light surfaces (mobile header, sign-in pages): icon button.
  light:
    'rounded-xl border border-line bg-paper p-2.5 text-ink-soft hover:border-slate-300 hover:bg-mist focus-visible:outline-brand',
}

export function AccessibilityButton({ variant = 'light', className }) {
  const accessibility = useOptionalAccessibility()
  if (!accessibility) return null
  const { preferences, openPanel } = accessibility
  const active = isCustomized(preferences)
  const showLabel = variant === 'sidebar'

  return (
    <button
      type="button"
      onClick={openPanel}
      aria-haspopup="dialog"
      aria-label={showLabel ? undefined : 'Accessibility settings'}
      title="Accessibility settings"
      className={cx(
        'relative inline-flex items-center transition focus-visible:outline-2 focus-visible:outline-offset-2',
        VARIANTS[variant],
        className,
      )}
    >
      <Accessibility className="size-5" aria-hidden="true" />
      {showLabel ? 'Accessibility' : null}
      {active ? (
        <>
          <span
            aria-hidden="true"
            className={cx(
              'size-2 rounded-full bg-gold',
              showLabel ? 'ml-auto' : 'absolute right-1.5 top-1.5 bg-brand',
            )}
          />
          <span className="sr-only"> (custom settings active)</span>
        </>
      ) : null}
    </button>
  )
}
