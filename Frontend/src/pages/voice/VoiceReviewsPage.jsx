import { useEffect, useState } from 'react'
import { BookOpen, CheckCircle2, GraduationCap, Inbox, Pencil, Sparkles, ThumbsDown } from 'lucide-react'
import { answerVoiceReview, fetchVoiceReviews } from '../../api/voiceQuestions'
import { useToast } from '../../context/ToastContext'
import { firstFieldError, isCanceled, normalizeApiError } from '../../lib/api'
import { cx } from '../../lib/cx'
import { formatDate } from '../../lib/format'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Textarea } from '../../components/ui/Field'
import { PageLoader } from '../../components/ui/Skeleton'

const TABS = [
  { value: 'pending', label: 'To answer' },
  { value: 'answered', label: 'Answered' },
]
const MAX_ANSWER_CHARS = 4000

function ReviewItem({ item, onAnswered }) {
  const { addToast } = useToast()
  const [editing, setEditing] = useState(!item.teacher_answer)
  const [value, setValue] = useState(item.teacher_answer || '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(event) {
    event.preventDefault()
    if (!value.trim()) {
      setError('Write the answer first.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const updated = await answerVoiceReview(item.id, value.trim())
      setEditing(false)
      addToast({ type: 'success', message: 'Your verified answer was sent to the student.' })
      onAnswered(updated)
    } catch (requestError) {
      const normalized = normalizeApiError(requestError, 'Unable to save the answer.')
      setError(firstFieldError(normalized.fields, 'teacher_answer') || normalized.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card as="li" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge>
            <BookOpen className="size-3.5" aria-hidden="true" />
            {item.course_title}
          </Badge>
          <Badge variant="clay">
            <ThumbsDown className="size-3.5" aria-hidden="true" />
            {item.rating_reason_display}
          </Badge>
        </div>
        <p className="text-xs text-slate-600">
          {item.student_name} · sent on {formatDate(item.escalated_at)}
        </p>
      </div>

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Student question</h2>
        <p dir="auto" className="mt-1 whitespace-pre-line text-base font-medium text-ink">
          {item.question_text}
        </p>
        {item.rating_comment ? (
          <p dir="auto" className="mt-2 text-sm text-ink-soft">
            <span className="font-semibold">Student note:</span> “{item.rating_comment}”
          </p>
        ) : null}
      </div>

      <details className="rounded-xl border border-line bg-mist/40 px-4 py-3">
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-ink">
          <Sparkles className="size-4 text-sage" aria-hidden="true" />
          AI answer the student did not find helpful
        </summary>
        <p dir="auto" className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-soft">
          {item.answer}
        </p>
      </details>

      {editing ? (
        <form onSubmit={submit} noValidate className="space-y-3">
          <Textarea
            label="Your verified answer"
            name="teacher_answer"
            rows={5}
            maxLength={MAX_ANSWER_CHARS}
            value={value}
            onChange={(event) => {
              setValue(event.target.value)
              setError('')
            }}
            error={error}
            hint="The student will see it under the AI answer, marked “Verified by the teacher”."
            required
          />
          <div className="flex justify-end gap-2">
            {item.teacher_answer ? (
              <Button variant="secondary" size="sm" onClick={() => setEditing(false)} disabled={saving}>
                Cancel
              </Button>
            ) : null}
            <Button type="submit" size="sm" loading={saving}>
              {item.teacher_answer ? 'Save the answer' : 'Send the answer'}
            </Button>
          </div>
        </form>
      ) : (
        <div className="rounded-xl border-l-4 border-brand bg-brand/[0.05] p-4">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
            <CheckCircle2 className="size-4 text-brand-strong" aria-hidden="true" />
            Your verified answer
            <span className="text-xs font-normal text-slate-600">· {formatDate(item.teacher_answered_at)}</span>
          </p>
          <p dir="auto" className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-soft">
            {item.teacher_answer}
          </p>
          <div className="mt-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="size-4" aria-hidden="true" />
              Edit the answer
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}

/** Teacher: questions students sent after an unhelpful AI answer. */
export default function VoiceReviewsPage() {
  useDocumentTitle('Questions to review')
  const [tab, setTab] = useState('pending')
  const [result, setResult] = useState({ key: null, items: [], count: 0, error: '' })

  useEffect(() => {
    const controller = new AbortController()
    fetchVoiceReviews({ status: tab }, { signal: controller.signal })
      .then((data) => setResult({ key: tab, items: data.results, count: data.count, error: '' }))
      .catch((error) => {
        if (isCanceled(error)) return
        setResult({
          key: tab,
          items: [],
          count: 0,
          error: normalizeApiError(error, 'Unable to load the questions.').message,
        })
      })
    return () => controller.abort()
  }, [tab])

  const loading = result.key !== tab

  function handleAnswered(updated) {
    // An answered question leaves the "To answer" list.
    setResult((current) => ({
      ...current,
      items:
        tab === 'pending'
          ? current.items.filter((item) => item.id !== updated.id)
          : current.items.map((item) => (item.id === updated.id ? updated : item)),
      count: tab === 'pending' ? Math.max(0, current.count - 1) : current.count,
    }))
  }

  return (
    <div className="space-y-6">
      <header className="border-b border-line pb-6">
        <p className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-strong">
          <span className="h-px w-7 bg-brand" aria-hidden="true" />
          Voice questions
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          Questions to review
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          Students send you a voice question when the AI answer did not help them. Read their note,
          then write a verified answer: they will see it under the AI answer.
        </p>
      </header>

      <div role="group" aria-label="Filter the questions" className="flex gap-2">
        {TABS.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={tab === item.value}
            onClick={() => setTab(item.value)}
            className={cx(
              'rounded-full border px-4 py-1.5 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
              tab === item.value
                ? 'border-ink bg-ink text-paper'
                : 'border-line bg-paper text-ink-soft hover:border-slate-300',
            )}
          >
            {item.label}
            {tab === item.value && !loading && !result.error ? ` (${result.count})` : ''}
          </button>
        ))}
      </div>

      {loading ? (
        <PageLoader />
      ) : result.error ? (
        <p role="alert" className="text-sm font-medium text-clay">
          {result.error}
        </p>
      ) : result.items.length === 0 ? (
        <EmptyState
          icon={tab === 'pending' ? Inbox : GraduationCap}
          title={tab === 'pending' ? 'No question to answer' : 'No answered question yet'}
          description={
            tab === 'pending'
              ? 'When a student finds an AI answer unhelpful and asks you, the question appears here.'
              : 'Questions you answer appear here; you can still edit your answer.'
          }
        />
      ) : (
        <ul className="space-y-4">
          {result.items.map((item) => (
            <ReviewItem key={item.id} item={item} onAnswered={handleAnswered} />
          ))}
        </ul>
      )}
    </div>
  )
}
