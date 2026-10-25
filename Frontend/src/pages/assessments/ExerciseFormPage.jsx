import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { CheckCircle2, FileQuestion, Lock, RotateCcw, ShieldCheck } from 'lucide-react'
import { createExercise, fetchExercise, updateExercise } from '../../api/assessments'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { firstFieldError, isCanceled, normalizeApiError } from '../../lib/api'
import { canManageCourses } from '../../lib/roles'
import {
  DIFFICULTIES,
  canManageAssessment,
  attachmentKind,
  buildExerciseFormData,
  manageableCourses,
  validateAttachment,
  validateExercise,
} from '../../lib/assessments'
import { useAppConfig } from '../../hooks/useAppConfig'
import { useCourseOptions } from '../../hooks/useCourseOptions'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { Button, LinkButton } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Input, Select, Textarea } from '../../components/ui/Field'
import { PageLoader } from '../../components/ui/Skeleton'
import { AccessDenied } from '../../components/courses/AccessDenied'
import { FileDropzone } from '../../components/courses/FileDropzone'
import { FilePreview } from '../../components/courses/FilePreview'
import { BackLink } from '../../components/assessments/BackLink'
import { ToggleField } from '../../components/assessments/ToggleField'

const FIELDS = [
  'title',
  'description',
  'instructions',
  'course',
  'difficulty',
  'points',
  'due_at',
  'attachment',
]

const INITIAL_VALUES = {
  title: '',
  description: '',
  instructions: '',
  course: '',
  difficulty: 'beginner',
  points: '10',
  due_at: '',
  is_published: false,
}

