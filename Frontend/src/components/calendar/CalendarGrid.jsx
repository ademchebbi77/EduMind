import { Link } from 'react-router-dom'
import { ExternalLink, UserPlus } from 'lucide-react'

const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

const TYPE_STYLES = {
  course:   'bg-brand/15 text-brand-strong border-l-2 border-brand',
  training: 'bg-clay/15 text-clay border-l-2 border-clay',
}

const STATUS_DOT = {
  scheduled: 'bg-brand',
  ongoing:   'bg-sage',
  ended:     'bg-slate-300',
  cancelled: 'bg-clay',
}

function pad(n) { return String(n).padStart(2, '0') }

function toLocalDate(isoString) {
  return new Date(isoString)
}

function sameDay(date, year, month, day) {
  return (
    date.getFullYear() === year &&
    date.getMonth() === month &&
    date.getDate() === day
  )
}

function buildCalendarDays(year, month) {
  const firstDay = new Date(year, month, 1)
  const lastDay  = new Date(year, month + 1, 0)

  let startDow = firstDay.getDay() - 1
  if (startDow < 0) startDow = 6

  const days = []

  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(year, month, -i)
    days.push({ date: d, currentMonth: false })
  }

  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push({ date: new Date(year, month, d), currentMonth: true })
  }

  while (days.length < 42) {
    const last = days[days.length - 1].date
    const next = new Date(last)
    next.setDate(next.getDate() + 1)
    days.push({ date: next, currentMonth: false })
  }

  return days
}

function EventPill({ session, isStudent, onEnroll }) {
  const start      = toLocalDate(session.starts_at)
  const timeStr    = `${pad(start.getHours())}:${pad(start.getMinutes())}`
  const isTraining = session.session_type === 'training'
  const canEnroll  = isStudent && isTraining && session.status === 'scheduled' && !session.is_enrolled
  const isEnrolled = isStudent && isTraining && session.is_enrolled

  return (
    <div
      className={`mb-0.5 flex min-w-0 items-center gap-1 rounded px-1 py-0.5 text-[11px] font-medium leading-snug ${TYPE_STYLES[session.session_type] || 'bg-slate-100 text-slate-700'}`}
      title={`${session.title} — ${timeStr}${isTraining ? ' (Formation)' : ''}`}
    >
      {/* Dot statut */}
      <span
        className={`size-1.5 shrink-0 rounded-full ${STATUS_DOT[session.status] || 'bg-slate-300'}`}
        aria-hidden="true"
      />

      {/* Titre cliquable */}
      <Link
        to={`/sessions/${session.id}`}
        className="min-w-0 flex-1 truncate hover:opacity-80"
      >
        {timeStr} {session.title}
        {isTraining && <span className="ml-1 opacity-60">(F)</span>}
      </Link>

      {/* Lien rejoindre si en cours */}
      {session.meeting_link && session.status === 'ongoing' && (
        <a
          href={session.meeting_link}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          aria-label="Rejoindre"
          className="shrink-0 hover:opacity-70"
        >
          <ExternalLink className="size-2.5" aria-hidden="true" />
        </a>
      )}

      {/* Bouton inscription formation */}
      {canEnroll && (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); onEnroll(session) }}
          aria-label={`S'inscrire à ${session.title}`}
          className="shrink-0 hover:opacity-70"
          title="S'inscrire"
        >
          <UserPlus className="size-2.5" aria-hidden="true" />
        </button>
      )}

      {/* Indicateur inscrit */}
      {isEnrolled && (
        <span className="shrink-0 text-sage" aria-label="Inscrit" title="Vous êtes inscrit">
          ✓
        </span>
      )}
    </div>
  )
}

export function CalendarGrid({ year, month, sessions, today, isStudent = false, onEnroll }) {
  const days = buildCalendarDays(year, month)

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
      {/* En-têtes */}
      <div className="grid grid-cols-7 border-b border-line bg-mist/50">
        {DAY_NAMES.map((name) => (
          <div
            key={name}
            className="py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500"
          >
            {name}
          </div>
        ))}
      </div>

      {/* Grille */}
      <div className="grid grid-cols-7">
        {days.map(({ date, currentMonth }, idx) => {
          const y = date.getFullYear()
          const m = date.getMonth()
          const d = date.getDate()
          const isToday = sameDay(date, today.getFullYear(), today.getMonth(), today.getDate())

          const daySessions = sessions.filter((s) =>
            sameDay(toLocalDate(s.starts_at), y, m, d)
          )

          // Nombre de formations avec inscription possible ce jour
          const enrollableCount = isStudent
            ? daySessions.filter(
                (s) => s.session_type === 'training' && s.status === 'scheduled' && !s.is_enrolled
              ).length
            : 0

          return (
            <div
              key={idx}
              className={`min-h-[90px] border-b border-r border-line p-1.5 ${
                !currentMonth ? 'bg-slate-50/70' : ''
              } ${idx % 7 === 6 ? 'border-r-0' : ''} ${
                idx >= 35 ? 'border-b-0' : ''
              }`}
            >
              {/* Numéro du jour */}
              <div className="mb-1 flex items-center justify-between">
                {/* Indicateur formations disponibles */}
                {enrollableCount > 0 ? (
                  <span
                    className="inline-flex size-4 items-center justify-center rounded-full bg-clay/20 text-[9px] font-bold text-clay"
                    title={`${enrollableCount} formation${enrollableCount > 1 ? 's' : ''} disponible${enrollableCount > 1 ? 's' : ''}`}
                  >
                    {enrollableCount}
                  </span>
                ) : (
                  <span />
                )}
                <span
                  className={`inline-flex size-6 items-center justify-center rounded-full text-xs font-medium ${
                    isToday
                      ? 'bg-brand text-white'
                      : currentMonth
                      ? 'text-ink'
                      : 'text-slate-400'
                  }`}
                >
                  {d}
                </span>
              </div>

              {/* Sessions */}
              <div className="space-y-0.5">
                {daySessions.slice(0, 3).map((s) => (
                  <EventPill
                    key={s.id}
                    session={s}
                    isStudent={isStudent}
                    onEnroll={onEnroll}
                  />
                ))}
                {daySessions.length > 3 && (
                  <span className="block text-[10px] text-slate-400">
                    +{daySessions.length - 3} autres
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
