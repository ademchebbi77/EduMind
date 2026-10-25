import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  CalendarDays,
  Download,
  FileQuestion,
  Pencil,
  RotateCcw,
  Trash2,
  UserRound,
} from 'lucide-react'
import { deleteCourse, fetchCourse } from '../../api/courses'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { isCanceled, normalizeApiError } from '../../lib/api'
import { canEditCourse } from '../../lib/roles'
import { formatDate } from '../../lib/format'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { Badge } from '../../components/ui/Badge'
import { Button, LinkButton } from '../../components/ui/Button'
import { buttonClasses } from '../../components/ui/buttonStyles'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageLoader } from '../../components/ui/Skeleton'
import { CourseMedia } from '../../components/courses/CourseMedia'
import { DeleteCourseModal } from '../../components/courses/DeleteCourseModal'

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

  useDocumentTitle(course?.title || 'Course')

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

  const isAudio = course.type === 'audio'
  const canEdit = canEditCourse(user, course)

  return (
    <div className="space-y-6">
      <BackLink />

      <header className="surface relative overflow-hidden border-l-4 border-l-brand p-6 sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={isAudio ? 'sage' : 'brand'}>
                {course.type_display || course.type}
              </Badge>
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

            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <UserRound className="size-4" aria-hidden="true" />
                {course.owner_name}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-4" aria-hidden="true" />
                Added on {formatDate(course.created_at)}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 xl:flex-col xl:items-stretch">
            <a
              href={course.download_url}
              download
              className={buttonClasses({ variant: 'secondary', size: 'sm' })}
            >
              <Download className="size-4" aria-hidden="true" />
              Download
            </a>
            {canEdit ? (
              <>
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
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <div className="mb-5 flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold text-ink">Course material</h2>
            <span className="academic-rule" aria-hidden="true" />
          </div>
          <CourseMedia course={course} />
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
