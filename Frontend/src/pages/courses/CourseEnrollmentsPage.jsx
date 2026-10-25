import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  ClipboardList,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import {
  deleteCourseEnrollment,
  fetchCourseEnrollments,
  fetchCourses,
} from '../../api/courses'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { isCanceled, normalizeApiError } from '../../lib/api'
import { canEditCourse } from '../../lib/roles'
import { formatDate, formatDuration } from '../../lib/format'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Select } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { CardSkeleton } from '../../components/ui/Skeleton'
import { ProgressBar } from '../../components/courses/ProgressBar'
import { Pagination } from '../../components/courses/Pagination'

const EMPTY_RESULTS = { count: 0, next: null, previous: null, results: [] }

export default function CourseEnrollmentsPage() {
  useDocumentTitle('Course enrollments')

  const { user } = useAuth()
  const { addToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()

  const courseFilter = searchParams.get('course') || ''

  const [page, setPage] = useState(1)
  const [reload, setReload] = useState(0)
  const [courses, setCourses] = useState([])
  const [coursesError, setCoursesError] = useState('')
  const [toRemove, setToRemove] = useState(null)
  const [removing, setRemoving] = useState(false)

  const requestKey = `${courseFilter}:${page}:${reload}`
  const [result, setResult] = useState({ key: null, data: EMPTY_RESULTS, error: null })

  useEffect(() => {
    const controller = new AbortController()

    fetchCourses({ ordering: 'title', pageSize: 50 }, { signal: controller.signal })
      .then((payload) => {
        const list = Array.isArray(payload) ? payload : payload.results ?? []
        setCourses(list.filter((course) => canEditCourse(user, course)))
        setCoursesError('')
      })
      .catch((requestError) => {
        if (isCanceled(requestError)) return
        setCoursesError(
          normalizeApiError(requestError, 'Unable to load courses.').message,
        )
      })

    return () => controller.abort()
  }, [user])

  useEffect(() => {
    const controller = new AbortController()

    fetchCourseEnrollments(
      { course: courseFilter, page },
      { signal: controller.signal },
    )
      .then((payload) => setResult({ key: requestKey, data: payload, error: null }))
      .catch((requestError) => {
        if (isCanceled(requestError)) return
        setResult({
          key: requestKey,
          data: EMPTY_RESULTS,
          error: normalizeApiError(requestError, 'Unable to load enrollments.'),
        })
      })

    return () => controller.abort()
  }, [courseFilter, page, requestKey])

  const loading = result.key !== requestKey
  const data = result.data
  const error = loading ? null : result.error
  const enrollments = data.results ?? []

  const completedCount = enrollments.filter((item) => item.completed).length
  const averageProgress = enrollments.length
    ? Math.round(
        enrollments.reduce((total, item) => total + (item.progress || 0), 0) /
          enrollments.length,
      )
    : 0

  function changeCourse(value) {
    setPage(1)
    if (value) {
      setSearchParams({ course: value })
    } else {
      setSearchParams({})
    }
  }

  function changePage(nextPage) {
    setPage(Math.max(1, nextPage))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleRemove() {
    if (!toRemove) return
    setRemoving(true)
    try {
      await deleteCourseEnrollment(toRemove.id)
      addToast({
        type: 'success',
        message: `${toRemove.student_name} was removed from “${toRemove.course_title}”.`,
      })
      setToRemove(null)
      if (enrollments.length === 1 && page > 1) {
        setPage(page - 1)
      } else {
        setReload((current) => current + 1)
      }
    } catch (requestError) {
      addToast({
        type: 'error',
        message: normalizeApiError(requestError, 'Unable to remove this enrollment.').message,
      })
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="space-y-6">
      <header className="border-b border-line pb-6">
        <p className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-strong">
          <span className="h-px w-7 bg-brand" aria-hidden="true" />
          Teaching
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          Course enrollments
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          Follow student progress and manage who is enrolled in your courses.
        </p>
      </header>

      {!loading && data.count > 0 ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="py-4 text-center">
            <p className="text-2xl font-bold text-ink">{data.count}</p>
            <p className="mt-1 text-xs text-slate-500">Total enrollments</p>
          </Card>
          <Card className="py-4 text-center">
            <p className="text-2xl font-bold text-sage">{completedCount}</p>
            <p className="mt-1 text-xs text-slate-500">Completed on this page</p>
          </Card>
          <Card className="py-4 text-center">
            <p className="text-2xl font-bold text-brand-strong">{averageProgress}%</p>
            <p className="mt-1 text-xs text-slate-500">Average progress on this page</p>
          </Card>
        </div>
      ) : null}

      <Card className="bg-paper/90">
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr] sm:items-end">
          <Select
            label="Course"
            name="course"
            value={courseFilter}
            onChange={(event) => changeCourse(event.target.value)}
            hint={coursesError || 'Only courses you can manage are listed.'}
          >
            <option value="">All my courses</option>
            {courses.map((course) => (
              <option key={course.id} value={String(course.id)}>
                {course.title}
              </option>
            ))}
          </Select>

          {courseFilter ? (
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => changeCourse('')}>
                <RotateCcw className="size-4" aria-hidden="true" />
                Reset filter
              </Button>
            </div>
          ) : null}
        </div>
      </Card>

      {error ? (
        <div role="alert">
          <EmptyState
            icon={AlertTriangle}
            title="Unable to load enrollments"
            description={error.message}
            action={
              <Button variant="secondary" onClick={() => setReload((current) => current + 1)}>
                Try again
              </Button>
            }
          />
        </div>
      ) : null}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, index) => (
            <CardSkeleton key={index} />
          ))}
        </div>
      ) : null}

      {!loading && !error && data.count === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={courseFilter ? 'No enrollments for this course' : 'No course enrollments yet'}
          description={
            courseFilter
              ? 'No student has enrolled in this course yet.'
              : 'Students will appear here as soon as they enroll in one of your courses.'
          }
          action={
            courseFilter ? (
              <Button variant="secondary" onClick={() => changeCourse('')}>
                Show all courses
              </Button>
            ) : undefined
          }
        />
      ) : null}

      {!loading && !error && enrollments.length > 0 ? (
        <>
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-mist/50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-3">Student</th>
                    <th className="px-4 py-3">Course</th>
                    <th className="px-4 py-3">Enrolled</th>
                    <th className="px-4 py-3">Progress</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {enrollments.map((enrollment) => (
                    <EnrollmentRow
                      key={enrollment.id}
                      enrollment={enrollment}
                      onRemove={() => setToRemove(enrollment)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {data.next || data.previous ? (
            <Pagination
              count={data.count}
              page={page}
              hasNext={Boolean(data.next)}
              hasPrevious={Boolean(data.previous)}
              disabled={loading}
              onPageChange={changePage}
              singular="enrollment"
              plural="enrollments"
              ariaLabel="Course enrollment pagination"
            />
          ) : null}
        </>
      ) : null}

      <Modal
        open={Boolean(toRemove)}
        onClose={() => {
          if (!removing) setToRemove(null)
        }}
        title="Remove this enrollment?"
        description={
          toRemove
            ? `${toRemove.student_name} will lose access to “${toRemove.course_title}” and their progress will be deleted.`
            : ''
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setToRemove(null)} disabled={removing}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleRemove} loading={removing}>
              <Trash2 className="size-4" aria-hidden="true" />
              Remove enrollment
            </Button>
          </>
        }
      />
    </div>
  )
}

