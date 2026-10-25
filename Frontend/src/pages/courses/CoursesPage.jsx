import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  BookOpen,
  FolderOpen,
  GraduationCap,
  Plus,
  RotateCcw,
  SearchX,
} from 'lucide-react'
import {
  deleteCourse,
  fetchCategories,
  fetchCourses,
  fetchMyCourses,
} from '../../api/courses'
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
  { value: '-enrolled_count', label: 'Most popular' },
  { value: 'type', label: 'Format' },
]

const EMPTY_RESULTS = { count: 0, next: null, previous: null, results: [] }

export default function CoursesPage() {
  useDocumentTitle('Course catalogue')

  const { user } = useAuth()
  const { addToast } = useToast()

  const [search, setSearch] = useState('')
  const [type, setType] = useState('')
  const [category, setCategory] = useState('')
  const [tags, setTags] = useState('')
  const [myCourses, setMyCourses] = useState(false)
  const [ordering, setOrdering] = useState('-created_at')
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebouncedValue(search)
  const debouncedTags = useDebouncedValue(tags)

  const [categories, setCategories] = useState([])
  const [categoriesError, setCategoriesError] = useState('')
  const [categoriesReload, setCategoriesReload] = useState(0)

  const [reload, setReload] = useState(0)

  const [courseToDelete, setCourseToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const controller = new AbortController()

    fetchCategories({ ordering: 'name', pageSize: 50 }, { signal: controller.signal })
      .then((payload) => {
        setCategories(Array.isArray(payload) ? payload : payload.results ?? [])
        setCategoriesError('')
      })
      .catch((requestError) => {
        if (isCanceled(requestError)) return
        setCategoriesError(
          normalizeApiError(requestError, 'Unable to load categories.').message,
        )
      })

    return () => controller.abort()
  }, [categoriesReload])

  const query = useMemo(
    () => ({
      search: debouncedSearch.trim(),
      type,
      category,
      tags: debouncedTags.trim(),
      ordering,
      page,
    }),
    [debouncedSearch, type, category, debouncedTags, ordering, page],
  )
  const requestKey = `${myCourses ? 'mine' : 'all'}:${JSON.stringify(query)}:${reload}`
  const [result, setResult] = useState({ key: null, data: EMPTY_RESULTS, error: null })

  useEffect(() => {
    const controller = new AbortController()
    const request = myCourses ? fetchMyCourses : fetchCourses

    request(query, { signal: controller.signal })
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
  }, [query, requestKey, myCourses])

  const loading = result.key !== requestKey
  const data = result.data
  const error = loading ? null : result.error

  const isStudent = user?.role === 'student'
  const hasFilters = Boolean(
    search.trim() ||
      type ||
      category ||
      tags.trim() ||
      myCourses ||
      ordering !== '-created_at',
  )
  const canCreate = canManageCourses(user?.role)
  const showInitialSkeleton = loading && data.results.length === 0
  const showEmpty = !loading && !error && data.results.length === 0

  function resetFilters() {
    setSearch('')
    setType('')
    setCategory('')
    setTags('')
    setMyCourses(false)
    setOrdering('-created_at')
    setPage(1)
  }

  function changePage(nextPage) {
    setPage(Math.max(1, nextPage))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleEnrollmentChange(courseId, changes) {
    if (myCourses) {
      setReload((current) => current + 1)
      return
    }

    setResult((current) => ({
      ...current,
      data: {
        ...current.data,
        results: current.data.results.map((course) =>
          course.id === courseId ? { ...course, ...changes } : course,
        ),
      },
    }))
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
            Search for a resource, filter by format, category or tag, and browse PDF, audio
            and video materials.
          </p>
        </div>

        {canCreate ? (
          <div className="flex flex-col gap-3 sm:flex-row">
            <LinkButton to="/categories" variant="secondary">
              <FolderOpen className="size-4" aria-hidden="true" />
              Categories
            </LinkButton>
            <LinkButton to="/courses/new">
              <Plus className="size-4" aria-hidden="true" />
              Add a course
            </LinkButton>
          </div>
        ) : null}
      </header>

      <Card className="bg-paper/90">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_1fr]">
          <Input
            label="Search"
            type="search"
            name="search"
            placeholder="Title, description or tag…"
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
            <option value="video">Video</option>
          </Select>

          <Select
            label="Category"
            name="category"
            value={category}
            onChange={(event) => {
              setCategory(event.target.value)
              setPage(1)
            }}
            hint={categoriesError ? 'Categories could not be loaded.' : undefined}
          >
            <option value="">All categories</option>
            {categories.map((item) => (
              <option key={item.id} value={item.slug}>
                {item.name}
              </option>
            ))}
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

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Input
            label="Tags"
            type="text"
            name="tags"
            placeholder="mathematics, beginner"
            value={tags}
            onChange={(event) => {
              setTags(event.target.value)
              setPage(1)
            }}
            hint="Separate several tags with commas. All tags must match."
          />

          {isStudent ? (
            <div className="space-y-1.5">
              <span className="block text-sm font-medium text-ink">Enrollment</span>
              <label className="flex h-10 cursor-pointer items-center justify-between gap-3 rounded-xl border border-line bg-paper px-3 text-sm font-medium text-ink-soft shadow-sm transition hover:border-slate-300">
                <span className="inline-flex items-center gap-2">
                  <GraduationCap className="size-4 text-brand-strong" aria-hidden="true" />
                  My courses
                </span>
                <input
                  type="checkbox"
                  checked={myCourses}
                  onChange={(event) => {
                    setMyCourses(event.target.checked)
                    setPage(1)
                  }}
                  className="size-4 accent-brand"
                />
              </label>
            </div>
          ) : null}
        </div>

        {hasFilters ? (
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              {myCourses ? 'Showing only the courses you are enrolled in.' : null}
            </p>
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
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button variant="secondary" onClick={() => setReload((current) => current + 1)}>
                  Try again
                </Button>
                {categoriesError ? (
                  <Button
                    variant="ghost"
                    onClick={() => setCategoriesReload((current) => current + 1)}
                  >
                    Retry categories
                  </Button>
                ) : null}
              </div>
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

      {showEmpty && myCourses ? (
        <EmptyState
          icon={GraduationCap}
          title="No enrolled courses yet"
          description="Join a course to find it here, along with your progress."
          action={
            <Button variant="secondary" onClick={() => setMyCourses(false)}>
              Browse the catalogue
            </Button>
          }
        />
      ) : null}

      {showEmpty && !myCourses && !hasFilters ? (
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

      {showEmpty && !myCourses && hasFilters ? (
        <EmptyState
          icon={SearchX}
          title="No courses match"
          description="Try another keyword, category or tag, or reset the filters."
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
              onEnrollmentChange={handleEnrollmentChange}
              showEnrollmentCount={canCreate}
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
          <Link
            to="/courses"
            className="font-medium text-brand-strong underline decoration-brand/40 underline-offset-4 hover:decoration-brand"
          >
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
