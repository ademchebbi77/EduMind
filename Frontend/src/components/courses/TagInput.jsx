import { useId, useState } from 'react'
import { X } from 'lucide-react'
import { cx } from '../../lib/cx'

const MAX_TAG_LENGTH = 50

export function TagInput({
  label = 'Tags',
  value = [],
  onChange,
  hint,
  error,
  disabled = false,
}) {
  const inputId = useId()
  const hintId = `${inputId}-hint`
  const errorId = `${inputId}-error`
  const [draft, setDraft] = useState('')
  const [localError, setLocalError] = useState('')

  const message = error || localError

  function commit() {
    if (disabled) return

    const candidates = draft
      .split(',')
      .map((tag) => tag.trim().replace(/^#+/, '').trim())
      .filter(Boolean)

    if (!candidates.length) {
      setDraft('')
      return
    }

    const next = [...value]
    const seen = new Set(next.map((tag) => tag.toLowerCase()))

    for (const tag of candidates) {
      if (tag.length > MAX_TAG_LENGTH) {
        setLocalError(`Each tag must be at most ${MAX_TAG_LENGTH} characters.`)
        return
      }
      if (!seen.has(tag.toLowerCase())) {
        seen.add(tag.toLowerCase())
        next.push(tag)
      }
    }

    setLocalError('')
    setDraft('')
    onChange?.(next)
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      commit()
      return
    }

    if (event.key === 'Backspace' && !draft && value.length) {
      event.preventDefault()
      onChange?.(value.slice(0, -1))
    }
  }

  function removeTag(tag) {
    if (disabled) return
    onChange?.(value.filter((item) => item !== tag))
  }

  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="block text-sm font-medium text-ink">
        {label}
      </label>

      <div
        className={cx(
          'rounded-xl border bg-white px-3 py-2 shadow-sm transition focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand',
          message ? 'border-clay/50 focus-within:outline-clay' : 'border-line hover:border-slate-300',
          disabled && 'cursor-not-allowed bg-mist',
        )}
      >
        {value.length ? (
          <ul className="mb-2 flex flex-wrap gap-1.5" aria-label="Selected tags">
            {value.map((tag) => (
              <li key={tag}>
                <span className="inline-flex items-center gap-1 rounded-full bg-brand/10 py-1 pl-2.5 pr-1 text-xs font-semibold text-brand-strong">
                  {tag}
                  {!disabled ? (
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      aria-label={`Remove tag ${tag}`}
                      className="rounded-full p-0.5 transition hover:bg-brand/20"
                    >
                      <X className="size-3" aria-hidden="true" />
                    </button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        <input
          id={inputId}
          type="text"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value)
            if (localError) setLocalError('')
          }}
          onKeyDown={handleKeyDown}
          onBlur={commit}
          disabled={disabled}
          aria-invalid={message ? true : undefined}
          aria-describedby={message ? errorId : hint ? hintId : undefined}
          placeholder={value.length ? 'Add another tag…' : 'e.g. mathematics, beginner'}
          className="h-7 w-full border-0 bg-transparent p-0 text-sm text-ink-soft placeholder:text-slate-500 focus:outline-none disabled:cursor-not-allowed disabled:text-slate-500"
        />
      </div>

      {hint && !message ? (
        <p id={hintId} className="text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
      {message ? (
        <p id={errorId} role="alert" className="text-xs font-medium text-clay">
          {message}
        </p>
      ) : null}
    </div>
  )
}
