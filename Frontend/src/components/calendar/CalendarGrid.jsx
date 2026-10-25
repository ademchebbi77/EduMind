import { Link } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'

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
  // Convertit une date ISO en objet Date local
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
  // month est 0-indexé (0=jan, 11=dec)
  const firstDay = new Date(year, month, 1)
  const lastDay  = new Date(year, month + 1, 0)

  // Lundi = 0 en Europe
  let startDow = firstDay.getDay() - 1
  if (startDow < 0) startDow = 6

  const days = []

  // Jours du mois précédent
  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(year, month, -i)
    days.push({ date: d, currentMonth: false })
  }

  // Jours du mois courant
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push({ date: new Date(year, month, d), currentMonth: true })
  }

  // Compléter jusqu'à 6 semaines (42 cases)
  while (days.length < 42) {
    const last = days[days.length - 1].date
    const next = new Date(last)
    next.setDate(next.getDate() + 1)
    days.push({ date: next, currentMonth: false })
  }

  return days
}

function EventPill({ session }) {
  const start = toLocalDate(session.starts_at)
  const timeStr = `${pad(start.getHours())}:${pad(start.getMinutes())}`

  return (
    <Link
      to={`/sessions/${session.id}`}
      className={`mb-0.5 flex min-w-0 items-center gap-1 truncate rounded px-1 py-0.5 text-[11px] font-medium leading-snug transition hover:opacity-80 ${TYPE_STYLES[session.session_type] || 'bg-slate-100 text-slate-700'}`}
      title={`${session.title} — ${timeStr}`}
    >
      <span
        className={`size-1.5 shrink-0 rounded-full ${STATUS_DOT[session.status] || 'bg-slate-300'}`}
        aria-hidden="true"
      />
      <span className="truncate">{timeStr} {session.title}</span>
      {session.meeting_link && session.status === 'ongoing' && (
        <ExternalLink className="ml-auto size-2.5 shrink-0" aria-hidden="true" />
      )}
    </Link>
  )
}

export function CalendarGrid({ year, month, sessions, today }) {
  const days = buildCalendarDays(year, month)

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
      {/* En-têtes des jours */}
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

      {/* Grille des jours */}
      <div className="grid grid-cols-7">
        {days.map(({ date, currentMonth }, idx) => {
          const y = date.getFullYear()
          const m = date.getMonth()
          const d = date.getDate()
          const isToday = sameDay(date, today.getFullYear(), today.getMonth(), today.getDate())

          const daySessions = sessions.filter((s) =>
            sameDay(toLocalDate(s.starts_at), y, m, d)
          )

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
              <div className="mb-1 flex justify-end">
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

              {/* Sessions du jour */}
              <div className="space-y-0.5">
                {daySessions.slice(0, 3).map((s) => (
                  <EventPill key={s.id} session={s} />
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
