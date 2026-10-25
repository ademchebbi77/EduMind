import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'

export function DeleteSessionModal({ session, onClose, onConfirm }) {
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    setLoading(true)
    try {
      await onConfirm(session)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={!!session}
      onClose={onClose}
      title="Supprimer la session"
      description={`Êtes-vous sûr de vouloir supprimer "${session?.title}" ? Cette action est irréversible.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Annuler
          </Button>
          <Button variant="danger" onClick={handleDelete} disabled={loading}>
            {loading ? 'Suppression…' : 'Supprimer'}
          </Button>
        </>
      }
    />
  )
}
