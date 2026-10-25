export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
      {Icon ? (
        <span className="mb-4 inline-flex size-14 items-center justify-center rounded-2xl bg-mist text-brand-strong ring-1 ring-line">
          <Icon className="size-7" aria-hidden="true" />
        </span>
      ) : null}
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <span className="academic-rule mx-auto mt-3" aria-hidden="true" />
      {description ? (
        <p className="mt-2 max-w-md text-sm text-slate-600">{description}</p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  )
}
