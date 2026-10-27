import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  BookOpen,
  Loader2,
  MessageCircleQuestion,
  Mic,
  Pencil,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  Upload,
  Volume2,
} from 'lucide-react'
import {
  askVoiceQuestion,
  createVoiceQuestion,
  deleteVoiceQuestion,
  fetchVoiceConfig,
  fetchVoiceQuestion,
  fetchVoiceQuestions,
  retryVoiceQuestion,
} from '../../api/voiceQuestions'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { firstFieldError, isCanceled, normalizeApiError } from '../../lib/api'
import { cx } from '../../lib/cx'
import { fileExtension, formatDate } from '../../lib/format'
import { useAudioRecorder, extensionForMimeType } from '../../hooks/useAudioRecorder'
import { useCourseOptions } from '../../hooks/useCourseOptions'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Select, Textarea } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { PageLoader } from '../../components/ui/Skeleton'
import { FileDropzone } from '../../components/courses/FileDropzone'
import { FilePreview } from '../../components/courses/FilePreview'
import { AnswerFeedback, TeacherAnswer } from '../../components/voice/AnswerFeedback'
import { AudioRecorder } from '../../components/voice/AudioRecorder'
import { VoiceHistory } from '../../components/voice/VoiceHistory'

const POLL_INTERVAL_MS = 1200
const MAX_QUESTION_CHARS = 2000
const LANGUAGE_NAMES = { fr: 'French', en: 'English', ar: 'Arabic' }
const BUSY = ['transcribing', 'answering']

