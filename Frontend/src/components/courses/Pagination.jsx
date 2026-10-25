import { ChevronLeft, ChevronRight } from 'lucide-react'

export function Pagination({
  count,
  page,
  hasNext,
  hasPrevious,
  disabled,
  onPageChange,
  singular = 'item',
  plural = `${singular}s`,
  ariaLabel = 'Pagination',
}) {
  const itemLabel = count > 1 ? plural : singular

  return (
    <nav
      aria-label={ariaLabel}
      className="flex flex-col items-center justify-between gap-3 rounded-2xl border border-line bg-white px-4 py-3 sm:flex-row"
    >
      <p className="text-sm text-slate-600" aria-live="polite">
        {count} {itemLabel} · page {page}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={!hasPrevious || disabled}
          className="inline-flex h-9 items-center gap-1 rounded-lg border border-line bg-paper px-3 text-sm font-medium text-ink-soft transition hover:border-slate-300 hover:bg-mist disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          Previous
        </button>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={!hasNext || disabled}
          className="inline-flex h-9 items-center gap-1 rounded-lg border border-line bg-paper px-3 text-sm font-medium text-ink-soft transition hover:border-slate-300 hover:bg-mist disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      </div>
    </nav>
  )
}
