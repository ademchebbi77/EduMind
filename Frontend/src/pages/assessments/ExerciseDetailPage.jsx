import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  BookOpen,
  CalendarClock,
  CheckCircle2,
  FileQuestion,
  MessageSquareText,
  Pencil,
  RotateCcw,
  Send,
  Trash2,
  Trophy,
} from 'lucide-react'
import {
  deleteExercise,
  fetchExercise,
  fetchExerciseSubmissions,
  gradeExerciseSubmission,
  submitExerciseAnswer,
} from '../../api/assessments'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { firstFieldError, isCanceled, normalizeApiError } from '../../lib/api'
import { formatDate, pluralize } from '../../lib/format'
import { canManageAssessment } from '../../lib/assessments'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { Badge } from '../../components/ui/Badge'
import { Button, LinkButton } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Textarea } from '../../components/ui/Field'
import { PageLoader, Skeleton } from '../../components/ui/Skeleton'
import { Pagination } from '../../components/courses/Pagination'
import { BackLink } from '../../components/assessments/BackLink'
import { DeleteAssessmentModal } from '../../components/assessments/DeleteAssessmentModal'
import { DifficultyBadge } from '../../components/assessments/DifficultyBadge'
import { ExerciseAttachment } from '../../components/assessments/ExerciseAttachment'
import { GradeSubmissionModal } from '../../components/assessments/GradeSubmissionModal'

const EMPTY_RESULTS = { count: 0, next: null, previous: null, results: [] }
const MAX_LENGTH = 20000

