import { useId } from 'react'

export function ToggleField({ label, description, checked, onChange, disabled }) {
  const id = useId()
  const descriptionId = `${id}-description`

  return (
    <div className="flex items-start gap-3 rounded-xl border border-line bg-white p-3 transition hover:border-slate-300">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
        aria-describedby={description ? descriptionId : undefined}
        className="mt-0.5 size-4 shrink-0 cursor-pointer accent-brand"
      />
      <div>
        <label htmlFor={id} className="block cursor-pointer text-sm font-medium text-ink">
          {label}
        </label>
        {description ? (
          <p id={descriptionId} className="mt-0.5 text-xs text-slate-500">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  )
}
