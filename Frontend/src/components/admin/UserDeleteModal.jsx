import { AlertTriangle } from 'lucide-react'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'

export function UserDeleteModal({ account, open, deleting, onClose, onConfirm }) {
  function handleClose() {
    if (!deleting) onClose()
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Delete this account?"
      description={
        account
          ? `${account.full_name}'s account will be permanently deleted.`
          : undefined
      }
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={deleting}>
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
        <div className="space-y-2">
          <p className="font-semibold">This action cannot be undone.</p>
          <p>
            All of this user's courses and their PDF or audio files will also be
            deleted.
          </p>
          <p>
            The account linked to {account?.email} will disappear from the platform.
          </p>
        </div>
      </div>
    </Modal>
  )
}