function progressDetail(enrollment) {
  if (enrollment.total_pages) {
    return `${enrollment.pages_viewed ?? 0}/${enrollment.total_pages} pages`
  }
  if (enrollment.video_duration_seconds) {
    return `${formatDuration(enrollment.video_watched_seconds)} / ${formatDuration(enrollment.video_duration_seconds)}`
  }
  return 'Not started'
}

function EnrollmentRow({ enrollment, onRemove }) {
  return (
    <tr className="transition hover:bg-mist/30">
      <td className="px-4 py-3">
        <p className="font-medium text-ink">{enrollment.student_name}</p>
        <p className="text-xs text-slate-500">{enrollment.student_email}</p>
      </td>
      <td className="px-4 py-3">
        <Link
          to={`/courses/${enrollment.course}`}
          className="font-medium text-brand-strong hover:underline"
        >
          {enrollment.course_title}
        </Link>
        <p className="text-xs capitalize text-slate-500">{enrollment.course_type}</p>
      </td>
      <td className="px-4 py-3 text-xs text-slate-500">
        {formatDate(enrollment.enrolled_at)}
      </td>
      <td className="px-4 py-3">
        <div className="flex min-w-40 items-center gap-3">
          <ProgressBar
            value={enrollment.progress}
            ariaLabel={`Progress for ${enrollment.student_name}`}
            className="w-24"
          />
          <span className="whitespace-nowrap text-xs text-slate-500">
            {progressDetail(enrollment)}
          </span>
        </div>
      </td>
      <td className="px-4 py-3">
        {enrollment.completed ? (
          <Badge variant="success" dot>
            Completed
          </Badge>
        ) : (
          <Badge variant="neutral">{enrollment.progress ?? 0}%</Badge>
        )}
      </td>
      <td className="px-4 py-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={onRemove}
          className="text-clay hover:bg-clay/10"
        >
          <Trash2 className="size-4" aria-hidden="true" />
          Remove
        </Button>
      </td>
    </tr>
  )
}
