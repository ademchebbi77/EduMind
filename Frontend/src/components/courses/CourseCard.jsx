import { Link } from 'react-router-dom'
import {
  ArrowUpRight,
  CalendarDays,
  FileText,
  Headphones,
  Pencil,
  Trash2,
  UserRound,
} from 'lucide-react'
import { Badge } from '../ui/Badge'
import { formatDate } from '../../lib/format'

export function CourseCard({ course, canEdit = false, onDelete }) {
  const isAudio = course.type === 'audio'
  const Icon = isAudio ? Headphones : FileText

  return (
    <article className="surface group relative flex h-full flex-col overflow-hidden p-5 transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
      <span
        className={`absolute inset-x-0 top-0 h-1 ${isAudio ? 'bg-sage' : 'bg-brand'}`}
        aria-hidden="true"
      />
      <div className="flex items-start justify-between gap-3">
        <span
          className={`inline-flex size-11 items-center justify-center rounded-xl ring-1 ring-inset ${
            isAudio
              ? 'bg-sage/10 text-sage ring-sage/15'
              : 'bg-brand/10 text-brand-strong ring-brand/15'
          }`}
        >
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <Badge variant={isAudio ? 'sage' : 'brand'}>{course.type_display || course.type}</Badge>
      </div>

      <h2 className="mt-4 text-lg font-semibold leading-snug text-ink">
        <Link
          to={`/courses/${course.id}`}
          className="rounded underline-offset-4 hover:text-brand-strong hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {course.title}
        </Link>
      </h2>

      <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-slate-600">
        {course.description || 'No description provided.'}
      </p>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <UserRound className="size-3.5" aria-hidden="true" />
          <span className="sr-only">Owner: </span>
          {course.owner_name}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays className="size-3.5" aria-hidden="true" />
          <span className="sr-only">Added on </span>
          {formatDate(course.created_at)}
        </span>
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-4">
        <Link
          to={`/courses/${course.id}`}
          className="inline-flex items-center gap-1 rounded text-sm font-semibold text-brand-strong underline-offset-4 hover:underline"
        >
          View course
          <ArrowUpRight className="size-4" aria-hidden="true" />
        </Link>

        {canEdit ? (
          <div className="flex items-center gap-1">
            <Link
              to={`/courses/${course.id}/edit`}
              aria-label={`Edit “${course.title}”`}
              title="Edit"
              className="rounded-lg p-2 text-slate-500 transition hover:bg-mist hover:text-brand-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <Pencil className="size-4" aria-hidden="true" />
            </Link>
            <button
              type="button"
              onClick={() => onDelete?.(course)}
              aria-label={`Delete “${course.title}”`}
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
