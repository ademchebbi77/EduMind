import { useEffect, useMemo, useState } from 'react'
import { Plus, RotateCcw, SearchX, AlertTriangle, Video } from 'lucide-react'
import { fetchSessions, deleteSession } from '../../api/sessions'
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

const EMPTY_RESULTS = { count: 0, next: null, previous: null, results: [] }

export default function SessionsPage() {
  useDocumentTitle('Sessions en ligne')

  const { user } = useAuth()
  const { addToast } = useToast()

  const canCreate = user?.role === 'teacher' || user?.role === 'admin'

  const [search, setSearch]       = useState('')
  const [type, setType]           = useState('')
  const [statusFilter, setStatus] = useState('')
  const [page, setPage]           = useState(1)
  const [reload, setReload]       = useState(0)
  const [sessionToDelete, setSessionToDelete] = useState(null)

  const [loading, setLoading] = useState(true)
  const [data, setData]       = useState(EMPTY_RESULTS)
  const [error, setError]     = useState(null)

  const debouncedSearch = useDebouncedValue(search)

  const query = useMemo(() => ({
    search: debouncedSearch.trim(),
    type,
    status: statusFilter,
    ordering: 'starts_at',
    page,
  }), [debouncedSearch, type, statusFilter, page])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    fetchSessions(query, { signal: controller.signal })
      .then((res) => {
        setData(res)
        setLoading(false)
      })
      .catch((err) => {
        if (isCanceled(err)) return
        setError(normalizeApiError(err))
        setData(EMPTY_RESULTS)
        setLoading(false)
      })
    return () => controller.abort()
  }, [query, reload])

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
