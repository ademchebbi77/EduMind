import { useEffect, useState } from 'react'
import { AlertCircle, Captions, Loader2, RefreshCw } from 'lucide-react'
import {
  fetchLessonTranscript,
  generateLessonTranscript,
} from '../../api/courses'
import { isCanceled, normalizeApiError } from '../../lib/api'
import { formatDate } from '../../lib/format'
import {
  TRANSCRIPT_LANGUAGES,
  TRANSCRIPT_STAGE_LABELS,
  defaultTranscriptLanguage,
  isSupportedTranscriptLanguage,
  parseTranscriptParagraphs,
} from '../../lib/transcripts'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { ProgressBar } from './ProgressBar'

const POLL_INTERVAL_MS = 3000
const ACTIVE_STATUSES = new Set(['queued', 'processing'])
const PANEL_ID = 'lesson-transcript-panel'

function languageLabel(code) {
  const match = TRANSCRIPT_LANGUAGES.find((language) => language.code === code)
  return match ? match.label : code
}

export function LessonTranscript({ courseId, lesson }) {
  const supported =
    Boolean(lesson?.file_url) &&
    (lesson.file_type === 'video' || lesson.file_type === 'audio')

  const [open, setOpen] = useState(false)
  const [result, setResult] = useState({ key: null, data: null, error: null })
  const [pollTick, setPollTick] = useState(0)
  const [language, setLanguage] = useState(defaultTranscriptLanguage)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState(null)

  const requestKey = `${courseId}:${lesson?.id}`
  const transcript = result.key === requestKey ? result.data : null
  const loadError = result.key === requestKey ? result.error : null
  const active = ACTIVE_STATUSES.has(transcript?.status)
  const status = transcript?.status ?? 'none'
  const paragraphs =
    status === 'completed' ? parseTranscriptParagraphs(transcript.text) : []

  useEffect(() => {
    if (!open || !active) return undefined

    let cancelled = false
    const timer = setTimeout(() => {
      fetchLessonTranscript(courseId, lesson.id)
        .then((payload) => {
          if (cancelled) return
          setResult((current) =>
            current.key === requestKey
              ? { ...current, data: payload, error: null }
              : current,
          )
          if (isSupportedTranscriptLanguage(payload.language)) {
            setLanguage(payload.language)
          }
        })
        .catch(() => {
          // Keep the current progress state; the next tick retries.
        })
        .finally(() => {
          if (!cancelled) setPollTick((current) => current + 1)
        })
    }, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [active, courseId, lesson?.id, open, pollTick, requestKey])

  function remember(payload) {
    setResult({ key: requestKey, data: payload, error: null })
    if (isSupportedTranscriptLanguage(payload.language)) {
      setLanguage(payload.language)
    }
  }

  async function startGeneration({ regenerate = false } = {}) {
    setBusy(true)
    setActionError(null)
    try {
      const payload = await generateLessonTranscript(
        courseId,
        lesson.id,
        regenerate ? { language, regenerate: true } : { language },
      )
      remember(payload)
    } catch (requestError) {
      setActionError(
        normalizeApiError(
          requestError,
          'Unable to start transcript generation.',
        ).message,
      )
    } finally {
      setBusy(false)
    }
  }

  async function loadTranscript() {
    setBusy(true)
    setActionError(null)
    try {
      const payload = await fetchLessonTranscript(courseId, lesson.id)
      remember(payload)
      if (payload.status === 'none') {
        const generated = await generateLessonTranscript(
          courseId,
          lesson.id,
          { language },
        )
        remember(generated)
      }
    } catch (requestError) {
      if (isCanceled(requestError)) return
      setResult({
        key: requestKey,
        data: null,
        error: normalizeApiError(requestError, 'Unable to load the transcript.'),
      })
    } finally {
      setBusy(false)
    }
  }

  function handleToggle() {
    if (open) {
      setOpen(false)
      return
    }
    setOpen(true)
    if (!transcript || active) {
      void loadTranscript()
    }
  }

  if (!supported) return null

  return (
    <section
      aria-label="Lesson transcript"
      aria-busy={active || busy || undefined}
      className="rounded-2xl border border-line bg-paper p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand-strong ring-1 ring-inset ring-brand/15">
            <Captions className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold text-ink">Lesson transcript</p>
            <p className="mt-0.5 text-xs text-slate-500">
              Read along with timestamps. Generated once and saved for later.
            </p>
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleToggle}
          aria-expanded={open}
          aria-controls={PANEL_ID}
        >
          <Captions className="size-4" aria-hidden="true" />
          {open ? 'Hide transcript' : 'Transcript'}
        </Button>
      </div>

      <div id={PANEL_ID} className="mt-4" hidden={!open}>
        {open ? (
          <>
            {loadError ? (
              <div
                role="alert"
                className="flex items-start gap-3 rounded-xl border border-clay/30 bg-clay/5 p-4 text-sm text-clay"
              >
                <AlertCircle
                  className="mt-0.5 size-4 shrink-0"
                  aria-hidden="true"
                />
                <div>
                  <p className="font-semibold">Unable to load the transcript</p>
                  <p className="mt-1">{loadError.message}</p>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-3"
                    onClick={() => {
                      setResult({ key: null, data: null, error: null })
                      void loadTranscript()
                    }}
                  >
                    <RefreshCw className="size-4" aria-hidden="true" />
                    Try again
                  </Button>
                </div>
              </div>
            ) : null}

            {actionError ? (
              <p role="alert" className="mb-3 text-sm text-clay">
                {actionError}
              </p>
            ) : null}

            {!transcript && !loadError && busy ? (
              <p
                className="flex items-center gap-2 text-sm text-slate-500"
                aria-live="polite"
              >
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Checking for a transcript…
              </p>
            ) : null}

            {active ? (
              <div
                className="rounded-xl border border-brand/20 bg-brand/5 p-4"
                aria-live="polite"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="flex items-center gap-2 text-sm font-medium text-ink-soft">
                    <Loader2
                      className="size-4 animate-spin text-brand-strong"
                      aria-hidden="true"
                    />
                    {TRANSCRIPT_STAGE_LABELS[transcript.stage] ||
                      'Processing your transcript…'}
                  </p>
                  <span className="text-sm font-semibold text-brand-strong">
                    {transcript.progress}%
                  </span>
                </div>
                <ProgressBar
                  value={transcript.progress}
                  ariaLabel="Lesson transcript generation progress"
                  className="mt-3"
                />
                <p className="mt-2 text-xs text-slate-500">
                  Generating in {languageLabel(transcript.language)}. You can
                  keep using the page while this runs.
                </p>
              </div>
            ) : null}

            {status === 'completed' ? (
              <div>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Badge
                    variant={transcript.formatted_by_ai ? 'brand' : 'neutral'}
                    dot
                  >
                    {transcript.formatted_by_ai
                      ? 'AI formatted'
                      : 'Raw transcript'}
                  </Badge>
                  <span className="text-xs text-slate-500">
                    {languageLabel(transcript.language)}
                    {transcript.completed_at
                      ? ` · generated ${formatDate(transcript.completed_at)}`
                      : ''}
                  </span>
                </div>

                {transcript.formatted_by_ai ? null : (
                  <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Automatic formatting was unavailable, so this is the raw
                    transcript.
                  </p>
                )}

                {paragraphs.length ? (
                  <div className="max-h-96 space-y-4 overflow-y-auto rounded-xl border border-line bg-paper p-4 pr-5">
                    {paragraphs.map((paragraph, index) => (
                      <p
                        key={`${paragraph.timestamp || 'paragraph'}-${index}`}
                        className="flex gap-3 text-sm leading-relaxed text-slate-700"
                      >
                        {paragraph.timestamp ? (
                          <span className="h-fit shrink-0 rounded bg-brand/10 px-1.5 py-0.5 font-mono text-xs font-semibold text-brand-strong">
                            {paragraph.timestamp}
                          </span>
                        ) : null}
                        <span>{paragraph.text}</span>
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-600">
                    The transcript is empty.
                  </p>
                )}
              </div>
            ) : null}

            {status === 'failed' ? (
              <div
                role="alert"
                className="rounded-xl border border-clay/30 bg-clay/5 p-4 text-sm text-clay"
              >
                <p className="flex items-center gap-2 font-semibold">
                  <AlertCircle className="size-4" aria-hidden="true" />
                  Transcript generation failed
                </p>
                <p className="mt-1">
                  {transcript.error_message ||
                    'The transcript could not be generated.'}
                </p>
              </div>
            ) : null}

            {!active && !loadError && (transcript || !busy) ? (
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-slate-500">
                    Transcript language
                  </span>
                  <select
                    value={language}
                    onChange={(event) => setLanguage(event.target.value)}
                    aria-label="Transcript language"
                    className="h-11 rounded-xl border border-line bg-paper px-3 text-sm text-ink-soft"
                  >
                    {TRANSCRIPT_LANGUAGES.map(({ code, label }) => (
                      <option key={code} value={code}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                <Button
                  variant={status === 'completed' ? 'secondary' : 'primary'}
                  onClick={() =>
                    startGeneration({ regenerate: status === 'completed' })
                  }
                  loading={busy}
                  disabled={busy}
                >
                  {!busy ? (
                    <RefreshCw className="size-4" aria-hidden="true" />
                  ) : null}
                  {status === 'completed'
                    ? 'Regenerate'
                    : status === 'failed'
                      ? 'Try again'
                      : 'Generate transcript'}
                </Button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  )
}
