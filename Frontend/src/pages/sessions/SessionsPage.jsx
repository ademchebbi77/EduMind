import { useEffect, useMemo, useState } from 'react'
import { Plus, RotateCcw, SearchX, AlertTriangle, Sparkles, Video } from 'lucide-react'
import { fetchSessions, deleteSession, fetchRecommendedSessions, fetchEnrollmentForecast } from '../../api/sessions'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { isCanceled, normalizeApiError } from '../../lib/api'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { LinkButton, Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Input, Select } from '../../components/ui/Field'
import { CardSkeleton } from '../../components/ui/Skeleton'
import { SessionCard } from '../../components/sessions/SessionCard'
import { DeleteSessionModal } from '../../components/sessions/DeleteSessionModal'
import { ForecastPanel } from '../../components/sessions/ForecastPanel'

const EMPTY_RESULTS = { count: 0, next: null, previous: null, results: [] }

export default function SessionsPage() {
  useDocumentTitle('Sessions en ligne')

  const { user } = useAuth()
  const { addToast } = useToast()

  const canCreate = user?.role === 'teacher' || user?.role === 'admin'
  const isStudent = user?.role === 'student'

  const [search, setSearch]       = useState('')
  const [type, setType]           = useState('')
  const [statusFilter, setStatus] = useState('')
  const [page, setPage]           = useState(1)
  const [reload, setReload]       = useState(0)
  const [sessionToDelete, setSessionToDelete] = useState(null)

  // Résultat de la dernière requête ; « loading » tant qu'il ne correspond pas à la requête courante.
  const [result, setResult]   = useState({ key: null, data: EMPTY_RESULTS, error: null })

  const [recommended, setRecommended]           = useState([])
  const [recommendedFailed, setRecommendedFailed] = useState(false)

  const [forecast, setForecast] = useState([])
  const [forecastLoading, setForecastLoading] = useState(Boolean(canCreate))

  const debouncedSearch = useDebouncedValue(search)

  const query = useMemo(() => ({
    search: debouncedSearch.trim(),
    type,
    status: statusFilter,
    ordering: 'starts_at',
    page,
  }), [debouncedSearch, type, statusFilter, page])

  const requestKey = `${JSON.stringify(query)}:${reload}`

  useEffect(() => {
    const controller = new AbortController()
    fetchSessions(query, { signal: controller.signal })
      .then((res) => setResult({ key: requestKey, data: res, error: null }))
      .catch((err) => {
        if (isCanceled(err)) return
        setResult({ key: requestKey, data: EMPTY_RESULTS, error: normalizeApiError(err) })
      })
    return () => controller.abort()
  }, [query, requestKey])

  const loading = result.key !== requestKey
  const data    = result.data
  const error   = loading ? null : result.error

  useEffect(() => {
    if (!isStudent) return undefined
    const controller = new AbortController()
    fetchRecommendedSessions({ limit: 3 }, { signal: controller.signal })
      .then((items) => {
        setRecommended(items)
        setRecommendedFailed(false)
      })
      .catch((err) => {
        if (isCanceled(err)) return
        setRecommended([])
        setRecommendedFailed(true)
      })
    return () => controller.abort()
  }, [isStudent, reload])

  useEffect(() => {
    if (!canCreate) return undefined
    const controller = new AbortController()
    fetchEnrollmentForecast({ limit: 3 }, { signal: controller.signal })
      .then((items) => {
        setForecast(items)
        setForecastLoading(false)
      })
      .catch((err) => {
        if (isCanceled(err)) return
        setForecast([])
        setForecastLoading(false)
      })
    return () => controller.abort()
  }, [canCreate, reload])

  const results    = data.results ?? []
  const hasFilters = Boolean(search.trim() || type || statusFilter)
  const showSkeleton = loading && results.length === 0
  const showEmpty    = !loading && !error && results.length === 0

  function resetFilters() {
    setSearch(''); setType(''); setStatus(''); setPage(1)
  }

  async function confirmDelete(session) {
    try {
      await deleteSession(session.id)
      addToast({ type: 'success', message: `Session "${session.title}" supprimée.` })
      setSessionToDelete(null)
      setReload((c) => c + 1)
    } catch (err) {
      addToast({ type: 'error', message: normalizeApiError(err, 'Suppression échouée.').message })
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-5 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-strong">
            <span className="h-px w-7 bg-brand" aria-hidden="true" />
            Espace collaboratif
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Sessions en ligne
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
            Cours en ligne animés par les enseignants et formations organisées par l'administration.
          </p>
        </div>
        {canCreate && (
          <LinkButton to="/sessions/new">
            <Plus className="size-4" aria-hidden="true" />
            Nouvelle session
          </LinkButton>
        )}
      </header>

      {canCreate && (
        <ForecastPanel items={forecast} loading={forecastLoading} />
      )}

      {isStudent && recommended.length > 0 && (
        <section aria-labelledby="recommended-heading" className="space-y-4">
          <div className="flex items-start gap-3">
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand-strong ring-1 ring-inset ring-brand/15">
              <Sparkles className="size-4" aria-hidden="true" />
            </span>
            <div>
              <h2
                id="recommended-heading"
                className="font-display text-xl font-semibold tracking-tight text-ink"
              >
                Recommandé pour vous
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">
                Calculé à partir de vos inscriptions, de vos quiz et de vos demandes de formation.
              </p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {recommended.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                recommendationReason={session.recommendation_reason}
              />
            ))}
          </div>
        </section>
      )}

      {isStudent && recommendedFailed && (
        <p className="text-sm text-slate-500">
          Les recommandations sont momentanément indisponibles.
        </p>
      )}

      <Card className="bg-paper/90">
        <div className="grid gap-4 md:grid-cols-3">
          <Input
            label="Rechercher"
            type="search"
            name="search"
            placeholder="Titre ou description…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          />
          <Select
            label="Type"
            name="type"
            value={type}
            onChange={(e) => { setType(e.target.value); setPage(1) }}
          >
            <option value="">Tous les types</option>
            <option value="course">Cours en ligne</option>
            <option value="training">Formation</option>
          </Select>
          <Select
            label="Statut"
            name="status"
            value={statusFilter}
            onChange={(e) => { setStatus(e.target.value); setPage(1) }}
          >
            <option value="">Tous les statuts</option>
            <option value="scheduled">Planifiée</option>
            <option value="ongoing">En cours</option>
            <option value="ended">Terminée</option>
            <option value="cancelled">Annulée</option>
          </Select>
        </div>
        {hasFilters && (
          <div className="mt-4 flex justify-end">
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              <RotateCcw className="size-4" aria-hidden="true" />
              Réinitialiser
            </Button>
          </div>
        )}
      </Card>

      {error && !loading && (
        <div role="alert">
          <EmptyState
            icon={AlertTriangle}
            title="Impossible de charger les sessions"
            description={error.message}
            action={
              <Button variant="secondary" onClick={() => setReload((c) => c + 1)}>
                Réessayer
              </Button>
            }
          />
        </div>
      )}

      {showSkeleton && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => <CardSkeleton key={i} />)}
        </div>
      )}

      {showEmpty && !hasFilters && (
        <EmptyState
          icon={Video}
          title="Aucune session pour le moment"
          description={
            canCreate
              ? 'Créez votre première session en ligne ou formation.'
              : "Aucune session n'est disponible pour le moment."
          }
          action={
            canCreate ? (
              <LinkButton to="/sessions/new">
                <Plus className="size-4" aria-hidden="true" />
                Nouvelle session
              </LinkButton>
            ) : undefined
          }
        />
      )}

      {showEmpty && hasFilters && (
        <EmptyState
          icon={SearchX}
          title="Aucun résultat"
          description="Essayez d'autres critères de recherche."
          action={<Button variant="secondary" onClick={resetFilters}>Réinitialiser</Button>}
        />
      )}

      {results.length > 0 && (
        <div
          className={`grid gap-4 sm:grid-cols-2 xl:grid-cols-3 ${loading ? 'opacity-60' : ''}`}
          aria-busy={loading}
        >
          {results.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              canEdit={
                user?.role === 'admin' ||
                (user?.role === 'teacher' && session.created_by === user.id)
              }
              onDelete={setSessionToDelete}
            />
          ))}
        </div>
      )}

      <DeleteSessionModal
        session={sessionToDelete}
        onClose={() => setSessionToDelete(null)}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
