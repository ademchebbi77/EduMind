import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle, BookText, ExternalLink, FileText, Link2, Lock, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react'
import {
  deleteResource,
  deleteSummary,
  fetchResources,
  fetchSummaries,
  generateSummary,
} from '../../api/summaries'
import { useToast } from '../../context/ToastContext'
import { cx } from '../../lib/cx'
import { firstFieldError, isCanceled, normalizeApiError } from '../../lib/api'
import { useCourseOptions } from '../../hooks/useCourseOptions'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { Badge } from '../../components/ui/Badge'
import { Button, LinkButton } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Input, Select } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { CardSkeleton } from '../../components/ui/Skeleton'
import { Pagination } from '../../components/courses/Pagination'
import { ConfirmDeleteModal } from '../../components/summaries/ConfirmDeleteModal'

const TABS = {
  summaries: { label: 'Summaries', icon: BookText, fetch: fetchSummaries, remove: deleteSummary, singular: 'summary', plural: 'summaries' },
  resources: { label: 'Resources', icon: Link2, fetch: fetchResources, remove: deleteResource, singular: 'resource', plural: 'resources' },
}
const EMPTY = { count: 0, next: null, previous: null, results: [] }

function SourceBadges({ item }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {item.source === 'ai' ? (
        <Badge variant="brand">
          <Sparkles className="size-3" aria-hidden="true" />
          AI
        </Badge>
      ) : null}
      {item.is_shared ? null : (
        <Badge variant="neutral">
          <Lock className="size-3" aria-hidden="true" />
          Private note
        </Badge>
      )}
    </div>
  )
}

