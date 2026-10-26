import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowRight,
  CheckCircle2,
  FileQuestion,
  Lock,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { createQuiz, fetchQuiz, updateQuiz } from '../../api/assessments'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { firstFieldError, isCanceled, normalizeApiError } from '../../lib/api'
import { canManageCourses } from '../../lib/roles'
import { pluralize } from '../../lib/format'
import {
  DIFFICULTIES,
  apiQuizErrors,
  buildQuizPayload,
  canManageAssessment,
  emptyQuestion,
  manageableCourses,
  questionsToDrafts,
  validateQuizDraft,
} from '../../lib/assessments'
import { useCourseOptions } from '../../hooks/useCourseOptions'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { Button, LinkButton } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Input, Select, Textarea } from '../../components/ui/Field'
import { PageLoader } from '../../components/ui/Skeleton'
import { AccessDenied } from '../../components/courses/AccessDenied'
import { BackLink } from '../../components/assessments/BackLink'
import { ToggleField } from '../../components/assessments/ToggleField'
import { QuestionEditor } from '../../components/assessments/QuestionEditor'

const INITIAL_VALUES = {
  title: '',
  description: '',
  course: '',
  difficulty: 'beginner',
  duration_minutes: '',
  passing_score: '50',
  max_attempts: '',
  reveal_answers: true,
  is_published: false,
}

function valuesFromQuiz(quiz) {
  return {
    title: quiz.title,
    description: quiz.description || '',
    course: String(quiz.course),
    difficulty: quiz.difficulty,
    duration_minutes: quiz.duration_minutes ? String(quiz.duration_minutes) : '',
    passing_score: String(quiz.passing_score),
    max_attempts: quiz.max_attempts ? String(quiz.max_attempts) : '',
    reveal_answers: quiz.reveal_answers,
    is_published: quiz.is_published,
  }
}

