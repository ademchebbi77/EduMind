import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle, CalendarDays, ChevronLeft, ChevronRight,
  Plus, Users, Video,
} from 'lucide-react'
import { fetchCalendarSessions, enrollInSession } from '../../api/sessions'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { isCanceled, normalizeApiError } from '../../lib/api'
import { formatDateTime } from '../../lib/format'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { Badge } from '../../components/ui/Badge'
import { Button, LinkButton } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Modal } from '../../components/ui/Modal'
import { CalendarGrid } from '../../components/calendar/CalendarGrid'
import { CalendarLegend } from '../../components/calendar/CalendarLegend'

const MONTH_NAMES = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]

function pad(n) { return String(n).padStart(2, '0') }

function monthBounds(year, month) {
  const last = new Date(year, month + 1, 0)
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

  const [sessions, setSessions]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [reload, setReload]       = useState(0)

  // Modal d'inscription
  const [enrollTarget, setEnrollTarget]   = useState(null)  // session sélectionnée
  const [enrollMessage, setEnrollMessage] = useState('')
  const [enrolling, setEnrolling]         = useState(false)

  const isStudent = user?.role === 'student'
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
  }, [year, month, reload])

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

  async function handleEnroll() {
    if (!enrollTarget) return
    setEnrolling(true)
    try {
      await enrollInSession(enrollTarget.id, enrollMessage)
      addToast({ type: 'success', message: `Inscription envoyée pour "${enrollTarget.title}". En attente de confirmation.` })
      setEnrollTarget(null)
      setEnrollMessage('')
      setReload((c) => c + 1)
    } catch (err) {
      addToast({ type: 'error', message: normalizeApiError(err, 'Inscription échouée.').message })
    } finally {
      setEnrolling(false)
    }
  }

  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth()

  const todaySessions = sessions.filter((s) => {
    const d = new Date(s.starts_at)
    return (
      d.getFullYear() === today.getFullYear() &&
      d.getMonth()    === today.getMonth() &&
      d.getDate()     === today.getDate()
    )
  })

  const upcomingSessions = sessions
    .filter((s) => new Date(s.starts_at) >= today)
    .slice(0, 6)

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

      <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
        {/* Calendrier principal */}
        <div className="space-y-4">
          {/* Navigation mois */}
          <div className="flex flex-wrap items-center justify-between gap-3">
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
            <div className="flex flex-wrap items-center gap-3">
              {!isCurrentMonth && (
                <Button variant="ghost" size="sm" onClick={goToday}>
                  Aujourd'hui
                </Button>
              )}
              <CalendarLegend />
            </div>
          </div>

          {error && !loading && (
            <div role="alert">
              <EmptyState
                icon={AlertTriangle}
                title="Impossible de charger le calendrier"
                description={error.message}
                action={<Button variant="secondary" onClick={() => setReload((c) => c + 1)}>Réessayer</Button>}
              />
            </div>
          )}

          <div className={loading ? 'opacity-50 pointer-events-none' : ''} aria-busy={loading}>
            <CalendarGrid
              year={year}
              month={month}
              sessions={sessions}
              today={today}
              isStudent={isStudent}
              onEnroll={setEnrollTarget}
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
            <div className="mb-4 flex items-center gap-2">
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
                  <TodaySessionItem
                    key={s.id}
                    session={s}
                    isStudent={isStudent}
                    onEnroll={setEnrollTarget}
                  />
                ))}
              </div>
            )}
          </Card>

          {/* Formations à venir — inscriptions */}
          {isStudent && (
            <Card className="border-clay/20 bg-clay/[0.03]">
              <div className="mb-4 flex items-center gap-2">
                <span className="inline-flex size-8 items-center justify-center rounded-lg bg-clay/10 text-clay">
                  <Users className="size-4" aria-hidden="true" />
                </span>
                <h3 className="font-semibold text-ink">Formations disponibles</h3>
              </div>
              {(() => {
                const trainings = upcomingSessions.filter(
                  (s) => s.session_type === 'training' && s.status === 'scheduled' && !s.is_enrolled
                )
                if (trainings.length === 0) {
                  return <p className="text-sm text-slate-500">Aucune formation disponible ce mois-ci.</p>
                }
                return (
                  <div className="space-y-2">
                    {trainings.map((s) => (
                      <TrainingEnrollItem
                        key={s.id}
                        session={s}
                        onEnroll={setEnrollTarget}
                      />
                    ))}
                  </div>
                )
              })()}
            </Card>
          )}

          {/* Prochaines sessions */}
          <Card>
            <div className="mb-4 flex items-center gap-2">
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
                  <UpcomingSessionItem
                    key={s.id}
                    session={s}
                    isStudent={isStudent}
                    onEnroll={setEnrollTarget}
                  />
                ))}
              </div>
            )}
            {sessions.filter((s) => new Date(s.starts_at) >= today).length > 6 && (
              <div className="mt-3">
                <Link to="/sessions" className="text-xs font-medium text-brand-strong hover:underline">
                  Voir toutes les sessions →
                </Link>
              </div>
            )}
          </Card>
        </aside>
      </div>

      {/* Modal d'inscription */}
      <Modal
        open={!!enrollTarget}
        onClose={() => { setEnrollTarget(null); setEnrollMessage('') }}
        title="S'inscrire à la formation"
        description={enrollTarget ? `Vous allez envoyer une demande d'inscription pour "${enrollTarget.title}" — ${formatDateTime(enrollTarget.starts_at)}.` : ''}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => { setEnrollTarget(null); setEnrollMessage('') }}
              disabled={enrolling}
            >
              Annuler
            </Button>
            <Button onClick={handleEnroll} disabled={enrolling}>
              {enrolling ? 'Envoi…' : 'Envoyer ma demande'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <label htmlFor="enroll-msg" className="block text-sm font-medium text-ink">
            Message (optionnel)
          </label>
          <textarea
            id="enroll-msg"
            rows={3}
            value={enrollMessage}
            onChange={(e) => setEnrollMessage(e.target.value)}
            placeholder="Présentez-vous brièvement ou posez une question…"
            className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            disabled={enrolling}
          />
        </div>
      </Modal>
    </div>
  )
}

