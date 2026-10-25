import { useEffect, useState } from 'react'
import { AlertCircle, Captions, Loader2, RefreshCw } from 'lucide-react'
import {
  fetchCourseTranscript,
  generateCourseTranscript,
} from '../../api/courses'
import { isCanceled, normalizeApiError } from '../../lib/api'
import { formatDate } from '../../lib/format'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { ProgressBar } from './ProgressBar'

const POLL_INTERVAL_MS = 3000
const ACTIVE_STATUSES = new Set(['queued', 'processing'])

const STAGE_LABELS = {
  queued: 'Waiting to start…',
  extracting_audio: 'Extracting the audio track…',
  transcribing: 'Transcribing the audio…',
  formatting: 'Formatting the transcript…',
}

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'French' },
  { code: 'es', label: 'Spanish' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'nl', label: 'Dutch' },
  { code: 'ar', label: 'Arabic' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'el', label: 'Greek' },
  { code: 'tr', label: 'Turkish' },
  { code: 'vi', label: 'Vietnamese' },
]

function defaultLanguage() {
  const code = (navigator.language || '').slice(0, 2).toLowerCase()
  return LANGUAGES.some((language) => language.code === code) ? code : 'en'
}

function parseParagraphs(text) {
  const paragraphs = []

  for (const rawLine of (text || '').split(/\n+/)) {
    const line = rawLine.trim()
    if (!line) continue

    const match = line.match(/^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*(.*)$/)
    if (match) {
      paragraphs.push({ timestamp: match[1], text: match[2] })
    } else if (paragraphs.length) {
      paragraphs[paragraphs.length - 1].text =
        `${paragraphs[paragraphs.length - 1].text} ${line}`.trim()
    } else {
      paragraphs.push({ timestamp: null, text: line })
    }
  }

  return paragraphs
}