function formatSeconds(ms) {
  if (!ms && ms !== 0) return ''
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`
}

function ProgressCard({ title, description }) {
  return (
    <Card aria-live="polite">
      <div className="flex items-start gap-3">
        <Loader2 className="mt-1 size-6 shrink-0 animate-spin text-brand" aria-hidden="true" />
        <div>
          <h2 className="text-xl font-semibold text-ink">{title}</h2>
          <p className="mt-1 text-sm text-slate-600">{description}</p>
        </div>
      </div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
        <div className="h-full w-1/3 animate-pulse rounded-full bg-brand" />
      </div>
    </Card>
  )
}

function QuestionSummary({ question }) {
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xl font-semibold text-ink">
          <MessageCircleQuestion className="size-5 text-brand-strong" aria-hidden="true" />
          Your question
        </h2>
        <div className="flex flex-wrap gap-1.5">
          <Badge>
            <BookOpen className="size-3.5" aria-hidden="true" />
            {question.course_title}
          </Badge>
          {question.detected_language ? (
            <Badge variant="sage">{LANGUAGE_NAMES[question.detected_language] || question.detected_language}</Badge>
          ) : null}
        </div>
      </div>
      <p dir="auto" className="mt-3 whitespace-pre-line text-base leading-relaxed text-ink-soft">
        {question.question_text || question.transcript}
      </p>
      {/* Student's own recording: its text is shown just above. */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio controls preload="none" src={question.audio_url} aria-label="Listen to your recorded question" className="mt-4 w-full" />
    </Card>
  )
}

export default function VoiceQuestionsPage() {
  useDocumentTitle('Voice questions')
  const { user } = useAuth()
  const { addToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const { courses, loading: coursesLoading } = useCourseOptions()

  const [config, setConfig] = useState({ loading: true, data: null, error: null })
  const [history, setHistory] = useState({ loading: true, items: [], error: '' })
  const [historyReload, setHistoryReload] = useState(0)

  const [course, setCourse] = useState(searchParams.get('course') || '')
  const [language, setLanguage] = useState('auto')
  const [mode, setMode] = useState('record')
  const [file, setFile] = useState(null)
  const [filePreview, setFilePreview] = useState(null)
  const [errors, setErrors] = useState({})
  const [sending, setSending] = useState(false)
  const [actionError, setActionError] = useState('')

  const [current, setCurrent] = useState(null)
  const [pollCount, setPollCount] = useState(0)
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [toDelete, setToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const maxSeconds = config.data?.max_recording_seconds || 180
  const recorder = useAudioRecorder({ maxSeconds })
  const selectedId = searchParams.get('q')

  useEffect(() => {
    const controller = new AbortController()
    fetchVoiceConfig({ signal: controller.signal })
      .then((data) => setConfig({ loading: false, data, error: null }))
      .catch((error) => {
        if (isCanceled(error)) return
        setConfig({ loading: false, data: null, error: normalizeApiError(error, 'Voice questions are unavailable.') })
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetchVoiceQuestions({}, { signal: controller.signal })
      .then((data) => setHistory({ loading: false, items: data.results, error: '' }))
      .catch((error) => {
        if (isCanceled(error)) return
        setHistory({ loading: false, items: [], error: normalizeApiError(error, 'Unable to load your questions.').message })
      })
    return () => controller.abort()
  }, [historyReload])

  // Open the question named in the URL (page reload, shared link). Only reacts to
  // URL changes: the URL updates a tick after "Ask another question" clears the
  // page, and re-running on that stale URL would reopen the old question.
  const currentIdRef = useRef(null)
  useEffect(() => {
    currentIdRef.current = current?.id ?? null
  }, [current?.id])
  useEffect(() => {
    if (!selectedId || currentIdRef.current === selectedId) return undefined
    const controller = new AbortController()
    fetchVoiceQuestion(selectedId, { signal: controller.signal })
      .then((question) => {
        setCurrent(question)
        setDraft(question.question_text || question.transcript)
        setEditing(false)
      })
      .catch((error) => {
        if (isCanceled(error)) return
        setSearchParams({}, { replace: true })
      })
    return () => controller.abort()
  }, [selectedId, setSearchParams])

  // Follow the background work until it is done.
  const currentId = current?.id
  const busy = BUSY.includes(current?.status)
  useEffect(() => {
    if (!currentId || !busy) return undefined
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      fetchVoiceQuestion(currentId, { signal: controller.signal })
        .then((question) => {
          setCurrent(question)
          if (question.status === 'transcribed') setDraft(question.question_text || question.transcript)
          if (!BUSY.includes(question.status)) setHistoryReload((count) => count + 1)
        })
        .catch(() => {}) // try again on the next poll
        .finally(() => {
          if (!controller.signal.aborted) setPollCount((count) => count + 1)
        })
    }, POLL_INTERVAL_MS)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [currentId, busy, pollCount])

  useEffect(
    () => () => {
      if (filePreview) URL.revokeObjectURL(filePreview)
    },
    [filePreview],
  )

  const show = useCallback(
    (question) => {
      setCurrent(question)
      setDraft(question.question_text || question.transcript)
      setEditing(false)
      setActionError('')
      setSearchParams({ q: question.id }, { replace: true })
    },
    [setSearchParams],
  )

  // After a rating or a request to the teacher: refresh the question and its history entry.
  function updateCurrent(question) {
    setCurrent(question)
    setHistory((state) => ({
      ...state,
      items: state.items.map((item) => (item.id === question.id ? question : item)),
    }))
  }

  function startOver() {
    setCurrent(null)
    setDraft('')
    setEditing(false)
    setActionError('')
    setErrors({})
    setFile(null)
    setFilePreview(null)
    recorder.reset()
    setSearchParams(course ? { course } : {}, { replace: true })
  }

  function chooseFile(selected) {
    const extension = fileExtension(selected.name)
    const allowed = config.data?.audio_extensions || []
    if (!allowed.includes(extension)) {
      setErrors({ audio: `Unsupported audio format. Choose ${allowed.map((item) => item.toUpperCase()).join(', ')}.` })
      return
    }
    if (selected.size > config.data.max_audio_bytes) {
      setErrors({ audio: `The file exceeds the maximum size of ${config.data.max_audio_mb} MB.` })
      return
    }
    setErrors({})
    setFile(selected)
    setFilePreview(URL.createObjectURL(selected))
  }

  async function submitAudio(event) {
    event.preventDefault()
    setActionError('')
    const next = {}
    if (!course) next.course = 'Choose the course your question is about.'
    let audio = null
    if (mode === 'record') {
      if (recorder.blob) {
        audio = new File([recorder.blob], `question.${extensionForMimeType(recorder.mimeType)}`, {
          type: recorder.mimeType,
        })
      } else {
        next.audio = 'Record your question first.'
      }
    } else if (file) {
      audio = file
    } else {
      next.audio = 'Choose an audio file.'
    }
    setErrors(next)
    if (Object.keys(next).length) return

    const formData = new FormData()
    formData.append('course', course)
    formData.append('language', language)
    formData.append('audio', audio)
    setSending(true)
    try {
      const created = await createVoiceQuestion(formData)
      recorder.reset()
      setFile(null)
      setFilePreview(null)
      show(created)
      setHistoryReload((count) => count + 1)
    } catch (submitError) {
      const error = normalizeApiError(submitError, 'Your question could not be sent.')
      setErrors({
        course: firstFieldError(error.fields, 'course'),
        audio: firstFieldError(error.fields, 'audio'),
      })
      if (!error.fields?.course && !error.fields?.audio) setActionError(error.message)
    } finally {
      setSending(false)
    }
  }

  async function ask() {
    const text = draft.trim()
    if (!text) {
      setErrors({ draft: 'Your question cannot be empty.' })
      return
    }
    setErrors({})
    setActionError('')
    setSending(true)
    try {
      const updated = await askVoiceQuestion(current.id, text)
      setCurrent(updated)
      setEditing(false)
    } catch (askError) {
      const error = normalizeApiError(askError, 'Your question could not be sent.')
      setErrors({ draft: firstFieldError(error.fields, 'question_text') })
      if (!error.fields?.question_text) setActionError(firstFieldError(error.fields, 'non_field_errors') || error.message)
    } finally {
      setSending(false)
    }
  }

  async function retry() {
    setActionError('')
    setSending(true)
    try {
      setCurrent(await retryVoiceQuestion(current.id))
    } catch (retryError) {
      const error = normalizeApiError(retryError, 'Retrying failed.')
      setActionError(firstFieldError(error.fields, 'non_field_errors') || error.message)
    } finally {
      setSending(false)
    }
  }

  async function confirmDelete() {
    setDeleting(true)
    try {
      await deleteVoiceQuestion(toDelete.id)
      addToast({ type: 'success', message: 'The question has been deleted.' })
      if (current?.id === toDelete.id) startOver()
      setToDelete(null)
      setHistoryReload((count) => count + 1)
    } catch (deleteError) {
      addToast({ type: 'error', message: normalizeApiError(deleteError, 'Deletion failed.').message })
    } finally {
      setDeleting(false)
    }
  }

  const closeDelete = useCallback(() => setToDelete(null), [])

  if (config.loading || coursesLoading) return <PageLoader label="Preparing voice questions…" />

  const enabled = config.data?.enabled
  const isAdmin = user?.role === 'admin'

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-5 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-strong">
            <span className="h-px w-7 bg-brand" aria-hidden="true" />
            Ask by voice
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Voice questions
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
            Ask a question about a course out loud, in French, English or Arabic. Your voice is
            transcribed, you can correct the text, and EduMind AI answers using the course content.
          </p>
        </div>
        {current ? (
          <Button onClick={startOver}>
            <Plus className="size-4" aria-hidden="true" />
            Ask another question
          </Button>
        ) : null}
      </header>

      {!enabled ? (
        <div role="alert">
          <EmptyState
            icon={AlertTriangle}
            title="Voice questions are not available yet"
            description={
              config.error?.message ||
              (isAdmin
                ? `Set ${[
                    !config.data?.transcription_enabled && 'OPENAI_API_KEY',
                    !config.data?.answers_enabled && 'GEMINI_API_KEY',
                  ]
                    .filter(Boolean)
                    .join(' and ')} in the backend .env file, then restart the server and the Celery worker.`
                : 'The speech and AI services have not been configured. Contact an administrator.')
            }
          />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-6">
            {actionError ? (
              <div
                role="alert"
                className="flex items-start gap-3 rounded-xl border border-clay/25 bg-clay/[0.06] px-4 py-3 text-sm font-medium text-clay"
              >
                <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                <p>{actionError}</p>
              </div>
            ) : null}

            {!current ? (
              <form onSubmit={submitAudio} noValidate aria-busy={sending || undefined} className="space-y-6">
                <Card className="space-y-5">
                  <h2 className="text-xl font-semibold text-ink">1. Course and language</h2>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Select
                      label="Course"
                      name="course"
                      value={course}
                      onChange={(event) => {
                        setCourse(event.target.value)
                        setErrors((current_) => ({ ...current_, course: undefined }))
                      }}
                      error={errors.course}
                      disabled={sending}
                      required
                    >
                      <option value="">Select a course…</option>
                      {courses.map((item) => (
                        <option key={item.id} value={String(item.id)}>
                          {item.title}
                        </option>
                      ))}
                    </Select>
                    <Select
                      label="Language spoken"
                      name="language"
                      value={language}
                      onChange={(event) => setLanguage(event.target.value)}
                      hint="Automatic works in most cases; choosing helps with short questions."
                      disabled={sending}
                    >
                      {(config.data?.languages || []).map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                </Card>

                <Card className="space-y-5">
                  <h2 className="text-xl font-semibold text-ink">2. Your question</h2>
                  <div role="radiogroup" aria-label="How to ask" className="grid gap-2 sm:grid-cols-2">
                    {[
                      { value: 'record', label: 'Record with my microphone', icon: Mic },
                      { value: 'upload', label: 'Upload an audio file', icon: Upload },
                    ].map((option) => {
                      const Icon = option.icon
                      const active = mode === option.value
                      return (
                        <button
                          key={option.value}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => {
                            setMode(option.value)
                            setErrors({})
                          }}
                          className={cx(
                            'flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
                            active ? 'border-brand/50 bg-brand/[0.06] text-ink' : 'border-line bg-white text-ink-soft hover:border-slate-300',
                          )}
                        >
                          <Icon className={cx('size-5', active ? 'text-brand-strong' : 'text-slate-500')} aria-hidden="true" />
                          {option.label}
                        </button>
                      )
                    })}
                  </div>

                  {mode === 'record' ? (
                    <AudioRecorder recorder={recorder} maxSeconds={maxSeconds} disabled={sending} />
                  ) : (
                    <div className="space-y-3">
                      {file ? (
                        <FilePreview
                          fileName={file.name}
                          fileSize={file.size}
                          kind="audio"
                          url={filePreview}
                          onRemove={sending ? undefined : () => setFile(null)}
                        />
                      ) : null}
                      <FileDropzone
                        onFileSelect={chooseFile}
                        accept={(config.data?.audio_extensions || []).map((extension) => `.${extension}`).join(',')}
                        formats={(config.data?.audio_extensions || []).map((extension) => extension.toUpperCase())}
                        maxSizeMb={config.data?.max_audio_mb}
                        disabled={sending}
                        error={errors.audio}
                      />
                    </div>
                  )}
                  {mode === 'record' && errors.audio ? (
                    <p role="alert" className="text-sm font-medium text-clay">
                      {errors.audio}
                    </p>
                  ) : null}

                  <div className="flex justify-end">
                    <Button type="submit" variant="accent" loading={sending} disabled={recorder.status === 'recording'}>
                      <Send className="size-4" aria-hidden="true" />
                      {sending ? 'Sending…' : 'Transcribe my question'}
                    </Button>
                  </div>
                </Card>
              </form>
            ) : null}

            {current?.status === 'transcribing' ? (
              <ProgressCard
                title="Transcribing your question…"
                description="Whisper is converting your recording into text. This usually takes a few seconds."
              />
            ) : null}

            {current && (current.status === 'transcribed' || editing) ? (
              <Card className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-xl font-semibold text-ink">Check your question</h2>
                  {current.detected_language ? (
                    <Badge variant="sage">
                      Detected: {LANGUAGE_NAMES[current.detected_language] || current.detected_language}
                    </Badge>
                  ) : null}
                </div>
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <audio controls preload="none" src={current.audio_url} aria-label="Listen to your recorded question" className="w-full" />
                <Textarea
                  label="Transcription"
                  name="question_text"
                  rows={4}
                  dir="auto"
                  value={draft}
                  maxLength={MAX_QUESTION_CHARS}
                  onChange={(event) => {
                    setDraft(event.target.value)
                    setErrors({})
                  }}
                  error={errors.draft}
                  hint="Correct any word that was misheard before asking."
                  disabled={sending}
                  required
                />
                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  {editing ? (
                    <Button variant="secondary" onClick={() => setEditing(false)} disabled={sending}>
                      Cancel
                    </Button>
                  ) : (
                    <Button variant="secondary" onClick={startOver} disabled={sending}>
                      <RotateCcw className="size-4" aria-hidden="true" />
                      Record again
                    </Button>
                  )}
                  <Button variant="accent" onClick={ask} loading={sending}>
                    <Sparkles className="size-4" aria-hidden="true" />
                    {sending ? 'Sending…' : 'Get the answer'}
                  </Button>
                </div>
              </Card>
            ) : null}

            {current && ['answering', 'answered'].includes(current.status) && !editing ? (
              <QuestionSummary question={current} />
            ) : null}

            {current?.status === 'answering' ? (
              <ProgressCard
                title="EduMind AI is preparing your answer…"
                description="Gemini is reading the relevant parts of the course to answer your question."
              />
            ) : null}

            {current?.status === 'answered' && !editing ? (
              <Card className="border-l-4 border-l-sage" aria-live="polite">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="flex items-center gap-2 text-xl font-semibold text-ink">
                    <Sparkles className="size-5 text-sage" aria-hidden="true" />
                    EduMind AI answer
                  </h2>
                  <span className="text-xs text-slate-600">
                    Based on the {current.context_source || 'course'} · {formatSeconds(current.answer_ms)}
                  </span>
                </div>
                <div
                  dir="auto"
                  lang={current.answer_language || undefined}
                  className="mt-4 whitespace-pre-line text-base leading-relaxed text-ink-soft"
                >
                  {current.answer}
                </div>
                <p className="mt-4 text-xs text-slate-600">
                  AI answers can contain mistakes. Check important points in the course material.
                  Answered on {formatDate(current.answered_at)}.
                </p>
                <div className="mt-4">
                  <AnswerFeedback key={current.id} question={current} onChange={updateCurrent} />
                </div>
                <div className="mt-5 flex flex-col-reverse gap-3 border-t border-line pt-4 sm:flex-row sm:justify-end">
                  {/* A question sent to the teacher stays as it was asked. */}
                  {!current.escalated_at ? (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setDraft(current.question_text)
                        setEditing(true)
                      }}
                    >
                      <Pencil className="size-4" aria-hidden="true" />
                      Edit and ask again
                    </Button>
                  ) : null}
                  <Button onClick={startOver}>
                    <Volume2 className="size-4" aria-hidden="true" />
                    Ask another question
                  </Button>
                </div>
              </Card>
            ) : null}

            {current?.status === 'answered' && current.review_status === 'answered' && !editing ? (
              <TeacherAnswer question={current} />
            ) : null}

            {current?.status === 'failed' && !editing ? (
              <Card className="border-l-4 border-l-clay" role="alert">
                <h2 className="flex items-center gap-2 text-xl font-semibold text-ink">
                  <AlertTriangle className="size-5 text-clay" aria-hidden="true" />
                  {current.failed_stage === 'answer' ? 'The answer could not be generated' : 'The recording could not be transcribed'}
                </h2>
                <p className="mt-2 text-sm text-ink-soft">{current.error_message}</p>
                {current.question_text || current.transcript ? (
                  <p dir="auto" className="mt-3 rounded-xl bg-mist px-4 py-3 text-sm text-ink-soft">
                    {current.question_text || current.transcript}
                  </p>
                ) : null}
                <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <Button variant="secondary" onClick={startOver} disabled={sending}>
                    Start over
                  </Button>
                  {current.failed_stage === 'answer' && current.transcript ? (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setDraft(current.question_text || current.transcript)
                        setEditing(true)
                      }}
                      disabled={sending}
                    >
                      <Pencil className="size-4" aria-hidden="true" />
                      Edit the question
                    </Button>
                  ) : null}
                  <Button variant="accent" onClick={retry} loading={sending}>
                    <RotateCcw className="size-4" aria-hidden="true" />
                    Retry
                  </Button>
                </div>
              </Card>
            ) : null}
          </div>

          <VoiceHistory
            items={history.items}
            loading={history.loading}
            error={history.error}
            activeId={current?.id}
            onSelect={show}
            onDelete={setToDelete}
          />
        </div>
      )}

      <Modal
        open={Boolean(toDelete)}
        onClose={closeDelete}
        title="Delete this question?"
        description="The recording, its transcription and the AI answer will be permanently deleted."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={closeDelete} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmDelete} loading={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </>
        }
      />
    </div>
  )
}
