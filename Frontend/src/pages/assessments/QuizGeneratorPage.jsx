import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Circle,
  Cpu,
  FileQuestion,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Upload,
  WifiOff,
} from 'lucide-react'
import {
  fetchGenerationMetrics,
  fetchGenerationSources,
  fetchQuizGeneration,
  startQuizGeneration,
} from '../../api/assessments'
import { useToast } from '../../context/ToastContext'
import { firstFieldError, isCanceled, normalizeApiError } from '../../lib/api'
import { cx } from '../../lib/cx'
import { fileExtension, pluralize } from '../../lib/format'
import {
  DIFFICULTIES,
  GENERATION_FILE_EXTENSIONS,
  GENERATION_STAGES,
  QUESTION_TYPES,
  difficultyLabel,
  draftFromGeneration,
  formatPercentage,
  isGenerationFinished,
  questionTypeLabel,
} from '../../lib/assessments'
import { useAppConfig } from '../../hooks/useAppConfig'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { Badge } from '../../components/ui/Badge'
import { Button, LinkButton } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Input, Select } from '../../components/ui/Field'
import { PageLoader } from '../../components/ui/Skeleton'
import { FileDropzone } from '../../components/courses/FileDropzone'
import { FilePreview } from '../../components/courses/FilePreview'
import { BackLink } from '../../components/assessments/BackLink'
import { DifficultyBadge } from '../../components/assessments/DifficultyBadge'
import { ToggleField } from '../../components/assessments/ToggleField'

const POLL_INTERVAL_MS = 1000
const NEW_COURSE = 'new'
const SLOW_QUEUE_SECONDS = 15

function formatMs(value) {
  if (value === null || value === undefined) return '—'
  return value >= 1000 ? `${(value / 1000).toFixed(1)} s` : `${Math.round(value)} ms`
}

function MetricsCard({ metrics }) {
  if (!metrics) return null
  const review = metrics.teacher_review
  const rows = [
    ['Quizzes generated', metrics.completed],
    ['Median processing time', formatMs(metrics.processing_ms.median)],
    ['Answers found in the source', formatPercentage(metrics.questions.grounded_rate === null ? null : metrics.questions.grounded_rate * 100)],
    [
      'Questions kept by teachers',
      formatPercentage(review.acceptance_rate === null ? null : review.acceptance_rate * 100),
    ],
  ]
  return (
    <Card className="bg-gradient-to-b from-white to-mist/50">
      <h2 className="text-xl font-semibold text-ink">Generator statistics</h2>
      <dl className="mt-3 divide-y divide-line text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-4 py-2.5">
            <dt className="text-slate-500">{label}</dt>
            <dd className="font-medium text-ink-soft">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-slate-500">
        <Cpu className="size-3.5" aria-hidden="true" />
        Engine: {metrics.engine?.fr === metrics.engine?.en ? metrics.engine?.fr : `${metrics.engine?.fr} / ${metrics.engine?.en}`}
      </p>
    </Card>
  )
}

function StageTracker({ job, elapsed }) {
  const currentIndex = GENERATION_STAGES.findIndex((stage) => stage.value === job.stage)
  const slowQueue = job.status === 'queued' && elapsed >= SLOW_QUEUE_SECONDS
  return (
    <Card aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-ink">Generating your quiz…</h2>
        <span className="text-sm tabular-nums text-slate-500">{elapsed} s</span>
      </div>
      <div
        role="progressbar"
        aria-label="Generation progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={job.progress}
        className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200"
      >
        <div
          className="h-full rounded-full bg-brand transition-all duration-500"
          style={{ width: `${Math.max(job.progress, 4)}%` }}
        />
      </div>
      <ol className="mt-5 space-y-3">
        {GENERATION_STAGES.slice(0, -1).map((stage, index) => {
          const done = index < currentIndex
          const active = index === currentIndex
          return (
            <li
              key={stage.value}
              className={cx(
                'flex items-center gap-3 text-sm',
                done ? 'text-sage' : active ? 'font-semibold text-ink' : 'text-slate-500',
              )}
            >
              {done ? (
                <CheckCircle2 className="size-5 shrink-0" aria-hidden="true" />
              ) : active ? (
                <Loader2 className="size-5 shrink-0 animate-spin text-brand" aria-hidden="true" />
              ) : (
                <Circle className="size-5 shrink-0 text-slate-300" aria-hidden="true" />
              )}
              {stage.label}
              {active ? <span className="sr-only">(in progress)</span> : null}
            </li>
          )
        })}
      </ol>
      {slowQueue ? (
        <div className="mt-5 flex items-start gap-3 rounded-xl border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-800">
          <WifiOff className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <p>
            No background worker has picked up the request yet. Check that Redis and the Celery
            worker are running.
          </p>
        </div>
      ) : null}
    </Card>
  )
}

