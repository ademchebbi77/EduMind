import { Link } from 'react-router-dom'
import {
  CheckCircle2,
  FileText,
  Headphones,
  Lock,
  PlayCircle,
  Video,
} from 'lucide-react'
import { Badge } from '../ui/Badge'
import { EmptyState } from '../ui/EmptyState'
import { cx } from '../../lib/cx'

const FILE_ICONS = { pdf: FileText, video: Video, audio: Headphones }
const FILE_LABELS = { pdf: 'PDF', video: 'Video', audio: 'Audio' }

function LessonRow({ course, lesson, index, locked, completed, showStatus, lockMessage }) {
  const accessible = !locked
  const Icon = FILE_ICONS[lesson.file_type] || FileText
  const hasExternalVideo = Boolean(lesson.video_url)
  const primaryLabel =
    hasExternalVideo && !lesson.file_url
      ? 'External video'
      : FILE_LABELS[lesson.file_type] || 'File'
  const meta = [
    primaryLabel,
    hasExternalVideo && lesson.file_url ? 'External link' : null,
    lesson.duration_minutes ? `${lesson.duration_minutes} min` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const content = (
    <>
      <span
        className={cx(
          'flex size-9 shrink-0 items-center justify-center rounded-full ring-1 ring-inset',
          completed
            ? 'bg-sage/10 text-sage ring-sage/25'
            : locked
              ? 'bg-slate-100 text-slate-400 ring-slate-200'
              : 'bg-blue-50 text-blue-600 ring-blue-200',
        )}
        aria-hidden="true"
      >
        {completed ? (
          <CheckCircle2 className="size-5" />
        ) : locked ? (
          <Lock className="size-4" />
        ) : (
          <PlayCircle className="size-5" />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span
            className={cx(
              'truncate text-sm font-semibold',
              locked ? 'text-slate-500' : 'text-ink',
            )}
          >
            <span className="mr-1 text-xs font-medium text-slate-400">
              {index + 1}.
            </span>
            {lesson.title}
          </span>
          {!lesson.is_published ? (
            <Badge variant="neutral" className="shrink-0">
              Draft
            </Badge>
          ) : null}
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
          <Icon className="size-3.5 shrink-0" aria-hidden="true" />
          {meta}
        </span>
        {locked && showStatus ? (
          <span className="mt-1 block text-xs text-slate-400">{lockMessage}</span>
        ) : null}
      </span>

      {showStatus ? (
        completed ? (
          <Badge variant="success" className="shrink-0">
            Completed
          </Badge>
        ) : locked ? null : (
          <span className="shrink-0 text-xs font-semibold text-blue-600">
            Start
          </span>
        )
      ) : null}
    </>
  )

  if (!accessible) {
    return (
      <li
        className="flex cursor-not-allowed items-center gap-3 px-4 py-3.5 opacity-80"
        title={lockMessage || 'Complete the previous lesson first'}
        aria-label={`${lesson.title} — locked`}
      >
        {content}
      </li>
    )
  }

  return (
    <li>
      <Link
        to={`/courses/${course.id}/lessons/${lesson.id}`}
        className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-mist/70 focus-visible:bg-mist/70"
      >
        {content}
      </Link>
    </li>
  )
}

export function LessonList({
  course,
  lessons,
  isStudent = false,
  isEnrolled = false,
  canManage = false,
}) {
  if (!lessons.length) {
    return (
      <EmptyState
        icon={FileText}
        title="This course has no lessons yet"
        description={
          canManage
            ? 'Add your first lesson to get started.'
            : 'Check back later, the lessons are being prepared.'
        }
      />
    )
  }

  const showStatus = isStudent

  return (
    <ol className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-paper">
      {lessons.map((lesson, index) => {
        const completed = Boolean(lesson.is_completed)
        const locked =
          showStatus && !completed && (!isEnrolled || lesson.is_locked)
        const lockMessage = !isEnrolled
          ? 'Enroll to start learning'
          : `Complete lesson ${index} first`
        return (
          <LessonRow
            key={lesson.id}
            course={course}
            lesson={lesson}
            index={index}
            completed={completed}
            locked={locked}
            showStatus={showStatus}
            lockMessage={lockMessage}
          />
        )
      })}
    </ol>
  )
}
