import { Loader2 } from 'lucide-react'
import { cx } from '../../lib/cx'

export function Skeleton({ className }) {
  return (
    <div
      aria-hidden="true"
      className={cx('animate-pulse rounded-xl bg-slate-200/70', className)}
    />
  )
}

export function CardSkeleton() {
  return (
    <div className="surface space-y-4 p-5">
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
      <div className="flex gap-2 pt-2">
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-6 w-24 rounded-full" />
      </div>
    </div>
  )
}

export function PageLoader({ label = 'Loading…' }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-slate-500"
    >
      <Loader2 className="size-7 animate-spin text-brand" aria-hidden="true" />
      <p className="text-sm font-medium">{label}</p>
    </div>
  )
}
