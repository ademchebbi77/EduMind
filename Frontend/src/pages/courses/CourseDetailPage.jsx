import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  CalendarDays,
  Download,
  FileQuestion,
  Pencil,
  RotateCcw,
  Tags,
  Trash2,
  UserRound,
  Users,
} from 'lucide-react'
import { deleteCourse, fetchCourse } from '../../api/courses'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { isCanceled, normalizeApiError } from '../../lib/api'
import { canEditCourse } from '../../lib/roles'
import { formatDate, formatDuration } from '../../lib/format'
import { useCourseProgress } from '../../hooks/useCourseProgress'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { Badge } from '../../components/ui/Badge'
import { Button, LinkButton } from '../../components/ui/Button'
import { buttonClasses } from '../../components/ui/buttonStyles'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageLoader } from '../../components/ui/Skeleton'
import { CategoryBadge } from '../../components/courses/CategoryBadge'
import { CourseMedia } from '../../components/courses/CourseMedia'
import { DeleteCourseModal } from '../../components/courses/DeleteCourseModal'
import { EnrollmentButton } from '../../components/courses/EnrollmentButton'
import { ProgressBar } from '../../components/courses/ProgressBar'
import { TranscriptCard } from '../../components/courses/TranscriptCard'

const TYPE_VARIANTS = { audio: 'sage', video: 'clay', pdf: 'brand' }

function progressSummary(course, progress) {
  if (!progress) return 'Loading your progress…'
  if (progress.completed) {
    return progress.completed_at
      ? `Completed on ${formatDate(progress.completed_at)}`
      : 'Course completed'
  }

  if (course.type === 'pdf') {
    if (!progress.total_pages) {
      return 'Open the document to start tracking your reading.'
    }
    return `${progress.pages_viewed} of ${progress.total_pages} pages viewed`
  }

  if (progress.video_duration_seconds) {
    const verb = course.type === 'audio' ? 'listened' : 'watched'
    return `${formatDuration(progress.video_watched_seconds)} of ${formatDuration(progress.video_duration_seconds)} ${verb}`
  }

  if (course.type === 'video' && course.has_file === false) {
    return 'External video — progress is estimated when the material is opened.'
  }

  return course.type === 'audio'
    ? 'Play the audio to start tracking your progress.'
    : 'Play the video to start tracking your progress.'
}

function BackLink() {
  return (
    <Link
      to="/courses"
      className="inline-flex items-center gap-2 rounded text-sm font-medium text-slate-600 transition hover:text-brand-strong"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      Back to catalogue
    </Link>
  )
}

