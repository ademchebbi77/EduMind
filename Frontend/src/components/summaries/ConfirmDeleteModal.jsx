import { AlertTriangle } from 'lucide-react'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'

export function ConfirmDeleteModal({ open, title, description, deleting, onClose, onConfirm }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
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
        <p>This action cannot be undone.</p>
      </div>
    </Modal>
  )
}
