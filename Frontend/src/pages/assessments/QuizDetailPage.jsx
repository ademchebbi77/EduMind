import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  BookOpen,
  CheckCircle2,
  Circle,
  Clock3,
  FileQuestion,
  Gamepad2,
  ListChecks,
  Pencil,
  Play,
  RotateCcw,
  Target,
  Trash2,
  Trophy,
} from 'lucide-react'
import { deleteQuiz, fetchQuiz, fetchQuizAttempts } from '../../api/assessments'
import { createLiveGame } from '../../api/liveGames'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { isCanceled, normalizeApiError } from '../../lib/api'
import { formatDate, pluralize } from '../../lib/format'
import { canManageAssessment, formatDuration, formatPercentage } from '../../lib/assessments'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { Badge } from '../../components/ui/Badge'
import { Button, LinkButton } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageLoader, Skeleton } from '../../components/ui/Skeleton'
import { Pagination } from '../../components/courses/Pagination'
import { BackLink } from '../../components/assessments/BackLink'
import { DeleteAssessmentModal } from '../../components/assessments/DeleteAssessmentModal'
import { DifficultyBadge } from '../../components/assessments/DifficultyBadge'

const EMPTY_RESULTS = { count: 0, next: null, previous: null, results: [] }

function AttemptStatus({ attempt }) {
  if (attempt.status === 'in_progress') return <Badge variant="warning">In progress</Badge>
  if (attempt.status === 'expired') return <Badge variant="clay">Time expired</Badge>
  return attempt.passed ? (
    <Badge variant="success">Passed</Badge>
  ) : (
    <Badge variant="clay">Not passed</Badge>
  )
}

