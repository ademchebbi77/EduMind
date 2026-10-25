import { AlertTriangle } from 'lucide-react'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'

const COPY = {
  quiz: {
    title: 'Delete this quiz?',
    description: (title) => `“${title}”, its questions and every student attempt will be permanently deleted.`,
    warning: 'This action cannot be undone. Student scores for this quiz will be lost.',
  },
  exercise: {
    title: 'Delete this exercise?',
    description: (title) => `“${title}” and every student submission will be permanently deleted.`,
    warning: 'This action cannot be undone. Submitted answers and grades will be lost.',
  },
}

export function DeleteAssessmentModal({ kind, item, open, deleting, onClose, onConfirm }) {
  const copy = COPY[kind] || COPY.quiz

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={copy.title}
      description={item ? copy.description(item.title) : undefined}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={deleting}>
            {deleting ? 'Deleting…' : 'Delete permanently'}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-3 rounded-xl border border-clay/25 bg-clay/[0.06] p-4 text-sm text-clay">
        <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <p>{copy.warning}</p>
      </div>
    </Modal>
  )
}
