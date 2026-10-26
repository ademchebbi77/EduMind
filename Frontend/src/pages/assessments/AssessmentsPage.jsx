import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, ClipboardList, ListChecks, PenLine, Plus, RotateCcw, SearchX, Sparkles } from 'lucide-react'
import { deleteExercise, deleteQuiz, fetchExercises, fetchQuizzes } from '../../api/assessments'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { isCanceled, normalizeApiError } from '../../lib/api'
import { canManageCourses } from '../../lib/roles'
import { cx } from '../../lib/cx'
import { DIFFICULTIES, canManageAssessment } from '../../lib/assessments'
import { useCourseOptions } from '../../hooks/useCourseOptions'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { Button, LinkButton } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Input, Select } from '../../components/ui/Field'
import { CardSkeleton } from '../../components/ui/Skeleton'
import { Pagination } from '../../components/courses/Pagination'
import { AssessmentCard } from '../../components/assessments/AssessmentCard'
import { DeleteAssessmentModal } from '../../components/assessments/DeleteAssessmentModal'

const ORDERING_OPTIONS = [
  { value: '-created_at', label: 'Newest first' },
  { value: 'created_at', label: 'Oldest first' },
  { value: 'title', label: 'Title (A → Z)' },
  { value: '-title', label: 'Title (Z → A)' },
  { value: 'difficulty_rank', label: 'Easiest first' },
  { value: '-difficulty_rank', label: 'Hardest first' },
  { value: '-updated_at', label: 'Recently updated' },
]

const TABS = {
  quizzes: {
    label: 'Quizzes',
    kind: 'quiz',
    icon: ListChecks,
    remove: deleteQuiz,
    singular: 'quiz',
    plural: 'quizzes',
    newPath: '/quizzes/new',
  },
  exercises: {
    label: 'Exercises',
    kind: 'exercise',
    icon: PenLine,
    remove: deleteExercise,
    singular: 'exercise',
    plural: 'exercises',
    newPath: '/exercises/new',
  },
}

const EMPTY_RESULTS = { count: 0, next: null, previous: null, results: [] }

function useAssessmentList(fetcher, query, reload) {
  const requestKey = `${JSON.stringify(query)}:${reload}`
  const [result, setResult] = useState({ key: null, data: EMPTY_RESULTS, error: null })

  useEffect(() => {
    const controller = new AbortController()
    fetcher(query, { signal: controller.signal })
      .then((payload) => setResult({ key: requestKey, data: payload, error: null }))
      .catch((requestError) => {
        if (isCanceled(requestError)) return
        setResult({
          key: requestKey,
          data: EMPTY_RESULTS,
          error: normalizeApiError(requestError, 'Unable to load this list.'),
        })
      })
    return () => controller.abort()
  }, [fetcher, query, requestKey])

  const loading = result.key !== requestKey
  return { data: result.data, loading, error: loading ? null : result.error }
}