export default function CourseDetailPage() {
  const { courseId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { addToast } = useToast()

  const [reload, setReload] = useState(0)
  const [result, setResult] = useState({ key: null, course: null, error: null })
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const requestKey = `${courseId}:${reload}`

  useEffect(() => {
    const controller = new AbortController()

    fetchCourse(courseId, { signal: controller.signal })
      .then((payload) => setResult({ key: requestKey, course: payload, error: null }))
      .catch((requestError) => {
        if (isCanceled(requestError)) return
        setResult({
          key: requestKey,
          course: null,
          error: normalizeApiError(requestError, 'Unable to load this course.'),
        })
      })

    return () => controller.abort()
  }, [courseId, requestKey])

  const loading = result.key !== requestKey
  const course = loading ? null : result.course
  const error = loading ? null : result.error

  const tracking = useCourseProgress(course, {
    enabled: Boolean(
      course && user?.role === 'student' && course.is_enrolled,
    ),
  })
  const progress = tracking.progress
  const progressError = tracking.error

  useDocumentTitle(course?.title || 'Course')

  function handleEnrollmentChange(changes) {
    setResult((current) =>
      current.course
        ? { ...current, course: { ...current.course, ...changes } }
        : current,
    )
  }

  async function confirmDelete() {
    setDeleting(true)
    try {
      await deleteCourse(course.id)
      setConfirmOpen(false)
      addToast({
        type: 'success',
        message: `Course “${course.title}” has been deleted.`,
      })
      navigate('/courses', { replace: true })
    } catch (deleteError) {
      addToast({
        type: 'error',
        message: normalizeApiError(deleteError, 'Course deletion failed.').message,
      })
      setDeleting(false)
    }
  }

  if (loading) {
    return <PageLoader label="Loading course…" />
  }

  if (error) {
    return (
      <div className="space-y-6">
        <BackLink />
        {error.status === 404 ? (
          <EmptyState
            icon={FileQuestion}
            title="Course not found"
            description="This course does not exist or has been deleted. Browse the catalogue to find another resource."
            action={<LinkButton to="/courses">View catalogue</LinkButton>}
          />
        ) : (
          <div role="alert">
            <EmptyState
              icon={FileQuestion}
              title="Unable to display this course"
              description={error.message}
              action={
                <Button variant="secondary" onClick={() => setReload((current) => current + 1)}>
                  <RotateCcw className="size-4" aria-hidden="true" />
                  Try again
                </Button>
              }
            />
          </div>
        )}
      </div>
    )
  }

  if (!course) return null

  const canEdit = canEditCourse(user, course)
  const tags = Array.isArray(course.tags) ? course.tags : []
  const hasFile = course.has_file !== false
  const enrolledCount = course.enrolled_count ?? 0
  const placesLabel = course.max_students ? `${enrolledCount} / ${course.max_students}` : String(enrolledCount)

  return (
    <div className="space-y-6">
      <BackLink />

      <header className="surface relative overflow-hidden border-l-4 border-l-brand">
        {course.thumbnail_url ? (
          <div className="relative h-52 w-full overflow-hidden sm:h-72">
            <img
              src={course.thumbnail_url}
              alt=""
              className="size-full object-cover"
            />
            <div
              className="absolute inset-0 bg-gradient-to-t from-ink/70 via-ink/10 to-transparent"
              aria-hidden="true"
            />
          </div>
        ) : null}

        <div className={`p-6 sm:p-8 ${course.thumbnail_url ? 'sm:pt-6' : ''}`}>
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={TYPE_VARIANTS[course.type] || 'brand'}>
                  {course.type_display || course.type}
                </Badge>
                <CategoryBadge name={course.category_name} />
                {course.is_full && !course.is_enrolled ? (
                  <Badge variant="warning">Full</Badge>
                ) : null}
                <span className="text-xs text-slate-500">
                  Updated on {formatDate(course.updated_at)}
                </span>
              </div>

              <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
                {course.title}
              </h1>
              <span className="academic-rule mt-4" aria-hidden="true" />
              <p className="mt-4 max-w-2xl whitespace-pre-line text-sm leading-relaxed text-slate-600">
                {course.description || 'No description provided for this course.'}
              </p>

              {tags.length ? (
                <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Tags">
                  {tags.map((tag) => (
                    <li key={tag}>
                      <Badge variant="neutral" className="bg-mist text-slate-600">
                        {tag}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500">
                <span className="inline-flex items-center gap-1.5">
                  <UserRound className="size-4" aria-hidden="true" />
                  {course.owner_name}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="size-4" aria-hidden="true" />
                  Added on {formatDate(course.created_at)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Users className="size-4" aria-hidden="true" />
                  {placesLabel} {course.max_students ? 'enrolled' : 'students enrolled'}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-3 xl:min-w-52">
              <EnrollmentButton
                course={course}
                onChange={handleEnrollmentChange}
                size="md"
                className="justify-start"
              />

              <div className="flex flex-wrap items-center gap-2 xl:flex-col xl:items-stretch">
                {hasFile ? (
                  <a
                    href={course.download_url}
                    download
                    className={buttonClasses({ variant: 'secondary', size: 'sm' })}
                  >
                    <Download className="size-4" aria-hidden="true" />
                    Download
                  </a>
                ) : null}
                {canEdit ? (
                  <>
                    <LinkButton to={`/course-enrollments?course=${course.id}`} variant="secondary" size="sm">
                      <Users className="size-4" aria-hidden="true" />
                      Manage enrollments
                    </LinkButton>
                    <LinkButton to={`/courses/${course.id}/edit`} variant="secondary" size="sm">
                      <Pencil className="size-4" aria-hidden="true" />
                      Edit
                    </LinkButton>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmOpen(true)}
                      className="text-clay hover:bg-clay/10"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                      Delete
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </header>

      {user?.role === 'student' && course.is_enrolled ? (
        <Card aria-labelledby="course-progress-title">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2
                id="course-progress-title"
                className="text-xl font-semibold text-ink"
              >
                Your progress
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {progressSummary(course, progress)}
              </p>
              {progressError ? (
                <p className="mt-1 text-xs text-clay">{progressError.message}</p>
              ) : null}
            </div>
            <div className="flex items-center gap-3">
              {progress?.completed ? (
                <Badge variant="success" dot>
                  Completed
                </Badge>
              ) : null}
              <span className="font-display text-2xl font-semibold text-brand-strong">
                {progress?.progress ?? 0}%
              </span>
            </div>
          </div>

          <ProgressBar
            value={progress?.progress ?? 0}
            ariaLabel="Course progress"
            className="mt-4"
          />

          {progress &&
          !progress.completed &&
          course.type !== 'pdf' &&
          progress.last_position_seconds > 0 ? (
            <p className="mt-3 text-xs text-slate-500">
              Playback resumes at{' '}
              {formatDuration(progress.last_position_seconds)}.
            </p>
          ) : null}
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <div className="mb-5 flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold text-ink">Course material</h2>
            <span className="academic-rule" aria-hidden="true" />
          </div>
          {user?.role === 'student' &&
          course.is_enrolled &&
          !progress &&
          !progressError ? (
            <p className="text-sm text-slate-500" aria-live="polite">
              Preparing your course…
            </p>
          ) : (
            <CourseMedia course={course} tracking={tracking} />
          )}
        </Card>

        <Card as="aside" aria-labelledby="course-info-title" className="bg-gradient-to-b from-white to-mist/50">
          <h2 id="course-info-title" className="text-xl font-semibold text-ink">
            Details
          </h2>
          <dl className="mt-4 divide-y divide-line text-sm">
            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="text-slate-500">Format</dt>
              <dd className="font-medium text-ink-soft">{course.type_display || course.type}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="text-slate-500">Category</dt>
              <dd className="text-right font-medium text-ink-soft">
                {course.category_name || '—'}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="text-slate-500">Level</dt>
              <dd className="text-right font-medium text-ink-soft">
                {course.difficulty_display || course.difficulty || '—'}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="inline-flex items-center gap-1.5 text-slate-500">
                <Tags className="size-3.5" aria-hidden="true" />
                Tags
              </dt>
              <dd className="text-right font-medium text-ink-soft">
                {tags.length ? tags.join(', ') : '—'}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="text-slate-500">Students</dt>
              <dd className="font-medium text-ink-soft">
                {enrolledCount}
                {course.max_students ? ` / ${course.max_students}` : ''}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="text-slate-500">Published by</dt>
              <dd className="text-right font-medium text-ink-soft">{course.owner_name}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="text-slate-500">Date added</dt>
              <dd className="font-medium text-ink-soft">{formatDate(course.created_at)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="text-slate-500">Last updated</dt>
              <dd className="font-medium text-ink-soft">{formatDate(course.updated_at)}</dd>
            </div>
          </dl>
        </Card>
      </div>

      {course.type === 'video' && hasFile && (canEdit || course.is_enrolled) ? (
        <TranscriptCard
          course={course}
          canGenerate={canEdit || course.is_enrolled}
        />
      ) : null}

      <DeleteCourseModal
        course={course}
        open={confirmOpen}
        deleting={deleting}
        onClose={() => setConfirmOpen(false)}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
