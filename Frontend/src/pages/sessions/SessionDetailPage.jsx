import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, CalendarDays, Clock, ExternalLink, FileQuestion,
  Pencil, RotateCcw, Trash2, Users, Video,
} from 'lucide-react'
import {
  fetchSession, deleteSession, enrollInSession,
  cancelEnrollment, fetchSessionEnrollments, updateEnrollmentStatus,
} from '../../api/sessions'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { isCanceled, normalizeApiError } from '../../lib/api'
import { formatDateTime } from '../../lib/format'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { Badge } from '../../components/ui/Badge'
import { Button, LinkButton } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Modal } from '../../components/ui/Modal'
import { PageLoader } from '../../components/ui/Skeleton'

const STATUS_VARIANTS = { scheduled: 'brand', ongoing: 'sage', ended: 'default', cancelled: 'clay' }
const STATUS_LABELS   = { scheduled: 'Planifiée', ongoing: 'En cours', ended: 'Terminée', cancelled: 'Annulée' }
const ENROLL_STATUS_LABELS = { pending: 'En attente', confirmed: 'Confirmée', rejected: 'Rejetée' }
const ENROLL_STATUS_VARIANTS = { pending: 'default', confirmed: 'sage', rejected: 'clay' }

function BackLink() {
  return (
    <Link to="/sessions" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-brand-strong">
      <ArrowLeft className="size-4" aria-hidden="true" />
      Retour aux sessions
    </Link>
  )
}