export default function AssessmentsPage() {
  useDocumentTitle('Quizzes & exercises')

  const { user } = useAuth()
  const { addToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const { courses, error: coursesError } = useCourseOptions()

  const tab = searchParams.get('tab') === 'exercises' ? 'exercises' : 'quizzes'
  const course = searchParams.get('course') || ''
  const config = TABS[tab]

  const [search, setSearch] = useState('')
  const [difficulty, setDifficulty] = useState('')
  const [ordering, setOrdering] = useState('-created_at')
  const [pages, setPages] = useState({ quizzes: 1, exercises: 1 })
  const debouncedSearch = useDebouncedValue(search)
  const [reload, setReload] = useState(0)

  const [itemToDelete, setItemToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const baseQuery = useMemo(
    () => ({ search: debouncedSearch.trim(), course, difficulty, ordering }),
    [debouncedSearch, course, difficulty, ordering],
  )
  const quizQuery = useMemo(() => ({ ...baseQuery, page: pages.quizzes }), [baseQuery, pages.quizzes])
  const exerciseQuery = useMemo(
    () => ({ ...baseQuery, page: pages.exercises }),
    [baseQuery, pages.exercises],
  )

  const lists = {
    quizzes: useAssessmentList(fetchQuizzes, quizQuery, reload),
    exercises: useAssessmentList(fetchExercises, exerciseQuery, reload),
  }
  const { data, loading, error } = lists[tab]
  const page = pages[tab]

  const isStudent = user?.role === 'student'
  const canCreate = canManageCourses(user?.role)
  const hasFilters = Boolean(search.trim() || course || difficulty || ordering !== '-created_at')
  const showInitialSkeleton = loading && data.results.length === 0
  const showEmpty = !loading && !error && data.results.length === 0

  function resetPages() {
    setPages({ quizzes: 1, exercises: 1 })
  }

  function updateParam(name, value) {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(name, value)
    else next.delete(name)
    setSearchParams(next, { replace: true })
  }

  function resetFilters() {
    setSearch('')
    setDifficulty('')
    setOrdering('-created_at')
    resetPages()
    updateParam('course', '')
  }

  function changePage(nextPage) {
    setPages((current) => ({ ...current, [tab]: Math.max(1, nextPage) }))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function confirmDelete() {
    if (!itemToDelete) return
    setDeleting(true)
    try {
      await config.remove(itemToDelete.id)
      addToast({
        type: 'success',
        message: `${config.kind === 'quiz' ? 'Quiz' : 'Exercise'} “${itemToDelete.title}” has been deleted.`,
      })
      setItemToDelete(null)
      if (data.results.length === 1 && page > 1) changePage(page - 1)
      else setReload((current) => current + 1)
    } catch (deleteError) {
      addToast({
        type: 'error',
        message: normalizeApiError(deleteError, 'Deletion failed.').message,
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
            Practice &amp; assessment
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Quizzes &amp; exercises
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
            {isStudent
              ? 'Test your knowledge with auto-graded quizzes and submit written exercises for each course.'
              : 'Build auto-graded quizzes and written exercises, organised by course and difficulty.'}
          </p>
        </div>

        {canCreate ? (
          <div className="flex flex-wrap gap-2">
            <LinkButton to="/quizzes/new">
              <Plus className="size-4" aria-hidden="true" />
              New quiz
            </LinkButton>
            <LinkButton to="/quizzes/generate" variant="accent">
              <Sparkles className="size-4" aria-hidden="true" />
              Generate with AI
            </LinkButton>
            <LinkButton to="/exercises/new" variant="secondary">
              <Plus className="size-4" aria-hidden="true" />
              New exercise
            </LinkButton>
          </div>
        ) : null}
      </header>

      <div
        role="tablist"
        aria-label="Resource type"
        className="inline-flex rounded-xl border border-line bg-paper p-1 shadow-sm"
      >
        {Object.entries(TABS).map(([name, item]) => {
          const Icon = item.icon
          const active = name === tab
          const count = lists[name].loading ? null : lists[name].data.count
          return (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => updateParam('tab', name === 'quizzes' ? '' : name)}
              className={cx(
                'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition',
                active ? 'bg-ink text-paper shadow-sm' : 'text-ink-soft hover:bg-mist',
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {item.label}
              {count !== null ? (
                <span
                  className={cx(
                    'rounded-full px-2 py-0.5 text-xs',
                    active ? 'bg-white/15 text-paper' : 'bg-slate-100 text-slate-600',
                  )}
                >
                  {count}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      <Card className="bg-paper/90">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[2fr_1.5fr_1fr_1fr]">
          <Input
            label="Search"
            type="search"
            name="search"
            placeholder="Title or description…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              resetPages()
            }}
          />

          <Select
            label="Course"
            name="course"
            value={course}
            onChange={(event) => {
              updateParam('course', event.target.value)
              resetPages()
            }}
            hint={coursesError ? 'Courses could not be loaded.' : undefined}
          >
            <option value="">All courses</option>
            {courses.map((option) => (
              <option key={option.id} value={String(option.id)}>
                {option.title}
              </option>
            ))}
          </Select>

          <Select
            label="Difficulty"
            name="difficulty"
            value={difficulty}
            onChange={(event) => {
              setDifficulty(event.target.value)
              resetPages()
            }}
          >
            <option value="">All levels</option>
            {DIFFICULTIES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>

          <Select
            label="Sort by"
            name="ordering"
            value={ordering}
            onChange={(event) => {
              setOrdering(event.target.value)
              resetPages()
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

      <div role="tabpanel" aria-label={config.label} className="space-y-6">
        {error ? (
          <div role="alert">
            <EmptyState
              icon={AlertTriangle}
              title={`Unable to load ${config.plural}`}
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
          <EmptyState
            icon={ClipboardList}
            title={`No ${config.plural} yet`}
            description={
              canCreate
                ? `Create a ${config.singular} for one of your courses to give students something to practise.`
                : `Your teachers have not published any ${config.plural} yet. Check back a little later.`
            }
            action={
              canCreate ? (
                <LinkButton to={config.newPath}>
                  <Plus className="size-4" aria-hidden="true" />
                  Create a {config.singular}
                </LinkButton>
              ) : null
            }
          />
        ) : null}

        {showEmpty && hasFilters ? (
          <EmptyState
            icon={SearchX}
            title={`No ${config.plural} match`}
            description="Try another keyword, course or difficulty, or reset the filters."
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
            {data.results.map((item) => (
              <AssessmentCard
                key={item.id}
                kind={config.kind}
                item={item}
                isStudent={isStudent}
                canEdit={canManageAssessment(user, item)}
                onDelete={setItemToDelete}
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
            singular={config.singular}
            plural={config.plural}
            ariaLabel={`${config.label} pagination`}
          />
        ) : null}
      </div>

      <DeleteAssessmentModal
        kind={config.kind}
        item={itemToDelete}
        open={Boolean(itemToDelete)}
        deleting={deleting}
        onClose={() => setItemToDelete(null)}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
