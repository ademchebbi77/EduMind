import { Link } from 'react-router-dom'
import { CalendarDays, TrendingUp, Users } from 'lucide-react'
import { Badge } from '../ui/Badge'
import { Card } from '../ui/Card'
import { formatDateTime } from '../../lib/format'

const CONFIDENCE_VARIANTS = {
  high: 'sage',
  medium: 'warning',
  low: 'neutral',
}

export function ForecastPanel({ items = [], loading = false }) {
  if (!loading && items.length === 0) return null

  return (
    <section aria-labelledby="forecast-heading" className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-sage/10 text-sage ring-1 ring-inset ring-sage/15">
          <TrendingUp className="size-4" aria-hidden="true" />
        </span>
        <div>
          <h2
            id="forecast-heading"
            className="font-display text-xl font-semibold tracking-tight text-ink"
          >
            Prévision de remplissage
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">
            Estimation calculée localement à partir de vos sessions passées comparables.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
          {Array.from({ length: 3 }, (_, index) => (
            <Card key={index} className="h-32 animate-pulse bg-mist/60" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map(({ session, forecast }) => (
            <Card key={session.id} className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold leading-snug text-ink">
                  <Link
                    to={`/sessions/${session.id}`}
                    className="rounded underline-offset-4 hover:text-brand-strong hover:underline"
                  >
                    {session.title}
                  </Link>
                </h3>
                <Badge variant={CONFIDENCE_VARIANTS[forecast.confidence] || 'neutral'}>
                  {forecast.confidence_label}
                </Badge>
              </div>

              <p className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                <CalendarDays className="size-3.5" aria-hidden="true" />
                {formatDateTime(session.starts_at)}
              </p>

              <div>
                <p className="flex items-baseline gap-1.5">
                  <span className="font-display text-2xl font-semibold text-ink">
                    ≈ {forecast.expected_enrollments}
                  </span>
                  <span className="text-xs text-slate-500">inscrit(s) attendus</span>
                </p>
                <div
                  className="mt-2 h-1.5 overflow-hidden rounded-full bg-mist"
                  role="img"
                  aria-label={`${forecast.expected_enrollments} inscrits attendus, fourchette haute ${forecast.maximum}`}
                >
                  <span
                    className="block h-full rounded-full bg-sage"
                    style={{
                      width: `${forecast.maximum > 0
                        ? Math.min(100, Math.round((forecast.expected_enrollments / forecast.maximum) * 100))
                        : 0}%`,
                    }}
                  />
                </div>
              </div>

              <p className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                <Users className="size-3.5" aria-hidden="true" />
                {forecast.current_enrollments} déjà inscrit(s) · fourchette{' '}
                {forecast.minimum}–{forecast.maximum}
              </p>
            </Card>
          ))}
        </div>
      )}
    </section>
  )
}