function ResultCard({ job, onReview, onRestart }) {
  const questions = job.result?.questions || []
  const warnings = job.result?.warnings || []
  return (
    <Card className="border-l-4 border-l-sage">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-ink">
            {questions.length} {pluralize(questions.length, 'question')} ready to review
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            From “{job.source_name}” · {job.language === 'fr' ? 'French' : 'English'} ·{' '}
            {formatMs(job.processing_ms)} · engine {job.engine}
          </p>
        </div>
        <Badge variant="success">
          <CheckCircle2 className="size-3.5" aria-hidden="true" />
          Done
        </Badge>
      </div>

      {warnings.length ? (
        <ul className="mt-4 space-y-1 rounded-xl border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-800">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}

      <ol className="mt-5 space-y-2">
        {questions.map((question, index) => (
          <li key={index} className="rounded-xl border border-line bg-white px-4 py-3">
            <p className="text-sm font-medium text-ink">
              <span className="text-slate-500">{index + 1}.</span> {question.text}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge>{questionTypeLabel(question.type)}</Badge>
              <DifficultyBadge difficulty={question.difficulty} />
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onRestart}>
          <RotateCcw className="size-4" aria-hidden="true" />
          Generate again
        </Button>
        <Button variant="accent" onClick={onReview}>
          <Sparkles className="size-4" aria-hidden="true" />
          Open in quiz builder
        </Button>
      </div>
    </Card>
  )
}

export default function QuizGeneratorPage() {
  useDocumentTitle('Generate a quiz')
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { addToast } = useToast()
  const { config, loading: configLoading } = useAppConfig()

  const [sources, setSources] = useState({ loading: true, items: [], error: null })
  const [metrics, setMetrics] = useState(null)
  const [mode, setMode] = useState('course')
  const [course, setCourse] = useState(searchParams.get('course') || '')
  const [file, setFile] = useState(null)
  // With an uploaded document, the course the generated quiz will belong to.
  const [targetCourse, setTargetCourse] = useState(searchParams.get('course') || '')
  const [numQuestions, setNumQuestions] = useState('10')
  const [difficulty, setDifficulty] = useState('mixed')
  const [types, setTypes] = useState(() => QUESTION_TYPES.map((type) => type.value))
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(null)

  const [job, setJob] = useState(null)
  const [pollCount, setPollCount] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const startedAt = useRef(null)

  useEffect(() => {
    const controller = new AbortController()
    fetchGenerationSources({ signal: controller.signal })
      .then((items) => {
        setSources({ loading: false, items, error: null })
        if (!items.some((item) => item.available)) setMode('upload')
      })
      .catch((error) => {
        if (isCanceled(error)) return
        setSources({ loading: false, items: [], error: normalizeApiError(error, 'Unable to load your courses.') })
        setMode('upload')
      })
    fetchGenerationMetrics({ signal: controller.signal })
      .then(setMetrics)
      .catch(() => {})
    return () => controller.abort()
  }, [])

  // Poll the job until it completes or fails; each response schedules the next poll.
  const jobId = job?.id
  const finished = isGenerationFinished(job)
  useEffect(() => {
    if (!jobId || finished) return undefined
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setElapsed(Math.round((Date.now() - startedAt.current) / 1000))
      fetchQuizGeneration(jobId, { signal: controller.signal })
        .then(setJob)
        .catch(() => {}) // network hiccup: try again on the next poll
        .finally(() => {
          if (!controller.signal.aborted) setPollCount((count) => count + 1)
        })
    }, POLL_INTERVAL_MS)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [jobId, finished, pollCount])

  useEffect(() => {
    if (job?.status === 'completed') {
      fetchGenerationMetrics().then(setMetrics).catch(() => {})
    }
  }, [job?.status])

  function toggleType(value, checked) {
    setTypes((current) =>
      checked ? [...new Set([...current, value])] : current.filter((type) => type !== value),
    )
    setErrors((current) => ({ ...current, question_types: undefined }))
  }

  function handleFile(selected) {
    const extension = fileExtension(selected.name)
    if (!GENERATION_FILE_EXTENSIONS.includes(extension)) {
      setErrors({ file: `Unsupported format. Choose a ${GENERATION_FILE_EXTENSIONS.map((item) => item.toUpperCase()).join(', ')} file.` })
      return
    }
    if (config && selected.size > config.max_upload_size_bytes) {
      setErrors({ file: `The file exceeds the maximum size of ${config.max_upload_size_mb} MB.` })
      return
    }
    setFile(selected)
    setErrors({})
    // A PDF becomes a new course by default; other formats need an existing course.
    if (extension === 'pdf') setTargetCourse((current) => current || NEW_COURSE)
    else setTargetCourse((current) => (current === NEW_COURSE ? '' : current))
  }

  function validate() {
    const next = {}
    if (mode === 'course' && !course) next.course = 'Select a course.'
    if (mode === 'upload' && !file) next.file = 'Choose a document to read.'
    if (mode === 'upload' && !targetCourse) next.target_course = 'Choose the course this quiz belongs to.'
    const count = Number(numQuestions)
    if (!Number.isInteger(count) || count < 3 || count > 30) {
      next.num_questions = 'Choose between 3 and 30 questions.'
    }
    if (!types.length) next.question_types = 'Select at least one question type.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError('')
    if (!validate()) return

    const formData = new FormData()
    if (mode === 'course') {
      formData.append('course', course)
    } else {
      formData.append('file', file)
      if (targetCourse === NEW_COURSE) formData.append('create_course', 'true')
      else formData.append('course', targetCourse)
    }
    formData.append('num_questions', String(Number(numQuestions)))
    formData.append('difficulty', difficulty)
    types.forEach((type) => formData.append('question_types', type))

    setSubmitting(true)
    setUploadProgress(mode === 'upload' ? 0 : null)
    try {
      const created = await startQuizGeneration(formData, {
        onUploadProgress: (progressEvent) => {
          if (!progressEvent.total) return
          setUploadProgress(Math.round((progressEvent.loaded / progressEvent.total) * 100))
        },
      })
      startedAt.current = Date.now()
      setElapsed(0)
      setJob(created)
      if (targetCourse === NEW_COURSE && mode === 'upload') {
        // The new course is now one of the teacher's courses.
        fetchGenerationSources()
          .then((items) => setSources({ loading: false, items, error: null }))
          .catch(() => {})
        setTargetCourse('')
      }
    } catch (submitError) {
      const error = normalizeApiError(submitError, 'The quiz could not be generated.')
      const courseError = firstFieldError(error.fields, 'course')
      const fieldErrors = {
        course: mode === 'course' ? courseError : null,
        target_course:
          mode === 'upload' ? courseError || firstFieldError(error.fields, 'create_course') : null,
        file: firstFieldError(error.fields, 'file'),
        num_questions: firstFieldError(error.fields, 'num_questions'),
        question_types: firstFieldError(error.fields, 'question_types'),
      }
      setErrors(fieldErrors)
      if (!Object.values(fieldErrors).some(Boolean)) {
        setFormError(firstFieldError(error.fields, 'non_field_errors') || error.message)
      }
    } finally {
      setSubmitting(false)
      setUploadProgress(null)
    }
  }

  function restart() {
    setJob(null)
    setElapsed(0)
  }

  function review() {
    addToast({ type: 'info', message: 'Review the generated questions, then save the quiz.' })
    navigate('/quizzes/new', { state: { generation: draftFromGeneration(job) } })
  }

  if (configLoading || sources.loading) return <PageLoader label="Preparing the generator…" />

  const availableCourses = sources.items.filter((item) => item.available)
  const accept = GENERATION_FILE_EXTENSIONS.map((extension) => `.${extension}`).join(',')

  return (
    <div className="space-y-6">
      <BackLink to="/assessments" label="Back to quizzes" />

      <header className="border-b border-line pb-6">
        <p className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-strong">
          <span className="h-px w-7 bg-brand" aria-hidden="true" />
          Local AI · runs on the EduMind server
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          Generate a quiz
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          EduMind reads a course document, finds its key ideas and writes single-choice,
          multiple-choice and true/false questions with answers and explanations. You review
          everything before anything is saved.
        </p>
      </header>

      {job && job.status !== 'failed' ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            {job.status === 'completed' ? (
              <ResultCard job={job} onReview={review} onRestart={restart} />
            ) : (
              <StageTracker job={job} elapsed={elapsed} />
            )}
          </div>
          <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
            <MetricsCard metrics={metrics} />
          </aside>
        </div>
      ) : (
        <>
          {job?.status === 'failed' || formError ? (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-xl border border-clay/25 bg-clay/[0.06] px-4 py-3 text-sm font-medium text-clay"
            >
              <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <p>{job?.status === 'failed' ? job.error_message : formError}</p>
            </div>
          ) : null}

          <form onSubmit={handleSubmit} noValidate aria-busy={submitting || undefined}>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <div className="min-w-0 space-y-6">
                <Card className="space-y-5">
                  <div>
                    <h2 className="text-xl font-semibold text-ink">1. Source</h2>
                    <p className="mt-1 text-sm text-slate-600">
                      Read one of your PDF courses (or a course with a transcript), or upload a
                      document such as slides or notes and attach the quiz to one of your courses.
                    </p>
                  </div>

                  <div role="radiogroup" aria-label="Source type" className="grid gap-2 sm:grid-cols-2">
                    {[
                      { value: 'course', label: 'From one of my courses', icon: BookOpen },
                      { value: 'upload', label: 'Upload a document', icon: Upload },
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
                            active
                              ? 'border-brand/50 bg-brand/[0.06] text-ink'
                              : 'border-line bg-white text-ink-soft hover:border-slate-300',
                          )}
                        >
                          <Icon className={cx('size-5', active ? 'text-brand-strong' : 'text-slate-500')} aria-hidden="true" />
                          {option.label}
                        </button>
                      )
                    })}
                  </div>

                  {mode === 'course' ? (
                    availableCourses.length || sources.items.length ? (
                      <Select
                        label="Course"
                        name="course"
                        value={course}
                        onChange={(event) => {
                          setCourse(event.target.value)
                          setErrors((current) => ({ ...current, course: undefined }))
                        }}
                        error={errors.course}
                        hint="Audio and video courses can be used once their transcript is ready."
                        disabled={submitting}
                        required
                      >
                        <option value="">Select a course…</option>
                        {sources.items.map((item) => (
                          <option key={item.id} value={String(item.id)} disabled={!item.available}>
                            {item.title}
                            {item.available ? '' : ' — transcript needed'}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <EmptyState
                        icon={FileQuestion}
                        title="No course to read yet"
                        description={
                          sources.error?.message ||
                          'Publish a PDF course first, or upload a document instead.'
                        }
                      />
                    )
                  ) : (
                    <div className="space-y-3">
                      {file ? (
                        <FilePreview
                          fileName={file.name}
                          fileSize={file.size}
                          kind="pdf"
                          onRemove={submitting ? undefined : () => setFile(null)}
                        />
                      ) : null}
                      <FileDropzone
                        onFileSelect={handleFile}
                        accept={accept}
                        formats={GENERATION_FILE_EXTENSIONS.map((extension) => extension.toUpperCase())}
                        maxSizeMb={config?.max_upload_size_mb}
                        disabled={submitting}
                        error={errors.file}
                      />
                      <Select
                        label="Course for this quiz"
                        name="target_course"
                        value={targetCourse}
                        onChange={(event) => {
                          setTargetCourse(event.target.value)
                          setErrors((current) => ({ ...current, target_course: undefined }))
                        }}
                        error={errors.target_course}
                        hint={
                          targetCourse === NEW_COURSE
                            ? 'This PDF is published as a new course in your catalogue, and the quiz is attached to it.'
                            : 'The document is only read to write the questions; the quiz is added to this course.'
                        }
                        disabled={submitting}
                        required
                      >
                        <option value="">Select a course…</option>
                        <option
                          value={NEW_COURSE}
                          disabled={Boolean(file) && fileExtension(file.name) !== 'pdf'}
                        >
                          ＋ Create a new course from this document (PDF)
                        </option>
                        {sources.items.map((item) => (
                          <option key={item.id} value={String(item.id)}>
                            {item.title}
                          </option>
                        ))}
                      </Select>
                    </div>
                  )}
                </Card>

                <Card className="space-y-5">
                  <h2 className="text-xl font-semibold text-ink">2. Options</h2>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input
                      label="Number of questions"
                      name="num_questions"
                      type="number"
                      inputMode="numeric"
                      min={3}
                      max={30}
                      value={numQuestions}
                      onChange={(event) => {
                        setNumQuestions(event.target.value)
                        setErrors((current) => ({ ...current, num_questions: undefined }))
                      }}
                      error={errors.num_questions}
                      disabled={submitting}
                      required
                    />
                    <Select
                      label="Difficulty"
                      name="difficulty"
                      value={difficulty}
                      onChange={(event) => setDifficulty(event.target.value)}
                      hint="Harder levels use closer, more confusing wrong answers."
                      disabled={submitting}
                    >
                      <option value="mixed">Mixed</option>
                      {DIFFICULTIES.map((option) => (
                        <option key={option.value} value={option.value}>
                          {difficultyLabel(option.value)}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <fieldset className="space-y-2">
                    <legend className="text-sm font-medium text-ink">Question types</legend>
                    {QUESTION_TYPES.map((type) => (
                      <ToggleField
                        key={type.value}
                        label={type.label}
                        description={
                          {
                            single_choice: 'Fill-in-the-blank and definition questions.',
                            multiple_choice: 'Built from lists of examples in the course.',
                            true_false: 'Statements taken from the course, some subtly changed.',
                          }[type.value]
                        }
                        checked={types.includes(type.value)}
                        onChange={(checked) => toggleType(type.value, checked)}
                        disabled={submitting}
                      />
                    ))}
                    {errors.question_types ? (
                      <p role="alert" className="text-xs font-medium text-clay">
                        {errors.question_types}
                      </p>
                    ) : null}
                  </fieldset>
                </Card>
              </div>

              <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
                <Card>
                  <h2 className="text-xl font-semibold text-ink">How it works</h2>
                  <ul className="mt-4 space-y-3 text-sm text-slate-600">
                    <li className="flex gap-2.5">
                      <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-strong" aria-hidden="true" />
                      <span>Runs entirely on the EduMind server: no external AI service, no data sent online.</span>
                    </li>
                    <li className="flex gap-2.5">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-sage" aria-hidden="true" />
                      <span>Every correct answer comes from a sentence of the document, shown as the explanation.</span>
                    </li>
                    <li className="flex gap-2.5">
                      <Sparkles className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
                      <span>Questions open in the quiz builder: edit or remove them before saving.</span>
                    </li>
                  </ul>
                </Card>

                <Card className="bg-gradient-to-b from-white to-brand/[0.04]">
                  {uploadProgress !== null ? (
                    <div className="mb-4 space-y-2">
                      <div className="flex items-center justify-between text-xs font-medium text-slate-600">
                        <span>Uploading document…</span>
                        <span>{uploadProgress} %</span>
                      </div>
                      <div
                        role="progressbar"
                        aria-label="Upload progress"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={uploadProgress}
                        className="h-2 overflow-hidden rounded-full bg-slate-200"
                      >
                        <div className="h-full rounded-full bg-brand" style={{ width: `${uploadProgress}%` }} />
                      </div>
                    </div>
                  ) : null}
                  <div className="space-y-3">
                    <Button type="submit" variant="accent" loading={submitting} className="w-full">
                      <Sparkles className="size-4" aria-hidden="true" />
                      {submitting ? 'Starting…' : 'Generate questions'}
                    </Button>
                    <LinkButton to="/assessments" variant="secondary" className="w-full">
                      Cancel
                    </LinkButton>
                  </div>
                </Card>

                <MetricsCard metrics={metrics} />
              </aside>
            </div>
          </form>
        </>
      )}
    </div>
  )
}
