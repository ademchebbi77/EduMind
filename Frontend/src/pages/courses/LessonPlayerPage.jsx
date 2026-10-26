import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  FileQuestion,
  FileText,
  Headphones,
  Lock,
  PartyPopper,
  RotateCcw,
  Video,
} from 'lucide-react'
import { completeLesson, fetchCourse } from '../../api/courses'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { isCanceled, normalizeApiError } from '../../lib/api'
import { toEmbedUrl } from '../../lib/video'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { Badge } from '../../components/ui/Badge'
import { Button, LinkButton } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageLoader } from '../../components/ui/Skeleton'
import { LessonTranscript } from '../../components/courses/LessonTranscript'

const COMPLETE_THRESHOLD = 0.9

const FILE_META = {
  pdf: { icon: FileText, label: 'PDF document' },
  video: { icon: Video, label: 'Video' },
  audio: { icon: Headphones, label: 'Audio' },
}

function ExternalVideo({ lesson }) {
  const embedUrl = toEmbedUrl(lesson.video_url)

  if (!embedUrl) {
    return (
      <p className="text-sm text-slate-600">
        This video link cannot be embedded.{' '}
        <a
          href={lesson.video_url}
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-brand-strong underline-offset-4 hover:underline"
        >
          Open it in a new tab
        </a>
        .
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <div className="aspect-video overflow-hidden rounded-xl border border-line bg-ink">
        <iframe
          src={embedUrl}
          title={`Lesson external video: ${lesson.title}`}
          className="size-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
      <a
        href={lesson.video_url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-strong underline-offset-4 hover:underline"
      >
        <ExternalLink className="size-4" aria-hidden="true" />
        Open video in a new tab
      </a>
    </div>
  )
}

function Player({ lesson, onTimeUpdate }) {
  const hasFile = Boolean(lesson.file_url)

  return (
    <div className="space-y-4">
      {hasFile && lesson.video_url ? (
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          Lesson file
        </p>
      ) : null}

      {hasFile && lesson.file_type === 'pdf' ? (
        <iframe
          src={lesson.file_url}
          title={`Lesson document: ${lesson.title}`}
          className="h-[65vh] min-h-96 w-full rounded-xl border border-line bg-mist"
        />
      ) : null}

      {hasFile && lesson.file_type === 'video' ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video
          controls
          preload="metadata"
          src={lesson.file_url}
          onTimeUpdate={onTimeUpdate}
          aria-label={`Lesson video: ${lesson.title}`}
          className="max-h-[65vh] w-full rounded-xl border border-line bg-ink"
        >
          Your browser does not support video playback.
        </video>
      ) : null}

      {hasFile && lesson.file_type === 'audio' ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <audio
          controls
          preload="metadata"
          src={lesson.file_url}
          onTimeUpdate={onTimeUpdate}
          aria-label={`Lesson audio: ${lesson.title}`}
          className="w-full"
        >
          Your browser does not support audio playback.
        </audio>
      ) : null}

      {lesson.video_url ? (
        <>
          {hasFile ? (
            <p className="pt-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              External video
            </p>
          ) : null}
          <ExternalVideo lesson={lesson} />
        </>
      ) : null}
    </div>
  )
}

