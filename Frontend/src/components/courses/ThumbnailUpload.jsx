import { useEffect, useId, useMemo } from 'react'
import { ImagePlus, Trash2, UploadCloud } from 'lucide-react'
import { cx } from '../../lib/cx'

export function ThumbnailUpload({
  file,
  existingUrl,
  onSelect,
  onRemove,
  error,
  hint,
  disabled = false,
  accept = '.jpeg,.jpg,.png,.webp,image/jpeg,image/png,image/webp',
}) {
  const inputId = useId()
  const hintId = `${inputId}-hint`
  const errorId = `${inputId}-error`

  const objectUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])

  useEffect(
    () => () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    },
    [objectUrl],
  )

  const preview = objectUrl || existingUrl

  return (
    <div className="space-y-1.5">
      <p className="block text-sm font-medium text-ink">Thumbnail</p>

      <div
        className={cx(
          'overflow-hidden rounded-2xl border bg-paper transition',
          error ? 'border-clay/50' : 'border-line',
          disabled && 'opacity-60',
        )}
      >
        {preview ? (
          <div className="relative">
            <img
              src={preview}
              alt="Course thumbnail preview"
              className="aspect-video w-full object-cover"
            />
            {!disabled ? (
              <div className="absolute inset-0 flex items-center justify-center gap-2 bg-ink/55 opacity-0 backdrop-blur-[1px] transition hover:opacity-100 focus-within:opacity-100">
                <label
                  htmlFor={inputId}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-paper px-3 py-2 text-xs font-semibold text-ink shadow-sm"
                >
                  <UploadCloud className="size-4" aria-hidden="true" />
                  Replace
                </label>
                <button
                  type="button"
                  onClick={onRemove}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-clay px-3 py-2 text-xs font-semibold text-paper shadow-sm"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                  Remove
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <label
            htmlFor={inputId}
            className={cx(
              'flex cursor-pointer flex-col items-center justify-center gap-2 px-4 py-8 text-center transition hover:bg-mist/50',
              disabled && 'cursor-not-allowed',
            )}
          >
            <span className="inline-flex size-11 items-center justify-center rounded-xl border border-line bg-paper text-brand shadow-sm">
              <ImagePlus className="size-5" aria-hidden="true" />
            </span>
            <span className="text-sm font-semibold text-ink">
              Upload a thumbnail or{' '}
              <span className="text-brand-strong underline decoration-brand/40 underline-offset-4">
                browse
              </span>
            </span>
            <span id={hintId} className="text-xs text-slate-500">
              {hint || 'JPEG, PNG or WEBP.'}
            </span>
          </label>
        )}

        <input
          id={inputId}
          type="file"
          accept={accept}
          disabled={disabled}
          className="sr-only"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : preview ? undefined : hintId}
          onChange={(event) => {
            const selected = event.target.files?.[0]
            if (selected) onSelect?.(selected)
            event.target.value = ''
          }}
        />
      </div>

      {error ? (
        <p id={errorId} role="alert" className="text-xs font-medium text-clay">
          {error}
        </p>
      ) : hint && preview ? (
        <p id={hintId} className="text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
