import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, CalendarDays, Clock, ExternalLink, FileQuestion,
  Megaphone, Pencil, Pin, RotateCcw, Trash2, Users,
} from 'lucide-react'
import { fetchAnnouncement, deleteAnnouncement, enrollInAnnouncement } from '../../api/announcements'
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

  const [reload, setReload]         = useState(0)
  const [loading, setLoading]       = useState(true)
  const [announcement, setAnnouncement] = useState(null)
  const [error, setError]           = useState(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting]     = useState(false)

  // Inscription
  const [enrollModalOpen, setEnrollModalOpen] = useState(false)
  const [enrollForm, setEnrollForm] = useState({ full_name: '', email: '', phone: '', message: '' })
  const [enrollErrors, setEnrollErrors] = useState({})
  const [enrolling, setEnrolling]     = useState(false)
  const [isEnrolled, setIsEnrolled]   = useState(false)

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

  // Pré-remplir le formulaire avec les infos de l'utilisateur connecté
  useEffect(() => {
    if (user) {
      setEnrollForm((f) => ({
        ...f,
        full_name: user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim(),
        email:     user.email || '',
      }))
    }
  }, [user])

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

  async function handleEnroll() {
    // Validation
    const errs = {}
    if (!enrollForm.full_name.trim()) errs.full_name = 'Le nom est requis.'
    if (!enrollForm.email.trim())     errs.email     = 'L\'email est requis.'
    if (Object.keys(errs).length > 0) { setEnrollErrors(errs); return }

    setEnrolling(true)
    try {
      await enrollInAnnouncement(announcement.id, {
        full_name: enrollForm.full_name.trim(),
        email:     enrollForm.email.trim(),
        phone:     enrollForm.phone.trim(),
        message:   enrollForm.message.trim(),
      })
      addToast({ type: 'success', message: 'Inscription envoyée. En attente de confirmation.' })
      setEnrollModalOpen(false)
      setIsEnrolled(true)
    } catch (err) {
      addToast({ type: 'error', message: normalizeApiError(err, 'Inscription échouée.').message })
    } finally {
      setEnrolling(false)
    }
  }

  const canEdit =
    user?.role === 'admin' ||
    (user?.role === 'teacher' && announcement?.author === user?.id)

  const isStudent      = user?.role === 'student'
  const hasRelatedSession = !!announcement?.related_session
  const hasEventInfo   = !!(announcement?.event_date || announcement?.event_time || announcement?.meeting_link)
  // Le bouton d'inscription s'affiche si l'annonce a des infos d'événement OU une session liée
  const showEnrollBtn  = isStudent && (hasEventInfo || hasRelatedSession) && !isEnrolled

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

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2 xl:flex-col xl:items-stretch">

            {/* Bouton S'inscrire */}
            {showEnrollBtn && (
              <button
                type="button"
                onClick={() => setEnrollModalOpen(true)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-clay px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
              >
                <Users className="size-4" aria-hidden="true" />
                S'inscrire à la formation
              </button>
            )}

            {isStudent && isEnrolled && (
              <span className="inline-flex items-center gap-2 rounded-xl bg-sage/10 px-4 py-2 text-sm font-semibold text-sage">
                ✓ Inscrit — en attente de confirmation
              </span>
            )}

            {/* Lien rejoindre */}
            {announcement.meeting_link && (
              <a
                href={announcement.meeting_link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-slate-300 hover:bg-mist"
              >
                <ExternalLink className="size-4" aria-hidden="true" />
                Rejoindre la réunion
              </a>
            )}

            {canEdit && (
              <>
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
              </>
            )}
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {/* Contenu */}
        <Card>
          <h2 className="mb-4 text-xl font-semibold text-ink">Contenu</h2>
          <div className="text-sm leading-relaxed text-slate-700">
            <p className="whitespace-pre-wrap">{announcement.content}</p>

            {/* Bloc infos événement */}
            {(announcement.event_date || announcement.event_time || announcement.meeting_link) && (
              <div className="mt-5 space-y-2.5 rounded-xl border border-brand/20 bg-brand/[0.04] px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-strong">
                  Informations de l'événement
                </p>
                {announcement.event_date && (
                  <p className="flex items-center gap-2">
                    <CalendarDays className="size-4 shrink-0 text-brand-strong" aria-hidden="true" />
                    <span>
                      <span className="font-medium">Date :</span> {announcement.event_date}
                      {announcement.event_time && (
                        <span className="ml-2 font-medium">à {announcement.event_time}</span>
                      )}
                    </span>
                  </p>
                )}
                {!announcement.event_date && announcement.event_time && (
                  <p className="flex items-center gap-2">
                    <Clock className="size-4 shrink-0 text-brand-strong" aria-hidden="true" />
                    <span><span className="font-medium">Heure :</span> {announcement.event_time}</span>
                  </p>
                )}
                {announcement.meeting_link && (
                  <p className="flex items-center gap-2">
                    <ExternalLink className="size-4 shrink-0 text-brand-strong" aria-hidden="true" />
                    <a
                      href={announcement.meeting_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-brand-strong hover:underline break-all"
                    >
                      Rejoindre la réunion →
                    </a>
                  </p>
                )}
              </div>
            )}

            {/* Bouton S'inscrire dans le contenu */}
            {showEnrollBtn && (
              <div className="mt-5">
                <button
                  type="button"
                  onClick={() => setEnrollModalOpen(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-clay px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
                >
                  <Users className="size-4" aria-hidden="true" />
                  S'inscrire à cette formation
                </button>
              </div>
            )}
            {isStudent && isEnrolled && (
              <p className="mt-4 text-sm font-medium text-sage">✓ Vous êtes inscrit — en attente de confirmation.</p>
            )}
          </div>
        </Card>

        {/* Détails */}
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

          {/* Bouton dans le panneau latéral */}
          {showEnrollBtn && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setEnrollModalOpen(true)}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-clay px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
              >
                <Users className="size-4" aria-hidden="true" />
                S'inscrire à la formation
              </button>
            </div>
          )}
          {isStudent && isEnrolled && (
            <p className="mt-4 text-center text-sm font-medium text-sage">✓ Inscrit</p>
          )}
          {announcement.related_session && (
            <div className="mt-3">
              <LinkButton to={`/sessions/${announcement.related_session}`} variant="secondary" size="sm" className="w-full">
                Voir la session liée
              </LinkButton>
            </div>
          )}
        </Card>
      </div>

      {/* Modal inscription */}
      <Modal
        open={enrollModalOpen}
        onClose={() => { setEnrollModalOpen(false); setEnrollErrors({}) }}
        title="S'inscrire à la formation"
        description={`Remplissez le formulaire pour vous inscrire à "${announcement.title}".`}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setEnrollModalOpen(false); setEnrollErrors({}) }} disabled={enrolling}>
              Annuler
            </Button>
            <Button onClick={handleEnroll} disabled={enrolling}>
              {enrolling ? 'Envoi…' : 'Envoyer ma demande'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {/* Nom complet */}
          <div className="space-y-1.5">
            <label htmlFor="enroll-name" className="block text-sm font-medium text-ink">
              Nom complet <span className="text-clay">*</span>
            </label>
            <input
              id="enroll-name"
              type="text"
              value={enrollForm.full_name}
              onChange={(e) => { setEnrollForm((f) => ({ ...f, full_name: e.target.value })); setEnrollErrors((e2) => ({ ...e2, full_name: undefined })) }}
              placeholder="Votre nom et prénom"
              className="w-full rounded-xl border border-line bg-paper px-4 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              disabled={enrolling}
            />
            {enrollErrors.full_name && <p className="text-xs text-clay">{enrollErrors.full_name}</p>}
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label htmlFor="enroll-email" className="block text-sm font-medium text-ink">
              Email <span className="text-clay">*</span>
            </label>
            <input
              id="enroll-email"
              type="email"
              value={enrollForm.email}
              onChange={(e) => { setEnrollForm((f) => ({ ...f, email: e.target.value })); setEnrollErrors((e2) => ({ ...e2, email: undefined })) }}
              placeholder="votre@email.com"
              className="w-full rounded-xl border border-line bg-paper px-4 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              disabled={enrolling}
            />
            {enrollErrors.email && <p className="text-xs text-clay">{enrollErrors.email}</p>}
          </div>

          {/* Téléphone */}
          <div className="space-y-1.5">
            <label htmlFor="enroll-phone" className="block text-sm font-medium text-ink">
              Téléphone <span className="text-xs text-slate-400">(optionnel)</span>
            </label>
            <input
              id="enroll-phone"
              type="tel"
              value={enrollForm.phone}
              onChange={(e) => setEnrollForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="+213 6XX XXX XXX"
              className="w-full rounded-xl border border-line bg-paper px-4 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              disabled={enrolling}
            />
          </div>

          {/* Message */}
          <div className="space-y-1.5">
            <label htmlFor="enroll-msg" className="block text-sm font-medium text-ink">
              Message / Motivation <span className="text-xs text-slate-400">(optionnel)</span>
            </label>
            <textarea
              id="enroll-msg"
              rows={3}
              value={enrollForm.message}
              onChange={(e) => setEnrollForm((f) => ({ ...f, message: e.target.value }))}
              placeholder="Pourquoi souhaitez-vous participer à cette formation ?"
              className="w-full rounded-xl border border-line bg-paper px-4 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              disabled={enrolling}
            />
          </div>
        </div>
      </Modal>

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
