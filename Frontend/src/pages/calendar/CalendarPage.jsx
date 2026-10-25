import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, Plus, Video,
} from 'lucide-react'
import { fetchCalendarSessions } from '../../api/sessions'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { isCanceled, normalizeApiError } from '../../lib/api'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { Button, LinkButton } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { CalendarGrid } from '../../components/calendar/CalendarGrid'
import { CalendarLegend } from '../../components/calendar/CalendarLegend'

const MONTH_NAMES = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]

function pad(n) { return String(n).padStart(2, '0') }

function monthBounds(year, month) {
  // Premier jour du mois à 00:00:00 UTC
  const first = new Date(year, month, 1)
  const last  = new Date(year, month + 1, 0, 23, 59, 59)
  return {
    startsAfter:  `${year}-${pad(month + 1)}-01T00:00:00`,
    startsBefore: `${last.getFullYear()}-${pad(last.getMonth() + 1)}-${pad(last.getDate())}T23:59:59`,
  }
}

export default function CalendarPage() {
  useDocumentTitle('Calendrier')

  const { user } = useAuth()
  const { addToast } = useToast()

  const today = new Date()
  const [year, setYear]   = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())

  const [sessions, setSessions] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  const canCreate = user?.role === 'teacher' || user?.role === 'admin'

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)

    const bounds = monthBounds(year, month)
    fetchCalendarSessions(bounds, { signal: controller.signal })
      .then((data) => {
        setSessions(Array.isArray(data) ? data : data.results ?? [])
        setLoading(false)
      })
      .catch((err) => {
        if (isCanceled(err)) return
        setError(normalizeApiError(err))
        setLoading(false)
      })

    return () => controller.abort()
  }, [year, month])

  function prevMonth() {
    if (month === 0) { setYear((y) => y - 1); setMonth(11) }
    else setMonth((m) => m - 1)
  }

  function nextMonth() {
    if (month === 11) { setYear((y) => y + 1); setMonth(0) }
    else setMonth((m) => m + 1)
  }

  function goToday() {
    setYear(today.getFullYear())
    setMonth(today.getMonth())
  }

  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth()

  // Sessions du jour pour l'agenda latéral
  const todaySessions = sessions.filter((s) => {
    const d = new Date(s.starts_at)
    return (
      d.getFullYear() === today.getFullYear() &&
      d.getMonth()    === today.getMonth() &&
      d.getDate()     === today.getDate()
    )
  })

  // Sessions à venir ce mois-ci
  const upcomingSessions = sessions
    .filter((s) => new Date(s.starts_at) >= today)
    .slice(0, 5)

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-5 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-strong">
            <span className="h-px w-7 bg-brand" aria-hidden="true" />
            Planning
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Calendrier
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
            Visualisez toutes vos sessions en ligne et formations du mois.
          </p>
        </div>
        {canCreate && (
          <LinkButton to="/sessions/new">
            <Plus className="size-4" aria-hidden="true" />
            Nouvelle session
          </LinkButton>
        )}
      </header>

      <div className="grid gap-6 xl:grid-cols-[1fr_280px]">
        {/* Calendrier principal */}
        <div className="space-y-4">
          {/* Barre de navigation mois */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={prevMonth}
                className="rounded-lg border border-line bg-white p-2 text-slate-600 transition hover:border-slate-300 hover:bg-mist"
                aria-label="Mois précédent"
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={nextMonth}
                className="rounded-lg border border-line bg-white p-2 text-slate-600 transition hover:border-slate-300 hover:bg-mist"
                aria-label="Mois suivant"
              >
                <ChevronRight className="size-4" aria-hidden="true" />
              </button>
              <h2 className="ml-1 text-xl font-semibold text-ink">
                {MONTH_NAMES[month]} {year}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              {!isCurrentMonth && (
                <Button variant="ghost" size="sm" onClick={goToday}>
                  Aujourd'hui
                </Button>
              )}
              <CalendarLegend />
            </div>
          </div>

          {/* Erreur */}
          {error && !loading && (
            <div role="alert">
              <EmptyState
                icon={AlertTriangle}
                title="Impossible de charger le calendrier"
                description={error.message}
                action={
                  <Button variant="secondary" onClick={() => setMonth((m) => m)}>
                    Réessayer
                  </Button>
                }
              />
            </div>
          )}

          {/* Grille */}
          <div className={loading ? 'opacity-50 pointer-events-none' : ''} aria-busy={loading}>
            <CalendarGrid
              year={year}
              month={month}
              sessions={sessions}
              today={today}
            />
          </div>

          {!loading && !error && sessions.length === 0 && (
            <p className="text-center text-sm text-slate-500">
              Aucune session planifiée pour {MONTH_NAMES[month]} {year}.
            </p>
          )}
        </div>

        {/* Panneau latéral */}
        <aside className="space-y-5">
          {/* Aujourd'hui */}
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <span className="inline-flex size-8 items-center justify-center rounded-lg bg-brand/10 text-brand-strong">
                <CalendarDays className="size-4" aria-hidden="true" />
              </span>
              <h3 className="font-semibold text-ink">Aujourd'hui</h3>
            </div>
            {todaySessions.length === 0 ? (
              <p className="text-sm text-slate-500">Aucune session aujourd'hui.</p>
            ) : (
              <div className="space-y-2">
                {todaySessions.map((s) => (
                  <TodaySessionItem key={s.id} session={s} />
                ))}
              </div>
            )}
          </Card>

          {/* Prochaines sessions */}
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <span className="inline-flex size-8 items-center justify-center rounded-lg bg-sage/10 text-sage">
                <Video className="size-4" aria-hidden="true" />
              </span>
              <h3 className="font-semibold text-ink">À venir</h3>
            </div>
            {upcomingSessions.length === 0 ? (
              <p className="text-sm text-slate-500">Aucune session à venir ce mois-ci.</p>
            ) : (
              <div className="divide-y divide-line">
                {upcomingSessions.map((s) => (
                  <UpcomingSessionItem key={s.id} session={s} />
                ))}
              </div>
            )}
            {sessions.filter((s) => new Date(s.starts_at) >= today).length > 5 && (
              <div className="mt-3">
                <Link
                  to="/sessions"
                  className="text-xs font-medium text-brand-strong hover:underline"
                >
                  Voir toutes les sessions →
                </Link>
              </div>
            )}
          </Card>
        </aside>
      </div>
    </div>
  )
}

