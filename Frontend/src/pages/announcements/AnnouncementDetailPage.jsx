import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, CalendarDays, FileQuestion, Megaphone,
  Pencil, Pin, RotateCcw, Trash2,
} from 'lucide-react'
import { fetchAnnouncement, deleteAnnouncement } from '../../api/announcements'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { isCanceled, normalizeApiError } from '../../lib/api'
import { formatDate } from '../../lib/format'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { Badge } from '../../components/ui/Badge'
import { Button, LinkButton } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Modal } from '../../components/ui/Modal'
import { PageLoader } from '../../components/ui/Skeleton'

const AUDIENCE_VARIANTS = { all: 'default', students: 'brand', teachers: 'sage' }
const AUDIENCE_LABELS   = { all: 'Tous', students: 'Étudiants', teachers: 'Enseignants' }

function BackLink() {
  return (
    <Link
      to="/announcements"
      className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-brand-strong"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      Retour aux annonces
    </Link>
  )
}

export default function AnnouncementDetailPage() {
  const { announcementId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { addToast } = useToast()

  const [reload, setReload]     = useState(0)
  const [loading, setLoading]   = useState(true)
  const [announcement, setAnnouncement] = useState(null)
  const [error, setError]       = useState(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    fetchAnnouncement(announcementId, { signal: controller.signal })
      .then((data) => {
        setAnnouncement(data)
        setLoading(false)
      })
      .catch((err) => {
        if (isCanceled(err)) return
        setError(normalizeApiError(err))
        setLoading(false)
      })
    return () => controller.abort()
  }, [announcementId, reload])

  useDocumentTitle(announcement?.title || 'Annonce')

  async function handleDelete() {
    setDeleting(true)
    try {
      await deleteAnnouncement(announcement.id)
      setDeleteOpen(false)
      addToast({ type: 'success', message: `Annonce "${announcement.title}" supprimée.` })
      navigate('/announcements', { replace: true })
    } catch (err) {
      addToast({ type: 'error', message: normalizeApiError(err, 'Suppression échouée.').message })
      setDeleting(false)
    }
  }

  const canEdit =
    user?.role === 'admin' ||
    (user?.role === 'teacher' && announcement?.author === user?.id)

  if (loading) return <PageLoader label="Chargement de l'annonce…" />

  if (error) {
    return (
      <div className="space-y-6">
        <BackLink />
        {error.status === 404 ? (
          <EmptyState
            icon={FileQuestion}
            title="Annonce introuvable"
            description="Cette annonce n'existe pas ou a été supprimée."
            action={<LinkButton to="/announcements">Voir les annonces</LinkButton>}
          />
        ) : (
          <div role="alert">
            <EmptyState
              icon={FileQuestion}
              title="Impossible d'afficher cette annonce"
              description={error.message}
              action={
                <Button variant="secondary" onClick={() => setReload((c) => c + 1)}>
                  <RotateCcw className="size-4" />
                  Réessayer
                </Button>
              }
            />
          </div>
        )}
      </div>
    )
  }

  if (!announcement) return null

  return (
    <div className="space-y-6">
      <BackLink />

      {/* Header */}
      <header className="surface relative overflow-hidden border-l-4 border-l-brand p-6 sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex size-9 items-center justify-center rounded-lg bg-brand/10 text-brand-strong">
                <Megaphone className="size-4" aria-hidden="true" />
              </span>
              <Badge variant={AUDIENCE_VARIANTS[announcement.target_audience] || 'default'}>
                {AUDIENCE_LABELS[announcement.target_audience] || announcement.target_audience_display}
              </Badge>
              {announcement.is_pinned && (
                <span className="inline-flex items-center gap-1 rounded-full bg-gold/10 px-2 py-0.5 text-xs font-medium text-gold">
                  <Pin className="size-3" aria-hidden="true" />
                  Épinglée
                </span>
              )}
            </div>

            <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              {announcement.title}
            </h1>
            <span className="academic-rule mt-4" aria-hidden="true" />

            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
              <span>{announcement.author_name}</span>
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-4" aria-hidden="true" />
                {formatDate(announcement.created_at)}
              </span>
            </div>
          </div>

          {canEdit && (
            <div className="flex flex-wrap items-center gap-2 xl:flex-col xl:items-stretch">
              <LinkButton to={`/announcements/${announcement.id}/edit`} variant="secondary" size="sm">
                <Pencil className="size-4" aria-hidden="true" />
                Modifier
              </LinkButton>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDeleteOpen(true)}
                className="text-clay hover:bg-clay/10"
              >
                <Trash2 className="size-4" aria-hidden="true" />
                Supprimer
              </Button>
            </div>
          )}
        </div>
      </header>

      {/* Contenu */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <h2 className="mb-4 text-xl font-semibold text-ink">Contenu</h2>
          <div className="prose prose-sm max-w-none text-slate-700 whitespace-pre-wrap leading-relaxed">
            {announcement.content}
          </div>
        </Card>

        <Card as="aside" className="bg-gradient-to-b from-white to-mist/50">
          <h2 className="mb-4 text-xl font-semibold text-ink">Détails</h2>
          <dl className="divide-y divide-line text-sm">
            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="text-slate-500">Auteur</dt>
              <dd className="font-medium text-ink-soft">{announcement.author_name}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="text-slate-500">Audience</dt>
              <dd>
                <Badge variant={AUDIENCE_VARIANTS[announcement.target_audience] || 'default'}>
                  {AUDIENCE_LABELS[announcement.target_audience] || announcement.target_audience_display}
                </Badge>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="text-slate-500">Date</dt>
              <dd className="font-medium text-ink-soft">{formatDate(announcement.created_at)}</dd>
            </div>
            {announcement.is_pinned && (
              <div className="flex items-center justify-between gap-4 py-3">
                <dt className="text-slate-500">Épinglée</dt>
                <dd className="font-medium text-gold">Oui</dd>
              </div>
            )}
            {announcement.related_session_title && (
              <div className="flex items-center justify-between gap-4 py-3">
                <dt className="text-slate-500">Session liée</dt>
                <dd className="text-right font-medium text-ink-soft">
                  {announcement.related_session_title}
                </dd>
              </div>
            )}
          </dl>

          {announcement.related_session && (
            <div className="mt-4">
              <LinkButton to={`/sessions/${announcement.related_session}`} variant="secondary" size="sm" className="w-full">
                Voir la session liée
              </LinkButton>
            </div>
          )}
        </Card>
      </div>

      {/* Modal suppression */}
      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Supprimer l'annonce"
        description={`Êtes-vous sûr de vouloir supprimer "${announcement.title}" ? Cette action est irréversible.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Annuler
            </Button>
            <Button variant="danger" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Suppression…' : 'Supprimer'}
            </Button>
          </>
        }
      />
    </div>
  )
}
