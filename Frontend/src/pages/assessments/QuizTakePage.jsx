import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, ArrowRight, Clock3, Send } from 'lucide-react'
import { startQuizAttempt, submitQuizAttempt } from '../../api/assessments'
import { useToast } from '../../context/ToastContext'
import { normalizeApiError } from '../../lib/api'
import { cx } from '../../lib/cx'
import { pluralize } from '../../lib/format'
import { formatCountdown } from '../../lib/assessments'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { Badge } from '../../components/ui/Badge'
import { Button, LinkButton } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Modal } from '../../components/ui/Modal'
import { PageLoader } from '../../components/ui/Skeleton'
import { BackLink } from '../../components/assessments/BackLink'

const STORAGE_PREFIX = 'edumind:quiz-attempt:'

function loadSavedAnswers(attemptId) {
  try {
    const raw = window.sessionStorage.getItem(`${STORAGE_PREFIX}${attemptId}`)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveAnswers(attemptId, answers) {
  try {
    window.sessionStorage.setItem(`${STORAGE_PREFIX}${attemptId}`, JSON.stringify(answers))
  } catch {
    // Storage may be unavailable (private mode); answers stay in memory.
  }
}

function clearSavedAnswers(attemptId) {
  try {
    window.sessionStorage.removeItem(`${STORAGE_PREFIX}${attemptId}`)
  } catch {
    // Nothing to clean up.
  }
}

/** Seconds left before ``expiresAt`` (server clock); calls ``onExpire`` once at zero. */
function useCountdown(expiresAt, clockOffset, onExpire) {
  const [remaining, setRemaining] = useState(null)
  const onExpireRef = useRef(onExpire)

  useEffect(() => {
    onExpireRef.current = onExpire
  }, [onExpire])

  useEffect(() => {
    if (!expiresAt) return undefined
    const deadline = new Date(expiresAt).getTime()
    let expired = false
    const tick = () => {
      const seconds = (deadline - (Date.now() + clockOffset)) / 1000
      setRemaining(seconds)
      if (seconds <= 0 && !expired) {
        expired = true
        onExpireRef.current?.()
      }
    }
    const first = window.setTimeout(tick, 0)
    const timer = window.setInterval(tick, 1000)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(timer)
    }
  }, [expiresAt, clockOffset])

  return expiresAt ? remaining : null
}

export default function QuizTakePage() {
  const { quizId } = useParams()
  const navigate = useNavigate()
  const { addToast } = useToast()

  const [session, setSession] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [answers, setAnswers] = useState({})
  const [current, setCurrent] = useState(0)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const submittedRef = useRef(false)

  useDocumentTitle(session?.quiz.title || 'Quiz')

  useEffect(() => {
    let active = true
    // Starting is idempotent on the server: a running attempt is resumed.
    startQuizAttempt(quizId)
      .then((payload) => {
        if (!active) return
        const clockOffset = new Date(payload.server_time).getTime() - Date.now()
        setSession({ ...payload, clockOffset })
        setAnswers(loadSavedAnswers(payload.attempt.id))
      })
      .catch((error) => {
        if (active) setLoadError(normalizeApiError(error, 'Unable to start this quiz.'))
      })
    return () => {
      active = false
    }
  }, [quizId])

  const attemptId = session?.attempt.id
  const submit = useCallback(
    async ({ automatic = false } = {}) => {
      if (!session || submittedRef.current) return
      submittedRef.current = true
      setSubmitting(true)
      setSubmitError('')
      try {
        const payload = session.quiz.questions.map((question) => ({
          question: question.id,
          selected_options: answers[question.id] || [],
        }))
        const result = await submitQuizAttempt(session.quiz.id, payload)
        clearSavedAnswers(session.attempt.id)
        addToast({
          type: result.status === 'expired' ? 'error' : 'success',
          message:
            result.status === 'expired'
              ? 'Time was up before your answers reached the server.'
              : automatic
                ? 'Time is up. Your answers have been submitted.'
                : 'Your answers have been submitted.',
        })
        navigate(`/quizzes/${session.quiz.id}/attempts/${result.id}`, { replace: true })
      } catch (error) {
        submittedRef.current = false
        setSubmitting(false)
        setConfirmOpen(false)
        setSubmitError(normalizeApiError(error, 'Submitting your answers failed.').message)
      }
    },
    [session, answers, addToast, navigate],
  )

  const autoSubmit = useCallback(() => submit({ automatic: true }), [submit])
  const remaining = useCountdown(session?.attempt.expires_at, session?.clockOffset || 0, autoSubmit)

  // Stable identity: the countdown re-renders every second and the modal
  // would otherwise reset its focus on each tick.
  const closeConfirm = useCallback(() => {
    if (!submittedRef.current) setConfirmOpen(false)
  }, [])

  function toggleOption(question, optionId) {
    setAnswers((previous) => {
      const selected = previous[question.id] || []
      let nextSelected
      if (question.type === 'multiple_choice') {
        nextSelected = selected.includes(optionId)
          ? selected.filter((id) => id !== optionId)
          : [...selected, optionId]
      } else {
        nextSelected = [optionId]
      }
      const next = { ...previous, [question.id]: nextSelected }
      saveAnswers(attemptId, next)
      return next
    })
  }

  if (loadError) {
    return (
      <div className="space-y-6">
        <BackLink to={`/quizzes/${quizId}`} label="Back to quiz" />
        <div role="alert">
          <EmptyState
            icon={AlertTriangle}
            title="This quiz cannot be started"
            description={loadError.message}
            action={<LinkButton to={`/quizzes/${quizId}`}>Back to quiz</LinkButton>}
          />
        </div>
      </div>
    )
  }

  if (!session) return <PageLoader label="Preparing your quiz…" />

  const { quiz } = session
  const questions = quiz.questions
  const question = questions[current]
  const selected = answers[question.id] || []
  const answeredCount = questions.filter((item) => (answers[item.id] || []).length > 0).length
  const unanswered = questions.length - answeredCount
  const isLast = current === questions.length - 1
  const lowTime = remaining !== null && remaining <= 60

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-strong">
            <span className="h-px w-7 bg-brand" aria-hidden="true" />
            {quiz.course_title}
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            {quiz.title}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {answeredCount} of {questions.length} answered · pass mark {quiz.passing_score} %
          </p>
        </div>

        {remaining !== null ? (
          <div
            role="timer"
            aria-live={lowTime ? 'assertive' : 'off'}
            aria-label={`Time remaining ${formatCountdown(remaining)}`}
            className={cx(
              'inline-flex items-center gap-2 self-start rounded-xl border px-4 py-2.5 font-display text-2xl font-semibold tabular-nums sm:self-auto',
              lowTime ? 'border-clay/40 bg-clay/[0.06] text-clay' : 'border-line bg-paper text-ink',
            )}
          >
            <Clock3 className="size-5" aria-hidden="true" />
            {formatCountdown(remaining)}
          </div>
        ) : null}
      </header>

      {submitError ? (
        <div
          role="alert"
          className="rounded-xl border border-clay/25 bg-clay/[0.06] px-4 py-3 text-sm font-medium text-clay"
        >
          {submitError}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
              Question {current + 1} / {questions.length}
            </p>
            <div className="flex gap-1.5">
              <Badge>{question.type_display}</Badge>
              <Badge variant="brand">
                {question.points} {pluralize(question.points, 'pt')}
              </Badge>
            </div>
          </div>

          <fieldset className="mt-4 min-w-0" key={question.id}>
            <legend className="text-lg font-semibold leading-snug text-ink">{question.text}</legend>
            <p className="mt-1 text-xs text-slate-500">
              {question.type === 'multiple_choice'
                ? 'Select every correct answer.'
                : 'Select one answer.'}
            </p>
            <div className="mt-4 space-y-2">
              {question.options.map((option) => {
                const checked = selected.includes(option.id)
                return (
                  <label
                    key={option.id}
                    className={cx(
                      'flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition',
                      checked
                        ? 'border-brand/50 bg-brand/[0.06] font-medium text-ink'
                        : 'border-line bg-white text-ink-soft hover:border-slate-300',
                    )}
                  >
                    <input
                      type={question.type === 'multiple_choice' ? 'checkbox' : 'radio'}
                      name={`question-${question.id}`}
                      checked={checked}
                      onChange={() => toggleOption(question, option.id)}
                      disabled={submitting}
                      className="size-4 shrink-0 accent-brand"
                    />
                    {option.text}
                  </label>
                )
              })}
            </div>
          </fieldset>

          <div className="mt-6 flex items-center justify-between gap-3 border-t border-line pt-5">
            <Button
              variant="secondary"
              onClick={() => setCurrent((index) => Math.max(0, index - 1))}
              disabled={current === 0 || submitting}
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Previous
            </Button>
            {isLast ? (
              <Button variant="accent" onClick={() => setConfirmOpen(true)} disabled={submitting}>
                <Send className="size-4" aria-hidden="true" />
                Submit
              </Button>
            ) : (
              <Button
                onClick={() => setCurrent((index) => Math.min(questions.length - 1, index + 1))}
                disabled={submitting}
              >
                Next
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            )}
          </div>
        </Card>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <Card>
            <h2 className="text-xl font-semibold text-ink">Questions</h2>
            <nav aria-label="Question navigation" className="mt-4 grid grid-cols-5 gap-2">
              {questions.map((item, index) => {
                const answered = (answers[item.id] || []).length > 0
                const active = index === current
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setCurrent(index)}
                    aria-current={active ? 'step' : undefined}
                    aria-label={`Question ${index + 1}${answered ? ', answered' : ', not answered'}`}
                    className={cx(
                      'h-10 rounded-lg border text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
                      active
                        ? 'border-ink bg-ink text-paper'
                        : answered
                          ? 'border-sage/40 bg-sage/10 text-sage'
                          : 'border-line bg-white text-ink-soft hover:border-slate-300',
                    )}
                  >
                    {index + 1}
                  </button>
                )
              })}
            </nav>
            <Button
              variant="accent"
              className="mt-5 w-full"
              onClick={() => setConfirmOpen(true)}
              loading={submitting}
            >
              {submitting ? 'Submitting…' : 'Submit answers'}
            </Button>
          </Card>
        </aside>
      </div>

      <Modal
        open={confirmOpen}
        onClose={closeConfirm}
        title="Submit your answers?"
        description="Your answers will be graded immediately and cannot be changed afterwards."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={closeConfirm} disabled={submitting}>
              Keep answering
            </Button>
            <Button variant="accent" onClick={() => submit()} loading={submitting} data-autofocus>
              {submitting ? 'Submitting…' : 'Submit now'}
            </Button>
          </>
        }
      >
        {unanswered > 0 ? (
          <div className="flex items-start gap-3 rounded-xl border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <p>
              {unanswered} {pluralize(unanswered, 'question')} still{' '}
              {unanswered > 1 ? 'have' : 'has'} no answer and will earn no points.
            </p>
          </div>
        ) : (
          <p className="text-sm text-slate-600">Every question has an answer.</p>
        )}
      </Modal>
    </div>
  )
}