/** ISO date → value for <input type="datetime-local"> in local time. */
function toLocalInput(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function valuesFromExercise(exercise) {
  return {
    title: exercise.title,
    description: exercise.description || '',
    instructions: exercise.instructions,
    course: String(exercise.course),
    difficulty: exercise.difficulty,
    points: String(exercise.points),
    due_at: toLocalInput(exercise.due_at),
    is_published: exercise.is_published,
  }
}

export default function ExerciseFormPage() {
  const { exerciseId } = useParams()
  const isEdit = Boolean(exerciseId)
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { addToast } = useToast()
  const { courses, loading: coursesLoading, error: coursesError, retry: retryCourses } =
    useCourseOptions()
  const { config, loading: configLoading, error: configError, retry: retryConfig } = useAppConfig()

  useDocumentTitle(isEdit ? 'Edit an exercise' : 'Create an exercise')

  const [reload, setReload] = useState(0)
  const [fetchResult, setFetchResult] = useState({ key: null, exercise: null, error: null })
  const [values, setValues] = useState(() => ({
    ...INITIAL_VALUES,
    course: searchParams.get('course') || '',
  }))
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [removeAttachment, setRemoveAttachment] = useState(false)
  const [previewUrl, setPreviewUrl] = useState(null)
  const previewUrlRef = useRef(null)

  const requestKey = `${exerciseId ?? 'new'}:${reload}`

  useEffect(() => {
    if (!isEdit) return undefined
    const controller = new AbortController()
    fetchExercise(exerciseId, { signal: controller.signal })
      .then((payload) => {
        setFetchResult({ key: requestKey, exercise: payload, error: null })
        setValues(valuesFromExercise(payload))
      })
      .catch((requestError) => {
        if (isCanceled(requestError)) return
        setFetchResult({
          key: requestKey,
          exercise: null,
          error: normalizeApiError(requestError, 'Unable to load this exercise.'),
        })
      })
    return () => controller.abort()
  }, [isEdit, exerciseId, requestKey])

  useEffect(
    () => () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    },
    [],
  )

  const loadingExercise = isEdit && fetchResult.key !== requestKey
  const exercise = loadingExercise ? null : fetchResult.exercise
  const loadError = loadingExercise ? null : fetchResult.error

  function updateField(name, value) {
    setValues((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({ ...current, [name]: undefined }))
  }

  function updatePreview(file) {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = file ? URL.createObjectURL(file) : null
    setPreviewUrl(previewUrlRef.current)
  }

  function handleFileSelect(file) {
    const fileError = validateAttachment(file, config)
    setErrors((current) => ({ ...current, attachment: fileError || undefined }))
    if (fileError) {
      setSelectedFile(null)
      updatePreview(null)
      return
    }
    setSelectedFile(file)
    setRemoveAttachment(false)
    updatePreview(file)
  }

  function clearSelectedFile() {
    setSelectedFile(null)
    updatePreview(null)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError('')
    const nextErrors = validateExercise(values, { isEdit })
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return

    const formData = buildExerciseFormData(values, { file: selectedFile, removeAttachment })

    function handleUploadProgress(uploadEvent) {
      if (!selectedFile || !uploadEvent.total) return
      setProgress(Math.min(100, Math.round((uploadEvent.loaded / uploadEvent.total) * 100)))
    }

    setSaving(true)
    setProgress(selectedFile ? 0 : null)
    try {
      const saved = isEdit
        ? await updateExercise(exerciseId, formData, { onUploadProgress: handleUploadProgress })
        : await createExercise(formData, { onUploadProgress: handleUploadProgress })
      addToast({
        type: 'success',
        message: isEdit
          ? `Exercise “${saved.title}” has been updated.`
          : `Exercise “${saved.title}” has been created.`,
      })
      navigate(`/exercises/${saved.id}`, { replace: isEdit })
    } catch (submitError) {
      const error = normalizeApiError(submitError, 'Saving the exercise failed.')
      const fieldErrors = Object.fromEntries(
        FIELDS.map((name) => [name, firstFieldError(error.fields, name)]).filter(([, message]) => message),
      )
      setErrors(fieldErrors)
      if (!Object.keys(fieldErrors).length) setFormError(error.message)
    } finally {
      setSaving(false)
      setProgress(null)
    }
  }

  if (loadingExercise || coursesLoading || configLoading) {
    return <PageLoader label={isEdit ? 'Loading exercise…' : 'Preparing the form…'} />
  }

  if (loadError) {
    return (
      <div className="space-y-6">
        <BackLink to="/assessments?tab=exercises" label="Back to exercises" />
        {loadError.status === 404 ? (
          <EmptyState
            icon={FileQuestion}
            title="Exercise not found"
            description="This exercise does not exist or has been deleted."
            action={<LinkButton to="/assessments?tab=exercises">View exercises</LinkButton>}
          />
        ) : (
          <div role="alert">
            <EmptyState
              icon={FileQuestion}
              title="Unable to load the exercise"
              description={loadError.message}
              action={
                <Button variant="secondary" onClick={() => setReload((current) => current + 1)}>
                  <RotateCcw className="size-4" aria-hidden="true" />
                  Try again
                </Button>
              }
            />
          </div>
        )}
      </div>
    )
  }

  if (!canManageCourses(user?.role) || (isEdit && !canManageAssessment(user, exercise))) {
    return <AccessDenied />
  }

  if (configError) {
    return (
      <div role="alert">
        <EmptyState
          icon={FileQuestion}
          title="Upload rules unavailable"
          description={configError.message}
          action={
            <Button variant="secondary" onClick={retryConfig}>
              <RotateCcw className="size-4" aria-hidden="true" />
              Try again
            </Button>
          }
        />
      </div>
    )
  }

  if (coursesError) {
    return (
      <div role="alert">
        <EmptyState
          icon={FileQuestion}
          title="Courses unavailable"
          description={coursesError.message}
          action={
            <Button variant="secondary" onClick={retryCourses}>
              <RotateCcw className="size-4" aria-hidden="true" />
              Try again
            </Button>
          }
        />
      </div>
    )
  }

  const courseChoices = [...manageableCourses(user, courses)]
  if (exercise && !courseChoices.some((item) => item.id === exercise.course)) {
    courseChoices.push({ id: exercise.course, title: exercise.course_title })
  }

  if (!isEdit && courseChoices.length === 0) {
    return (
      <EmptyState
        icon={FileQuestion}
        title="Publish a course first"
        description="Exercises belong to a course. Publish a course before creating its exercises."
        action={<LinkButton to="/courses/new">Publish a course</LinkButton>}
      />
    )
  }

  const cancelTarget = isEdit ? `/exercises/${exerciseId}` : '/assessments?tab=exercises'
  const accept = config.allowed_extensions.map((extension) => `.${extension}`).join(',')
  const formats = config.allowed_extensions.map((extension) => extension.toUpperCase())
  const currentAttachment = exercise?.attachment_url && !removeAttachment ? exercise : null

  return (
    <div className="space-y-6">
      <BackLink to={cancelTarget} label={isEdit ? 'Back to exercise' : 'Back to exercises'} />

      <header className="border-b border-line pb-6">
        <p className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-strong">
          <span className="h-px w-7 bg-brand" aria-hidden="true" />
          {isEdit ? 'Update' : 'New exercise'}
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          {isEdit ? 'Edit exercise' : 'Create an exercise'}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          Students answer in writing and you grade each submission with a score and feedback.
        </p>
      </header>

      {formError ? (
        <div
          role="alert"
          className="rounded-xl border border-clay/25 bg-clay/[0.06] px-4 py-3 text-sm font-medium text-clay"
        >
          {formError}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} noValidate aria-busy={saving || undefined}>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-6">
            <Card className="space-y-5">
              <h2 className="text-xl font-semibold text-ink">Exercise details</h2>

              <Input
                label="Exercise title"
                name="title"
                value={values.title}
                onChange={(event) => updateField('title', event.target.value)}
                error={errors.title}
                maxLength={200}
                disabled={saving}
                required
              />

              <Textarea
                label="Description"
                name="description"
                rows={3}
                value={values.description}
                onChange={(event) => updateField('description', event.target.value)}
                error={errors.description}
                hint="Optional. A short summary shown in the list."
                disabled={saving}
              />

              <Textarea
                label="Instructions"
                name="instructions"
                rows={7}
                value={values.instructions}
                onChange={(event) => updateField('instructions', event.target.value)}
                error={errors.instructions}
                hint="Explain exactly what students must produce and how it will be assessed."
                disabled={saving}
                required
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <Select
                  label="Course"
                  name="course"
                  value={values.course}
                  onChange={(event) => updateField('course', event.target.value)}
                  error={errors.course}
                  disabled={saving}
                  required
                >
                  <option value="">Select a course…</option>
                  {courseChoices.map((option) => (
                    <option key={option.id} value={String(option.id)}>
                      {option.title}
                    </option>
                  ))}
                </Select>

                <Select
                  label="Difficulty"
                  name="difficulty"
                  value={values.difficulty}
                  onChange={(event) => updateField('difficulty', event.target.value)}
                  error={errors.difficulty}
                  disabled={saving}
                  required
                >
                  {DIFFICULTIES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>

                <Input
                  label="Maximum points"
                  name="points"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={1000}
                  value={values.points}
                  onChange={(event) => updateField('points', event.target.value)}
                  error={errors.points}
                  disabled={saving}
                  required
                />

                <Input
                  label="Due date"
                  name="due_at"
                  type="datetime-local"
                  value={values.due_at}
                  onChange={(event) => updateField('due_at', event.target.value)}
                  error={errors.due_at}
                  hint="Optional. Late answers are accepted but flagged."
                  disabled={saving}
                />
              </div>
            </Card>

            <Card className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold text-ink">Supporting material</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Optional. Attach a worksheet, a document or an audio file students need for this
                  exercise.
                </p>
              </div>

              {currentAttachment && !selectedFile ? (
                <FilePreview
                  fileName={currentAttachment.attachment_name || 'Current attachment'}
                  kind={currentAttachment.attachment_type}
                  url={currentAttachment.attachment_url}
                  existing
                  onRemove={saving ? undefined : () => setRemoveAttachment(true)}
                />
              ) : null}

              {selectedFile ? (
                <FilePreview
                  fileName={selectedFile.name}
                  fileSize={selectedFile.size}
                  kind={attachmentKind(selectedFile.name, config)}
                  url={previewUrl}
                  onRemove={saving ? undefined : clearSelectedFile}
                />
              ) : null}

              {removeAttachment && !selectedFile ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-clay/25 bg-clay/[0.06] px-4 py-3 text-sm text-clay">
                  <span>The current attachment will be removed when you save.</span>
                  <Button variant="ghost" size="sm" onClick={() => setRemoveAttachment(false)}>
                    Undo
                  </Button>
                </div>
              ) : null}

              <FileDropzone
                onFileSelect={handleFileSelect}
                accept={accept}
                formats={formats}
                maxSizeMb={config.max_upload_size_mb}
                disabled={saving}
                error={errors.attachment}
              />

              {currentAttachment && selectedFile ? (
                <p className="text-xs text-slate-500">
                  This file will replace the current attachment when you save.
                </p>
              ) : null}
            </Card>
          </div>

          <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
            <Card className="space-y-3">
              <h2 className="text-xl font-semibold text-ink">Visibility</h2>
              <ToggleField
                label="Published"
                description="Students can only see and answer published exercises."
                checked={values.is_published}
                onChange={(checked) => updateField('is_published', checked)}
                disabled={saving}
              />
            </Card>

            <Card>
              <h2 className="text-xl font-semibold text-ink">Good to know</h2>
              <ul className="mt-4 space-y-3 text-sm text-slate-600">
                <li className="flex gap-2.5">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-sage" aria-hidden="true" />
                  <span>Students can edit their answer until you grade it.</span>
                </li>
                <li className="flex gap-2.5">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-strong" aria-hidden="true" />
                  <span>
                    Attachments ({formats.join(', ')}, up to {config.max_upload_size_mb} MB) are
                    private and only served to signed-in users.
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <Lock className="mt-0.5 size-4 shrink-0 text-clay" aria-hidden="true" />
                  <span>You can only add exercises to courses you own, unless you are an administrator.</span>
                </li>
              </ul>
            </Card>

            <Card className="bg-gradient-to-b from-white to-brand/[0.04]">
              <h2 className="text-xl font-semibold text-ink">Save</h2>

              {progress !== null ? (
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between text-xs font-medium text-slate-600">
                    <span>Uploading file…</span>
                    <span>{progress} %</span>
                  </div>
                  <div
                    role="progressbar"
                    aria-label="File upload progress"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={progress}
                    className="h-2 overflow-hidden rounded-full bg-slate-200"
                  >
                    <div
                      className="h-full rounded-full bg-brand transition-all duration-200"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              ) : null}

              <div className="mt-5 space-y-3">
                <Button type="submit" loading={saving} className="w-full">
                  {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create exercise'}
                </Button>
                <LinkButton to={cancelTarget} variant="secondary" className="w-full">
                  Cancel
                </LinkButton>
              </div>
            </Card>
          </aside>
        </div>
      </form>
    </div>
  )
}