function AttemptsTable({ quizId, attempts, showStudent }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] text-left text-sm">
        <thead className="border-b border-line text-xs uppercase tracking-wide text-slate-500">
          <tr>
            {showStudent ? <th className="py-2 pr-4 font-semibold">Student</th> : null}
            <th className="py-2 pr-4 font-semibold">Date</th>
            <th className="py-2 pr-4 font-semibold">Score</th>
            <th className="py-2 pr-4 font-semibold">Result</th>
            <th className="py-2 font-semibold">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {attempts.map((attempt) => (
            <tr key={attempt.id}>
              {showStudent ? (
                <td className="py-3 pr-4">
                  <span className="block font-medium text-ink">{attempt.student_name}</span>
                  <span className="block text-xs text-slate-500">{attempt.student_email}</span>
                </td>
              ) : null}
              <td className="py-3 pr-4 text-slate-600">
                {formatDate(attempt.submitted_at || attempt.started_at)}
              </td>
              <td className="py-3 pr-4 font-medium text-ink-soft">
                {attempt.status === 'in_progress'
                  ? '—'
                  : `${attempt.score} / ${attempt.max_score} · ${formatPercentage(attempt.percentage)}`}
              </td>
              <td className="py-3 pr-4">
                <AttemptStatus attempt={attempt} />
              </td>
              <td className="py-3 text-right">
                {attempt.status !== 'in_progress' ? (
                  <Link
                    to={`/quizzes/${quizId}/attempts/${attempt.id}`}
                    className="rounded text-sm font-semibold text-brand-strong underline-offset-4 hover:underline"
                  >
                    View<span className="sr-only"> attempt from {formatDate(attempt.submitted_at)}</span>
                  </Link>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function QuestionPreview({ question, index }) {
  return (
    <li className="rounded-xl border border-line bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-medium text-ink">
          <span className="text-slate-500">{index + 1}.</span> {question.text}
        </p>
        <div className="flex gap-1.5">
          <Badge>{question.type_display}</Badge>
          <Badge variant="brand">
            {question.points} {pluralize(question.points, 'pt')}
          </Badge>
        </div>
      </div>
      <ul className="mt-3 space-y-1.5">
        {question.options.map((option) => (
          <li
            key={option.id}
            className={`flex items-center gap-2 text-sm ${
              option.is_correct ? 'font-medium text-sage' : 'text-slate-600'
            }`}
          >
            {option.is_correct ? (
              <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
            ) : (
              <Circle className="size-4 shrink-0 text-slate-300" aria-hidden="true" />
            )}
            {option.text}
            {option.is_correct ? <span className="sr-only">(correct answer)</span> : null}
          </li>
        ))}
      </ul>
      {question.explanation ? (
        <p className="mt-3 rounded-lg bg-mist px-3 py-2 text-xs text-slate-600">
          <strong className="font-semibold text-ink-soft">Explanation: </strong>
          {question.explanation}
        </p>
      ) : null}
    </li>
  )
}

export default function QuizDetailPage() {
  const { quizId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { addToast } = useToast()

  const [reload, setReload] = useState(0)
  const [result, setResult] = useState({ key: null, quiz: null, error: null })
  const [attemptsPage, setAttemptsPage] = useState(1)
  const [attempts, setAttempts] = useState({ key: null, data: EMPTY_RESULTS, error: null })
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [hosting, setHosting] = useState(false)

  const requestKey = `${quizId}:${reload}`
  const attemptsKey = `${requestKey}:${attemptsPage}`

  useEffect(() => {
    const controller = new AbortController()
    fetchQuiz(quizId, { signal: controller.signal })
      .then((payload) => setResult({ key: requestKey, quiz: payload, error: null }))
      .catch((requestError) => {
        if (isCanceled(requestError)) return
        setResult({
          key: requestKey,
          quiz: null,
          error: normalizeApiError(requestError, 'Unable to load this quiz.'),
        })
      })
    return () => controller.abort()
  }, [quizId, requestKey])

  useEffect(() => {
    const controller = new AbortController()
    fetchQuizAttempts(quizId, { page: attemptsPage }, { signal: controller.signal })
      .then((payload) => setAttempts({ key: attemptsKey, data: payload, error: null }))
      .catch((requestError) => {
        if (isCanceled(requestError)) return
        setAttempts({
          key: attemptsKey,
          data: EMPTY_RESULTS,
          error: normalizeApiError(requestError, 'Unable to load the attempts.'),
        })
      })
    return () => controller.abort()
  }, [quizId, attemptsPage, attemptsKey])

  const loading = result.key !== requestKey
  const quiz = loading ? null : result.quiz
  const error = loading ? null : result.error
  const attemptsLoading = attempts.key !== attemptsKey

  useDocumentTitle(quiz?.title || 'Quiz')

  async function confirmDelete() {
    setDeleting(true)
    try {
      await deleteQuiz(quiz.id)
      setConfirmOpen(false)
      addToast({ type: 'success', message: `Quiz “${quiz.title}” has been deleted.` })
      navigate('/assessments', { replace: true })
    } catch (deleteError) {
      addToast({
        type: 'error',
        message: normalizeApiError(deleteError, 'Quiz deletion failed.').message,
      })
      setDeleting(false)
    }
  }

  if (loading) return <PageLoader label="Loading quiz…" />

  if (error) {
    return (
      <div className="space-y-6">
        <BackLink />
        {error.status === 404 ? (
          <EmptyState
            icon={FileQuestion}
            title="Quiz not found"
            description="This quiz does not exist, has been deleted or is not published yet."
            action={<LinkButton to="/assessments">View quizzes</LinkButton>}
          />
        ) : (
          <div role="alert">
            <EmptyState
              icon={FileQuestion}
              title="Unable to display this quiz"
              description={error.message}
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

  if (!quiz) return null

  const canManage = canManageAssessment(user, quiz)

  async function hostLiveGame() {
    setHosting(true)
    try {
      const game = await createLiveGame(quiz.id)
      navigate(`/live/${game.id}`)
    } catch (hostError) {
      addToast({ type: 'error', message: normalizeApiError(hostError, 'The live game could not start.').message })
      setHosting(false)
    }
  }
  const isStudent = user?.role === 'student'
  const attemptList = attempts.data.results
  const running = attemptList.find((attempt) => attempt.status === 'in_progress')
  const used = quiz.my_attempt_count || 0
  const remaining = quiz.max_attempts ? Math.max(0, quiz.max_attempts - used) : null
  const canStart = isStudent && quiz.is_published && (running || remaining === null || remaining > 0)

  return (
    <div className="space-y-6">
      <BackLink />

      <header className="surface relative overflow-hidden border-l-4 border-l-brand p-6 sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="brand">Quiz</Badge>
              <DifficultyBadge difficulty={quiz.difficulty} label={quiz.difficulty_display} />
              {!quiz.is_published ? <Badge variant="warning">Draft</Badge> : null}
              <span className="text-xs text-slate-500">Updated on {formatDate(quiz.updated_at)}</span>
            </div>
            <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              {quiz.title}
            </h1>
            <span className="academic-rule mt-4" aria-hidden="true" />
            <p className="mt-4 max-w-2xl whitespace-pre-line text-sm leading-relaxed text-slate-600">
              {quiz.description || 'No description provided for this quiz.'}
            </p>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500">
              <Link
                to={`/courses/${quiz.course}`}
                className="inline-flex items-center gap-1.5 rounded font-medium text-ink-soft underline-offset-4 hover:text-brand-strong hover:underline"
              >
                <BookOpen className="size-4" aria-hidden="true" />
                {quiz.course_title}
              </Link>
              <span className="inline-flex items-center gap-1.5">
                <ListChecks className="size-4" aria-hidden="true" />
                {quiz.question_count} {pluralize(quiz.question_count, 'question')}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock3 className="size-4" aria-hidden="true" />
                {formatDuration(quiz.duration_minutes)}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 xl:flex-col xl:items-stretch">
            {canStart ? (
              <LinkButton to={`/quizzes/${quiz.id}/take`} variant="accent">
                <Play className="size-4" aria-hidden="true" />
                {running ? 'Resume quiz' : used > 0 ? 'Try again' : 'Start quiz'}
              </LinkButton>
            ) : null}
            {canManage ? (
              <>
                <Button variant="accent" size="sm" onClick={hostLiveGame} loading={hosting}>
                  <Gamepad2 className="size-4" aria-hidden="true" />
                  Host live game
                </Button>
                <LinkButton to={`/quizzes/${quiz.id}/edit`} variant="secondary" size="sm">
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
              </>
            ) : null}
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          {canManage ? (
            <Card>
              <div className="mb-5 flex items-center justify-between gap-4">
                <h2 className="text-xl font-semibold text-ink">Questions &amp; answer key</h2>
                <span className="academic-rule" aria-hidden="true" />
              </div>
              <ol className="space-y-3">
                {quiz.questions.map((question, index) => (
                  <QuestionPreview key={question.id} question={question} index={index} />
                ))}
              </ol>
            </Card>
          ) : (
            <Card>
              <h2 className="text-xl font-semibold text-ink">Before you start</h2>
              <ul className="mt-4 space-y-3 text-sm text-slate-600">
                <li className="flex gap-2.5">
                  <ListChecks className="mt-0.5 size-4 shrink-0 text-brand-strong" aria-hidden="true" />
                  <span>
                    {quiz.question_count} {pluralize(quiz.question_count, 'question')} worth{' '}
                    {quiz.total_points} {pluralize(quiz.total_points, 'point')}. For multiple-choice
                    questions, select every correct option to earn the points.
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <Clock3 className="mt-0.5 size-4 shrink-0 text-brand-strong" aria-hidden="true" />
                  <span>
                    {quiz.duration_minutes
                      ? `You have ${formatDuration(quiz.duration_minutes)} once you start. Your answers are submitted automatically when time runs out.`
                      : 'There is no time limit for this quiz.'}
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <Target className="mt-0.5 size-4 shrink-0 text-brand-strong" aria-hidden="true" />
                  <span>You need {quiz.passing_score} % to pass.</span>
                </li>
              </ul>
              {isStudent && remaining === 0 && !running ? (
                <p className="mt-5 rounded-xl border border-clay/25 bg-clay/[0.06] px-4 py-3 text-sm font-medium text-clay">
                  You have used all the attempts allowed for this quiz.
                </p>
              ) : null}
            </Card>
          )}

          {canManage || isStudent ? (
            <Card>
              <div className="mb-5 flex items-center justify-between gap-4">
                <h2 className="text-xl font-semibold text-ink">
                  {canManage ? 'Student results' : 'My attempts'}
                </h2>
                <span className="academic-rule" aria-hidden="true" />
              </div>
              {attemptsLoading && attemptList.length === 0 ? (
                <div className="space-y-2" aria-hidden="true">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : attempts.error ? (
                <p role="alert" className="text-sm text-clay">
                  {attempts.error.message}
                </p>
              ) : attemptList.length === 0 ? (
                <p className="text-sm text-slate-600">
                  {canManage ? 'No student has taken this quiz yet.' : 'You have not taken this quiz yet.'}
                </p>
              ) : (
                <div className="space-y-4">
                  <AttemptsTable quizId={quiz.id} attempts={attemptList} showStudent={canManage} />
                  {attempts.data.next || attempts.data.previous ? (
                    <Pagination
                      count={attempts.data.count}
                      page={attemptsPage}
                      hasNext={Boolean(attempts.data.next)}
                      hasPrevious={Boolean(attempts.data.previous)}
                      disabled={attemptsLoading}
                      onPageChange={(next) => setAttemptsPage(Math.max(1, next))}
                      singular="attempt"
                      ariaLabel="Attempts pagination"
                    />
                  ) : null}
                </div>
              )}
            </Card>
          ) : null}
        </div>

        <Card as="aside" aria-labelledby="quiz-info-title" className="bg-gradient-to-b from-white to-mist/50 lg:self-start">
          <h2 id="quiz-info-title" className="text-xl font-semibold text-ink">
            Details
          </h2>
          <dl className="mt-4 divide-y divide-line text-sm">
            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="text-slate-500">Total points</dt>
              <dd className="font-medium text-ink-soft">{quiz.total_points}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="text-slate-500">Passing score</dt>
              <dd className="font-medium text-ink-soft">{quiz.passing_score} %</dd>
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="text-slate-500">Duration</dt>
              <dd className="font-medium text-ink-soft">{formatDuration(quiz.duration_minutes)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="text-slate-500">Attempts</dt>
              <dd className="font-medium text-ink-soft">
                {isStudent
                  ? quiz.max_attempts
                    ? `${used} / ${quiz.max_attempts} used`
                    : `${used} · unlimited`
                  : quiz.max_attempts || 'Unlimited'}
              </dd>
            </div>
            {isStudent && quiz.my_best_percentage !== null && quiz.my_best_percentage !== undefined ? (
              <div className="flex items-center justify-between gap-4 py-3">
                <dt className="text-slate-500">Best score</dt>
                <dd className="inline-flex items-center gap-1.5 font-medium text-ink-soft">
                  <Trophy className="size-4 text-brand" aria-hidden="true" />
                  {formatPercentage(quiz.my_best_percentage)}
                </dd>
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="text-slate-500">Correction</dt>
              <dd className="text-right font-medium text-ink-soft">
                {quiz.reveal_answers ? 'Answers revealed' : 'Score only'}
              </dd>
            </div>
          </dl>
        </Card>
      </div>

      <DeleteAssessmentModal
        kind="quiz"
        item={quiz}
        open={confirmOpen}
        deleting={deleting}
        onClose={() => setConfirmOpen(false)}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
