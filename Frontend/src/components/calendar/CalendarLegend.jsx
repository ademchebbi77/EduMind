export function CalendarLegend() {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded border-l-2 border-brand bg-brand/15" aria-hidden="true" />
        Cours en ligne
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded border-l-2 border-clay bg-clay/15" aria-hidden="true" />
        Formation
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-brand" aria-hidden="true" />
        Planifiée
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-sage" aria-hidden="true" />
        En cours
      </span>
    </div>
  )
}
