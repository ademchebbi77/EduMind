import { useId, useState } from 'react'
import { UploadCloud } from 'lucide-react'
import { cx } from '../../lib/cx'

export function FileDropzone({
  onFileSelect,
  accept,
  formats = [],
  maxSizeMb,
  disabled = false,
  error,
}) {
  const inputId = useId()
  const hintId = `${inputId}-hint`
  const errorId = `${inputId}-error`
  const [dragging, setDragging] = useState(false)

  function handleDrop(event) {
    event.preventDefault()
    setDragging(false)
    if (disabled) return
    const file = event.dataTransfer?.files?.[0]
    if (file) onFileSelect(file)
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault()
        if (!disabled) setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={cx(
        'relative overflow-hidden rounded-2xl border-2 border-dashed p-5 transition',
        error
          ? 'border-clay/40 bg-clay/[0.04]'
          : dragging
            ? 'border-brand bg-brand/[0.06]'
            : 'border-slate-300 bg-mist/40 hover:border-brand/40',
        disabled && 'opacity-60',
      )}
    >
      <input
        id={inputId}
        type="file"
        className="peer sr-only"
        accept={accept}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hintId}
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) onFileSelect(file)
          event.target.value = ''
        }}
      />
      <label
        htmlFor={inputId}
        className="flex cursor-pointer flex-col items-center rounded-xl px-4 py-6 text-center transition peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand hover:bg-white/60"
      >
        <span className="inline-flex size-12 items-center justify-center rounded-2xl border border-line bg-paper text-brand shadow-sm">
          <UploadCloud className="size-6" aria-hidden="true" />
        </span>
        <span className="mt-3 text-sm font-semibold text-ink">
          Drag and drop a file or{' '}
          <span className="text-brand-strong underline decoration-brand/40 underline-offset-4">
            browse your files
          </span>
        </span>
        <span id={hintId} className="mt-1.5 text-xs text-slate-500">
          {formats.length
            ? `Accepted formats: ${formats.join(', ')}. Maximum size: ${maxSizeMb} MB.`
            : 'PDF or audio formats only.'}
        </span>
      </label>
      {error ? (
        <p id={errorId} role="alert" className="mt-2 text-center text-xs font-medium text-clay">
          {error}
        </p>
      ) : null}
    </div>
  )
}
