import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  FolderOpen,
  Pencil,
  Plus,
  RotateCcw,
  SearchX,
  Trash2,
} from 'lucide-react'
import {
  createCategory,
  deleteCategory,
  fetchCategories,
  updateCategory,
} from '../../api/courses'
import { useToast } from '../../context/ToastContext'
import { firstFieldError, isCanceled, normalizeApiError } from '../../lib/api'
import { formatDate } from '../../lib/format'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Input, Textarea } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { CardSkeleton } from '../../components/ui/Skeleton'
import { Pagination } from '../../components/courses/Pagination'

const EMPTY_RESULTS = { count: 0, next: null, previous: null, results: [] }
const EMPTY_VALUES = { name: '', description: '' }

export default function CategoriesPage() {
  useDocumentTitle('Course categories')

  const { addToast } = useToast()

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const [page, setPage] = useState(1)
  const [reload, setReload] = useState(0)

  const requestKey = `${debouncedSearch}:${page}:${reload}`
  const [result, setResult] = useState({ key: null, data: EMPTY_RESULTS, error: null })

  const [editor, setEditor] = useState({ open: false, category: null })
  const [values, setValues] = useState(EMPTY_VALUES)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  const [toDelete, setToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const controller = new AbortController()

    fetchCategories(
      { search: debouncedSearch.trim(), ordering: 'name', page },
      { signal: controller.signal },
    )
      .then((payload) => setResult({ key: requestKey, data: payload, error: null }))
      .catch((requestError) => {
        if (isCanceled(requestError)) return
        setResult({
          key: requestKey,
          data: EMPTY_RESULTS,
          error: normalizeApiError(requestError, 'Unable to load categories.'),
        })
      })

    return () => controller.abort()
  }, [debouncedSearch, page, requestKey])

  const loading = result.key !== requestKey
  const data = result.data
  const error = loading ? null : result.error
  const categories = data.results ?? []
  const hasSearch = Boolean(search.trim())
  const showSkeleton = loading && categories.length === 0

  function openCreate() {
    setValues(EMPTY_VALUES)
    setErrors({})
    setEditor({ open: true, category: null })
  }

  function openEdit(category) {
    setValues({ name: category.name, description: category.description || '' })
    setErrors({})
    setEditor({ open: true, category })
  }

  function closeEditor() {
    if (!saving) setEditor({ open: false, category: null })
  }

  async function handleSubmit(event) {
    event.preventDefault()

    const name = values.name.trim()
    const description = values.description.trim()

    if (!name) {
      setErrors({ name: 'Enter a category name.' })
      return
    }
    if (name.length > 100) {
      setErrors({ name: 'The name cannot exceed 100 characters.' })
      return
    }

    setSaving(true)
    setErrors({})
    try {
      const payload = { name, description }
      if (editor.category) {
        await updateCategory(editor.category.id, payload)
      } else {
        await createCategory(payload)
      }
      addToast({
        type: 'success',
        message: editor.category
          ? `Category “${name}” has been updated.`
          : `Category “${name}” has been created.`,
      })
      setEditor({ open: false, category: null })
      setReload((current) => current + 1)
    } catch (requestError) {
      const apiError = normalizeApiError(requestError, 'Saving the category failed.')
      setErrors({
        name: firstFieldError(apiError.fields, 'name'),
        description: firstFieldError(apiError.fields, 'description'),
        form:
          firstFieldError(apiError.fields, 'non_field_errors') ||
          (firstFieldError(apiError.fields, 'name') ? null : apiError.message),
      })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!toDelete) return
    setDeleting(true)
    try {
      await deleteCategory(toDelete.id)
      addToast({ type: 'success', message: `Category “${toDelete.name}” has been deleted.` })
      setToDelete(null)
      if (categories.length === 1 && page > 1) {
        setPage(page - 1)
      } else {
        setReload((current) => current + 1)
      }
    } catch (requestError) {
      addToast({
        type: 'error',
        message: normalizeApiError(requestError, 'Unable to delete this category.').message,
      })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-5 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-strong">
            <span className="h-px w-7 bg-brand" aria-hidden="true" />
            Catalogue structure
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Course categories
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
            Organise courses into clear categories so students can find the right material
            faster.
          </p>
        </div>

        <Button onClick={openCreate}>
          <Plus className="size-4" aria-hidden="true" />
          New category
        </Button>
      </header>

      <Card className="bg-paper/90">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Input
              label="Search"
              type="search"
              name="search"
              placeholder="Category name or description…"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(1)
              }}
            />
          </div>
          {hasSearch ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch('')
                setPage(1)
              }}
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              Reset
            </Button>
          ) : null}
        </div>
      </Card>

      {error ? (
        <div role="alert">
          <EmptyState
            icon={AlertTriangle}
            title="Unable to load categories"
            description={error.message}
            action={
              <Button variant="secondary" onClick={() => setReload((current) => current + 1)}>
                Try again
              </Button>
            }
          />
        </div>
      ) : null}

      {showSkeleton ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
          {Array.from({ length: 6 }, (_, index) => (
            <CardSkeleton key={index} />
          ))}
        </div>
      ) : null}

      {!loading && !error && categories.length === 0 ? (
        hasSearch ? (
          <EmptyState
            icon={SearchX}
            title="No categories match"
            description="Try another keyword or create a new category."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setSearch('')
                  setPage(1)
                }}
              >
                Reset search
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={FolderOpen}
            title="No categories yet"
            description="Create your first category to organise the course catalogue."
            action={
              <Button onClick={openCreate}>
                <Plus className="size-4" aria-hidden="true" />
                Create a category
              </Button>
            }
          />
        )
      ) : null}

      {categories.length > 0 ? (
        <div
          className={`grid gap-4 sm:grid-cols-2 xl:grid-cols-3 ${loading ? 'opacity-60' : ''}`}
          aria-busy={loading}
        >
          {categories.map((category) => (
            <Card key={category.id} className="flex flex-col">
              <div className="flex items-start justify-between gap-3">
                <span className="inline-flex size-10 items-center justify-center rounded-xl bg-brand/10 text-brand-strong ring-1 ring-inset ring-brand/15">
                  <FolderOpen className="size-5" aria-hidden="true" />
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openEdit(category)}
                    aria-label={`Edit ${category.name}`}
                    title="Edit"
                    className="rounded-lg p-2 text-slate-500 transition hover:bg-mist hover:text-brand-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    <Pencil className="size-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setToDelete(category)}
                    aria-label={`Delete ${category.name}`}
                    title="Delete"
                    className="rounded-lg p-2 text-slate-500 transition hover:bg-clay/10 hover:text-clay focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <h2 className="mt-4 text-lg font-semibold text-ink">{category.name}</h2>
              <p className="mt-0.5 font-mono text-xs text-slate-500">/{category.slug}</p>
              <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-slate-600">
                {category.description || 'No description provided.'}
              </p>
              <p className="mt-auto pt-4 text-xs text-slate-500">
                Created on {formatDate(category.created_at)}
              </p>
            </Card>
          ))}
        </div>
      ) : null}

      {categories.length > 0 && (data.next || data.previous) ? (
        <Pagination
          count={data.count}
          page={page}
          hasNext={Boolean(data.next)}
          hasPrevious={Boolean(data.previous)}
          disabled={loading}
          onPageChange={(nextPage) => {
            setPage(Math.max(1, nextPage))
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }}
          singular="category"
          plural="categories"
          ariaLabel="Category pagination"
        />
      ) : null}

      <Modal
        open={editor.open}
        onClose={closeEditor}
        title={editor.category ? 'Edit category' : 'New category'}
        description={
          editor.category
            ? 'Update the category name or description. Changes apply immediately.'
            : 'Create a category to group related courses in the catalogue.'
        }
        footer={
          <>
            <Button variant="secondary" onClick={closeEditor} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="category-form" loading={saving}>
              {editor.category ? 'Save changes' : 'Create category'}
            </Button>
          </>
        }
      >
        <form id="category-form" onSubmit={handleSubmit} noValidate className="space-y-4">
          {errors.form ? (
            <div
              role="alert"
              className="rounded-xl border border-clay/25 bg-clay/[0.06] px-4 py-3 text-sm font-medium text-clay"
            >
              {errors.form}
            </div>
          ) : null}

          <Input
            label="Name"
            name="name"
            value={values.name}
            onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))}
            error={errors.name}
            hint="A short, descriptive name."
            maxLength={100}
            disabled={saving}
            data-autofocus
            required
          />

          <Textarea
            label="Description"
            name="description"
            rows={4}
            value={values.description}
            onChange={(event) =>
              setValues((current) => ({ ...current, description: event.target.value }))
            }
            error={errors.description}
            hint="Optional. Explain which courses belong here."
            disabled={saving}
          />

          {editor.category ? (
            <p className="text-xs text-slate-500">
              Slug: <span className="font-mono text-ink-soft">/{editor.category.slug}</span>
            </p>
          ) : null}
        </form>
      </Modal>

      <Modal
        open={Boolean(toDelete)}
        onClose={() => {
          if (!deleting) setToDelete(null)
        }}
        title="Delete this category?"
        description={
          toDelete
            ? `“${toDelete.name}” will be removed. Courses in this category will stay published but become uncategorised.`
            : ''
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setToDelete(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete} loading={deleting}>
              <Trash2 className="size-4" aria-hidden="true" />
              Delete category
            </Button>
          </>
        }
      />
    </div>
  )
}
