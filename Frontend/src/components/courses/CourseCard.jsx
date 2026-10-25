import { Link } from 'react-router-dom'
import {
  ArrowUpRight,
  CalendarDays,
  FileText,
  Headphones,
  Pencil,
  Trash2,
  UserRound,
  Users,
  Video,
} from 'lucide-react'
import { Badge } from '../ui/Badge'
import { EnrollmentButton } from './EnrollmentButton'
import { formatDate } from '../../lib/format'

const FORMAT_ICONS = { audio: Headphones, video: Video, pdf: FileText }

const FORMAT_BADGES = { audio: 'sage', video: 'clay', pdf: 'brand' }

export function CourseCard({
  course,
  canEdit = false,
  onDelete,
  onEnrollmentChange,
  showEnrollmentCount = false,
}) {
  const Icon = FORMAT_ICONS[course.type] || FileText
  const badgeVariant = FORMAT_BADGES[course.type] || 'brand'
  const tags = Array.isArray(course.tags) ? course.tags : []

  return (
    <article className="surface group relative flex h-full flex-col overflow-hidden transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
      <Link
        to={`/courses/${course.id}`}
        aria-label={`View ${course.title}`}
        className="relative block aspect-[16/9] overflow-hidden bg-gradient-to-br from-ink to-ink-soft"
      >
        {course.thumbnail_url ? (
          <img
            src={course.thumbnail_url}
            alt=""
            loading="lazy"
            className="size-full object-cover transition duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <span className="flex size-full items-center justify-center">
            <span className="inline-flex size-16 items-center justify-center rounded-2xl bg-white/10 text-gold ring-1 ring-inset ring-white/15">
              <Icon className="size-7" aria-hidden="true" />
            </span>
          </span>
        )}

        <span className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <Badge variant={badgeVariant}>{course.type_display || course.type}</Badge>
          {course.category_name ? (
            <Badge variant="neutral" className="bg-paper/95">
              {course.category_name}
            </Badge>
          ) : null}
        </span>

        {course.is_enrolled ? (
          <Badge variant="success" dot className="absolute right-3 top-3 bg-paper/95">
            Enrolled
          </Badge>
        ) : null}
      </Link>

      <div className="flex flex-1 flex-col p-5">
        <h2 className="text-lg font-semibold leading-snug text-ink">
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

        {tags.length ? (
          <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Tags">
            {tags.slice(0, 4).map((tag) => (
              <li key={tag}>
                <Badge variant="neutral" className="bg-mist text-slate-600">
                  {tag}
                </Badge>
              </li>
            ))}
            {tags.length > 4 ? (
              <li>
                <Badge variant="neutral" className="bg-mist text-slate-600">
                  +{tags.length - 4}
                </Badge>
              </li>
            ) : null}
          </ul>
        ) : null}

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
          {showEnrollmentCount ? (
            <span className="inline-flex items-center gap-1.5">
              <Users className="size-3.5" aria-hidden="true" />
              {course.enrolled_count ?? 0}
              {course.max_students ? ` / ${course.max_students}` : ''} enrolled
            </span>
          ) : null}
        </div>

        <EnrollmentButton
          course={course}
          onChange={(changes) => onEnrollmentChange?.(course.id, changes)}
          size="sm"
          showBadge={false}
          className="mt-4"
        />

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
      </div>
    </article>
  )
}