function SummaryCard({ item, onDelete }) {
  return (
    <Card as="article" className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">{item.course_title}</p>
        <SourceBadges item={item} />
      </div>
      <h2 className="text-lg font-semibold text-ink">
        <Link to={`/summaries/${item.id}`} className="hover:text-brand-strong">
          {item.title}
        </Link>
      </h2>
      <p className="line-clamp-3 text-sm text-slate-600">{item.content.replace(/^## |^- /gm, '')}</p>
      <p className="text-xs text-slate-500">
        {item.key_concepts.length} key concept{item.key_concepts.length === 1 ? '' : 's'} · by {item.author_name}
      </p>
      <div className="mt-auto flex flex-wrap gap-2 pt-2">
        <LinkButton to={`/summaries/${item.id}`} size="sm">
          Open
        </LinkButton>
        {item.can_edit ? (
          <>
            <LinkButton to={`/summaries/${item.id}/edit`} size="sm" variant="secondary" aria-label={`Edit ${item.title}`}>
              <Pencil className="size-4" aria-hidden="true" />
            </LinkButton>
            <Button size="sm" variant="ghost" onClick={() => onDelete(item)} aria-label={`Delete ${item.title}`}>
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          </>
        ) : null}
      </div>
    </Card>
  )
}

function ResourceCard({ item, onDelete }) {
  const href = item.kind === 'link' ? item.url : item.file_url
  const Icon = item.kind === 'link' ? Link2 : FileText
  return (
    <Card as="article" className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">{item.course_title}</p>
        <SourceBadges item={item} />
      </div>
      <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
        <Icon className="size-4 shrink-0 text-brand" aria-hidden="true" />
        {item.title}
      </h2>
      {item.description ? <p className="line-clamp-3 text-sm text-slate-600">{item.description}</p> : null}
      <p className="text-xs text-slate-500">
        {item.kind === 'link' ? 'Web link' : item.file_name} · by {item.author_name}
      </p>
      <div className="mt-auto flex flex-wrap gap-2 pt-2">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center gap-2 rounded-xl bg-ink px-3 text-sm font-semibold text-paper hover:bg-ink-soft"
        >
          <ExternalLink className="size-4" aria-hidden="true" />
          Open
        </a>
        {item.can_edit ? (
          <>
            <LinkButton to={`/resources/${item.id}/edit`} size="sm" variant="secondary" aria-label={`Edit ${item.title}`}>
              <Pencil className="size-4" aria-hidden="true" />
            </LinkButton>
            <Button size="sm" variant="ghost" onClick={() => onDelete(item)} aria-label={`Delete ${item.title}`}>
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          </>
        ) : null}
      </div>
    </Card>
  )
}

/** Pick a course, then Gemini writes the summary and its key concepts. */
function GenerateModal({ open, courses, onClose }) {
  const navigate = useNavigate()
  const [course, setCourse] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function generate() {
    setBusy(true)
    setError('')
    try {
      const summary = await generateSummary(course)
      navigate(`/summaries/${summary.id}`)
    } catch (requestError) {
      const normalized = normalizeApiError(requestError, 'The summary could not be generated.')
      setError(firstFieldError(normalized.fields, 'course') || normalized.message)
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title="Generate a summary with AI"
      description="Gemini reads the whole course (PDF or transcript) and writes a structured summary with its key concepts. You can edit it afterwards."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="accent" onClick={generate} disabled={!course} loading={busy}>
            <Sparkles className="size-4" aria-hidden="true" />
            {busy ? 'Generating… (up to a minute)' : 'Generate'}
          </Button>
        </>
      }
    >
      <Select label="Course" required value={course} onChange={(event) => setCourse(event.target.value)} error={error || undefined} data-autofocus>
        <option value="">Choose a course</option>
        {courses.map((option) => (
          <option key={option.id} value={String(option.id)}>
            {option.title}
          </option>
        ))}
      </Select>
    </Modal>
  )
}

export default function SummariesPage() {
  useDocumentTitle('Summaries & resources')
  const { addToast } = useToast()
  const { courses } = useCourseOptions()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') === 'resources' ? 'resources' : 'summaries'
  const config = TABS[tab]

  const [search, setSearch] = useState('')
  const [course, setCourse] = useState(searchParams.get('course') || '')
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebouncedValue(search)
  const [reload, setReload] = useState(0)
  const [result, setResult] = useState({ key: null, data: EMPTY, error: null })
  const [toDelete, setToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [generating, setGenerating] = useState(false)

  const query = useMemo(() => ({ search: debouncedSearch.trim(), course, page }), [debouncedSearch, course, page])
  const requestKey = `${tab}:${JSON.stringify(query)}:${reload}`

  useEffect(() => {
    const controller = new AbortController()
    config
      .fetch(query, { signal: controller.signal })
      .then((data) => setResult({ key: requestKey, data, error: null }))
      .catch((requestError) => {
        if (isCanceled(requestError)) return
        setResult({ key: requestKey, data: EMPTY, error: normalizeApiError(requestError, 'Unable to load this list.') })
      })
    return () => controller.abort()
  }, [config, query, requestKey])

  const loading = result.key !== requestKey
  const { data, error } = result

  function changeTab(name) {
    setPage(1)
    setSearchParams(name === 'resources' ? { tab: 'resources' } : {}, { replace: true })
  }

  async function confirmDelete() {
    setDeleting(true)
    try {
      await config.remove(toDelete.id)
      addToast({ type: 'success', message: `“${toDelete.title}” has been deleted.` })
      setToDelete(null)
      setReload((value) => value + 1)
    } catch (deleteError) {
      addToast({ type: 'error', message: normalizeApiError(deleteError, 'Deletion failed.').message })
    } finally {
      setDeleting(false)
    }
  }

  const ItemCard = tab === 'summaries' ? SummaryCard : ResourceCard

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-5 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-strong">
            <span className="h-px w-7 bg-brand" aria-hidden="true" />
            Revise smarter
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Summaries &amp; resources</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
            Course summaries with their key concepts, an illustration, an audio version and a course assistant, plus useful links and files.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="accent" onClick={() => setGenerating(true)}>
            <Sparkles className="size-4" aria-hidden="true" />
            Generate with AI
          </Button>
          <LinkButton to="/summaries/new">
            <Plus className="size-4" aria-hidden="true" />
            New summary
          </LinkButton>
          <LinkButton to="/resources/new" variant="secondary">
            <Plus className="size-4" aria-hidden="true" />
            New resource
          </LinkButton>
        </div>
      </header>

      <div role="tablist" aria-label="Content type" className="inline-flex rounded-xl border border-line bg-paper p-1 shadow-sm">
        {Object.entries(TABS).map(([name, item]) => {
          const Icon = item.icon
          return (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={name === tab}
              onClick={() => changeTab(name)}
              className={cx(
                'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition',
                name === tab ? 'bg-ink text-paper shadow-sm' : 'text-ink-soft hover:bg-mist',
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {item.label}
            </button>
          )
        })}
      </div>

      <div className="grid gap-4 rounded-2xl border border-line bg-paper/90 p-5 shadow-sm md:grid-cols-2">
        <Input
          label="Search"
          type="search"
          placeholder="Title, text or course…"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setPage(1)
          }}
        />
        <Select
          label="Course"
          value={course}
          onChange={(event) => {
            setCourse(event.target.value)
            setPage(1)
          }}
        >
          <option value="">All courses</option>
          {courses.map((option) => (
            <option key={option.id} value={String(option.id)}>
              {option.title}
            </option>
          ))}
        </Select>
      </div>

      <div role="tabpanel" aria-label={config.label} className="space-y-6">
        {error ? (
          <EmptyState
            icon={AlertTriangle}
            title={`Unable to load the ${config.plural}`}
            description={error.message}
            action={<Button variant="secondary" onClick={() => setReload((value) => value + 1)}>Try again</Button>}
          />
        ) : null}

        {loading && !data.results.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
            {Array.from({ length: 3 }, (_, index) => (
              <CardSkeleton key={index} />
            ))}
          </div>
        ) : null}

        {!loading && !error && !data.results.length ? (
          <EmptyState
            icon={config.icon}
            title={`No ${config.plural} yet`}
            description={
              tab === 'summaries'
                ? 'Write a summary yourself, or let the AI generate one from a course.'
                : 'Share a useful web link or a file for one of the courses.'
            }
          />
        ) : null}

        {data.results.length ? (
          <div className={cx('grid gap-4 sm:grid-cols-2 xl:grid-cols-3', loading && 'opacity-60')} aria-busy={loading}>
            {data.results.map((item) => (
              <ItemCard key={item.id} item={item} onDelete={setToDelete} />
            ))}
          </div>
        ) : null}

        {data.next || data.previous ? (
          <Pagination
            count={data.count}
            page={page}
            hasNext={Boolean(data.next)}
            hasPrevious={Boolean(data.previous)}
            disabled={loading}
            onPageChange={setPage}
            singular={config.singular}
            plural={config.plural}
            ariaLabel={`${config.label} pagination`}
          />
        ) : null}
      </div>

      <ConfirmDeleteModal
        open={Boolean(toDelete)}
        title={`Delete this ${config.singular}?`}
        description={toDelete ? `“${toDelete.title}” will be permanently deleted.` : undefined}
        deleting={deleting}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
      />
      <GenerateModal open={generating} courses={courses} onClose={() => setGenerating(false)} />
    </div>
  )
}
