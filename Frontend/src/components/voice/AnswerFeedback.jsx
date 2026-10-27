import { useState } from 'react'
import { CheckCircle2, Clock, GraduationCap, Send, ThumbsDown, ThumbsUp } from 'lucide-react'
import { escalateVoiceQuestion, rateVoiceQuestion } from '../../api/voiceQuestions'
import { firstFieldError, normalizeApiError } from '../../lib/api'
import { formatDate } from '../../lib/format'
import { RATING_REASONS, reasonLabel } from '../../lib/voiceFeedback'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Select, Textarea } from '../ui/Field'

const MAX_COMMENT_CHARS = 500

/** The course teacher's verified answer, shown under the AI answer. */
export function TeacherAnswer({ question }) {
  return (
    <Card className="border-l-4 border-l-brand" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xl font-semibold text-ink">
          <GraduationCap className="size-5 text-brand-strong" aria-hidden="true" />
          Your teacher&apos;s answer
        </h2>
        <Badge variant="success">
          <CheckCircle2 className="size-3.5" aria-hidden="true" />
          Verified by the teacher
        </Badge>
      </div>
      <div dir="auto" className="mt-4 whitespace-pre-line text-base leading-relaxed text-ink-soft">
        {question.teacher_answer}
      </div>
      <p className="mt-4 text-xs text-slate-600">
        {question.teacher_answered_by_name} · {formatDate(question.teacher_answered_at)}
      </p>
    </Card>
  )
}

/**
 * Under an AI answer: was it helpful? After a "no" with a reason, the student can
 * send the question to the course teacher, who writes a verified answer.
 */
export function AnswerFeedback({ question, onChange }) {
  const [choosing, setChoosing] = useState(false) // the "not helpful" form is open
  const [reason, setReason] = useState(question.rating_reason || '')
  const [comment, setComment] = useState(question.rating_comment || '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function run(action) {
    setSaving(true)
    setError('')
    try {
      onChange(await action())
      return true
    } catch (requestError) {
      const normalized = normalizeApiError(requestError, 'Unable to save your feedback.')
      setError(firstFieldError(normalized.fields, 'reason') || normalized.message)
      return false
    } finally {
      setSaving(false)
    }
  }

  async function sendNotHelpful(event) {
    event.preventDefault()
    if (!reason) {
      setError('Tell us what was wrong with the answer.')
      return
    }
    const saved = await run(() =>
      rateVoiceQuestion(question.id, { rating: 'not_helpful', reason, comment }),
    )
    if (saved) setChoosing(false)
  }

  if (question.review_status === 'pending') {
    return (
      <div role="status" className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <Clock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p>
          Sent to your teacher on {formatDate(question.escalated_at)}. Their verified answer will appear
          here.
        </p>
      </div>
    )
  }
  if (question.review_status === 'answered') return null

  const notHelpful = question.rating === 'not_helpful'

  return (
    <section aria-label="Your feedback on this answer" className="rounded-xl border border-line bg-mist/40 px-4 py-3">
      {choosing ? (
        <form onSubmit={sendNotHelpful} noValidate className="space-y-3">
          <Select
            label="What was wrong with the answer?"
            name="reason"
            value={reason}
            onChange={(event) => {
              setReason(event.target.value)
              setError('')
            }}
            error={error}
            required
          >
            <option value="">Choose a reason</option>
            {RATING_REASONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
          <Textarea
            label="A note for your teacher (optional)"
            name="comment"
            rows={2}
            maxLength={MAX_COMMENT_CHARS}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            hint={`${comment.length} / ${MAX_COMMENT_CHARS}`}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setChoosing(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={saving}>
              Save my feedback
            </Button>
          </div>
        </form>
      ) : notHelpful ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-soft">
            You found this answer <strong>not helpful</strong> ({reasonLabel(question.rating_reason).toLowerCase()}).
            {question.rating_comment ? <> Your note: “{question.rating_comment}”</> : null}
          </p>
          {error ? (
            <p role="alert" className="text-sm font-medium text-clay">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setChoosing(true)} disabled={saving}>
              Change my feedback
            </Button>
            <Button
              variant="accent"
              size="sm"
              loading={saving}
              onClick={() => run(() => escalateVoiceQuestion(question.id))}
            >
              <Send className="size-4" aria-hidden="true" />
              Ask my teacher
            </Button>
          </div>
          <p className="text-xs text-slate-600">
            Your teacher will see your question, the AI answer and your note, and will write a verified answer.
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium text-ink">
            {question.rating === 'helpful' ? 'Thanks! You found this answer helpful.' : 'Was this answer helpful?'}
          </p>
          <div className="flex gap-2">
            <Button
              variant={question.rating === 'helpful' ? 'primary' : 'secondary'}
              size="sm"
              aria-pressed={question.rating === 'helpful'}
              loading={saving}
              onClick={() => run(() => rateVoiceQuestion(question.id, { rating: 'helpful' }))}
            >
              <ThumbsUp className="size-4" aria-hidden="true" />
              Yes
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setChoosing(true)} disabled={saving}>
              <ThumbsDown className="size-4" aria-hidden="true" />
              No
            </Button>
          </div>
          {error ? (
            <p role="alert" className="w-full text-sm font-medium text-clay">
              {error}
            </p>
          ) : null}
        </div>
      )}
    </section>
  )
}