export default function QuizFormPage() {
  const { quizId } = useParams()
  const isEdit = Boolean(quizId)
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  // Draft handed over by the quiz generator page (never applied when editing).
  const [generation] = useState(() => (isEdit ? null : location.state?.generation || null))
  const { addToast } = useToast()
  const { courses, loading: coursesLoading, error: coursesError, retry: retryCourses } =
    useCourseOptions()

  useDocumentTitle(isEdit ? 'Edit a quiz' : 'Create a quiz')

  const [reload, setReload] = useState(0)
  const [fetchResult, setFetchResult] = useState({ key: null, quiz: null, error: null })
  const [values, setValues] = useState(() => ({
    ...INITIAL_VALUES,
    ...generation?.values,
    course: generation?.values.course || searchParams.get('course') || '',
  }))
  const [questions, setQuestions] = useState(() => {
    if (isEdit) return []
    return generation?.questions.length ? generation.questions : [emptyQuestion()]
  })
  const [errors, setErrors] = useState({})
  const [questionErrors, setQuestionErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  // Bumped after a failed save so the first error is brought into view, even
  // when the teacher clicked "Create quiz" at the bottom of a long form.
  const [errorFocus, setErrorFocus] = useState(0)
  const pageRef = useRef(null)

  useEffect(() => {
    if (!errorFocus) return
    const page = pageRef.current
    const target =
      page?.querySelector('[aria-invalid="true"]') || page?.querySelector('[role="alert"]')
    if (!target) return
    target.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
    target.focus?.({ preventScroll: true })
  }, [errorFocus])

  const requestKey = `${quizId ?? 'new'}:${reload}`

  useEffect(() => {
    if (!isEdit) return undefined
    const controller = new AbortController()

    fetchQuiz(quizId, { signal: controller.signal })
      .then((payload) => {
        setFetchResult({ key: requestKey, quiz: payload, error: null })
        setValues(valuesFromQuiz(payload))
        setQuestions(questionsToDrafts(payload.questions))
      })
      .catch((requestError) => {
        if (isCanceled(requestError)) return
        setFetchResult({
          key: requestKey,
          quiz: null,
          error: normalizeApiError(requestError, 'Unable to load this quiz.'),
        })
      })

    return () => controller.abort()
  }, [isEdit, quizId, requestKey])

  const loadingQuiz = isEdit && fetchResult.key !== requestKey
  const quiz = loadingQuiz ? null : fetchResult.quiz
  const loadError = loadingQuiz ? null : fetchResult.error

  function updateField(name, value) {
    setValues((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({ ...current, [name]: undefined }))
  }

  function updateQuestion(next) {
    setQuestions((current) => current.map((item) => (item.key === next.key ? next : item)))
    setQuestionErrors((current) => ({ ...current, [next.key]: undefined }))
  }

  function addQuestion() {
    setQuestions((current) => [...current, emptyQuestion()])
    setErrors((current) => ({ ...current, questions: undefined }))
  }

  function removeQuestion(key) {
    setQuestions((current) => current.filter((item) => item.key !== key))
  }

  function moveQuestion(index, direction) {
    setQuestions((current) => {
      const target = index + direction
      if (target < 0 || target >= current.length) return current
      const next = [...current]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError('')

    const validation = validateQuizDraft(values, questions)
    setErrors(validation.errors)
    setQuestionErrors(validation.questionErrors)
    if (Object.keys(validation.errors).length || Object.keys(validation.questionErrors).length) {
      setFormError('Some fields need your attention before the quiz can be saved.')
      setErrorFocus((count) => count + 1)
      return
    }

    setSaving(true)
    try {
      const payload = buildQuizPayload(values, questions)
      if (generation) payload.generation_job = generation.jobId
      const saved = isEdit ? await updateQuiz(quizId, payload) : await createQuiz(payload)
      addToast({
        type: 'success',
        message: isEdit ? `Quiz “${saved.title}” has been updated.` : `Quiz “${saved.title}” has been created.`,
      })
      navigate(`/quizzes/${saved.id}`, { replace: isEdit })
    } catch (submitError) {
      const error = normalizeApiError(submitError, 'Saving the quiz failed.')
      const mapped = apiQuizErrors(error.fields, questions)
      setErrors(mapped.errors)
      setQuestionErrors(mapped.questionErrors)
      setFormError(
        Object.keys(mapped.errors).length
          ? 'Some fields need your attention before the quiz can be saved.'
          : firstFieldError(error.fields, 'generation_job') || error.message,
      )
      setErrorFocus((count) => count + 1)
    } finally {
      setSaving(false)
    }
  }

  if (loadingQuiz || coursesLoading) {
    return <PageLoader label={isEdit ? 'Loading quiz…' : 'Preparing the form…'} />
  }

  if (loadError) {
    return (
      <div className="space-y-6">
        <BackLink to="/assessments" label="Back to quizzes" />
        {loadError.status === 404 ? (
          <EmptyState
            icon={FileQuestion}
            title="Quiz not found"
            description="This quiz does not exist or has been deleted."
            action={<LinkButton to="/assessments">View quizzes</LinkButton>}
          />
        ) : (
          <div role="alert">
            <EmptyState
              icon={FileQuestion}
              title="Unable to load the quiz"
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

  if (!canManageCourses(user?.role) || (isEdit && !canManageAssessment(user, quiz))) {
    return <AccessDenied />
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
  // Keep the current course selectable even if the list changed meanwhile.
  if (quiz && !courseChoices.some((item) => item.id === quiz.course)) {
    courseChoices.push({ id: quiz.course, title: quiz.course_title })
  }

  if (!isEdit && courseChoices.length === 0) {
    return (
      <EmptyState
        icon={FileQuestion}
        title="Publish a course first"
        description="Quizzes belong to a course. Publish a course before creating its quizzes."
        action={<LinkButton to="/courses/new">Publish a course</LinkButton>}
      />
    )
  }

  const cancelTarget = isEdit ? `/quizzes/${quizId}` : '/assessments'
  const totalPoints = questions.reduce((sum, item) => sum + (Number(item.points) || 0), 0)

  return (
    <div ref={pageRef} className="space-y-6">
      <BackLink to={cancelTarget} label={isEdit ? 'Back to quiz' : 'Back to quizzes'} />

      <header className="border-b border-line pb-6">
        <p className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-strong">
          <span className="h-px w-7 bg-brand" aria-hidden="true" />
          {isEdit ? 'Update' : 'New quiz'}
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          {isEdit ? 'Edit quiz' : 'Create a quiz'}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          {isEdit
            ? 'Update the quiz settings and questions. Scores already recorded are kept as they were.'
            : 'Attach an auto-graded quiz to one of your courses. Single-choice, multiple-choice and true/false questions are corrected automatically.'}
        </p>
        {!isEdit && !generation ? (
          <Link
            to="/quizzes/generate"
            className="mt-3 inline-flex items-center gap-1.5 rounded text-sm font-semibold text-brand-strong underline-offset-4 hover:underline"
          >
            <Sparkles className="size-4" aria-hidden="true" />
            Or generate questions from a course document
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        ) : null}
      </header>

      {generation ? (
        <div className="flex items-start gap-3 rounded-xl border border-brand/25 bg-brand/[0.05] px-4 py-3 text-sm text-ink-soft">
          <Sparkles className="mt-0.5 size-5 shrink-0 text-brand-strong" aria-hidden="true" />
          <div>
            <p className="font-semibold text-ink">
              {generation.questions.length} {pluralize(generation.questions.length, 'question')}{' '}
              generated locally from “{generation.sourceName}”.
            </p>
            <p className="mt-0.5">
              Review, edit or remove them. Nothing is saved until you click Create quiz.
            </p>
            {!values.course ? (
              <p className="mt-1.5 font-semibold text-brand-strong">
                Choose the course this quiz belongs to in “Quiz details” below.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

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
              <h2 className="text-xl font-semibold text-ink">Quiz details</h2>

              <Input
                label="Quiz title"
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
                hint="Optional. Shown to students before they start."
                disabled={saving}
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
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <Input
                  label="Duration (minutes)"
                  name="duration_minutes"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={300}
                  value={values.duration_minutes}
                  onChange={(event) => updateField('duration_minutes', event.target.value)}
                  error={errors.duration_minutes}
                  hint="Empty for no time limit."
                  disabled={saving}
                />
                <Input
                  label="Passing score (%)"
                  name="passing_score"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={100}
                  value={values.passing_score}
                  onChange={(event) => updateField('passing_score', event.target.value)}
                  error={errors.passing_score}
                  disabled={saving}
                  required
                />
                <Input
                  label="Max attempts"
                  name="max_attempts"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={100}
                  value={values.max_attempts}
                  onChange={(event) => updateField('max_attempts', event.target.value)}
                  error={errors.max_attempts}
                  hint="Empty for unlimited."
                  disabled={saving}
                />
              </div>
            </Card>

            <section aria-labelledby="questions-title" className="space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 id="questions-title" className="text-xl font-semibold text-ink">
                    Questions
                    <span className="ml-1 text-clay" aria-hidden="true">
                      *
                    </span>
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {questions.length} {pluralize(questions.length, 'question')} · {totalPoints}{' '}
                    {pluralize(totalPoints, 'point')} in total
                  </p>
                </div>
              </div>

              {errors.questions ? (
                <p role="alert" className="text-sm font-medium text-clay">
                  {errors.questions}
                </p>
              ) : null}

              {questions.map((question, index) => (
                <QuestionEditor
                  key={question.key}
                  question={question}
                  index={index}
                  total={questions.length}
                  errors={questionErrors[question.key]}
                  disabled={saving}
                  onChange={updateQuestion}
                  onRemove={() => removeQuestion(question.key)}
                  onMove={(direction) => moveQuestion(index, direction)}
                />
              ))}

              <button
                type="button"
                onClick={addQuestion}
                disabled={saving}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-5 text-sm font-semibold text-brand-strong transition hover:border-brand/50 hover:bg-brand/[0.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60"
              >
                <Plus className="size-4" aria-hidden="true" />
                Add a question
              </button>
            </section>
          </div>

          <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
            <Card className="space-y-3">
              <h2 className="text-xl font-semibold text-ink">Visibility</h2>
              <ToggleField
                label="Published"
                description="Students can only see and take published quizzes."
                checked={values.is_published}
                onChange={(checked) => updateField('is_published', checked)}
                disabled={saving}
              />
              <ToggleField
                label="Reveal answers after submission"
                description="Show the correct options and explanations in the correction."
                checked={values.reveal_answers}
                onChange={(checked) => updateField('reveal_answers', checked)}
                disabled={saving}
              />
            </Card>

            <Card>
              <h2 className="text-xl font-semibold text-ink">Good to know</h2>
              <ul className="mt-4 space-y-3 text-sm text-slate-600">
                <li className="flex gap-2.5">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-sage" aria-hidden="true" />
                  <span>A question earns its points only when every correct option is selected.</span>
                </li>
                <li className="flex gap-2.5">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-strong" aria-hidden="true" />
                  <span>Scores are calculated on the server. Correct answers are never sent before submission.</span>
                </li>
                <li className="flex gap-2.5">
                  <Lock className="mt-0.5 size-4 shrink-0 text-clay" aria-hidden="true" />
                  <span>You can only add quizzes to courses you own, unless you are an administrator.</span>
                </li>
              </ul>
            </Card>

            <Card className="bg-gradient-to-b from-white to-brand/[0.04]">
              <h2 className="text-xl font-semibold text-ink">Save</h2>
              <div className="mt-5 space-y-3">
                <Button type="submit" loading={saving} className="w-full">
                  {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create quiz'}
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