export function TranscriptCard({ course, canGenerate }) {
  const [result, setResult] = useState({ key: null, data: null, error: null })
  const [reload, setReload] = useState(0)
  const [pollTick, setPollTick] = useState(0)
  const [starting, setStarting] = useState(false)
  const [actionError, setActionError] = useState(null)
  const [language, setLanguage] = useState(defaultLanguage)

  const requestKey = `${course.id}:${reload}`

  useEffect(() => {
    if (course.type !== 'video' || course.has_file === false) return undefined

    const controller = new AbortController()
    fetchCourseTranscript(course.id, { signal: controller.signal })
      .then((payload) => {
        setResult({ key: requestKey, data: payload, error: null })
      })
      .catch((requestError) => {
        if (isCanceled(requestError)) return
        setResult({
          key: requestKey,
          data: null,
          error: normalizeApiError(
            requestError,
            'Unable to load the transcript.',
          ),
        })
      })

    return () => controller.abort()
  }, [course.id, course.has_file, course.type, requestKey])

  const transcript = result.key === requestKey ? result.data : null
  const loadError = result.key === requestKey ? result.error : null
  const active = ACTIVE_STATUSES.has(transcript?.status)

  useEffect(() => {
    if (!active) return undefined

    const controller = new AbortController()
    let cancelled = false
    const timer = setTimeout(() => {
      fetchCourseTranscript(course.id, { signal: controller.signal })
        .then((payload) => {
          if (cancelled) return
          setResult((current) =>
            current.key === requestKey
              ? { ...current, data: payload, error: null }
              : current,
          )
        })
        .catch(() => {
          // Keep the last visible progress state; the next tick retries.
        })
        .finally(() => {
          if (!cancelled) setPollTick((current) => current + 1)
        })
    }, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
      controller.abort()
    }
  }, [active, course.id, pollTick, requestKey, transcript])

  if (course.type !== 'video' || course.has_file === false) return null

  async function handleGenerate() {
    setStarting(true)
    setActionError(null)
    try {
      const payload = await generateCourseTranscript(course.id, { language })
      setResult({ key: requestKey, data: payload, error: null })
    } catch (requestError) {
      setActionError(
        normalizeApiError(
          requestError,
          'Unable to start transcript generation.',
        ).message,
      )
    } finally {
      setStarting(false)
    }
  }

  const status = transcript?.status ?? 'none'
  const progress = transcript?.progress ?? 0
  const canStart =
    !loadError && canGenerate && (status === 'none' || status === 'failed')
  const paragraphs = status === 'completed' ? parseParagraphs(transcript.text) : []

  return (
    <Card as="section" aria-labelledby="course-transcript-title" aria-busy={active || undefined}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand-strong ring-1 ring-inset ring-brand/15">
            <Captions className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h2
              id="course-transcript-title"
              className="text-xl font-semibold text-ink"
            >
              Video transcript
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Read along with the lesson. Each paragraph starts with the
              timestamp where it begins.
            </p>
          </div>
        </div>

        {status === 'completed' ? (
          <Badge variant={transcript.formatted_by_ai ? 'brand' : 'neutral'} dot>
            {transcript.formatted_by_ai ? 'AI formatted' : 'Raw transcript'}
          </Badge>
        ) : null}
      </div>

      {!transcript && !loadError ? (
        <p
          className="mt-5 flex items-center gap-2 text-sm text-slate-500"
          aria-live="polite"
        >
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Checking for a transcript…
        </p>
      ) : null}

      {loadError ? (
        <div
          role="alert"
          className="mt-5 flex items-start gap-3 rounded-xl border border-clay/30 bg-clay/5 p-4 text-sm text-clay"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">Unable to load the transcript</p>
            <p className="mt-1">{loadError.message}</p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={() => setReload((current) => current + 1)}
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              Try again
            </Button>
          </div>
        </div>
      ) : null}

      {active ? (
        <div
          className="mt-5 rounded-xl border border-brand/20 bg-brand/5 p-4"
          aria-live="polite"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm font-medium text-ink-soft">
              <Loader2
                className="size-4 animate-spin text-brand-strong"
                aria-hidden="true"
              />
              {STAGE_LABELS[transcript.stage] || 'Processing your transcript…'}
            </p>
            <span className="text-sm font-semibold text-brand-strong">
              {progress}%
            </span>
          </div>
          <ProgressBar
            value={progress}
            ariaLabel="Transcript generation progress"
            className="mt-3"
          />
          <p className="mt-2 text-xs text-slate-500">
            Long videos can take a few minutes. You can keep using the page
            while this runs.
          </p>
        </div>
      ) : null}

      {canStart ? (
        <div className="mt-5 rounded-xl border border-line bg-mist/50 p-4">
          <p className="text-sm text-slate-600">
            {status === 'failed'
              ? 'The previous attempt failed. You can retry with the selected language.'
              : 'Generate a readable transcript of this video. Cohere transcribes the audio and formats it into paragraphs.'}
          </p>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-500">
                Spoken language
              </span>
              <select
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                aria-label="Spoken language"
                className="h-11 rounded-xl border border-line bg-paper px-3 text-sm text-ink-soft"
              >
                {LANGUAGES.map(({ code, label }) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <Button onClick={handleGenerate} loading={starting} disabled={starting}>
              <Captions className="size-4" aria-hidden="true" />
              {status === 'failed' ? 'Try again' : 'Generate transcript'}
            </Button>
          </div>

          {status === 'failed' && transcript.error_message ? (
            <p role="alert" className="mt-3 text-sm text-clay">
              {transcript.error_message}
            </p>
          ) : null}

          {actionError ? (
            <p role="alert" className="mt-3 text-sm text-clay">
              {actionError}
            </p>
          ) : null}
        </div>
      ) : null}

      {status === 'completed' ? (
        <div className="mt-5">
          {transcript.formatted_by_ai ? null : (
            <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Automatic formatting was unavailable, so this is the raw
              transcript.
            </p>
          )}

          {paragraphs.length ? (
            <div className="max-h-[28rem] space-y-4 overflow-y-auto rounded-xl border border-line bg-paper p-4 pr-5">
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
            <p className="text-sm text-slate-600">The transcript is empty.</p>
          )}

          {transcript.completed_at ? (
            <p className="mt-3 text-xs text-slate-500">
              Generated on {formatDate(transcript.completed_at)}
            </p>
          ) : null}
        </div>
      ) : null}

      {status === 'none' && !canGenerate ? (
        <p className="mt-5 text-sm text-slate-500">
          No transcript has been generated for this video yet.
        </p>
      ) : null}

      {status === 'failed' && !canGenerate ? (
        <p role="alert" className="mt-5 text-sm text-clay">
          {transcript.error_message || 'Transcript generation failed.'}
        </p>
      ) : null}
    </Card>
  )
}