/* ── Composants internes ── */

function TodaySessionItem({ session, isStudent, onEnroll }) {
  const start    = new Date(session.starts_at)
  const end      = new Date(session.ends_at)
  const fmt      = (d) => `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
  const isTraining = session.session_type === 'training'
  const canEnroll  = isStudent && isTraining && session.status === 'scheduled' && !session.is_enrolled

  return (
    <div className="flex items-start gap-2 rounded-xl p-2 transition hover:bg-mist">
      <div className={`mt-1.5 h-8 w-1 shrink-0 rounded-full ${isTraining ? 'bg-clay' : 'bg-brand'}`} />
      <div className="min-w-0 flex-1">
        <Link to={`/sessions/${session.id}`} className="block truncate text-sm font-medium text-ink hover:text-brand-strong">
          {session.title}
        </Link>
        <p className="text-xs text-slate-500">
          {fmt(start)} – {fmt(end)}
          {session.status === 'ongoing' && (
            <span className="ml-2 font-semibold text-sage">● En cours</span>
          )}
        </p>
        {isTraining && (
          <Badge variant="clay" className="mt-1 text-[10px]">Formation</Badge>
        )}
      </div>
      {canEnroll && (
        <button
          type="button"
          onClick={() => onEnroll(session)}
          className="shrink-0 rounded-lg bg-clay/10 px-2 py-1 text-[11px] font-semibold text-clay transition hover:bg-clay/20"
        >
          S'inscrire
        </button>
      )}
      {isStudent && isTraining && session.is_enrolled && (
        <span className="shrink-0 rounded-lg bg-sage/10 px-2 py-1 text-[11px] font-semibold text-sage">
          Inscrit ✓
        </span>
      )}
    </div>
  )
}

function TrainingEnrollItem({ session, onEnroll }) {
  const start = new Date(session.starts_at)
  const timeFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-clay/20 bg-white p-3">
      <div className="min-w-0 flex-1">
        <Link
          to={`/sessions/${session.id}`}
          className="block truncate text-sm font-medium text-ink hover:text-brand-strong"
        >
          {session.title}
        </Link>
        <p className="mt-0.5 text-xs text-slate-500">{timeFmt.format(start)}</p>
        <p className="mt-0.5 text-xs text-slate-400">
          {session.enrollment_count} inscrit{session.enrollment_count > 1 ? 's' : ''}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onEnroll(session)}
        className="shrink-0 rounded-lg bg-clay px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
      >
        S'inscrire
      </button>
    </div>
  )
}

function UpcomingSessionItem({ session, isStudent, onEnroll }) {
  const start      = new Date(session.starts_at)
  const dayFmt     = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })
  const timeFmt    = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })
  const isTraining = session.session_type === 'training'
  const canEnroll  = isStudent && isTraining && session.status === 'scheduled' && !session.is_enrolled

  return (
    <div className="flex items-center gap-3 py-2.5">
      {/* Mini date */}
      <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl bg-mist text-center">
        <span className="text-[10px] font-semibold uppercase text-slate-500">
          {dayFmt.format(start).split(' ')[1]}
        </span>
        <span className="text-sm font-bold text-ink leading-none">
          {start.getDate()}
        </span>
      </div>

      {/* Infos */}
      <div className="min-w-0 flex-1">
        <Link
          to={`/sessions/${session.id}`}
          className="block truncate text-sm font-medium text-ink hover:text-brand-strong"
        >
          {session.title}
        </Link>
        <p className="text-xs text-slate-500">{timeFmt.format(start)}</p>
      </div>

      {/* Badge type + bouton inscription */}
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span
          className={`size-2 rounded-full ${isTraining ? 'bg-clay' : 'bg-brand'}`}
          aria-hidden="true"
        />
        {canEnroll && (
          <button
            type="button"
            onClick={() => onEnroll(session)}
            className="rounded-lg bg-clay/10 px-2 py-0.5 text-[11px] font-semibold text-clay transition hover:bg-clay/20"
          >
            S'inscrire
          </button>
        )}
        {isStudent && isTraining && session.is_enrolled && (
          <span className="text-[11px] font-semibold text-sage">Inscrit ✓</span>
        )}
      </div>
    </div>
  )
}
