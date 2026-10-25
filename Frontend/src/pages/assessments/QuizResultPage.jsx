import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle2, Circle, FileQuestion, RotateCcw, XCircle } from 'lucide-react'
import { fetchQuiz, fetchQuizAttempt } from '../../api/assessments'
import { useAuth } from '../../context/AuthContext'
import { isCanceled, normalizeApiError } from '../../lib/api'
import { cx } from '../../lib/cx'
import { formatDate, pluralize } from '../../lib/format'
import { formatPercentage } from '../../lib/assessments'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { Badge } from '../../components/ui/Badge'
import { Button, LinkButton } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageLoader } from '../../components/ui/Skeleton'
import { BackLink } from '../../components/assessments/BackLink'

function optionState(option, selected, revealed) {
  const isSelected = selected.includes(option.id)
  if (revealed && option.is_correct) return isSelected ? 'correct-selected' : 'correct-missed'
  if (isSelected) return revealed ? 'wrong-selected' : 'selected'
  return 'idle'
}

const OPTION_STYLES = {
  'correct-selected': 'border-sage/40 bg-sage/[0.08] text-sage font-medium',
  'correct-missed': 'border-sage/40 border-dashed bg-white text-sage',
  'wrong-selected': 'border-clay/40 bg-clay/[0.06] text-clay font-medium',
  selected: 'border-brand/40 bg-brand/[0.06] text-ink font-medium',
  idle: 'border-line bg-white text-slate-600',
}

const OPTION_LABELS = {
  'correct-selected': 'Your answer · correct',
  'correct-missed': 'Correct answer',
  'wrong-selected': 'Your answer · incorrect',
  selected: 'Your answer',
  idle: '',
}

