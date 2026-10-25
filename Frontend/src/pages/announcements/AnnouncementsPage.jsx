import { useEffect, useMemo, useState } from 'react'
import { Plus, RotateCcw, SearchX, AlertTriangle, Megaphone } from 'lucide-react'
import { fetchAnnouncements, deleteAnnouncement } from '../../api/announcements'
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
import { AnnouncementCard } from '../../components/announcements/AnnouncementCard'
import { ANNOUNCEMENT_CATEGORIES } from '../../lib/categories'

const EMPTY_RESULTS = { count: 0, next: null, previous: null, results: [] }

export default function AnnouncementsPage() {
  useDocumentTitle('Annonces')

  const { user } = useAuth()
  const { addToast } = useToast()

  const canCreate = user?.role === 'teacher' || user?.role === 'admin'

  const [search, setSearch]   = useState('')
  const [category, setCategory] = useState('')
  const [page, setPage]       = useState(1)
  const [reload, setReload]   = useState(0)
  const [toDelete, setToDelete] = useState(null)
  const [loading, setLoading] = useState(true)
  const [data, setData]       = useState(EMPTY_RESULTS)
  const [error, setError]     = useState(null)

  const debouncedSearch = useDebouncedValue(search)

  const query = useMemo(() => ({
    search: debouncedSearch.trim(),
    category,
    page,
  }), [debouncedSearch, category, page])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    fetchAnnouncements(query, { signal: controller.signal })
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
  const hasFilters = Boolean(search.trim() || category)
  const showSkeleton = loading && results.length === 0
  const showEmpty    = !loading && !error && results.length === 0

  async function confirmDelete(announcement) {
    try {
      await deleteAnnouncement(announcement.id)
      addToast({ type: 'success', message: `Annonce "${announcement.title}" supprimée.` })
      setToDelete(null)
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
            Communication
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Annonces
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
            Toutes les communications importantes de l'administration et des enseignants.
          </p>
        </div>
        {canCreate && (
          <LinkButton to="/announcements/new">
            <Plus className="size-4" aria-hidden="true" />
            Nouvelle annonce
          </LinkButton>
        )}
      </header>

      <Card className="bg-paper/90">
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="Rechercher"
            type="search"
            name="search"
            placeholder="Titre ou contenu…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          />
          <Select
            label="Catégorie"
            name="category"
            value={category}
            onChange={(e) => { setCategory(e.target.value); setPage(1) }}
          >
            <option value="">Toutes les catégories</option>
            {ANNOUNCEMENT_CATEGORIES.map((item) => (
              <option key={item.key} value={item.key}>{item.label}</option>
            ))}
          </Select>
        </div>
        {hasFilters && (
          <div className="mt-4 flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setSearch(''); setCategory(''); setPage(1) }}
            >
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
            title="Impossible de charger les annonces"
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
        <div className="grid gap-4 sm:grid-cols-2" aria-hidden="true">
          {Array.from({ length: 4 }, (_, i) => <CardSkeleton key={i} />)}
        </div>
      )}

      {showEmpty && !hasFilters && (
        <EmptyState
          icon={Megaphone}
          title="Aucune annonce pour le moment"
          description={
            canCreate
              ? 'Publiez la première annonce pour informer vos utilisateurs.'
              : "Aucune annonce n'est disponible pour le moment."
          }
          action={
            canCreate ? (
              <LinkButton to="/announcements/new">
                <Plus className="size-4" aria-hidden="true" />
                Nouvelle annonce
              </LinkButton>
            ) : undefined
          }
        />
      )}

      {showEmpty && hasFilters && (
        <EmptyState
          icon={SearchX}
          title="Aucun résultat"
          description="Essayez un autre mot-clé."
          action={
            <Button
              variant="secondary"
              onClick={() => { setSearch(''); setCategory(''); setPage(1) }}
            >
              Réinitialiser
            </Button>
          }
        />
      )}

      {results.length > 0 && (
        <div
          className={`grid gap-4 sm:grid-cols-2 ${loading ? 'opacity-60' : ''}`}
          aria-busy={loading}
        >
          {results.map((ann) => (
            <AnnouncementCard
              key={ann.id}
              announcement={ann}
              canEdit={
                user?.role === 'admin' ||
                (user?.role === 'teacher' && ann.author === user?.id)
              }
              onDelete={setToDelete}
            />
          ))}
        </div>
      )}

      {/* Modal suppression */}
      {toDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-t-4 border-line border-t-clay bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-ink">Supprimer l'annonce</h2>
            <p className="mt-2 text-sm text-slate-600">
              Êtes-vous sûr de vouloir supprimer "{toDelete.title}" ? Cette action est irréversible.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setToDelete(null)}>Annuler</Button>
              <Button variant="danger" onClick={() => confirmDelete(toDelete)}>Supprimer</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
