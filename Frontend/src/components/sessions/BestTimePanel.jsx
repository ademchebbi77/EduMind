import { CalendarClock, Sparkles } from 'lucide-react'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'

const CONFIDENCE_VARIANTS = {
  high: 'sage',
  medium: 'warning',
  low: 'neutral',
}

export function BestTimePanel({ slots = [], loading = false, onSelect, disabled = false }) {
  if (!loading && slots.length === 0) return null

  return (
    <Card className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand-strong ring-1 ring-inset ring-brand/15">
          <CalendarClock className="size-4" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-xl font-semibold text-ink">Créneaux suggérés</h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">
            Jours et heures qui ont le mieux rempli vos sessions passées.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2" aria-hidden="true">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="h-14 animate-pulse rounded-lg bg-mist/60" />
          ))}
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {slots.map((slot) => (
            <li
              key={`${slot.weekday}-${slot.hour}`}
              className="flex items-center justify-between gap-3 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">
                  {slot.weekday_label} à {String(slot.hour).padStart(2, '0')}:00
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {slot.average_enrollments} inscrit(s) en moyenne ·{' '}
                  {slot.session_count} session(s)
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span title={`Score ${slot.score}/100`}>
                  <Badge variant={CONFIDENCE_VARIANTS[slot.confidence] || 'neutral'}>
                    {slot.confidence_label}
                  </Badge>
                </span>
                {onSelect && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={disabled}
                    onClick={() => onSelect(slot)}
                  >
                    <Sparkles className="size-3.5" aria-hidden="true" />
                    Utiliser
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-slate-500">
        Calcul local basé sur les inscriptions confirmées de l'historique.
      </p>
    </Card>
  )
}
