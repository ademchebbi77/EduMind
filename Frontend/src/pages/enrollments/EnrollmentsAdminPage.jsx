import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle, CalendarDays, CheckCircle2, ClipboardList,
  RotateCcw, SearchX, XCircle,
} from 'lucide-react'
import { fetchEnrollments, updateEnrollmentStatus } from '../../api/sessions'
import { useToast } from '../../context/ToastContext'
import { isCanceled, normalizeApiError } from '../../lib/api'
import { formatDateTime } from '../../lib/format'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Input, Select } from '../../components/ui/Field'
import { CardSkeleton } from '../../components/ui/Skeleton'

const STATUS_VARIANTS = { pending: 'default', confirmed: 'sage', rejected: 'clay' }
const STATUS_LABELS   = { pending: 'En attente', confirmed: 'Confirmée', rejected: 'Rejetée' }

export default function EnrollmentsAdminPage() {
  useDocumentTitle('Gestion des inscriptions')

  const { addToast } = useToast()

  const [loading, setLoading]         = useState(true)
  const [enrollments, setEnrollments] = useState([])
  const [error, setError]             = useState(null)
  const [reload, setReload]           = useState(0)
  const [search, setSearch]           = useState('')
  const [statusFilter, setStatus]     = useState('')
  const [updatingId, setUpdatingId]   = useState(null)

  const debouncedSearch = useDebouncedValue(search)

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

  async function handleStatus(enrollmentId, newStatus) {
    setUpdatingId(enrollmentId)
    try {
      await updateEnrollmentStatus(enrollmentId, newStatus)
      setEnrollments((prev) =>
        prev.map((e) => e.id === enrollmentId ? { ...e, status: newStatus } : e)
      )
      addToast({
        type: 'success',
        message: newStatus === 'confirmed' ? 'Inscription confirmée.' : 'Inscription rejetée.',
      })
    } catch (err) {
      addToast({ type: 'error', message: normalizeApiError(err, 'Mise à jour échouée.').message })
    } finally {
      setUpdatingId(null)
    }
  }

  // Filtrage local
  const filtered = enrollments.filter((e) => {
    const matchSearch = !debouncedSearch ||
      e.student_name?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      e.student_email?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      e.session_title?.toLowerCase().includes(debouncedSearch.toLowerCase())
    const matchStatus = !statusFilter || e.status === statusFilter
    return matchSearch && matchStatus
  })

  const pendingCount   = enrollments.filter((e) => e.status === 'pending').length
  const confirmedCount = enrollments.filter((e) => e.status === 'confirmed').length
  const rejectedCount  = enrollments.filter((e) => e.status === 'rejected').length

  return (
    <div className="space-y-6">
      <header className="border-b border-line pb-6">
        <p className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-strong">
          <span className="h-px w-7 bg-brand" aria-hidden="true" />
          Administration
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          Gestion des inscriptions
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Confirmez ou rejetez les demandes d'inscription aux formations.
        </p>
      </header>

      {/* Stats */}
      {!loading && enrollments.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'En attente', count: pendingCount,   color: 'text-slate-600', bg: 'bg-slate-100', urgent: pendingCount > 0 },
            { label: 'Confirmées', count: confirmedCount, color: 'text-sage',      bg: 'bg-sage/10' },
            { label: 'Rejetées',   count: rejectedCount,  color: 'text-clay',      bg: 'bg-clay/10' },
          ].map(({ label, count, color, urgent }) => (
            <Card key={label} className={`text-center py-4 ${urgent ? 'ring-2 ring-brand/30' : ''}`}>
              <p className={`text-2xl font-bold ${color}`}>{count}</p>
              <p className="text-xs text-slate-500 mt-1">{label}</p>
              {urgent && <p className="text-[10px] text-brand-strong mt-0.5">Action requise</p>}
            </Card>
          ))}
        </div>
      )}

      {/* Filtres */}
      <Card className="bg-paper/90">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Rechercher"
            type="search"
            name="search"
            placeholder="Étudiant, email ou formation…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select
            label="Statut"
            name="status"
            value={statusFilter}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Tous les statuts</option>
            <option value="pending">En attente</option>
            <option value="confirmed">Confirmées</option>
            <option value="rejected">Rejetées</option>
          </Select>
        </div>
        {(search || statusFilter) && (
          <div className="mt-4 flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setStatus('') }}>
              <RotateCcw className="size-4" aria-hidden="true" />
              Réinitialiser
            </Button>
          </div>
        )}
      </Card>

      {/* Erreur */}
      {error && !loading && (
        <div role="alert">
          <EmptyState
            icon={AlertTriangle}
            title="Impossible de charger les inscriptions"
            description={error.message}
            action={<Button variant="secondary" onClick={() => setReload((c) => c + 1)}>Réessayer</Button>}
          />
        </div>
      )}

      {/* Skeleton */}
      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, i) => <CardSkeleton key={i} />)}
        </div>
      )}

      {/* Vide */}
      {!loading && !error && enrollments.length === 0 && (
        <EmptyState
          icon={ClipboardList}
          title="Aucune inscription"
          description="Aucun étudiant ne s'est encore inscrit à une formation."
        />
      )}

      {!loading && !error && enrollments.length > 0 && filtered.length === 0 && (
        <EmptyState
          icon={SearchX}
          title="Aucun résultat"
          description="Essayez d'autres critères de recherche."
          action={<Button variant="secondary" onClick={() => { setSearch(''); setStatus('') }}>Réinitialiser</Button>}
        />
      )}

      {/* Tableau des inscriptions */}
      {!loading && filtered.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-mist/50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3">Étudiant</th>
                  <th className="px-4 py-3">Formation</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filtered.map((enr) => (
                  <AdminEnrollmentRow
                    key={enr.id}
                    enrollment={enr}
                    onStatus={handleStatus}
                    isUpdating={updatingId === enr.id}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}

function AdminEnrollmentRow({ enrollment: enr, onStatus, isUpdating }) {
  return (
    <tr className={`transition hover:bg-mist/30 ${isUpdating ? 'opacity-50' : ''}`}>
      <td className="px-4 py-3">
        <p className="font-medium text-ink">{enr.student_name}</p>
        <p className="text-xs text-slate-500">{enr.student_email}</p>
      </td>
      <td className="px-4 py-3">
        <Link
          to={`/sessions/${enr.session}`}
          className="font-medium text-brand-strong hover:underline"
        >
          {enr.session_title}
        </Link>
        {enr.message && (
          <p className="mt-0.5 text-xs italic text-slate-500 line-clamp-1">
            "{enr.message}"
          </p>
        )}
      </td>
      <td className="px-4 py-3">
        {enr.session_starts_at ? (
          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
            <CalendarDays className="size-3.5" aria-hidden="true" />
            {formatDateTime(enr.session_starts_at)}
          </span>
        ) : '—'}
      </td>
      <td className="px-4 py-3">
        <Badge variant={STATUS_VARIANTS[enr.status] || 'default'}>
          {STATUS_LABELS[enr.status] || enr.status_display}
        </Badge>
      </td>
      <td className="px-4 py-3">
        {enr.status === 'pending' ? (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => onStatus(enr.id, 'confirmed')}
              disabled={isUpdating}
            >
              <CheckCircle2 className="size-3.5" aria-hidden="true" />
              Confirmer
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-clay hover:bg-clay/10"
              onClick={() => onStatus(enr.id, 'rejected')}
              disabled={isUpdating}
            >
              <XCircle className="size-3.5" aria-hidden="true" />
              Rejeter
            </Button>
          </div>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        )}
      </td>
    </tr>
  )
}
