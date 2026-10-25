import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, BookOpen, Plus, RotateCcw, SearchX } from 'lucide-react'
import { fetchCourses, deleteCourse } from '../../api/courses'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { isCanceled, normalizeApiError } from '../../lib/api'
import { canEditCourse, canManageCourses } from '../../lib/roles'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { LinkButton } from '../../components/ui/Button'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Input, Select } from '../../components/ui/Field'
import { CardSkeleton } from '../../components/ui/Skeleton'
import { CourseCard } from '../../components/courses/CourseCard'
import { DeleteCourseModal } from '../../components/courses/DeleteCourseModal'
import { Pagination } from '../../components/courses/Pagination'

const ORDERING_OPTIONS = [
  { value: '-created_at', label: 'Newest first' },
  { value: 'created_at', label: 'Oldest first' },
  { value: 'title', label: 'Title (A → Z)' },
  { value: '-title', label: 'Title (Z → A)' },
  { value: '-updated_at', label: 'Recently updated' },
  { value: 'type', label: 'Format' },
]

const EMPTY_RESULTS = { count: 0, next: null, previous: null, results: [] }

export default function CoursesPage() {
  useDocumentTitle('Course catalogue')

  const { user } = useAuth()
  const { addToast } = useToast()

  const [search, setSearch] = useState('')
  const [type, setType] = useState('')
  const [ordering, setOrdering] = useState('-created_at')
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebouncedValue(search)

  const [reload, setReload] = useState(0)

  const [courseToDelete, setCourseToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const query = useMemo(
    () => ({
      search: debouncedSearch.trim(),
      type,
      ordering,
      page,
    }),
    [debouncedSearch, type, ordering, page],
  )
  const requestKey = `${JSON.stringify(query)}:${reload}`
  const [result, setResult] = useState({ key: null, data: EMPTY_RESULTS, error: null })

  useEffect(() => {
    const controller = new AbortController()

    fetchCourses(query, { signal: controller.signal })
      .then((payload) => setResult({ key: requestKey, data: payload, error: null }))
      .catch((requestError) => {
        if (isCanceled(requestError)) return
        setResult({
          key: requestKey,
          data: EMPTY_RESULTS,
          error: normalizeApiError(requestError, 'Unable to load courses.'),
        })
      })

    return () => controller.abort()
  }, [query, requestKey])

  const loading = result.key !== requestKey
  const data = result.data
  const error = loading ? null : result.error

  const hasFilters = Boolean(search.trim() || type || ordering !== '-created_at')
  const canCreate = canManageCourses(user?.role)
  const showInitialSkeleton = loading && data.results.length === 0
  const showEmpty = !loading && !error && data.results.length === 0

  function resetFilters() {
    setSearch('')
    setType('')
    setOrdering('-created_at')
    setPage(1)
  }

  function changePage(nextPage) {
    setPage(Math.max(1, nextPage))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function confirmDelete() {
    if (!courseToDelete) return
    setDeleting(true)
    try {
      await deleteCourse(courseToDelete.id)
      addToast({ type: 'success', message: `Course “${courseToDelete.title}” has been deleted.` })
      setCourseToDelete(null)
      if (data.results.length === 1 && page > 1) {
        setPage(page - 1)
      } else {
        setReload((current) => current + 1)
      }
    } catch (deleteError) {
      addToast({
        type: 'error',
        message: normalizeApiError(
          deleteError,
          'Course deletion failed.',
        ).message,
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
            Learning library
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Course catalogue
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
            Search for a resource, filter by format and browse PDF documents or audio
            materials.
          </p>
        </div>

        {canCreate ? (
          <LinkButton to="/courses/new">
            <Plus className="size-4" aria-hidden="true" />
            Add a course
          </LinkButton>
        ) : null}
      </header>

      <Card className="bg-paper/90">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr]">
          <Input
            label="Search"
            type="search"
            name="search"
            placeholder="Title or description…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
          />

          <Select
            label="Format"
            name="type"
            value={type}
            onChange={(event) => {
              setType(event.target.value)
              setPage(1)
            }}
          >
            <option value="">All formats</option>
            <option value="pdf">PDF</option>
            <option value="audio">Audio</option>
          </Select>

          <Select
            label="Sort by"
            name="ordering"
            value={ordering}
            onChange={(event) => {
              setOrdering(event.target.value)
              setPage(1)
            }}
          >
            {ORDERING_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>

        {hasFilters ? (
          <div className="mt-4 flex justify-end">
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              <RotateCcw className="size-4" aria-hidden="true" />
              Reset filters
            </Button>
          </div>
        ) : null}
      </Card>

      {error ? (
        <div role="alert">
          <EmptyState
            icon={AlertTriangle}
            title="Unable to load the catalogue"
            description={error.message}
            action={
              <Button variant="secondary" onClick={() => setReload((current) => current + 1)}>
                Try again
              </Button>
            }
          />
        </div>
      ) : null}

      {showInitialSkeleton ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
          {Array.from({ length: 6 }, (_, index) => (
            <CardSkeleton key={index} />
          ))}
        </div>
      ) : null}

      {showEmpty && !hasFilters ? (
        canCreate ? (
          <EmptyState
            icon={BookOpen}
            title="No courses yet"
            description="Publish your first learning resource to make it available to your students."
            action={
              <LinkButton to="/courses/new">
                <Plus className="size-4" aria-hidden="true" />
                Publish a course
              </LinkButton>
            }
          />
        ) : (
          <EmptyState
            icon={BookOpen}
            title="The catalogue is still empty"
            description="Your teachers have not published any resources yet. Check back a little later."
          />
        )
      ) : null}

      {showEmpty && hasFilters ? (
        <EmptyState
          icon={SearchX}
          title="No courses match"
          description="Try another keyword, another format, or reset the filters."
          action={
            <Button variant="secondary" onClick={resetFilters}>
              Reset filters
            </Button>
          }
        />
      ) : null}

      {data.results.length > 0 ? (
        <div
          className={`grid gap-4 sm:grid-cols-2 xl:grid-cols-3 ${loading ? 'opacity-60' : ''}`}
          aria-busy={loading}
        >
          {data.results.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              canEdit={canEditCourse(user, course)}
              onDelete={setCourseToDelete}
            />
          ))}
        </div>
      ) : null}

      {data.results.length > 0 && (data.next || data.previous) ? (
        <Pagination
          count={data.count}
          page={page}
          hasNext={Boolean(data.next)}
          hasPrevious={Boolean(data.previous)}
          disabled={loading}
          onPageChange={changePage}
          singular="course"
          plural="courses"
          ariaLabel="Course pagination"
        />
      ) : null}

      {data.count > 0 && !data.next && !data.previous ? (
        <p className="text-center text-xs text-slate-600">
          {data.count} courses shown ·{' '}
          <Link to="/courses" className="font-medium text-brand-strong underline decoration-brand/40 underline-offset-4 hover:decoration-brand">
            refresh
          </Link>
        </p>
      ) : null}

      <DeleteCourseModal
        course={courseToDelete}
        open={Boolean(courseToDelete)}
        deleting={deleting}
        onClose={() => setCourseToDelete(null)}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
