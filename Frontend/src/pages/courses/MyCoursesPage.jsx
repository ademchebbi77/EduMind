import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  FileText,
  GraduationCap,
  Headphones,
  RotateCcw,
  Video,
} from 'lucide-react'
import {
  fetchCourseEnrollments,
  fetchMyCourses,
} from '../../api/courses'
import { isCanceled, normalizeApiError } from '../../lib/api'
import { formatDate, formatDuration } from '../../lib/format'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { Badge } from '../../components/ui/Badge'
import { Button, LinkButton } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { CardSkeleton } from '../../components/ui/Skeleton'
import { CategoryBadge } from '../../components/courses/CategoryBadge'
import { EnrollmentButton } from '../../components/courses/EnrollmentButton'
import { Pagination } from '../../components/courses/Pagination'
import { ProgressBar } from '../../components/courses/ProgressBar'

const EMPTY_RESULTS = { count: 0, next: null, previous: null, results: [] }

const FORMAT_ICONS = { audio: Headphones, video: Video, pdf: FileText }

export default function MyCoursesPage() {
  useDocumentTitle('My courses')

  const [page, setPage] = useState(1)
  const [reload, setReload] = useState(0)

  const requestKey = `${page}:${reload}`
  const [result, setResult] = useState({
    key: null,
    courses: EMPTY_RESULTS,
    enrollments: [],
    error: null,
  })

  useEffect(() => {
    const controller = new AbortController()

    Promise.all([
      fetchMyCourses({ page }, { signal: controller.signal }),
      fetchCourseEnrollments({ pageSize: 50 }, { signal: controller.signal }),
    ])
      .then(([coursesPayload, enrollmentsPayload]) => {
        setResult({
          key: requestKey,
          courses: coursesPayload,
          enrollments: Array.isArray(enrollmentsPayload)
            ? enrollmentsPayload
            : enrollmentsPayload.results ?? [],
          error: null,
        })
      })
      .catch((requestError) => {
        if (isCanceled(requestError)) return
        setResult({
          key: requestKey,
          courses: EMPTY_RESULTS,
          enrollments: [],
          error: normalizeApiError(requestError, 'Unable to load your courses.'),
        })
      })

    return () => controller.abort()
  }, [page, requestKey])

  const loading = result.key !== requestKey
  const data = loading ? EMPTY_RESULTS : result.courses
  const error = loading ? null : result.error
  const courses = data.results ?? []

  const progressByCourse = useMemo(() => {
    const map = new Map()
    for (const enrollment of result.enrollments) {
      map.set(enrollment.course, enrollment)
    }
    return map
  }, [result.enrollments])

  const completedCount = result.enrollments.filter((item) => item.completed).length
  const inProgressCount = result.enrollments.filter((item) => !item.completed).length

  function changePage(nextPage) {
    setPage(Math.max(1, nextPage))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleEnrollmentChange() {
    setReload((current) => current + 1)
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-5 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-strong">
            <span className="h-px w-7 bg-brand" aria-hidden="true" />
            Learning path
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            My courses
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
            Pick up where you left off and follow your progress across every enrolled course.
          </p>
        </div>

        <LinkButton to="/courses" variant="secondary">
          <BookOpen className="size-4" aria-hidden="true" />
          Browse catalogue
        </LinkButton>
      </header>

      {!loading && !error && courses.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="py-4 text-center">
            <p className="text-2xl font-bold text-ink">{data.count}</p>
            <p className="mt-1 text-xs text-slate-500">Enrolled courses</p>
          </Card>
          <Card className="py-4 text-center">
            <p className="text-2xl font-bold text-brand-strong">{inProgressCount}</p>
            <p className="mt-1 text-xs text-slate-500">In progress</p>
          </Card>
          <Card className="py-4 text-center">
            <p className="text-2xl font-bold text-sage">{completedCount}</p>
            <p className="mt-1 text-xs text-slate-500">Completed</p>
          </Card>
        </div>
      ) : null}

      {error ? (
        <div role="alert">
          <EmptyState
            icon={AlertTriangle}
            title="Unable to load your courses"
            description={error.message}
            action={
              <Button variant="secondary" onClick={() => setReload((current) => current + 1)}>
                <RotateCcw className="size-4" aria-hidden="true" />
                Try again
              </Button>
            }
          />
        </div>
      ) : null}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, index) => (
            <CardSkeleton key={index} />
          ))}
        </div>
      ) : null}

      {!loading && !error && courses.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="You are not enrolled in any course yet"
          description="Browse the catalogue and enroll in a course to start learning. Your progress will appear here."
          action={
            <LinkButton to="/courses">
              Explore courses
              <ArrowRight className="size-4" aria-hidden="true" />
            </LinkButton>
          }
        />
      ) : null}

      {!loading && courses.length > 0 ? (
        <div className="space-y-4">
          {courses.map((course) => (
            <MyCourseRow
              key={course.id}
              course={course}
              enrollment={progressByCourse.get(course.id)}
              onEnrollmentChange={handleEnrollmentChange}
            />
          ))}
        </div>
      ) : null}

      {!loading && courses.length > 0 && (data.next || data.previous) ? (
        <Pagination
          count={data.count}
          page={page}
          hasNext={Boolean(data.next)}
          hasPrevious={Boolean(data.previous)}
          onPageChange={changePage}
          singular="course"
          plural="courses"
          ariaLabel="My courses pagination"
        />
      ) : null}
    </div>
  )
}