function AnswerReview({ answer, index, revealed }) {
  const StatusIcon = answer.is_correct ? CheckCircle2 : XCircle
  return (
    <li
      className={cx(
        'rounded-xl border border-l-4 bg-white p-4',
        answer.is_correct ? 'border-line border-l-sage' : 'border-line border-l-clay',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-medium text-ink">
          <span className="text-slate-500">{index + 1}.</span> {answer.text}
        </p>
        <span
          className={cx(
            'inline-flex items-center gap-1.5 text-sm font-semibold',
            answer.is_correct ? 'text-sage' : 'text-clay',
          )}
        >
          <StatusIcon className="size-4" aria-hidden="true" />
          {answer.points_awarded} / {answer.points} {pluralize(answer.points, 'pt')}
        </span>
      </div>
      {answer.selected_options.length === 0 ? (
        <p className="mt-2 text-xs font-medium text-clay">No answer given.</p>
      ) : null}
      <ul className="mt-3 space-y-1.5">
        {answer.options.map((option) => {
          const state = optionState(option, answer.selected_options, revealed)
          return (
            <li
              key={option.id}
              className={cx(
                'flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm',
                OPTION_STYLES[state],
              )}
            >
              <span className="inline-flex items-center gap-2">
                {state === 'idle' ? (
                  <Circle className="size-4 shrink-0 text-slate-300" aria-hidden="true" />
                ) : state === 'wrong-selected' ? (
                  <XCircle className="size-4 shrink-0" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
                )}
                {option.text}
              </span>
              {OPTION_LABELS[state] ? (
                <span className="text-xs font-semibold">{OPTION_LABELS[state]}</span>
              ) : null}
            </li>
          )
        })}
      </ul>
      {revealed && answer.explanation ? (
        <p className="mt-3 rounded-lg bg-mist px-3 py-2 text-xs text-slate-600">
          <strong className="font-semibold text-ink-soft">Explanation: </strong>
          {answer.explanation}
        </p>
      ) : null}
    </li>
  )
}

export default function QuizResultPage() {
  const { quizId, attemptId } = useParams()
  const { user } = useAuth()
  const [reload, setReload] = useState(0)
  const [result, setResult] = useState({ key: null, attempt: null, quiz: null, error: null })
  const requestKey = `${quizId}:${attemptId}:${reload}`

  useDocumentTitle('Quiz result')

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      fetchQuizAttempt(quizId, attemptId, { signal: controller.signal }),
      fetchQuiz(quizId, { signal: controller.signal }),
    ])
      .then(([attempt, quiz]) => setResult({ key: requestKey, attempt, quiz, error: null }))
      .catch((requestError) => {
        if (isCanceled(requestError)) return
        setResult({
          key: requestKey,
          attempt: null,
          quiz: null,
          error: normalizeApiError(requestError, 'Unable to load this result.'),
        })
      })
    return () => controller.abort()
  }, [quizId, attemptId, requestKey])

  if (result.key !== requestKey) return <PageLoader label="Loading your result…" />

  const { attempt, quiz, error } = result
  if (error) {
    return (
      <div className="space-y-6">
        <BackLink to={`/quizzes/${quizId}`} label="Back to quiz" />
        {error.status === 404 ? (
          <EmptyState
            icon={FileQuestion}
            title="Result not found"
            description="This attempt does not exist or does not belong to you."
            action={<LinkButton to={`/quizzes/${quizId}`}>Back to quiz</LinkButton>}
          />
        ) : (
          <div role="alert">
            <EmptyState
              icon={FileQuestion}
              title="Unable to display this result"
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

  const isOwnAttempt = user?.id === attempt.student
  const expired = attempt.status === 'expired'
  const attemptsLeft =
    quiz.max_attempts === null ? Infinity : quiz.max_attempts - (quiz.my_attempt_count || 0)
  const canRetry = user?.role === 'student' && isOwnAttempt && attemptsLeft > 0

  return (
    <div className="space-y-6">
      <BackLink to={`/quizzes/${quizId}`} label="Back to quiz" />

      <header
        className={cx(
          'surface relative overflow-hidden border-l-4 p-6 sm:p-8',
          attempt.passed ? 'border-l-sage' : 'border-l-clay',
        )}
      >
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-strong">
              <span className="h-px w-7 bg-brand" aria-hidden="true" />
              {isOwnAttempt ? 'Your result' : `Result of ${attempt.student_name}`}
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              {attempt.quiz_title}
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Submitted on {formatDate(attempt.submitted_at)} · pass mark {attempt.passing_score} %
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {expired ? (
                <Badge variant="clay">Time expired</Badge>
              ) : attempt.passed ? (
                <Badge variant="success">Passed</Badge>
              ) : (
                <Badge variant="clay">Not passed</Badge>
              )}
            </div>
          </div>
          <div className="text-left sm:text-right">
            <p
              className={cx(
                'font-display text-5xl font-semibold tabular-nums',
                attempt.passed ? 'text-sage' : 'text-clay',
              )}
            >
              {formatPercentage(attempt.percentage)}
            </p>
            <p className="mt-1 text-sm font-medium text-ink-soft">
              {attempt.score} / {attempt.max_score} {pluralize(attempt.max_score, 'point')}
            </p>
          </div>
        </div>
      </header>

      {expired ? (
        <div
          role="alert"
          className="rounded-xl border border-clay/25 bg-clay/[0.06] px-4 py-3 text-sm font-medium text-clay"
        >
          The time limit was exceeded before the answers were received, so this attempt was closed
          without a score.
        </div>
      ) : null}

      <Card>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-xl font-semibold text-ink">Correction</h2>
          {!attempt.answers_revealed ? (
            <p className="text-xs text-slate-500">
              Your teacher chose not to reveal the correct answers for this quiz.
            </p>
          ) : (
            <span className="academic-rule" aria-hidden="true" />
          )}
        </div>
        <ol className="space-y-3">
          {attempt.answers.map((answer, index) => (
            <AnswerReview
              key={answer.question}
              answer={answer}
              index={index}
              revealed={attempt.answers_revealed}
            />
          ))}
        </ol>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <LinkButton to="/assessments" variant="secondary">
          All quizzes
        </LinkButton>
        {canRetry ? (
          <LinkButton to={`/quizzes/${quizId}/take`} variant="accent">
            <RotateCcw className="size-4" aria-hidden="true" />
            Try again
          </LinkButton>
        ) : null}
      </div>
    </div>
  )
}
