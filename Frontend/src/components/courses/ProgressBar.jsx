import { cx } from '../../lib/cx'

export function ProgressBar({ value = 0, label, ariaLabel, className }) {
  const clamped = Math.min(100, Math.max(0, Number(value) || 0))

  return (
    <div className={cx('space-y-1.5', className)}>
      {label ? (
        <div className="flex items-center justify-between text-xs font-medium text-slate-600">
          <span>{label}</span>
          <span>{clamped}%</span>
        </div>
      ) : null}
      <div
        role="progressbar"
        aria-label={ariaLabel || label || 'Course progress'}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped}
        className="h-2 overflow-hidden rounded-full bg-slate-200"
      >
        <div
          className={cx(
            'h-full rounded-full transition-all duration-300',
            clamped === 100 ? 'bg-sage' : 'bg-brand',
          )}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  )
}
