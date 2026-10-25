import { forwardRef, useId } from 'react'
import { cx } from '../../lib/cx'

const CONTROL_CLASSES =
  'w-full rounded-xl border bg-white px-4 text-sm text-ink-soft shadow-sm transition placeholder:text-slate-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:bg-mist'

function borderClasses(hasError) {
  return hasError
    ? 'border-clay/50 focus-visible:outline-clay'
    : 'border-line hover:border-slate-300'
}

function FieldShell({ label, htmlFor, hint, error, required, hintId, errorId, children }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
        {label}
        {required ? (
          <span className="ml-1 text-clay" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {children}
      {hint && !error ? (
        <p id={hintId} className="text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-xs font-medium text-clay">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function describedBy(hintId, errorId, hint, error) {
  if (error) return errorId
  if (hint) return hintId
  return undefined
}

export const Input = forwardRef(function Input(
  { label, id, hint, error, required = false, trailing, className, ...props },
  ref,
) {
  const generatedId = useId()
  const inputId = id || generatedId
  const hintId = `${inputId}-hint`
  const errorId = `${inputId}-error`

  return (
    <FieldShell
      label={label}
      htmlFor={inputId}
      hint={hint}
      error={error}
      required={required}
      hintId={hintId}
      errorId={errorId}
    >
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(hintId, errorId, hint, error)}
          className={cx(
            CONTROL_CLASSES,
            'h-11',
            trailing && 'pr-12',
            borderClasses(Boolean(error)),
            className,
          )}
          {...props}
        />
        {trailing ? (
          <div className="absolute inset-y-0 right-0 flex items-center pr-2">{trailing}</div>
        ) : null}
      </div>
    </FieldShell>
  )
})

export const Textarea = forwardRef(function Textarea(
  { label, id, hint, error, required = false, rows = 4, className, ...props },
  ref,
) {
  const generatedId = useId()
  const inputId = id || generatedId
  const hintId = `${inputId}-hint`
  const errorId = `${inputId}-error`

  return (
    <FieldShell
      label={label}
      htmlFor={inputId}
      hint={hint}
      error={error}
      required={required}
      hintId={hintId}
      errorId={errorId}
    >
      <textarea
        ref={ref}
        id={inputId}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(hintId, errorId, hint, error)}
        className={cx(CONTROL_CLASSES, 'resize-y py-3', borderClasses(Boolean(error)), className)}
        {...props}
      />
    </FieldShell>
  )
})

export const Select = forwardRef(function Select(
  { label, id, hint, error, required = false, children, className, ...props },
  ref,
) {
  const generatedId = useId()
  const inputId = id || generatedId
  const hintId = `${inputId}-hint`
  const errorId = `${inputId}-error`

  return (
    <FieldShell
      label={label}
      htmlFor={inputId}
      hint={hint}
      error={error}
      required={required}
      hintId={hintId}
      errorId={errorId}
    >
      <select
        ref={ref}
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(hintId, errorId, hint, error)}
        className={cx(CONTROL_CLASSES, 'h-11', borderClasses(Boolean(error)), className)}
        {...props}
      >
        {children}
      </select>
    </FieldShell>
  )
})
