import { Link } from 'react-router-dom'
import { CalendarDays, Megaphone, Pencil, Pin, Trash2 } from 'lucide-react'
import { Badge } from '../ui/Badge'
import { formatDate } from '../../lib/format'
import { urgencyBadge } from '../../lib/urgency'

const AUDIENCE_VARIANTS = {
  all:      'default',
  students: 'brand',
  teachers: 'sage',
}

const AUDIENCE_LABELS = {
  all:      'Tous',
  students: 'Étudiants',
  teachers: 'Enseignants',
}

export function AnnouncementCard({ announcement, canEdit = false, onDelete }) {
  const urgency = urgencyBadge(announcement.urgency)

  return (
    <article className="surface relative flex flex-col gap-3 overflow-hidden p-5 transition duration-200 hover:border-slate-300 hover:shadow-sm">
      {announcement.is_pinned && (
        <span className="absolute inset-x-0 top-0 h-1 bg-gold" aria-hidden="true" />
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex size-9 items-center justify-center rounded-lg bg-brand/10 text-brand-strong ring-1 ring-inset ring-brand/15">
            <Megaphone className="size-4" aria-hidden="true" />
          </span>
          {announcement.is_pinned && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-gold">
              <Pin className="size-3" aria-hidden="true" />
              Épinglée
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {urgency && (
            <span title={urgency.title}>
              <Badge variant={urgency.variant}>{urgency.label}</Badge>
            </span>
          )}
          <Badge variant={AUDIENCE_VARIANTS[announcement.target_audience] || 'default'}>
            {AUDIENCE_LABELS[announcement.target_audience] || announcement.target_audience_display}
          </Badge>
        </div>
      </div>

      <div>
        <h2 className="text-base font-semibold leading-snug text-ink">
          <Link
            to={`/announcements/${announcement.id}`}
            className="rounded underline-offset-4 hover:text-brand-strong hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {announcement.title}
          </Link>
        </h2>
        <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-slate-600">
          {announcement.content}
        </p>
      </div>

      {(announcement.related_session_title || announcement.event_date || announcement.meeting_link) && (
        <div className="rounded-lg bg-mist px-3 py-2 text-xs text-slate-600 space-y-1">
          {announcement.related_session_title && (
            <p>📅 Session liée : <span className="font-medium">{announcement.related_session_title}</span></p>
          )}
          {announcement.event_date && (
            <p>📅 <span className="font-medium">{announcement.event_date}{announcement.event_time ? ` à ${announcement.event_time}` : ''}</span></p>
          )}
          {announcement.meeting_link && (
            <p>
              🔗{' '}
              <a
                href={announcement.meeting_link}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-brand-strong hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                Rejoindre la réunion
              </a>
            </p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
          <span>{announcement.author_name}</span>
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="size-3.5" aria-hidden="true" />
            {formatDate(announcement.created_at)}
          </span>
        </div>

        {canEdit && (
          <div className="flex items-center gap-1">
            <Link
              to={`/announcements/${announcement.id}/edit`}
              aria-label={`Modifier "${announcement.title}"`}
              className="rounded-lg p-1.5 text-slate-500 transition hover:bg-mist hover:text-brand-strong"
            >
              <Pencil className="size-4" aria-hidden="true" />
            </Link>
            <button
              type="button"
              onClick={() => onDelete?.(announcement)}
              aria-label={`Supprimer "${announcement.title}"`}
              className="rounded-lg p-1.5 text-slate-500 transition hover:bg-clay/10 hover:text-clay"
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </article>
  )
}