export default function LessonPlayerPage() {
  const { courseId, lessonId } = useParams()
  const { user } = useAuth()
  const { addToast } = useToast()

  const [reload, setReload] = useState(0)
  const [result, setResult] = useState({ key: null, course: null, error: null })
  const [lessons, setLessons] = useState([])
  const [completing, setCompleting] = useState(false)
  const [watchedLessonId, setWatchedLessonId] = useState(null)
  const autoCompletedForRef = useRef(null)

  const requestKey = `${courseId}:${reload}`

  useEffect(() => {
    const controller = new AbortController()

    fetchCourse(courseId, { signal: controller.signal })
      .then((payload) => {
        setResult({ key: requestKey, course: payload, error: null })
        setLessons(Array.isArray(payload.lessons) ? payload.lessons : [])
      })
      .catch((requestError) => {
        if (isCanceled(requestError)) return
        setResult({
          key: requestKey,
          course: null,
          error: normalizeApiError(requestError, 'Unable to load this lesson.'),
        })
      })

    return () => controller.abort()
  }, [courseId, requestKey])

  const loading = result.key !== requestKey
  const course = loading ? null : result.course
  const error = loading ? null : result.error
  const lesson = lessons.find((item) => item.id === Number(lessonId)) || null

  const isStudent = user?.role === 'student'
  const completed = Boolean(lesson?.is_completed)
  const locked = isStudent && lesson && lesson.is_locked && !completed
  const canComplete =
    isStudent && Boolean(course?.is_enrolled) && lesson && !locked && !completed
  const watchedEnough = watchedLessonId === Number(lessonId)
  const autoCompletesOnOpen = Boolean(
    lesson &&
      ((lesson.file_type === 'pdf' && lesson.file_url) ||
        (!lesson.file_url && lesson.video_url)),
  )
  const courseCompleted = Boolean(
    isStudent &&
      course?.is_enrolled &&
      lessons.length > 0 &&
      lessons.every((item) => item.is_completed),
  )

  useDocumentTitle(
    lesson ? `${lesson.title} — ${course?.title || 'Course'}` : course?.title || 'Lesson',
  )

  const handleTimeUpdate = useCallback((event) => {
    const media = event.currentTarget
    if (media.duration > 0 && media.currentTime / media.duration >= COMPLETE_THRESHOLD) {
      setWatchedLessonId(Number(lessonId))
    }
  }, [lessonId])

  const handleComplete = useCallback(async () => {
    if (!lesson || !canComplete || completing) return
    setCompleting(true)
    try {
      const response = await completeLesson(courseId, lesson.id)
      setLessons((current) =>
        current.map((item) => {
          if (item.id === lesson.id) {
            return { ...item, is_completed: true, is_locked: false }
          }
          if (response.next_lesson_id && item.id === response.next_lesson_id) {
            return { ...item, is_locked: false }
          }
          return item
        }),
      )
      addToast({
        type: 'success',
        message: response.course_completed
          ? 'Course completed. Congratulations!'
          : `Lesson “${lesson.title}” completed.`,
      })
    } catch (requestError) {
      addToast({
        type: 'error',
        message: normalizeApiError(
          requestError,
          'Failed to mark as complete, try again.',
        ).message,
      })
    } finally {
      setCompleting(false)
    }
  }, [canComplete, completing, courseId, lesson, addToast])

  useEffect(() => {
    if (!lesson || !canComplete || completed) return
    if (!autoCompletesOnOpen) return
    if (autoCompletedForRef.current === lesson.id) return
    autoCompletedForRef.current = lesson.id
    void handleComplete()
  }, [lesson, canComplete, completed, handleComplete, autoCompletesOnOpen])

  useEffect(() => {
    if (!watchedEnough || !canComplete || completed || completing) return
    if (autoCompletedForRef.current === lesson.id) return
    autoCompletedForRef.current = lesson.id
    void handleComplete()
  }, [watchedEnough, canComplete, completed, completing, handleComplete, lesson])

  const index = lessons.findIndex((item) => item.id === Number(lessonId))
  const prevLesson = index > 0 ? lessons[index - 1] : null
  const nextLesson =
    index >= 0 && index < lessons.length - 1 ? lessons[index + 1] : null
  const canGoNext = nextLesson && (!isStudent || !nextLesson.is_locked || nextLesson.is_completed)

  const kind = lesson
    ? lesson.video_url
      ? {
          icon: Video,
          label: lesson.file_url ? 'Video + external link' : 'External video',
        }
      : FILE_META[lesson.file_type] || FILE_META.pdf
    : null

  if (loading) {
    return <PageLoader label="Loading lesson…" />
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Link
          to={`/courses/${courseId}`}
          className="inline-flex items-center gap-2 rounded text-sm font-medium text-slate-600 transition hover:text-brand-strong"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to course
        </Link>
        <div role="alert">
          <EmptyState
            icon={FileQuestion}
            title="Unable to load this lesson"
            description={error.message}
            action={
              <Button variant="secondary" onClick={() => setReload((current) => current + 1)}>
                <RotateCcw className="size-4" aria-hidden="true" />
                Try again
              </Button>
            }
          />
        </div>
      </div>
    )
  }

  if (!lesson) {
    return (
      <div className="space-y-6">
        <Link
          to={`/courses/${courseId}`}
          className="inline-flex items-center gap-2 rounded text-sm font-medium text-slate-600 transition hover:text-brand-strong"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to course
        </Link>
        <EmptyState
          icon={FileQuestion}
          title="Lesson not found"
          description="This lesson does not exist or has been removed."
          action={<LinkButton to={`/courses/${courseId}`}>Back to course</LinkButton>}
        />
      </div>
    )
  }

  if (locked) {
    return (
      <div className="space-y-6">
        <Link
          to={`/courses/${courseId}`}
          className="inline-flex items-center gap-2 rounded text-sm font-medium text-slate-600 transition hover:text-brand-strong"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to course
        </Link>
        <EmptyState
          icon={Lock}
          title={`Lesson ${lesson.order}: ${lesson.title}`}
          description="Complete the previous lesson first to unlock this one."
          action={
            prevLesson ? (
              <LinkButton to={`/courses/${courseId}/lessons/${prevLesson.id}`}>
                Go to lesson {prevLesson.order}
              </LinkButton>
            ) : (
              <LinkButton to={`/courses/${courseId}`}>Back to course</LinkButton>
            )
          }
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Link
        to={`/courses/${courseId}`}
        className="inline-flex items-center gap-2 rounded text-sm font-medium text-slate-600 transition hover:text-brand-strong"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to course
      </Link>

      <header className="border-b border-line pb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-strong">
          {course?.title}
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          Lesson {lesson.order}: {lesson.title}
        </h1>
        <p className="mt-2 flex items-center gap-2 text-sm text-slate-500">
          {kind ? (
            <span className="inline-flex items-center gap-1.5">
              <kind.icon className="size-4" aria-hidden="true" />
              {kind.label}
            </span>
          ) : null}
          {lesson.duration_minutes ? (
            <span>· {lesson.duration_minutes} min</span>
          ) : null}
          {completed ? (
            <Badge variant="success" dot>
              Completed
            </Badge>
          ) : null}
        </p>
        {lesson.description ? (
          <p className="mt-3 max-w-3xl whitespace-pre-line text-sm leading-relaxed text-slate-600">
            {lesson.description}
          </p>
        ) : null}
      </header>

      <Player lesson={lesson} onTimeUpdate={handleTimeUpdate} />

      <LessonTranscript
        key={`${courseId}:${lesson.id}`}
        courseId={courseId}
        lesson={lesson}
      />

      {courseCompleted ? (
        <div
          role="status"
          className="flex items-center gap-3 rounded-2xl border border-sage/30 bg-sage/[0.08] px-5 py-4"
        >
          <PartyPopper className="size-6 shrink-0 text-sage" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-ink">Course completed!</p>
            <p className="text-xs text-slate-600">
              You have finished every lesson. Your certificate-worthy effort is noted.
            </p>
          </div>
        </div>
      ) : null}

      <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">
            Lesson {lesson.order} of {lessons.length}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {completed
              ? 'You have completed this lesson.'
              : autoCompletesOnOpen
                ? 'Opening this lesson marks it as complete.'
                : `Finish at least ${Math.round(COMPLETE_THRESHOLD * 100)}% to complete automatically.`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {prevLesson ? (
            <LinkButton
              to={`/courses/${courseId}/lessons/${prevLesson.id}`}
              variant="secondary"
              size="sm"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Previous
            </LinkButton>
          ) : null}
          {canComplete ? (
            <Button size="sm" onClick={handleComplete} loading={completing}>
              {!completing ? (
                <CheckCircle2 className="size-4" aria-hidden="true" />
              ) : null}
              Mark as complete
            </Button>
          ) : completed ? (
            <Badge variant="success" dot>
              Completed
            </Badge>
          ) : null}
          {canGoNext ? (
            <LinkButton to={`/courses/${courseId}/lessons/${nextLesson.id}`} size="sm">
              Next lesson
              <ArrowRight className="size-4" aria-hidden="true" />
            </LinkButton>
          ) : null}
        </div>
      </Card>
    </div>
  )
}