function TodaySessionItem({ session }) {
  const start = new Date(session.starts_at)
  const end   = new Date(session.ends_at)
  const fmt = (d) => `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
  const isOngoing = session.status === 'ongoing'

  return (
    <Link
      to={`/sessions/${session.id}`}
      className="flex items-start gap-3 rounded-xl p-2 transition hover:bg-mist"
    >
      <div className={`mt-0.5 h-full w-1 self-stretch rounded-full ${session.session_type === 'training' ? 'bg-clay' : 'bg-brand'}`} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{session.title}</p>
        <p className="text-xs text-slate-500">
          {fmt(start)} – {fmt(end)}
          {isOngoing && <span className="ml-2 font-semibold text-sage">● En cours</span>}
        </p>
      </div>
    </Link>
  )
}

function UpcomingSessionItem({ session }) {
  const start = new Date(session.starts_at)
  const dayFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })
  const timeFmt = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })

  return (
    <Link
      to={`/sessions/${session.id}`}
      className="flex items-center gap-3 py-2.5 transition hover:opacity-80"
    >
      <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl bg-mist text-center">
        <span className="text-[10px] font-semibold uppercase text-slate-500">
          {dayFmt.format(start).split(' ')[1]}
        </span>
        <span className="text-sm font-bold text-ink leading-none">
          {start.getDate()}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{session.title}</p>
        <p className="text-xs text-slate-500">{timeFmt.format(start)}</p>
      </div>
      <span
        className={`size-2 shrink-0 rounded-full ${session.session_type === 'training' ? 'bg-clay' : 'bg-brand'}`}
        aria-hidden="true"
      />
    </Link>
  )
}