function StudentSubmission({ exercise, onSaved }) {
  const { addToast } = useToast()
  const submission = exercise.my_submission
  const [content, setContent] = useState(submission?.content || '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  if (submission?.is_graded) {
    return (
      <Card className="border-l-4 border-l-sage">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-ink">Your grade</h2>
          <p className="font-display text-3xl font-semibold text-sage tabular-nums">
            {submission.score} / {submission.max_points}
          </p>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Graded on {formatDate(submission.graded_at)}
          {submission.graded_by_name ? ` by ${submission.graded_by_name}` : ''}
        </p>
        {submission.feedback ? (
          <div className="mt-4 rounded-xl bg-mist px-4 py-3 text-sm text-ink-soft">
            <p className="mb-1 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <MessageSquareText className="size-3.5" aria-hidden="true" />
              Feedback
            </p>
            <p className="whitespace-pre-line">{submission.feedback}</p>
          </div>
        ) : null}
        <h3 className="mt-6 text-sm font-semibold text-ink">Your answer</h3>
        <p className="mt-2 whitespace-pre-line rounded-xl border border-line bg-white p-4 text-sm leading-relaxed text-ink-soft">
          {submission.content}
        </p>
      </Card>
    )
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!content.trim()) {
      setError('Write your answer before submitting.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await submitExerciseAnswer(exercise.id, content.trim())
      addToast({
        type: 'success',
        message: submission ? 'Your answer has been updated.' : 'Your answer has been submitted.',
      })
      onSaved()
    } catch (submitError) {
      const normalized = normalizeApiError(submitError, 'Submitting your answer failed.')
      setError(firstFieldError(normalized.fields, 'content') || normalized.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-ink">Your answer</h2>
          {submission ? (
            <Badge variant="success">Submitted {formatDate(submission.updated_at)}</Badge>
          ) : null}
        </div>
        <Textarea
          label="Written response"
          rows={10}
          value={content}
          maxLength={MAX_LENGTH}
          onChange={(event) => {
            setContent(event.target.value)
            setError('')
          }}
          error={error}
          hint={`${content.length} / ${MAX_LENGTH} characters. You can update your answer until it is graded.`}
          disabled={saving}
          required
        />
        <div className="flex justify-end">
          <Button type="submit" variant="accent" loading={saving}>
            <Send className="size-4" aria-hidden="true" />
            {saving ? 'Submitting…' : submission ? 'Update my answer' : 'Submit my answer'}
          </Button>
        </div>
      </form>
    </Card>
  )
}

function SubmissionsPanel({ exercise, onGraded }) {
  const { addToast } = useToast()
  const [page, setPage] = useState(1)
  const [reload, setReload] = useState(0)
  const [state, setState] = useState({ key: null, data: EMPTY_RESULTS, error: null })
  const [grading, setGrading] = useState(null)
  const requestKey = `${exercise.id}:${page}:${reload}`

  useEffect(() => {
    const controller = new AbortController()
    fetchExerciseSubmissions(exercise.id, { page }, { signal: controller.signal })
      .then((payload) => setState({ key: requestKey, data: payload, error: null }))
      .catch((requestError) => {
        if (isCanceled(requestError)) return
        setState({
          key: requestKey,
          data: EMPTY_RESULTS,
          error: normalizeApiError(requestError, 'Unable to load the submissions.'),
        })
      })
    return () => controller.abort()
  }, [exercise.id, page, requestKey])

  const closeGrading = useCallback(() => setGrading(null), [])

  async function saveGrade(payload) {
    const saved = await gradeExerciseSubmission(exercise.id, grading.id, payload)
    addToast({ type: 'success', message: `Grade saved for ${saved.student_name}.` })
    setGrading(null)
    setReload((current) => current + 1)
    onGraded()
  }

  const loading = state.key !== requestKey
  const submissions = state.data.results

  return (
    <Card>
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold text-ink">Submissions</h2>
        <span className="text-sm text-slate-500">
          {exercise.graded_count} / {exercise.submission_count} graded
        </span>
      </div>

      {loading && submissions.length === 0 ? (
        <div className="space-y-2" aria-hidden="true">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : state.error ? (
        <p role="alert" className="text-sm text-clay">
          {state.error.message}
        </p>
      ) : submissions.length === 0 ? (
        <p className="text-sm text-slate-600">No student has submitted an answer yet.</p>
      ) : (
        <div className="space-y-4">
          <ul className="divide-y divide-line">
            {submissions.map((submission) => (
              <li key={submission.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{submission.student_name}</p>
                  <p className="text-xs text-slate-500">
                    {submission.student_email} · {formatDate(submission.updated_at)}
                  </p>
                  <p className="mt-2 line-clamp-2 text-sm text-slate-600">{submission.content}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {submission.is_graded ? (
                      <Badge variant="success">
                        {submission.score} / {submission.max_points} pts
                      </Badge>
                    ) : (
                      <Badge variant="warning">To grade</Badge>
                    )}
                    {submission.is_late ? <Badge variant="clay">Late</Badge> : null}
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setGrading(submission)}
                  aria-label={`${submission.is_graded ? 'Edit the grade of' : 'Grade'} ${submission.student_name}`}
                >
                  {submission.is_graded ? 'Edit grade' : 'Grade'}
                </Button>
              </li>
            ))}
          </ul>
          {state.data.next || state.data.previous ? (
            <Pagination
              count={state.data.count}
              page={page}
              hasNext={Boolean(state.data.next)}
              hasPrevious={Boolean(state.data.previous)}
              disabled={loading}
              onPageChange={(next) => setPage(Math.max(1, next))}
              singular="submission"
              ariaLabel="Submissions pagination"
            />
          ) : null}
        </div>
      )}

      <GradeSubmissionModal
        submission={grading}
        maxPoints={exercise.points}
        onClose={closeGrading}
        onSave={saveGrade}
      />
    </Card>
  )
}

export default function ExerciseDetailPage() {
  const { exerciseId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { addToast } = useToast()

  const [reload, setReload] = useState(0)
  const [result, setResult] = useState({ key: null, exercise: null, error: null })
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const requestKey = `${exerciseId}:${reload}`

  useEffect(() => {
    const controller = new AbortController()
    fetchExercise(exerciseId, { signal: controller.signal })
      .then((payload) => setResult({ key: requestKey, exercise: payload, error: null }))
      .catch((requestError) => {
        if (isCanceled(requestError)) return
        setResult({
          key: requestKey,
          exercise: null,
          error: normalizeApiError(requestError, 'Unable to load this exercise.'),
        })
      })
    return () => controller.abort()
  }, [exerciseId, requestKey])

  // Keep the current content on screen while refreshing after a save.
  const stale = result.exercise && String(result.exercise.id) !== String(exerciseId)
  const exercise = stale ? null : result.exercise
  const loading = result.key !== requestKey && !exercise
  const error = result.key === requestKey ? result.error : null
  const refresh = useCallback(() => setReload((current) => current + 1), [])

  useDocumentTitle(exercise?.title || 'Exercise')

  async function confirmDelete() {
    setDeleting(true)
    try {
      await deleteExercise(exercise.id)
      setConfirmOpen(false)
      addToast({ type: 'success', message: `Exercise “${exercise.title}” has been deleted.` })
      navigate('/assessments?tab=exercises', { replace: true })
    } catch (deleteError) {
      addToast({
        type: 'error',
        message: normalizeApiError(deleteError, 'Exercise deletion failed.').message,
      })
      setDeleting(false)
    }
  }

  if (loading) return <PageLoader label="Loading exercise…" />

  if (error) {
    return (
      <div className="space-y-6">
        <BackLink to="/assessments?tab=exercises" />
        {error.status === 404 ? (
          <EmptyState
            icon={FileQuestion}
            title="Exercise not found"
            description="This exercise does not exist, has been deleted or is not published yet."
            action={<LinkButton to="/assessments?tab=exercises">View exercises</LinkButton>}
          />
        ) : (
          <div role="alert">
            <EmptyState
              icon={FileQuestion}
              title="Unable to display this exercise"
              description={error.message}
              action={
                <Button variant="secondary" onClick={refresh}>
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

  if (!exercise) return null

  const canManage = canManageAssessment(user, exercise)
  const isStudent = user?.role === 'student'
  const overdue = exercise.due_at && new Date(exercise.due_at) < new Date()

  return (
    <div className="space-y-6">
      <BackLink to="/assessments?tab=exercises" />

      <header className="surface relative overflow-hidden border-l-4 border-l-sage p-6 sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="sage">Exercise</Badge>
              <DifficultyBadge difficulty={exercise.difficulty} label={exercise.difficulty_display} />
              {!exercise.is_published ? <Badge variant="warning">Draft</Badge> : null}
              <span className="text-xs text-slate-500">Updated on {formatDate(exercise.updated_at)}</span>
            </div>
            <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              {exercise.title}
            </h1>
            <span className="academic-rule mt-4" aria-hidden="true" />
            {exercise.description ? (
              <p className="mt-4 max-w-2xl whitespace-pre-line text-sm leading-relaxed text-slate-600">
                {exercise.description}
              </p>
            ) : null}
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500">
              <Link
                to={`/courses/${exercise.course}`}
                className="inline-flex items-center gap-1.5 rounded font-medium text-ink-soft underline-offset-4 hover:text-brand-strong hover:underline"
              >
                <BookOpen className="size-4" aria-hidden="true" />
                {exercise.course_title}
              </Link>
              <span className="inline-flex items-center gap-1.5">
                <Trophy className="size-4" aria-hidden="true" />
                {exercise.points} {pluralize(exercise.points, 'point')}
              </span>
              {exercise.due_at ? (
                <span className={`inline-flex items-center gap-1.5 ${overdue ? 'text-clay' : ''}`}>
                  <CalendarClock className="size-4" aria-hidden="true" />
                  Due {formatDate(exercise.due_at)}
                  {overdue ? ' (past due)' : ''}
                </span>
              ) : null}
            </div>
          </div>

          {canManage ? (
            <div className="flex flex-wrap items-center gap-2 xl:flex-col xl:items-stretch">
              <LinkButton to={`/exercises/${exercise.id}/edit`} variant="secondary" size="sm">
                <Pencil className="size-4" aria-hidden="true" />
                Edit
              </LinkButton>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmOpen(true)}
                className="text-clay hover:bg-clay/10"
              >
                <Trash2 className="size-4" aria-hidden="true" />
                Delete
              </Button>
            </div>
          ) : null}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <Card>
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold text-ink">Instructions</h2>
              <span className="academic-rule" aria-hidden="true" />
            </div>
            <p className="whitespace-pre-line text-sm leading-relaxed text-ink-soft">
              {exercise.instructions}
            </p>
          </Card>

          {exercise.attachment_url ? (
            <Card>
              <div className="mb-4 flex items-center justify-between gap-4">
                <h2 className="text-xl font-semibold text-ink">Supporting material</h2>
                <span className="academic-rule" aria-hidden="true" />
              </div>
              <ExerciseAttachment exercise={exercise} />
            </Card>
          ) : null}

          {isStudent ? (
            <StudentSubmission
              key={`${exercise.my_submission?.id ?? 'new'}:${exercise.my_submission?.updated_at ?? ''}`}
              exercise={exercise}
              onSaved={refresh}
            />
          ) : null}
          {canManage ? <SubmissionsPanel exercise={exercise} onGraded={refresh} /> : null}
        </div>

        <Card as="aside" aria-labelledby="exercise-info-title" className="bg-gradient-to-b from-white to-mist/50 lg:self-start">
          <h2 id="exercise-info-title" className="text-xl font-semibold text-ink">
            Details
          </h2>
          <dl className="mt-4 divide-y divide-line text-sm">
            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="text-slate-500">Maximum points</dt>
              <dd className="font-medium text-ink-soft">{exercise.points}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="text-slate-500">Due date</dt>
              <dd className="font-medium text-ink-soft">
                {exercise.due_at ? formatDate(exercise.due_at) : 'None'}
              </dd>
            </div>
            {isStudent ? (
              <div className="flex items-center justify-between gap-4 py-3">
                <dt className="text-slate-500">Status</dt>
                <dd className="inline-flex items-center gap-1.5 font-medium text-ink-soft">
                  {exercise.my_submission_status === 'graded' ? (
                    <CheckCircle2 className="size-4 text-sage" aria-hidden="true" />
                  ) : null}
                  {{ none: 'Not submitted', submitted: 'Awaiting grade', graded: 'Graded' }[
                    exercise.my_submission_status
                  ]}
                </dd>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-4 py-3">
                <dt className="text-slate-500">Submissions</dt>
                <dd className="font-medium text-ink-soft">{exercise.submission_count}</dd>
              </div>
            )}
            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="text-slate-500">Date added</dt>
              <dd className="font-medium text-ink-soft">{formatDate(exercise.created_at)}</dd>
            </div>
          </dl>
        </Card>
      </div>

      <DeleteAssessmentModal
        kind="exercise"
        item={exercise}
        open={confirmOpen}
        deleting={deleting}
        onClose={() => setConfirmOpen(false)}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
