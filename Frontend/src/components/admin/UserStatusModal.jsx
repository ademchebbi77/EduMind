import { AlertTriangle, UserCheck } from 'lucide-react'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'

export function UserStatusModal({ account, open, changing, onClose, onConfirm }) {
  const deactivating = Boolean(account?.is_active)

  function handleClose() {
    if (!changing) onClose()
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={deactivating ? 'Deactivate this account?' : 'Reactivate this account?'}
      description={
        account
          ? deactivating
            ? `${account.full_name}'s account will no longer be able to access EduMind.`
            : `${account.full_name}'s account will be able to access EduMind again.`
          : undefined
      }
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={changing}>
            Cancel
          </Button>
          <Button
            variant={deactivating ? 'danger' : 'accent'}
            onClick={onConfirm}
            loading={changing}
          >
            {changing
              ? deactivating
                ? 'Deactivating…'
                : 'Reactivating…'
              : deactivating
                ? 'Deactivate account'
                : 'Reactivate account'}
          </Button>
        </>
      }
    >
      {deactivating ? (
        <div className="flex items-start gap-3 rounded-xl border border-clay/25 bg-clay/[0.06] p-4 text-sm text-clay">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <p>
            The user will be signed out and will not be able to sign in while their
            account remains deactivated. You can reactivate it at any time.
          </p>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-xl border border-sage/25 bg-sage/[0.06] p-4 text-sm text-sage">
          <UserCheck className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <p>
            The user will immediately regain access to their workspace with their
            usual credentials.
          </p>
        </div>
      )}
    </Modal>
  )
}
