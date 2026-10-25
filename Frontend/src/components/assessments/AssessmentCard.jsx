import { Link } from 'react-router-dom'
import {
  ArrowUpRight,
  BookOpen,
  CalendarClock,
  Clock3,
  ListChecks,
  Paperclip,
  PenLine,
  Pencil,
  Trash2,
  Trophy,
} from 'lucide-react'
import { Badge } from '../ui/Badge'
import { DifficultyBadge } from './DifficultyBadge'
import { formatDate, pluralize } from '../../lib/format'
import { formatDuration, formatPercentage } from '../../lib/assessments'

function QuizMeta({ quiz, isStudent }) {
  return (
    <>
      <span className="inline-flex items-center gap-1.5">
        <ListChecks className="size-3.5" aria-hidden="true" />
        {quiz.question_count} {pluralize(quiz.question_count, 'question')} · {quiz.total_points}{' '}
        {pluralize(quiz.total_points, 'pt')}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Clock3 className="size-3.5" aria-hidden="true" />
        {formatDuration(quiz.duration_minutes)}
      </span>
      {isStudent && quiz.my_attempt_count > 0 ? (
        <span className="inline-flex items-center gap-1.5">
          <Trophy className="size-3.5" aria-hidden="true" />
          Best: {formatPercentage(quiz.my_best_percentage)}
        </span>
      ) : null}
    </>
  )
}

function ExerciseMeta({ exercise, isStudent }) {
  return (
    <>
      <span className="inline-flex items-center gap-1.5">
        <Trophy className="size-3.5" aria-hidden="true" />
        {isStudent && exercise.my_score !== null && exercise.my_score !== undefined
          ? `${exercise.my_score} / ${exercise.points} pts`
          : `${exercise.points} ${pluralize(exercise.points, 'pt')}`}
      </span>
      {exercise.attachment_url ? (
        <span className="inline-flex items-center gap-1.5">
          <Paperclip className="size-3.5" aria-hidden="true" />
          {exercise.attachment_type === 'audio' ? 'Audio' : 'PDF'} attached
        </span>
      ) : null}
      {exercise.due_at ? (
        <span className="inline-flex items-center gap-1.5">
          <CalendarClock className="size-3.5" aria-hidden="true" />
          Due {formatDate(exercise.due_at)}
        </span>
      ) : null}
    </>
  )
}

function StatusBadge({ kind, item, isStudent, canEdit }) {
  if (!item.is_published) return <Badge variant="warning">Draft</Badge>
  if (isStudent && kind === 'quiz' && item.my_attempt_count > 0) {
    return <Badge variant="success">Attempted</Badge>
  }
  if (isStudent && kind === 'exercise' && item.my_submission_status !== 'none') {
    return (
      <Badge variant="success">
        {item.my_submission_status === 'graded' ? 'Graded' : 'Submitted'}
      </Badge>
    )
  }
  if (canEdit && kind === 'exercise' && item.submission_count > item.graded_count) {
    return <Badge variant="warning">{item.submission_count - item.graded_count} to grade</Badge>
  }
  return null
}

export function AssessmentCard({ kind, item, canEdit = false, isStudent = false, onDelete }) {
  const isQuiz = kind === 'quiz'
  const Icon = isQuiz ? ListChecks : PenLine
  const basePath = isQuiz ? `/quizzes/${item.id}` : `/exercises/${item.id}`
  const noun = isQuiz ? 'quiz' : 'exercise'

  return (
    <article className="surface group relative flex h-full flex-col overflow-hidden p-5 transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
      <span
        className={`absolute inset-x-0 top-0 h-1 ${isQuiz ? 'bg-brand' : 'bg-sage'}`}
        aria-hidden="true"
      />
      <div className="flex items-start justify-between gap-3">
        <span
          className={`inline-flex size-11 items-center justify-center rounded-xl ring-1 ring-inset ${
            isQuiz
              ? 'bg-brand/10 text-brand-strong ring-brand/15'
              : 'bg-sage/10 text-sage ring-sage/15'
          }`}
        >
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="flex flex-wrap justify-end gap-1.5">
          <Badge variant={isQuiz ? 'brand' : 'sage'}>{isQuiz ? 'Quiz' : 'Exercise'}</Badge>
          <DifficultyBadge difficulty={item.difficulty} label={item.difficulty_display} />
        </div>
      </div>

      <h2 className="mt-4 text-lg font-semibold leading-snug text-ink">
        <Link
          to={basePath}
          className="rounded underline-offset-4 hover:text-brand-strong hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {item.title}
        </Link>
      </h2>

      <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-slate-600">
        {item.description || 'No description provided.'}
      </p>

      <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft">
        <BookOpen className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="sr-only">Course: </span>
        <span className="truncate">{item.course_title}</span>
      </p>

      <div className="mb-4 mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        {isQuiz ? (
          <QuizMeta quiz={item} isStudent={isStudent} />
        ) : (
          <ExerciseMeta exercise={item} isStudent={isStudent} />
        )}
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-4">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            to={basePath}
            className="inline-flex items-center gap-1 rounded text-sm font-semibold text-brand-strong underline-offset-4 hover:underline"
          >
            Open {noun}
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
          <StatusBadge kind={kind} item={item} isStudent={isStudent} canEdit={canEdit} />
        </div>

        {canEdit ? (
          <div className="flex items-center gap-1">
            <Link
              to={`${basePath}/edit`}
              aria-label={`Edit “${item.title}”`}
              title="Edit"
              className="rounded-lg p-2 text-slate-500 transition hover:bg-mist hover:text-brand-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <Pencil className="size-4" aria-hidden="true" />
            </Link>
            <button
              type="button"
              onClick={() => onDelete?.(item)}
              aria-label={`Delete “${item.title}”`}
              title="Delete"
              className="rounded-lg p-2 text-slate-500 transition hover:bg-clay/10 hover:text-clay focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay"
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>
    </article>
  )
}
