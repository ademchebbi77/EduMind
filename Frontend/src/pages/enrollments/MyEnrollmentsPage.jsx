import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle, ArrowRight, CalendarDays, CheckCircle2,
  Clock, ClipboardList, ExternalLink, XCircle,
} from 'lucide-react'
import { fetchEnrollments, cancelEnrollment } from '../../api/sessions'
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
import { CardSkeleton } from '../../components/ui/Skeleton'

const STATUS_VARIANTS = { pending: 'default', confirmed: 'sage', rejected: 'clay' }
const STATUS_LABELS   = { pending: 'En attente', confirmed: 'Confirmée', rejected: 'Rejetée' }
const STATUS_ICONS    = {
  pending:   <Clock className="size-4 text-slate-400" aria-hidden="true" />,
  confirmed: <CheckCircle2 className="size-4 text-sage" aria-hidden="true" />,
  rejected:  <XCircle className="size-4 text-clay" aria-hidden="true" />,
}

export default function MyEnrollmentsPage() {
  useDocumentTitle('Mes inscriptions')

  const { user } = useAuth()
  const { addToast } = useToast()

  const [loading, setLoading]     = useState(true)
  const [enrollments, setEnrollments] = useState([])
  const [error, setError]         = useState(null)
  const [reload, setReload]       = useState(0)
  const [toCancel, setToCancel]   = useState(null)
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    fetchEnrollments({}, { signal: controller.signal })
      .then((data) => {
        setEnrollments(Array.isArray(data) ? data : data.results ?? [])
        setLoading(false)
      })
      .catch((err) => {
        if (isCanceled(err)) return
        setError(normalizeApiError(err))
        setLoading(false)
      })
    return () => controller.abort()
  }, [reload])

  async function handleCancel() {
    if (!toCancel) return
    setCancelling(true)
    try {
      await cancelEnrollment(toCancel.id)
      addToast({ type: 'success', message: `Inscription à "${toCancel.session_title}" annulée.` })
      setToCancel(null)
      setReload((c) => c + 1)
    } catch (err) {
      addToast({ type: 'error', message: normalizeApiError(err, 'Annulation échouée.').message })
    } finally {
      setCancelling(false)
    }
  }

  const pending   = enrollments.filter((e) => e.status === 'pending')
  const confirmed = enrollments.filter((e) => e.status === 'confirmed')
  const rejected  = enrollments.filter((e) => e.status === 'rejected')

  return (
    <div className="space-y-6">
      <header className="border-b border-line pb-6">
        <p className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-strong">
          <span className="h-px w-7 bg-brand" aria-hidden="true" />
          Mes formations
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          Mes inscriptions
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Suivez l'état de vos demandes d'inscription aux formations.
        </p>
      </header>

      {/* Stats rapides */}
      {!loading && enrollments.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'En attente', count: pending.length,   color: 'text-slate-500',    bg: 'bg-slate-100' },
            { label: 'Confirmées', count: confirmed.length, color: 'text-sage',         bg: 'bg-sage/10'   },
            { label: 'Rejetées',   count: rejected.length,  color: 'text-clay',         bg: 'bg-clay/10'   },
          ].map(({ label, count, color, bg }) => (
            <Card key={label} className="text-center py-4">
              <p className={`text-2xl font-bold ${color}`}>{count}</p>
              <p className="text-xs text-slate-500 mt-1">{label}</p>
            </Card>
          ))}
        </div>
      )}

      {/* Erreur */}
      {error && !loading && (
        <div role="alert">
          <EmptyState
            icon={AlertTriangle}
            title="Impossible de charger vos inscriptions"
            description={error.message}
            action={<Button variant="secondary" onClick={() => setReload((c) => c + 1)}>Réessayer</Button>}
          />
        </div>
      )}

      {/* Skeleton */}
      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, i) => <CardSkeleton key={i} />)}
        </div>
      )}

      {/* Vide */}
      {!loading && !error && enrollments.length === 0 && (
        <EmptyState
          icon={ClipboardList}
          title="Aucune inscription"
          description="Vous n'êtes inscrit à aucune formation pour le moment. Explorez les sessions disponibles."
          action={
            <LinkButton to="/sessions">
              Voir les formations
              <ArrowRight className="size-4" aria-hidden="true" />
            </LinkButton>
          }
        />
      )}

      {/* Liste des inscriptions */}
      {!loading && enrollments.length > 0 && (
        <div className="space-y-3">
          {enrollments.map((enr) => (
            <EnrollmentRow
              key={enr.id}
              enrollment={enr}
              onCancel={() => setToCancel(enr)}
            />
          ))}
        </div>
      )}

      {/* Modal annulation */}
      <Modal
        open={!!toCancel}
        onClose={() => setToCancel(null)}
        title="Annuler l'inscription"
        description={`Êtes-vous sûr de vouloir annuler votre inscription à "${toCancel?.session_title}" ?`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setToCancel(null)} disabled={cancelling}>
              Garder l'inscription
            </Button>
            <Button variant="danger" onClick={handleCancel} disabled={cancelling}>
              {cancelling ? 'Annulation…' : 'Confirmer l\'annulation'}
            </Button>
          </>
        }
      />
    </div>
  )
}

function EnrollmentRow({ enrollment: enr, onCancel }) {
  const startDate = enr.session_starts_at ? new Date(enr.session_starts_at) : null
  const isPast    = startDate && startDate < new Date()
  const canCancel = enr.status !== 'rejected' && !isPast

  return (
    <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-4">
        {/* Icône statut */}
        <span className="mt-0.5 shrink-0">
          {STATUS_ICONS[enr.status]}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={`/sessions/${enr.session}`}
              className="font-semibold text-ink hover:text-brand-strong hover:underline"
            >
              {enr.session_title}
            </Link>
            <Badge variant={STATUS_VARIANTS[enr.status] || 'default'}>
              {STATUS_LABELS[enr.status] || enr.status_display}
            </Badge>
            {enr.session_type === 'training' && (
              <Badge variant="clay">Formation</Badge>
            )}
          </div>

          {startDate && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
              <CalendarDays className="size-3.5" aria-hidden="true" />
              {formatDateTime(enr.session_starts_at)}
              {enr.session_ends_at && ` → ${formatDateTime(enr.session_ends_at)}`}
              {isPast && <span className="text-slate-400">(passée)</span>}
            </p>
          )}

          {enr.message && (
            <p className="mt-1.5 text-xs italic text-slate-500">
              Votre message : "{enr.message}"
            </p>
          )}

          {enr.status === 'confirmed' && !isPast && (
            <p className="mt-1.5 text-xs font-medium text-sage">
              ✓ Votre place est confirmée. Rendez-vous à la session !
            </p>
          )}
          {enr.status === 'rejected' && (
            <p className="mt-1.5 text-xs text-clay">
              Votre demande a été refusée. Contactez l'administration pour plus d'informations.
            </p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <LinkButton to={`/sessions/${enr.session}`} variant="secondary" size="sm">
          Voir la session
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </LinkButton>
        {canCancel && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="text-clay hover:bg-clay/10"
          >
            <XCircle className="size-4" aria-hidden="true" />
            Annuler
          </Button>
        )}
      </div>
    </Card>
  )
}
