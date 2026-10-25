import { useState } from 'react'
import { Button } from '../ui/Button'
import { Input, Textarea } from '../ui/Field'
import { Modal } from '../ui/Modal'
import { firstFieldError, normalizeApiError } from '../../lib/api'

function GradeForm({ submission, maxPoints, onClose, onSave }) {
  const [score, setScore] = useState(
    submission.score === null || submission.score === undefined ? '' : String(submission.score),
  )
  const [feedback, setFeedback] = useState(submission.feedback || '')
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    const value = Number(score)
    if (score === '' || !Number.isInteger(value) || value < 0 || value > maxPoints) {
      setErrors({ score: `Enter a whole number between 0 and ${maxPoints}.` })
      return
    }
    setSaving(true)
    try {
      await onSave({ score: value, feedback: feedback.trim() })
    } catch (saveError) {
      const error = normalizeApiError(saveError, 'Saving the grade failed.')
      setErrors({
        score: firstFieldError(error.fields, 'score') || undefined,
        feedback: firstFieldError(error.fields, 'feedback') || undefined,
        form: error.message,
      })
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div className="max-h-56 overflow-y-auto whitespace-pre-line rounded-xl border border-line bg-mist/60 p-4 text-sm leading-relaxed text-ink-soft">
        {submission.content}
      </div>
      <Input
        label={`Score (out of ${maxPoints})`}
        type="number"
        inputMode="numeric"
        min={0}
        max={maxPoints}
        value={score}
        onChange={(event) => {
          setScore(event.target.value)
          setErrors({})
        }}
        error={errors.score}
        disabled={saving}
        required
        data-autofocus
      />
      <Textarea
        label="Feedback"
        rows={4}
        value={feedback}
        onChange={(event) => setFeedback(event.target.value)}
        error={errors.feedback}
        hint="Optional. The student sees it with their grade."
        disabled={saving}
      />
      {errors.form && !errors.score && !errors.feedback ? (
        <p role="alert" className="text-sm font-medium text-clay">
          {errors.form}
        </p>
      ) : null}
      <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          {saving ? 'Saving…' : 'Save grade'}
        </Button>
      </div>
    </form>
  )
}

export function GradeSubmissionModal({ submission, maxPoints, onClose, onSave }) {
  return (
    <Modal
      open={Boolean(submission)}
      onClose={onClose}
      title={submission ? `Grade ${submission.student_name}` : 'Grade submission'}
      description={submission?.is_late ? 'This answer was submitted after the due date.' : undefined}
      size="lg"
    >
      {submission ? (
        <GradeForm
          key={submission.id}
          submission={submission}
          maxPoints={maxPoints}
          onClose={onClose}
          onSave={onSave}
        />
      ) : null}
    </Modal>
  )
}