export default function SessionDetailPage() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { addToast } = useToast()

  const [reload, setReload]       = useState(0)
  const [result, setResult]       = useState({ key: null, session: null, error: null })
  const [enrollments, setEnrollments] = useState([])
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting]   = useState(false)
  const [enrolling, setEnrolling] = useState(false)
  const [enrollMessage, setEnrollMessage] = useState('')
  const [enrollModalOpen, setEnrollModalOpen] = useState(false)

  const requestKey = `${sessionId}:${reload}`

  useEffect(() => {
    const controller = new AbortController()
    fetchSession(sessionId, { signal: controller.signal })
      .then((data) => setResult({ key: requestKey, session: data, error: null }))
      .catch((err) => {
        if (isCanceled(err)) return
        setResult({ key: requestKey, session: null, error: normalizeApiError(err) })
      })
    return () => controller.abort()
  }, [sessionId, requestKey])

  const loading = result.key !== requestKey
  const session = loading ? null : result.session
  const error   = loading ? null : result.error

  useDocumentTitle(session?.title || 'Session')

  // Charger les inscriptions si admin
  useEffect(() => {
    if (!session || user?.role !== 'admin' || session.session_type !== 'training') return
    fetchSessionEnrollments(sessionId)
      .then((data) => setEnrollments(Array.isArray(data) ? data : data.results || []))
      .catch(() => {})
  }, [session, sessionId, user?.role])

  const isAdmin   = user?.role === 'admin'
  const isTeacher = user?.role === 'teacher'
  const isStudent = user?.role === 'student'
  const canEdit   = isAdmin || (isTeacher && session?.created_by === user?.id)

  async function handleDelete() {
    setDeleting(true)
    try {
      await deleteSession(session.id)
      setDeleteOpen(false)
      addToast({ type: 'success', message: `Session "${session.title}" supprimée.` })
      navigate('/sessions', { replace: true })
    } catch (err) {
      addToast({ type: 'error', message: normalizeApiError(err, 'Suppression échouée.').message })
      setDeleting(false)
    }
  }

  async function handleEnroll() {
    setEnrolling(true)
    try {
      await enrollInSession(session.id, enrollMessage)
      addToast({ type: 'success', message: 'Inscription envoyée. En attente de confirmation.' })
      setEnrollModalOpen(false)
      setReload((c) => c + 1)
    } catch (err) {
      addToast({ type: 'error', message: normalizeApiError(err, 'Inscription échouée.').message })
    } finally {
      setEnrolling(false)
    }
  }

  async function handleEnrollmentStatus(enrollmentId, status) {
    try {
      await updateEnrollmentStatus(enrollmentId, status)
      setEnrollments((prev) => prev.map((e) => e.id === enrollmentId ? { ...e, status } : e))
      addToast({ type: 'success', message: 'Statut mis à jour.' })
    } catch (err) {
      addToast({ type: 'error', message: normalizeApiError(err, 'Mise à jour échouée.').message })
    }
  }

  if (loading) return <PageLoader label="Chargement de la session…" />

  if (error) {
    return (
      <div className="space-y-6">
        <BackLink />
        {error.status === 404 ? (
          <EmptyState icon={FileQuestion} title="Session introuvable" description="Cette session n'existe pas ou a été supprimée."
            action={<LinkButton to="/sessions">Voir les sessions</LinkButton>} />
        ) : (
          <div role="alert">
            <EmptyState icon={FileQuestion} title="Impossible d'afficher cette session" description={error.message}
              action={<Button variant="secondary" onClick={() => setReload((c) => c + 1)}><RotateCcw className="size-4" /> Réessayer</Button>} />
          </div>
        )}
      </div>
    )
  }

  if (!session) return null

  const isTraining = session.session_type === 'training'
  const isOngoing  = session.status === 'ongoing'

  return (
    <div className="space-y-6">
      <BackLink />

      {/* Header */}
      <header className="surface relative overflow-hidden border-l-4 border-l-brand p-6 sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={isTraining ? 'clay' : 'brand'}>
                {isTraining ? 'Formation' : 'Cours en ligne'}
              </Badge>
              <Badge variant={STATUS_VARIANTS[session.status] || 'default'}>
                {STATUS_LABELS[session.status] || session.status_display}
              </Badge>
            </div>
            <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              {session.title}
            </h1>
            <span className="academic-rule mt-4" aria-hidden="true" />
            {session.description && (
              <p className="mt-4 max-w-2xl whitespace-pre-line text-sm leading-relaxed text-slate-600">
                {session.description}
              </p>
            )}
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-4" aria-hidden="true" />
                {formatDateTime(session.starts_at)} → {formatDateTime(session.ends_at)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="size-4" aria-hidden="true" />
                {session.duration_minutes} min
              </span>
              {isTraining && (
                <span className="inline-flex items-center gap-1.5">
                  <Users className="size-4" aria-hidden="true" />
                  {session.enrollment_count} inscrit{session.enrollment_count > 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 xl:flex-col xl:items-stretch">
            {session.meeting_link && isOngoing && (
              <a href={session.meeting_link} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-sage px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
                <Video className="size-4" aria-hidden="true" />
                Rejoindre la session
                <ExternalLink className="size-3.5" aria-hidden="true" />
              </a>
            )}
            {isStudent && isTraining && !session.is_enrolled && session.status === 'scheduled' && (
              <Button onClick={() => setEnrollModalOpen(true)}>S'inscrire à la formation</Button>
            )}
            {isStudent && session.is_enrolled && (
              <Badge variant="sage">Inscrit ✓</Badge>
            )}
            {canEdit && (
              <>
                <LinkButton to={`/sessions/${session.id}/edit`} variant="secondary" size="sm">
                  <Pencil className="size-4" aria-hidden="true" /> Modifier
                </LinkButton>
                <Button variant="ghost" size="sm" onClick={() => setDeleteOpen(true)} className="text-clay hover:bg-clay/10">
                  <Trash2 className="size-4" aria-hidden="true" /> Supprimer
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Teachers assignés */}
      {isTraining && session.assigned_teachers_detail?.length > 0 && (
        <Card>
          <h2 className="mb-4 text-xl font-semibold text-ink">Enseignants</h2>
          <div className="flex flex-wrap gap-3">
            {session.assigned_teachers_detail.map((t) => (
              <div key={t.id} className="rounded-lg border border-line bg-paper px-3 py-2 text-sm">
                <p className="font-medium text-ink">{t.full_name}</p>
                <p className="text-xs text-slate-500">{t.email}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Inscriptions (admin uniquement) */}
      {isAdmin && isTraining && (
        <Card>
          <h2 className="mb-4 text-xl font-semibold text-ink">Inscriptions ({enrollments.length})</h2>
          {enrollments.length === 0 ? (
            <p className="text-sm text-slate-500">Aucune inscription pour le moment.</p>
          ) : (
            <div className="divide-y divide-line">
              {enrollments.map((enr) => (
                <div key={enr.id} className="flex items-center justify-between gap-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-ink">{enr.student_name}</p>
                    <p className="text-xs text-slate-500">{enr.student_email}</p>
                    {enr.message && <p className="mt-1 text-xs italic text-slate-500">"{enr.message}"</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={ENROLL_STATUS_VARIANTS[enr.status] || 'default'}>
                      {ENROLL_STATUS_LABELS[enr.status] || enr.status_display}
                    </Badge>
                    {enr.status === 'pending' && (
                      <>
                        <Button size="sm" variant="secondary" onClick={() => handleEnrollmentStatus(enr.id, 'confirmed')}>
                          Confirmer
                        </Button>
                        <Button size="sm" variant="ghost" className="text-clay hover:bg-clay/10"
                          onClick={() => handleEnrollmentStatus(enr.id, 'rejected')}>
                          Rejeter
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Modal inscription étudiant */}
      <Modal
        open={enrollModalOpen}
        onClose={() => setEnrollModalOpen(false)}
        title="S'inscrire à la formation"
        description={`Vous allez envoyer une demande d'inscription pour "${session.title}".`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEnrollModalOpen(false)} disabled={enrolling}>
              Annuler
            </Button>
            <Button onClick={handleEnroll} disabled={enrolling}>
              {enrolling ? 'Envoi…' : 'Envoyer ma demande'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="block text-sm font-medium text-ink">
            Message (optionnel)
          </label>
          <textarea
            rows={3}
            value={enrollMessage}
            onChange={(e) => setEnrollMessage(e.target.value)}
            placeholder="Présentez-vous brièvement ou posez une question…"
            className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            disabled={enrolling}
          />
        </div>
      </Modal>

      {/* Modal suppression */}
      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Supprimer la session"
        description={`Êtes-vous sûr de vouloir supprimer "${session.title}" ? Cette action est irréversible.`}
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
