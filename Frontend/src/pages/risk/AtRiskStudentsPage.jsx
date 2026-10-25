import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, RotateCcw, ShieldAlert, Users } from 'lucide-react'
import { fetchAtRiskStudents } from '../../api/users'
import { isCanceled, normalizeApiError } from '../../lib/api'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Select } from '../../components/ui/Field'
import { CardSkeleton } from '../../components/ui/Skeleton'

const LEVELS = {
  high:   { label: 'Élevé', variant: 'clay' },
  medium: { label: 'Moyen', variant: 'warning' },
  low:    { label: 'Faible', variant: 'sage' },
}

const EMPTY = { count: 0, summary: { high: 0, medium: 0, low: 0 }, results: [] }

export default function AtRiskStudentsPage() {
  useDocumentTitle('Étudiants à risque')

  const [level, setLevel]     = useState('')
  const [reload, setReload]   = useState(0)
  const [loading, setLoading] = useState(true)
  const [data, setData]       = useState(EMPTY)
  const [error, setError]     = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    fetchAtRiskStudents({ level }, { signal: controller.signal })
      .then((payload) => {
        setData(payload)
        setLoading(false)
      })
      .catch((err) => {
        if (isCanceled(err)) return
        setError(normalizeApiError(err))
        setData(EMPTY)
        setLoading(false)
      })
    return () => controller.abort()
  }, [level, reload])

  const summary = data.summary || EMPTY.summary
  const results = data.results || []

  return (
    <div className="space-y-6">
      <header className="border-b border-line pb-6">
        <p className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-strong">
          <span className="h-px w-7 bg-brand" aria-hidden="true" />
          Pilotage pédagogique
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          Étudiants à risque
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          Score calculé localement à partir des résultats aux quiz, de l'activité récente
          et des exercices en retard. Chaque signal est affiché pour rester explicable.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        {Object.entries(LEVELS).map(([key, meta]) => (
          <Card key={key} className="text-center py-4">
            <p className="text-2xl font-bold text-ink">{summary[key] ?? 0}</p>
            <p className="mt-1 text-xs text-slate-500">Risque {meta.label.toLowerCase()}</p>
          </Card>
        ))}
      </div>

      <Card className="bg-paper/90">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="w-full max-w-xs">
            <Select
              label="Niveau de risque"
              name="level"
              value={level}
              onChange={(event) => {
                setLoading(true)
                setError(null)
                setLevel(event.target.value)
              }}
            >
              <option value="">Tous les niveaux</option>
              <option value="high">Élevé</option>
              <option value="medium">Moyen</option>
              <option value="low">Faible</option>
            </Select>
          </div>
          {level && (
            <Button variant="ghost" size="sm" onClick={() => setLevel('')}>
              <RotateCcw className="size-4" aria-hidden="true" />
              Réinitialiser
            </Button>
          )}
        </div>
      </Card>

      {error && !loading && (
        <div role="alert">
          <EmptyState
            icon={AlertTriangle}
            title="Impossible de calculer les risques"
            description={error.message}
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setLoading(true)
                  setError(null)
                  setReload((count) => count + 1)
                }}
              >
                Réessayer
              </Button>
            }
          />
        </div>
      )}

      {loading && (
        <div className="space-y-3" aria-hidden="true">
          {Array.from({ length: 3 }, (_, index) => <CardSkeleton key={index} />)}
        </div>
      )}

      {!loading && !error && results.length === 0 && (
        <EmptyState
          icon={level ? CheckCircle2 : Users}
          title={level ? 'Aucun étudiant à ce niveau' : 'Aucun étudiant à analyser'}
          description={
            level
              ? 'Essayez un autre niveau de risque.'
              : 'Les étudiants apparaîtront ici dès que des quiz ou des exercices seront disponibles.'
          }
          action={
            level ? (
              <Button variant="secondary" onClick={() => setLevel('')}>Voir tous les niveaux</Button>
            ) : undefined
          }
        />
      )}

      {!loading && !error && results.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-mist/50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3">Étudiant</th>
                  <th className="px-4 py-3">Risque</th>
                  <th className="px-4 py-3">Signaux</th>
                  <th className="px-4 py-3">Indicateurs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {results.map((student) => {
                  const meta = LEVELS[student.level] || LEVELS.low
                  return (
                    <tr key={student.student_id} className="align-top hover:bg-mist/30">
                      <td className="px-4 py-3">
                        <p className="font-medium text-ink">{student.full_name}</p>
                        <p className="text-xs text-slate-500">{student.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Badge variant={meta.variant}>{meta.label}</Badge>
                          <span className="font-display text-lg font-semibold text-ink">
                            {student.score}
                          </span>
                          <span className="text-xs text-slate-400">/100</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {student.reasons.length > 0 ? (
                          <ul className="space-y-1 text-xs text-slate-600">
                            {student.reasons.map((reason) => (
                              <li key={reason} className="flex items-start gap-1.5">
                                <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-clay" aria-hidden="true" />
                                {reason}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-xs text-slate-400">Aucun signal</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <dl className="space-y-1 text-xs text-slate-600">
                          <div className="flex justify-between gap-4">
                            <dt className="text-slate-500">Moyenne quiz</dt>
                            <dd className="font-medium">
                              {student.quiz_average == null ? '—' : `${student.quiz_average} %`}
                            </dd>
                          </div>
                          <div className="flex justify-between gap-4">
                            <dt className="text-slate-500">Inactivité</dt>
                            <dd className="font-medium">
                              {student.days_inactive == null ? '—' : `${student.days_inactive} j`}
                            </dd>
                          </div>
                          <div className="flex justify-between gap-4">
                            <dt className="text-slate-500">Exercices en retard</dt>
                            <dd className="font-medium">{student.overdue_exercises}</dd>
                          </div>
                        </dl>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