function progressDetail(course, enrollment) {
  if (!enrollment) return 'Progress unavailable'

  if (course.type === 'pdf' && enrollment.total_pages) {
    return `${enrollment.pages_viewed} of ${enrollment.total_pages} pages viewed`
  }

  if (enrollment.video_duration_seconds) {
    const verb = course.type === 'audio' ? 'listened' : 'watched'
    return `${formatDuration(enrollment.video_watched_seconds)} of ${formatDuration(enrollment.video_duration_seconds)} ${verb}`
  }

  return enrollment.completed ? 'Course completed' : 'Not started yet'
}

function MyCourseRow({ course, enrollment, onEnrollmentChange }) {
  const Icon = FORMAT_ICONS[course.type] || FileText
  const progress = enrollment?.progress ?? 0
  const completed = Boolean(enrollment?.completed)

  return (
    <Card className="flex flex-col gap-5 p-0 sm:flex-row sm:overflow-hidden">
      <Link
        to={`/courses/${course.id}`}
        aria-label={`Open ${course.title}`}
        className="relative block aspect-[16/9] shrink-0 overflow-hidden bg-gradient-to-br from-ink to-ink-soft sm:aspect-auto sm:w-56"
      >
        {course.thumbnail_url ? (
          <img src={course.thumbnail_url} alt="" className="size-full object-cover" />
        ) : (
          <span className="flex size-full min-h-32 items-center justify-center">
            <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-white/10 text-gold ring-1 ring-inset ring-white/15">
              <Icon className="size-6" aria-hidden="true" />
            </span>
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-3 p-5 sm:py-5 sm:pl-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={course.type === 'audio' ? 'sage' : course.type === 'video' ? 'clay' : 'brand'}>
            {course.type_display || course.type}
          </Badge>
          <CategoryBadge name={course.category_name} />
          {completed ? (
            <Badge variant="success" dot>
              Completed
            </Badge>
          ) : null}
        </div>

        <div>
          <h2 className="text-lg font-semibold leading-snug text-ink">
            <Link
              to={`/courses/${course.id}`}
              className="rounded underline-offset-4 hover:text-brand-strong hover:underline"
            >
              {course.title}
            </Link>
          </h2>
          <p className="mt-1 line-clamp-2 text-sm text-slate-600">
            {course.description || 'No description provided.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
          <span>{course.owner_name}</span>
          {enrollment?.enrolled_at ? (
            <span>Enrolled on {formatDate(enrollment.enrolled_at)}</span>
          ) : null}
          {completed && enrollment?.completed_at ? (
            <span className="inline-flex items-center gap-1 text-sage">
              <CheckCircle2 className="size-3.5" aria-hidden="true" />
              Completed on {formatDate(enrollment.completed_at)}
            </span>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <ProgressBar
            value={progress}
            label={completed ? 'Course completed' : 'Your progress'}
            className="max-w-md"
          />
          <p className="text-xs text-slate-500">
            {progressDetail(course, enrollment)}
          </p>
        </div>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
          <Link
            to={`/courses/${course.id}`}
            className="inline-flex items-center gap-1 text-sm font-semibold text-brand-strong underline-offset-4 hover:underline"
          >
            {completed ? 'Review course' : progress > 0 ? 'Continue learning' : 'Start course'}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>

          <EnrollmentButton
            course={course}
            onChange={onEnrollmentChange}
            size="sm"
            showBadge={false}
          />
        </div>
      </div>
    </Card>
  )
}
