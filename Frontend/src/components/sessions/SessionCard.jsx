import { Link } from 'react-router-dom'
import { CalendarDays, Clock, ExternalLink, Pencil, Trash2, Users, Video } from 'lucide-react'
import { Badge } from '../ui/Badge'
import { formatDateTime, formatTime } from '../../lib/format'

const STATUS_VARIANTS = {
  scheduled: 'brand',
  ongoing:   'sage',
  ended:     'default',
  cancelled: 'clay',
}

const STATUS_LABELS = {
  scheduled: 'Planifiée',
  ongoing:   'En cours',
  ended:     'Terminée',
  cancelled: 'Annulée',
}

const TYPE_LABELS = {
  course:   'Cours en ligne',
  training: 'Formation',
}

export function SessionCard({ session, canEdit = false, onDelete }) {
  const isTraining = session.session_type === 'training'

  return (
    <article className="surface group relative flex h-full flex-col overflow-hidden p-5 transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
      <span
        className={`absolute inset-x-0 top-0 h-1 ${isTraining ? 'bg-clay' : 'bg-brand'}`}
        aria-hidden="true"
      />

      <div className="flex items-start justify-between gap-3">
        <span
          className={`inline-flex size-11 items-center justify-center rounded-xl ring-1 ring-inset ${
            isTraining
              ? 'bg-clay/10 text-clay ring-clay/15'
              : 'bg-brand/10 text-brand-strong ring-brand/15'
          }`}
        >
          <Video className="size-5" aria-hidden="true" />
        </span>
        <div className="flex flex-wrap gap-2">
          <Badge variant={isTraining ? 'clay' : 'brand'}>
            {TYPE_LABELS[session.session_type] || session.session_type_display}
          </Badge>
          <Badge variant={STATUS_VARIANTS[session.status] || 'default'}>
            {STATUS_LABELS[session.status] || session.status_display}
          </Badge>
        </div>
      </div>

      <h2 className="mt-4 text-lg font-semibold leading-snug text-ink">
        <Link
          to={`/sessions/${session.id}`}
          className="rounded underline-offset-4 hover:text-brand-strong hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {session.title}
        </Link>
      </h2>

      {session.description ? (
        <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-slate-600">
          {session.description}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays className="size-3.5" aria-hidden="true" />
          {formatDateTime(session.starts_at)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock className="size-3.5" aria-hidden="true" />
          {session.duration_minutes} min
        </span>
        {isTraining && (
          <span className="inline-flex items-center gap-1.5">
            <Users className="size-3.5" aria-hidden="true" />
            {session.enrollment_count} inscrit{session.enrollment_count > 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-4">
        <div className="flex items-center gap-2">
          <Link
            to={`/sessions/${session.id}`}
            className="inline-flex items-center gap-1 rounded text-sm font-semibold text-brand-strong underline-offset-4 hover:underline"
          >
            Voir détails
          </Link>
          {session.meeting_link && session.status === 'ongoing' && (
            <a
              href={session.meeting_link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded text-sm font-semibold text-sage underline-offset-4 hover:underline"
            >
              Rejoindre
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          )}
        </div>

        {canEdit ? (
          <div className="flex items-center gap-1">
            <Link
              to={`/sessions/${session.id}/edit`}
              aria-label={`Modifier "${session.title}"`}
              className="rounded-lg p-2 text-slate-500 transition hover:bg-mist hover:text-brand-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <Pencil className="size-4" aria-hidden="true" />
            </Link>
            <button
              type="button"
              onClick={() => onDelete?.(session)}
              aria-label={`Supprimer "${session.title}"`}
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
